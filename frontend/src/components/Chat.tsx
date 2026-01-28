import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { LABEL } from '../constants';
import type { MessagePayload } from '../types';

interface Props {
  qr: string | null;
  ready: boolean;
  messages: MessagePayload[];
  connectionStatus: string;
  onSendText: (text: string) => void;
  onSendMedia: (base64: string, mimetype: string, filename: string) => void;
  onSync: () => void;
  onLock: () => void;
}

export function Chat({
  qr,
  ready,
  messages,
  connectionStatus,
  onSendText,
  onSendMedia,
  onSync,
  onLock,
}: Props) {
  const [newMessage, setNewMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendText = () => {
    if (!newMessage.trim()) return;
    onSendText(newMessage);
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
      onSendMedia(base64, selectedFile.type, selectedFile.name);
    };
    reader.readAsDataURL(selectedFile);
    setSelectedFile(null);
  };

  const statusDisplay = () => {
    if (ready) return { text: '\u2713 Connected', color: '#4caf50' };
    if (connectionStatus === 'qr_received') return { text: 'Scan QR Code', color: '#ff9800' };
    if (connectionStatus.startsWith('loading')) return { text: connectionStatus, color: '#ff9800' };
    if (connectionStatus === 'authenticated') return { text: 'Connecting...', color: '#ff9800' };
    return { text: connectionStatus, color: '#ff9800' };
  };

  const status = statusDisplay();

  return (
    <div
      style={{
        background: '#f5f5f5',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'white',
          padding: '16px 24px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#333', fontSize: '18px' }}>Stealth Chat</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: status.color }}>
            {status.text}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onSync}
            style={{
              padding: '8px 16px',
              background: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Sync
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

      {/* QR Code display */}
      {!ready && qr && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
            background: 'white',
            margin: '20px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <QRCodeCanvas value={qr} size={256} />
          <p style={{ color: '#666', fontSize: '14px', marginTop: '16px' }}>
            Scan from WhatsApp &rarr; Linked Devices
          </p>
        </div>
      )}

      {/* Messages */}
      {ready && (
        <>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {messages.slice(-20).map((msg, i) => {
              const isOutgoing = msg.from === 'you' || msg.from === 'me' || msg.fromMe;
              return (
                <div key={i} style={{ display: 'flex', justifyContent: isOutgoing ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      background: isOutgoing ? '#667eea' : 'white',
                      color: isOutgoing ? 'white' : '#333',
                      padding: '10px 16px',
                      borderRadius: isOutgoing ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      maxWidth: '70%',
                      fontSize: '14px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      border: isOutgoing ? 'none' : '1px solid #e0e0e0',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: '600',
                        fontSize: '12px',
                        marginBottom: '4px',
                        opacity: 0.8,
                      }}
                    >
                      {isOutgoing ? 'You' : LABEL}
                    </div>
                    {msg.body && <div>{msg.body}</div>}
                    {msg.mediaUrl && msg.mimetype?.startsWith('image/') && (
                      <img
                        src={msg.mediaUrl}
                        alt="img"
                        style={{ maxWidth: '200px', marginTop: '8px', borderRadius: '8px' }}
                      />
                    )}
                    {msg.mediaUrl && msg.mimetype?.startsWith('audio/') && (
                      <audio controls src={msg.mediaUrl} style={{ marginTop: '8px', width: '100%' }} />
                    )}
                    {msg.mediaUrl &&
                      !msg.mimetype?.startsWith('image/') &&
                      !msg.mimetype?.startsWith('audio/') && (
                        <a
                          href={msg.mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: isOutgoing ? 'white' : '#667eea' }}
                        >
                          Open File
                        </a>
                      )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div
            style={{
              background: 'white',
              borderTop: '1px solid #e0e0e0',
              padding: '16px 24px',
              boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
            }}
          >
            {selectedFile && (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '8px 12px',
                  background: '#f0f0f0',
                  borderRadius: '8px',
                  fontSize: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{selectedFile.name}</span>
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
                  &#x2715;
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <label
                style={{
                  cursor: 'pointer',
                  padding: '8px',
                  background: '#f0f0f0',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <input type="file" onChange={handleFileChange} style={{ display: 'none' }} />
                <span style={{ fontSize: '20px' }}>&#x1F4CE;</span>
              </label>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !selectedFile && handleSendText()}
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
                  background: newMessage.trim() || selectedFile ? '#667eea' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '24px',
                  cursor: newMessage.trim() || selectedFile ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
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
