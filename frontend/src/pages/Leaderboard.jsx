import { useEffect, useState } from 'react';
import { api } from '../utils.jsx';

export default function Leaderboard() {
  const [data, setData] = useState([]);

  useEffect(() => { api.get('/leaderboard').then(setData); }, []);

  const sorted = [...data].sort((a, b) => (b.atk_wins + b.def_wins) - (a.atk_wins + a.def_wins));

  function bar(pct, color) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6, width: '100%', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
    );
  }

  return (
    <div className="page animate-in">
      <div className="page-header">
        <h2>Model Leaderboard</h2>
        <p>Rankings based on all completed rounds — updated automatically after each match</p>
      </div>

      {data.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          No data yet. Complete some rounds to see rankings here.
        </div>
      )}

      {/* Top 3 podium */}
      {sorted.length >= 1 && (
        <div className="grid-3 mb-24">
          {[sorted[1], sorted[0], sorted[2]].map((m, i) => m && (
            <div key={m.model_name} className={`card ${i === 1 ? 'vm-panel-attacker' : ''}`} style={{
              textAlign: 'center', padding: '28px 20px',
              transform: i === 1 ? 'scale(1.04)' : 'scale(1)',
              borderColor: i === 1 ? 'var(--yellow)' : undefined,
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>{['🥈', '🥇', '🥉'][i]}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', letterSpacing: 1 }}>{m.model_name}</div>
              <div style={{ fontSize: '2rem', fontFamily: 'var(--font-display)', fontWeight: 900, margin: '12px 0', color: 'var(--yellow)' }}>
                {m.atk_wins + m.def_wins}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Wins</div>
            </div>
          ))}
        </div>
      )}

      {/* Full table */}
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Model</th>
              <th>Rounds</th>
              <th>⚔️ Atk Win Rate</th>
              <th>🛡️ Def Win Rate</th>
              <th>Atk W/L</th>
              <th>Def W/L</th>
              <th>Avg Capture</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, idx) => (
              <tr key={m.model_name}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>#{idx + 1}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{m.model_name}</td>
                <td>{m.total_rounds}</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--red)' }}>{m.atk_win_rate}%</span>
                    {bar(m.atk_win_rate, 'var(--red)')}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--blue)' }}>{m.def_win_rate}%</span>
                    {bar(m.def_win_rate, 'var(--blue)')}
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--green)' }}>{m.atk_wins}W</span>
                  <span style={{ color: 'var(--text-muted)' }}> / </span>
                  <span style={{ color: 'var(--red)' }}>{m.atk_losses}L</span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--green)' }}>{m.def_wins}W</span>
                  <span style={{ color: 'var(--text-muted)' }}> / </span>
                  <span style={{ color: 'var(--red)' }}>{m.def_losses}L</span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {m.avg_capture_secs > 0 ? `${Math.round(m.avg_capture_secs / 60)}m` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
