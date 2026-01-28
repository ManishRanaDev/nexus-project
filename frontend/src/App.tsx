/**
 * Nexus Terminal v2.0
 * Secure WhatsApp Communication Interface
 */

import React, { useState, useEffect, useCallback, useRef, ChangeEvent, KeyboardEvent } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeCanvas } from 'qrcode.react';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  serverUrl: process.env.REACT_APP_SERVER_URL || 'https://nexubacksend.shop',
  contactId: '918299515901@c.us',
  storageKey: 'nexus-chat-918299515901',
  themeStorageKey: 'nexus-theme',
  messageLabel: 'Stealth_Command',
  autoLockTimeout: 120000, // 2 minutes
  syncInterval: 300000, // 5 minutes
  pins: {
    fake: '1331',
    real: '4387',
  },
};

// ============================================================================
// Types
// ============================================================================

type AppMode = 'LOCKED' | 'FAKE' | 'REAL';
type ConnectionStatus = 'disconnected' | 'connecting' | 'qr_received' | 'authenticated' | 'loading' | 'connected' | 'failed';

interface Message {
  from: string;
  to: string;
  body: string;
  timestamp: number;
  mediaUrl?: string | null;
  mimetype?: string | null;
}

interface TerminalMessage {
  command: string;
  response: string;
  timestamp: string;
}

interface Theme {
  background: string;
  headerBg: string;
  headerText: string;
  messageBg: string;
  messageText: string;
  userBubble: string;
  userBubbleText: string;
  border: string;
  inputBg: string;
  inputBorder: string;
  suggestionBg: string;
  suggestionBorder: string;
  suggestionText: string;
  suggestionHover: string;
  footerText: string;
  shadow: string;
  buttonBg: string;
  buttonDisabled: string;
}

// ============================================================================
// Theme Configuration
// ============================================================================

const themes: { light: Theme; dark: Theme } = {
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
    buttonDisabled: '#ccc',
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
    buttonDisabled: '#333',
  },
};

// ============================================================================
// Terminal Commands & Responses
// ============================================================================

const terminalSuggestions = [
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
  'backup status',
];

const terminalResponses: Record<string, string> = {
  help: `Available commands:
• system status - Check system health
• network scan - Scan network devices
• list files - Show directory contents
• whoami - Display current user
• uptime - Show system uptime
• ping gateway - Test network connectivity
• check logs - View recent system logs
• disk usage - Show storage information
• process list - Display running processes
• security audit - Run security checks
• backup status - Check backup systems
• clear - Clear terminal`,

  'system status': `✓ CPU: 23% (Normal)
✓ Memory: 4.2GB / 16GB (26% used)
✓ Disk: 234GB free of 512GB
✓ Network: Connected (98ms latency)
✓ Security: All systems operational
✓ Last check: Just now`,

  'network scan': `Scanning network 172.16.0.0/24...

[172.16.0.1] Gateway - Online (2ms)
[172.16.0.45] analytics-node - Online (5ms)
[172.16.0.89] backup-server - Online (8ms)
[172.16.0.102] database-01 - Online (3ms)
[172.16.0.156] cache-server - Online (6ms)

5 devices detected. Network stable.`,

  'list files': `/nexus/secure/
  ├── config.json (4.2KB)
  ├── credentials.enc (8.1KB)
  ├── logs/
  │   ├── system.log (156KB)
  │   ├── access.log (89KB)
  │   └── error.log (12KB)
  ├── data/
  │   ├── cache/ (234MB)
  │   └── temp/ (45MB)
  └── scripts/
      ├── backup.sh
      ├── monitor.py
      └── cleanup.sh`,

  whoami: `Current user: admin@nexus-terminal
Permission level: Root access
Session ID: NX-7A4B-9C2D
IP Address: 172.16.0.100
Authenticated: Yes`,

  uptime: `System uptime: 47 days, 13 hours, 24 minutes
Last reboot: 2024-11-20 03:15:42
Load average: 0.45, 0.52, 0.48
Active sessions: 3`,

  'ping gateway': `PING 172.16.0.1 (172.16.0.1) 56 bytes

64 bytes from 172.16.0.1: icmp_seq=1 time=2.1ms
64 bytes from 172.16.0.1: icmp_seq=2 time=1.8ms
64 bytes from 172.16.0.1: icmp_seq=3 time=2.3ms
64 bytes from 172.16.0.1: icmp_seq=4 time=1.9ms

--- ping statistics ---
4 packets transmitted, 4 received, 0% packet loss
avg/min/max = 2.0/1.8/2.3 ms`,

  'check logs': `Recent system logs:

[2025-01-06 14:23:15] [INFO] System health check passed
[2025-01-06 14:18:42] [INFO] Backup completed successfully
[2025-01-06 14:12:09] [WARN] High memory usage detected
[2025-01-06 14:05:31] [INFO] Security scan completed
[2025-01-06 13:58:17] [INFO] Database optimization finished

Showing last 5 entries. Use "check logs -all" for full history.`,

  'disk usage': `Filesystem analysis:

/ (root)        278GB / 512GB (54% used)
/home          156GB / 256GB (61% used)
/var/log        12GB / 50GB  (24% used)
/tmp             4GB / 20GB  (20% used)

Total: 450GB used of 838GB
Largest directories:
  /var/cache     45GB
  /home/data     89GB
  /backup        67GB`,

  'process list': `Active processes:

PID    CPU%   MEM%   COMMAND
1247   12.3   4.2    nexus-core
2891    8.1   2.7    analytics-engine
3456    5.2   1.9    backup-daemon
4123    3.8   3.1    monitoring-agent
5678    2.1   1.2    cache-manager
6234    1.5   0.8    log-processor

6 processes shown. System load: Normal`,

  'security audit': `Running security audit...

✓ Firewall: Active and configured
✓ SSL Certificates: Valid (expires in 234 days)
✓ Password policies: Enforced
✓ Failed login attempts: 0 in last 24h
✓ Open ports: Only authorized (22, 80, 443)
✓ Malware scan: Clean
✓ Intrusion detection: Active
✓ Encryption: AES-256 enabled

Security score: 98/100
Last full audit: 3 days ago`,

  'backup status': `Backup system status:

✓ Last backup: Today at 03:00 AM
✓ Status: Successful
✓ Data transferred: 45.7GB
✓ Duration: 18 minutes
✓ Next scheduled: Tomorrow at 03:00 AM

Backup history (last 7 days):
  Mon: ✓ Success
  Tue: ✓ Success
  Wed: ✓ Success
  Thu: ✓ Success
  Fri: ✓ Success
  Sat: ✓ Success
  Sun: ✓ Success

Retention: 30 days
Storage location: /backup/archive`,
};

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
  'Verifying integrity...\n✓ Hash verified\n✓ No corruption detected',
];

// ============================================================================
// Socket Connection
// ============================================================================

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(CONFIG.serverUrl, {
      transports: ['websocket', 'polling'],
      secure: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 20000,
    });
  }
  return socket;
}

// ============================================================================
// Helper Functions
// ============================================================================

function loadMessages(): Message[] {
  try {
    const saved = localStorage.getItem(CONFIG.storageKey);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]): void {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(messages));
  } catch {
    console.warn('Failed to save messages to localStorage');
  }
}

function loadTheme(): boolean {
  try {
    return localStorage.getItem(CONFIG.themeStorageKey) === 'dark';
  } catch {
    return false;
  }
}

function saveTheme(isDark: boolean): void {
  try {
    localStorage.setItem(CONFIG.themeStorageKey, isDark ? 'dark' : 'light');
  } catch {
    console.warn('Failed to save theme to localStorage');
  }
}

function getTerminalResponse(command: string): string {
  const cmd = command.toLowerCase().trim();

  if (cmd === 'clear') return '__CLEAR__';
  if (terminalResponses[cmd]) return terminalResponses[cmd];

  return randomResponses[Math.floor(Math.random() * randomResponses.length)];
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================================================
// Components
// ============================================================================

// Lock Screen Component
const LockScreen: React.FC<{
  onUnlock: (mode: AppMode) => void;
}> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    if (pin === CONFIG.pins.fake) {
      onUnlock('FAKE');
    } else if (pin === CONFIG.pins.real) {
      onUnlock('REAL');
    } else {
      setPin('');
      inputRef.current?.focus();
    }
  }, [pin, onUnlock]);

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        minWidth: '320px',
      }}>
        <h2 style={{ color: '#667eea', marginBottom: '24px', textAlign: 'center' }}>
          Welcome to Nexus
        </h2>
        <input
          ref={inputRef}
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter PIN"
          style={{
            padding: '12px',
            width: '100%',
            border: '2px solid #e0e0e0',
            borderRadius: '8px',
            fontSize: '16px',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleSubmit}
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
            cursor: 'pointer',
          }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
};

// Terminal Mode Component
const TerminalMode: React.FC<{
  theme: Theme;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onLock: () => void;
}> = ({ theme, isDarkMode, onToggleTheme, onLock }) => {
  const [messages, setMessages] = useState<TerminalMessage[]>([
    {
      command: '',
      response: 'Nexus Terminal v2.1.4\nType "help" for available commands.\nConnected to secure node.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;

    const timestamp = new Date().toLocaleTimeString();
    const response = getTerminalResponse(input);

    if (response === '__CLEAR__') {
      setMessages([{
        command: '',
        response: 'Terminal cleared.',
        timestamp,
      }]);
    } else {
      setMessages((prev) => [...prev, {
        command: input,
        response,
        timestamp,
      }]);
    }

    setInput('');
  }, [input]);

  return (
    <div style={{
      background: theme.background,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      transition: 'background 0.3s ease',
    }}>
      {/* Header */}
      <div style={{
        background: theme.headerBg,
        padding: '16px 24px',
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: `0 2px 4px ${theme.shadow}`,
      }}>
        <h3 style={{ margin: 0, color: theme.headerText, fontSize: '18px' }}>
          Nexus Terminal
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={onToggleTheme}
            style={{
              padding: '8px 12px',
              background: theme.suggestionBg,
              color: theme.headerText,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
          <button
            onClick={onLock}
            style={{
              padding: '8px 16px',
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Lock
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.command && (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '8px',
              }}>
                <div style={{
                  background: theme.userBubble,
                  color: theme.userBubbleText,
                  padding: '10px 16px',
                  borderRadius: '18px 18px 4px 18px',
                  maxWidth: '70%',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                }}>
                  $ {msg.command}
                </div>
              </div>
            )}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-start',
            }}>
              <div style={{
                background: theme.messageBg,
                color: theme.messageText,
                padding: '10px 16px',
                borderRadius: '18px 18px 18px 4px',
                maxWidth: '70%',
                fontSize: '13px',
                fontFamily: 'monospace',
                whiteSpace: 'pre-line',
                boxShadow: `0 1px 2px ${theme.shadow}`,
                border: `1px solid ${theme.border}`,
              }}>
                {msg.response}
                <div style={{
                  fontSize: '10px',
                  color: theme.footerText,
                  marginTop: '6px',
                  textAlign: 'right',
                }}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        background: theme.inputBg,
        borderTop: `1px solid ${theme.border}`,
        padding: '16px 24px',
        boxShadow: `0 -2px 10px ${theme.shadow}`,
      }}>
        {/* Suggestions */}
        <div style={{
          marginBottom: '12px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          {terminalSuggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => setInput(suggestion)}
              style={{
                padding: '4px 10px',
                background: theme.suggestionBg,
                border: `1px solid ${theme.suggestionBorder}`,
                borderRadius: '12px',
                fontSize: '11px',
                color: theme.suggestionText,
                cursor: 'pointer',
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a command..."
            style={{
              flex: 1,
              padding: '12px 16px',
              border: `2px solid ${theme.inputBorder}`,
              borderRadius: '24px',
              fontSize: '14px',
              fontFamily: 'monospace',
              outline: 'none',
              background: theme.messageBg,
              color: theme.messageText,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            style={{
              padding: '12px 24px',
              background: input.trim() ? theme.buttonBg : theme.buttonDisabled,
              color: 'white',
              border: 'none',
              borderRadius: '24px',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Send
          </button>
        </div>
      </div>

      <p style={{
        textAlign: 'center',
        color: theme.footerText,
        fontSize: '12px',
        padding: '8px',
        margin: 0,
        background: theme.inputBg,
      }}>
        Press ESC to exit
      </p>
    </div>
  );
};

// Real Chat Mode Component
const RealChatMode: React.FC<{
  onLock: () => void;
}> = ({ onLock }) => {
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [newMessage, setNewMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Initialize socket connection
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const handleQr = (qrCode: string) => {
      console.log('📱 QR Code received');
      setQr(qrCode);
      setConnectionStatus('qr_received');
    };

    const handleAuthenticated = () => {
      console.log('✅ Authenticated');
      setConnectionStatus('authenticated');
      setQr(null);
    };

    const handleLoading = ({ percent, message }: { percent: number; message: string }) => {
      console.log(`⏳ Loading: ${percent}% - ${message}`);
      setConnectionStatus('loading');
    };

    const handleReady = () => {
      console.log('✅ Ready');
      setReady(true);
      setQr(null);
      setConnectionStatus('connected');
    };

    const handleDisconnected = (data: { reason: string }) => {
      console.log('❌ Disconnected:', data.reason);
      setReady(false);
      setConnectionStatus('disconnected');
    };

    const handleMaxReconnect = () => {
      alert('Connection failed. Please restart the backend server.');
      setConnectionStatus('failed');
    };

    const handleMessage = (msg: Message) => {
      console.log('📨 Message received');
      if (msg.from === CONFIG.contactId || msg.to === CONFIG.contactId) {
        setMessages((prev) => {
          const exists = prev.some(
            (m) => m.timestamp === msg.timestamp && m.body === msg.body && m.from === msg.from
          );
          if (exists) return prev;

          const updated = [...prev, msg].filter((m) => m.body || m.mediaUrl);
          saveMessages(updated);
          return updated;
        });
      }
    };

    socket.on('qr', handleQr);
    socket.on('authenticated', handleAuthenticated);
    socket.on('loading', handleLoading);
    socket.on('ready', handleReady);
    socket.on('disconnected', handleDisconnected);
    socket.on('max_reconnect_reached', handleMaxReconnect);
    socket.on('message', handleMessage);

    // Request current status
    socket.emit('request_status');

    return () => {
      socket.off('qr', handleQr);
      socket.off('authenticated', handleAuthenticated);
      socket.off('loading', handleLoading);
      socket.off('ready', handleReady);
      socket.off('disconnected', handleDisconnected);
      socket.off('max_reconnect_reached', handleMaxReconnect);
      socket.off('message', handleMessage);
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Periodic sync
  useEffect(() => {
    const interval = setInterval(() => {
      if (ready) {
        handleSync();
      }
    }, CONFIG.syncInterval);
    return () => clearInterval(interval);
  }, [ready]);

  const handleSync = async () => {
    try {
      const res = await fetch(`${CONFIG.serverUrl}/sync-messages`);
      const data = await res.json();
      if (data.success) {
        console.log(`Synced ${data.count} messages`);
      }
    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  const handleSendText = useCallback(() => {
    if (!newMessage.trim() || !socketRef.current) return;

    const outgoing: Message = {
      from: 'you',
      to: CONFIG.contactId,
      body: newMessage,
      timestamp: Math.floor(Date.now() / 1000),
    };

    socketRef.current.emit('send_message', { message: newMessage });
    setMessages((prev) => {
      const updated = [...prev, outgoing];
      saveMessages(updated);
      return updated;
    });
    setNewMessage('');
  }, [newMessage]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSendFile = useCallback(() => {
    if (!selectedFile || !socketRef.current) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const outgoing: Message = {
        from: 'you',
        to: CONFIG.contactId,
        body: `[File: ${selectedFile.name}]`,
        timestamp: Math.floor(Date.now() / 1000),
        mimetype: selectedFile.type,
      };

      setMessages((prev) => {
        const updated = [...prev, outgoing];
        saveMessages(updated);
        return updated;
      });

      socketRef.current?.emit('send_media', {
        base64,
        mimetype: selectedFile.type,
        filename: selectedFile.name,
      });
    };
    reader.readAsDataURL(selectedFile);
    setSelectedFile(null);
  }, [selectedFile]);

  const getStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connected':
        return { text: '✓ Connected', color: '#4caf50' };
      case 'qr_received':
        return { text: '📱 Scan QR Code', color: '#ff9800' };
      case 'authenticated':
        return { text: '⏳ Connecting...', color: '#ff9800' };
      case 'loading':
        return { text: '⏳ Loading...', color: '#ff9800' };
      case 'failed':
        return { text: '❌ Connection Failed', color: '#f44336' };
      default:
        return { text: '⚠️ Disconnected', color: '#ff9800' };
    }
  };

  const status = getStatusDisplay();

  return (
    <div style={{
      background: '#f5f5f5',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        background: 'white',
        padding: '16px 24px',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      }}>
        <div>
          <h3 style={{ margin: 0, color: '#333', fontSize: '18px' }}>Stealth Chat</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: status.color }}>
            {status.text}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleSync}
            disabled={!ready}
            style={{
              padding: '8px 16px',
              background: ready ? '#2196F3' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: ready ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            🔄 Sync
          </button>
          <button
            onClick={onLock}
            style={{
              padding: '8px 16px',
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
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
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          <QRCodeCanvas value={qr} size={256} />
          <p style={{ color: '#666', fontSize: '14px', marginTop: '16px' }}>
            Scan from WhatsApp → Linked Devices
          </p>
        </div>
      )}

      {/* Chat Messages */}
      {ready && (
        <>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {messages.slice(-50).map((msg, i) => {
              const isOutgoing = msg.from === 'you';
              return (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: isOutgoing ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    background: isOutgoing ? '#667eea' : 'white',
                    color: isOutgoing ? 'white' : '#333',
                    padding: '10px 16px',
                    borderRadius: isOutgoing ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    maxWidth: '70%',
                    fontSize: '14px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    border: isOutgoing ? 'none' : '1px solid #e0e0e0',
                  }}>
                    <div style={{
                      fontWeight: '600',
                      fontSize: '12px',
                      marginBottom: '4px',
                      opacity: 0.8,
                    }}>
                      {isOutgoing ? 'You' : CONFIG.messageLabel}
                    </div>
                    {msg.body && <div>{msg.body}</div>}
                    {msg.mediaUrl && msg.mimetype?.startsWith('image/') && (
                      <img
                        src={msg.mediaUrl}
                        alt="media"
                        style={{ maxWidth: '200px', marginTop: '8px', borderRadius: '8px' }}
                      />
                    )}
                    {msg.mediaUrl && msg.mimetype?.startsWith('audio/') && (
                      <audio controls src={msg.mediaUrl} style={{ marginTop: '8px', width: '100%' }} />
                    )}
                    {msg.mediaUrl && !msg.mimetype?.startsWith('image/') && !msg.mimetype?.startsWith('audio/') && (
                      <a
                        href={msg.mediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: isOutgoing ? 'white' : '#667eea' }}
                      >
                        📎 Open File
                      </a>
                    )}
                    <div style={{
                      fontSize: '10px',
                      opacity: 0.7,
                      marginTop: '4px',
                      textAlign: 'right',
                    }}>
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{
            background: 'white',
            borderTop: '1px solid #e0e0e0',
            padding: '16px 24px',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
          }}>
            {/* File Preview */}
            {selectedFile && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 12px',
                background: '#f0f0f0',
                borderRadius: '8px',
                fontSize: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>📎 {selectedFile.name}</span>
                <button
                  onClick={() => setSelectedFile(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f44336',
                    cursor: 'pointer',
                    fontSize: '16px',
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <label style={{
                cursor: 'pointer',
                padding: '8px',
                background: '#f0f0f0',
                borderRadius: '50%',
              }}>
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
                  outline: 'none',
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
                }}
              >
                {selectedFile ? 'Send File' : 'Send'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Waiting State */}
      {!ready && !qr && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <p>Connecting to WhatsApp...</p>
            <p style={{ fontSize: '12px', color: '#999' }}>Please wait</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main App Component
// ============================================================================

function App() {
  const [mode, setMode] = useState<AppMode>('LOCKED');
  const [isDarkMode, setIsDarkMode] = useState(loadTheme);
  const currentTheme = isDarkMode ? themes.dark : themes.light;

  // Auto-lock timer
  useEffect(() => {
    if (mode === 'LOCKED') return;

    let timeout: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setMode('LOCKED');
      }, CONFIG.autoLockTimeout);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();

    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      clearTimeout(timeout);
    };
  }, [mode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMode('LOCKED');
      }
      if (e.altKey && e.key.toLowerCase() === 'p') {
        setMode('FAKE');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleUnlock = useCallback((newMode: AppMode) => {
    setMode(newMode);
    if (newMode === 'REAL') {
      // Request status when entering real mode
      getSocket().emit('request_status');
    }
  }, []);

  const handleLock = useCallback(() => {
    setMode('LOCKED');
  }, []);

  const handleToggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const newValue = !prev;
      saveTheme(newValue);
      return newValue;
    });
  }, []);

  // Render based on mode
  if (mode === 'LOCKED') {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  if (mode === 'FAKE') {
    return (
      <TerminalMode
        theme={currentTheme}
        isDarkMode={isDarkMode}
        onToggleTheme={handleToggleTheme}
        onLock={handleLock}
      />
    );
  }

  return <RealChatMode onLock={handleLock} />;
}

export default App;
