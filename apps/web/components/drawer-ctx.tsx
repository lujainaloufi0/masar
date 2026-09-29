'use client';
import { createContext, useContext } from 'react';
import type { TaskDraft } from '@masar/shared';

export type DrawerState =
  | { type: 'task'; id: string }
  | { type: 'taskForm'; editId?: string; draft?: TaskDraft }
  | { type: 'emp'; id: string | null }
  | null;

export interface DrawerApi {
  drawer: DrawerState;
  open: (d: Exclude<DrawerState, null>) => void;
  close: () => void;
}

export const DrawerCtx = createContext<DrawerApi>({ drawer: null, open: () => {}, close: () => {} });
export const useDrawer = () => useContext(DrawerCtx);
