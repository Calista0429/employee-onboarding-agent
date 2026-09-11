import {
  applyAction, dueForReminder, HR_ACTOR,
  type Action, type Actor, type MailMessage, type NotificationKind, type Task, type WorkspaceView,
} from '../domain/onboarding';
import { composeMessage, type MessageKind } from './messages';
import { createSeedState } from './seed';
import type { StoreDependencies, StoreState } from './types';

const notificationKind: Record<MessageKind, NotificationKind> = { INVITATION: 'INVITED', REMINDER: 'REMINDER', RETURN: 'RETURNED' };

/**
 * Isomorphic workspace store shared by the local server and the tests. All transitions run through the
 * shared domain rules; this layer only adds role scoping, the notification centre, the simulated mailbox
 * and the automatic follow-up policy. Read-modify-write cycles are serialized so two requests cannot
 * interleave and lose an action.
 */
export function createWorkspaceStore(deps: StoreDependencies) {
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.then(() => undefined, () => undefined);
    return next;
  };

  async function loadState(): Promise<StoreState> {
    const stored = await deps.persistence.read();
    if (stored) return stored;
    const seeded = createSeedState(deps.now(), deps.appUrl);
    await deps.persistence.write(seeded);
    return seeded;
  }

  function scope(state: StoreState, actor: Actor): WorkspaceView {
    if (actor.role === 'hr') return structuredClone({ ...state.workspace, notifications: state.notifications, outbox: state.outbox });
    const email = actor.email.trim().toLowerCase();
    return {
      templates: [],
      tasks: state.workspace.tasks.filter((task) => task.email === email).map((task) => structuredClone(task)),
      notifications: state.notifications.filter((item) => item.email === email).map((item) => ({ ...item })),
      outbox: state.outbox.filter((message) => message.to === email).map((message) => ({ ...message })),
    };
  }

  /** In-app notifications are the reliable channel; the mailbox is best effort and records its own outcome. */
  async function deliver(state: StoreState, task: Task, kind: MessageKind, note = '') {
    const composed = composeMessage(task, kind, deps.appUrl, note);
    const message: MailMessage = { id: deps.id(), taskId: task.id, to: task.email, subject: composed.subject, body: composed.body, createdAt: deps.now() };
    state.notifications.push({ id: deps.id(), taskId: task.id, email: task.email, kind: notificationKind[kind], title: composed.subject, body: composed.body, createdAt: deps.now() });
    const tracksInvitation = kind === 'INVITATION';
    try {
      await deps.mail.deliver(message);
      state.outbox.push(message);
      if (tracksInvitation) { task.delivery = 'SIMULATED'; delete task.deliveryError; }
      task.history.push({ id: deps.id(), type: 'EMAIL_SIMULATED', at: deps.now() });
    } catch {
      if (tracksInvitation) { task.delivery = 'FAILED'; task.deliveryError = '模拟メールを記録できませんでした。配信設定を確認して再送してください。'; }
      task.history.push({ id: deps.id(), type: 'EMAIL_FAILED', at: deps.now() });
    }
  }

  function find(state: StoreState, taskId: string): Task | undefined {
    return state.workspace.tasks.find((task) => task.id === taskId);
  }

  return {
    read: (actor: Actor) => serialize(async () => scope(await loadState(), actor)),

    act: (actor: Actor, action: Action) => serialize(async () => {
      const state = await loadState();
      const known = new Set(state.workspace.tasks.map((task) => task.id));
      state.workspace = applyAction(state.workspace, actor, action, { now: deps.now, id: deps.id });
      if (action.type === 'INVITE') {
        for (const task of state.workspace.tasks) if (!known.has(task.id)) await deliver(state, task, 'INVITATION');
      }
      if (action.type === 'RESEND') {
        const task = find(state, action.taskId);
        if (task) await deliver(state, task, 'INVITATION');
      }
      if (action.type === 'REMIND') {
        const task = find(state, action.taskId);
        if (task) await deliver(state, task, 'REMINDER', action.message ?? '');
      }
      if (action.type === 'REVIEW' && action.decision === 'RETURN') {
        const task = find(state, action.taskId);
        if (task) await deliver(state, task, 'RETURN', action.reason);
      }
      await deps.persistence.write(state);
      return scope(state, actor);
    }),

    /** Automatic follow-up. Returns the task ids that were reminded during this run. */
    runReminders: () => serialize(async () => {
      const state = await loadState();
      const due = state.workspace.tasks.filter((task) => dueForReminder(task, deps.now(), deps.reminder));
      for (const task of due) {
        state.workspace = applyAction(state.workspace, HR_ACTOR, { type: 'REMIND', taskId: task.id }, { now: deps.now, id: deps.id });
        const updated = find(state, task.id);
        if (updated) await deliver(state, updated, 'REMINDER');
      }
      if (due.length) await deps.persistence.write(state);
      return due.map((task) => task.id);
    }),

    markNotificationsRead: (actor: Actor, ids?: string[]) => serialize(async () => {
      const state = await loadState();
      const email = actor.email.trim().toLowerCase();
      for (const item of state.notifications) {
        if (actor.role !== 'hr' && item.email !== email) continue;
        if (ids && !ids.includes(item.id)) continue;
        if (!item.readAt) item.readAt = deps.now();
      }
      await deps.persistence.write(state);
      return scope(state, actor);
    }),

    reset: (actor: Actor) => serialize(async () => {
      const state = createSeedState(deps.now(), deps.appUrl);
      await deps.persistence.write(state);
      return scope(state, actor);
    }),
  };
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
