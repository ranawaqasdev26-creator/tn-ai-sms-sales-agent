import { useEffect, useRef, useCallback, useState } from 'react';

type WSEvent = {
  event: string;
  data: unknown;
  timestamp: string;
};

export function useWebSocket(onEvent: (event: WSEvent) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    // Vercel serverless has no WebSocket — dashboard falls back to polling
    if (import.meta.env.PROD && !window.location.hostname.includes('localhost')) {
      setConnected(false);
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };
    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as WSEvent;
        onEventRef.current(parsed);
      } catch { /* ignore */ }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  return { connected };
}

