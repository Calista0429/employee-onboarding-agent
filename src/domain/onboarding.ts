export type ModuleId = 'personal' | 'bank' | 'commute';

export type FieldDefinition = {
  id: string;
  label: string;
  module: ModuleId;
  type?: 'text' | 'email' | 'date' | 'number' | 'select';
  options?: string[];
  hint?: string;
};

export type Answers = Record<string, string>;
export type Template = { id: string; title: string; description: string; dueDate: string; modules: ModuleId[]; requiredFields: string[]; createdAt: string };
export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CONFIRMED' | 'RETURNED';
export type DeliveryStatus = 'PENDING' | 'SIMULATED' | 'FAILED';
export type TaskHistory = { id: string; type: string; at: string; note?: string };
export type Task = { id: string; employeeName: string; email: string; template: Template; status: TaskStatus; answers: Answers; version: number; delivery: DeliveryStatus; deliveryError?: string; history: TaskHistory[] };
export type Workspace = { templates: Template[]; tasks: Task[] };
export type NotificationKind = 'INVITED' | 'REMINDER' | 'RETURNED';
export type Notification = { id: string; taskId: string; email: string; kind: NotificationKind; title: string; body: string; createdAt: string; readAt?: string };
export type MailMessage = { id: string; taskId: string; to: string; subject: string; body: string; createdAt: string };
/** Role-scoped snapshot for the UI: transition state plus the notification centre and the simulated mailbox. */
export type WorkspaceView = Workspace & { notifications: Notification[]; outbox: MailMessage[] };
export type Actor = { role: 'hr' | 'employee'; email: string };
/** The single local HR identity used by the demo, the reminder scheduler and the Agent's HR tools. */
export const HR_ACTOR: Actor = { role: 'hr', email: 'hr@example.com' };
export type Action =
  | { type: 'CREATE_TEMPLATE'; template: Omit<Template, 'createdAt'> }
  | { type: 'INVITE'; templateId: string; recipients: { name: string; email: string }[] }
  | { type: 'SAVE_DRAFT' | 'SUBMIT'; taskId: string; answers: Answers; version: number }
  | { type: 'REVIEW'; taskId: string; decision: 'CONFIRM' | 'RETURN'; reason: string; version: number }
  | { type: 'REMIND'; taskId: string; message?: string }
  | { type: 'RESEND'; taskId: string };
export type WorkspaceApi = {
  load(actor: Actor): Promise<WorkspaceView>;
  act(actor: Actor, action: Action): Promise<WorkspaceView>;
  reset(actor: Actor): Promise<WorkspaceView>;
  markNotificationsRead(actor: Actor, ids?: string[]): Promise<WorkspaceView>;
  runReminders(actor: Actor): Promise<{ workspace: WorkspaceView; reminded: string[] }>;
};
export type ReminderPolicy = { idleHours: number; maxReminders: number };

export const MODULES: { id: ModuleId; label: string; description: string }[] = [
  { id: 'personal', label: '本人情報', description: '氏名、生年月日、住所、連絡先' },
  { id: 'bank', label: '給与振込口座', description: '銀行、支店、口座情報' },
  { id: 'commute', label: '通勤情報', description: '通勤方法、経路、交通費' },
];

export const FIELDS: FieldDefinition[] = [
  { id: 'lastName', label: '姓', module: 'personal' }, { id: 'firstName', label: '名', module: 'personal' },
  { id: 'lastNameKana', label: '姓（カナ）', module: 'personal' }, { id: 'firstNameKana', label: '名（カナ）', module: 'personal' },
  { id: 'birthDate', label: '生年月日', module: 'personal', type: 'date' }, { id: 'address', label: '住所', module: 'personal' },
  { id: 'contactEmail', label: '連絡先メールアドレス', module: 'personal', type: 'email' },
  { id: 'bankName', label: '銀行名', module: 'bank' }, { id: 'bankCode', label: '銀行コード', module: 'bank', hint: '4桁' },
  { id: 'branchName', label: '支店名', module: 'bank' }, { id: 'branchCode', label: '支店コード', module: 'bank', hint: '3桁' },
  { id: 'accountType', label: '口座種別', module: 'bank', type: 'select', options: ['普通', '当座'] },
  { id: 'accountNumber', label: '口座番号', module: 'bank', hint: '7桁' }, { id: 'accountHolder', label: '口座名義', module: 'bank' },
  { id: 'commuteMethod', label: '通勤方法', module: 'commute', type: 'select', options: ['電車・バス', '自転車', '徒歩', '自動車'] },
  { id: 'commuteFrom', label: '出発地', module: 'commute' }, { id: 'commuteTo', label: '到着地', module: 'commute' },
  { id: 'commuteRoute', label: '通勤経路', module: 'commute' }, { id: 'commuteCost', label: '月額交通費', module: 'commute', type: 'number' },
];

const fieldById = new Map(FIELDS.map((field) => [field.id, field]));
export function validateAnswers(template: Template, answers: Answers, complete: boolean): Record<string, string> {
  const errors: Record<string, string> = Object.create(null);
  const enabled = new Set(FIELDS.filter((field) => template.modules.includes(field.module)).map((field) => field.id));
  for (const id of Object.keys(answers)) if (!enabled.has(id)) errors[id] = 'この項目はフォームに含まれていません。';
  if (complete) for (const id of template.requiredFields) if (typeof answers[id] !== 'string' || !answers[id].trim()) errors[id] = '必須項目です。';
  for (const [id, value] of Object.entries(answers)) {
    if (typeof value !== 'string' || value.length > 500) { errors[id] = '500文字以内の文字列で入力してください。'; continue; }
    if (!value || !enabled.has(id)) continue;
    if (id === 'birthDate' && !validDate(value)) errors[id] = '正しい日付を入力してください。';
    if (id === 'commuteCost' && (!/^\d+$/.test(value) || Number(value) > 1000000)) errors[id] = '0〜1000000円の整数で入力してください。';
    if (['lastNameKana', 'firstNameKana', 'accountHolder'].includes(id) && !/^[\u30A0-\u30FF\uFF65-\uFF9F\s（）().・ー-]+$/.test(value)) errors[id] = 'カタカナで入力してください。';
    const field = fieldById.get(id);
    if (field?.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[id] = '有効なメールアドレスを入力してください。';
    if (id === 'bankCode' && !/^\d{4}$/.test(value)) errors[id] = '銀行コードは4桁の数字で入力してください。';
    if (id === 'branchCode' && !/^\d{3}$/.test(value)) errors[id] = '支店コードは3桁の数字で入力してください。';
    if (id === 'accountNumber' && !/^\d{7}$/.test(value)) errors[id] = '口座番号は7桁の数字で入力してください。';
    if (field?.options && !field.options.includes(value)) errors[id] = '選択肢から選んでください。';
  }
  return errors;
}

export type TransitionDependencies = { now(): string; id(): string };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function copyWorkspace(workspace: Workspace): Workspace {
  return structuredClone(workspace);
}

function requireHr(actor: Actor): void {
  if (actor.role !== 'hr') throw new Error('HR access is required.');
}

function validDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateTemplate(template: Omit<Template, 'createdAt'>): void {
  if (!template.id.trim() || !template.title.trim() || template.title.length > 120) throw new Error('Template ID and title are required; title is limited to 120 characters.');
  if (template.description.length > 1_000) throw new Error('Template description is limited to 1000 characters.');
  if (!isoDatePattern.test(template.dueDate) || !validDate(template.dueDate)) throw new Error('Template due date is invalid.');
  if (!template.modules.length || new Set(template.modules).size !== template.modules.length || template.modules.some((id) => !MODULES.some((item) => item.id === id))) throw new Error('Select at least one valid module.');
  const enabled = new Set(FIELDS.filter((field) => template.modules.includes(field.module)).map((field) => field.id));
  if (new Set(template.requiredFields).size !== template.requiredFields.length || template.requiredFields.some((id) => !enabled.has(id))) throw new Error('Required fields must belong to selected modules.');
}

function sameAnswers(left: Answers, right: Answers): boolean {
  const keys = Object.keys(left).sort();
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

export function applyAction(workspace: Workspace, actor: Actor, action: Action, dependencies: TransitionDependencies): Workspace {
  const result = copyWorkspace(workspace);
  const now = dependencies.now();
  if (action.type === 'CREATE_TEMPLATE') {
    requireHr(actor);
    validateTemplate(action.template);
    if (result.templates.some((item) => item.id === action.template.id)) throw new Error('Template already exists.');
    result.templates.push({ ...structuredClone(action.template), createdAt: now });
    return result;
  }
  if (action.type === 'INVITE') {
    requireHr(actor);
    const template = result.templates.find((item) => item.id === action.templateId);
    if (!template) throw new Error('Template not found.');
    if (!action.recipients.length || action.recipients.length > 20) throw new Error('Invite between 1 and 20 recipients.');
    const emails = action.recipients.map((recipient) => recipient.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length || emails.some((email) => !emailPattern.test(email))) throw new Error('Recipients must have unique valid email addresses.');
    if (emails.some((email) => result.tasks.some((task) => task.template.id === template.id && task.email.toLowerCase() === email))) throw new Error('Recipient was already invited to this template.');
    for (let index = 0; index < action.recipients.length; index += 1) {
      const recipient = action.recipients[index];
      if (!recipient.name.trim() || recipient.name.length > 120) throw new Error('Recipient name is required and limited to 120 characters.');
      result.tasks.push({ id: dependencies.id(), employeeName: recipient.name.trim(), email: emails[index], template: structuredClone(template), status: 'NOT_STARTED', answers: {}, version: 1, delivery: 'PENDING', history: [{ id: dependencies.id(), type: 'INVITED', at: now }] });
    }
    return result;
  }
  const task = result.tasks.find((item) => item.id === action.taskId);
  if (!task) throw new Error('Task not found.');
  if (action.type === 'RESEND') {
    requireHr(actor);
    if (!['FAILED', 'PENDING'].includes(task.delivery)) throw new Error('Only failed invitations can be resent.');
    task.delivery = 'PENDING';
    delete task.deliveryError;
    return result;
  }
  if (action.type === 'REMIND') {
    requireHr(actor);
    if (task.status === 'CONFIRMED') throw new Error('Completed tasks cannot be reminded.');
    // A reminder changes no task data, so the version is left untouched and in-progress drafts stay editable.
    task.history.push({ id: dependencies.id(), type: 'REMINDED', at: now, ...(action.message?.trim() ? { note: action.message.trim() } : {}) });
    return result;
  }
  if (action.type === 'REVIEW') {
    requireHr(actor);
    if (!['CONFIRM', 'RETURN'].includes(action.decision)) throw new Error('Invalid review decision.');
    if (action.reason.length > 500) throw new Error('Return reason is limited to 500 characters.');
    if (task.version !== action.version) throw new Error('Task version is stale.');
    if (task.status !== 'SUBMITTED') throw new Error('Only submitted tasks can be reviewed.');
    if (action.decision === 'RETURN' && !action.reason.trim()) throw new Error('A return reason is required.');
    task.status = action.decision === 'CONFIRM' ? 'CONFIRMED' : 'RETURNED';
    task.version += 1;
    task.history.push({ id: dependencies.id(), type: task.status, at: now, ...(action.reason.trim() ? { note: action.reason.trim() } : {}) });
    return result;
  }
  if (actor.role !== 'employee' || task.email.toLowerCase() !== actor.email.trim().toLowerCase()) throw new Error('Employee does not have access to this task.');
  if (action.type === 'SUBMIT' && task.status === 'SUBMITTED' && task.version === action.version + 1 && sameAnswers(task.answers, action.answers)) return result;
  if (task.version !== action.version) throw new Error('Task version is stale.');
  if (!['NOT_STARTED', 'IN_PROGRESS', 'RETURNED'].includes(task.status)) throw new Error('Task cannot be edited in its current status.');
  const errors = validateAnswers(task.template, action.answers, action.type === 'SUBMIT');
  if (Object.keys(errors).length) throw new Error(`Invalid answers: ${JSON.stringify(errors)}`);
  task.answers = structuredClone(action.answers);
  task.status = action.type === 'SUBMIT' ? 'SUBMITTED' : task.status === 'RETURNED' ? 'RETURNED' : 'IN_PROGRESS';
  task.version += 1;
  task.history.push({ id: dependencies.id(), type: action.type === 'SUBMIT' ? 'SUBMITTED' : 'DRAFT_SAVED', at: now });
  return result;
}

/**
 * Automatic follow-up policy: a task is due for a reminder when it is still open and either the due date
 * has passed or nothing happened for `idleHours`. The number of automatic reminders per task is capped,
 * and the same idle interval spaces them out because the last reminder counts as activity.
 */
export function dueForReminder(task: Task, reference: string, policy: ReminderPolicy): boolean {
  if (!['NOT_STARTED', 'IN_PROGRESS', 'RETURNED'].includes(task.status)) return false;
  const reminders = task.history.filter((entry) => entry.type === 'REMINDED');
  if (reminders.length >= policy.maxReminders) return false;
  const at = Date.parse(reference);
  const touched = Date.parse(reminders.at(-1)?.at ?? task.history.at(-1)?.at ?? task.template.createdAt);
  if (!Number.isFinite(at) || !Number.isFinite(touched)) return false;
  if (at - touched >= policy.idleHours * 3_600_000) return true;
  const due = Date.parse(`${task.template.dueDate}T23:59:59+09:00`);
  return Number.isFinite(due) && at > due;
}
