import React, { useState, useEffect, ChangeEvent } from 'react';
import io from 'socket.io-client';
import { QRCodeCanvas } from 'qrcode.react';

const socket = io('https://nexubacksend.shop', {
  transports: ['websocket'],
  secure: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

const CONTACT_ID = '918299515901@c.us';
const STORAGE_KEY = 'nexus-chat-918299515901';
const THEME_STORAGE_KEY = 'nexus-theme';
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
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [loadingPercent, setLoadingPercent] = useState<number>(0);
  
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === 'dark';
  });
  
  // Terminal chat states for FAKE mode
  const [terminalMessages, setTerminalMessages] = useState<{command: string, response: string, timestamp: string}[]>([
    { 
      command: '', 
      response: 'Nexus Terminal v2.1.4\nType "help" for available commands.\nConnected to secure node.', 
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [terminalInput, setTerminalInput] = useState('');

  const suggestions = [
    'system status',
    'network scan',
    'list files',
    'help',
    'whoami',
    'uptime',
    'ping gateway',
    'check logs',
    'disk usage',
    'process list',
    'security audit',
    'backup status'
  ];

  const randomResponses = [
    'Processing request...\nOperation completed successfully.\n✓ All systems nominal',
    'Analyzing input...\n[OK] Command executed\nStatus: Operational',
    'Connecting to secure node...\n✓ Connection established\n✓ Data synchronized',
    'Initializing subsystem...\n[INFO] Module loaded successfully\nReady for next command',
    'Executing background task...\n✓ Task completed\n✓ No errors detected',
    'Scanning environment...\n[SCAN] 3 items processed\n✓ Scan complete',
    'Validating credentials...\n✓ Authentication successful\n✓ Access granted',
    'Fetching remote data...\n[SYNC] 127 bytes transferred\n✓ Operation successful',
    'Running diagnostics...\n✓ All checks passed\n✓ System healthy',
    'Compiling metadata...\n[BUILD] Compilation successful\n✓ Output generated',
    'Encrypting transmission...\n✓ Encryption applied\n✓ Secure channel active',
    'Loading configuration...\n[CONFIG] Settings applied\n✓ Ready',
    'Analyzing network traffic...\n✓ Traffic normal\n✓ No anomalies detected',
    'Optimizing performance...\n[PERF] Optimization complete\n+15% efficiency gain',
    'Verifying integrity...\n✓ Hash verified\n✓ No corruption detected'
  ];

  // Theme colors
  const theme = {
    light: {
      background: '#f5f5f5',
      headerBg: 'white',
      headerText: '#333',
      messageBg: 'white',
      messageText: '#333',
      userBubble: '#667eea',
      userBubbleText: 'white',
      border: '#e0e0e0',
      inputBg: 'white',
      inputBorder: '#e0e0e0',
      suggestionBg: '#f0f0f0',
      suggestionBorder: '#d0d0d0',
      suggestionText: '#666',
      suggestionHover: '#e0e0e0',
      footerText: '#999',
      shadow: 'rgba(0,0,0,0.05)',
      buttonBg: '#667eea',
      buttonDisabled: '#ccc'
    },
    dark: {
      background: '#000000',
      headerBg: '#0a0a0a',
      headerText: '#ffffff',
      messageBg: '#1a1a1a',
      messageText: '#e0e0e0',
      userBubble: '#667eea',
      userBubbleText: 'white',
      border: '#2a2a2a',
      inputBg: '#0a0a0a',
      inputBorder: '#2a2a2a',
      suggestionBg: '#1a1a1a',
      suggestionBorder: '#2a2a2a',
      suggestionText: '#999',
      suggestionHover: '#2a2a2a',
      footerText: '#666',
      shadow: 'rgba(0,0,0,0.3)',
      buttonBg: '#667eea',
      buttonDisabled: '#333'
    }
  };

  const currentTheme = isDarkMode ? theme.dark : theme.light;

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme ? 'dark' : 'light');
  };

  const getTerminalResponse = (cmd: string): string => {
    const lower = cmd.toLowerCase().trim();
    const responses: {[key: string]: string} = {
      'help': 'Available commands:\n• system status - Check system health\n• network scan - Scan network devices\n• list files - Show directory contents\n• whoami - Display current user\n• uptime - Show system uptime\n• ping gateway - Test network connectivity\n• check logs - View recent system logs\n• disk usage - Show storage information\n• process list - Display running processes\n• security audit - Run security checks\n• backup status - Check backup systems\n• clear - Clear terminal',
      'system status': '✓ CPU: 23% (Normal)\n✓ Memory: 4.2GB / 16GB (26% used)\n✓ Disk: 234GB free of 512GB\n✓ Network: Connected (98ms latency)\n✓ Security: All systems operational\n✓ Last check: Just now',
      'network scan': 'Scanning network 172.16.0.0/24...\n\n[172.16.0.1] Gateway - Online (2ms)\n[172.16.0.45] analytics-node - Online (5ms)\n[172.16.0.89] backup-server - Online (8ms)\n[172.16.0.102] database-01 - Online (3ms)\n[172.16.0.156] cache-server - Online (6ms)\n\n5 devices detected. Network stable.',
      'list files': '/nexus/secure/\n  ├── config.json (4.2KB)\n  ├── credentials.enc (8.1KB)\n  ├── logs/\n  │   ├── system.log (156KB)\n  │   ├── access.log (89KB)\n  │   └── error.log (12KB)\n  ├── data/\n  │   ├── cache/ (234MB)\n  │   └── temp/ (45MB)\n  └── scripts/\n      ├── backup.sh\n      ├── monitor.py\n      └── cleanup.sh',
      'whoami': 'Current user: admin@nexus-terminal\nPermission level: Root access\nSession ID: NX-7A4B-9C2D\nIP Address: 172.16.0.100\nAuthenticated: Yes',
      'uptime': 'System uptime: 47 days, 13 hours, 24 minutes\nLast reboot: 2024-11-20 03:15:42\nLoad average: 0.45, 0.52, 0.48\nActive sessions: 3',
      'ping gateway': 'PING 172.16.0.1 (172.16.0.1) 56 bytes\n\n64 bytes from 172.16.0.1: icmp_seq=1 time=2.1ms\n64 bytes from 172.16.0.1: icmp_seq=2 time=1.8ms\n64 bytes from 172.16.0.1: icmp_seq=3 time=2.3ms\n64 bytes from 172.16.0.1: icmp_seq=4 time=1.9ms\n\n--- ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss\navg/min/max = 2.0/1.8/2.3 ms',
      'check logs': 'Recent system logs:\n\n[2025-01-06 14:23:15] [INFO] System health check passed\n[2025-01-06 14:18:42] [INFO] Backup completed successfully\n[2025-01-06 14:12:09] [WARN] High memory usage detected\n[2025-01-06 14:05:31] [INFO] Security scan completed\n[2025-01-06 13:58:17] [INFO] Database optimization finished\n\nShowing last 5 entries. Use "check logs -all" for full history.',
      'disk usage': 'Filesystem analysis:\n\n/ (root)        278GB / 512GB (54% used)\n/home          156GB / 256GB (61% used)\n/var/log        12GB / 50GB  (24% used)\n/tmp             4GB / 20GB  (20% used)\n\nTotal: 450GB used of 838GB\nLargest directories:\n  /var/cache     45GB\n  /home/data     89GB\n  /backup        67GB',
      'process list': 'Active processes:\n\nPID    CPU%   MEM%   COMMAND\n1247   12.3   4.2    nexus-core\n2891    8.1   2.7    analytics-engine\n3456    5.2   1.9    backup-daemon\n4123    3.8   3.1    monitoring-agent\n5678    2.1   1.2    cache-manager\n6234    1.5   0.8    log-processor\n\n6 processes shown. System load: Normal',
      'security audit': 'Running security audit...\n\n✓ Firewall: Active and configured\n✓ SSL Certificates: Valid (expires in 234 days)\n✓ Password policies: Enforced\n✓ Failed login attempts: 0 in last 24h\n✓ Open ports: Only authorized (22, 80, 443)\n✓ Malware scan: Clean\n✓ Intrusion detection: Active\n✓ Encryption: AES-256 enabled\n\nSecurity score: 98/100\nLast full audit: 3 days ago',
      'backup status': 'Backup system status:\n\n✓ Last backup: Today at 03:00 AM\n✓ Status: Successful\n✓ Data transferred: 45.7GB\n✓ Duration: 18 minutes\n✓ Next scheduled: Tomorrow at 03:00 AM\n\nBackup history (last 7 days):\n  Mon: ✓ Success\n  Tue: ✓ Success\n  Wed: ✓ Success\n  Thu: ✓ Success\n  Fri: ✓ Success\n  Sat: ✓ Success\n  Sun: ✓ Success\n\nRetention: 30 days\nStorage location: /backup/archive',
      'clear': '__CLEAR__'
    };

    if (lower === 'clear') return '__CLEAR__';
    
    if (responses[lower]) {
      return responses[lower];
    }
    
    return randomResponses[Math.floor(Math.random() * randomResponses.length)];
  };

  useEffect(() => {
    if (mode === 'REAL') socket.emit('request_status');
  }, [mode]);

  useEffect(() => {
    const interval = setInterval(handleManualSync, 1000 * 60 * 5);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    socket.on('qr', (qrCode) => {
      console.log('📱 QR Code received');
      setQr(qrCode);
      setConnectionStatus('qr_received');
    });

    socket.on('authenticated', () => {
      console.log('✅ Authenticated');
      setConnectionStatus('authenticated');
      setQr(null);
    });

    socket.on('loading', ({ percent, message }) => {
      console.log(`⏳ Loading: ${percent}% - ${message}`);
      setLoadingPercent(percent);
      setConnectionStatus(`loading: ${message}`);
    });

    socket.on('ready', (data) => {
      console.log('✅ Ready:', data);
      setReady(true);
      setQr(null);
      setConnectionStatus('connected');
      setLoadingPercent(100);
    });

    socket.on('disconnected', (data) => {
      console.log('❌ Disconnected:', data);
      setReady(false);
      setConnectionStatus(`disconnected: ${data.reason}`);
    });

    socket.on('max_reconnect_reached', () => {
      alert('Connection failed. Please restart the backend server.');
      setConnectionStatus('failed');
    });

    socket.on('message', (msg) => {
      console.log('📨 Message received:', msg);
      if (msg.from === CONTACT_ID || msg.to === CONTACT_ID) {
        setMessages((prev) => {
          const exists = prev.some(m => 
            m.timestamp === msg.timestamp && 
            m.body === msg.body &&
            m.from === msg.from
          );
          
          if (exists) return prev;
          
          const updated = [...prev, msg];
          const filtered = updated.filter(m => m.body || m.mediaUrl);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
          return filtered;
        });
      }
    });

    return () => {
      socket.off('qr');
      socket.off('authenticated');
      socket.off('loading');
      socket.off('ready');
      socket.off('disconnected');
      socket.off('max_reconnect_reached');
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

  if (mode === 'FAKE') {
    return (
      <div style={{ 
        background: currentTheme.background, 
        height: '100vh', 
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: 'background 0.3s ease'
      }}>
        <div style={{
          background: currentTheme.headerBg,
          padding: '16px 24px',
          borderBottom: `1px solid ${currentTheme.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: `0 2px 4px ${currentTheme.shadow}`,
          transition: 'all 0.3s ease'
        }}>
          <h3 style={{ margin: 0, color: currentTheme.headerText, fontSize: '18px' }}>Nexus Terminal</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              onClick={toggleTheme}
              style={{
                padding: '8px 12px',
                background: currentTheme.suggestionBg,
                color: currentTheme.headerText,
                border: `1px solid ${currentTheme.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? '☀️' : '🌙'}
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
                    background: currentTheme.userBubble,
                    color: currentTheme.userBubbleText,
                    padding: '10px 16px',
                    borderRadius: '18px 18px 4px 18px',
                    maxWidth: '70%',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    transition: 'all 0.3s ease'
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
                  background: currentTheme.messageBg,
                  color: currentTheme.messageText,
                  padding: '10px 16px',
                  borderRadius: '18px 18px 18px 4px',
                  maxWidth: '70%',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-line',
                  boxShadow: `0 1px 2px ${currentTheme.shadow}`,
                  border: `1px solid ${currentTheme.border}`,
                  transition: 'all 0.3s ease'
                }}>
                  {msg.response}
                  <div style={{
                    fontSize: '10px',
                    color: currentTheme.footerText,
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

        <div style={{
          background: currentTheme.inputBg,
          borderTop: `1px solid ${currentTheme.border}`,
          padding: '16px 24px',
          boxShadow: `0 -2px 10px ${currentTheme.shadow}`,
          transition: 'all 0.3s ease'
        }}>
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
                  background: currentTheme.suggestionBg,
                  border: `1px solid ${currentTheme.suggestionBorder}`,
                  borderRadius: '12px',
                  fontSize: '11px',
                  color: currentTheme.suggestionText,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = currentTheme.suggestionHover}
                onMouseOut={(e) => e.currentTarget.style.background = currentTheme.suggestionBg}
              >
                {suggestion}
              </button>
            ))}
          </div>

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
                border: `2px solid ${currentTheme.inputBorder}`,
                borderRadius: '24px',
                fontSize: '14px',
                fontFamily: 'monospace',
                outline: 'none',
                background: currentTheme.messageBg,
                color: currentTheme.messageText,
                transition: 'all 0.3s ease'
              }}
            />
            <button
              onClick={handleTerminalSend}
              disabled={!terminalInput.trim()}
              style={{
                padding: '12px 24px',
                background: terminalInput.trim() ? currentTheme.buttonBg : currentTheme.buttonDisabled,
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
          color: currentTheme.footerText, 
          fontSize: '12px', 
          padding: '8px',
          margin: 0,
          background: currentTheme.inputBg,
          transition: 'all 0.3s ease'
        }}>
          Press ESC to exit
        </p>
      </div>
    );
  }

  return (
    <div style={{ 
      background: '#f5f5f5', 
      height: '100vh', 
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
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
            {ready ? '✓ Connected' : 
             connectionStatus === 'qr_received' ? '📱 Scan QR Code' : 
             connectionStatus.startsWith('loading') ? `⏳ ${connectionStatus}` : 
             connectionStatus === 'authenticated' ? '⏳ Connecting...' : 
             '⚠️ ' + connectionStatus}
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

          <div style={{
            background: 'white',
            borderTop: '1px solid #e0e0e0',
            padding: '16px 24px',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
          }}>
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
