// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HR_ACTOR, type Template } from '../domain/onboarding';
import { createMemoryPersistence } from './memoryPersistence';
import type { StoreDependencies } from './types';
import { createWorkspaceStore } from './workspaceStore';

const template = (): Omit<Template, 'createdAt'> => ({ id: 'tpl-1', title: '入社手続き', description: '', dueDate: '2026-12-31', modules: ['personal'], requiredFields: ['lastName'] });
const employee = { role: 'employee' as const, email: 'tanaka@example.com' };
const sato = { role: 'employee' as const, email: 'sato@example.com' };

function setup(options: { deliver?: () => Promise<void>; idleHours?: number; maxReminders?: number; now?: () => string } = {}) {
  let counter = 0;
  const deps: StoreDependencies = {
    persistence: createMemoryPersistence(),
    mail: { deliver: options.deliver ?? (async () => undefined) },
    appUrl: 'https://example.test/',
    reminder: { idleHours: options.idleHours ?? 0, maxReminders: options.maxReminders ?? 2 },
    now: options.now ?? (() => '2026-09-10T01:00:00.000Z'),
    id: () => `id-${(counter += 1)}`,
  };
  return createWorkspaceStore(deps);
}

describe('workspace store', () => {
  it('seeds once and scopes reads by actor', async () => {
    const store = setup();
    const hr = await store.read(HR_ACTOR);
    expect(hr.templates).toHaveLength(1);
    expect(hr.tasks).toHaveLength(2);
    expect(hr.outbox).toHaveLength(2);
    const view = await store.read(employee);
    expect(view.tasks.map((task) => task.email)).toEqual(['tanaka@example.com']);
    expect(view.templates).toHaveLength(0);
    expect(view.notifications).toHaveLength(1);
    expect(view.outbox).toHaveLength(1);
  });

  it('records an invitation as a notification, a simulated message and a delivery state', async () => {
    const store = setup();
    await store.act(HR_ACTOR, { type: 'CREATE_TEMPLATE', template: template() });
    const view = await store.act(HR_ACTOR, { type: 'INVITE', templateId: 'tpl-1', recipients: [{ name: '佐藤 花子', email: 'sato@example.com' }] });
    const task = view.tasks.find((item) => item.email === 'sato@example.com')!;
    expect(task.delivery).toBe('SIMULATED');
    expect(view.outbox.filter((message) => message.taskId === task.id)).toHaveLength(1);
    expect(view.notifications.filter((item) => item.taskId === task.id && item.kind === 'INVITED')).toHaveLength(1);
    const own = await store.read(sato);
    expect(own.notifications).toHaveLength(1);
    expect(own.outbox[0].body).toContain(`task=${task.id}`);
    expect(own.outbox[0].body).toContain('実際のメールは送信されません');
  });

  it('records a failed delivery and recovers on resend', async () => {
    let failing = true;
    const store = setup({ deliver: async () => { if (failing) throw new Error('transport unavailable'); } });
    await store.act(HR_ACTOR, { type: 'CREATE_TEMPLATE', template: template() });
    const invited = await store.act(HR_ACTOR, { type: 'INVITE', templateId: 'tpl-1', recipients: [{ name: '佐藤 花子', email: 'sato@example.com' }] });
    const task = invited.tasks.find((item) => item.email === 'sato@example.com')!;
    expect(task.delivery).toBe('FAILED');
    expect(task.deliveryError).toBeTruthy();
    expect(invited.outbox.filter((message) => message.taskId === task.id)).toHaveLength(0);
    failing = false;
    const resent = await store.act(HR_ACTOR, { type: 'RESEND', taskId: task.id });
    expect(resent.tasks.find((item) => item.id === task.id)?.delivery).toBe('SIMULATED');
    expect(resent.outbox.filter((message) => message.taskId === task.id)).toHaveLength(1);
  });

  it('runs the automatic reminder policy once and caps repeats', async () => {
    const store = setup({ idleHours: 0, maxReminders: 1 });
    expect((await store.runReminders()).sort()).toEqual(['demo-task-kobayashi', 'demo-task-tanaka']);
    expect(await store.runReminders()).toEqual([]);
    const view = await store.read(HR_ACTOR);
    expect(view.notifications.filter((item) => item.kind === 'REMINDER')).toHaveLength(2);
    expect(view.outbox.filter((message) => message.subject.startsWith('【リマインド】'))).toHaveLength(2);
    expect(view.tasks.every((task) => task.history.filter((entry) => entry.type === 'REMINDED').length === 1)).toBe(true);
  });

  it('marks notifications read for the acting user only', async () => {
    const store = setup({ idleHours: 0, maxReminders: 1 });
    await store.runReminders();
    const before = await store.read(employee);
    expect(before.notifications.find((item) => item.kind === 'REMINDER')?.readAt).toBeUndefined();
    const after = await store.markNotificationsRead(employee);
    expect(after.notifications.every((item) => item.readAt)).toBe(true);
    const hr = await store.read(HR_ACTOR);
    expect(hr.notifications.some((item) => item.kind === 'REMINDER' && !item.readAt)).toBe(true);
  });
});
