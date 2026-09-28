import type { Role } from './types';

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
}

/** A department head is a manager inside that department. */
export const isDeptHead = (a: Actor, deptId: string) => a.role === 'manager' && a.deptId === deptId;
export const isAdmin = (a: Actor) => a.role === 'admin';
export const isHR = (a: Actor) => a.role === 'hr';

/** Open a task and see its full details. */
export const canViewTask = (a: Actor, t: Pick<TaskRef, 'deptId'>) => isAdmin(a) || a.deptId === t.deptId;

/** Create tasks for a department: its head, or an administrator. */
export const canCreateTask = (a: Actor, deptId: string) => isAdmin(a) || isDeptHead(a, deptId);

/** Tick or untick steps: assignees, the department head and administrators, while the task is not cancelled. */
export const canTickSteps = (a: Actor, t: TaskRef) =>
  !t.cancelledAt && (t.assigneeIds.includes(a.id) || isDeptHead(a, t.deptId) || isAdmin(a));

/** Edit, cancel, restore or delete: the creator, the department head and administrators. */
export const canManageTask = (a: Actor, t: TaskRef) =>
  t.createdById === a.id || isDeptHead(a, t.deptId) || isAdmin(a);

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
