export const api = {
  async get(path) {
    const res = await fetch(`/api${path}`);
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
    return res.json();
  },
  async put(path, body) {
    const res = await fetch(`/api${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
    return res.json();
  },
};

export function fmtTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString();
}

export function fmtDuration(start, end) {
  if (!start) return '—';
  const ms = (end ? new Date(end) : new Date()) - new Date(start);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

export function winnerBadge(winner) {
  if (winner === 'attacker') return <span className="badge badge-red">🏴 Attacker</span>;
  if (winner === 'defender') return <span className="badge badge-blue">🛡️ Defender</span>;
  if (winner === 'void') return <span className="badge badge-gray">Void</span>;
  return <span className="badge badge-gray">—</span>;
}

export function statusBadge(status) {
  const map = {
    running: <span className="badge badge-green">● Running</span>,
    stopped: <span className="badge badge-gray">◯ Stopped</span>,
    crashed: <span className="badge badge-red">✕ Crashed</span>,
    unknown: <span className="badge badge-yellow">? Unknown</span>,
    pending: <span className="badge badge-yellow">◷ Pending</span>,
    completed: <span className="badge badge-blue">✓ Completed</span>,
    void: <span className="badge badge-gray">∅ Void</span>,
  };
  return map[status] || <span className="badge badge-gray">{status}</span>;
}

export function VMLights({ vm }) {
  if (!vm) return null;

  const vmOn = vm.status === 'running';
  const vmCrashed = vm.status === 'crashed';
  const vmColor = vmOn ? 'var(--green)' : vmCrashed ? 'var(--red)' : 'var(--text-muted)';

  // Relay heartbeat in last 45 s? Read from relay_last_seen — populated only
  // by POST /api/heartbeat (the in-VM relay agent), so the dot reflects the
  // actual agent health, not host-side virsh polling.
  const rawTs = vm.relay_last_seen;
  const lastUpdate = rawTs ? new Date(rawTs.replace(' ', 'T') + 'Z').getTime() : 0;
  const now = Date.now();
  const relayActive = !!rawTs && (now - lastUpdate) < 45000;
  const relayColor = relayActive ? 'var(--green)' : 'var(--red)';

  const ocActive = vm.openclaw_active === 1;
  const ocColor = ocActive ? 'var(--green)' : 'var(--red)';

  const Dot = ({ label, color, title }) => (
    <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}80` }} />
      {label}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 16, background: 'rgba(0,0,0,0.3)', padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border)' }}>
      <Dot label="VM" color={vmColor} title={`Hypervisor Status: ${vm.status}`} />
      <Dot label="Relay" color={relayColor} title={`Relay Agent Status: ${relayActive ? 'Connected' : 'Offline'}`} />
      <Dot label="OpenClaw" color={ocColor} title={`OpenClaw Status: ${ocActive ? 'Logging Active' : 'Inactive / Log not found'}`} />
    </div>
  );
}
