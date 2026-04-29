import { useEffect, useState, useCallback, useRef } from 'react';
import { useWs } from '../hooks/useWebSocket.jsx';
import { api } from '../utils.jsx';
import LiveFeed from '../components/LiveFeed.jsx';

export default function Health() {
  const { on } = useWs();
  const [vms, setVms] = useState([]);
  const [logsHost, setLogsHost] = useState([]);
  const [logsA, setLogsA] = useState([]);
  const [logsB, setLogsB] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const vmsRef = useRef([]);

  const fetchData = useCallback(async () => {
    try {
      const [v, { rows: l }] = await Promise.all([
        api.get('/vms'),
        api.get('/logs?round_id=health-check&limit=500')
      ]);
      setVms(v);
      vmsRef.current = v;
      const sortedLogs = l.reverse();
      
      setLogsHost(sortedLogs.filter(x => x.vm_id === 'host'));
      
      const vmA = v.find(x => x.role === 'defender');
      const vmB = v.find(x => x.role === 'attacker');
      
      if (vmA) setLogsA(sortedLogs.filter(x => x.vm_id === vmA.id));
      if (vmB) setLogsB(sortedLogs.filter(x => x.vm_id === vmB.id));
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const off = on('ACTIVITY', (payload) => {
      if (payload.roundId === 'health-check') {
        if (payload.vmId === 'host') {
          setLogsHost(p => [...p, payload]);
        } else {
          // Check if it's VM A or B
          const vmA = vmsRef.current.find(x => x.role === 'defender');
          const vmB = vmsRef.current.find(x => x.role === 'attacker');
          
          if (vmA && payload.vmId === vmA.id) setLogsA(p => [...p, payload]);
          if (vmB && payload.vmId === vmB.id) setLogsB(p => [...p, payload]);
        }
      }
    });
    return off;
  }, [on]);

  async function runHealthTest() {
    setLoading(true);
    setResults(null);
    try {
      const res = await api.post('/health-check/run-test');
      setResults(res.results);
    } catch (e) {
      alert('Health test failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  const vmA = vms.find(x => x.role === 'defender');
  const vmB = vms.find(x => x.role === 'attacker');

  return (
    <div className="page animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="page-header flex items-center justify-between" style={{ marginBottom: 0 }}>
        <div>
          <h2>System Health Check</h2>
          <p>Verify connectivity and OpenClaw execution on all VMs</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={runHealthTest} disabled={loading}>
          {loading ? '⏳ Running Test...' : '⚡ Run Health Test'}
        </button>
      </div>

      {results && (
        <div className="grid-2">
          {results.map(r => (
            <div key={r.id} className={`card ${r.status === 'success' ? 'border-green' : 'border-red'}`} style={{ padding: '16px 20px' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>IP: {vms.find(v => v.id === r.id)?.ip || 'N/A'}</div>
                </div>
                <div className={`badge ${r.status === 'success' ? 'badge-green' : 'badge-red'}`}>
                  {r.status === 'success' ? 'SUCCESS' : 'FAILED'}
                </div>
              </div>
              {r.error && (
                <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--red)', fontFamily: 'var(--font-mono)', background: 'rgba(255,56,96,0.05)', padding: '6px 10px', borderRadius: 6 }}>
                  Error: {r.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid-3" style={{ flex: 1, minHeight: 450 }}>
        <LiveFeed 
          logs={logsHost} 
          title="🖥️ Main Host Feed" 
          accentClass=""
        />
        <LiveFeed 
          logs={logsA} 
          title={`🛡️ ${vmA?.name || 'Defender'} Feed`} 
          accentClass="vm-panel-defender"
        />
        <LiveFeed 
          logs={logsB} 
          title={`⚔️ ${vmB?.name || 'Attacker'} Feed`} 
          accentClass="vm-panel-attacker"
        />
      </div>
    </div>
  );
}
