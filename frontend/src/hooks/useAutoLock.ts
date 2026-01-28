import { useEffect, useCallback, useRef } from 'react';
import { AUTO_LOCK_MS } from '../constants';
import type { AppMode } from '../types';

export function useAutoLock(onLock: () => void) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const resetTimer = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(onLock, AUTO_LOCK_MS);
  }, [onLock]);

  useEffect(() => {
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();

    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      clearTimeout(timeoutRef.current);
    };
  }, [resetTimer]);
}

export function useKeyboardShortcuts(
  setMode: (mode: AppMode) => void,
  onLock: () => void
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onLock();
      if (e.altKey && e.key.toLowerCase() === 'p') setMode('FAKE');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setMode, onLock]);
}
