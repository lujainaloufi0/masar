import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Bilingual, NotificationType } from '@masar/shared';
import { PrismaService } from '../common/prisma.service';
import { Events } from '../realtime/events';
import { toNotification } from '../common/mappers';

type Params = Record<string, Bilingual | string | number>;

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private events: Events) {}

  /** Stores the message key and its values; the web app renders it in the reader's language. */
  async send(to: (string | null | undefined)[], type: NotificationType, params: Params, taskId?: string | null, exclude?: string) {
    const ids = [...new Set(to.filter((x): x is string => !!x && x !== exclude))];
    if (!ids.length) return;
    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, type, taskId: taskId ?? null, params: params as Prisma.InputJsonValue })),
    });
    this.events.notify(ids);
  }

  async list(userId: string) {
    const rows = await this.prisma.notification.findMany({ where: { userId }, orderBy: { at: 'desc' }, take: 50 });
    return rows.map(toNotification);
  }

  async markRead(userId: string, id?: string) {
    await this.prisma.notification.updateMany({ where: { userId, ...(id ? { id } : {}) }, data: { read: true } });
    this.events.notify([userId]);
  }
}
