import { NavLink, useLocation } from 'react-router-dom';
import { useWs } from '../hooks/useWebSocket.jsx';

const navItems = [
  { path: '/',              label: 'Live Arena',      icon: '⚔️',  section: 'COMMAND' },
  { path: '/preflight',     label: 'Pre-Round Check', icon: '✅',  section: null },
  { path: '/round-control', label: 'Round Setup',     icon: '⚙️',  section: null },
  { path: '/vms',           label: 'VM Manager',      icon: '🖥️',  section: 'INFRASTRUCTURE' },
  { path: '/results',       label: 'Results',         icon: '📊',  section: 'INTELLIGENCE' },
  { path: '/leaderboard',   label: 'Leaderboard',     icon: '🏆',  section: null },
  { path: '/crash-logs',    label: 'System Logs',     icon: '📋',  section: null },
  { path: '/health',        label: 'System Health',   icon: '🩺',  section: null },
];

export default function Sidebar() {
  const { connected } = useWs();
  const location = useLocation();

  let lastSection = null;
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>ARENA AI</h1>
        <p>CYBER BATTLE PLATFORM</p>
      </div>

      {navItems.map(item => {
        const showSection = item.section && item.section !== lastSection;
        if (item.section) lastSection = item.section;
        return (
          <div key={item.path}>
            {showSection && <div className="nav-section-label">{item.section}</div>}
            <NavLink
              to={item.path}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              end={item.path === '/'}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          </div>
        );
      })}

      <div className="sidebar-footer">
        <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
        <span className="sidebar-status-text">
          {connected ? 'Live connected' : 'Reconnecting…'}
        </span>
      </div>
    </aside>
  );
}
