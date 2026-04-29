import { Router } from 'express';
import db from '../db.js';
import { startRound, endRound, getCurrentRound, clearStuckRounds } from '../services/roundManager.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.queryAll(`
    SELECT r.*, va.name as vm_a_name, vb.name as vm_b_name, va.os as vm_a_os, vb.os as vm_b_os
    FROM rounds r
    LEFT JOIN vms va ON r.vm_a_id = va.id
    LEFT JOIN vms vb ON r.vm_b_id = vb.id
    ORDER BY r.created_at DESC
  `));
});

router.get('/active', (_req, res) => {
  const round = getCurrentRound();
  if (!round) return res.json(null);
  res.json(db.queryOne('SELECT * FROM rounds WHERE id=?', [round.id]));
});

// Get stuck round info (debug)
router.get('/stuck', (_req, res) => {
  const running = db.queryAll("SELECT id, status, start_time, vm_a_model, vm_b_model FROM rounds WHERE status='running'");
  res.json({ inMemory: getCurrentRound()?.id || null, inDb: running });
});

router.get('/:id', (req, res) => {
  const round = db.queryOne(
    `SELECT r.*, va.name as vm_a_name, vb.name as vm_b_name FROM rounds r
     LEFT JOIN vms va ON r.vm_a_id=va.id LEFT JOIN vms vb ON r.vm_b_id=vb.id WHERE r.id=?`,
    [req.params.id]
  );
  if (!round) return res.status(404).json({ error: 'Round not found' });
  const logs = db.queryAll(
    `SELECT l.*, v.name as vm_name FROM activity_logs l LEFT JOIN vms v ON l.vm_id=v.id WHERE l.round_id=? ORDER BY l.id ASC`,
    [req.params.id]
  );
  res.json({ ...round, logs });
});

router.post('/start', async (req, res) => res.json(await startRound(req.body)));

router.post('/:id/end', async (req, res) => {
  const { winner } = req.body;
  res.json(await endRound(winner || 'void', 'Manual termination from dashboard'));
});

// Force-clear any stuck running rounds (useful after server restart)
router.post('/clear-stuck', async (_req, res) => {
  const result = clearStuckRounds();
  res.json(result);
});

export default router;
