/**
 * useSocket — React hook over a single, app-wide Socket.IO connection.
 *
 * Why a module-level singleton?
 *  - Every component that called this hook used to open its OWN WebSocket. With
 *    the notification listener, My Class and the notification bell mounted at
 *    once that was 3-4 sockets per tab, each authenticating and joining
 *    `user:<id>` separately, multiplying server-side fan-out for no benefit.
 *  - The connection is refcounted: it opens on the first subscriber and closes
 *    when the last one unmounts, so a logged-out app holds nothing open.
 *
 * Mobile behaviour:
 *  - Phone browsers freeze background tabs and silently drop the socket. On
 *    return to the foreground we check liveness and reconnect immediately
 *    rather than waiting out the back-off, so a student who switches apps
 *    mid-lesson does not come back to a dead feed.
 *
 * Features:
 *  - Authenticates using the JWT stored in localStorage; re-handshakes when
 *    that token changes (login, logout, token refresh).
 *  - Auto-reconnects with exponential back-off (1s → 8s cap).
 *  - `on(event, handler)` returns its own unsubscribe function, so it drops
 *    straight into a useEffect cleanup.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

// Resolve the Socket.IO server URL from environment variables, falling back
// to the current origin in production or localhost in development.
const DEFAULT_URL = import.meta.env.VITE_SOCKET_URL
  || (import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
    : (import.meta.env.PROD ? window.location.origin : 'http://localhost:5000'));

const TOKEN_KEY = 'topkorbo_token';

let sharedSocket = null;
let sharedToken = null;
let refCount = 0;
let teardownTimer = null;
// Components that want to be told when the connection state flips.
const stateSubscribers = new Set();

function broadcastState(connected) {
  stateSubscribers.forEach((notifyOne) => {
    try {
      notifyOne(connected);
    } catch {
      // A subscriber throwing must not stop the rest from being told.
    }
  });
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    // Private-mode / blocked storage: connect anonymously rather than crash.
    return '';
  }
}

function teardownShared() {
  if (!sharedSocket) return;
  sharedSocket.removeAllListeners();
  sharedSocket.disconnect();
  sharedSocket = null;
  sharedToken = null;
}

function ensureSocket() {
  const token = readToken();

  // A changed token means a different identity — the old socket is in the wrong
  // room and must be replaced rather than reused.
  if (sharedSocket && sharedToken !== token) {
    teardownShared();
  }

  if (!sharedSocket) {
    sharedToken = token;
    sharedSocket = io(DEFAULT_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 15000
    });

    sharedSocket.on('connect', () => broadcastState(true));
    sharedSocket.on('disconnect', () => broadcastState(false));
    sharedSocket.on('connect_error', () => broadcastState(false));
  }

  return sharedSocket;
}

/**
 * Phone browsers suspend background tabs and kill the socket without firing a
 * clean disconnect. Nudge it the moment the tab is visible again.
 */
function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  if (sharedSocket && !sharedSocket.connected) {
    sharedSocket.connect();
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleVisibilityChange);
}

export default function useSocket() {
  // Seeded from module state so a component mounting into an already-live
  // connection sees it on its first render. Later transitions arrive through
  // the subscription below rather than a setState in the effect body, which
  // would force an extra render pass on every mount.
  const [connected, setConnected] = useState(() => Boolean(sharedSocket?.connected));
  const [socket, setSocket] = useState(() => (sharedSocket?.connected ? sharedSocket : null));
  const socketRef = useRef(sharedSocket);

  useEffect(() => {
    refCount += 1;
    if (teardownTimer) {
      clearTimeout(teardownTimer);
      teardownTimer = null;
    }
    socketRef.current = ensureSocket();

    const onStateChange = (isConnected) => {
      // The shared socket may have been swapped out (token change); re-read it.
      socketRef.current = sharedSocket;
      setSocket(isConnected ? sharedSocket : null);
      setConnected(isConnected);
    };
    stateSubscribers.add(onStateChange);

    return () => {
      stateSubscribers.delete(onStateChange);
      refCount -= 1;
      socketRef.current = null;

      // Last consumer out closes the connection — but only after a beat. A route
      // change unmounts the old page before mounting the new one, and tearing
      // down in that gap would drop and re-handshake the socket on every
      // navigation. StrictMode double-mounting is absorbed the same way.
      if (refCount <= 0) {
        refCount = 0;
        if (teardownTimer) clearTimeout(teardownTimer);
        teardownTimer = setTimeout(() => {
          teardownTimer = null;
          if (refCount <= 0) teardownShared();
        }, 1000);
      }
    };
  }, []);

  // Subscribe to a socket event and return an unsubscribe function.
  // This mirrors React's useEffect cleanup pattern — call it directly inside
  // a useEffect to automatically clean up on re-render or unmount.
  const on = useCallback((event, handler) => {
    const active = socketRef.current || sharedSocket;
    if (!active) return () => {};
    active.on(event, handler);
    return () => active.off(event, handler);
  }, []);

  // Emit an event to the server. No-op if the socket is not connected yet.
  const emit = useCallback((event, payload) => {
    const active = socketRef.current || sharedSocket;
    if (!active) return;
    active.emit(event, payload);
  }, []);

  return { socket, connected, on, emit };
}
