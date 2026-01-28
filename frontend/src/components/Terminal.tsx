import React, { useState, useRef, useEffect } from 'react';
import { TERMINAL_SUGGESTIONS, getTerminalResponse } from '../constants';
import { lightTheme, darkTheme } from '../theme';
import { THEME_STORAGE_KEY } from '../constants';
import type { TerminalMessage } from '../types';

interface Props {
  onLock: () => void;
}

export function Terminal({ onLock }: Props) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  });

  const [messages, setMessages] = useState<TerminalMessage[]>([
    {
      command: '',
      response: 'Nexus Terminal v2.1.4\nType "help" for available commands.\nConnected to secure node.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const theme = isDarkMode ? darkTheme : lightTheme;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const timestamp = new Date().toLocaleTimeString();
    const response = getTerminalResponse(input);

    if (response === '__CLEAR__') {
      setMessages([{ command: '', response: 'Terminal cleared.', timestamp }]);
    } else {
      setMessages((prev) => [...prev, { command: input, response, timestamp }]);
    }

    setInput('');
  };

  return (
    <div
      style={{
        background: theme.background,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: 'background 0.3s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: theme.headerBg,
          padding: '16px 24px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: `0 2px 4px ${theme.shadow}`,
          transition: 'all 0.3s ease',
        }}
      >
        <h3 style={{ margin: 0, color: theme.headerText, fontSize: '18px' }}>
          Nexus Terminal
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={toggleTheme}
            style={{
              padding: '8px 12px',
              background: theme.suggestionBg,
              color: theme.headerText,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
            }}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? '\u2600\uFE0F' : '\uD83C\uDF19'}
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
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.command && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                <div
                  style={{
                    background: theme.userBubble,
                    color: theme.userBubbleText,
                    padding: '10px 16px',
                    borderRadius: '18px 18px 4px 18px',
                    maxWidth: '70%',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    transition: 'all 0.3s ease',
                  }}
                >
                  $ {msg.command}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                style={{
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
                  transition: 'all 0.3s ease',
                }}
              >
                {msg.response}
                <div
                  style={{
                    fontSize: '10px',
                    color: theme.footerText,
                    marginTop: '6px',
                    textAlign: 'right',
                  }}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          background: theme.inputBg,
          borderTop: `1px solid ${theme.border}`,
          padding: '16px 24px',
          boxShadow: `0 -2px 10px ${theme.shadow}`,
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TERMINAL_SUGGESTIONS.map((suggestion, i) => (
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
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = theme.suggestionHover)}
              onMouseOut={(e) => (e.currentTarget.style.background = theme.suggestionBg)}
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
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
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
              transition: 'all 0.3s ease',
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
              transition: 'all 0.2s',
            }}
          >
            Send
          </button>
        </div>
      </div>

      <p
        style={{
          textAlign: 'center',
          color: theme.footerText,
          fontSize: '12px',
          padding: '8px',
          margin: 0,
          background: theme.inputBg,
          transition: 'all 0.3s ease',
        }}
      >
        Press ESC to exit
      </p>
    </div>
  );
}
