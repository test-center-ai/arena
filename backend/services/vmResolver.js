/**
 * VM IP Resolver — dynamically resolves VM IPs from libvirt DHCP leases
 * and guest agent, then updates the database so arena always uses current IPs.
 *
 * Called before round starts, during preflight, and on-demand via API.
 */

import db from '../db.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const VIRSH_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|[01]?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;

function parseDhcpLeases(output) {
  const lines = output.split('\n').slice(2).filter(l => l.trim());
  return lines.map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      mac: parts[2] || '',
      ip: parts[4] ? parts[4].split('/')[0] : '',
      hostname: parts[5] || '',
    };
  }).filter(l => l.ip);
}

function parseDomIfAddr(output) {
  // Use a regex that grabs IPv4 with CIDR rather than positional split.
  const ips = [];
  for (const line of output.split('\n')) {
    const m = line.match(/((?:\d{1,3}\.){3}\d{1,3})\/\d+/);
    if (m) ips.push({ ip: m[1] });
  }
  return ips;
}

async function resolveVMIP(virshName, role) {
  if (!virshName || !VIRSH_NAME_RE.test(virshName)) return null;

  try {
    const { stdout } = await execFileAsync('virsh', ['domifaddr', virshName]);
    const addrs = parseDomIfAddr(stdout);
    if (addrs.length > 0 && addrs[0].ip) {
      return { ip: addrs[0].ip, source: 'domifaddr' };
    }
  } catch (e) {
    // VM might be shut off — fall through
  }

  // Strategy 2: DHCP lease lookup by hostname
  try {
    const { stdout } = await execFileAsync('virsh', ['net-dhcp-leases', 'default']);
    const leases = parseDhcpLeases(stdout);

    const hostname = virshName.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const byName = leases.find(l =>
      l.hostname.toLowerCase().replace(/[^a-z0-9-]/g, '') === hostname
    );
    if (byName && byName.ip) {
      return { ip: byName.ip, source: 'dhcp-lease' };
    }

    const roleAliases = role === 'defender'
      ? ['win11', 'windows', 'arena']
      : ['kali', 'linux'];
    const byAlias = leases.find(l =>
      roleAliases.some(alias => l.hostname.toLowerCase().includes(alias))
    );
    if (byAlias && byAlias.ip) {
      return { ip: byAlias.ip, source: 'dhcp-lease-alias' };
    }
  } catch (e) {
    // libvirtd might not be running
  }

  return null;
}

export async function resolveVMIPs({ force = false, silent = false } = {}) {
  const vms = db.queryAll('SELECT * FROM vms');
  const changes = [];

  for (const vm of vms) {
    const result = await resolveVMIP(vm.virsh_name, vm.role);

    if (!result) {
      if (!silent) console.log(`[vmResolver] ⚠ Could not resolve IP for ${vm.name} (${vm.virsh_name})`);
      continue;
    }

    if (result.ip !== vm.ip || force) {
      const oldIp = vm.ip;
      if (!silent) {
        console.log(`[vmResolver] ${vm.name} (${vm.virsh_name}): ${vm.ip || 'none'} → ${result.ip} [${result.source}]`);
      }
      db.run(
        `UPDATE vms SET ip=?, updated_at=datetime('now') WHERE id=?`,
        [result.ip, vm.id]
      );
      changes.push({ id: vm.id, name: vm.name, role: vm.role, oldIp, newIp: result.ip, source: result.source });
    }
  }

  const updated = db.queryAll('SELECT * FROM vms');
  return { vms: updated, changes };
}

export async function checkVMReachability() {
  const vms = db.queryAll('SELECT * FROM vms');
  const results = [];

  for (const vm of vms) {
    if (!vm.ip) {
      results.push({ id: vm.id, name: vm.name, reachable: false, error: 'No IP assigned' });
      continue;
    }
    if (!IPV4_RE.test(vm.ip)) {
      results.push({ id: vm.id, name: vm.name, reachable: false, error: 'Invalid IP format' });
      continue;
    }

    try {
      await execFileAsync('ping', ['-c', '1', '-W', '2', vm.ip]);
      results.push({ id: vm.id, name: vm.name, reachable: true, ip: vm.ip });
    } catch {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        await fetch(`http://${vm.ip}:${vm.relay_port || 9030}/status`, { signal: controller.signal });
        clearTimeout(timeout);
        results.push({ id: vm.id, name: vm.name, reachable: true, ip: vm.ip });
      } catch {
        results.push({ id: vm.id, name: vm.name, reachable: false, ip: vm.ip, error: 'No response' });
      }
    }
  }

  return results;
}

export default { resolveVMIPs, checkVMReachability };
