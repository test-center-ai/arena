import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils.jsx';

const STATUS_ICON = { pass: '✅', fail: '❌', warn: '⚠️', skip: '⏭️', checking: '⏳' };
const STATUS_COLOR = { pass: 'var(--green)', fail: 'var(--red)', warn: 'var(--yellow)', skip: 'var(--text-muted)', checking: 'var(--blue)' };

function CheckRow({ check, index, expanded, onToggle, onDeploy, deploying }) {
  const color = STATUS_COLOR[check.status] || 'var(--text-muted)';
  const icon = STATUS_ICON[check.status] || '⏳';

  return (
    <div style={{
      border: `1px solid ${check.status === 'fail' ? 'rgba(255,56,96,0.3)' : check.status === 'warn' ? 'rgba(255,224,102,0.3)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', marginBottom: 8,
      background: check.status === 'fail' ? 'rgba(255,56,96,0.04)' : check.status === 'pass' ? 'rgba(0,255,163,0.03)' : 'var(--bg-card)',
      overflow: 'hidden',
    }}>
      {/* Row header */}
      <div
        className="flex items-center gap-12"
        style={{ padding: '14px 16px', cursor: check.status !== 'pass' ? 'pointer' : 'default' }}
        onClick={() => check.status !== 'pass' && onToggle(check.id)}
      >
        <span style={{ fontSize: '1rem', width: 24, textAlign: 'center' }}>{icon}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 20, fontFamily: 'var(--font-mono)' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{check.label}</div>
          <div style={{ fontSize: '0.72rem', color, marginTop: 2, fontFamily: 'var(--font-mono)' }}>{check.detail}</div>
        </div>
        {check.status !== 'pass' && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {expanded ? '▲ hide fix' : '▼ show fix'}
          </span>
        )}
        {check.fixLink && check.status !== 'pass' && (
          <a href={check.fixLink} className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }}>
            → Go fix
          </a>
        )}
      </div>

      {/* Fix instructions — expandable */}
      {expanded && check.fix && (
        <div style={{
          padding: '0 16px 16px 56px',
          borderTop: '1px solid var(--border)',
          paddingTop: 14,
        }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' }}>
            📋 What to do:
          </div>
          <pre style={{
            background: '#030508', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '12px 14px',
            fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
            color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
            lineHeight: 1.8,
          }}>
            {check.fix}
          </pre>
          {(check.id === 'relay_a' || check.id === 'relay_b') && (
            <div style={{ marginTop: 12 }}>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => onDeploy(check.vmId)}
                disabled={deploying[check.vmId]}
              >
                {deploying[check.vmId] ? '⏳ Deploying Agent...' : '🚀 Auto-Deploy Agent'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ onSave }) {
  const [form, setForm] = useState({ hypervisor: 'kvm', net_interface: '', host_ip: '', rec_enabled: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings').then(s => {
      if (s) setForm({ hypervisor: s.hypervisor || 'kvm', net_interface: s.net_interface || '', host_ip: s.host_ip || '', rec_enabled: !!s.rec_enabled });
    }).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.put('/settings', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSave();
    } finally { setSaving(false); }
  }

  async function autoDetect() {
    setSaving(true);
    try {
      const data = await api.get('/deploy/autodetect');
      if (data.success) {
        setForm(f => ({
          ...f,
          host_ip: data.hostIp || f.host_ip,
          net_interface: data.netInterface || f.net_interface
        }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error(e);
      alert('Auto-detect failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title flex items-center justify-between">
        <span>⚙️ Arena Settings</span>
        <button className="btn btn-ghost btn-sm" onClick={autoDetect} disabled={saving}>
          ⚡ Auto-Detect
        </button>
      </div>
      <div className="grid-2 gap-16" style={{ marginBottom: 16 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Hypervisor</label>
          <select className="form-select" value={form.hypervisor} onChange={e => set('hypervisor', e.target.value)}>
            <option value="kvm">KVM / QEMU (virsh)</option>
            <option value="virtualbox">VirtualBox (VBoxManage)</option>
            <option value="vmware">VMware (vmrun)</option>
          </select>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            {form.hypervisor === 'kvm' && 'Run: virsh list --all to get domain names'}
            {form.hypervisor === 'virtualbox' && 'Run: VBoxManage list vms to get VM names'}
            {form.hypervisor === 'vmware' && 'Use the full path to the .vmx file as VM name'}
          </span>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Host IP (your Ubuntu machine's LAN IP)</label>
          <input className="form-input" placeholder="e.g. 192.168.1.50" value={form.host_ip} onChange={e => set('host_ip', e.target.value)} />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            Run: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>{"ip route get 1 | awk '{print $7}'"}</code>
          </span>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Network Interface for Traffic Capture</label>
          <input className="form-input" placeholder="e.g. virbr0, br0, eth0" value={form.net_interface} onChange={e => set('net_interface', e.target.value)} />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            Run: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>ip link show</code> — use the bridge/interface connecting the VMs
          </span>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Auto-Recording</label>
          <div className="flex items-center gap-12" style={{ marginTop: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.rec_enabled} onChange={e => set('rec_enabled', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--blue)' }} />
              <span style={{ fontSize: '0.82rem' }}>Enable auto screen recording + network capture each round</span>
            </label>
          </div>
          {form.rec_enabled && (
            <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Recordings saved to: <code style={{ color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>backend/data/recordings/&lt;round-id&gt;/</code>
            </div>
          )}
        </div>
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

export default function PreflightCheck() {
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [deploying, setDeploying] = useState({});

  const runChecks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/preflight');
      setResult(data);
      // Auto-expand all failed checks
      const exp = {};
      data.checks.forEach(c => { if (c.status === 'fail') exp[c.id] = true; });
      setExpanded(exp);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { runChecks(); }, [runChecks]);

  function toggleExpand(id) { setExpanded(p => ({ ...p, [id]: !p[id] })); }

  async function deployAgent(vmId) {
    if (!vmId) return;
    setDeploying(p => ({ ...p, [vmId]: true }));
    try {
      const res = await api.post(`/deploy/${vmId}/deploy-agent`);
      alert('Success: ' + res.message);
      runChecks();
    } catch (e) {
      alert('Deployment failed: ' + e.message);
    } finally {
      setDeploying(p => ({ ...p, [vmId]: false }));
    }
  }

  const passCount = result?.checks.filter(c => c.status === 'pass').length || 0;
  const total = result?.checks.length || 0;

  return (
    <div className="page animate-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h2>Pre-Round Checklist</h2>
          <p>Run all checks before starting a round — follow fix instructions for anything that fails</p>
        </div>
        <button className="btn btn-ghost" onClick={runChecks} disabled={loading}>
          {loading ? '⏳ Checking…' : '↻ Recheck All'}
        </button>
      </div>

      {/* Settings first */}
      <SettingsPanel onSave={runChecks} />

      {/* Progress bar */}
      {result && (
        <div style={{ marginBottom: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {passCount}/{total} checks passing
            </span>
            <div className="flex gap-12">
              {result.criticalFails > 0 && <span className="badge badge-red">❌ {result.criticalFails} critical</span>}
              {result.warnings > 0 && <span className="badge badge-yellow">⚠️ {result.warnings} warnings</span>}
              {result.ready && <span className="badge badge-green">✅ Ready to launch</span>}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 6, transition: 'width 0.5s ease',
              width: `${(passCount / total) * 100}%`,
              background: result.ready ? 'var(--green)' : result.criticalFails > 0 ? 'var(--red)' : 'var(--yellow)',
            }} />
          </div>
        </div>
      )}

      {/* Checks list */}
      {loading && !result && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          ⏳ Running checks…
        </div>
      )}

      {result?.checks.map((check, i) => (
        <CheckRow
          key={check.id} check={check} index={i}
          expanded={!!expanded[check.id]}
          onToggle={toggleExpand}
          onDeploy={deployAgent}
          deploying={deploying}
        />
      ))}

      {/* Launch button */}
      {result && (
        <div className="flex items-center gap-12 mt-24" style={{ justifyContent: 'center' }}>
          {result.ready ? (
            <button className="btn btn-start btn-lg" onClick={() => navigate('/round-control')}>
              ⚔️ All Clear — Configure Round
            </button>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <button className="btn btn-start btn-lg" style={{ opacity: 0.4, cursor: 'not-allowed', animation: 'none', boxShadow: 'none' }} disabled>
                ⚔️ Fix Issues First
              </button>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                {result.criticalFails} critical issue{result.criticalFails !== 1 ? 's' : ''} must be resolved
              </div>
            </div>
          )}
          <button className="btn btn-ghost" onClick={() => navigate('/')}>Skip to Arena</button>
        </div>
      )}
    </div>
  );
}
