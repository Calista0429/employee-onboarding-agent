import type { AgentToolSpec } from '../../src/domain/agent';
import { FIELDS, MODULES, type Actor, type ModuleId, type Task } from '../../src/domain/onboarding';
import type { WorkspaceStore } from '../../src/store/workspaceStore';

const moduleIds = MODULES.map((module) => module.id);
const openStatuses: Task['status'][] = ['NOT_STARTED', 'IN_PROGRESS', 'RETURNED'];
const day = 86_400_000;

function asString(value: unknown, name: string, limit = 200): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} は必須です。`);
  const trimmed = value.trim();
  if (trimmed.length > limit) throw new Error(`${name} は${limit}文字以内で指定してください。`);
  return trimmed;
}
function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} の形式が正しくありません。`);
  return value as Record<string, unknown>;
}
function asArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} は配列で指定してください。`);
  return value;
}
function normaliseDate(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  const text = asString(value, 'dueDate', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('dueDate は YYYY-MM-DD 形式で指定してください。');
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error('dueDate が正しい日付ではありません。');
  return text;
}
function normaliseModules(value: unknown): ModuleId[] {
  if (value === undefined) return [...moduleIds];
  const list = asArray(value, 'modules').map((item) => {
    if (typeof item !== 'string' || !moduleIds.includes(item as ModuleId)) throw new Error(`modules に不明なセクションがあります: ${String(item)}`);
    return item as ModuleId;
  });
  if (!list.length) throw new Error('modules を1つ以上指定してください。');
  return [...new Set(list)];
}
function normaliseRequiredFields(value: unknown, modules: ModuleId[]): string[] {
  const enabled = FIELDS.filter((field) => modules.includes(field.module)).map((field) => field.id);
  if (value === undefined) return enabled.filter((id) => id !== 'commuteRoute');
  const list = asArray(value, 'requiredFields').map((item) => {
    if (typeof item !== 'string' || !enabled.includes(item)) throw new Error(`requiredFields に使用できない項目があります: ${String(item)}`);
    return item;
  });
  return [...new Set(list)];
}
function normaliseRecipients(value: unknown) {
  const rows = asArray(value, 'recipients');
  if (!rows.length || rows.length > 20) throw new Error('recipients は1〜20名で指定してください。');
  return rows.map((row) => {
    const record = asRecord(row, 'recipients');
    return { name: asString(record.name, 'recipients.name', 120), email: asString(record.email, 'recipients.email', 254).toLowerCase() };
  });
}

function summarise(task: Task) {
  return { taskId: task.id, employeeName: task.employeeName, email: task.email, templateTitle: task.template.title, status: task.status, delivery: task.delivery, dueDate: task.template.dueDate, lastEventAt: task.history.at(-1)?.at ?? task.template.createdAt };
}

/**
 * The Agent's only way to change data. Every tool call runs through the same domain transitions as the UI,
 * so an agent-created workflow cannot bypass validation, immutability or ownership checks.
 */
export function createAgentTools(context: { store: WorkspaceStore; actor: Actor; now(): string; id(): string }) {
  const defaultDueDate = () => new Date(Date.parse(context.now()) + 14 * day).toISOString().slice(0, 10);

  const specs: AgentToolSpec[] = [
    {
      name: 'get_workspace_overview',
      description: 'ワークフローのテンプレート一覧と、すべての従業員タスクの状態を返します。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'list_pending_tasks',
      description: 'まだ提出・確認が完了していないタスク（未着手・入力中・差し戻し）だけを返します。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'create_template',
      description: '入社手続きフォームのテンプレートを作成します。招待の前に必ず実行してください。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'フォーム名（例：入社手続きフォーム）' },
          description: { type: 'string', description: '従業員に表示する説明文' },
          dueDate: { type: 'string', description: '提出期限。YYYY-MM-DD 形式。省略時は2週間後。' },
          modules: { type: 'array', items: { type: 'string', enum: moduleIds }, description: '収集するセクション。省略時はすべて。' },
          requiredFields: { type: 'array', items: { type: 'string' }, description: '必須項目のID。省略時は選択セクションの全項目（通勤経路を除く）。' },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
    {
      name: 'invite_employees',
      description: '作成済みテンプレートで従業員を招待し、案内通知と模拟メールを記録します。1回につき20名まで。',
      parameters: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: 'create_template が返した templateId' },
          recipients: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } }, required: ['name', 'email'], additionalProperties: false } },
        },
        required: ['templateId', 'recipients'],
        additionalProperties: false,
      },
    },
    {
      name: 'send_reminders',
      description: '未提出の従業員にリマインド通知と模拟メールを送ります。taskIds を省略すると未提出者全員に送ります。',
      parameters: {
        type: 'object',
        properties: {
          taskIds: { type: 'array', items: { type: 'string' }, description: '対象タスクID。省略時は未提出者全員。' },
          message: { type: 'string', description: 'HR から伝えたい補足メッセージ（任意）' },
        },
        additionalProperties: false,
      },
    },
  ];

  async function execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'get_workspace_overview': {
        const view = await context.store.read(context.actor);
        return { templates: view.templates.map((template) => ({ templateId: template.id, title: template.title, dueDate: template.dueDate, modules: template.modules, requiredFields: template.requiredFields })), tasks: view.tasks.map(summarise) };
      }
      case 'list_pending_tasks': {
        const view = await context.store.read(context.actor);
        return { tasks: view.tasks.filter((task) => openStatuses.includes(task.status)).map(summarise) };
      }
      case 'create_template': {
        const modules = normaliseModules(args.modules);
        const title = asString(args.title, 'title', 120);
        const description = typeof args.description === 'string' && args.description.trim() ? args.description.trim().slice(0, 1_000) : `${title}に必要な情報をご入力ください。`;
        const template = { id: context.id(), title, description, dueDate: normaliseDate(args.dueDate, defaultDueDate()), modules, requiredFields: normaliseRequiredFields(args.requiredFields, modules) };
        await context.store.act(context.actor, { type: 'CREATE_TEMPLATE', template });
        return { templateId: template.id, title: template.title, dueDate: template.dueDate, modules: template.modules };
      }
      case 'invite_employees': {
        const templateId = asString(args.templateId, 'templateId', 100);
        const recipients = normaliseRecipients(args.recipients);
        const view = await context.store.act(context.actor, { type: 'INVITE', templateId, recipients });
        return { invited: view.tasks.filter((task) => task.template.id === templateId && recipients.some((recipient) => recipient.email === task.email)).map((task) => ({ taskId: task.id, name: task.employeeName, email: task.email, delivery: task.delivery })) };
      }
      case 'send_reminders': {
        const view = await context.store.read(context.actor);
        const open = view.tasks.filter((task) => openStatuses.includes(task.status));
        const requested = args.taskIds === undefined ? open.map((task) => task.id) : asArray(args.taskIds, 'taskIds').map((item) => asString(item, 'taskIds[]', 100));
        const targets = requested.filter((id) => open.some((task) => task.id === id));
        const skipped = requested.filter((id) => !targets.includes(id));
        const message = typeof args.message === 'string' && args.message.trim() ? args.message.trim().slice(0, 500) : undefined;
        for (const taskId of targets) await context.store.act(context.actor, { type: 'REMIND', taskId, ...(message ? { message } : {}) });
        return { reminded: targets, skipped };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  return { specs, execute };
}
