import type { WorkspaceStore } from '../src/store/workspaceStore';

/**
 * Periodic follow-up. Runs the store's reminder policy and records the outcome; overlapping runs are
 * skipped so a slow tick cannot double-send.
 */
export function startReminderScheduler(options: { store: WorkspaceStore; tickSeconds: number; log?: (message: string) => void }) {
  let running = false;
  const runNow = async (): Promise<string[]> => {
    if (running) return [];
    running = true;
    try {
      const reminded = await options.store.runReminders();
      if (reminded.length) options.log?.(`Automatic reminders recorded for ${reminded.length} task(s).`);
      return reminded;
    } catch (error) {
      options.log?.(`Reminder run failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    } finally { running = false; }
  };
  const timer = setInterval(() => { void runNow(); }, Math.max(1, options.tickSeconds) * 1_000);
  timer.unref();
  return { runNow, stop: () => clearInterval(timer) };
}
