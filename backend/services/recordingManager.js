/**
 * Recording Manager — supports KVM, VirtualBox, VMware
 * Auto-starts screen recording + network capture when a round begins
 * Auto-stops and saves when round ends
 */
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { logActivity, getActiveRoundId } from './roundManager.js';

function recLog(level, message) {
  logActivity({ roundId: getActiveRoundId(), vmId: null, vmRole: null, level, message });
}

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const active = { tcpdump: null, ffmpegA: null, ffmpegB: null };

function getSettings() {
  return db.queryOne('SELECT * FROM settings WHERE id=1') || {};
}

function recDir(roundId) {
  const dir = path.join(__dirname, '..', 'data', 'recordings', roundId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function startNetworkCapture(roundId, netInterface) {
  if (!netInterface) {
    recLog('warn', 'Network capture skipped — no interface configured in Settings');
    return;
  }
  const outFile = path.join(recDir(roundId), 'traffic.pcap');
  recLog('info', `Starting network capture on ${netInterface} → ${outFile}`);

  const proc = spawn('tcpdump', ['-i', netInterface, '-w', outFile], { detached: false });
  active.tcpdump = proc;
  proc.on('error', e => recLog('error', `tcpdump error: ${e.message}`));
}

async function startVBoxRecording(vmName, outFile, role) {
  try {
    await execAsync(`VBoxManage controlvm "${vmName}" recording on`);
    await execAsync(`VBoxManage controlvm "${vmName}" recording filename "${outFile}"`);
    recLog('success', `VirtualBox screen recording started for ${role} VM`);
    return true;
  } catch (e) {
    recLog('warn', `VBox recording failed: ${e.message}`);
    return false;
  }
}

async function stopVBoxRecording(vmName, role) {
  try {
    await execAsync(`VBoxManage controlvm "${vmName}" recording off`);
    recLog('info', `VirtualBox recording stopped for ${role} VM`);
  } catch (e) {
    recLog('warn', `VBox stop recording failed: ${e.message}`);
  }
}

function startKVMRecording(display, outFile, role) {
  const proc = spawn('ffmpeg', [
    '-f', 'x11grab', '-video_size', '1920x1080',
    '-i', display, '-codec:v', 'libx264', '-preset', 'ultrafast',
    '-y', outFile
  ], { detached: false });

  if (role === 'defender') active.ffmpegA = proc;
  else active.ffmpegB = proc;

  proc.on('error', e => recLog('warn', `ffmpeg (${role}) error: ${e.message}`));
  recLog('success', `Screen recording started for ${role} VM → ${outFile}`);
}

async function startVMwareRecording(vmxPath, outFile, role) {
  recLog('warn', `VMware screen recording: use manual recording inside the VM or set up ffmpeg for your display`);
}

export async function startRecordings(roundId) {
  const settings = getSettings();
  if (!settings.rec_enabled) {
    recLog('info', 'Recording disabled in Settings — skipping');
    return;
  }

  const vms = db.queryAll('SELECT * FROM vms');
  const vmA = vms.find(v => v.role === 'defender');
  const vmB = vms.find(v => v.role === 'attacker');
  const dir = recDir(roundId);
  const hypervisor = settings.hypervisor || 'kvm';

  recLog('info', `Starting recordings for round ${roundId.slice(0,8)}… (${hypervisor})`);

  await startNetworkCapture(roundId, settings.net_interface);

  if (hypervisor === 'virtualbox') {
    if (vmA?.virsh_name) await startVBoxRecording(vmA.virsh_name, path.join(dir, 'vm_a_screen.webm'), 'defender');
    if (vmB?.virsh_name) await startVBoxRecording(vmB.virsh_name, path.join(dir, 'vm_b_screen.webm'), 'attacker');
  } else if (hypervisor === 'kvm') {
    startKVMRecording(process.env.DISPLAY || ':0', path.join(dir, 'vm_a_screen.mp4'), 'defender');
    startKVMRecording(':1', path.join(dir, 'vm_b_screen.mp4'), 'attacker');
  } else if (hypervisor === 'vmware') {
    if (vmA?.virsh_name) await startVMwareRecording(vmA.virsh_name, path.join(dir, 'vm_a_screen.mp4'), 'defender');
    if (vmB?.virsh_name) await startVMwareRecording(vmB.virsh_name, path.join(dir, 'vm_b_screen.mp4'), 'attacker');
  }

  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ roundId, startedAt: new Date().toISOString(), hypervisor, dir }));
  recLog('success', `All recordings started → ${dir}`);
}

export async function stopRecordings(roundId) {
  const settings = getSettings();
  const hypervisor = settings.hypervisor || 'kvm';
  const vms = db.queryAll('SELECT * FROM vms');
  const vmA = vms.find(v => v.role === 'defender');
  const vmB = vms.find(v => v.role === 'attacker');

  recLog('info', 'Stopping all recordings…');

  if (active.tcpdump) { active.tcpdump.kill('SIGTERM'); active.tcpdump = null; }

  if (hypervisor === 'virtualbox') {
    if (vmA?.virsh_name) await stopVBoxRecording(vmA.virsh_name, 'defender');
    if (vmB?.virsh_name) await stopVBoxRecording(vmB.virsh_name, 'attacker');
  } else {
    if (active.ffmpegA) { active.ffmpegA.kill('SIGTERM'); active.ffmpegA = null; }
    if (active.ffmpegB) { active.ffmpegB.kill('SIGTERM'); active.ffmpegB = null; }
  }

  const dir = path.join(__dirname, '..', 'data', 'recordings', roundId);
  recLog('success', `Recordings saved to ${dir}`);
}

export function getRecordings(roundId) {
  const dir = path.join(__dirname, '..', 'data', 'recordings', roundId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(f => ({
    name: f,
    path: path.join(dir, f),
    size: fs.statSync(path.join(dir, f)).size,
  }));
}
