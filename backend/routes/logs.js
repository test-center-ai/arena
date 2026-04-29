import { Router } from 'express';
import db from '../db.js';
import { logActivity, getActiveRoundId } from '../services/roundManager.js';
import { getCrashLogs } from '../services/crashLogger.js';

const router = Router();

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const roundId = req.query.round_id;
  const level = req.query.level;
  const vmId = req.query.vm_id;
  const search = req.query.search;

  const conditions = [];
  const params = [];

  if (roundId) { conditions.push('l.round_id=?'); params.push(roundId); }
  if (level && level !== 'all') { conditions.push('l.level=?'); params.push(level); }
  if (vmId && vmId !== 'all') { conditions.push('l.vm_id=?'); params.push(vmId); }
  if (search) { conditions.push('l.message LIKE ?'); params.push(`%${search}%`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.queryOne(
    `SELECT COUNT(*) as c FROM activity_logs l ${where}`, params
  )?.c || 0;

  const rows = db.queryAll(
    `SELECT l.*, v.name as vm_name FROM activity_logs l LEFT JOIN vms v ON l.vm_id=v.id
     ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({ rows, total, limit, offset });
});

router.post('/', (req, res) => {
  const { roundId, vmId, vmRole, level, message, raw } = req.body;
  logActivity({ roundId, vmId, vmRole, level, message, raw });
  res.json({ success: true });
});

router.get('/crashes', (_req, res) => res.json(getCrashLogs()));

export default router;
