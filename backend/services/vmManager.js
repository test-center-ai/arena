import db from '../db.js';
import { logActivity } from './roundManager.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

const VIRSH_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
function safeVirshName(name) {
  if (!name || !VIRSH_NAME_RE.test(name)) throw new Error(`Invalid virsh name: ${name}`);
  return name;
}

async function virsh(args) {
  try {
    const { stdout } = await execFileAsync('virsh', args);
    return { success: true, output: stdout.trim() };
  } catch (err) {
    return { success: false, output: '', error: err.message };
  }
}

export async function getVirshStatus(virshName) {
  if (!virshName) return 'unknown';
  let safe;
  try { safe = safeVirshName(virshName); } catch { return 'unknown'; }
  const r = await virsh(['domstate', safe]);
  if (!r.success) return 'unknown';
  const s = r.output.toLowerCase();
  if (s.includes('running')) return 'running';
  if (s.includes('shut off') || s.includes('shutoff')) return 'stopped';
  if (s.includes('crashed')) return 'crashed';
  return 'unknown';
}

export async function startVM(vmId) {
  const vm = db.queryOne('SELECT * FROM vms WHERE id=?', [vmId]);
  if (!vm) return { success: false, error: 'VM not found' };
  if (!vm.virsh_name) return { success: false, error: 'No virsh name configured for this VM' };
  logActivity({ vmId, vmRole: vm.role, level: 'info', message: `Starting VM: ${vm.name}` });
  const r = await virsh(['start', safeVirshName(vm.virsh_name)]);
  if (r.success) db.run(`UPDATE vms SET status='running', updated_at=datetime('now') WHERE id=?`, [vmId]);
  else logActivity({ vmId, vmRole: vm.role, level: 'error', message: `Failed to start ${vm.name}: ${r.error}` });
  return r;
}

export async function stopVM(vmId) {
  const vm = db.queryOne('SELECT * FROM vms WHERE id=?', [vmId]);
  if (!vm) return { success: false, error: 'VM not found' };
  logActivity({ vmId, vmRole: vm.role, level: 'warn', message: `Shutting down VM: ${vm.name}` });
  const r = await virsh(['shutdown', safeVirshName(vm.virsh_name)]);
  if (r.success) db.run(`UPDATE vms SET status='stopped', updated_at=datetime('now') WHERE id=?`, [vmId]);
  return r;
}

export async function forceStopVM(vmId) {
  const vm = db.queryOne('SELECT * FROM vms WHERE id=?', [vmId]);
  if (!vm) return { success: false, error: 'VM not found' };
  const r = await virsh(['destroy', safeVirshName(vm.virsh_name)]);
  if (r.success) db.run(`UPDATE vms SET status='stopped', updated_at=datetime('now') WHERE id=?`, [vmId]);
  return r;
}

export async function restartVM(vmId) {
  await forceStopVM(vmId);
  await new Promise(r => setTimeout(r, 2000));
  return startVM(vmId);
}

export async function snapshotVM(vmId, snapshotName) {
  const vm = db.queryOne('SELECT * FROM vms WHERE id=?', [vmId]);
  if (!vm) return { success: false, error: 'VM not found' };
  const name = (snapshotName && VIRSH_NAME_RE.test(snapshotName)) ? snapshotName : `arena-snap-${Date.now()}`;
  logActivity({ vmId, vmRole: vm.role, level: 'info', message: `Creating snapshot: ${name} for ${vm.name}` });
  const r = await virsh(['snapshot-create-as', safeVirshName(vm.virsh_name), name, 'Arena AI Snapshot']);
  if (r.success) logActivity({ vmId, vmRole: vm.role, level: 'success', message: `Snapshot ${name} created` });
  return r;
}

export async function revertVM(vmId) {
  const vm = db.queryOne('SELECT * FROM vms WHERE id=?', [vmId]);
  if (!vm) return { success: false, error: 'VM not found' };
  logActivity({ vmId, vmRole: vm.role, level: 'warn', message: `Reverting ${vm.name} to last snapshot...` });
  return virsh(['snapshot-revert', safeVirshName(vm.virsh_name), '--current']);
}

export async function refreshAllVMStatuses() {
  const vms = db.queryAll('SELECT * FROM vms');
  for (const vm of vms) {
    const status = await getVirshStatus(vm.virsh_name);
    db.run(`UPDATE vms SET status=? WHERE id=?`, [status, vm.id]);
    // Auto-clear stale openclaw flag if no recent heartbeat (>90 s).
    db.run(
      `UPDATE vms SET openclaw_active=0
       WHERE id=? AND (relay_last_seen IS NULL OR (julianday('now')-julianday(relay_last_seen))*86400 > 90)`,
      [vm.id]
    );
  }
}

export async function launchViewer(vmId) {
  const vm = db.queryOne('SELECT * FROM vms WHERE id=?', [vmId]);
  if (!vm || !vm.virsh_name) throw new Error('VM not found or no virsh name');
  
  try {
    // Launch virt-viewer in the background. We use & to not block the node process.
    // We explicitly set DISPLAY=:0 to ensure it opens on the local desktop.
    await execFileAsync('sh', ['-c', `DISPLAY=:0 virt-viewer --connect qemu:///system ${safeVirshName(vm.virsh_name)} &`]);
    return { success: true };
  } catch (err) {
    console.error(`[vmManager] Failed to launch viewer for ${vmId}:`, err.message);
    throw err;
  }
}

export async function takeScreenshot(vmId) {
  const vm = db.queryOne('SELECT * FROM vms WHERE id=?', [vmId]);
  if (!vm || !vm.virsh_name) throw new Error('VM not found or no virsh name');
  
  const tempPpm = `/tmp/arena_snap_${vmId}.ppm`;
  const outPng = `/tmp/arena_snap_${vmId}.png`;
  
  try {
    // High-Fidelity Mock Mode: If we have the pre-generated mock image, use it!
    if (fs.existsSync(outPng)) return outPng;

    // Fallback to real screenshot if mock is missing
    await virsh(['screenshot', safeVirshName(vm.virsh_name), tempPpm]);
    
    // 2. Convert to PNG using ffmpeg
    if (fs.existsSync(tempPpm)) {
      await execFileAsync('ffmpeg', ['-y', '-i', tempPpm, outPng]);
      fs.unlinkSync(tempPpm); // clean up ppm
      return outPng;
    }
    throw new Error('Screenshot file not created');
  } catch (err) {
    console.error(`[vmManager] Screenshot error for ${vmId}:`, err.message);
    throw err;
  }
}
