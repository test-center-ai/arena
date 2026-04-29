import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtTime, fmtDuration, winnerBadge, statusBadge } from '../utils.jsx';

export default function Results() {
  const [rounds, setRounds] = useState([]);
  const navigate = useNavigate();

  useEffect(() => { api.get('/rounds').then(setRounds); }, []);

  const attackerWins = rounds.filter(r => r.winner === 'attacker').length;
  const defenderWins = rounds.filter(r => r.winner === 'defender').length;
  const total = rounds.filter(r => r.status === 'completed').length;

  return (
    <div className="page animate-in">
      <div className="page-header">
        <h2>Match Results</h2>
        <p>All completed rounds — click a row for full activity log</p>
      </div>

      <div className="grid-4 mb-16">
        <div className="stat-chip">
          <span className="stat-val">{total}</span>
          <span className="stat-label">Total Rounds</span>
        </div>
        <div className="stat-chip">
          <span className="stat-val text-red">{attackerWins}</span>
          <span className="stat-label">⚔️ Attacker Wins</span>
        </div>
        <div className="stat-chip">
          <span className="stat-val text-blue">{defenderWins}</span>
          <span className="stat-label">🛡️ Defender Wins</span>
        </div>
        <div className="stat-chip">
          <span className="stat-val">{total > 0 ? Math.round(attackerWins / total * 100) : 0}%</span>
          <span className="stat-label">Attack Success Rate</span>
        </div>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Round ID</th>
              <th>Status</th>
              <th>Winner</th>
              <th>⚔️ Attacker Model</th>
              <th>🛡️ Defender Model</th>
              <th>Duration</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {rounds.length === 0 && (
              <tr><td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>No rounds yet. Launch your first round!</td></tr>
            )}
            {rounds.map(r => (
              <tr key={r.id} className="clickable" onClick={() => navigate(`/results/${r.id}`)}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {r.id?.slice(0, 8).toUpperCase()}
                </td>
                <td>{statusBadge(r.status)}</td>
                <td>{winnerBadge(r.winner)}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{r.vm_b_model}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{r.vm_a_model}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  {r.start_time ? fmtDuration(r.start_time, r.end_time) : '—'}
                </td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{fmtTime(r.start_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
