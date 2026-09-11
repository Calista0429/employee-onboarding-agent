import { useState } from 'react';
import { ArrowLeft, Mail, Plus, Send, X } from 'lucide-react';
import type { MailMessage, Task, Template } from '../../domain/onboarding';
import { Block, TextField } from '../mf';
import { formatDate } from './display';
import type { RunAction } from './TemplateBuilder';

export function Invitations({ template, run, busy, onBack, onDone }: { template: Template; run: RunAction; busy: boolean; onBack: () => void; onDone: () => void }) {
  const [drafts, setDrafts] = useState(() => [{ id: crypto.randomUUID(), name: '', email: '' }]);
  const [recipients, setRecipients] = useState<{ name: string; email: string }[] | null>(null);
  const [error, setError] = useState('');
  function updateRecipient(id: string, field: 'name' | 'email', value: string) {
    setDrafts(drafts.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setError('');
  }
  function confirm() {
    const rows = drafts.map(({ name, email }) => ({ name: name.trim(), email: email.trim().toLowerCase() }));
    if (rows.some((row) => !row.name)) { setError('すべての従業員名を入力してください。'); return; }
    if (rows.some((row) => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(row.email))) { setError('有効なメールアドレスを入力してください。'); return; }
    if (new Set(rows.map((row) => row.email)).size !== rows.length) { setError('同じメールアドレスが重複しています。送信先を確認してください。'); return; }
    setError(''); setRecipients(rows);
  }
  async function send() {
    if (recipients && await run({ type: 'INVITE', templateId: template.id, recipients })) onDone();
  }
  return <><button className="back-button" onClick={onBack} disabled={busy}><ArrowLeft size={16} />手続き一覧に戻る</button><div className="page-heading"><div><h1>入社手続きに招待</h1><p>従業員ごとに専用の入力フォームを作成します。</p></div></div><div className="invite-layout"><Block className="form-section"><h2 className="section-heading">{recipients ? '送信先を確認' : '送信先を追加'}</h2>{recipients ? <><ul className="recipient-list">{recipients.map((row) => <li key={row.email}><span className="avatar">{row.name.slice(0, 1)}</span><div><strong>{row.name}</strong><small>{row.email}</small></div></li>)}</ul><div className="button-row"><button className="button secondary" onClick={() => setRecipients(null)} disabled={busy}>送信先を修正</button><button className="button primary" onClick={() => void send()} disabled={busy}><Send size={16} />{busy ? '作成中…' : `${recipients.length}名に招待を送信`}</button></div></> : <><div className="recipient-inputs">{drafts.map((row, index) => <div className="recipient-input-row" key={row.id}>
    <div className="recipient-row-heading"><strong>従業員 {index + 1}</strong>{drafts.length > 1 && <button type="button" className="icon-button" aria-label={`${index + 1}人目の従業員を削除`} onClick={() => { setDrafts(drafts.filter((item) => item.id !== row.id)); setError(''); }} disabled={busy}><X size={16} /></button>}</div>
    <div className="recipient-field-pair">
      <div className="form-field"><label htmlFor={`recipient-name-${row.id}`}>従業員名</label><TextField id={`recipient-name-${row.id}`} placeholder="佐藤 花子" value={row.name} onChange={(event) => updateRecipient(row.id, 'name', event.target.value)} maxLength={120} autoComplete="off" disabled={busy} aria-required="true" /></div>
      <div className="form-field"><label htmlFor={`recipient-email-${row.id}`}>メールアドレス</label><TextField id={`recipient-email-${row.id}`} type="email" placeholder="sato@example.com" value={row.email} onChange={(event) => updateRecipient(row.id, 'email', event.target.value)} maxLength={254} autoComplete="off" disabled={busy} aria-required="true" /></div>
    </div>
  </div>)}</div><button type="button" className="button secondary" onClick={() => setDrafts([...drafts, { id: crypto.randomUUID(), name: '', email: '' }])} disabled={busy || drafts.length >= 20}><Plus size={15} />従業員を追加</button><p className="muted">1回につき20名まで招待できます。通知と模拟メールが記録されます。</p>{error && <p role="alert" className="field-error">{error}</p>}<button className="button primary" onClick={confirm}>送信内容を確認</button></>}</Block><Block className="email-preview"><div className="email-heading"><Mail size={20} /><strong>案内内容のプレビュー</strong></div><div className="email-body"><small>件名：{template.title}のご案内</small><h2>入社手続きのご案内</h2><p>ご入社おめでとうございます。</p><p>以下のフォームから、入社に必要な情報をご入力ください。</p><dl><div><dt>手続き</dt><dd>{template.title}</dd></div><div><dt>提出期限</dt><dd>{formatDate(template.dueDate)}</dd></div></dl><span className="email-cta">入社手続きを始める</span><p className="muted">この内容は模拟メールとしてローカルに記録され、実際には送信されません。</p></div></Block></div></>;
}

export function InvitationPreview({ task, message, onOpen, onBack }: { task: Task; message?: MailMessage; onOpen: () => void; onBack: () => void }) {
  return <><button className="back-button" onClick={onBack}><ArrowLeft size={16} />一覧に戻る</button><div className="page-heading"><div><h1>模拟メール</h1><p>ローカルに記録された案内です。実際には送信されていません。</p></div></div><Block className="email-preview standalone-email"><div className="email-heading"><Mail size={20} /><div><strong>To: {task.email}</strong><small>件名：{message?.subject ?? `${task.template.title}のご案内`}</small></div></div><div className="email-body">{message ? <p className="email-raw">{message.body}</p> : <><p>{task.employeeName} 様</p><h2>入社手続きのご案内</h2><p>ご入社おめでとうございます。<br />以下のフォームから必要な情報をご入力ください。</p><p>提出期限：{formatDate(task.template.dueDate)}</p></>}<button className="button primary" onClick={onOpen}>この従業員としてフォームを開く</button><p className="muted">デモ上で従業員の表示に切り替わります。</p></div></Block></>;
}
