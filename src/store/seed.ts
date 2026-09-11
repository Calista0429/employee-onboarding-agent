import type { Template, Task } from '../domain/onboarding';
import { composeMessage } from './messages';
import type { StoreState } from './types';

const day = 86_400_000;

/**
 * Synthetic seed so the demo opens with a template, two invited employees and complete mailbox records.
 * Seeded notices are marked read; only activity from this session produces an unread badge.
 */
export function createSeedState(reference: string, appUrl: string): StoreState {
  const created = new Date(reference).toISOString();
  const dueDate = new Date(Date.parse(reference) + 14 * day).toISOString().slice(0, 10);
  const template: Template = {
    id: 'demo-onboarding',
    title: '入社手続き',
    description: '入社前に必要な情報を入力してください。途中で一時保存し、後から再開できます。',
    dueDate,
    modules: ['personal', 'bank', 'commute'],
    requiredFields: ['lastName', 'firstName', 'birthDate', 'address', 'contactEmail', 'bankName', 'bankCode', 'branchName', 'branchCode', 'accountType', 'accountNumber', 'accountHolder', 'commuteMethod'],
    createdAt: created,
  };
  const task = (id: string, employeeName: string, email: string): Task => ({
    id, employeeName, email, template: structuredClone(template), status: 'NOT_STARTED', answers: {}, version: 1,
    delivery: 'SIMULATED',
    history: [{ id: `${id}-invited`, type: 'INVITED', at: created, note: 'Seeded local demo record' }, { id: `${id}-mail`, type: 'EMAIL_SIMULATED', at: created }],
  });
  const tasks = [task('demo-task-tanaka', '田中 葵', 'tanaka@example.com'), task('demo-task-kobayashi', '小林 海', 'kobayashi@example.com')];
  return {
    workspace: { templates: [structuredClone(template)], tasks },
    notifications: tasks.map((item) => { const composed = composeMessage(item, 'INVITATION', appUrl); return { id: `${item.id}-notice`, taskId: item.id, email: item.email, kind: 'INVITED', title: composed.subject, body: composed.body, createdAt: created, readAt: created }; }),
    outbox: tasks.map((item) => { const composed = composeMessage(item, 'INVITATION', appUrl); return { id: `${item.id}-mail`, taskId: item.id, to: item.email, subject: composed.subject, body: composed.body, createdAt: created }; }),
  };
}
