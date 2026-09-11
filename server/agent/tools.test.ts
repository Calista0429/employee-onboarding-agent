// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HR_ACTOR } from '../../src/domain/onboarding';
import { createMemoryPersistence } from '../../src/store/memoryPersistence';
import { createWorkspaceStore } from '../../src/store/workspaceStore';
import { createAgentTools } from './tools';

function setup() {
  let counter = 0;
  const store = createWorkspaceStore({
    persistence: createMemoryPersistence(),
    mail: { deliver: async () => undefined },
    appUrl: 'https://example.test/',
    reminder: { idleHours: 0, maxReminders: 2 },
    now: () => '2026-09-10T01:00:00.000Z',
    id: () => `id-${(counter += 1)}`,
  });
  return { store, tools: createAgentTools({ store, actor: HR_ACTOR, now: () => '2026-09-10T01:00:00.000Z', id: () => 'tpl-agent' }) };
}

describe('agent tools', () => {
  it('creates a template and invites employees through the shared domain rules', async () => {
    const { store, tools } = setup();
    const created = await tools.execute('create_template', { title: 'エージェント作成', modules: ['bank'] }) as { templateId: string };
    expect(created.templateId).toBe('tpl-agent');
    const invited = await tools.execute('invite_employees', { templateId: 'tpl-agent', recipients: [{ name: '佐藤 花子', email: 'sato@example.com' }] }) as { invited: unknown[] };
    expect(invited.invited).toEqual([{ taskId: expect.any(String), name: '佐藤 花子', email: 'sato@example.com', delivery: 'SIMULATED' }]);
    const view = await store.read(HR_ACTOR);
    expect(view.tasks.some((task) => task.email === 'sato@example.com')).toBe(true);
    expect(view.notifications.some((item) => item.kind === 'INVITED' && item.email === 'sato@example.com')).toBe(true);
  });

  it('sends reminders carrying the HR message and rejects invalid arguments', async () => {
    const { store, tools } = setup();
    const result = await tools.execute('send_reminders', { message: '期限が近づいています。' }) as { reminded: string[] };
    expect(result.reminded).toHaveLength(2);
    const view = await store.read(HR_ACTOR);
    expect(view.notifications.some((item) => item.kind === 'REMINDER' && item.body.includes('期限が近づいています。'))).toBe(true);
    await expect(tools.execute('create_template', { title: '   ' })).rejects.toThrow(/title/);
    await expect(tools.execute('create_template', { title: 'A', dueDate: '2026-02-30' })).rejects.toThrow(/日付/);
    await expect(tools.execute('invite_employees', { templateId: 'missing', recipients: [{ name: 'A', email: 'a@example.com' }] })).rejects.toThrow(/not found/i);
    await expect(tools.execute('open_the_pod_bay_doors', {})).rejects.toThrow(/Unknown tool/);
  });
});
