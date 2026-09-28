import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';
import { Events } from '../realtime/events';
import { NotificationsService } from '../notifications/notifications.service';
import { seedDemo } from './seed';

@Injectable()
export class Scheduler implements OnModuleInit {
  private log = new Logger('Scheduler');

  constructor(private registry: SchedulerRegistry, private prisma: PrismaService, private events: Events, private notes: NotificationsService) {}

  onModuleInit() {
    const tz = process.env.TZ || 'Asia/Riyadh';
    // Every morning, remind heads about tasks that became overdue yesterday.
    this.add('overdue', '0 8 * * *', tz, () => this.overdue());
    if (config.demoMode) {
      this.add('demo-reset', config.demoResetCron, tz, () => this.resetDemo());
      this.log.log(`Demo mode: data resets on "${config.demoResetCron}" (${tz})`);
    }
  }

  private add(name: string, cron: string, tz: string, fn: () => Promise<void>) {
    const job = CronJob.from({ cronTime: cron, timeZone: tz, onTick: () => fn().catch((e) => this.log.error(`${name} failed`, e)) });
    this.registry.addCronJob(name, job);
    job.start();
  }

  async resetDemo() {
    await seedDemo(this.prisma);
    this.events.reset();
    this.log.log('Demo data reset');
  }

  async overdue() {
    const today = new Date(new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00Z');
    const yesterday = new Date(today.getTime() - 86_400_000);
    const late = await this.prisma.task.findMany({
      where: { dueDate: yesterday, completedAt: null, cancelledAt: null },
      include: { dept: { select: { headId: true } } },
    });
    for (const t of late) await this.notes.send([t.dept.headId], 'overdue', { task: { en: t.titleEn, ar: t.titleAr } }, t.id);
  }
}
