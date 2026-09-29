import type { Activity, Attachment, Department, Group, Notification, Prisma, Step, Task, User } from '@prisma/client';
import type { ActivityDTO, ActivityType, AttachmentDTO, DepartmentDTO, GroupDTO, NotificationDTO, NotificationType, PersonDTO, StepDTO, TaskDTO } from '@masar/shared';

export const TASK_INCLUDE = {
  assignees: { select: { userId: true } },
  steps: { orderBy: { position: 'asc' } },
  _count: { select: { attachments: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Task & { assignees: { userId: string }[]; steps: Step[]; _count?: { attachments: number } };

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toStep(s: Step): StepDTO {
  return { id: s.id, text: { en: s.textEn, ar: s.textAr }, done: !!s.doneAt, doneById: s.doneById, doneAt: iso(s.doneAt) };
}

export function toTask(t: TaskRow): TaskDTO {
  return {
    id: t.id,
    deptId: t.deptId,
    groupId: t.groupId,
    createdById: t.createdById,
    assigneeIds: t.assignees.map((a) => a.userId),
    title: { en: t.titleEn, ar: t.titleAr },
    desc: { en: t.descEn, ar: t.descAr },
    createdAt: t.createdAt.toISOString(),
    startDate: t.startDate.toISOString().slice(0, 10),
    dueDate: t.dueDate.toISOString().slice(0, 10),
    completedAt: iso(t.completedAt),
    cancelledAt: iso(t.cancelledAt),
    cancelledById: t.cancelledById,
    flagged: t.flagged,
    steps: t.steps.map(toStep),
    attachmentCount: t._count?.attachments ?? 0,
  };
}

/** The actor/permission view of a task row. */
export const taskRef = (t: TaskRow) => ({
  deptId: t.deptId,
  createdById: t.createdById,
  assigneeIds: t.assignees.map((a) => a.userId),
  cancelledAt: t.cancelledAt,
  startDate: t.startDate.toISOString().slice(0, 10),
});

export function toPerson(u: User & { groups: { groupId: string }[] }): PersonDTO {
  return {
    id: u.id,
    empId: u.empId,
    name: { en: u.nameEn, ar: u.nameAr },
    title: { en: u.titleEn, ar: u.titleAr },
    role: u.role,
    deptId: u.deptId,
    groupIds: u.groups.map((g) => g.groupId),
    email: u.email,
    active: u.active,
    pendingPassword: !u.passwordHash,
    joinedAt: u.joinedAt.toISOString(),
    leftAt: iso(u.leftAt),
  };
}

export const toDept = (d: Department): DepartmentDTO => ({ id: d.id, name: { en: d.nameEn, ar: d.nameAr }, color: d.color, headId: d.headId });
export const toGroup = (g: Group): GroupDTO => ({ id: g.id, deptId: g.deptId, name: { en: g.nameEn, ar: g.nameAr } });

export function toActivity(a: Activity): ActivityDTO {
  return {
    id: a.id,
    at: a.at.toISOString(),
    type: a.type as ActivityType,
    actorId: a.actorId,
    taskId: a.taskId,
    taskTitle: a.taskTitleEn != null ? { en: a.taskTitleEn, ar: a.taskTitleAr ?? a.taskTitleEn } : null,
    empId: a.subjectId,
    groupId: a.groupId,
    deptId: a.deptId,
  };
}

export function toNotification(n: Notification): NotificationDTO {
  return { id: n.id, at: n.at.toISOString(), read: n.read, type: n.type as NotificationType, taskId: n.taskId, params: (n.params ?? {}) as NotificationDTO['params'] };
}

export const PERSON_INCLUDE = { groups: { select: { groupId: true } } } satisfies Prisma.UserInclude;

export const toAttachment = (a: Omit<Attachment, 'data'>): AttachmentDTO => ({
  id: a.id,
  taskId: a.taskId,
  uploaderId: a.uploaderId,
  name: a.name,
  mime: a.mime,
  size: a.size,
  createdAt: a.createdAt.toISOString(),
});
