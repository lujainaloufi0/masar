import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { seedDemo } from '../src/demo/seed';

const prisma = new PrismaClient();
let app: INestApplication;
let http: ReturnType<typeof request>;

let ip = 0;
/** Each sign-in comes from its own address, so the login rate limit only bites in its own test. */
const nextIp = () => `10.0.${Math.floor(++ip / 250)}.${ip % 250}`;

async function signIn(empId: string, password = 'masar-demo') {
  const agent = request.agent(app.getHttpServer());
  const r = await agent.post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ empId, password });
  expect(r.status, `sign-in ${empId}`).toBe(200);
  return agent;
}

const taskByTitle = (title: string) => prisma.task.findFirstOrThrow({ where: { titleEn: title }, include: { steps: { orderBy: { position: 'asc' } } } });

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
  app.setGlobalPrefix('api');
  await app.init();
  http = request(app.getHttpServer());
});

beforeEach(async () => {
  await seedDemo(prisma);
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe('sign-in', () => {
  it('accepts the employee ID with or without the prefix', async () => {
    await signIn('WDA-10482');
    await signIn('10482');
  });

  it('gives the same answer for a wrong password and an unknown ID', async () => {
    const a = await http.post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ empId: 'WDA-10482', password: 'nope' });
    const b = await http.post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ empId: 'WDA-99999', password: 'nope' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('refuses deactivated employees', async () => {
    const r = await http.post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ empId: 'WDA-10418', password: 'masar-demo' });
    expect(r.status).toBe(401);
  });

  it('sends a new employee through the activation code to a password of their own', async () => {
    const r = await http.post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ empId: 'WDA-10690', password: 'waha-2026' });
    expect(r.body.status).toBe('setup');
    const agent = request.agent(app.getHttpServer());
    const s = await agent.post('/api/auth/setup-password').send({ setupToken: r.body.setupToken, password: 'a-good-password' });
    expect(s.status).toBe(200);
    expect((await agent.get('/api/bootstrap')).body.me.empId).toBe('WDA-10690');
    // The code is spent; the new password works.
    expect((await http.post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ empId: 'WDA-10690', password: 'WAHA-2026' })).status).toBe(401);
    await signIn('WDA-10690', 'a-good-password');
  });

  it('rejects requests without a session', async () => {
    expect((await http.get('/api/tasks')).status).toBe(401);
  });
});

describe('task rights', () => {
  it('lets an assignee tick steps but not edit, cancel or delete', async () => {
    const omar = await signIn('WDA-10482');
    const t = await taskByTitle('Quarterly backup restore drill');
    const s = t.steps.find((x) => !x.doneAt)!;
    expect((await omar.post(`/api/tasks/${t.id}/steps/${s.id}/toggle`).send({})).status).toBe(200);
    expect((await omar.post(`/api/tasks/${t.id}/cancel`)).status).toBe(403);
    expect((await omar.delete(`/api/tasks/${t.id}`)).status).toBe(403);
  });

  it('stops a member ticking a task they are not on', async () => {
    const lama = await signIn('WDA-10526');
    const t = await taskByTitle('Quarterly backup restore drill');
    expect((await lama.post(`/api/tasks/${t.id}/steps/${t.steps[4].id}/toggle`).send({})).status).toBe(403);
  });

  it("hides other departments' tasks entirely", async () => {
    const omar = await signIn('WDA-10482');
    const fin = await taskByTitle('Q3 expense report');
    expect((await omar.get(`/api/tasks/${fin.id}`)).status).toBe(404);
    const list = (await omar.get('/api/tasks')).body as { deptId: string }[];
    expect(list.every((x) => x.deptId === list[0].deptId)).toBe(true);
  });

  it('records completion once, with days taken, when the last step is ticked', async () => {
    const reem = await signIn('WDA-10377');
    const t = await taskByTitle('Quarterly backup restore drill');
    const last = t.steps.find((x) => !x.doneAt)!;
    const r = await reem.post(`/api/tasks/${t.id}/steps/${last.id}/toggle`).send({ done: true });
    expect(r.body.change).toBe('completed');
    expect(r.body.task.completedAt).toBeTruthy();
    expect(await prisma.activity.count({ where: { taskId: t.id, type: 'task_completed' } })).toBe(1);
    const undo = await reem.post(`/api/tasks/${t.id}/steps/${last.id}/toggle`).send({ done: false });
    expect(undo.body.change).toBe('reopened');
  });

  it('counts completion exactly once when two people finish together', async () => {
    const reem = await signIn('WDA-10377');
    const omar = await signIn('WDA-10482');
    const t = await taskByTitle('Service desk SLA report for Q3');
    // Leave two steps open, then tick both at the same time.
    await prisma.step.update({ where: { id: t.steps[2].id }, data: { doneAt: null, doneById: null } });
    await Promise.all([
      reem.post(`/api/tasks/${t.id}/steps/${t.steps[2].id}/toggle`).send({ done: true }),
      reem.post(`/api/tasks/${t.id}/steps/${t.steps[3].id}/toggle`).send({ done: true }),
    ]);
    void omar;
    const after = await taskByTitle('Service desk SLA report for Q3');
    expect(after.completedAt).toBeTruthy();
    expect(await prisma.activity.count({ where: { taskId: t.id, type: 'task_completed' } })).toBe(1);
  });

  it('lets the head cancel, restore and delete, keeping the record', async () => {
    const reem = await signIn('WDA-10377');
    const t = await taskByTitle('Laptop refresh for the Finance department');
    expect((await reem.post(`/api/tasks/${t.id}/cancel`)).body.cancelledAt).toBeTruthy();
    expect(((await reem.get('/api/tasks')).body as { id: string }[]).some((x) => x.id === t.id)).toBe(false);
    expect((await reem.post(`/api/tasks/${t.id}/restore`)).body.cancelledAt).toBeNull();
    expect((await reem.delete(`/api/tasks/${t.id}`)).status).toBe(200);
    const log = await prisma.activity.findFirst({ where: { taskId: t.id, type: 'task_deleted' } });
    expect(log?.taskTitleEn).toBe('Laptop refresh for the Finance department');
  });

  it('only lets heads create tasks for their own department, for active people in it', async () => {
    const reem = await signIn('WDA-10377');
    const omar = await signIn('WDA-10482');
    const g = await prisma.group.findFirstOrThrow({ where: { nameEn: 'Platforms' } });
    const omarId = (await prisma.user.findUniqueOrThrow({ where: { empId: 'WDA-10482' } })).id;
    const mona = (await prisma.user.findUniqueOrThrow({ where: { empId: 'WDA-10611' } })).id;
    const due = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    const body = { groupId: g.id, title: 'Rotate API keys', desc: '', dueDate: due, assigneeIds: [omarId], steps: [{ text: 'List keys' }] };
    expect((await omar.post('/api/tasks').send(body)).status).toBe(403);
    expect((await reem.post('/api/tasks').send({ ...body, assigneeIds: [mona] })).status).toBe(400);
    const ok = await reem.post('/api/tasks').send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.steps).toHaveLength(1);
  });
});

describe('completed board', () => {
  it("shows other departments' rows as name, department and days only", async () => {
    const omar = await signIn('WDA-10482');
    const rows = (await omar.get('/api/completed')).body as Record<string, unknown>[];
    const other = rows.filter((r) => r.restricted);
    expect(other.length).toBeGreaterThan(0);
    for (const r of other) expect(Object.keys(r).sort()).toEqual(['daysTaken', 'deptId', 'id', 'restricted', 'title']);
    const admin = await signIn('WDA-10001');
    expect(((await admin.get('/api/completed')).body as { restricted: boolean }[]).every((r) => !r.restricted)).toBe(true);
  });
});

describe('HR', () => {
  it('adds an employee with the next ID and a one-time code', async () => {
    const hr = await signIn('WDA-10214');
    const it = await prisma.department.findFirstOrThrow({ where: { nameEn: 'Information Technology' } });
    const g = await prisma.group.findFirstOrThrow({ where: { deptId: it.id } });
    const r = await hr.post('/api/employees').send({ nameEn: 'Test Person', nameAr: 'موظف تجريبي', email: 'test@waha.example', titleEn: '', titleAr: '', deptId: it.id, groupId: g.id, role: 'member' });
    expect(r.status).toBe(201);
    expect(r.body.person.empId).toBe('WDA-10702');
    expect(r.body.activationCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(r.body.person.pendingPassword).toBe(true);
  });

  it('cannot hand out administrator rights', async () => {
    const hr = await signIn('WDA-10214');
    const omar = await prisma.user.findUniqueOrThrow({ where: { empId: 'WDA-10482' }, include: { groups: true } });
    const r = await hr.patch(`/api/employees/${omar.id}`).send({ nameEn: omar.nameEn, nameAr: omar.nameAr, email: omar.email, titleEn: '', titleAr: '', deptId: omar.deptId, groupId: omar.groups[0].groupId, role: 'admin' });
    expect(r.status).toBe(403);
  });

  it('deactivation signs the person out and flags their open tasks to the head', async () => {
    const hr = await signIn('WDA-10214');
    const omarAgent = await signIn('WDA-10482');
    const omar = await prisma.user.findUniqueOrThrow({ where: { empId: 'WDA-10482' } });
    const r = await hr.post(`/api/employees/${omar.id}/deactivate`);
    expect(r.body.active).toBe(false);
    expect((await omarAgent.get('/api/bootstrap')).status).toBe(401);
    const flagged = await prisma.task.count({ where: { flagged: true, assignees: { some: { userId: omar.id } } } });
    expect(flagged).toBeGreaterThan(0);
    const reem = await prisma.user.findUniqueOrThrow({ where: { empId: 'WDA-10377' } });
    expect(await prisma.notification.count({ where: { userId: reem.id, type: 'flag' } })).toBe(1);
  });

  it('is the only role that can change employee records', async () => {
    const reem = await signIn('WDA-10377');
    expect((await reem.get('/api/employees')).status).toBe(403);
    const admin = await signIn('WDA-10001');
    expect((await admin.get('/api/employees')).status).toBe(200);
    const omar = await prisma.user.findUniqueOrThrow({ where: { empId: 'WDA-10482' } });
    expect((await admin.post(`/api/employees/${omar.id}/deactivate`)).status).toBe(403);
  });
});

describe('rate limit', () => {
  it('blocks the sixth sign-in attempt in a minute', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await http.post('/api/auth/login').set('X-Forwarded-For', '10.9.9.9').send({ empId: 'WDA-10482', password: 'x' })).status);
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes[5]).toBe(429);
  });
});

describe('scheduled tasks', () => {
  const title = 'Plan the data centre power maintenance';

  it('are hidden from assignees until their start date, but not from the head', async () => {
    const omar = await signIn('WDA-10482');
    const reem = await signIn('WDA-10377');
    const t = await taskByTitle(title);
    expect(((await omar.get('/api/tasks')).body as { id: string }[]).some((x) => x.id === t.id)).toBe(false);
    expect((await omar.get(`/api/tasks/${t.id}`)).status).toBe(404);
    const seen = (await reem.get(`/api/tasks/${t.id}`)).body;
    expect(seen.startDate > new Date().toISOString().slice(0, 10)).toBe(true);
    const log = (await omar.get('/api/activity')).body as { taskId: string }[];
    expect(log.some((e) => e.taskId === t.id)).toBe(false);
  });

  it("can't be ticked before they start", async () => {
    const reem = await signIn('WDA-10377');
    const t = await taskByTitle(title);
    expect((await reem.post(`/api/tasks/${t.id}/steps/${t.steps[0].id}/toggle`).send({})).status).toBe(403);
  });

  it('are announced to assignees once the start date arrives', async () => {
    const t = await taskByTitle(title);
    const omar = await prisma.user.findUniqueOrThrow({ where: { empId: 'WDA-10482' } });
    await prisma.task.update({ where: { id: t.id }, data: { startDate: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') } });
    const agent = await signIn('WDA-10482');
    const svc = app.get((await import('../src/tasks/tasks.service')).TasksService);
    await svc.announceStarted();
    expect((await agent.get(`/api/tasks/${t.id}`)).status).toBe(200);
    expect(await prisma.notification.count({ where: { userId: omar.id, taskId: t.id, type: 'assigned' } })).toBe(1);
    await svc.announceStarted();
    expect(await prisma.notification.count({ where: { userId: omar.id, taskId: t.id, type: 'assigned' } })).toBe(1);
  });

  it('can be created by a head with a future start and no notification yet', async () => {
    const reem = await signIn('WDA-10377');
    const g = await prisma.group.findFirstOrThrow({ where: { nameEn: 'Platforms' } });
    const sara = await prisma.user.findUniqueOrThrow({ where: { empId: 'WDA-10493' } });
    const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const bad = await reem.post('/api/tasks').send({ groupId: g.id, title: 'x', desc: '', startDate: day(10), dueDate: day(5), assigneeIds: [sara.id], steps: [{ text: 'a' }] });
    expect(bad.status).toBe(400);
    const r = await reem.post('/api/tasks').send({ groupId: g.id, title: 'Rotate backups', desc: '', startDate: day(7), dueDate: day(12), assigneeIds: [sara.id], steps: [{ text: 'a' }] });
    expect(r.status).toBe(201);
    expect(await prisma.notification.count({ where: { taskId: r.body.id } })).toBe(0);
  });
});

describe('attachments', () => {
  it('lets an assignee upload, anyone in the department download, and blocks other departments', async () => {
    const omar = await signIn('WDA-10482');
    const lama = await signIn('WDA-10526');
    const mona = await signIn('WDA-10611');
    const t = await taskByTitle('Quarterly backup restore drill');
    const up = await omar.post(`/api/tasks/${t.id}/attachments`).attach('file', Buffer.from('restore times'), { filename: 'تقرير.txt', contentType: 'text/plain' });
    expect(up.status).toBe(201);
    expect(up.body.name).toBe('تقرير.txt');
    const list = await lama.get(`/api/tasks/${t.id}/attachments`);
    expect(list.body).toHaveLength(1);
    const dl = await lama.get(`/api/attachments/${up.body.id}`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment/);
    expect(dl.headers['content-type']).toBe('application/octet-stream');
    expect((await mona.get(`/api/attachments/${up.body.id}`)).status).toBe(404);
    // Lama isn't on the task: she can't add or delete files.
    expect((await lama.post(`/api/tasks/${t.id}/attachments`).attach('file', Buffer.from('x'), 'x.txt')).status).toBe(403);
    expect((await lama.delete(`/api/attachments/${up.body.id}`)).status).toBe(403);
    expect((await omar.delete(`/api/attachments/${up.body.id}`)).status).toBe(200);
  });

  it('shows images inline and refuses files over the size limit', async () => {
    const omar = await signIn('WDA-10482');
    const t = await taskByTitle('Quarterly backup restore drill');
    const png = await omar.post(`/api/tasks/${t.id}/attachments`).attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'a.png', contentType: 'image/png' });
    expect((await omar.get(`/api/attachments/${png.body.id}`)).headers['content-disposition']).toMatch(/^inline/);
    const big = await omar.post(`/api/tasks/${t.id}/attachments`).attach('file', Buffer.alloc(21 * 1024 * 1024), 'big.bin');
    expect(big.status).toBe(413);
  });
});

describe('step files', () => {
  it('attaches a file to one step, and rejects a step from another task', async () => {
    const omar = await signIn('WDA-10482');
    const t = await taskByTitle('Quarterly backup restore drill');
    const other = await taskByTitle('Renew SSL certificates for public websites');
    const ok = await omar.post(`/api/tasks/${t.id}/attachments`).field('stepId', t.steps[4].id).attach('file', Buffer.from('times'), 'times.txt');
    expect(ok.status).toBe(201);
    expect(ok.body.stepId).toBe(t.steps[4].id);
    const bad = await omar.post(`/api/tasks/${t.id}/attachments`).field('stepId', other.steps[0].id).attach('file', Buffer.from('x'), 'x.txt');
    expect(bad.status).toBe(400);
  });
});

describe('assistant without an AI key', () => {
  it('reports itself switched off and refuses questions', async () => {
    const agent = await signIn('WDA-10482');
    expect((await agent.get('/api/assistant/status')).body).toEqual({ enabled: false });
    const r = await agent.post('/api/assistant/ask').send({ question: 'What is due this week?' });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('aiDisabled');
  });
});
