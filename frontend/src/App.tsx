// ✅ FRONTEND with media support (App.tsx)

import React, { useState, useEffect, ChangeEvent } from 'react';
import io from 'socket.io-client';
import { QRCodeCanvas } from 'qrcode.react';

const socket = io('https://nexubacksend.shop', {
  transports: ['websocket'],
  secure: true
});
const CONTACT_ID = '918299515901@c.us';
const STORAGE_KEY = 'nexus-chat-918299515901';
const LABEL = 'Stealth_Command';

function App() {
  const [qr, setQr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'LOCKED' | 'FAKE' | 'REAL'>('LOCKED');
  const [messages, setMessages] = useState<any[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [newMessage, setNewMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fakeLogs, setFakeLogs] = useState<string[]>([]);

  useEffect(() => {
    if (mode === 'REAL') socket.emit('request_status');
  }, [mode]);

  useEffect(() => {
  const interval = setInterval(handleManualSync, 1000 * 60 * 5); // every 5 minutes
  return () => clearInterval(interval);
}, []);

  useEffect(() => {
    socket.on('qr', setQr);
    socket.on('ready', () => setReady(true));
    socket.on('message', (msg) => {
      if (msg.from === CONTACT_ID || msg.to === CONTACT_ID) {
        setMessages((prev) => {
          const updated = [...prev, msg];
    
          // Only save messages that have body or mediaUrl
          const filtered = updated.filter(m => m.body || m.mediaUrl);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    
          return filtered;
        });
      }
    });
    return () => {
      socket.off('qr');
      socket.off('ready');
      socket.off('message');
    };
  }, []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setMode('LOCKED');
        setQr(null);
        setReady(false);
      }, 120000);
    };
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();
    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMode('LOCKED');
        setQr(null);
        setReady(false);
      }
      if (e.altKey && e.key.toLowerCase() === 'p') setMode('FAKE');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
  if (mode === 'LOCKED') {
    setPin('');
  }
}, [mode]);

  useEffect(() => {
    if (mode === 'FAKE') {
      const pool = [
        '[INFO] Secure handshake established with node-001',
        '[TRACE] Resolving DNS for vault.internal...',
        '[AUTH] SSH key accepted :: admin@nexus-srvr',
        '[SCAN] Port scan complete. No anomalies detected.',
        '[SYNC] Pulling /etc/agent/state.json',
        '[DB] Writing logs to /nexus/tmp/cache.log',
        '[WARN] Unexpected latency spike detected in subnet 10.0.0.x',
        '[UPLOAD] /usr/fake/backup.7z => 172.16.0.3:/secure-drop',
        '[CRON] Executed 04:05 /nexus/scripts/wipe_old_data.sh',
        '[FIREWALL] Rule updated: ACCEPT :: 443/HTTPS :: stealth-mode',
        '[SPAWN] Container analytics-agent-97 started ✔️',
        '[EVAL] Threat vector matrix stabilized',
        '[REDTEAM] Initiated simulated intrusion attempt',
        '[MEMORY] Heap allocation secured',
        '[EXIT] Cleanup scheduled via systemd at 03:59'
      ];

      const interval = setInterval(() => {
        const line = pool[Math.floor(Math.random() * pool.length)];
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        setFakeLogs((prev) => [...prev.slice(-20), `[${timestamp}] ${line}`]);
      }, 1300);

      return () => clearInterval(interval);
    }
  }, [mode]);

  const handleLogin = () => {
    if (pin === '9910') setMode('FAKE');
    else if (pin === '4387') setMode('REAL');
    else setMode('LOCKED');
  };

  const handleManualSync = async () => {
  try {
    const res = await fetch('https://nexubacksend.shop/sync-messages');
    const data = await res.json();
    alert(`Synced ${data.count} messages.`);
  } catch (err) {
    alert('Failed to sync.');
  }
};

  const handleSendText = () => {
    const outgoing = {
      from: 'you',
      to: CONTACT_ID,
      body: newMessage,
      timestamp: Date.now()
    };
    socket.emit('send_message', { message: newMessage });
    setMessages((prev) => {
      const updated = [...prev, outgoing];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setNewMessage('');
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSendFile = () => {
    if (!selectedFile) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
  
      const outgoing = {
        from: 'you',
        to: CONTACT_ID,
        body: '', // No text body
        timestamp: Date.now(),
        mediaUrl: '', // Will be updated when backend emits it
        mimetype: selectedFile.type
      };
  
      // Optimistically show media
      setMessages((prev) => {
        const updated = [...prev, outgoing];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
  
      // Emit to backend (it will re-emit actual mediaUrl later)
      socket.emit('send_media', {
        base64,
        mimetype: selectedFile.type,
        filename: selectedFile.name
      });
    };
    reader.readAsDataURL(selectedFile);
    setSelectedFile(null);
  };

  if (mode === 'LOCKED') {
    return (
      <div style={{ background: 'black', color: 'green', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Welcome to Nexus</h2>
        <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter PIN" style={{ padding: '10px' }} />
        <button onClick={handleLogin} style={{ marginTop: '10px' }}>Unlock</button>
      </div>
    );
  }

  if (mode === 'FAKE') {
    return (
      <div style={{ background: 'black', color: 'lime', height: '100vh', padding: '20px', fontFamily: 'monospace', overflowY: 'auto' }}>
        <h2>Terminal: /usr/nexus/analytics</h2>
        <div style={{ marginTop: '10px', whiteSpace: 'pre-line' }}>
          {fakeLogs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div style={{ color: 'lime' }}>↳ <span className="blinking-cursor">█</span></div>
        </div>
        <p style={{ marginTop: '20px', color: 'gray' }}>Press ESC to exit.</p>
      </div>
    );
  }

  return (
    <div style={{ background: 'black', color: 'white', height: '100vh', padding: '20px', fontFamily: 'monospace', position: 'relative' }}>
      <p>{ready ? '✅ WhatsApp Connected' : '⏳ Waiting for WhatsApp...'}</p>

      {!ready && qr && (
        <div style={{ marginTop: '20px' }}>
          <QRCodeCanvas value={qr} size={256} fgColor="#ffffff" bgColor="#000000" />
          <p style={{ color: 'gray', fontSize: '12px' }}>Scan from WhatsApp → Linked Devices</p>
        </div>
      )}

      {ready && (
        <>
          <div style={{ maxHeight: '50vh', overflowY: 'auto', border: '1px solid gray', padding: '10px', marginTop: '20px', background: '#111' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ margin: '6px 0' }}>
                <b>{msg.from === CONTACT_ID ? LABEL : 'Stealth_Reporter'}:</b> {msg.body && <span>{msg.body}</span>}
                {msg.mediaUrl && msg.mimetype?.startsWith('image/') && (
                  <div><img src={msg.mediaUrl} alt="img" style={{ maxWidth: '200px', marginTop: '4px' }} /></div>
                )}
                {msg.mediaUrl && msg.mimetype?.startsWith('audio/') && (
                  <div><audio controls src={msg.mediaUrl} style={{ marginTop: '4px' }} /></div>
                )}
                {msg.mediaUrl && !msg.mimetype?.startsWith('image/') && !msg.mimetype?.startsWith('audio/') && (
                  <div><a href={msg.mediaUrl} target="_blank" rel="noreferrer">📎 Open File</a></div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: '10px' }}>
            <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type your message" style={{ width: '60%', height: '60px' }} />
            <br />
            <button onClick={handleSendText} style={{ marginTop: '10px', padding: '6px 12px', background: '#444', color: '#fff', border: 'none' }}>Send</button>
          </div>

          <div style={{ marginTop: '20px' }}>
            <input type="file" onChange={handleFileChange} />
            <button disabled={!selectedFile} onClick={handleSendFile} style={{ marginLeft: '10px', padding: '4px 10px' }}>Send File</button>
          </div>
        </>
      )}

      <button onClick={() => { setMode('LOCKED'); setQr(null); setReady(false); }}
        style={{ position: 'absolute', top: '10px', right: '10px', padding: '6px 12px', background: '#222', color: '#fff', border: 'none', cursor: 'pointer' }}>
        Lock
      </button>
      <br/>
      <button onClick={handleManualSync} style={{ marginTop: '10px', padding: '6px 12px' }}>
  🔄 Manual Sync
</button>
    </div>
  );
}

export default App;
