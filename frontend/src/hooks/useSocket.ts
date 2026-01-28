import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL, CONTACT_ID, STORAGE_KEY, SYNC_INTERVAL_MS } from '../constants';
import type { MessagePayload } from '../types';

function loadMessages(): MessagePayload[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function persistMessages(msgs: MessagePayload[]) {
  const filtered = msgs.filter((m) => m.body || m.mediaUrl);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<MessagePayload[]>(loadMessages);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket'],
      secure: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('qr', (qrCode: string) => {
      setQr(qrCode);
      setConnectionStatus('qr_received');
    });

    socket.on('authenticated', () => {
      setConnectionStatus('authenticated');
      setQr(null);
    });

    socket.on('loading', ({ percent, message }: { percent: number; message: string }) => {
      setConnectionStatus(`loading: ${message}`);
    });

    socket.on('ready', () => {
      setReady(true);
      setQr(null);
      setConnectionStatus('connected');
    });

    socket.on('disconnected', (data: { reason: string }) => {
      setReady(false);
      setConnectionStatus(`disconnected: ${data.reason}`);
    });

    socket.on('max_reconnect_reached', () => {
      setConnectionStatus('failed');
    });

    socket.on('message', (msg: MessagePayload) => {
      const from = msg.from || '';
      const to = msg.to || '';
      const isTarget =
        from === CONTACT_ID ||
        to === CONTACT_ID ||
        from === 'me' ||
        from === 'you';

      if (!isTarget) return;

      setMessages((prev) => {
        const exists = prev.some(
          (m) =>
            m.timestamp === msg.timestamp &&
            m.body === msg.body &&
            m.from === msg.from
        );
        if (exists) return prev;

        const updated = [...prev, msg];
        persistMessages(updated);
        return updated;
      });
    });

    return () => {
      socket.off('qr');
      socket.off('authenticated');
      socket.off('loading');
      socket.off('ready');
      socket.off('disconnected');
      socket.off('max_reconnect_reached');
      socket.off('message');
      socket.disconnect();
    };
  }, []);

  // Auto-sync every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      handleManualSync();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const requestStatus = useCallback(() => {
    socketRef.current?.emit('request_status');
  }, []);

  const sendText = useCallback((text: string) => {
    const outgoing: MessagePayload = {
      from: 'you',
      to: CONTACT_ID,
      body: text,
      timestamp: Date.now(),
      mediaUrl: null,
      mimetype: null,
      fromMe: true,
    };

    socketRef.current?.emit('send_message', { message: text });

    setMessages((prev) => {
      const updated = [...prev, outgoing];
      persistMessages(updated);
      return updated;
    });
  }, []);

  const sendMedia = useCallback((base64: string, mimetype: string, filename: string) => {
    const outgoing: MessagePayload = {
      from: 'you',
      to: CONTACT_ID,
      body: '',
      timestamp: Date.now(),
      mediaUrl: '',
      mimetype,
      fromMe: true,
    };

    setMessages((prev) => {
      const updated = [...prev, outgoing];
      persistMessages(updated);
      return updated;
    });

    socketRef.current?.emit('send_media', { base64, mimetype, filename });
  }, []);

  const handleManualSync = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/sync-messages`);
      const data = await res.json();
      return data.count as number;
    } catch {
      return -1;
    }
  }, []);

  return {
    qr,
    ready,
    messages,
    connectionStatus,
    requestStatus,
    sendText,
    sendMedia,
    handleManualSync,
    setQr,
    setReady,
  };
}
