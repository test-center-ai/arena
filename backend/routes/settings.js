import { Router } from 'express';
import db from '../db.js';

const router = Router();

// Ensure settings row exists
function ensureSettings() {
  const exists = db.queryOne('SELECT id FROM settings WHERE id=1');
  if (!exists) db.run("INSERT INTO settings (id) VALUES (1)");
}

router.get('/', (_req, res) => {
  ensureSettings();
  res.json(db.queryOne('SELECT * FROM settings WHERE id=1') || {});
});

router.put('/', (req, res) => {
  ensureSettings();
  const { hypervisor, net_interface, host_ip, rec_enabled } = req.body;
  db.run(
    `UPDATE settings SET
      hypervisor=COALESCE(?,hypervisor),
      net_interface=COALESCE(?,net_interface),
      host_ip=COALESCE(?,host_ip),
      rec_enabled=COALESCE(?,rec_enabled),
      updated_at=datetime('now')
    WHERE id=1`,
    [hypervisor||null, net_interface||null, host_ip||null, rec_enabled!=null ? (rec_enabled?1:0) : null]
  );
  res.json({ success: true });
});

export default router;
