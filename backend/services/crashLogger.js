import db from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { broadcast } from '../wsHub.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRASH_LOG_PATH = path.join(__dirname, '..', 'data', 'crash.log');

export function writeCrashLog({ roundId, vmId, vmName, errorMsg, lastLines, context }) {
  const timestamp = new Date().toISOString();
  const entry = [
    '═'.repeat(80),
    `CRASH EVENT — ${timestamp}`,
    `VM: ${vmName || vmId}`, `Round: ${roundId || 'N/A'}`,
    `Error: ${errorMsg}`, `Context: ${context || 'N/A'}`,
    '', '── Last Activity ──', lastLines || '(no recent activity)',
    '═'.repeat(80), '',
  ].join('\n');

  fs.appendFileSync(CRASH_LOG_PATH, entry, 'utf8');

  db.run(
    `INSERT INTO crash_logs (round_id,vm_id,vm_name,error_msg,last_lines,context,timestamp) VALUES (?,?,?,?,?,?,?)`,
    [roundId||null, vmId||null, vmName||null, errorMsg, lastLines||null, context||null, timestamp]
  );

  broadcast({ type: 'CRASH', payload: { roundId, vmId, vmName, errorMsg, timestamp } });
}

const heartbeatFailures = {};

export function recordHeartbeat(vmId) { heartbeatFailures[vmId] = 0; }

export function recordHeartbeatFailure(vmId, vmName, roundId) {
  heartbeatFailures[vmId] = (heartbeatFailures[vmId] || 0) + 1;
  if (heartbeatFailures[vmId] >= 3) {
    const lastLogs = db.queryAll(
      `SELECT timestamp,level,message FROM activity_logs WHERE vm_id=? ORDER BY id DESC LIMIT 20`,
      [vmId]
    );
    const lastLines = lastLogs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    writeCrashLog({ roundId, vmId, vmName, errorMsg: 'Heartbeat lost after 3 consecutive failures', lastLines, context: 'VM stopped responding to relay agent heartbeat pings' });
    db.run(`UPDATE vms SET status='crashed', updated_at=datetime('now') WHERE id=?`, [vmId]);
    heartbeatFailures[vmId] = 0;
  }
}

export function resetHeartbeats() { Object.keys(heartbeatFailures).forEach(k => delete heartbeatFailures[k]); }

export function getCrashLogs() {
  return db.queryAll('SELECT * FROM crash_logs ORDER BY id DESC LIMIT 100');
}
