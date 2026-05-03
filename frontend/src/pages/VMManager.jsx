import { useEffect, useState } from 'react';
import { api, statusBadge, VMLights } from '../utils.jsx';
import { useWs } from '../hooks/useWebSocket.jsx';

function ProgressBar({ label, percent, color }) {
  const p = Math.max(0, Math.min(100, isNaN(percent) ? 0 : percent));
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="flex items-center justify-between" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 2 }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
        <span>{p.toFixed(1)}%</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

function VMCard({ vm, onAction, onEdit, stats }) {
  const [loading, setLoading] = useState('');

  async function action(act) {
    setLoading(act);
    try { await api.post(`/vms/${vm.id}/${act}`, {}); onAction(); }
    finally { setLoading(''); }
  }

  const isRunning = vm.status === 'running';

  return (
    <div className={`card ${vm.role === 'attacker' ? 'vm-panel-attacker' : 'vm-panel-defender'}`}>
      <div className="flex items-center justify-between mb-16">
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', letterSpacing: 1 }}>
            {vm.role === 'attacker' ? '⚔️' : '🛡️'} {vm.name}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{vm.os}</div>
        </div>
        <div className="flex items-center gap-16">
          <VMLights vm={vm} />
          {statusBadge(vm.status)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
        {[
          ['IP Address', vm.ip || '—'],
          ['Virsh Name', vm.virsh_name || '—'],
          ['Model', vm.model_name],
          ['RAM', `${vm.ram_gb} GB`],
          ['CPU Cores', vm.cpu_cores],
          ['Disk', `${vm.disk_gb} GB`],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{val}</div>
          </div>
        ))}
      </div>

      {isRunning && stats && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 6, marginBottom: 16 }}>
          <ProgressBar label="CPU Usage" percent={stats.cpu} color="var(--blue)" />
          <ProgressBar label="RAM Usage" percent={stats.ram} color="var(--yellow)" />
          <div className="flex justify-between" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 }}>
            <span>Network Rx: {(stats.rxMbps || 0).toFixed(2)} Mbps</span>
            <span>Tx: {(stats.txMbps || 0).toFixed(2)} Mbps</span>
          </div>
        </div>
      )}

      <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
        {!isRunning && (
          <button className="btn btn-success btn-sm" onClick={() => action('start')} disabled={!!loading}>
            {loading === 'start' ? '…' : '▶ Start'}
          </button>
        )}
        {isRunning && (
          <button className="btn btn-ghost btn-sm" onClick={() => action('stop')} disabled={!!loading}>
            {loading === 'stop' ? '…' : '⏹ Stop'}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => action('restart')} disabled={!!loading}>
          {loading === 'restart' ? '…' : '↺ Restart'}
        </button>
        {isRunning && (
          <button className="btn btn-ghost btn-sm" onClick={() => action('force-stop')} disabled={!!loading}>
            {loading === 'force-stop' ? '…' : '⚡ Force Stop'}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => action('snapshot')} disabled={!!loading}>
          {loading === 'snapshot' ? '…' : '📸 Snapshot'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => action('revert')} disabled={!!loading}>
          {loading === 'revert' ? '…' : '⏪ Revert'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(vm)}>
          ✏️ Edit
        </button>
        {isRunning && (
          <button className="btn btn-primary btn-sm" onClick={() => onAction('view', vm)}>
            🖥️ View Console
          </button>
        )}
        {isRunning && (
          <button className="btn btn-success btn-sm" onClick={() => action('view-local')} disabled={!!loading}>
            {loading === 'view-local' ? '…' : '🎮 Remote Control'}
          </button>
        )}
      </div>
    </div>
  );
}

function EditModal({ vm, onClose, onSave }) {
  const [form, setForm] = useState({ ...vm });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/vms/${vm.id}`, form);
      onSave();
      onClose();
    } finally { setSaving(false); }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Edit VM — {vm.name}</div>
        {[
          ['VM Name', 'name', 'text'],
          ['IP Address', 'ip', 'text'],
          ['Virsh Domain Name', 'virsh_name', 'text'],
          ['Active Model Name', 'model_name', 'text'],
          ['RAM (GB)', 'ram_gb', 'number'],
          ['CPU Cores', 'cpu_cores', 'number'],
          ['Disk (GB)', 'disk_gb', 'number'],
        ].map(([label, key, type]) => (
          <div className="form-group" key={key}>
            <label className="form-label">{label}</label>
            <input className="form-input" type={type} value={form[key] || ''} onChange={e => set(key, type === 'number' ? +e.target.value : e.target.value)} />
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsoleModal({ vm, onClose }) {
  const [timestamp, setTimestamp] = useState(Date.now());
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setTimestamp(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const screenshotUrl = `/api/vms/${vm.id}/screenshot?t=${timestamp}`;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '90vw', width: 1024 }}>
        <div className="modal-title flex justify-between items-center">
          <span>Live Console — {vm.name}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Refreshing every 5s</span>
        </div>
        
        <div style={{ background: '#000', borderRadius: 8, overflow: 'hidden', minHeight: 400, position: 'relative', border: '1px solid var(--border)' }}>
          {error ? (
            <div className="flex items-center justify-center h-full text-danger" style={{ padding: 40 }}>
              {error}
            </div>
          ) : (
            <img 
              src={screenshotUrl} 
              alt="VM Console" 
              style={{ width: '100%', display: 'block' }}
              onError={() => setError('Failed to capture screenshot. Is the VM still booting?')}
              onLoad={() => setError(null)}
            />
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => setTimestamp(Date.now())}>Force Refresh</button>
        </div>
      </div>
    </div>
  );
}

export default function VMManager() {
  const { on } = useWs();
  const [vms, setVms] = useState([]);
  const [editVm, setEditVm] = useState(null);
  const [viewVm, setViewVm] = useState(null);
  const [vmStats, setVmStats] = useState({});

  useEffect(() => {
    return on('VM_STATS', (payload) => {
      setVmStats(prev => ({ ...prev, [payload.vmId]: payload }));
    });
  }, [on]);

  async function load() {
    const data = await api.get('/vms');
    setVms(data);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="page animate-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h2>VM Manager</h2>
          <p>Control virtual machines — start, stop, snapshot, and edit settings</p>
        </div>
        <button className="btn btn-ghost" onClick={load}>↻ Refresh</button>
      </div>

      <div className="grid-2 gap-20">
        {vms.map(vm => (
          <VMCard key={vm.id} vm={vm} onAction={(type, v) => type === 'view' ? setViewVm(v) : load()} onEdit={setEditVm} stats={vmStats[vm.id]} />
        ))}
      </div>

      {/* Quick tips */}
      <div className="card mt-24">
        <div className="card-title">⚡ Quick Guide — Swapping Models</div>
        <ol style={{ paddingLeft: 20, lineHeight: 2, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          <li>Go into the VM (console/RDP) and open OpenClaw settings</li>
          <li>Change the model API key and model name in OpenClaw config</li>
          <li>Restart OpenClaw inside the VM</li>
          <li>Come back here → click <strong>Edit</strong> on the VM → update <em>Active Model Name</em></li>
          <li>On Round Setup page, confirm model labels before starting</li>
        </ol>
      </div>

      {editVm && <EditModal vm={editVm} onClose={() => setEditVm(null)} onSave={load} />}
      {viewVm && <ConsoleModal vm={viewVm} onClose={() => setViewVm(null)} />}
    </div>
  );
}
