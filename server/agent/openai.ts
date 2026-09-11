import type { AgentMessage, AgentProvider, AgentToolSpec } from '../../src/domain/agent';

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
};

function toOpenAi(messages: AgentMessage[]): OpenAiMessage[] {
  return messages.map((message) => {
    if (message.role === 'tool') return { role: 'tool', content: message.content, tool_call_id: message.toolCallId };
    if (message.role === 'assistant') {
      return {
        role: 'assistant', content: message.content,
        ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function' as const, function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) } : {}),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

/** Any `/chat/completions` endpoint works: DeepSeek, OpenAI, a gateway or a local runtime. */
export function createOpenAiCompatibleProvider(config: { apiKey: string; baseUrl: string; model: string }): AgentProvider {
  return {
    name: 'openai-compatible',
    async complete(messages: AgentMessage[], tools: AgentToolSpec[]) {
      const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages: toOpenAi(messages), tools: tools.map((tool) => ({ type: 'function', function: tool })), tool_choice: 'auto', temperature: 0.2 }),
      });
      if (!response.ok) throw new Error(`モデルプロバイダーが ${response.status} を返しました（${config.baseUrl} / ${config.model}）。AGENT_* の設定と、利用可能なモデル（GET ${config.baseUrl.replace(/\/+$/, '')}/models）をご確認ください。`);
      const payload = await response.json() as { choices?: { message?: { content?: string | null; tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[] } }[] };
      const message = payload.choices?.[0]?.message;
      if (!message) throw new Error('モデルプロバイダーから応答がありませんでした。');
      const toolCalls = (message.tool_calls ?? [])
        .filter((call) => typeof call.function?.name === 'string')
        .map((call) => ({ id: call.id, name: call.function?.name as string, arguments: parseArguments(call.function?.arguments ?? '{}') }));
      return { content: message.content ?? '', toolCalls };
    },
  };
}
