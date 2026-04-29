import { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { WsProvider } from './hooks/useWebSocket.jsx';
import Sidebar from './components/Sidebar.jsx';
import Arena from './pages/Arena.jsx';
import RoundControl from './pages/RoundControl.jsx';
import VMManager from './pages/VMManager.jsx';
import Results from './pages/Results.jsx';
import RoundDetail from './pages/RoundDetail.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import CrashLogs from './pages/CrashLogs.jsx';
import PreflightCheck from './pages/PreflightCheck.jsx';
import Health from './pages/Health.jsx';

const PAGE_TITLES = {
  '/': 'Live Arena',
  '/preflight': 'Pre-Round Checklist',
  '/round-control': 'Round Setup',
  '/vms': 'VM Manager',
  '/results': 'Results',
  '/leaderboard': 'Leaderboard',
  '/crash-logs': 'System Logs',
  '/health': 'System Health',
};

function TopBar() {
  const location = useLocation();
  const title = location.pathname.startsWith('/results/') && location.pathname.length > 9
    ? 'Round Detail'
    : (PAGE_TITLES[location.pathname] || 'Arena AI');
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="topbar">
      <span className="topbar-title">{title}</span>
      <div className="topbar-right">
        <span className="topbar-time">{time}</span>
      </div>
    </div>
  );
}


export default function App() {
  return (
    <WsProvider>
      <div className="app-shell">
        <Sidebar />
        <div className="main-content">
          <TopBar />
          <Routes>
            <Route path="/" element={<Arena />} />
            <Route path="/preflight" element={<PreflightCheck />} />
            <Route path="/round-control" element={<RoundControl />} />
            <Route path="/vms" element={<VMManager />} />
            <Route path="/results" element={<Results />} />
            <Route path="/results/:id" element={<RoundDetail />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/crash-logs" element={<CrashLogs />} />
            <Route path="/health" element={<Health />} />
          </Routes>
        </div>
      </div>
    </WsProvider>
  );
}
