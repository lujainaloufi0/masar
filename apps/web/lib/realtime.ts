'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { TaskDTO } from '@masar/shared';
import { dropTask, keys, putTask } from './data';

/**
 * Keeps every open browser in sync. The server pushes changed tasks to the
 * department's room; other changes just mark the matching lists as stale.
 */
export function useRealtime(enabled: boolean, handlers: { onSignedOut: () => void; onReset: () => void }) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const { onSignedOut, onReset } = handlers;

  useEffect(() => {
    if (!enabled) return;
    const socket = io({ path: '/socket.io', addTrailingSlash: false, withCredentials: true });
    socket.on('connect', () => {
      setConnected(true);
      // Catch up on anything missed while disconnected.
      qc.invalidateQueries();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('task:changed', (task: TaskDTO) => putTask(qc, task));
    socket.on('task:deleted', ({ id }: { id: string }) => dropTask(qc, id));
    socket.on('notifications:changed', () => qc.invalidateQueries({ queryKey: keys.notifications }));
    socket.on('org:changed', () => {
      for (const k of [keys.bootstrap, keys.employees, keys.stats, keys.activity]) qc.invalidateQueries({ queryKey: k });
    });
    socket.on('auth:required', onSignedOut);
    socket.on('demo:reset', onReset);
    return () => {
      socket.disconnect();
    };
  }, [enabled, qc, onSignedOut, onReset]);

  return connected;
}
