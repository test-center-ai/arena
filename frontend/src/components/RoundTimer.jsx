import { useEffect, useState } from 'react';

export default function RoundTimer({ startTime, durationMins, running }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!running || !startTime) { setRemaining(null); return; }
    function calc() {
      const elapsed = (Date.now() - new Date(startTime).getTime()) / 1000;
      const totalSecs = durationMins * 60;
      setRemaining(Math.max(0, totalSecs - elapsed));
    }
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [startTime, durationMins, running]);

  if (remaining === null) {
    return (
      <div className="round-timer" style={{ fontSize: '2.2rem', color: 'var(--text-muted)' }}>
        --:--:--
      </div>
    );
  }

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = Math.floor(remaining % 60);
  const danger = remaining < 300; // last 5 mins

  return (
    <div className={`round-timer${danger ? ' danger' : ''}`}>
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </div>
  );
}
