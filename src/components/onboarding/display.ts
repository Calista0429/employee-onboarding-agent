import type { Task } from '../../domain/onboarding';

export const taskLabels: Record<Task['status'], string> = { NOT_STARTED: '未着手', IN_PROGRESS: '入力中', SUBMITTED: '提出済み', CONFIRMED: '確認済み', RETURNED: '差し戻し' };
export const deliveryLabels: Record<Task['delivery'], string> = { PENDING: '送信待ち', SIMULATED: '模拟記録済み', FAILED: '記録失敗' };
export function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00+09:00` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', ...(value.length > 10 ? { hour: '2-digit', minute: '2-digit' } as const : {}) }).format(date);
}
