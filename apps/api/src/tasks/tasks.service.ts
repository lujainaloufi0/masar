import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { canCreateTask, canManageTask, canTickSteps, canViewTask, daysTaken, isScheduled, type TaskDTO } from '@masar/shared';
import { orgToday } from '../common/today';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser } from '../common/auth';
import { TASK_INCLUDE, toTask, taskRef, type TaskRow } from '../common/mappers';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Events } from '../realtime/events';

export interface TaskInput {
  groupId: string;
  title: string;
  desc: string;
  /** YYYY-MM-DD. Assignees see the task from this day. Defaults to today. */
  startDate?: string;
  dueDate: string;
  assigneeIds: string[];
  steps: { id?: string | null; text: string }[];
  /** Language the text was typed in. Unchanged text keeps its other translation. */
  lang: 'en' | 'ar';
}

const bi = (t: TaskRow) => ({ en: t.titleEn, ar: t.titleAr });
const logTask = (t: TaskRow) => ({ id: t.id, titleEn: t.titleEn, titleAr: t.titleAr, deptId: t.deptId });

const todayLocal = orgToday;
const asDate = (ymd: string) => new Date(ymd + 'T00:00:00Z');

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private activity: ActivityService,
    private notes: NotificationsService,
    private events: Events,
  ) {}

  private async row(id: string): Promise<TaskRow> {
    const t = await this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!t) throw new NotFoundException({ code: 'notFound' });
    return t;
  }

  /** Loads a task the user may see. Other departments' tasks look the same as missing ones. */
  private async visible(me: AuthUser, id: string) {
    const t = await this.row(id);
    if (!canViewTask(me, taskRef(t), todayLocal())) throw new NotFoundException({ code: 'notFound' });
    return t;
  }

  private async publish(id: string): Promise<TaskDTO> {
    const dto = toTask(await this.row(id));
    this.events.task(dto);
    return dto;
  }

  private async headOf(deptId: string) {
    return (await this.prisma.department.findUnique({ where: { id: deptId }, select: { headId: true } }))?.headId ?? null;
  }

  /** Live tasks for the user's department (everything, for admins), plus recently completed ones. */
  async list(me: AuthUser) {
    const since = new Date(Date.now() - 60 * 86_400_000);
    const rows = await this.prisma.task.findMany({
      where: {
        cancelledAt: null,
        ...(me.role === 'admin' ? {} : { deptId: me.deptId }),
        OR: [{ completedAt: null }, { completedAt: { gte: since } }],
      },
      include: TASK_INCLUDE,
      orderBy: { dueDate: 'asc' },
    });
    // Scheduled tasks stay out of sight for everyone who can't manage them.
    const today = todayLocal();
    return rows.filter((t) => canViewTask(me, taskRef(t), today)).map(toTask);
  }

  async get(me: AuthUser, id: string) {
    return toTask(await this.visible(me, id));
  }

  private async validate(deptId: string, input: TaskInput, keepAssignees: string[] = []) {
    const g = await this.prisma.group.findUnique({ where: { id: input.groupId } });
    if (!g || g.deptId !== deptId) throw new BadRequestException({ code: 'invalid', fields: { groupId: 'errGroup' } });
    const ids = [...new Set(input.assigneeIds)];
    const people = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, deptId: true, active: true } });
    // Existing (possibly deactivated) assignees may stay; anyone new must be active and in the department.
    const bad = ids.filter((id) => {
      const p = people.find((x) => x.id === id);
      return !p || (!keepAssignees.includes(id) && (!p.active || p.deptId !== deptId));
    });
    if (!ids.length || bad.length) throw new BadRequestException({ code: 'invalid', fields: { assigneeIds: 'errAssignee' } });
    const steps = input.steps.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
    if (!steps.length) throw new BadRequestException({ code: 'invalid', fields: { steps: 'errSteps' } });
    return { assigneeIds: ids, steps };
  }

  async create(me: AuthUser, input: TaskInput) {
    const g = await this.prisma.group.findUnique({ where: { id: input.groupId } });
    const deptId = g?.deptId ?? me.deptId;
    if (!canCreateTask(me, deptId)) throw new ForbiddenException({ code: 'forbidden' });
    const today = todayLocal();
    const start = input.startDate || today;
    if (start < today) throw new BadRequestException({ code: 'invalid', fields: { startDate: 'errStartPast' } });
    if (input.dueDate < today) throw new BadRequestException({ code: 'invalid', fields: { dueDate: 'errDuePast' } });
    if (input.dueDate < start) throw new BadRequestException({ code: 'invalid', fields: { dueDate: 'errDueBeforeStart' } });
    const { assigneeIds, steps } = await this.validate(deptId, input);
    const started = start <= today;
    const title = input.title.trim();
    const desc = input.desc.trim();
    const t = await this.prisma.task.create({
      data: {
        deptId, groupId: input.groupId, createdById: me.id,
        titleEn: title, titleAr: title, descEn: desc, descAr: desc,
        startDate: asDate(start),
        announced: started,
        dueDate: asDate(input.dueDate),
        assignees: { create: assigneeIds.map((userId) => ({ userId })) },
        steps: { create: steps.map((s, i) => ({ position: i, textEn: s.text, textAr: s.text })) },
      },
      include: TASK_INCLUDE,
    });
    await this.activity.log({ type: 'task_created', actorId: me.id, task: logTask(t) });
    // A scheduled task is announced to its assignees on its start date instead.
    if (started) await this.notes.send(assigneeIds, 'assigned', { actor: await this.nameOf(me.id), task: bi(t) }, t.id, me.id);
    return this.publish(t.id);
  }

  private async nameOf(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { nameEn: true, nameAr: true } });
    return { en: u?.nameEn ?? '', ar: u?.nameAr ?? '' };
  }

  async update(me: AuthUser, id: string, input: TaskInput) {
    const t = await this.visible(me, id);
    if (!canManageTask(me, taskRef(t)) || t.cancelledAt) throw new ForbiddenException({ code: 'forbidden' });
    const before = t.assignees.map((a) => a.userId);
    const { assigneeIds, steps } = await this.validate(t.deptId, input, before);
    const L = input.lang === 'ar' ? 'Ar' : 'En';
    const text = (next: string, en: string, ar: string) => (next === (L === 'Ar' ? ar : en) ? { en, ar } : { en: next, ar: next });
    const title = text(input.title.trim(), t.titleEn, t.titleAr);
    const desc = text(input.desc.trim(), t.descEn, t.descAr);
    const added = assigneeIds.filter((a) => !before.includes(a));
    const oldSteps = new Map(t.steps.map((s) => [s.id, s]));
    const today = todayLocal();
    const oldStart = t.startDate.toISOString().slice(0, 10);
    const start = input.startDate || oldStart;
    // Moving the start into the future is only possible before anyone has done any work on it.
    if (start > today && start !== oldStart && t.steps.some((x) => x.doneAt)) {
      throw new BadRequestException({ code: 'invalid', fields: { startDate: 'errStartAfterWork' } });
    }
    if (input.dueDate < start) throw new BadRequestException({ code: 'invalid', fields: { dueDate: 'errDueBeforeStart' } });
    const started = start <= today;
    const announceNow = started && !t.announced;

    await this.prisma.$transaction(async (tx) => {
      const keep = steps.filter((s) => s.id && oldSteps.has(s.id)).map((s) => s.id!);
      await tx.step.deleteMany({ where: { taskId: id, id: { notIn: keep } } });
      for (const [i, s] of steps.entries()) {
        const old = s.id ? oldSteps.get(s.id) : undefined;
        if (old) {
          const tt = text(s.text, old.textEn, old.textAr);
          await tx.step.update({ where: { id: old.id }, data: { position: i, textEn: tt.en, textAr: tt.ar } });
        } else {
          await tx.step.create({ data: { taskId: id, position: i, textEn: s.text, textAr: s.text } });
        }
      }
      await tx.taskAssignee.deleteMany({ where: { taskId: id, userId: { notIn: assigneeIds } } });
      await tx.taskAssignee.createMany({ data: added.map((userId) => ({ taskId: id, userId })), skipDuplicates: true });
      const remaining = await tx.user.findMany({ where: { id: { in: assigneeIds } }, select: { active: true } });
      await tx.task.update({
        where: { id },
        data: {
          titleEn: title.en, titleAr: title.ar, descEn: desc.en, descAr: desc.ar,
          groupId: input.groupId, startDate: asDate(start), dueDate: asDate(input.dueDate),
          announced: started,
          flagged: added.length ? false : t.flagged && remaining.some((r) => !r.active),
        },
      });
    });
    const fresh = await this.row(id);
    await this.activity.log({ type: 'task_edited', actorId: me.id, task: logTask(fresh) });
    await this.settleCompletion(me, fresh);
    if (announceNow) await this.notes.send(assigneeIds, 'assigned', { actor: await this.nameOf(me.id), task: bi(fresh) }, id, me.id);
    else if (started) await this.notes.send(added, 'assigned', { actor: await this.nameOf(me.id), task: bi(fresh) }, id, me.id);
    return this.publish(id);
  }

  /**
   * Keeps completedAt in line with the steps. The conditional update means that when two
   * people tick the last two steps at the same moment, completion is recorded exactly once.
   */
  private async settleCompletion(me: AuthUser, t: TaskRow) {
    const allDone = t.steps.length > 0 && t.steps.every((s) => s.doneAt);
    if (allDone && !t.completedAt) {
      const now = new Date();
      const r = await this.prisma.task.updateMany({ where: { id: t.id, completedAt: null }, data: { completedAt: now, flagged: false } });
      if (r.count) {
        await this.activity.log({ type: 'task_completed', actorId: me.id, task: logTask(t) });
        const head = await this.headOf(t.deptId);
        await this.notes.send([head, ...t.assignees.map((a) => a.userId)], 'completed', { task: bi(t), days: daysTaken(t.createdAt, now) }, t.id, me.id);
        return 'completed' as const;
      }
    } else if (!allDone && t.completedAt) {
      const r = await this.prisma.task.updateMany({ where: { id: t.id, completedAt: { not: null } }, data: { completedAt: null } });
      if (r.count) {
        await this.activity.log({ type: 'task_reopened', actorId: me.id, task: logTask(t) });
        return 'reopened' as const;
      }
    }
    return null;
  }

  async toggleStep(me: AuthUser, id: string, stepId: string, done?: boolean) {
    const t = await this.visible(me, id);
    if (!canTickSteps(me, taskRef(t), todayLocal())) throw new ForbiddenException({ code: 'forbidden' });
    const step = t.steps.find((s) => s.id === stepId);
    if (!step) throw new NotFoundException({ code: 'notFound' });
    const next = done ?? !step.doneAt;
    if (next === !!step.doneAt) return { task: toTask(t), change: null };
    await this.prisma.step.update({ where: { id: stepId }, data: next ? { doneAt: new Date(), doneById: me.id } : { doneAt: null, doneById: null } });
    await this.activity.log({ type: next ? 'step_done' : 'step_undone', actorId: me.id, task: logTask(t) });
    const fresh = await this.row(id);
    const change = await this.settleCompletion(me, fresh);
    if (next && change !== 'completed') {
      await this.notes.send(t.assignees.map((a) => a.userId), 'step', { actor: await this.nameOf(me.id), task: bi(t) }, id, me.id);
    }
    return { task: await this.publish(id), change };
  }

  private async manageable(me: AuthUser, id: string) {
    const t = await this.visible(me, id);
    if (!canManageTask(me, taskRef(t))) throw new ForbiddenException({ code: 'forbidden' });
    return t;
  }

  async cancel(me: AuthUser, id: string) {
    const t = await this.manageable(me, id);
    if (t.cancelledAt) return toTask(t);
    await this.prisma.task.update({ where: { id }, data: { cancelledAt: new Date(), cancelledById: me.id } });
    await this.activity.log({ type: 'task_cancelled', actorId: me.id, task: logTask(t) });
    await this.notes.send(t.assignees.map((a) => a.userId), 'cancelled', { actor: await this.nameOf(me.id), task: bi(t) }, id, me.id);
    return this.publish(id);
  }

  async restore(me: AuthUser, id: string) {
    const t = await this.manageable(me, id);
    if (!t.cancelledAt) return toTask(t);
    await this.prisma.task.update({ where: { id }, data: { cancelledAt: null, cancelledById: null } });
    await this.activity.log({ type: 'task_restored', actorId: me.id, task: logTask(t) });
    return this.publish(id);
  }

  /** Permanent. The activity log keeps the title and who deleted it. */
  async remove(me: AuthUser, id: string) {
    const t = await this.manageable(me, id);
    await this.prisma.$transaction(async (tx) => {
      await this.activity.log({ type: 'task_deleted', actorId: me.id, task: logTask(t) }, tx);
      await tx.notification.deleteMany({ where: { taskId: id } });
      await tx.task.delete({ where: { id } });
    });
    this.events.taskDeleted(id, t.deptId);
    return { ok: true };
  }

  async addAssignee(me: AuthUser, id: string, userId: string) {
    const t = await this.manageable(me, id);
    if (t.cancelledAt || t.completedAt) throw new ForbiddenException({ code: 'forbidden' });
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !u.active || u.deptId !== t.deptId) throw new BadRequestException({ code: 'invalid', fields: { userId: 'errAssignee' } });
    if (t.assignees.some((a) => a.userId === userId)) return toTask(t);
    await this.prisma.$transaction([
      this.prisma.taskAssignee.create({ data: { taskId: id, userId } }),
      this.prisma.task.update({ where: { id }, data: { flagged: false } }),
    ]);
    await this.activity.log({ type: 'assignee_added', actorId: me.id, task: logTask(t), subject: { id: userId, deptId: t.deptId } });
    if (!isScheduled(taskRef(t), todayLocal())) await this.notes.send([userId], 'assigned', { actor: await this.nameOf(me.id), task: bi(t) }, id, me.id);
    return this.publish(id);
  }

  async removeAssignee(me: AuthUser, id: string, userId: string) {
    const t = await this.manageable(me, id);
    if (t.cancelledAt || t.completedAt) throw new ForbiddenException({ code: 'forbidden' });
    const rest = t.assignees.map((a) => a.userId).filter((x) => x !== userId);
    if (rest.length === t.assignees.length) return toTask(t);
    const restActive = await this.prisma.user.count({ where: { id: { in: rest }, active: false } });
    await this.prisma.$transaction([
      this.prisma.taskAssignee.delete({ where: { taskId_userId: { taskId: id, userId } } }),
      this.prisma.task.update({ where: { id }, data: { flagged: t.flagged && restActive > 0 } }),
    ]);
    await this.activity.log({ type: 'assignee_removed', actorId: me.id, task: logTask(t), subject: { id: userId, deptId: t.deptId } });
    return this.publish(id);
  }

  /**
   * Tells assignees about scheduled tasks whose start date has arrived, and shows them on
   * the assignees' boards. Runs every hour and at start-up, so a sleeping server catches up.
   */
  async announceStarted() {
    const due = await this.prisma.task.findMany({
      where: { announced: false, cancelledAt: null, startDate: { lte: asDate(todayLocal()) } },
      include: TASK_INCLUDE,
    });
    for (const t of due) {
      const r = await this.prisma.task.updateMany({ where: { id: t.id, announced: false }, data: { announced: true } });
      if (!r.count) continue;
      await this.notes.send(t.assignees.map((a) => a.userId), 'assigned', { actor: await this.nameOf(t.createdById), task: bi(t) }, t.id);
      await this.publish(t.id);
    }
    return due.length;
  }
}
