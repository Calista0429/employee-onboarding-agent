// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryPersistence } from '../src/store/memoryPersistence';
import { createWorkspaceStore } from '../src/store/workspaceStore';
import { createAgentProvider } from './agent/provider';
import { createRequestHandler } from './app';

const now = () => '2026-09-10T01:00:00.000Z';
const reminder = { idleHours: 0, maxReminders: 1 };
let server: Server;
let base = '';

beforeAll(async () => {
  let counter = 0;
  const store = createWorkspaceStore({ persistence: createMemoryPersistence(), mail: { deliver: async () => undefined }, appUrl: 'http://127.0.0.1:5173', reminder, now, id: () => `id-${(counter += 1)}` });
  const active = createAgentProvider({}, now);
  server = createServer(createRequestHandler({ store, provider: active.provider, model: active.model, simulated: active.simulated, reminder, distDir: '/nonexistent-dist', now, id: () => `req-${(counter += 1)}` }));
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => { server.close(() => resolve()); }));

const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('local API', () => {
  it('reports health, provider mode and the HR workspace', async () => {
    const health = await (await fetch(`${base}/api/health`)).json() as { ok: boolean; simulated: boolean };
    expect(health).toMatchObject({ ok: true, simulated: true });
    const view = await (await fetch(`${base}/api/workspace?role=hr`)).json() as { tasks: unknown[]; outbox: unknown[] };
    expect(view.tasks).toHaveLength(2);
    expect(view.outbox).toHaveLength(2);
  });

  it('keeps employee reads scoped to the verified address supplied by the UI', async () => {
    const view = await (await fetch(`${base}/api/workspace?role=employee&email=tanaka@example.com`)).json() as { tasks: { email: string }[]; templates: unknown[] };
    expect(view.tasks.map((task) => task.email)).toEqual(['tanaka@example.com']);
    expect(view.templates).toHaveLength(0);
  });

  it('rejects an employee using the assistant', async () => {
    const response = await post('/api/agent/chat', { actor: { role: 'employee', email: 'tanaka@example.com' }, messages: [{ role: 'user', content: 'hi' }] });
    expect(response.status).toBe(403);
  });

  it('creates and invites through the offline agent, then records reminders', async () => {
    const chat = await post('/api/agent/chat', { messages: [{ role: 'user', content: '本人情報の入社手続きフォームを作成して、佐藤 花子 sato@example.com に送ってください。期限は 2026-12-31 です。' }] });
    expect(chat.status).toBe(200);
    const result = await chat.json() as { reply: string; actions: string[]; transcript: { role: string }[]; workspace: { templates: { title: string }[]; tasks: { email: string }[]; notifications: unknown[] } };
    expect(result.actions).toEqual(['create_template', 'invite_employees']);
    expect(result.reply).toContain('1名');
    expect(result.workspace.tasks.some((task) => task.email === 'sato@example.com')).toBe(true);
    expect(result.workspace.templates.some((template) => template.title === '入社手続きフォーム')).toBe(true);

    const reminders = await (await post('/api/reminders/run', {})).json() as { reminded: string[]; workspace: { notifications: unknown[] } };
    expect(reminders.reminded).toHaveLength(3);
    const again = await (await post('/api/reminders/run', {})).json() as { reminded: string[] };
    expect(again.reminded).toEqual([]);

    // The returned transcript must be safe to send back unchanged: no system prompt, valid tool pairing.
    expect(result.transcript.some((message) => message.role === 'system')).toBe(false);
    const followUp = await post('/api/agent/chat', { messages: [...result.transcript, { role: 'user', content: '進捗を教えてください。' }] });
    expect(followUp.status).toBe(200);
    const followUpResult = await followUp.json() as { actions: string[] };
    expect(followUpResult.actions).toContain('get_workspace_overview');
  });

  it('rejects malformed requests and unknown routes', async () => {
    expect((await post('/api/workspace/action', { action: { type: 'NOT_A_REAL_ACTION' } })).status).toBe(400);
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
    expect((await post('/api/agent/chat', { messages: 'not-an-array' })).status).toBe(400);
  });
});
