import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { ACTIVITY, DEPARTMENTS, GROUPS, NOTIFICATIONS, ORG, TASKS, USERS } from './seed-data';

/** Riyadh is UTC+3 all year. Demo timestamps are written in local office hours. */
const TZ_OFFSET_H = 3;

export function dayOffset(now: Date, days: number, time = '09:00'): Date {
  const [h, m] = time.split(':').map(Number);
  const local = new Date(now.getTime() + TZ_OFFSET_H * 3600_000);
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, h - TZ_OFFSET_H, m));
  return d > now && days <= 0 ? new Date(now.getTime() - 60_000) : d;
}

export function dateOnly(now: Date, days: number): Date {
  const local = new Date(now.getTime() + TZ_OFFSET_H * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days));
}

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'masar-demo';
/** The new hire's one-time code in the demo, shown on the sign-in page. */
export const DEMO_ACTIVATION_CODE = 'WAHA-2026';

/** Removes all data, in dependency order. */
export async function wipe(prisma: PrismaClient | Prisma.TransactionClient) {
  await prisma.attachment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.step.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.groupMembership.deleteMany();
  await prisma.department.updateMany({ data: { headId: null } });
  await prisma.user.deleteMany();
  await prisma.group.deleteMany();
  await prisma.department.deleteMany();
  await prisma.organization.deleteMany();
}

/**
 * Replaces everything with the fictional demo organization.
 * Runs in one transaction, so visitors never see a half-reset database.
 */
export async function seedDemo(prisma: PrismaClient, now = new Date()) {
  const passwordHash = await hash(DEMO_PASSWORD);
  const activationCodeHash = await hash(DEMO_ACTIVATION_CODE);

  await prisma.$transaction(
    async (tx) => {
      await wipe(tx);
      await tx.organization.create({ data: { id: 'org', ...ORG } });

      const dept: Record<string, string> = {};
      for (const d of DEPARTMENTS) {
        const row = await tx.department.create({ data: { nameEn: d.name[0], nameAr: d.name[1], color: d.color } });
        dept[d.key] = row.id;
      }
      const group: Record<string, string> = {};
      for (const g of GROUPS) {
        const row = await tx.group.create({ data: { deptId: dept[g.dept], nameEn: g.name[0], nameAr: g.name[1], createdAt: dayOffset(now, -400) } });
        group[g.key] = row.id;
      }
      const user: Record<string, string> = {};
      for (const u of USERS) {
        const email = u.name[0].toLowerCase().replace(/[^a-z ]/g, '').replace(/ al /, '.al').replace(/ /g, '.') + '@waha.example';
        const row = await tx.user.create({
          data: {
            empId: `${ORG.idPrefix}-${u.num}`,
            nameEn: u.name[0], nameAr: u.name[1], titleEn: u.title[0], titleAr: u.title[1], email,
            role: u.role, deptId: dept[u.dept],
            passwordHash: u.pending ? null : passwordHash,
            activationCodeHash: u.pending ? activationCodeHash : null,
            active: u.active !== false,
            joinedAt: dayOffset(now, -(u.joinedDaysAgo ?? 400)),
            leftAt: u.leftDaysAgo ? dayOffset(now, -u.leftDaysAgo, '14:00') : null,
            groups: { create: u.groups.map((g) => ({ groupId: group[g] })) },
          },
        });
        user[u.key] = row.id;
      }
      for (const d of DEPARTMENTS) await tx.department.update({ where: { id: dept[d.key] }, data: { headId: user[d.head] } });

      const task: Record<string, { id: string; en: string; ar: string; dept: string }> = {};
      for (const t of TASKS) {
        const row = await tx.task.create({
          data: {
            deptId: dept[t.dept], groupId: group[t.group], createdById: user[t.by],
            titleEn: t.title[0], titleAr: t.title[1], descEn: t.desc?.[0] ?? '', descAr: t.desc?.[1] ?? '',
            createdAt: dayOffset(now, t.created, '08:30'),
            startDate: dateOnly(now, t.start ?? t.created),
            announced: (t.start ?? 0) <= 0,
            dueDate: dateOnly(now, t.due),
            completedAt: t.completed != null ? dayOffset(now, t.completed, '15:00') : null,
            assignees: { create: t.assignees.map((a) => ({ userId: user[a] })) },
            steps: {
              create: t.steps.map((s, i) => {
                const done = i < t.doneCount;
                return {
                  position: i, textEn: s[0], textAr: s[1],
                  doneAt: done ? dayOffset(now, Math.min(t.baseDay + i, t.completed ?? 0), '11:00') : null,
                  doneById: done ? user[t.doneBy[i % t.doneBy.length]] : null,
                };
              }),
            },
          },
        });
        task[t.key] = { id: row.id, en: t.title[0], ar: t.title[1], dept: dept[t.dept] };
      }

      for (const a of ACTIVITY) {
        const t = a.task ? task[a.task] : null;
        const subject = a.emp ? USERS.find((u) => u.key === a.emp)! : null;
        await tx.activity.create({
          data: {
            at: dayOffset(now, a.day, a.time), type: a.type, actorId: user[a.actor],
            taskId: t?.id ?? null, taskTitleEn: t?.en ?? null, taskTitleAr: t?.ar ?? null,
            subjectId: a.emp ? user[a.emp] : null,
            deptId: t?.dept ?? (subject ? dept[subject.dept] : null),
          },
        });
      }

      const nameOf = (key: string) => {
        const u = USERS.find((x) => x.key === key)!;
        return { en: u.name[0], ar: u.name[1] };
      };
      for (const n of NOTIFICATIONS) {
        const t = n.task ? task[n.task] : null;
        const params: Record<string, unknown> = {};
        if (t) params.task = { en: t.en, ar: t.ar };
        if (n.actor) params.actor = nameOf(n.actor);
        if (n.emp) params.emp = nameOf(n.emp);
        await tx.notification.create({
          data: { userId: user[n.to], at: dayOffset(now, n.day, n.time), read: !!n.read, type: n.type, taskId: t?.id ?? null, params: params as Prisma.InputJsonValue },
        });
      }
    },
    { timeout: 60_000 },
  );
}
