import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import type { AgentChatResult, AgentMessage, AgentProvider, AgentStatus } from '../src/domain/agent';
import { HR_ACTOR, type Action, type Actor, type ReminderPolicy } from '../src/domain/onboarding';
import type { WorkspaceStore } from '../src/store/workspaceStore';
import { systemPrompt } from './agent/prompt';
import { runAgent } from './agent/runtime';
import { createAgentTools } from './agent/tools';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json; charset=utf-8',
};
const MAX_BODY = 512 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'The request body is too large.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch { throw new HttpError(400, 'The request body must be a JSON object.'); }
}

/** Local demo has no authentication by design: the server binds to loopback and the actor is chosen in the UI. */
function actorFrom(value: unknown): Actor {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (record.role !== 'employee') return HR_ACTOR;
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) throw new HttpError(400, 'A valid employee email is required.');
  return { role: 'employee', email };
}

function actorFromQuery(url: URL): Actor {
  return actorFrom({ role: url.searchParams.get('role') ?? 'hr', email: url.searchParams.get('email') ?? '' });
}

function normaliseMessages(value: unknown): AgentMessage[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'messages must be an array.');
  if (value.length > 40) throw new HttpError(400, 'The conversation is too long. Start a new request.');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(400, 'Invalid message.');
    const record = item as Record<string, unknown>;
    const content = typeof record.content === 'string' ? record.content.slice(0, 8_000) : '';
    if (record.role === 'user') {
      if (!content.trim()) throw new HttpError(400, 'A message is required.');
      return { role: 'user', content };
    }
    if (record.role === 'assistant') {
      const raw = Array.isArray(record.toolCalls) ? record.toolCalls : [];
      const toolCalls = raw.map((call) => {
        const entry = call as Record<string, unknown>;
        if (typeof entry?.id !== 'string' || typeof entry?.name !== 'string') throw new HttpError(400, 'Invalid tool call.');
        const args = entry.arguments && typeof entry.arguments === 'object' && !Array.isArray(entry.arguments) ? entry.arguments as Record<string, unknown> : {};
        return { id: entry.id, name: entry.name, arguments: args };
      });
      return { role: 'assistant', content, ...(toolCalls.length ? { toolCalls } : {}) };
    }
    if (record.role === 'tool') {
      if (typeof record.name !== 'string' || typeof record.toolCallId !== 'string') throw new HttpError(400, 'Invalid tool message.');
      return { role: 'tool', name: record.name, toolCallId: record.toolCallId, content };
    }
    throw new HttpError(400, 'Invalid message role.');
  });
}

function parseAction(value: unknown): Action {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as Action).type !== 'string') throw new HttpError(400, 'A workflow action is required.');
  return value as Action;
}

export type RequestHandlerOptions = {
  store: WorkspaceStore;
  provider: AgentProvider;
  model: string;
  simulated: boolean;
  reminder: ReminderPolicy;
  distDir: string;
  now(): string;
  id(): string;
};

export function createRequestHandler(options: RequestHandlerOptions) {
  const { store } = options;
  const dist = normalize(options.distDir);

  async function serveStatic(response: ServerResponse, pathname: string): Promise<void> {
    if (!existsSync(dist)) throw new HttpError(404, 'The frontend build was not found. Run `npm run build`, or use `npm run dev` for development.');
    const candidate = normalize(join(dist, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')));
    const file = candidate.startsWith(dist) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(dist, 'index.html');
    response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  }

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const { pathname } = url;
    const method = request.method ?? 'GET';

    if (pathname === '/api/health') return sendJson(response, 200, { ok: true, provider: options.model, simulated: options.simulated });
    if (pathname === '/api/agent/status' && method === 'GET') {
      return sendJson(response, 200, { provider: options.provider.name, model: options.model, simulated: options.simulated, reminder: options.reminder } satisfies AgentStatus);
    }
    if (pathname === '/api/workspace' && method === 'GET') {
      return sendJson(response, 200, await store.read(actorFromQuery(url)));
    }
    if (pathname === '/api/workspace/action' && method === 'POST') {
      const body = await readJson(request);
      return sendJson(response, 200, await store.act(actorFrom(body.actor), parseAction(body.action)));
    }
    if (pathname === '/api/workspace/reset' && method === 'POST') {
      const body = await readJson(request);
      return sendJson(response, 200, await store.reset(actorFrom(body.actor)));
    }
    if (pathname === '/api/notifications/read' && method === 'POST') {
      const body = await readJson(request);
      const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : undefined;
      return sendJson(response, 200, await store.markNotificationsRead(actorFrom(body.actor), ids));
    }
    if (pathname === '/api/reminders/run' && method === 'POST') {
      const actor = actorFrom((await readJson(request)).actor);
      if (actor.role !== 'hr') throw new HttpError(403, 'Only HR can run the reminder check.');
      const reminded = await store.runReminders();
      return sendJson(response, 200, { workspace: await store.read(actor), reminded });
    }
    if (pathname === '/api/agent/chat' && method === 'POST') {
      const body = await readJson(request);
      if (actorFrom(body.actor).role !== 'hr') throw new HttpError(403, 'The assistant is available to HR only.');
      const messages = normaliseMessages(body.messages);
      const tools = createAgentTools({ store, actor: HR_ACTOR, now: options.now, id: options.id });
      let result;
      try {
        result = await runAgent({
          messages: [{ role: 'system', content: systemPrompt(options.now()) }, ...messages],
          provider: options.provider,
          tools: tools.specs,
          execute: tools.execute,
        });
      } catch (error) {
        // Provider and transport failures are upstream problems, not invalid HR input.
        throw new HttpError(502, error instanceof Error ? error.message : 'The assistant could not complete the request.');
      }
      // The system prompt stays server-side so the returned transcript is safe to send back verbatim.
      return sendJson(response, 200, { reply: result.reply, transcript: result.messages.filter((message) => message.role !== 'system'), workspace: await store.read(HR_ACTOR), actions: result.actions } satisfies AgentChatResult);
    }
    if (pathname.startsWith('/api/')) throw new HttpError(404, 'Unknown API route.');
    if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    return serveStatic(response, pathname);
  }

  return function handle(request: IncomingMessage, response: ServerResponse): void {
    void route(request, response).catch((error: unknown) => {
      // Domain validation failures are client errors; only truly unexpected values become 500.
      const status = error instanceof HttpError ? error.status : error instanceof Error ? 400 : 500;
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      if (!response.headersSent) sendJson(response, status, { error: message });
      else response.end();
    });
  };
}
