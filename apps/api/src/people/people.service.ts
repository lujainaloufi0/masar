import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser } from '../common/auth';
import { PERSON_INCLUDE, toPerson, toTask } from '../common/mappers';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Events } from '../realtime/events';

export interface PersonInput {
  nameEn: string;
  nameAr: string;
  email: string;
  titleEn: string;
  titleAr: string;
  deptId: string;
  groupId: string;
  role: Role;
}

/** Letters and digits that can't be misread (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newActivationCode() {
  const pick = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${pick()}-${pick()}`;
}

@Injectable()
export class PeopleService {
  constructor(
    private prisma: PrismaService,
    private activity: ActivityService,
    private notes: NotificationsService,
    private events: Events,
  ) {}

  async list() {
    const rows = await this.prisma.user.findMany({ include: PERSON_INCLUDE, orderBy: { empId: 'asc' } });
    return rows.map(toPerson);
  }

  private async checkPlacement(deptId: string, groupId: string) {
    const g = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!g || g.deptId !== deptId) throw new BadRequestException({ code: 'invalid', fields: { groupId: 'errGroup' } });
  }

  /** HR may not hand out administrator rights; only an administrator's own setup can. */
  private checkRole(me: AuthUser, role: Role, target?: { id: string; role: Role }) {
    if (role === 'admin' && target?.role !== 'admin') throw new ForbiddenException({ code: 'errRoleAdmin' });
    if (target && target.id === me.id && role !== target.role) throw new ForbiddenException({ code: 'errOwnRole' });
    if (target?.role === 'admin' && role !== 'admin') throw new ForbiddenException({ code: 'errRoleAdmin' });
  }

  private async nextEmpId(tx: Prisma.TransactionClient) {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: 'org' } });
    const rows = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SPLIT_PART("empId", '-', 2) AS INTEGER)) AS max FROM "User" WHERE "empId" ~ ${`^${org.idPrefix}-[0-9]+$`}`;
    return `${org.idPrefix}-${String((rows[0]?.max ?? 10000) + 1).padStart(5, '0')}`;
  }

  async create(me: AuthUser, input: PersonInput) {
    this.checkRole(me, input.role);
    await this.checkPlacement(input.deptId, input.groupId);
    const code = newActivationCode();
    const codeHash = await hash(code);
    for (let attempt = 0; ; attempt++) {
      try {
        const u = await this.prisma.$transaction(async (tx) => {
          const empId = await this.nextEmpId(tx);
          return tx.user.create({
            data: {
              empId, nameEn: input.nameEn, nameAr: input.nameAr, email: input.email.toLowerCase(),
              titleEn: input.titleEn || '-', titleAr: input.titleAr || input.titleEn || '-',
              role: input.role, deptId: input.deptId, activationCodeHash: codeHash,
              groups: { create: [{ groupId: input.groupId }] },
            },
            include: PERSON_INCLUDE,
          });
        });
        await this.activity.log({ type: 'emp_added', actorId: me.id, subject: { id: u.id, deptId: u.deptId } });
        this.events.org([u.deptId]);
        return { person: toPerson(u), activationCode: code };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const target = String((e.meta as { target?: string[] })?.target ?? '');
          if (target.includes('email')) throw new ConflictException({ code: 'invalid', fields: { email: 'errEmailTaken' } });
          if (attempt < 3) continue; // two HR staff added someone at the same moment; take the next number
        }
        throw e;
      }
    }
  }

  private async load(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: PERSON_INCLUDE });
    if (!u) throw new NotFoundException({ code: 'notFound' });
    return u;
  }

  /** Flags open tasks in a department that this person is on, and tells whoever should reassign them. */
  private async flagOpenTasks(userId: string, deptId: string, emp: { en: string; ar: string }) {
    const open = await this.prisma.task.findMany({
      where: { deptId, completedAt: null, cancelledAt: null, assignees: { some: { userId } } },
      include: { assignees: true, steps: true },
    });
    if (!open.length) return;
    await this.prisma.task.updateMany({ where: { id: { in: open.map((t) => t.id) } }, data: { flagged: true } });
    const dept = await this.prisma.department.findUnique({ where: { id: deptId } });
    let to = dept?.headId && dept.headId !== userId ? [dept.headId] : [];
    if (!to.length) to = (await this.prisma.user.findMany({ where: { role: 'admin', active: true }, select: { id: true } })).map((a) => a.id);
    await this.notes.send(to, 'flag', { n: open.length, emp }, open[0].id);
    for (const t of open) {
      const fresh = await this.prisma.task.findUnique({ where: { id: t.id }, include: { assignees: { select: { userId: true } }, steps: { orderBy: { position: 'asc' } } } });
      if (fresh) this.events.task(toTask(fresh));
    }
  }

  async update(me: AuthUser, id: string, input: PersonInput) {
    const u = await this.load(id);
    this.checkRole(me, input.role, u);
    await this.checkPlacement(input.deptId, input.groupId);
    const moved = u.deptId !== input.deptId;
    try {
      await this.prisma.$transaction([
        this.prisma.groupMembership.deleteMany({ where: { userId: id } }),
        this.prisma.user.update({
          where: { id },
          data: {
            nameEn: input.nameEn, nameAr: input.nameAr, email: input.email.toLowerCase(),
            titleEn: input.titleEn || '-', titleAr: input.titleAr || input.titleEn || '-',
            role: input.role, deptId: input.deptId, groups: { create: [{ groupId: input.groupId }] },
          },
        }),
        // A transferred head no longer heads the old department.
        ...(moved ? [this.prisma.department.updateMany({ where: { headId: id }, data: { headId: null } })] : []),
      ]);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException({ code: 'invalid', fields: { email: 'errEmailTaken' } });
      throw e;
    }
    if (moved) await this.flagOpenTasks(id, u.deptId, { en: input.nameEn, ar: input.nameAr });
    await this.activity.log({ type: 'emp_updated', actorId: me.id, subject: { id, deptId: input.deptId } });
    this.events.org([u.deptId, input.deptId]);
    return toPerson(await this.load(id));
  }

  /** Soft delete: the account can't sign in, history keeps the name, open work is flagged. */
  async deactivate(me: AuthUser, id: string) {
    if (id === me.id) throw new ForbiddenException({ code: 'errSelf' });
    const u = await this.load(id);
    if (!u.active) return toPerson(u);
    await this.prisma.user.update({ where: { id }, data: { active: false, leftAt: new Date(), tokenVersion: { increment: 1 } } });
    this.events.signOut(id);
    await this.flagOpenTasks(id, u.deptId, { en: u.nameEn, ar: u.nameAr });
    await this.activity.log({ type: 'emp_deactivated', actorId: me.id, subject: { id, deptId: u.deptId } });
    this.events.org([u.deptId]);
    return toPerson(await this.load(id));
  }

  async reactivate(me: AuthUser, id: string) {
    const u = await this.load(id);
    if (u.active) return toPerson(u);
    await this.prisma.user.update({ where: { id }, data: { active: true, leftAt: null } });
    await this.activity.log({ type: 'emp_reactivated', actorId: me.id, subject: { id, deptId: u.deptId } });
    this.events.org([u.deptId]);
    return toPerson(await this.load(id));
  }

  /** New one-time code for someone who hasn't signed in yet (the old one stops working). */
  async newCode(id: string) {
    const u = await this.load(id);
    if (u.passwordHash || !u.active) throw new BadRequestException({ code: 'errNotPending' });
    const code = newActivationCode();
    await this.prisma.user.update({ where: { id }, data: { activationCodeHash: await hash(code) } });
    return { activationCode: code };
  }
}
