import React, { useState } from 'react';
import { PIN_FAKE, PIN_REAL } from '../constants';
import type { AppMode } from '../types';

interface Props {
  onUnlock: (mode: AppMode) => void;
}

export function LockScreen({ onUnlock }: Props) {
  const [pin, setPin] = useState('');

  const handleLogin = () => {
    if (pin === PIN_FAKE) onUnlock('FAKE');
    else if (pin === PIN_REAL) onUnlock('REAL');
    setPin('');
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          background: 'white',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          minWidth: '320px',
        }}
      >
        <h2 style={{ color: '#667eea', marginBottom: '24px', textAlign: 'center' }}>
          Welcome to Nexus
        </h2>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
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
            cursor: 'pointer',
          }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
