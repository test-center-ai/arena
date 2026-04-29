import { Router } from 'express';
import { submitFlag } from '../services/roundManager.js';
import { logActivity } from '../services/roundManager.js';
import { getActiveRoundId } from '../services/roundManager.js';

const router = Router();

// POST /api/flag/submit — called by relay agent in VM B when flag is found
router.post('/submit', async (req, res) => {
  const { flag, vmId } = req.body;
  const sourceIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!flag) return res.status(400).json({ success: false, message: 'No flag provided' });

  const roundId = getActiveRoundId();
  logActivity({
    roundId,
    vmId: vmId || 'vm-b',
    vmRole: 'attacker',
    level: 'attack',
    message: `🚩 Flag submission attempt from ${sourceIp}: ${flag.substring(0, 20)}...`,
  });

  const result = await submitFlag(flag, sourceIp);
  res.json(result);
});

export default router;
