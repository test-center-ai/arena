import { useEffect, useState, useCallback, useRef } from 'react';
import { useWs } from '../hooks/useWebSocket.jsx';
import { api, fmtTime, fmtDuration, statusBadge, VMLights } from '../utils.jsx';
import LiveFeed from '../components/LiveFeed.jsx';
import RoundTimer from '../components/RoundTimer.jsx';

export default function Arena() {
  const { messages, on } = useWs();
  const [round, setRound] = useState(null);
  const [vms, setVms] = useState([]);
  const [logsA, setLogsA] = useState([]);
  const [logsB, setLogsB] = useState([]);
  const [loading, setLoading] = useState(false);
  const [roundResult, setRoundResult] = useState(null);
  const [hasStuckRound, setHasStuckRound] = useState(false);
  const vmsRef = useRef([]);

  const fetchActive = useCallback(async () => {
    try {
      const [r, v] = await Promise.all([api.get('/rounds/active'), api.get('/vms')]);
      setRound(r);
      setVms(v);
      vmsRef.current = v;
      if (r) {
        const { rows: logs } = await api.get(`/logs?round_id=${r.id}&limit=200`);
        const vmA = v.find(x => x.role === 'defender');
        const vmB = v.find(x => x.role === 'attacker');
        setLogsA(logs.filter(l => l.vm_id === vmA?.id).reverse());
        setLogsB(logs.filter(l => l.vm_id === vmB?.id).reverse());
      }
      const stuckInfo = await api.get('/rounds/stuck');
      setHasStuckRound(!r && stuckInfo.inDb?.length > 0);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchActive(); }, [fetchActive]);

  useEffect(() => {
    const off1 = on('ROUND_START', () => fetchActive());
    const off2 = on('ROUND_END', (payload) => {
      setRoundResult(payload);
      fetchActive();
    });
    const off3 = on('ACTIVITY', (payload) => {
      const vmA = vmsRef.current.find(x => x.role === 'defender');
      const vmB = vmsRef.current.find(x => x.role === 'attacker');
      if (payload.vmId === vmA?.id) setLogsA(p => [...p, payload]);
      if (payload.vmId === vmB?.id) setLogsB(p => [...p, payload]);
    });
    return () => { off1(); off2(); off3(); };
  }, [on, fetchActive]);

  const vmA = vms.find(x => x.role === 'defender');
  const vmB = vms.find(x => x.role === 'attacker');
  const isRunning = round?.status === 'running';

  async function endRound(winner) {
    if (!round) return;
    setLoading(true);
    try { await api.post(`/rounds/${round.id}/end`, { winner }); }
    finally { setLoading(false); }
  }

  return (
    <div className="page animate-in">
      {/* Result Banner */}
      {roundResult && (
        <div style={{
          padding: '16px 24px', marginBottom: 24, borderRadius: 'var(--radius-lg)',
          background: roundResult.winner === 'attacker' ? 'var(--red-dim)' : 'var(--blue-dim)',
          border: `1px solid ${roundResult.winner === 'attacker' ? 'var(--red)' : 'var(--blue)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)', letterSpacing: 1 }}>
              {roundResult.winner === 'attacker' ? '🏴 FLAG CAPTURED — Attacker Wins!' : '🛡️ TIME EXPIRED — Defender Wins!'}
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setRoundResult(null)}>Dismiss</button>
        </div>
      )}

      {/* Top Stats Row */}
      <div className="grid-4 mb-16">
        <div className="stat-chip">
          <span className="stat-val" style={{ color: 'var(--blue)' }}>
            {isRunning ? 'LIVE' : 'IDLE'}
          </span>
          <span className="stat-label">Arena Status</span>
        </div>
        <div className="stat-chip">
          <span className="stat-val" style={{ color: 'var(--text-primary)', fontSize: '1rem', fontFamily: 'var(--font-mono)' }}>
            {vmA?.model_name || '—'}
          </span>
          <span className="stat-label">🛡️ Defender Model</span>
        </div>
        <div className="stat-chip">
          <span className="stat-val" style={{ color: 'var(--text-primary)', fontSize: '1rem', fontFamily: 'var(--font-mono)' }}>
            {vmB?.model_name || '—'}
          </span>
          <span className="stat-label">⚔️ Attacker Model</span>
        </div>
        <div className="stat-chip">
          <span className="stat-val">{isRunning ? fmtDuration(round?.start_time) : '—'}</span>
          <span className="stat-label">Elapsed Time</span>
        </div>
      </div>

      {/* Timer + Control */}
      <div className="card mb-16" style={{ textAlign: 'center', padding: '28px 20px' }}>
        <div className="card-title" style={{ marginBottom: 12 }}>
          {isRunning ? `ROUND IN PROGRESS — ${round?.id?.slice(0, 8).toUpperCase()}` : 'NO ACTIVE ROUND'}
        </div>
        <RoundTimer
          startTime={round?.start_time}
          durationMins={round?.duration_mins || 60}
          running={isRunning}
        />
        {isRunning && (
          <div className="flex items-center gap-12 mt-24" style={{ justifyContent: 'center' }}>
            <button className="btn btn-danger" onClick={() => endRound('attacker')} disabled={loading}>
              🏴 Force Attacker Win
            </button>
            <button className="btn btn-primary" onClick={() => endRound('defender')} disabled={loading}>
              🛡️ Force Defender Win
            </button>
            <button className="btn btn-ghost" onClick={() => endRound('void')} disabled={loading}>
              ∅ Void Round
            </button>
          </div>
        )}
        {!isRunning && !hasStuckRound && (
          <div className="mt-24">
            <a href="/round-control" className="btn btn-start">⚔️ START NEW ROUND</a>
          </div>
        )}
        {!isRunning && hasStuckRound && (
          <div className="mt-24" style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--yellow)', fontSize: '0.85rem', marginBottom: 12 }}>
              ⚠️ A round is stuck in "running" state from a previous session. Clear it first.
            </div>
            <div className="flex gap-12" style={{ justifyContent: 'center' }}>
              <button className="btn btn-danger" onClick={async () => {
                try {
                  await api.post('/rounds/clear-stuck');
                  setHasStuckRound(false);
                  fetchActive();
                } catch (e) { console.error(e); }
              }}>
                🗑️ Clear Stuck Round
              </button>
              <a href="/round-control" className="btn btn-ghost">Cancel</a>
            </div>
          </div>
        )}
      </div>

      {/* Live Dual Feed */}
      <div className="vs-panel" style={{ flex: 1 }}>
        <LiveFeed
          logs={logsA}
          title={`🛡️ ${vmA?.name || 'VM Alpha'} — Defender (${vmA?.model_name || '?'})`}
          accentClass="vm-panel-defender"
        />
        <div className="vs-divider">VS</div>
        <LiveFeed
          logs={logsB}
          title={`⚔️ ${vmB?.name || 'VM Beta'} — Attacker (${vmB?.model_name || '?'})`}
          accentClass="vm-panel-attacker"
        />
      </div>

      {/* VM Status Footer */}
      <div className="grid-2 mt-16">
        {[vmA, vmB].map(vm => vm && (
          <div key={vm.id} className="card" style={{ padding: '14px 18px' }}>
            <div className="flex items-center justify-between">
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.84rem' }}>{vm.name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 10 }}>{vm.ip || 'No IP'}</span>
              </div>
              <div className="flex gap-16 items-center">
                <VMLights vm={vm} />
                <div className="flex gap-8 items-center">
                  {statusBadge(vm.status)}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{vm.os}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
