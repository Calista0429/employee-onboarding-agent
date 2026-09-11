import type { Task } from '../domain/onboarding';

export type MessageKind = 'INVITATION' | 'REMINDER' | 'RETURN';

/** Single place that renders invitation, reminder and correction text, kept unambiguous about simulation. */
export function composeMessage(task: Task, kind: MessageKind, appUrl: string, note = '') {
  const link = `${appUrl.replace(/\/+$/, '')}/?task=${encodeURIComponent(task.id)}`;
  const header = `${task.employeeName} 様\n\n`;
  if (kind === 'REMINDER') {
    return { subject: `【リマインド】${task.template.title}のご提出をお願いします`, body: `${header}${task.template.title}のご提出がまだ確認できていません。\n提出期限：${task.template.dueDate}\n\n${note ? `${note}\n\n` : ''}以下のリンクから入力を再開してください。\n${link}` };
  }
  if (kind === 'RETURN') {
    return { subject: `【修正依頼】${task.template.title}`, body: `${header}${task.template.title}の内容について修正をお願いします。\n\n${note}\n\n以下のリンクから修正して再提出してください。\n${link}` };
  }
  return { subject: `${task.template.title}のご案内`, body: `${header}ご入社おめでとうございます。\n以下のフォームから、入社に必要な情報をご入力ください。\n\n手続き：${task.template.title}\n提出期限：${task.template.dueDate}\n\n${link}\n\nこの案内はローカルデモの模拟記録です。実際のメールは送信されません。` };
}
