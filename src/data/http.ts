import type { AgentChatResult, AgentClient, AgentMessage, AgentStatus } from '../domain/agent';
import type { Action, Actor, WorkspaceApi, WorkspaceView } from '../domain/onboarding';

function parseJson(text: string): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = parseJson(await response.text());
  if (!response.ok) throw new Error((payload as { error?: string } | null)?.error ?? `リクエストに失敗しました（${response.status}）。`);
  return payload as T;
}

const post = <T,>(path: string, body: unknown): Promise<T> => request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const actorQuery = (actor: Actor) => `role=${encodeURIComponent(actor.role)}&email=${encodeURIComponent(actor.email)}`;

/** Talks to the local Node service started by `npm run dev` or `npm start`. */
export const httpApi: WorkspaceApi = {
  load: (actor) => request<WorkspaceView>(`/api/workspace?${actorQuery(actor)}`),
  act: (actor, action: Action) => post<WorkspaceView>('/api/workspace/action', { actor, action }),
  reset: (actor) => post<WorkspaceView>('/api/workspace/reset', { actor }),
  markNotificationsRead: (actor, ids) => post<WorkspaceView>('/api/notifications/read', { actor, ids }),
  runReminders: (actor) => post<{ workspace: WorkspaceView; reminded: string[] }>('/api/reminders/run', { actor }),
};

export const httpAgent: AgentClient = {
  status: () => request<AgentStatus>('/api/agent/status'),
  chat: (messages: AgentMessage[]) => post<AgentChatResult>('/api/agent/chat', { messages }),
};
