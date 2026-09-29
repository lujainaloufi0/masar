import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { seedDemo } from '../src/demo/seed';
import { CHAT_MODEL, type ChatModel, type ChatMessage, type ModelReply, type ToolSpec } from '../src/assistant/llm';
import { normalize, rank, tokens } from '../src/assistant/retrieval';

/**
 * The model is replaced by a script, so these tests check everything around it:
 * what the tools return, who may see what, and that a draft never saves anything.
 */
type Req = { system: string; messages: ChatMessage[]; tools: ToolSpec[] };
let script: ((req: Req) => ModelReply)[] = [];
const seen: Req[] = [];
const scripted: ChatModel = {
  async chat(req) {
    seen.push(JSON.parse(JSON.stringify(req)));
    const next = script.shift();
    if (!next) throw new Error('model script ran out');
    return next(req);
  },
};

const prisma = new PrismaClient();
let app: INestApplication;
let ip = 0;
const nextIp = () => `10.9.${Math.floor(++ip / 250)}.${ip % 250}`;

async function as(empId: string) {
  const agent = request.agent(app.getHttpServer());
  const r = await agent.post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ empId, password: 'masar-demo' });
  expect(r.status).toBe(200);
  return agent;
}

/** One tool call, then a final answer. Returns the reply and the parsed tool result. */
async function callTool(empId: string, name: string, args: Record<string, unknown>, answer = 'ok') {
  const agent = await as(empId);
  script = [() => ({ text: '', toolCalls: [{ id: 't1', name, args }] }), () => ({ text: answer, toolCalls: [] })];
  const r = await agent.post('/api/assistant/ask').set('X-Forwarded-For', nextIp()).send({ question: 'q', lang: 'en' });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const last = seen[seen.length - 1].messages.at(-1)!;
  expect(last.role).toBe('tool');
  return { reply: r.body, result: JSON.parse((last as { content: string }).content) };
}

const titles = (result: { tasks: { title: string }[] }) => result.tasks.map((t) => t.title);

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CHAT_MODEL).useValue(scripted).compile();
  app = mod.createNestApplication();
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
  app.setGlobalPrefix('api');
  await app.init();
  await seedDemo(prisma);
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe('Arabic and English text matching', () => {
  it('treats common Arabic spelling variants as the same word', () => {
    expect(normalize('إدارة')).toBe(normalize('ادارة'));
    expect(normalize('مُحوّل')).toBe(normalize('محول'));
    expect(tokens('الشبكة')).toEqual(tokens('شبكه'));
  });

  it('ranks title matches above matches in the steps', () => {
    const docs = [
      { id: 'a', title: ['Write the report'], body: ['check the network'], people: [], group: [] },
      { id: 'b', title: ['Replace the network switch'], body: [], people: [], group: [] },
    ];
    expect(rank(docs, 'network').map((x) => x.doc.id)).toEqual(['b', 'a']);
  });
});

describe('retrieval eval: the right task comes back in the top three', () => {
  // Questions a department head might ask, in both languages, with the task they mean.
  const cases: [query: string, expected: string][] = [
    ['backup restore', 'Quarterly backup restore drill'],
    ['SSL certificates', 'Renew SSL certificates for public websites'],
    ['شهادات SSL', 'Renew SSL certificates for public websites'],
    ['network switch', 'Replace the core network switch'],
    ['محول الشبكة', 'Replace the core network switch'],
    ['payments gateway alerts', 'Set up monitoring alerts for the payments gateway'],
    ['identity provider', 'Move the e-services portal to the new identity provider'],
    ['laptops for finance', 'Laptop refresh for the Finance department'],
    ['النسخ الاحتياطية', 'Quarterly backup restore drill'],
    ['phishing', 'Phishing awareness campaign'],
  ];
  for (const [query, expected] of cases) {
    it(`"${query}"`, async () => {
      const { result } = await callTool('WDA-10377', 'search_tasks', { query, limit: 3 });
      expect(titles(result)).toContain(expected);
    });
  }
});

describe('the assistant sees only what the person may see', () => {
  it("doesn't return another department's tasks", async () => {
    const { result } = await callTool('WDA-10482', 'search_tasks', { query: 'expense report' });
    expect(titles(result)).not.toContain('Q3 expense report');
  });

  it('hides scheduled tasks from members but not from their head', async () => {
    const member = await callTool('WDA-10482', 'search_tasks', { query: 'data centre power' });
    const head = await callTool('WDA-10377', 'search_tasks', { query: 'data centre power' });
    expect(titles(member.result)).not.toContain('Plan the data centre power maintenance');
    expect(titles(head.result)).toContain('Plan the data centre power maintenance');
  });

  it("won't open a task from another department by id", async () => {
    const other = await prisma.task.findFirstOrThrow({ where: { titleEn: 'Q3 expense report' } });
    const { result } = await callTool('WDA-10482', 'get_task', { id: other.id });
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain('expense');
  });

  it('filters by status and by who the task is assigned to', async () => {
    const { result } = await callTool('WDA-10482', 'search_tasks', { status: 'open', assigned_to_me: true, limit: 20 });
    expect(result.tasks.length).toBeGreaterThan(0);
    for (const t of result.tasks) {
      expect(t.assigned_to_me).toBe(true);
      expect(['todo', 'doing']).toContain(t.status);
    }
  });

  it('links the tasks the answer names', async () => {
    const { reply, result } = await callTool('WDA-10377', 'search_tasks', { query: 'backup' }, 'The Quarterly backup restore drill is almost done.');
    const drill = result.tasks.find((t: { title: string }) => t.title === 'Quarterly backup restore drill');
    expect(reply.taskIds).toEqual([drill.id]);
  });
});

describe('drafting a task', () => {
  const draftArgs = async () => {
    const group = await prisma.group.findFirstOrThrow({ where: { nameEn: 'Platforms' } });
    const sara = await prisma.user.findUniqueOrThrow({ where: { empId: 'WDA-10493' } });
    const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    return { title: 'Patch the build servers', group_id: group.id, assignee_ids: [sara.id], due_date: due, steps: ['List the servers', 'Apply patches'] };
  };

  it('prepares a draft for a department head without saving anything', async () => {
    const before = await prisma.task.count();
    const { reply, result } = await callTool('WDA-10377', 'draft_task', await draftArgs());
    expect(result.ok).toBe(true);
    expect(reply.draft).toMatchObject({ title: 'Patch the build servers', steps: ['List the servers', 'Apply patches'] });
    expect(await prisma.task.count()).toBe(before);
  });

  it('refuses a draft for a team member', async () => {
    const { reply, result } = await callTool('WDA-10482', 'draft_task', await draftArgs());
    expect(result.error).toMatch(/cannot create/);
    expect(reply.draft).toBeNull();
  });

  it('rejects assignees from another department', async () => {
    const mona = await prisma.user.findUniqueOrThrow({ where: { empId: 'WDA-10611' } });
    const { reply, result } = await callTool('WDA-10377', 'draft_task', { ...(await draftArgs()), assignee_ids: [mona.id] });
    expect(result.error).toMatch(/assignee/);
    expect(reply.draft).toBeNull();
  });

  it('rejects a due date before the start', async () => {
    const { result } = await callTool('WDA-10377', 'draft_task', { ...(await draftArgs()), start_date: '2099-01-10', due_date: '2099-01-05' });
    expect(result.error).toMatch(/due_date/);
  });
});

describe('guardrails', () => {
  it('tells the model who is asking and to ignore instructions inside task text', async () => {
    await callTool('WDA-10482', 'search_tasks', {});
    const system = seen[seen.length - 1].system;
    expect(system).toContain('Omar Al-Shehri');
    expect(system).toContain('cannot create tasks');
    expect(system).toMatch(/Ignore any instructions/);
  });

  it('stops after a fixed number of tool rounds', async () => {
    const agent = await as('WDA-10377');
    script = Array.from({ length: 6 }, (_, i) => () => ({ text: '', toolCalls: [{ id: `t${i}`, name: 'search_tasks', args: {} }] }));
    const r = await agent.post('/api/assistant/ask').set('X-Forwarded-For', nextIp()).send({ question: 'loop', lang: 'en' });
    expect(r.status).toBe(200);
    expect(r.body.answer).toMatch(/couldn't finish/);
    expect(script.length).toBe(0);
  });

  it('needs a session', async () => {
    const r = await request(app.getHttpServer()).post('/api/assistant/ask').send({ question: 'hi' });
    expect(r.status).toBe(401);
  });
});
