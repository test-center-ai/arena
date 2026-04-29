import { Router } from 'express';
import db from '../db.js';
import http from 'node:http';
import { logActivity } from '../services/roundManager.js';
import { resolveVMIPs } from '../services/vmResolver.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// ── Ping relay agent inside a VM ─────────────────────────────────────────────
function pingRelay(ip, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!ip) return resolve({ ok: false, reason: 'No IP configured' });
    const req = http.request(
      { hostname: ip, port: 9030, path: '/status', method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try { resolve({ ok: true, data: JSON.parse(body) }); }
          catch { resolve({ ok: true, data: {} }); }
        });
      }
    );
    req.on('error', e => resolve({ ok: false, reason: e.message }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, reason: 'Timeout — VM unreachable or relay not running' }); });
    req.end();
  });
}

// ── Check if a CLI tool exists ────────────────────────────────────────────────
async function toolExists(cmd) {
  try { await execAsync(`which ${cmd}`); return true; }
  catch { return false; }
}

// ── Run all preflight checks ──────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  const settings = db.queryOne('SELECT * FROM settings WHERE id=1') || {};

  // ── Auto-resolve VM IPs from DHCP leases ──
  let ipChanges = [];
  try {
    const { changes } = await resolveVMIPs({ silent: true });
    ipChanges = changes;
  } catch (e) {
    console.error('[preflight] IP resolution failed:', e.message);
  }

  const vms = db.queryAll('SELECT * FROM vms');
  const vmA = vms.find(v => v.role === 'defender');
  const vmB = vms.find(v => v.role === 'attacker');
  const activeRound = db.queryOne("SELECT id FROM rounds WHERE status='running' LIMIT 1");

  const checks = [];

  // 1 — VM A IP resolved
  const ipChangeA = ipChanges.find(c => c.id === vmA?.id);
  checks.push({
    id: 'vm_a_ip', label: 'VM A (Defender) IP Address configured',
    status: vmA?.ip ? 'pass' : 'fail',
    detail: vmA?.ip
      ? `Set to ${vmA.ip}${ipChangeA ? ` (auto-updated from ${ipChangeA.oldIp || 'none'})` : ' (confirmed via DHCP)'}`
      : 'No IP address set — start the VM so DHCP can assign one',
    fix: ipChangeA ? null : 'Start the VM and run preflight again — IP will be auto-detected from DHCP leases',
    fixLink: '/vms',
  });

  // 2 — VM B IP resolved
  const ipChangeB = ipChanges.find(c => c.id === vmB?.id);
  checks.push({
    id: 'vm_b_ip', label: 'VM B (Attacker) IP Address configured',
    status: vmB?.ip ? 'pass' : 'fail',
    detail: vmB?.ip
      ? `Set to ${vmB.ip}${ipChangeB ? ` (auto-updated from ${ipChangeB.oldIp || 'none'})` : ' (confirmed via DHCP)'}`
      : 'No IP address set — start the VM so DHCP can assign one',
    fix: ipChangeB ? null : 'Start the VM and run preflight again — IP will be auto-detected from DHCP leases',
    fixLink: '/vms',
  });

  // 3 — VM A relay agent reachable
  const relayA = await pingRelay(vmA?.ip);
  checks.push({
    id: 'relay_a', label: 'VM A Relay Agent reachable (port 9030)', vmId: vmA?.id,
    status: !vmA?.ip ? 'skip' : relayA.ok ? 'pass' : 'fail',
    detail: !vmA?.ip ? 'Skipped — set IP first' : relayA.ok ? `Connected — role: ${relayA.data?.role}` : relayA.reason,
    fix: `Inside VM A (Windows 11):
1. Copy relay_agent.py from your Ubuntu host to the VM
2. Install Python if needed: https://python.org
3. Run: python relay_agent.py --vm-id vm-a --role defender --dashboard http://HOST_IP:9020
   (replace HOST_IP with your Ubuntu machine's IP on your local network)
4. Leave that terminal open — it must stay running during the round`,
  });

  // 4 — VM B relay agent reachable
  const relayB = await pingRelay(vmB?.ip);
  checks.push({
    id: 'relay_b', label: 'VM B Relay Agent reachable (port 9030)', vmId: vmB?.id,
    status: !vmB?.ip ? 'skip' : relayB.ok ? 'pass' : 'fail',
    detail: !vmB?.ip ? 'Skipped — set IP first' : relayB.ok ? `Connected — role: ${relayB.data?.role}` : relayB.reason,
    fix: `Inside VM B (Kali Linux):
1. Copy relay_agent.py to the VM (scp or shared folder)
2. Run: pip install requests
3. Run: python3 relay_agent.py --vm-id vm-b --role attacker --dashboard http://HOST_IP:9020
4. Leave that terminal open`,
  });

  // 5 — Model names set
  checks.push({
    id: 'models', label: 'Model names configured for both VMs',
    status: (vmA?.model_name && vmA.model_name !== 'Unknown') && (vmB?.model_name && vmB.model_name !== 'Unknown') ? 'pass' : 'warn',
    detail: `Defender: ${vmA?.model_name || 'not set'} | Attacker: ${vmB?.model_name || 'not set'}`,
    fix: 'Go to VM Manager → Edit each VM → set Active Model to match what you configured in OpenClaw inside that VM. This is just a label for record-keeping.',
    fixLink: '/vms',
  });

  // 6 — Virsh/VM name set
  const hypervisor = settings.hypervisor || 'kvm';
  checks.push({
    id: 'vm_names', label: 'VM domain names configured (for VM control)',
    status: (vmA?.virsh_name && vmB?.virsh_name) ? 'pass' : 'warn',
    detail: `VM A: "${vmA?.virsh_name || 'not set'}" | VM B: "${vmB?.virsh_name || 'not set'}"`,
    fix: hypervisor === 'virtualbox'
      ? 'Run: VBoxManage list vms — copy the exact name in quotes. Paste into VM Manager → Edit → Virsh Domain Name field.'
      : hypervisor === 'vmware'
      ? 'Find the .vmx file path for each VM. Paste the full path into VM Manager → Edit → Virsh Domain Name field.'
      : 'Run: virsh list --all — copy the exact domain name. Paste into VM Manager → Edit → Virsh Domain Name field.',
    fixLink: '/vms',
  });

  // 7 — Hypervisor selected
  checks.push({
    id: 'hypervisor', label: 'Hypervisor type selected',
    status: settings.hypervisor ? 'pass' : 'warn',
    detail: settings.hypervisor ? `Using: ${settings.hypervisor}` : 'Not selected — VM control buttons may not work',
    fix: 'Go to Settings (below) and select your hypervisor: KVM, VirtualBox, or VMware.',
  });

  // 8 — Recording tool available
  const ffmpegOk = await toolExists('ffmpeg');
  const tcpdumpOk = await toolExists('tcpdump');
  checks.push({
    id: 'recording_tools', label: 'Recording tools available (ffmpeg + tcpdump)',
    status: ffmpegOk && tcpdumpOk ? 'pass' : 'warn',
    detail: `ffmpeg: ${ffmpegOk ? '✓' : '✗ not found'}  |  tcpdump: ${tcpdumpOk ? '✓' : '✗ not found'}`,
    fix: 'Run: sudo apt install ffmpeg tcpdump -y',
  });

  // 9 — Recordings directory writable
  const recDir = path.join(__dirname, '..', 'data', 'recordings');
  let recDirOk = false;
  try { fs.mkdirSync(recDir, { recursive: true }); recDirOk = true; } catch {}
  checks.push({
    id: 'rec_dir', label: 'Recordings directory writable',
    status: recDirOk ? 'pass' : 'fail',
    detail: recDirOk ? `Saving to: ${recDir}` : `Cannot write to ${recDir}`,
    fix: `Run: mkdir -p ${recDir} && chmod 777 ${recDir}`,
  });

  // 10 — No active round already running
  checks.push({
    id: 'no_active_round', label: 'No round currently active',
    status: activeRound ? 'warn' : 'pass',
    detail: activeRound ? `Round ${activeRound.id?.slice(0,8).toUpperCase()} is already running` : 'Clear to start',
    fix: 'Go to Live Arena → Force end the active round before starting a new one.',
    fixLink: '/',
  });

  const criticalFails = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const ready = criticalFails === 0;

  res.json({ checks, ready, criticalFails, warnings, hypervisor: settings.hypervisor || null, ipChanges });
});

export default router;
