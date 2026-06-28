'use client';

import { useState, useEffect, useRef } from 'react';
import { drainOfflineQueue, getOfflineQueueLength } from './sync';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const drainingRef = useRef(false);

  const checkQueue = async () => {
    try {
      const len = await getOfflineQueueLength();
      setPendingSync(len);
      return len;
    } catch { return 0; }
  };

  const drain = async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    setSyncing(true);
    console.log('[Network] Draining offline queue...');
    try {
      const { drainOfflineQueue: drainFn } = await import('./sync');
      const { drained, failed } = await drainFn();
      if (drained > 0) console.log('[Network] Synced', drained, 'items to Supabase');
      if (failed > 0) console.warn('[Network]', failed, 'items failed to sync');
      await checkQueue();
    } catch (e) {
      console.warn('[Network] drain error:', e);
    } finally {
      setSyncing(false);
      drainingRef.current = false;
    }
  };

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = async () => {
      console.log('[Network] online event');
      setIsOnline(true);
      await drain();
    };
    const handleOffline = () => {
      console.log('[Network] offline event');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Polling: every 10s check connectivity and drain queue if online
    // This is the fallback for when the online/offline events don't fire
    const poll = setInterval(async () => {
      const online = navigator.onLine;
      setIsOnline(online);
      const pending = await checkQueue();
      // If we have pending items and we're online, try to drain
      if (online && pending > 0 && !drainingRef.current) {
        console.log('[Network] Poll: found', pending, 'pending items, draining...');
        await drain();
      }
    }, 10000);

    checkQueue();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(poll);
    };
  }, []);

  return { isOnline, pendingSync, syncing };
}
