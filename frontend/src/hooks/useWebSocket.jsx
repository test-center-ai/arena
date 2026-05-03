import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const WsContext = createContext(null);

export function WsProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const listeners = useRef({});

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsHost = window.location.port === '9010' ? `${window.location.hostname}:9020` : window.location.host;
      const ws = new WebSocket(`${protocol}://${wsHost}/ws`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000); // auto-reconnect
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          setMessages(prev => [...prev.slice(-500), msg]);
          const handlers = listeners.current[msg.type] || [];
          handlers.forEach(fn => fn(msg.payload));
        } catch {}
      };
    }
    connect();
    return () => wsRef.current?.close();
  }, []);

  const on = useCallback((type, fn) => {
    listeners.current[type] = [...(listeners.current[type] || []), fn];
    return () => {
      listeners.current[type] = (listeners.current[type] || []).filter(f => f !== fn);
    };
  }, []);

  return (
    <WsContext.Provider value={{ connected, messages, on }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWs() { return useContext(WsContext); }
