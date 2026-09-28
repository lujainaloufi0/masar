import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ActivityType } from '@masar/shared';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser } from '../common/auth';
import { toActivity } from '../common/mappers';

type Db = PrismaService | Prisma.TransactionClient;

export interface LogInput {
  type: ActivityType;
  actorId: string | null;
  task?: { id: string; titleEn: string; titleAr: string; deptId: string };
  subject?: { id: string; deptId: string };
  groupId?: string;
  deptId?: string;
}

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  log(input: LogInput, db: Db = this.prisma) {
    return db.activity.create({
      data: {
        type: input.type,
        actorId: input.actorId,
        taskId: input.task?.id,
        taskTitleEn: input.task?.titleEn,
        taskTitleAr: input.task?.titleAr,
        subjectId: input.subject?.id,
        groupId: input.groupId,
        deptId: input.deptId ?? input.task?.deptId ?? input.subject?.deptId,
      },
    });
  }

  /**
   * Who sees which entries:
   * admins see everything; HR sees employee changes and its own department;
   * heads see their department; members see task events for tasks they are on or did themselves.
   */
  async visibleFor(me: AuthUser, limit = 200) {
    const where: Prisma.ActivityWhereInput =
      me.role === 'admin' ? {}
      : me.role === 'hr' ? { OR: [{ subjectId: { not: null } }, { deptId: me.deptId }] }
      : me.role === 'manager' ? { deptId: me.deptId }
      : { deptId: me.deptId, taskId: { not: null } };
    const rows = await this.prisma.activity.findMany({ where, orderBy: { at: 'desc' }, take: me.role === 'member' ? limit * 3 : limit });
    if (me.role !== 'member') return rows.map(toActivity);
    const taskIds = [...new Set(rows.map((r) => r.taskId!).filter(Boolean))];
    const mine = new Set(
      (await this.prisma.taskAssignee.findMany({ where: { userId: me.id, taskId: { in: taskIds } }, select: { taskId: true } })).map((r) => r.taskId),
    );
    return rows.filter((r) => r.actorId === me.id || mine.has(r.taskId!)).slice(0, limit).map(toActivity);
  }
}
