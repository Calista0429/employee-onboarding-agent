// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { AgentProvider, AgentTurn } from '../../src/domain/agent';
import { runAgent } from './runtime';

function providerOf(turns: AgentTurn[]): AgentProvider {
  let index = 0;
  return { name: 'scripted', complete: async () => { const turn = turns[Math.min(index, turns.length - 1)]; index += 1; return turn; } };
}

describe('agent runtime', () => {
  it('executes tool calls, feeds results back and stops when the model answers', async () => {
    const execute = vi.fn(async (name: string) => ({ ok: name }));
    const provider = providerOf([
      { content: '', toolCalls: [{ id: 'c1', name: 'create_template', arguments: { title: 'A' } }] },
      { content: '作成しました。', toolCalls: [] },
    ]);
    const result = await runAgent({ messages: [{ role: 'user', content: '作成して' }], provider, tools: [], execute });
    expect(result.reply).toBe('作成しました。');
    expect(result.actions).toEqual(['create_template']);
    expect(execute).toHaveBeenCalledWith('create_template', { title: 'A' });
    expect(result.messages.filter((message) => message.role === 'tool')).toHaveLength(1);
  });

  it('returns tool failures to the model instead of failing the request', async () => {
    const provider = providerOf([
      { content: '', toolCalls: [{ id: 'c1', name: 'invite_employees', arguments: {} }] },
      { content: '入力を確認してください。', toolCalls: [] },
    ]);
    const result = await runAgent({ messages: [{ role: 'user', content: 'invite' }], provider, tools: [], execute: async () => { throw new Error('templateId は必須です。'); } });
    const tool = result.messages.find((message) => message.role === 'tool');
    expect(tool?.content).toContain('templateId は必須です。');
    expect(result.actions).toEqual([]);
    expect(result.reply).toBe('入力を確認してください。');
  });

  it('stops at the step limit when the provider keeps calling tools', async () => {
    const provider: AgentProvider = { name: 'looping', complete: async () => ({ content: '', toolCalls: [{ id: `c${Math.random()}`, name: 'get_workspace_overview', arguments: {} }] }) };
    const result = await runAgent({ messages: [{ role: 'user', content: 'loop' }], provider, tools: [], execute: async () => ({}), maxSteps: 2 });
    expect(result.actions).toHaveLength(2);
    expect(result.reply).toContain('上限');
  });
});
