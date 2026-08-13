import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface WsNotification {
  id: string;
  event: string;
  data: any;
}

/**
 * useWebSocketNotifications
 *
 * Maintains a single WebSocket connection to /api/v1/ws/notifications/:token for
 * real-time push notifications. Features:
 *   - 30s heartbeat (ping/pong) to keep the connection alive.
 *   - Automatic reconnect with a 5s backoff after an unexpected close.
 *   - Pauses the connection when the tab is hidden and resumes on focus.
 *   - Keeps only the most recent 50 notifications in memory.
 */
export function useWebSocketNotifications() {
  const [notifications, setNotifications] = useState<WsNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();
  // Prevents scheduled reconnects/heartbeats from firing after unmount.
  const disposedRef = useRef(false);
  const { token } = useAuth();

  const connect = useCallback(() => {
    if (!token || disposedRef.current) return;

    // Close any existing connection before opening a new one.
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Determine WebSocket URL from the current page origin.
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/ws/notifications/${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (disposedRef.current) return;
      setConnected(true);
      // Start heartbeat
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'pong') return; // heartbeat response
        // Ensure every notification has a stable id for markRead-by-id.
        if (!msg.id) {
          const serverId = msg.data && typeof msg.data === 'object' ? msg.data.id : undefined;
          msg.id = serverId != null ? String(serverId) : crypto.randomUUID();
        }
        setNotifications((prev) => [msg, ...prev].slice(0, 50)); // keep last 50
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = undefined;
      }
      // Do not attempt to reconnect after the component has unmounted.
      if (disposedRef.current) return;
      // Reconnect after 5 seconds
      reconnectTimer.current = setTimeout(() => connect(), 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token]);

  useEffect(() => {
    disposedRef.current = false;
    if (token) {
      connect();
    }
    return () => {
      disposedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [token, connect]);

  // Pause when the tab is hidden, resume when visible again.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (wsRef.current) {
          wsRef.current.onclose = null;
          wsRef.current.close();
          wsRef.current = null;
          setConnected(false);
        }
      } else if (token && !disposedRef.current) {
        connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [token, connect]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  return { notifications, connected, markRead, clearAll };
}
