import type { WorkspaceView } from './onboarding';

/**
 * Provider-independent Agent contract. The browser UI and the local server share these types so a chat
 * transcript can travel over HTTP unchanged, no matter which model provider produced it.
 */
export type AgentToolCall = { id: string; name: string; arguments: Record<string, unknown> };
export type AgentMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AgentToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };
export type AgentToolSpec = { name: string; description: string; parameters: Record<string, unknown> };
export type AgentTurn = { content: string; toolCalls: AgentToolCall[] };
export type AgentProvider = { name: string; complete(messages: AgentMessage[], tools: AgentToolSpec[]): Promise<AgentTurn> };
export type AgentStatus = { provider: string; model: string; simulated: boolean; reminder: { idleHours: number; maxReminders: number } };
export type AgentChatResult = { reply: string; transcript: AgentMessage[]; workspace: WorkspaceView; actions: string[] };
export type AgentClient = { status(): Promise<AgentStatus>; chat(messages: AgentMessage[]): Promise<AgentChatResult> };
