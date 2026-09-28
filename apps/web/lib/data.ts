'use client';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ActivityDTO, BootstrapDTO, CompletedRowDTO, NotificationDTO, PersonDTO, TaskDTO } from '@masar/shared';
import { api } from './api';

export interface DeptStats {
  deptId: string;
  people: number;
  open: number;
  done30: number;
  avgDays60: number | null;
}

export const keys = {
  bootstrap: ['bootstrap'] as const,
  tasks: ['tasks'] as const,
  task: (id: string) => ['task', id] as const,
  stats: ['stats'] as const,
  completed: ['completed'] as const,
  activity: ['activity'] as const,
  notifications: ['notifications'] as const,
  employees: ['employees'] as const,
};

export const useBootstrap = () => useQuery({ queryKey: keys.bootstrap, queryFn: () => api<BootstrapDTO>('/bootstrap') });
export const useTasks = () => useQuery({ queryKey: keys.tasks, queryFn: () => api<TaskDTO[]>('/tasks') });
export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: () => api<DeptStats[]>('/stats') });
export const useCompleted = () => useQuery({ queryKey: keys.completed, queryFn: () => api<CompletedRowDTO[]>('/completed') });
export const useActivity = () => useQuery({ queryKey: keys.activity, queryFn: () => api<ActivityDTO[]>('/activity') });
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: () => api<NotificationDTO[]>('/notifications') });
export const useEmployees = (enabled: boolean) =>
  useQuery({ queryKey: keys.employees, queryFn: () => api<PersonDTO[]>('/employees'), enabled });

export function useTask(id: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.task(id ?? ''),
    queryFn: () => api<TaskDTO>(`/tasks/${id}`),
    enabled: !!id,
    initialData: () => qc.getQueryData<TaskDTO[]>(keys.tasks)?.find((t) => t.id === id),
    initialDataUpdatedAt: () => qc.getQueryState(keys.tasks)?.dataUpdatedAt,
  });
}

/** Writes a fresh task into every cached view of it, then refreshes the derived lists. */
export function putTask(qc: QueryClient, task: TaskDTO) {
  qc.setQueryData(keys.task(task.id), task);
  qc.setQueryData<TaskDTO[]>(keys.tasks, (list) => {
    if (!list) return list;
    const i = list.findIndex((t) => t.id === task.id);
    if (task.cancelledAt) return i < 0 ? list : list.filter((t) => t.id !== task.id);
    if (i < 0) return [task, ...list];
    const next = list.slice();
    next[i] = task;
    return next;
  });
  for (const k of [keys.stats, keys.completed, keys.activity]) qc.invalidateQueries({ queryKey: k });
}

export function dropTask(qc: QueryClient, id: string) {
  qc.setQueryData<TaskDTO[]>(keys.tasks, (list) => list?.filter((t) => t.id !== id));
  qc.removeQueries({ queryKey: keys.task(id) });
  for (const k of [keys.stats, keys.completed, keys.activity]) qc.invalidateQueries({ queryKey: k });
}

/** Fast lookups for people, departments and groups. HR and admins also get the full employee list. */
export function useLookup() {
  const { data: boot } = useBootstrap();
  const wide = boot?.me.role === 'hr' || boot?.me.role === 'admin';
  const { data: employees } = useEmployees(!!boot && wide);
  return useMemo(() => {
    const people = new Map<string, PersonDTO>();
    for (const p of boot?.people ?? []) people.set(p.id, p);
    for (const p of employees ?? []) people.set(p.id, p);
    const depts = new Map((boot?.departments ?? []).map((d) => [d.id, d]));
    const groups = new Map((boot?.groups ?? []).map((g) => [g.id, g]));
    return {
      boot,
      me: boot?.me,
      people,
      person: (id: string | null | undefined) => (id ? people.get(id) : undefined),
      depts,
      dept: (id: string | null | undefined) => (id ? depts.get(id) : undefined),
      groups,
      group: (id: string | null | undefined) => (id ? groups.get(id) : undefined),
      allPeople: [...people.values()],
    };
  }, [boot, employees]);
}
