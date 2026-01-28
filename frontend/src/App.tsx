import { useState, useEffect, useCallback } from 'react';
import { LockScreen } from './components/LockScreen';
import { Terminal } from './components/Terminal';
import { Chat } from './components/Chat';
import { useSocket } from './hooks/useSocket';
import { useAutoLock, useKeyboardShortcuts } from './hooks/useAutoLock';
import type { AppMode } from './types';

function App() {
  const [mode, setMode] = useState<AppMode>('LOCKED');
  const {
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
  } = useSocket();

  const handleLock = useCallback(() => {
    setMode('LOCKED');
    setQr(null);
    setReady(false);
  }, [setQr, setReady]);

  useAutoLock(handleLock);
  useKeyboardShortcuts(setMode, handleLock);

  // Request status when entering REAL mode
  useEffect(() => {
    if (mode === 'REAL') requestStatus();
  }, [mode, requestStatus]);

  const handleSync = useCallback(async () => {
    const count = await handleManualSync();
    if (count >= 0) {
      alert(`Synced ${count} messages.`);
    } else {
      alert('Failed to sync.');
    }
  }, [handleManualSync]);

  if (mode === 'LOCKED') {
    return <LockScreen onUnlock={setMode} />;
  }

  if (mode === 'FAKE') {
    return <Terminal onLock={handleLock} />;
  }

  return (
    <Chat
      qr={qr}
      ready={ready}
      messages={messages}
      connectionStatus={connectionStatus}
      onSendText={sendText}
      onSendMedia={sendMedia}
      onSync={handleSync}
      onLock={handleLock}
    />
  );
}

export default App;
