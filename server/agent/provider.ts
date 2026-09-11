import type { AgentProvider } from '../../src/domain/agent';
import { createMockProvider } from './mock';
import { createOpenAiCompatibleProvider } from './openai';

export type ActiveProvider = { provider: AgentProvider; model: string; simulated: boolean };

/**
 * Chooses the Agent provider. Without `AGENT_API_KEY` the deterministic offline provider is used so the
 * demo always works; setting a key switches to an OpenAI-compatible endpoint. `AGENT_PROVIDER=mock`
 * forces offline mode even when a key is present.
 */
export function createAgentProvider(env: NodeJS.ProcessEnv = process.env, now: () => string = () => new Date().toISOString()): ActiveProvider {
  const requested = env.AGENT_PROVIDER?.trim().toLowerCase();
  const apiKey = env.AGENT_API_KEY?.trim();
  if (requested === 'mock' || !apiKey) return { provider: createMockProvider({ now }), model: 'mock', simulated: true };
  const model = env.AGENT_MODEL?.trim() || 'deepseek-chat';
  const baseUrl = env.AGENT_BASE_URL?.trim() || 'https://api.deepseek.com/v1';
  return { provider: createOpenAiCompatibleProvider({ apiKey, baseUrl, model }), model, simulated: false };
}
