import type { Role } from './types';
import { isScheduled } from './progress';

export interface Actor {
  id: string;
  role: Role;
  deptId: string;
}

export interface TaskRef {
  deptId: string;
  createdById: string;
  assigneeIds: readonly string[];
  cancelledAt?: unknown;
  startDate?: Date | string | null;
}

/** A department head is a manager inside that department. */
export const isDeptHead = (a: Actor, deptId: string) => a.role === 'manager' && a.deptId === deptId;
export const isAdmin = (a: Actor) => a.role === 'admin';
export const isHR = (a: Actor) => a.role === 'hr';

/** Edit, cancel, restore or delete: the creator, the department head and administrators. */
export const canManageTask = (a: Actor, t: TaskRef) =>
  t.createdById === a.id || isDeptHead(a, t.deptId) || isAdmin(a);

/**
 * Open a task and see its full details: its department and administrators.
 * A scheduled task (start date still ahead) is visible only to those who can manage it.
 * Pass `today` (YYYY-MM-DD) to apply the schedule rule.
 */
export const canViewTask = (a: Actor, t: Pick<TaskRef, 'deptId'> & Partial<TaskRef>, today?: string) => {
  const inScope = isAdmin(a) || a.deptId === t.deptId;
  if (!inScope) return false;
  if (today && isScheduled(t, today) && t.createdById !== undefined) return canManageTask(a, t as TaskRef);
  return true;
};

/** Create tasks for a department: its head, or an administrator. */
export const canCreateTask = (a: Actor, deptId: string) => isAdmin(a) || isDeptHead(a, deptId);

/** Tick or untick steps: assignees, the department head and administrators, once the task has started and while it isn't cancelled. */
export const canTickSteps = (a: Actor, t: TaskRef, today?: string) =>
  !t.cancelledAt && !(today && isScheduled(t, today)) && (t.assigneeIds.includes(a.id) || isDeptHead(a, t.deptId) || isAdmin(a));

/** Add files: anyone who can tick steps or manage the task, while it isn't cancelled. */
export const canAttach = (a: Actor, t: TaskRef) =>
  !t.cancelledAt && (t.assigneeIds.includes(a.id) || canManageTask(a, t));

/** Full details on the completed board. Others see only name, department and days taken. */
export const canSeeCompletedDetails = (a: Actor, t: Pick<TaskRef, 'deptId'>) => canViewTask(a, t);

/** Add, edit, transfer, deactivate employees. */
export const canManageEmployees = (a: Actor) => isHR(a);

/** Departments, groups and department heads. */
export const canManageOrg = (a: Actor) => isAdmin(a);

export type Route = 'overview' | 'tasks' | 'groups' | 'completed' | 'employees' | 'departments' | 'activity';

/** Navigation each role is allowed to see, in order. */
export const NAV: Record<Role, Route[]> = {
  member: ['overview', 'tasks', 'completed'],
  manager: ['overview', 'tasks', 'groups', 'completed', 'activity'],
  hr: ['overview', 'employees', 'completed', 'activity'],
  admin: ['overview', 'departments', 'employees', 'completed', 'activity'],
};

export const canVisit = (role: Role, route: Route) => NAV[role].includes(route);
