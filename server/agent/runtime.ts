import type { AgentMessage, AgentProvider, AgentToolSpec } from '../../src/domain/agent';

export type AgentRunResult = { messages: AgentMessage[]; reply: string; actions: string[] };

/**
 * Provider-independent tool-calling loop. The provider proposes tool calls, the caller executes them and
 * feeds the results back, until the provider answers without tools. Tool failures are returned to the
 * model as data instead of aborting the turn, so a bad argument produces a correction, not a 500.
 */
export async function runAgent(input: {
  messages: AgentMessage[];
  provider: AgentProvider;
  tools: AgentToolSpec[];
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxSteps?: number;
}): Promise<AgentRunResult> {
  const messages = [...input.messages];
  const actions: string[] = [];
  const maxSteps = input.maxSteps ?? 6;
  for (let step = 0; step < maxSteps; step += 1) {
    const turn = await input.provider.complete(messages, input.tools);
    messages.push({ role: 'assistant', content: turn.content, ...(turn.toolCalls.length ? { toolCalls: turn.toolCalls } : {}) });
    if (!turn.toolCalls.length) return { messages, reply: turn.content, actions };
    for (const call of turn.toolCalls) {
      let content: string;
      try {
        content = JSON.stringify(await input.execute(call.name, call.arguments));
        actions.push(call.name);
      } catch (error) {
        content = JSON.stringify({ error: error instanceof Error ? error.message : 'The tool failed.' });
      }
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content });
    }
  }
  const reply = '操作の回数が上限に達しました。内容を分けて、もう一度お試しください。';
  messages.push({ role: 'assistant', content: reply });
  return { messages, reply, actions };
}
