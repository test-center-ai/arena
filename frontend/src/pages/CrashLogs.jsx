import { useEffect, useState, useCallback, useRef } from 'react';
import { api, fmtTime } from '../utils.jsx';
import { useWs } from '../hooks/useWebSocket.jsx';

const LEVELS = ['all', 'info', 'success', 'warn', 'error', 'attack', 'defend'];
const LEVEL_COLOR = {
  info:    'var(--text-secondary)',
  success: 'var(--green)',
  warn:    'var(--yellow)',
  error:   'var(--red)',
  attack:  'var(--red)',
  defend:  'var(--blue)',
};
const LEVEL_CLASS = {
  info: 'log-info', success: 'log-success', warn: 'log-warn',
  error: 'log-error', attack: 'log-attack', defend: 'log-defend',
};

const PAGE = 200;

export default function SystemLogs() {
  const { on } = useWs();
  const [vms, setVms] = useState([]);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ level: 'all', vm_id: 'all', search: '' });
  const [crashes, setCrashes] = useState([]);
  const [expandedCrash, setExpandedCrash] = useState(null);
  const [liveMode, setLiveMode] = useState(true);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => { api.get('/vms').then(setVms).catch(() => {}); }, []);
  useEffect(() => { api.get('/logs/crashes').then(setCrashes).catch(() => {}); }, []);

  const fetchLogs = useCallback(async (off = 0, append = false) => {
    setLoading(true);
    try {
      const f = filtersRef.current;
      const qs = new URLSearchParams({
        limit: PAGE,
        offset: off,
        ...(f.level !== 'all' && { level: f.level }),
        ...(f.vm_id !== 'all' && { vm_id: f.vm_id }),
        ...(f.search && { search: f.search }),
      });
      const { rows, total } = await api.get(`/logs?${qs}`);
      setTotal(total);
      setOffset(off);
      if (append) setLogs(prev => [...prev, ...rows]);
      else setLogs(rows);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  // Initial fetch + debounced re-fetch on search. Empty search triggers an
  // immediate fetch; non-empty waits 300 ms for the user to stop typing. This
  // single effect replaces the two competing fetches the original had.
  useEffect(() => {
    if (!filters.search) { fetchLogs(0); return; }
    const t = setTimeout(() => fetchLogs(0), 300);
    return () => clearTimeout(t);
  }, [filters.search, fetchLogs]);

  // Live crash banner refresh
  useEffect(() => on('CRASH', () => api.get('/logs/crashes').then(setCrashes).catch(() => {})), [on]);

  // Instant filter change for level/vm
  function setFilter(key, val) {
    setFilters(f => {
      const next = { ...f, [key]: val };
      filtersRef.current = next;
      return next;
    });
    if (key !== 'search') setTimeout(() => fetchLogs(0), 0);
  }

  // Live WebSocket feed — prepend new matching logs
  useEffect(() => {
    if (!liveMode) return;
    return on('ACTIVITY', (payload) => {
      const f = filtersRef.current;
      if (f.level !== 'all' && payload.level !== f.level) return;
      if (f.vm_id !== 'all' && payload.vmId !== f.vm_id) return;
      if (f.search && !payload.message?.toLowerCase().includes(f.search.toLowerCase())) return;
      setLogs(prev => [{
        id: `live-${payload.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        round_id: payload.roundId,
        vm_id: payload.vmId,
        vm_role: payload.vmRole,
        timestamp: payload.timestamp,
        level: payload.level,
        message: payload.message,
        vm_name: vms.find(v => v.id === payload.vmId)?.name || payload.vmId,
        _live: true,
      }, ...prev.slice(0, PAGE - 1)]);
      setTotal(t => t + 1);
    });
  }, [on, liveMode, vms]);

  const hasMore = offset + PAGE < total;

  return (
    <div className="page animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header flex items-center justify-between" style={{ marginBottom: 0 }}>
        <div>
          <h2>System Logs</h2>
          <p>All activity — relay, round events, flag submissions, and VM output</p>
        </div>
        <div className="flex gap-8 items-center">
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{total.toLocaleString()} entries</span>
          <button
            className={`btn btn-sm ${liveMode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setLiveMode(p => !p)}
          >
            {liveMode ? '● Live' : '○ Live'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => fetchLogs(0)}>↻ Refresh</button>
        </div>
      </div>

      {/* Crash Events Banner */}
      {crashes.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(255,56,96,0.4)', padding: '14px 18px' }}>
          <div className="flex items-center justify-between mb-16">
            <span style={{ color: 'var(--red)', fontFamily: 'var(--font-display)', fontSize: '0.85rem', letterSpacing: 1 }}>
              💥 CRASH EVENTS ({crashes.length})
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => api.get('/logs/crashes').then(setCrashes)}>↻</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {crashes.map(log => (
              <div key={log.id} style={{ background: 'rgba(255,56,96,0.06)', border: '1px solid rgba(255,56,96,0.2)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <div
                  className="flex items-center justify-between"
                  style={{ padding: '10px 14px', cursor: 'pointer' }}
                  onClick={() => setExpandedCrash(expandedCrash === log.id ? null : log.id)}
                >
                  <div className="flex items-center gap-12">
                    <span>💥</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        {log.vm_name || log.vm_id || 'Unknown VM'}
                        {log.round_id && <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', marginLeft: 10 }}>Round {log.round_id?.slice(0, 8).toUpperCase()}</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 2 }}>{log.error_msg}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-12">
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{fmtTime(log.timestamp)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{expandedCrash === log.id ? '▲' : '▼'}</span>
                  </div>
                </div>
                {expandedCrash === log.id && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,56,96,0.2)' }}>
                    {log.context && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '10px 0 6px' }}>{log.context}</div>}
                    <div className="terminal" style={{ height: 160 }}>
                      {(log.last_lines || '(no data)').split('\n').map((line, i) => (
                        <div key={i} style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>{line}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div className="flex gap-12 items-center" style={{ flexWrap: 'wrap' }}>
          {/* Level filter */}
          <div className="flex gap-6 items-center">
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Level</span>
            {LEVELS.map(l => (
              <button
                key={l}
                className={`btn btn-sm ${filters.level === l ? 'btn-primary' : 'btn-ghost'}`}
                style={filters.level !== l && l !== 'all' ? { color: LEVEL_COLOR[l] } : {}}
                onClick={() => setFilter('level', l)}
              >
                {l}
              </button>
            ))}
          </div>

          {/* VM filter */}
          <div className="flex gap-6 items-center">
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>VM</span>
            {['all', 'host', ...vms.map(v => v.id)].map(id => (
              <button
                key={id}
                className={`btn btn-sm ${filters.vm_id === id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilter('vm_id', id)}
              >
                {id === 'all' ? 'All' : id === 'host' ? '🖥️ Host' : vms.find(v => v.id === id)?.name || id}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            className="form-input"
            style={{ marginLeft: 'auto', width: 220, padding: '6px 10px', fontSize: '0.78rem' }}
            placeholder="Search messages…"
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
          />
        </div>
      </div>

      {/* Log table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="terminal" style={{ height: 540, borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
          {loading && logs.length === 0 && (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>Loading…</div>
          )}
          {!loading && logs.length === 0 && (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>No logs match the current filters.</div>
          )}
          {logs.map((log, i) => (
            <div
              key={log.id ?? i}
              className={`log-line ${LEVEL_CLASS[log.level] || 'log-info'}`}
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 3, marginBottom: 3 }}
            >
              <span className="log-ts" style={{ minWidth: 140 }}>{fmtTime(log.timestamp)}</span>
              <span style={{
                fontSize: '0.62rem', fontFamily: 'var(--font-mono)',
                color: log.vm_role === 'attacker' ? 'var(--red)' : log.vm_role === 'defender' ? 'var(--blue)' : 'var(--text-muted)',
                minWidth: 72, textTransform: 'uppercase',
              }}>
                [{log.vm_role || 'sys'}]
              </span>
              <span style={{
                fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                minWidth: 90, opacity: 0.7,
              }}>
                {log.vm_name || log.vm_id || '—'}
              </span>
              <span style={{
                fontSize: '0.62rem', minWidth: 60, fontFamily: 'var(--font-mono)',
                color: LEVEL_COLOR[log.level] || 'var(--text-muted)',
                textTransform: 'uppercase',
              }}>
                {log.level}
              </span>
              <span className="log-msg">{log.message}</span>
              {log._live && (
                <span style={{ fontSize: '0.55rem', color: 'var(--green)', marginLeft: 6, flexShrink: 0 }}>● live</span>
              )}
            </div>
          ))}

          {hasMore && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => fetchLogs(offset + PAGE, true)}
                disabled={loading}
              >
                {loading ? 'Loading…' : `Load more (${total - offset - PAGE} remaining)`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats footer */}
      <div className="grid-4">
        {['info', 'warn', 'error', 'attack'].map(lvl => {
          const count = logs.filter(l => l.level === lvl).length;
          return (
            <div key={lvl} className="stat-chip">
              <span className="stat-val" style={{ color: LEVEL_COLOR[lvl] }}>{count}</span>
              <span className="stat-label">{lvl} (this page)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
