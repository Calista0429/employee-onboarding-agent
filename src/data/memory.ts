import type { WorkspaceApi } from '../domain/onboarding';
import { createMemoryPersistence } from '../store/memoryPersistence';
import { createWorkspaceStore } from '../store/workspaceStore';

/**
 * In-memory API for tests. It reuses the exact store the server runs, so component tests exercise the
 * same transitions, notification records and reminder policy without HTTP.
 */
export function createMemoryApi(options: { now?: () => string; idleHours?: number; maxReminders?: number; deliver?: () => Promise<void> } = {}): WorkspaceApi {
  let counter = 0;
  const store = createWorkspaceStore({
    persistence: createMemoryPersistence(),
    mail: { deliver: options.deliver ?? (async () => undefined) },
    appUrl: 'http://127.0.0.1:5173',
    reminder: { idleHours: options.idleHours ?? 0, maxReminders: options.maxReminders ?? 2 },
    now: options.now ?? (() => new Date().toISOString()),
    id: () => `mem-${(counter += 1)}`,
  });
  return {
    load: (actor) => store.read(actor),
    act: (actor, action) => store.act(actor, action),
    reset: (actor) => store.reset(actor),
    markNotificationsRead: (actor, ids) => store.markNotificationsRead(actor, ids),
    runReminders: async (actor) => { const reminded = await store.runReminders(); return { workspace: await store.read(actor), reminded }; },
  };
}
