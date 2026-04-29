import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, fmtTime, fmtDuration, winnerBadge } from '../utils.jsx';

const levelClass = { info: 'log-info', warn: 'log-warn', error: 'log-error', success: 'log-success', attack: 'log-attack', defend: 'log-defend' };

export default function RoundDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [round, setRound] = useState(null);
  const [filter, setFilter] = useState('all'); // all | attacker | defender

  useEffect(() => { api.get(`/rounds/${id}`).then(setRound); }, [id]);

  if (!round) return <div className="page" style={{ color: 'var(--text-muted)' }}>Loading…</div>;

  const logs = round.logs || [];
  const filtered = filter === 'all' ? logs : logs.filter(l => l.vm_role === filter);

  return (
    <div className="page animate-in">
      <div className="flex items-center gap-12 mb-16">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/results')}>← Back</button>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
          Round {round.id?.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* Round Summary */}
      <div className="grid-4 mb-16">
        <div className="stat-chip">
          {winnerBadge(round.winner)}
          <span className="stat-label">Result</span>
        </div>
        <div className="stat-chip">
          <span className="stat-val" style={{ fontSize: '1rem', fontFamily: 'var(--font-mono)' }}>{round.vm_b_model}</span>
          <span className="stat-label">⚔️ Attacker</span>
        </div>
        <div className="stat-chip">
          <span className="stat-val" style={{ fontSize: '1rem', fontFamily: 'var(--font-mono)' }}>{round.vm_a_model}</span>
          <span className="stat-label">🛡️ Defender</span>
        </div>
        <div className="stat-chip">
          <span className="stat-val">{fmtDuration(round.start_time, round.end_time)}</span>
          <span className="stat-label">Duration</span>
        </div>
      </div>

      <div className="card mb-16" style={{ padding: '14px 18px' }}>
        <div className="flex gap-16 items-center" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <span>Started: {fmtTime(round.start_time)}</span>
          <span>Ended: {fmtTime(round.end_time)}</span>
          <span>Flag Captured: <strong style={{ color: round.flag_captured ? 'var(--red)' : 'var(--green)' }}>{round.flag_captured ? 'YES' : 'NO'}</strong></span>
          <span>Duration Limit: {round.duration_mins}m</span>
        </div>
      </div>

      {/* Prompts */}
      <div className="grid-2 mb-16">
        <div className="card vm-panel-attacker">
          <div className="card-title" style={{ color: 'var(--red)' }}>⚔️ Attacker Prompt</div>
          <pre style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>{round.attacker_prompt}</pre>
        </div>
        <div className="card vm-panel-defender">
          <div className="card-title" style={{ color: 'var(--blue)' }}>🛡️ Defender Prompt</div>
          <pre style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>{round.defender_prompt}</pre>
        </div>
      </div>

      {/* Log viewer */}
      <div className="card">
        <div className="flex items-center justify-between mb-16">
          <div className="card-title" style={{ margin: 0 }}>Activity Log — {filtered.length} events</div>
          <div className="flex gap-8">
            {['all', 'attacker', 'defender'].map(f => (
              <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'attacker' ? '⚔️ Attacker' : '🛡️ Defender'}
              </button>
            ))}
          </div>
        </div>
        <div className="terminal" style={{ height: 500 }}>
          {filtered.map((log, i) => (
            <div key={i} className={`log-line ${levelClass[log.level] || 'log-info'}`}>
              <span className="log-ts">{fmtTime(log.timestamp)}</span>
              <span style={{ color: log.vm_role === 'attacker' ? 'var(--red)' : 'var(--blue)', fontSize: '0.65rem', minWidth: 60 }}>
                [{log.vm_role || 'sys'}]
              </span>
              <span className="log-msg">{log.message}</span>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No logs for this filter.</div>}
        </div>
      </div>
    </div>
  );
}
