import { describe, expect, it } from 'vitest';
import { canManageTask, canTickSteps, canViewTask, canCreateTask, canVisit, daysTaken, dayDiff, progress, taskStatus } from './index';

const member = { id: 'm', role: 'member', deptId: 'it' } as const;
const other = { id: 'o', role: 'member', deptId: 'it' } as const;
const head = { id: 'h', role: 'manager', deptId: 'it' } as const;
const finHead = { id: 'f', role: 'manager', deptId: 'fin' } as const;
const admin = { id: 'a', role: 'admin', deptId: 'exec' } as const;
const hr = { id: 'r', role: 'hr', deptId: 'hr' } as const;
const task = { deptId: 'it', createdById: 'h', assigneeIds: ['m'] };

describe('progress', () => {
  it('is finished steps over total steps', () => {
    expect(progress([{ done: true }, { done: false }, { done: true }, { done: false }])).toBe(0.5);
    expect(progress([])).toBe(0);
  });
  it('derives status', () => {
    expect(taskStatus({ cancelledAt: null, completedAt: null, steps: [{ done: false }] })).toBe('todo');
    expect(taskStatus({ cancelledAt: null, completedAt: null, steps: [{ done: true }, { done: false }] })).toBe('doing');
    expect(taskStatus({ cancelledAt: null, completedAt: '2026-01-01', steps: [{ done: true }] })).toBe('done');
    expect(taskStatus({ cancelledAt: '2026-01-01', completedAt: null, steps: [] })).toBe('cancelled');
  });
});

describe('days', () => {
  it('counts calendar days and never goes negative', () => {
    expect(dayDiff('2026-09-01T23:00:00Z', '2026-09-02T01:00:00Z')).toBe(1);
    expect(daysTaken('2026-09-10', '2026-09-03')).toBe(0);
    expect(daysTaken('2026-09-01', '2026-09-08')).toBe(7);
  });
});

describe('task rights', () => {
  it('lets assignees, the head and admins tick steps', () => {
    expect(canTickSteps(member, task)).toBe(true);
    expect(canTickSteps(other, task)).toBe(false);
    expect(canTickSteps(head, task)).toBe(true);
    expect(canTickSteps(admin, task)).toBe(true);
    expect(canTickSteps(finHead, task)).toBe(false);
  });
  it('blocks ticking on a cancelled task', () => {
    expect(canTickSteps(member, { ...task, cancelledAt: new Date() })).toBe(false);
  });
  it('lets only the creator, the head and admins manage', () => {
    expect(canManageTask(member, task)).toBe(false);
    expect(canManageTask(head, task)).toBe(true);
    expect(canManageTask(admin, task)).toBe(true);
    expect(canManageTask(finHead, task)).toBe(false);
    expect(canManageTask(hr, task)).toBe(false);
  });
  it('limits task visibility to the department and admins', () => {
    expect(canViewTask(finHead, task)).toBe(false);
    expect(canViewTask(member, task)).toBe(true);
    expect(canViewTask(admin, task)).toBe(true);
  });
  it('lets heads create tasks only in their department', () => {
    expect(canCreateTask(head, 'it')).toBe(true);
    expect(canCreateTask(head, 'fin')).toBe(false);
    expect(canCreateTask(member, 'it')).toBe(false);
  });
  it('gives each role its own navigation', () => {
    expect(canVisit('member', 'employees')).toBe(false);
    expect(canVisit('hr', 'employees')).toBe(true);
    expect(canVisit('admin', 'departments')).toBe(true);
    expect(canVisit('manager', 'departments')).toBe(false);
  });
});
