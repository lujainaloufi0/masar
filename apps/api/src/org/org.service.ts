import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { canSeeCompletedDetails, daysTaken, type BootstrapDTO, type CompletedRowDTO } from '@masar/shared';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser } from '../common/auth';
import { PERSON_INCLUDE, TASK_INCLUDE, toDept, toGroup, toPerson, toTask } from '../common/mappers';
import { ActivityService } from '../activity/activity.service';
import { Events } from '../realtime/events';
import { orgToday } from '../common/today';

const DAY = 86_400_000;

@Injectable()
export class OrgService {
  constructor(private prisma: PrismaService, private activity: ActivityService, private events: Events) {}

  /**
   * Everything the app shell needs after sign-in. People outside your department are only
   * sent to HR and administrators; everyone else gets their own department plus the heads.
   */
  async bootstrap(me: AuthUser): Promise<BootstrapDTO> {
    const [org, departments, groups, self] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: 'org' } }),
      this.prisma.department.findMany({ orderBy: { nameEn: 'asc' } }),
      this.prisma.group.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: me.id }, include: PERSON_INCLUDE }),
    ]);
    const everyone = me.role === 'admin' || me.role === 'hr';
    const heads = departments.map((d) => d.headId).filter((x): x is string => !!x);
    const people = await this.prisma.user.findMany({
      where: everyone ? {} : { OR: [{ deptId: me.deptId }, { id: { in: heads } }] },
      include: PERSON_INCLUDE,
      orderBy: { empId: 'asc' },
    });
    const p = toPerson(self);
    return {
      me: { id: p.id, empId: p.empId, name: p.name, title: p.title, role: p.role, deptId: p.deptId, groupIds: p.groupIds, email: p.email },
      org: { name: { en: org.nameEn, ar: org.nameAr }, prefix: org.idPrefix },
      departments: departments.map(toDept),
      groups: groups.map(toGroup),
      people: people.map(toPerson),
    };
  }

  /** Aggregates only, so every role can compare departments without seeing their tasks. */
  async stats() {
    const now = Date.now();
    const [depts, people, open, done] = await Promise.all([
      this.prisma.department.findMany({ select: { id: true } }),
      this.prisma.user.groupBy({ by: ['deptId'], where: { active: true }, _count: { _all: true } }),
      this.prisma.task.groupBy({
        by: ['deptId'],
        where: { completedAt: null, cancelledAt: null, startDate: { lte: new Date(orgToday() + 'T00:00:00Z') } },
        _count: { _all: true },
      }),
      this.prisma.task.findMany({ where: { cancelledAt: null, completedAt: { gte: new Date(now - 60 * DAY) } }, select: { deptId: true, createdAt: true, completedAt: true } }),
    ]);
    return depts.map(({ id }) => {
      const d60 = done.filter((t) => t.deptId === id);
      const d30 = d60.filter((t) => t.completedAt!.getTime() >= now - 30 * DAY);
      return {
        deptId: id,
        people: people.find((p) => p.deptId === id)?._count._all ?? 0,
        open: open.find((o) => o.deptId === id)?._count._all ?? 0,
        done30: d30.length,
        avgDays60: d60.length ? d60.reduce((a, t) => a + daysTaken(t.createdAt, t.completedAt!), 0) / d60.length : null,
      };
    });
  }

  /** Field-level visibility: other departments' rows carry only name, department and days taken. */
  async completed(me: AuthUser): Promise<CompletedRowDTO[]> {
    const rows = await this.prisma.task.findMany({
      where: { completedAt: { not: null, gte: new Date(Date.now() - 365 * DAY) }, cancelledAt: null },
      include: TASK_INCLUDE,
      orderBy: { completedAt: 'desc' },
    });
    return rows.map((t) => {
      const days = daysTaken(t.createdAt, t.completedAt!);
      return canSeeCompletedDetails(me, t)
        ? { restricted: false, task: toTask(t), daysTaken: days }
        : { restricted: true, id: t.id, title: { en: t.titleEn, ar: t.titleAr }, deptId: t.deptId, daysTaken: days };
    });
  }

  /** Makes someone head of a department. They become a manager; the previous head becomes a member. */
  async setHead(me: AuthUser, deptId: string, userId: string) {
    const dept = await this.prisma.department.findUnique({ where: { id: deptId } });
    if (!dept) throw new NotFoundException({ code: 'notFound' });
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !u.active || u.deptId !== deptId) throw new BadRequestException({ code: 'invalid', fields: { userId: 'errHead' } });
    if (dept.headId === userId) return toDept(dept);
    await this.prisma.$transaction(async (tx) => {
      if (dept.headId) {
        const prev = await tx.user.findUnique({ where: { id: dept.headId } });
        if (prev?.role === 'manager') await tx.user.update({ where: { id: prev.id }, data: { role: 'member' } });
      }
      await tx.department.update({ where: { id: deptId }, data: { headId: userId } });
      if (u.role === 'member') await tx.user.update({ where: { id: userId }, data: { role: 'manager' } });
    });
    await this.activity.log({ type: 'head_changed', actorId: me.id, subject: { id: userId, deptId }, deptId });
    this.events.org([deptId]);
    return toDept((await this.prisma.department.findUnique({ where: { id: deptId } }))!);
  }

  async addGroup(me: AuthUser, deptId: string, name: string) {
    const dept = await this.prisma.department.findUnique({ where: { id: deptId } });
    if (!dept) throw new NotFoundException({ code: 'notFound' });
    const g = await this.prisma.group.create({ data: { deptId, nameEn: name, nameAr: name } });
    await this.activity.log({ type: 'group_added', actorId: me.id, groupId: g.id, deptId });
    this.events.org([deptId]);
    return toGroup(g);
  }
}
