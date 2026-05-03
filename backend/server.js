import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { initWebSocket } from './wsHub.js';
import vmRoutes from './routes/vms.js';
import roundRoutes from './routes/rounds.js';
import { recordHeartbeat, recordHeartbeatFailure } from './services/crashLogger.js';
import { startStatsPolling } from './services/vmStats.js';
import flagRoutes from './routes/flag.js';
import logRoutes from './routes/logs.js';
import preflightRoutes from './routes/preflight.js';
import settingsRoutes from './routes/settings.js';
import deployRoutes from './routes/deploy.js';
import healthRoutes from './routes/health.js';
import db from './db.js';
import { getRecordings } from './services/recordingManager.js';
import { getActiveRoundId } from './services/roundManager.js';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

initWebSocket(server);

app.use('/api/vms', vmRoutes);
app.use('/api/rounds', roundRoutes);
app.use('/api/flag', flagRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/preflight', preflightRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/health-check', healthRoutes);

app.get('/api/rounds/:id/recordings', (req, res) => {
  res.json(getRecordings(req.params.id));
});

app.use('/api/recordings', express.static(path.join(__dirname, 'data', 'recordings')));

app.get('/api/leaderboard', (_req, res) => {
  const board = db.queryAll(`
    SELECT *,
      CASE WHEN (atk_wins+atk_losses)>0 THEN ROUND(atk_wins*100.0/(atk_wins+atk_losses),1) ELSE 0 END as atk_win_rate,
      CASE WHEN (def_wins+def_losses)>0 THEN ROUND(def_wins*100.0/(def_wins+def_losses),1) ELSE 0 END as def_win_rate
    FROM leaderboard ORDER BY (atk_wins+def_wins) DESC
  `);
  res.json(board);
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/api/heartbeat', (req, res) => {
  const { vmId, openclaw_active } = req.body;
  if (vmId) {
    db.run(
      "UPDATE vms SET updated_at=datetime('now'), relay_last_seen=datetime('now'), openclaw_active=? WHERE id=?",
      [openclaw_active ? 1 : 0, vmId]
    );
    recordHeartbeat(vmId);
  }
  res.json({ success: true, roundId: getActiveRoundId() });
});

// Background heartbeat-failure detector: every 60 s, find VMs whose
// relay_last_seen is older than 90 s and tally a failure. Three strikes
// triggers a crash log entry (see crashLogger.recordHeartbeatFailure).
setInterval(() => {
  const stale = db.queryAll(
    `SELECT id, name FROM vms
     WHERE relay_last_seen IS NOT NULL
       AND (julianday('now') - julianday(relay_last_seen)) * 86400 > 90`
  );
  const roundId = getActiveRoundId();
  for (const vm of stale) {
    recordHeartbeatFailure(vm.id, vm.name, roundId);
  }
}, 60000);

startStatsPolling();

import { resolveVMIPs } from './services/vmResolver.js';
// Permanent fix: auto-resolve IPs every 30 seconds
setInterval(() => {
  resolveVMIPs({ silent: true }).catch(err => console.error('[AutoIP] Error:', err));
}, 30000);

const PORT = process.env.PORT || 9020;
server.listen(PORT, () => {
  console.log(`\n🏟️  Arena AI Backend  →  http://localhost:${PORT}`);
  console.log(`🚩  Flag endpoint    →  http://localhost:${PORT}/api/flag/submit`);
  console.log(`🔌  WebSocket       →  ws://localhost:${PORT}/ws\n`);
});

// Persist on graceful shutdown so no recent writes are lost.
function gracefulShutdown() {
  try { db.persist(); } catch {}
  process.exit(0);
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
