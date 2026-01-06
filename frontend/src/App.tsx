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
  
  // Terminal chat states for FAKE mode
  const [terminalMessages, setTerminalMessages] = useState<{command: string, response: string, timestamp: string}[]>([
    { 
      command: '', 
      response: 'Nexus Terminal v2.1.4\nType "help" for available commands.\nConnected to secure node.', 
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [terminalInput, setTerminalInput] = useState('');

  const suggestions = ['system status', 'network scan', 'list files', 'help', 'whoami', 'uptime'];

  // Mock command responses
  const getTerminalResponse = (cmd: string): string => {
    const lower = cmd.toLowerCase().trim();
    const responses: {[key: string]: string} = {
      'help': 'Available commands:\n• system status - Check system health\n• network scan - Scan network devices\n• list files - Show directory contents\n• whoami - Display current user\n• uptime - Show system uptime\n• clear - Clear terminal',
      'system status': '✓ CPU: 23%\n✓ Memory: 4.2GB / 16GB\n✓ Disk: 234GB free\n✓ Network: Connected\n✓ Security: All systems operational',
      'network scan': 'Scanning network...\n[172.16.0.1] Gateway - Online\n[172.16.0.45] analytics-node - Online\n[172.16.0.89] backup-server - Online\n3 devices detected.',
      'list files': '/nexus/secure/\n  ├── config.json\n  ├── logs/\n  │   ├── system.log\n  │   └── access.log\n  ├── data/\n  └── scripts/',
      'whoami': 'Current user: admin@nexus-terminal\nPermission level: Root access\nSession ID: NX-7A4B-9C2D',
      'uptime': 'System uptime: 47 days, 13 hours, 24 minutes\nLast reboot: 2024-11-20 03:15:42',
      'clear': '__CLEAR__'
    };

    if (lower === 'clear') return '__CLEAR__';
    return responses[lower] || `Command not recognized: "${cmd}"\nType "help" for available commands.`;
  };

  useEffect(() => {
    if (mode === 'REAL') socket.emit('request_status');
  }, [mode]);

  useEffect(() => {
    const interval = setInterval(handleManualSync, 1000 * 60 * 5);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    socket.on('qr', setQr);
    socket.on('ready', () => setReady(true));
    socket.on('disconnected', (reason) => {
      setReady(false);
      alert('WhatsApp disconnected: ' + reason);
    });
    socket.on('message', (msg) => {
      if (msg.from === CONTACT_ID || msg.to === CONTACT_ID) {
        setMessages((prev) => {
          const updated = [...prev, msg];
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

  const handleLogin = () => {
    if (pin === '1331') setMode('FAKE');
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
        body: '',
        timestamp: Date.now(),
        mediaUrl: '',
        mimetype: selectedFile.type
      };
      setMessages((prev) => {
        const updated = [...prev, outgoing];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
      socket.emit('send_media', {
        base64,
        mimetype: selectedFile.type,
        filename: selectedFile.name
      });
    };
    reader.readAsDataURL(selectedFile);
    setSelectedFile(null);
  };

  const handleTerminalSend = () => {
    if (!terminalInput.trim()) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const response = getTerminalResponse(terminalInput);
    
    if (response === '__CLEAR__') {
      setTerminalMessages([{
        command: '',
        response: 'Terminal cleared.',
        timestamp
      }]);
    } else {
      setTerminalMessages(prev => [...prev, {
        command: terminalInput,
        response,
        timestamp
      }]);
    }
    
    setTerminalInput('');
  };

  const handleSuggestionClick = (suggestion: string) => {
    setTerminalInput(suggestion);
  };

  if (mode === 'LOCKED') {
    return (
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
        color: 'white', 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          minWidth: '320px'
        }}>
          <h2 style={{ color: '#667eea', marginBottom: '24px', textAlign: 'center' }}>Welcome to Nexus</h2>
          <input 
            type="password" 
            value={pin} 
            onChange={e => setPin(e.target.value)} 
            onKeyPress={e => e.key === 'Enter' && handleLogin()}
            placeholder="Enter PIN" 
            style={{ 
              padding: '12px', 
              width: '100%', 
              border: '2px solid #e0e0e0',
              borderRadius: '8px',
              fontSize: '16px',
              boxSizing: 'border-box'
            }} 
          />
          <button 
            onClick={handleLogin} 
            style={{ 
              marginTop: '16px', 
              width: '100%',
              padding: '12px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  // FAKE MODE - Terminal Chat UI
  if (mode === 'FAKE') {
    return (
      <div style={{ 
        background: '#f5f5f5', 
        height: '100vh', 
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        {/* Header */}
        <div style={{
          background: 'white',
          padding: '16px 24px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ margin: 0, color: '#333', fontSize: '18px' }}>Nexus Terminal</h3>
          <button 
            onClick={() => { setMode('LOCKED'); setQr(null); setReady(false); }}
            style={{
              padding: '8px 16px',
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Lock
          </button>
        </div>

        {/* Messages Container */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {terminalMessages.map((msg, i) => (
            <div key={i}>
              {msg.command && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    background: '#667eea',
                    color: 'white',
                    padding: '10px 16px',
                    borderRadius: '18px 18px 4px 18px',
                    maxWidth: '70%',
                    fontSize: '14px',
                    fontFamily: 'monospace'
                  }}>
                    $ {msg.command}
                  </div>
                </div>
              )}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-start'
              }}>
                <div style={{
                  background: 'white',
                  color: '#333',
                  padding: '10px 16px',
                  borderRadius: '18px 18px 18px 4px',
                  maxWidth: '70%',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-line',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  border: '1px solid #e0e0e0'
                }}>
                  {msg.response}
                  <div style={{
                    fontSize: '10px',
                    color: '#999',
                    marginTop: '6px',
                    textAlign: 'right'
                  }}>
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div style={{
          background: 'white',
          borderTop: '1px solid #e0e0e0',
          padding: '16px 24px',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
        }}>
          {/* Suggestions */}
          <div style={{
            marginBottom: '12px',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => handleSuggestionClick(suggestion)}
                style={{
                  padding: '4px 10px',
                  background: '#f0f0f0',
                  border: '1px solid #d0d0d0',
                  borderRadius: '12px',
                  fontSize: '11px',
                  color: '#666',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#e0e0e0'}
                onMouseOut={(e) => e.currentTarget.style.background = '#f0f0f0'}
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="text"
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleTerminalSend()}
              placeholder="Type a command..."
              style={{
                flex: 1,
                padding: '12px 16px',
                border: '2px solid #e0e0e0',
                borderRadius: '24px',
                fontSize: '14px',
                fontFamily: 'monospace',
                outline: 'none'
              }}
            />
            <button
              onClick={handleTerminalSend}
              disabled={!terminalInput.trim()}
              style={{
                padding: '12px 24px',
                background: terminalInput.trim() ? '#667eea' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '24px',
                cursor: terminalInput.trim() ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
            >
              Send
            </button>
          </div>
        </div>

        <p style={{ 
          textAlign: 'center', 
          color: '#999', 
          fontSize: '12px', 
          padding: '8px',
          margin: 0,
          background: 'white'
        }}>
          Press ESC to exit
        </p>
      </div>
    );
  }

  // REAL MODE - Same UI as FAKE but with actual functionality
  return (
    <div style={{ 
      background: '#f5f5f5', 
      height: '100vh', 
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: 'white',
        padding: '16px 24px',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <div>
          <h3 style={{ margin: 0, color: '#333', fontSize: '18px' }}>Stealth Chat</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: ready ? '#4caf50' : '#ff9800' }}>
            {ready ? '✓ Connected' : '⏳ Connecting...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={handleManualSync}
            style={{
              padding: '8px 16px',
              background: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            🔄 Sync
          </button>
          <button 
            onClick={() => { setMode('LOCKED'); setQr(null); setReady(false); }}
            style={{
              padding: '8px 16px',
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Lock
          </button>
        </div>
      </div>

      {/* QR Code Display */}
      {!ready && qr && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          background: 'white',
          margin: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <QRCodeCanvas value={qr} size={256} />
          <p style={{ color: '#666', fontSize: '14px', marginTop: '16px' }}>
            Scan from WhatsApp → Linked Devices
          </p>
        </div>
      )}

      {/* Messages Container */}
      {ready && (
        <>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {messages.slice(-20).map((msg, i) => {
              const isOutgoing = msg.from === 'you';
              return (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: isOutgoing ? 'flex-end' : 'flex-start'
                }}>
                  <div style={{
                    background: isOutgoing ? '#667eea' : 'white',
                    color: isOutgoing ? 'white' : '#333',
                    padding: '10px 16px',
                    borderRadius: isOutgoing ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    maxWidth: '70%',
                    fontSize: '14px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    border: isOutgoing ? 'none' : '1px solid #e0e0e0'
                  }}>
                    <div style={{ fontWeight: '600', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
                      {isOutgoing ? 'You' : LABEL}
                    </div>
                    {msg.body && <div>{msg.body}</div>}
                    {msg.mediaUrl && msg.mimetype?.startsWith('image/') && (
                      <img src={msg.mediaUrl} alt="img" style={{ maxWidth: '200px', marginTop: '8px', borderRadius: '8px' }} />
                    )}
                    {msg.mediaUrl && msg.mimetype?.startsWith('audio/') && (
                      <audio controls src={msg.mediaUrl} style={{ marginTop: '8px', width: '100%' }} />
                    )}
                    {msg.mediaUrl && !msg.mimetype?.startsWith('image/') && !msg.mimetype?.startsWith('audio/') && (
                      <a href={msg.mediaUrl} target="_blank" rel="noreferrer" style={{ color: isOutgoing ? 'white' : '#667eea' }}>
                        📎 Open File
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Area */}
          <div style={{
            background: 'white',
            borderTop: '1px solid #e0e0e0',
            padding: '16px 24px',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
          }}>
            {/* File Upload */}
            {selectedFile && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 12px',
                background: '#f0f0f0',
                borderRadius: '8px',
                fontSize: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>📎 {selectedFile.name}</span>
                <button
                  onClick={() => setSelectedFile(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f44336',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Input Box */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <label style={{ cursor: 'pointer', padding: '8px', background: '#f0f0f0', borderRadius: '50%' }}>
                <input
                  type="file"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <span style={{ fontSize: '20px' }}>📎</span>
              </label>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !selectedFile && handleSendText()}
                placeholder="Type a message..."
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '24px',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              <button
                onClick={selectedFile ? handleSendFile : handleSendText}
                disabled={!newMessage.trim() && !selectedFile}
                style={{
                  padding: '12px 24px',
                  background: (newMessage.trim() || selectedFile) ? '#667eea' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '24px',
                  cursor: (newMessage.trim() || selectedFile) ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
              >
                {selectedFile ? 'Send File' : 'Send'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
