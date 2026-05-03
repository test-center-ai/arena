import initSqlJs from 'sql.js';
import fs from 'fs';

async function check() {
  const SQL = await initSqlJs();
  const filebuffer = fs.readFileSync('backend/data/arena.db');
  const db = new SQL.Database(filebuffer);
  const res = db.exec("SELECT id, name, relay_last_seen FROM vms");
  console.log(JSON.stringify(res[0].values));
}
check();
