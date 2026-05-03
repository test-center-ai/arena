import { Router } from 'express';
import db from '../db.js';
import { startVM, stopVM, forceStopVM, restartVM, snapshotVM, revertVM, refreshAllVMStatuses, takeScreenshot, launchViewer } from '../services/vmManager.js';
import { resolveVMIPs, checkVMReachability } from '../services/vmResolver.js';

const router = Router();

router.get('/', async (_req, res) => {
  await refreshAllVMStatuses();
  res.json(db.queryAll('SELECT * FROM vms ORDER BY role'));
});

// ── Resolve VM IPs dynamically ──
router.post('/resolve-ips', async (_req, res) => {
  try {
    const { vms, changes } = await resolveVMIPs();
    res.json({ success: true, vms, changes, message: changes.length > 0
      ? `Updated ${changes.length} IP(s): ${changes.map(c => `${c.name}: ${c.oldIp || 'none'} → ${c.newIp}`).join(', ')}`
      : 'All IPs are current — no changes needed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Check VM reachability ──
router.get('/reachability', async (_req, res) => {
  try {
    const results = await checkVMReachability();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/screenshot', async (req, res) => {
  try {
    const pngPath = await takeScreenshot(req.params.id);
    res.sendFile(pngPath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req, res) => {
  const vm = db.queryOne('SELECT * FROM vms WHERE id=?', [req.params.id]);
  if (!vm) return res.status(404).json({ error: 'VM not found' });
  res.json(vm);
});

const VIRSH_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|[01]?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;

router.put('/:id', (req, res) => {
  const { name, ip, virsh_name, model_name, ram_gb, cpu_cores, disk_gb } = req.body;
  const vm = db.queryOne('SELECT * FROM vms WHERE id=?', [req.params.id]);
  if (!vm) return res.status(404).json({ error: 'VM not found' });

  if (virsh_name != null && virsh_name !== '' && !VIRSH_NAME_RE.test(virsh_name)) {
    return res.status(400).json({ error: 'Invalid virsh_name (allowed: letters, digits, _ . - up to 64 chars)' });
  }
  if (ip != null && ip !== '' && !IPV4_RE.test(ip)) {
    return res.status(400).json({ error: 'Invalid ip (must be IPv4)' });
  }
  for (const [k, v] of [['ram_gb', ram_gb], ['cpu_cores', cpu_cores], ['disk_gb', disk_gb]]) {
    if (v != null && (!Number.isFinite(v) || v < 0 || v > 1024)) {
      return res.status(400).json({ error: `Invalid ${k}` });
    }
  }

  db.run(
    `UPDATE vms SET name=?,ip=?,virsh_name=?,model_name=?,ram_gb=?,cpu_cores=?,disk_gb=?,updated_at=datetime('now') WHERE id=?`,
    [name??vm.name, ip??vm.ip, virsh_name??vm.virsh_name, model_name??vm.model_name, ram_gb??vm.ram_gb, cpu_cores??vm.cpu_cores, disk_gb??vm.disk_gb, req.params.id]
  );
  res.json({ success: true });
});

router.post('/:id/start',      async (req, res) => res.json(await startVM(req.params.id)));
router.post('/:id/stop',       async (req, res) => res.json(await stopVM(req.params.id)));
router.post('/:id/force-stop', async (req, res) => res.json(await forceStopVM(req.params.id)));
router.post('/:id/restart',    async (req, res) => res.json(await restartVM(req.params.id)));
router.post('/:id/snapshot',   async (req, res) => res.json(await snapshotVM(req.params.id, req.body?.name)));
router.post('/:id/revert',     async (req, res) => res.json(await revertVM(req.params.id)));
router.post('/:id/view-local', async (req, res) => {
  try {
    await launchViewer(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
