import type { AgentMessage, AgentProvider, AgentToolCall, AgentTurn } from '../../src/domain/agent';
import { MODULES, type ModuleId } from '../../src/domain/onboarding';

/**
 * Deterministic offline Agent. It recognises a small set of HR intents in Japanese or English and drives
 * the same tool calls a model would propose, so the automation is demonstrable without any API key.
 * The multi-step behaviour is honest: it inspects the transcript and emits the next missing tool call,
 * which is exactly how a tool-calling model is driven by `runAgent`.
 */
export type AgentIntent = 'invite' | 'remind' | 'status' | 'unknown';
export type AgentPlan = { intent: AgentIntent; title: string; description: string; dueDate: string; modules: ModuleId[]; recipients: { name: string; email: string }[] };

const day = 86_400_000;
const EMAIL_PATTERN = /[^\s<>@,、（）()「」『』]+@[^\s<>@,、（）()「」『』]+\.[^\s<>@,、（）()「」『』]+/g;
const STOPWORDS = new Set(['と', 'に', 'へ', 'や', 'も', 'and', '&', 'also', 'then', 'please']);
const MODULE_KEYWORDS: { id: ModuleId; pattern: RegExp }[] = [
  { id: 'personal', pattern: /本人|個人|プロフィール|氏名|名前|住所|personal/i },
  { id: 'bank', pattern: /口座|銀行|振込|給与|bank|payroll/i },
  { id: 'commute', pattern: /通勤|交通|定期券|commute/i },
];
const REMIND_PATTERN = /リマインド|りまいんど|催促|督促|未提出|まだ出していない|声かけ|remind|nudge|follow.?up/i;
const STATUS_PATTERN = /進捗|状況|一覧|だれ|誰|どのくらい|status|overview|progress/i;
const INVITE_PATTERN = /招待|送って|送信|依頼|作成|作って|フォーム|手続き|invite|create|send/i;

const isoDay = (value: number) => new Date(value).toISOString().slice(0, 10);

function buildDate(year: number, month: number, date: number, reference: number): string {
  const value = Date.UTC(year, month - 1, date);
  const parsed = new Date(value);
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) return isoDay(reference + 14 * day);
  return value < reference ? isoDay(Date.UTC(year + 1, month - 1, date)) : isoDay(value);
}

export function parseDueDate(text: string, reference: number): string {
  const full = text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  if (full) return buildDate(Number(full[1]), Number(full[2]), Number(full[3]), reference);
  const short = text.match(/(\d{1,2})[-/月](\d{1,2})日/);
  if (short) return buildDate(new Date(reference).getUTCFullYear(), Number(short[1]), Number(short[2]), reference);
  const today = new Date(reference);
  if (/来月末/.test(text)) return isoDay(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0));
  if (/今月末/.test(text)) return isoDay(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  if (/来週/.test(text)) return isoDay(reference + 7 * day);
  return isoDay(reference + 14 * day);
}

export function parseModules(text: string): ModuleId[] {
  const found = MODULE_KEYWORDS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.id);
  return found.length ? found : MODULES.map((module) => module.id);
}

const NAME_TOKEN = '[^\\s、,。：:「」『』（）()]{1,12}';
const PUNCTUATION_ONLY = /^[)\]}）】」』>.,、。:：]+$/;

/**
 * Names are read from the text between two addresses, so "田中 葵 tanaka@example.com と 小林 海 kobayashi@example.com"
 * resolves both people. Unsupported phrasing falls back to the local part of the address, which is why the
 * offline provider is documented as a rule-based helper rather than a general language model.
 */
function nameFromSegment(segment: string): string {
  const trimmed = segment.replace(/[\s、,。：:]+$/, '');
  const withoutBracket = trimmed.replace(/[<（(「『]+$/, '');
  const honorific = withoutBracket.match(new RegExp(`(${NAME_TOKEN}?)(?:さん|様|くん|殿)$`));
  if (honorific) return honorific[1];
  const bracketed = trimmed.match(/[<（(「『]([^<（(「『」』）)>]+)$/);
  if (bracketed) return bracketed[1].trim();
  const tokens = withoutBracket.split(/[\s、,。：:「」『』（）()]+/).filter(Boolean);
  while (tokens.length && (STOPWORDS.has(tokens[tokens.length - 1].toLowerCase()) || PUNCTUATION_ONLY.test(tokens[tokens.length - 1]))) tokens.pop();
  if (!tokens.length) return '';
  const candidate = tokens.slice(-2).join(' ');
  return candidate.length <= 24 ? candidate : tokens[tokens.length - 1];
}

const localName = (email: string) => email.split('@')[0].replace(/[._-]+/g, ' ').trim();

export function parseRecipients(text: string): { name: string; email: string }[] {
  const recipients: { name: string; email: string }[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    const index = match.index ?? 0;
    const email = match[0].replace(/[.,。、]+$/, '').toLowerCase();
    const segment = text.slice(cursor, index);
    cursor = index + match[0].length;
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ name: nameFromSegment(segment) || localName(email), email });
  }
  return recipients.slice(0, 20);
}

export function parseTitle(text: string, modules: ModuleId[]): string {
  const quoted = text.match(/[「『"]([^」』"]{1,60})[」』"]/);
  if (quoted) return quoted[1].trim();
  if (/入社手続き/.test(text)) return '入社手続きフォーム';
  return `${modules.map((id) => MODULES.find((module) => module.id === id)?.label ?? id).join('・')}の登録フォーム`;
}

export function parseRequest(text: string, reference: number): AgentPlan {
  const recipients = parseRecipients(text);
  const modules = parseModules(text);
  const intent: AgentIntent = recipients.length ? 'invite'
    : REMIND_PATTERN.test(text) ? 'remind'
      : STATUS_PATTERN.test(text) ? 'status'
        : INVITE_PATTERN.test(text) ? 'invite'
          : 'unknown';
  const dueDate = parseDueDate(text, reference);
  const title = parseTitle(text, modules);
  return { intent, title, description: `${title}に必要な情報をご入力ください。`, dueDate, modules, recipients };
}

function safeParse(content: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

type ToolResult = { name: string; value: Record<string, unknown> | undefined };

export function createMockProvider(options: { now?: () => string } = {}): AgentProvider {
  const now = options.now ?? (() => new Date().toISOString());
  let counter = 0;
  const call = (name: string, args: Record<string, unknown>): AgentTurn => ({ content: '', toolCalls: [{ id: `mock-${name}-${(counter += 1)}`, name, arguments: args } satisfies AgentToolCall] });

  return {
    name: 'mock',
    complete: async (messages) => {
      const lastUser = [...messages].reverse().find((message) => message.role === 'user');
      if (!lastUser || lastUser.role !== 'user') return { content: 'ご依頼を入力してください。', toolCalls: [] };
      const start = messages.lastIndexOf(lastUser);
      const plan = parseRequest(lastUser.content, Date.parse(now()));
      const results: ToolResult[] = messages.slice(start + 1)
        .filter((message): message is Extract<AgentMessage, { role: 'tool' }> => message.role === 'tool')
        .map((message) => ({ name: message.name, value: safeParse(message.content) }));
      const failed = results.find((item) => typeof item.value?.error === 'string');
      if (failed) return { content: `実行できませんでした: ${String(failed.value?.error)}\n条件を変えて、もう一度お試しください。`, toolCalls: [] };

      if (plan.intent === 'invite') {
        if (!plan.recipients.length) return { content: '招待する従業員の氏名とメールアドレスを教えてください。（例：田中 葵 tanaka@example.com）', toolCalls: [] };
        const created = results.find((item) => item.name === 'create_template');
        if (!created) return call('create_template', { title: plan.title, description: plan.description, dueDate: plan.dueDate, modules: plan.modules });
        const invited = results.find((item) => item.name === 'invite_employees');
        if (!invited) {
          const templateId = typeof created.value?.templateId === 'string' ? created.value.templateId : '';
          if (!templateId) return { content: 'フォームの作成に失敗しました。もう一度お試しください。', toolCalls: [] };
          return call('invite_employees', { templateId, recipients: plan.recipients });
        }
        return { content: `「${plan.title}」を作成し、${plan.recipients.length}名（${plan.recipients.map((recipient) => recipient.name).join('、')}）に招待を送信しました。提出期限は ${plan.dueDate} です。案内は通知センターと模拟メールに記録され、実際のメールは送信されません。`, toolCalls: [] };
      }

      if (plan.intent === 'remind') {
        const listed = results.find((item) => item.name === 'list_pending_tasks');
        if (!listed) return call('list_pending_tasks', {});
        const sent = results.find((item) => item.name === 'send_reminders');
        if (!sent) {
          const tasks = Array.isArray(listed.value?.tasks) ? listed.value.tasks as { taskId?: unknown }[] : [];
          const ids = tasks.map((task) => task.taskId).filter((id): id is string => typeof id === 'string');
          if (!ids.length) return { content: '未提出・未確認の従業員はいません。すべて完了しています。', toolCalls: [] };
          return call('send_reminders', { taskIds: ids });
        }
        const reminded = Array.isArray(sent.value?.reminded) ? sent.value.reminded.length : 0;
        return { content: `${reminded}名にリマインドを送信しました。通知センターと模拟メールをご確認ください。`, toolCalls: [] };
      }

      if (plan.intent === 'status') {
        const overview = results.find((item) => item.name === 'get_workspace_overview');
        if (!overview) return call('get_workspace_overview', {});
        const tasks = Array.isArray(overview.value?.tasks) ? overview.value.tasks as { status?: unknown }[] : [];
        const count = (status: string) => tasks.filter((task) => task.status === status).length;
        return { content: `手続きは全部で${tasks.length}件です。未着手${count('NOT_STARTED')}件、入力中${count('IN_PROGRESS')}件、提出済み${count('SUBMITTED')}件、差し戻し${count('RETURNED')}件、確認済み${count('CONFIRMED')}件です。`, toolCalls: [] };
      }

      return { content: '入社手続きフォームの作成・従業員の招待・未提出者へのリマインドができます。例：「本人情報と口座の入社手続きを作成して、田中さん(tanaka@example.com)に送ってください」', toolCalls: [] };
    },
  };
}
