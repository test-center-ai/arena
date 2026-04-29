import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';

const levelClass = { info: 'log-info', warn: 'log-warn', error: 'log-error', success: 'log-success', attack: 'log-attack', defend: 'log-defend' };

function fmt(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
}

export default function LiveFeed({ logs = [], title, accentClass = '' }) {
  const endRef = useRef(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!paused && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, paused]);

  return (
    <div className={`card ${accentClass}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex items-center justify-between mb-16">
        <span className="card-title" style={{ margin: 0 }}>{title}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{logs.length} events</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPaused(p => !p)}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      </div>
      <div className="terminal" style={{ flex: 1 }}>
        {logs.length === 0 && (
          <div style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
            Waiting for activity…
          </div>
        )}
        {logs.map((log, i) => (
          <div key={i} className={`log-line ${levelClass[log.level] || 'log-info'}`}>
            <span className="log-ts">{fmt(log.timestamp)}</span>
            <span className="log-msg">{log.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
