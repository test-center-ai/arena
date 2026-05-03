/**
 * Database layer using sql.js (pure-JS SQLite, no native build required)
 * Data is persisted to disk as arena.db binary file.
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'arena.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Init sql.js ───────────────────────────────────────────────────────────────
const SQL = await initSqlJs();
let db;

if (fs.existsSync(DB_PATH)) {
  const filebuffer = fs.readFileSync(DB_PATH);
  db = new SQL.Database(filebuffer);
} else {
  db = new SQL.Database();
}

// Persist to disk after every write
function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Auto-persist every 5 seconds
setInterval(persist, 5000);

// ── Schema ────────────────────────────────────────────────────────────────────
db.run(`
  CREATE TABLE IF NOT EXISTS vms (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL,
    os          TEXT NOT NULL,
    ip          TEXT,
    virsh_name  TEXT,
    model_name  TEXT DEFAULT 'Unknown',
    ram_gb      INTEGER DEFAULT 16,
    cpu_cores   INTEGER DEFAULT 6,
    disk_gb     INTEGER DEFAULT 250,
    status      TEXT DEFAULT 'stopped',
    openclaw_active INTEGER DEFAULT 0,
    relay_port  INTEGER DEFAULT 9030,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rounds (
    id            TEXT PRIMARY KEY,
    vm_a_id       TEXT,
    vm_b_id       TEXT,
    vm_a_model    TEXT,
    vm_b_model    TEXT,
    attacker_prompt TEXT,
    defender_prompt TEXT,
    duration_mins INTEGER DEFAULT 60,
    status        TEXT DEFAULT 'pending',
    winner        TEXT,
    start_time    TEXT,
    end_time      TEXT,
    flag_value    TEXT,
    flag_captured INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS activity_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id   TEXT,
    vm_id      TEXT,
    vm_role    TEXT,
    timestamp  TEXT DEFAULT (datetime('now')),
    level      TEXT DEFAULT 'info',
    message    TEXT NOT NULL,
    raw        TEXT
  );
  CREATE TABLE IF NOT EXISTS crash_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id    TEXT,
    vm_id       TEXT,
    vm_name     TEXT,
    timestamp   TEXT DEFAULT (datetime('now')),
    error_msg   TEXT,
    last_lines  TEXT,
    context     TEXT
  );
  CREATE TABLE IF NOT EXISTS leaderboard (
    model_name       TEXT PRIMARY KEY,
    total_rounds     INTEGER DEFAULT 0,
    atk_wins         INTEGER DEFAULT 0,
    atk_losses       INTEGER DEFAULT 0,
    def_wins         INTEGER DEFAULT 0,
    def_losses       INTEGER DEFAULT 0,
    avg_capture_secs REAL DEFAULT 0,
    updated_at       TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    id            INTEGER PRIMARY KEY DEFAULT 1,
    hypervisor    TEXT DEFAULT 'kvm',
    net_interface TEXT,
    host_ip       TEXT,
    rec_enabled   INTEGER DEFAULT 0,
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS recordings (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id  TEXT,
    filename  TEXT,
    filepath  TEXT,
    filetype  TEXT,
    size_bytes INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
try { db.run("ALTER TABLE vms ADD COLUMN openclaw_active INTEGER DEFAULT 0"); } catch (e) {}
try { db.run("ALTER TABLE vms ADD COLUMN relay_last_seen TEXT"); } catch (e) {}
try { db.run("ALTER TABLE vms ADD COLUMN relay_port INTEGER DEFAULT 9030"); } catch (e) {}
persist();

// ── Seed default VMs ──────────────────────────────────────────────────────────
const vmRes = db.exec("SELECT COUNT(*) as c FROM vms");
const vmCount = vmRes[0]?.values[0][0] || 0;
if (vmCount === 0) {
  db.run(`INSERT INTO vms (id,name,role,os,ip,virsh_name,model_name,ram_gb,cpu_cores,disk_gb) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ['vm-a','VM Alpha','defender','Windows 11','192.168.1.101','win11-arena','GPT-5',16,6,250]);
  db.run(`INSERT INTO vms (id,name,role,os,ip,virsh_name,model_name,ram_gb,cpu_cores,disk_gb) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ['vm-b','VM Beta','attacker','Kali Linux','192.168.1.102','kali-arena','DeepSeek-V4-Pro',16,6,250]);
  persist();
}

// ── Helpers matching better-sqlite3 API ──────────────────────────────────────
function queryAll(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (e) {
    console.error('[DB queryAll]', e.message, sql);
    return [];
  }
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

// SQL prefixes for writes that should be flushed to disk immediately
// (round lifecycle and leaderboard updates can't afford the 5 s window).
const URGENT_PREFIXES = [
  'INSERT INTO rounds', 'UPDATE rounds',
  'INSERT INTO leaderboard', 'UPDATE leaderboard',
  'INSERT INTO crash_logs',
];

function run(sql, params = []) {
  try {
    db.run(sql, params);
    const changes = db.getRowsModified();
    const head = sql.trim().slice(0, 32).toUpperCase();
    if (URGENT_PREFIXES.some(p => head.startsWith(p))) persist();
    return { changes };
  } catch (e) {
    console.error('[DB run]', e.message, sql);
    return { changes: 0 };
  }
}

export default { queryAll, queryOne, run, persist };
