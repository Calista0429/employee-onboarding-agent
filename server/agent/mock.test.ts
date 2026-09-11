// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMockProvider, parseDueDate, parseRequest } from './mock';

const reference = Date.parse('2026-09-10T00:00:00.000Z');

describe('offline agent request parsing', () => {
  it('extracts both recipients, the modules and the deadline from a Japanese instruction', () => {
    const plan = parseRequest('本人情報と給与振込口座の入社手続きフォームを作成して、田中 葵 tanaka@example.com と 小林 海 kobayashi@example.com に送ってください。期限は今月末です。', reference);
    expect(plan.intent).toBe('invite');
    expect(plan.modules).toEqual(['personal', 'bank']);
    expect(plan.dueDate).toBe('2026-09-30');
    expect(plan.recipients).toEqual([{ name: '田中 葵', email: 'tanaka@example.com' }, { name: '小林 海', email: 'kobayashi@example.com' }]);
  });

  it('reads names with honorifics and falls back to the local part of the address', () => {
    const plan = parseRequest('入社手続きを 田中さん(tanaka@example.com) と kobayashi@example.com に送ってください', reference);
    expect(plan.recipients).toEqual([{ name: '田中', email: 'tanaka@example.com' }, { name: 'kobayashi', email: 'kobayashi@example.com' }]);
    expect(plan.modules).toEqual(['personal', 'bank', 'commute']);
  });

  it('classifies reminder and status requests without inventing recipients', () => {
    expect(parseRequest('未提出の従業員にリマインドを送ってください', reference).intent).toBe('remind');
    expect(parseRequest('いまの手続きの進捗を教えてください', reference).intent).toBe('status');
    expect(parseRequest('こんにちは', reference).intent).toBe('unknown');
  });

  it('parses absolute and relative deadlines', () => {
    expect(parseDueDate('期限は 2027-03-31 です', reference)).toBe('2027-03-31');
    expect(parseDueDate('10月1日まで', reference)).toBe('2026-10-01');
    expect(parseDueDate('来月末まで', reference)).toBe('2026-10-31');
    expect(parseDueDate('できるだけ早く', reference)).toBe('2026-09-24');
  });
});

describe('offline agent tool plan', () => {
  it('creates a template first and then invites in a second step', async () => {
    const provider = createMockProvider({ now: () => '2026-09-10T00:00:00.000Z' });
    const first = await provider.complete([{ role: 'user', content: '入社手続きフォームを作成して、田中 葵 tanaka@example.com に送ってください。' }], []);
    expect(first.toolCalls.map((call) => call.name)).toEqual(['create_template']);
    const second = await provider.complete([
      { role: 'user', content: '入社手続きフォームを作成して、田中 葵 tanaka@example.com に送ってください。' },
      { role: 'assistant', content: '', toolCalls: first.toolCalls },
      { role: 'tool', toolCallId: first.toolCalls[0].id, name: 'create_template', content: JSON.stringify({ templateId: 'tpl-9' }) },
    ], []);
    expect(second.toolCalls.map((call) => call.name)).toEqual(['invite_employees']);
    expect(second.toolCalls[0].arguments).toMatchObject({ templateId: 'tpl-9' });
    const third = await provider.complete([
      { role: 'user', content: '入社手続きフォームを作成して、田中 葵 tanaka@example.com に送ってください。' },
      { role: 'assistant', content: '', toolCalls: first.toolCalls },
      { role: 'tool', toolCallId: first.toolCalls[0].id, name: 'create_template', content: JSON.stringify({ templateId: 'tpl-9' }) },
      { role: 'assistant', content: '', toolCalls: second.toolCalls },
      { role: 'tool', toolCallId: second.toolCalls[0].id, name: 'invite_employees', content: JSON.stringify({ invited: [{ email: 'tanaka@example.com' }] }) },
    ], []);
    expect(third.toolCalls).toHaveLength(0);
    expect(third.content).toContain('1名');
  });

  it('asks for recipients instead of guessing and reports tool failures', async () => {
    const provider = createMockProvider({ now: () => '2026-09-10T00:00:00.000Z' });
    const ask = await provider.complete([{ role: 'user', content: '入社手続きフォームを作成してください' }], []);
    expect(ask.toolCalls).toHaveLength(0);
    expect(ask.content).toContain('メールアドレス');
    const failed = await provider.complete([
      { role: 'user', content: '入社手続きを作成して tanaka@example.com に送ってください' },
      { role: 'tool', toolCallId: 'c1', name: 'create_template', content: JSON.stringify({ error: 'title は必須です。' }) },
    ], []);
    expect(failed.content).toContain('title は必須です。');
  });
});
