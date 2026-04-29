import { exec } from 'child_process';
import { promisify } from 'util';
import db from '../db.js';
import { broadcast } from '../wsHub.js';

const execAsync = promisify(exec);

let previousStats = {};
let pollingInterval = null;

export function startStatsPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  // Poll every 2 seconds
  pollingInterval = setInterval(pollStats, 2000);
}

export function stopStatsPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = null;
}

async function pollStats() {
  try {
    const { stdout } = await execAsync('virsh domstats --cpu-total --balloon --interface');
    const vms = db.queryAll('SELECT id, virsh_name FROM vms');
    const nameToId = {};
    for (const vm of vms) if (vm.virsh_name) nameToId[vm.virsh_name] = vm.id;

    const currentTimestamp = Date.now();
    const lines = stdout.split('\n');
    let currentDomain = null;
    let parsedStats = {};

    for (let line of lines) {
      line = line.trim();
      if (line.startsWith("Domain: '")) {
        const match = line.match(/'([^']+)'/);
        if (match) currentDomain = match[1];
      } else if (currentDomain && line.includes('=')) {
        if (!parsedStats[currentDomain]) parsedStats[currentDomain] = {};
        const [key, val] = line.split('=');
        parsedStats[currentDomain][key] = parseFloat(val) || 0;
      }
    }

    for (const [dom, stats] of Object.entries(parsedStats)) {
      const vmId = nameToId[dom];
      // state.state === 1 means running in KVM
      if (!vmId || stats['state.state'] !== 1) continue; 

      const prev = previousStats[dom];
      const result = { cpu: 0, ram: 0, rxMbps: 0, txMbps: 0 };

      // RAM
      if (stats['balloon.maximum'] > 0) {
        result.ram = (stats['balloon.current'] / stats['balloon.maximum']) * 100;
      }

      // CPU and Network deltas
      if (prev && prev.timestamp) {
        const timeDeltaSec = (currentTimestamp - prev.timestamp) / 1000;
        
        // CPU %
        if (stats['cpu.time'] !== undefined && prev['cpu.time'] !== undefined) {
          const cpuDeltaNs = stats['cpu.time'] - prev['cpu.time'];
          const vcpus = stats['vcpu.maximum'] || 1;
          result.cpu = (cpuDeltaNs / (timeDeltaSec * 1e9 * vcpus)) * 100;
        }

        // Network Mbps
        if (stats['net.0.rx.bytes'] !== undefined && prev['net.0.rx.bytes'] !== undefined) {
          const rxBytesDelta = stats['net.0.rx.bytes'] - prev['net.0.rx.bytes'];
          const txBytesDelta = stats['net.0.tx.bytes'] - prev['net.0.tx.bytes'];
          result.rxMbps = (rxBytesDelta * 8) / 1000000 / timeDeltaSec;
          result.txMbps = (txBytesDelta * 8) / 1000000 / timeDeltaSec;
        }
      }

      // Clamp values
      result.cpu = Math.max(0, Math.min(100, result.cpu || 0));
      result.ram = Math.max(0, Math.min(100, result.ram || 0));
      result.rxMbps = Math.max(0, result.rxMbps || 0);
      result.txMbps = Math.max(0, result.txMbps || 0);

      previousStats[dom] = { ...stats, timestamp: currentTimestamp };

      // Broadcast to frontend
      broadcast({
        type: 'VM_STATS',
        payload: { vmId, ...result }
      });
    }
  } catch (err) {
    // If virsh domstats fails (e.g. libvirt down), ignore silently
  }
}
