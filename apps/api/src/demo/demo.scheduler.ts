import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';
import { Events } from '../realtime/events';
import { NotificationsService } from '../notifications/notifications.service';
import { seedDemo } from './seed';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class Scheduler implements OnModuleInit {
  private log = new Logger('Scheduler');

  constructor(
    private registry: SchedulerRegistry,
    private prisma: PrismaService,
    private events: Events,
    private notes: NotificationsService,
    private tasks: TasksService,
  ) {}

  onModuleInit() {
    const tz = process.env.TZ || 'Asia/Riyadh';
    // Every morning, remind heads about tasks that became overdue yesterday.
    this.add('overdue', '0 8 * * *', tz, () => this.overdue());
    // Scheduled tasks become visible to their assignees on their start date.
    this.add('announce', '1 * * * *', tz, async () => void (await this.tasks.announceStarted()));
    setTimeout(() => void this.tasks.announceStarted().catch((e) => this.log.error('Announce failed', e)), 5_000);
    if (config.demoMode) {
      this.add('demo-reset', config.demoResetCron, tz, () => this.resetDemo());
      this.log.log(`Demo mode: data resets on "${config.demoResetCron}" (${tz})`);
      // Free hosting plans sleep, so a scheduled reset can be missed. Catch up on start.
      void this.resetIfStale();
    }
  }

  private async resetIfStale() {
    const org = await this.prisma.organization.findUnique({ where: { id: 'org' } }).catch(() => null);
    // An empty database is seeded by seed-if-empty (containers) or `pnpm db:seed` (development).
    if (org && Date.now() - org.seededAt.getTime() > 26 * 3600_000) await this.resetDemo().catch((e) => this.log.error('Start-up reset failed', e));
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
