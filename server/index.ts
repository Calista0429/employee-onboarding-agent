import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkspaceStore } from '../src/store/workspaceStore';
import { createAgentProvider } from './agent/provider';
import { createRequestHandler } from './app';
import { loadEnvFiles, numberFrom } from './env';
import { createFilePersistence } from './persistence';
import { startReminderScheduler } from './scheduler';

const root = fileURLToPath(new URL('..', import.meta.url));
loadEnvFiles(root);

const now = () => new Date().toISOString();
const id = () => randomUUID();
const port = numberFrom(process.env.PORT, 8787, 0);
const host = process.env.HOST?.trim() || '127.0.0.1';
const tickSeconds = numberFrom(process.env.AGENT_TICK_SECONDS, 60, 1);
const reminder = { idleHours: numberFrom(process.env.AGENT_REMINDER_IDLE_HOURS, 48), maxReminders: numberFrom(process.env.AGENT_REMINDER_MAX, 2, 1) };

const store = createWorkspaceStore({
  persistence: createFilePersistence(process.env.STATE_FILE?.trim() || join(root, 'server', '.data', 'workspace.json')),
  // The shipped transport performs no network call: delivery is recorded in the simulated mailbox only.
  mail: { deliver: async () => undefined },
  appUrl: process.env.APP_URL?.trim() || 'http://127.0.0.1:5173',
  reminder,
  now,
  id,
});

const active = createAgentProvider(process.env, now);
const server = createServer(createRequestHandler({ store, provider: active.provider, model: active.model, simulated: active.simulated, reminder, distDir: join(root, 'dist'), now, id }));

server.listen(port, host, () => {
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  console.log(`Effective local API: http://${host}:${actual}`);
  console.log(active.simulated ? 'Agent provider: mock (offline). Set AGENT_API_KEY to use a real model.' : `Agent provider: ${active.model}`);
  console.log(`Reminders: idle ${reminder.idleHours}h, max ${reminder.maxReminders} per task, checked every ${tickSeconds}s. Simulated mail only.`);
});

const scheduler = startReminderScheduler({ store, tickSeconds, log: (message) => console.log(message) });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { scheduler.stop(); server.close(() => process.exit(0)); });
}
