import { Bell, CheckCheck, Mail } from 'lucide-react';
import type { Notification } from '../../domain/onboarding';
import { Block, StatusLabel } from '../mf';
import { formatDate } from './display';

const kindLabels: Record<Notification['kind'], { label: string; color: 'blue' | 'orange' | 'gray' }> = {
  INVITED: { label: '招待', color: 'blue' },
  REMINDER: { label: 'リマインド', color: 'orange' },
  RETURNED: { label: '差し戻し', color: 'gray' },
};

export function NotificationCentre({ notifications, role, onOpen, onMarkRead }: {
  notifications: Notification[]; role: 'hr' | 'employee'; onOpen: (taskId: string) => void; onMarkRead: (ids?: string[]) => void;
}) {
  const unread = notifications.filter((item) => !item.readAt).length;
  const sorted = [...notifications].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return <>
    <div className="page-heading"><div><h1>通知</h1><p>{role === 'hr' ? '招待・リマインド・差し戻しの記録です。' : 'あなた宛てのお知らせです。'}</p></div>{unread > 0 && <button className="button secondary" onClick={() => onMarkRead(undefined)}><CheckCheck size={16} />すべて既読にする</button>}</div>
    <Block className="workspace-panel">{sorted.length ? <ul className="notification-list">{sorted.map((item) => <li key={item.id} className={item.readAt ? '' : 'unread'}>
      <span className="notification-icon">{item.kind === 'REMINDER' ? <Bell size={16} /> : <Mail size={16} />}</span>
      <div className="notification-body"><div className="notification-head"><StatusLabel color={kindLabels[item.kind].color} outline>{kindLabels[item.kind].label}</StatusLabel><strong>{item.title}</strong>{!item.readAt && <span className="unread-dot" role="img" aria-label="未読" />}</div><p>{item.body}</p><div className="notification-actions"><button className="text-button" onClick={() => { onOpen(item.taskId); onMarkRead([item.id]); }}>手続きを開く</button><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div></div>
    </li>)}</ul> : <div className="empty-state"><Bell size={32} /><h3>通知はまだありません</h3><p>招待やリマインドを送ると、ここに記録されます。メールは模拟記録のみです。</p></div>}</Block>
  </>;
}
