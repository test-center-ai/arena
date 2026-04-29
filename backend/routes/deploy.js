import { Router } from 'express';
import db from '../db.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const VIRSH_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|[01]?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;

router.get('/script', (_req, res) => {
  const scriptPath = path.join(__dirname, '..', '..', 'relay_agent.py');
  res.download(scriptPath);
});

router.get('/autodetect', async (_req, res) => {
  try {
    let hostIp = '';
    let netInterface = '';
    let vms = [];
    let leases = [];

    try {
      const { stdout } = await execFileAsync('sh', ['-c', "ip route get 1 | awk '{print $7}'"]);
      hostIp = stdout.trim();
    } catch {}

    try {
      const { stdout } = await execFileAsync('sh', ['-c', "ip link show | grep -E 'virbr0|virbr-' | awk '{print $2}' | tr -d ':' | head -1"]);
      netInterface = stdout.trim();
    } catch {}

    try {
      const { stdout } = await execFileAsync('virsh', ['list', '--all', '--name']);
      vms = stdout.split('\n').map(s => s.trim()).filter(Boolean);
    } catch {}

    try {
      const { stdout } = await execFileAsync('virsh', ['net-dhcp-leases', 'default']);
      const lines = stdout.split('\n').slice(2).filter(Boolean);
      leases = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          mac: parts[2],
          ip: parts[4] ? parts[4].split('/')[0] : null,
          hostname: parts[5]
        };
      }).filter(l => l.ip);
    } catch {}

    res.json({ success: true, hostIp, netInterface, vms, leases });
  } catch (error) {
    console.error('Autodetect error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/deploy-agent', async (req, res) => {
  const vmId = req.params.id;
  const vm = db.queryOne('SELECT * FROM vms WHERE id=?', [vmId]);
  if (!vm) return res.status(404).json({ error: 'VM not found' });

  const settings = db.queryOne('SELECT * FROM settings WHERE id=1');
  const hostIp = settings?.host_ip;
  if (!hostIp) return res.status(400).json({ error: 'Host IP must be configured in Settings first' });
  if (!IPV4_RE.test(hostIp)) return res.status(400).json({ error: 'Settings host_ip is not a valid IPv4 address' });
  if (!vm.virsh_name || !VIRSH_NAME_RE.test(vm.virsh_name)) {
    return res.status(400).json({ error: 'VM virsh_name is invalid or missing' });
  }

  try {
    if (vm.role === 'attacker') {
      let agentOk = false;
      try {
        await execFileAsync('virsh', ['qemu-agent-command', vm.virsh_name, JSON.stringify({ execute: 'guest-ping' })]);
        agentOk = true;
      } catch {}

      if (agentOk) {
        const cmd = `curl -s http://${hostIp}:9020/api/deploy/script -o /tmp/relay_agent.py && python3 /tmp/relay_agent.py --vm-id ${vm.id} --role ${vm.role} --dashboard http://${hostIp}:9020 > /tmp/relay.log 2>&1 &`;
        const guestCmd = JSON.stringify({
          execute: 'guest-exec',
          arguments: { path: 'bash', arg: ['-c', cmd] }
        });
        await execFileAsync('virsh', ['qemu-agent-command', vm.virsh_name, guestCmd]);
        return res.json({ success: true, message: 'Agent deployed via QEMU Guest Agent' });
      }

      // Fallback to SSH
      if (!vm.ip || !IPV4_RE.test(vm.ip)) {
        return res.status(400).json({ error: 'VM IP not set/valid and Guest Agent unreachable.' });
      }

      const conn = new Client();
      await new Promise((resolve, reject) => {
        conn.on('ready', () => {
          conn.sftp((err, sftp) => {
            if (err) return reject(err);
            const scriptPath = path.join(__dirname, '..', '..', 'relay_agent.py');
            sftp.fastPut(scriptPath, '/home/kali/relay_agent.py', (err) => {
              if (err) return reject(err);
              const cmd = `pip3 install requests --break-system-packages && tmux kill-session -t relay_agent 2>/dev/null || true && tmux new-session -d -s relay_agent "python3 /home/kali/relay_agent.py --vm-id ${vm.id} --role ${vm.role} --dashboard http://${hostIp}:9020"`;
              conn.exec(cmd, (err, stream) => {
                if (err) return reject(err);
                stream.on('close', () => { conn.end(); resolve(); })
                  .on('data', (data) => console.log('SSH OUT:', data.toString()))
                  .stderr.on('data', (data) => console.log('SSH ERR:', data.toString()));
              });
            });
          });
        }).on('error', reject).connect({
          host: vm.ip, port: 22, username: 'kali', password: 'kali', readyTimeout: 10000
        });
      });

      res.json({ success: true, message: 'Agent deployed via SSH and started in tmux' });

    } else if (vm.role === 'defender') {
      try {
        await execFileAsync('virsh', ['qemu-agent-command', vm.virsh_name, JSON.stringify({ execute: 'guest-ping' })]);
      } catch {
        return res.status(400).json({ error: 'QEMU Guest Agent not responding inside Windows. Is it running?' });
      }

      // Hardened PowerShell:
      //  - Download to %TEMP% (no admin needed)
      //  - Kill only the previously tracked relay PID (not all python processes)
      //  - Resolve python3 then python; fail fast if neither exists
      //  - Capture stdout/stderr for post-mortem
      //  - Record PID for later restart
      const psCommand = [
        `$tmp = $env:TEMP + '\\\\relay_agent.py'`,
        `Invoke-WebRequest -Uri http://${hostIp}:9020/api/deploy/script -OutFile $tmp -UseBasicParsing`,
        `$pidFile = $env:TEMP + '\\\\arena_relay.pid'`,
        `if (Test-Path $pidFile) { try { Stop-Process -Id (Get-Content $pidFile) -Force -ErrorAction SilentlyContinue } catch {} }`,
        `$py = (Get-Command python3 -ErrorAction SilentlyContinue).Source`,
        `if (-not $py) { $py = (Get-Command python -ErrorAction SilentlyContinue).Source }`,
        `if (-not $py) { Write-Error 'Python not installed'; exit 1 }`,
        `$out = $env:TEMP + '\\\\relay_stdout.txt'`,
        `$err = $env:TEMP + '\\\\relay_stderr.txt'`,
        `$p = Start-Process $py -ArgumentList $tmp,'--vm-id','${vm.id}','--role','${vm.role}','--dashboard','http://${hostIp}:9020' -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru`,
        `$p.Id | Out-File $pidFile`,
      ].join('; ');

      const guestCmd = JSON.stringify({
        execute: 'guest-exec',
        arguments: {
          path: 'powershell',
          arg: ['-WindowStyle', 'Hidden', '-Command', psCommand]
        }
      });

      await execFileAsync('virsh', ['qemu-agent-command', vm.virsh_name, guestCmd]);
      res.json({ success: true, message: 'Agent deployment command sent via QEMU Guest Agent' });

    } else {
      res.status(400).json({ error: 'Unknown role' });
    }
  } catch (error) {
    console.error('Deploy error:', error);
    res.status(500).json({ error: error.message || 'Deployment failed' });
  }
});

export default router;
