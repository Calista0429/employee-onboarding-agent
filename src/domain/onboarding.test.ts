import { describe, expect, it, test } from 'vitest';
import { applyAction, dueForReminder, validateAnswers, type Actor, type Template, type Workspace } from './onboarding';

const hr: Actor = { role: 'hr', email: 'hr@example.com' };
const employee: Actor = { role: 'employee', email: 'tanaka@example.com' };
const template: Template = { id: 'template-1', title: '入社手続き', description: '必要情報', dueDate: '2026-10-01', modules: ['personal', 'bank'], requiredFields: ['lastName', 'bankCode'], createdAt: '2026-09-10T00:00:00.000Z' };
const workspace: Workspace = { templates: [template], tasks: [] };
const deps = { now: () => '2026-09-10T01:00:00.000Z', id: (() => { let n = 0; return () => `id-${++n}`; })() };

describe('onboarding validation', () => {
  it('validates only enabled fields while rejecting unknown answers', () => {
    expect(validateAnswers(template, { lastName: '', bankCode: '0123', commuteCost: '1000', rogue: 'x' }, true)).toEqual({ lastName: '必須項目です。', commuteCost: 'この項目はフォームに含まれていません。', rogue: 'この項目はフォームに含まれていません。' });
  });
  it('preserves leading zeroes and validates bank identifiers as strings', () => {
    expect(validateAnswers(template, { lastName: '田中', bankCode: '0123', branchCode: '001', accountNumber: '0001234' }, true)).toEqual({});
    expect(validateAnswers(template, { lastName: '田中', bankCode: '123', branchCode: '1', accountNumber: '12' }, false)).toMatchObject({ bankCode: expect.any(String), branchCode: expect.any(String), accountNumber: expect.any(String) });
  });
});

describe('onboarding transitions', () => {
  it('enforces roles and employee ownership', () => {
    expect(() => applyAction(workspace, employee, { type: 'CREATE_TEMPLATE', template: { ...template, id: 'new' } }, deps)).toThrow(/HR/);
    const invited = applyAction(workspace, hr, { type: 'INVITE', templateId: template.id, recipients: [{ name: '田中 葵', email: employee.email }] }, deps);
    expect(() => applyAction(invited, { role: 'employee', email: 'other@example.com' }, { type: 'SAVE_DRAFT', taskId: invited.tasks[0].id, answers: {}, version: 1 }, deps)).toThrow(/access/i);
  });
  it('stores an immutable template snapshot and rejects duplicate recipients', () => {
    const invited = applyAction(workspace, hr, { type: 'INVITE', templateId: template.id, recipients: [{ name: '田中 葵', email: 'TANAKA@example.com' }] }, deps);
    expect(invited.tasks[0].template).not.toBe(template);
    expect(invited.tasks[0].template).toEqual(template);
    expect(() => applyAction(invited, hr, { type: 'INVITE', templateId: template.id, recipients: [{ name: '田中 葵', email: 'tanaka@example.com' }] }, deps)).toThrow(/already invited/i);
  });
  it('rejects stale writes but treats an identical repeated submit as idempotent', () => {
    const invited = applyAction(workspace, hr, { type: 'INVITE', templateId: template.id, recipients: [{ name: '田中 葵', email: employee.email }] }, deps);
    const task = invited.tasks[0];
    const answers = { lastName: '田中', bankCode: '0123' };
    const submitted = applyAction(invited, employee, { type: 'SUBMIT', taskId: task.id, answers, version: task.version }, deps);
    const repeated = applyAction(submitted, employee, { type: 'SUBMIT', taskId: task.id, answers, version: task.version }, deps);
    expect(repeated.tasks[0].history).toHaveLength(submitted.tasks[0].history.length);
    expect(() => applyAction(submitted, employee, { type: 'SAVE_DRAFT', taskId: task.id, answers: { lastName: '別' }, version: task.version }, deps)).toThrow(/version/i);
  });
  it('supports return, correction and resubmission', () => {
    const invited = applyAction(workspace, hr, { type: 'INVITE', templateId: template.id, recipients: [{ name: '田中 葵', email: employee.email }] }, deps);
    const task = invited.tasks[0];
    const submitted = applyAction(invited, employee, { type: 'SUBMIT', taskId: task.id, answers: { lastName: '田中', bankCode: '0123' }, version: task.version }, deps);
    const returned = applyAction(submitted, hr, { type: 'REVIEW', taskId: task.id, decision: 'RETURN', reason: '銀行コードを確認してください。', version: submitted.tasks[0].version }, deps);
    const resubmitted = applyAction(returned, employee, { type: 'SUBMIT', taskId: task.id, answers: { lastName: '田中', bankCode: '0001' }, version: returned.tasks[0].version }, deps);
    expect(resubmitted.tasks[0]).toMatchObject({ status: 'SUBMITTED', answers: { bankCode: '0001' } });
    expect(resubmitted.tasks[0].history.map((item) => item.type)).toEqual(['INVITED', 'SUBMITTED', 'RETURNED', 'SUBMITTED']);
  });
});

describe('untrusted input boundaries', () => {
  it('rejects impossible dates, negative commute amounts, and non-string answers', () => {
    const full = { ...template, modules: ['personal', 'bank', 'commute'] as Template['modules'] };
    expect(validateAnswers(full, { birthDate: '2026-02-30', commuteCost: '-10', accountNumber: 123 as unknown as string }, false)).toMatchObject({ birthDate: expect.any(String), commuteCost: expect.any(String), accountNumber: expect.any(String) });
  });
  it('rejects unsupported review decisions instead of silently returning a task', () => {
    const invited = applyAction(workspace, hr, { type: 'INVITE', templateId: template.id, recipients: [{ name: '田中', email: employee.email }] }, deps);
    const submitted = applyAction(invited, employee, { type: 'SUBMIT', taskId: invited.tasks[0].id, answers: { lastName: '田中', bankCode: '0123' }, version: 1 }, deps);
    expect(() => applyAction(submitted, hr, { type: 'REVIEW', taskId: submitted.tasks[0].id, decision: 'INVALID' as 'CONFIRM', reason: '', version: 2 }, deps)).toThrow(/decision/i);
  });
});

test('rejects JSON prototype-shaped unknown answer keys', () => {
  const errors = validateAnswers(template, JSON.parse('{"__proto__":"unexpected"}'), false);
  expect(Object.keys(errors)).toContain('__proto__');
});

describe('reminders', () => {
  const invite = () => applyAction(workspace, hr, { type: 'INVITE', templateId: template.id, recipients: [{ name: '田中 葵', email: employee.email }] }, deps);

  it('records a reminder without bumping the version, so an open draft stays editable', () => {
    const invited = invite();
    const reminded = applyAction(invited, hr, { type: 'REMIND', taskId: invited.tasks[0].id, message: 'ご提出をお願いします。' }, deps);
    expect(reminded.tasks[0].version).toBe(invited.tasks[0].version);
    expect(reminded.tasks[0].history.at(-1)).toMatchObject({ type: 'REMINDED', note: 'ご提出をお願いします。' });
    expect(() => applyAction(reminded, employee, { type: 'SAVE_DRAFT', taskId: invited.tasks[0].id, answers: { lastName: '田中' }, version: invited.tasks[0].version }, deps)).not.toThrow();
  });

  it('is HR-only and refuses completed tasks', () => {
    const invited = invite();
    const submitted = applyAction(invited, employee, { type: 'SUBMIT', taskId: invited.tasks[0].id, answers: { lastName: '田中', bankCode: '0123' }, version: 1 }, deps);
    const confirmed = applyAction(submitted, hr, { type: 'REVIEW', taskId: invited.tasks[0].id, decision: 'CONFIRM', reason: '', version: 2 }, deps);
    expect(() => applyAction(confirmed, hr, { type: 'REMIND', taskId: invited.tasks[0].id }, deps)).toThrow(/Completed/i);
    expect(() => applyAction(invited, employee, { type: 'REMIND', taskId: invited.tasks[0].id }, deps)).toThrow(/HR/);
  });

  it('applies the idle window and caps automatic reminders per task', () => {
    const invited = invite();
    const task = invited.tasks[0];
    expect(dueForReminder(task, '2026-09-10T02:00:00.000Z', { idleHours: 48, maxReminders: 2 })).toBe(false);
    expect(dueForReminder(task, '2026-09-13T02:00:00.000Z', { idleHours: 48, maxReminders: 2 })).toBe(true);
    const reminded = applyAction(invited, hr, { type: 'REMIND', taskId: task.id }, deps);
    expect(dueForReminder(reminded.tasks[0], '2026-09-13T02:00:00.000Z', { idleHours: 0, maxReminders: 1 })).toBe(false);
  });
});
