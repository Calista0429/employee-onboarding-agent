import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Save, ShieldCheck } from 'lucide-react';
import { MODULES, validateAnswers, type Answers, type Task } from '../../domain/onboarding';
import { Block } from '../mf';
import { AnswerSummary, FormSections, History, TaskBadge } from './FormSections';
import { formatDate } from './display';
import type { RunAction } from './TemplateBuilder';

export function TaskDetail({ task, role, run, busy, onBack, onDirtyChange }: { task: Task; role: 'hr' | 'employee'; run: RunAction; busy: boolean; onBack: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [answers, setAnswers] = useState<Answers>(task.answers);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState('');
  const [reason, setReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const editable = role === 'employee' && ['NOT_STARTED', 'IN_PROGRESS', 'RETURNED'].includes(task.status);
  const dirty = JSON.stringify(answers) !== JSON.stringify(task.answers);
  useEffect(() => { onDirtyChange(editable && dirty); return () => onDirtyChange(false); }, [dirty, editable, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function validate(complete: boolean) {
    const found = validateAnswers(task.template, answers, complete);
    setErrors(found);
    if (Object.keys(found).length) { document.getElementById(`answer-${Object.keys(found)[0]}`)?.focus(); return false; }
    return true;
  }
  async function save() {
    if (!validate(false)) return;
    if (await run({ type: 'SAVE_DRAFT', taskId: task.id, answers, version: task.version })) setSaved(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
  }
  async function submit() {
    if (await run({ type: 'SUBMIT', taskId: task.id, answers, version: task.version })) setConfirm(false);
  }
  async function review(decision: 'CONFIRM' | 'RETURN') {
    if (decision === 'RETURN' && !reason.trim()) { setReviewError('修正が必要な項目と理由を入力してください。'); return; }
    if (await run({ type: 'REVIEW', taskId: task.id, decision, reason, version: task.version })) { setReturning(false); setReason(''); }
  }
  function back() {
    onBack();
  }
  const completed = task.template.requiredFields.filter((id) => answers[id]?.trim()).length;
  const total = task.template.requiredFields.length;
  return <>
    <button className="back-button" onClick={back} disabled={busy}><ArrowLeft size={16} />手続き一覧に戻る</button>
    <div className="page-heading"><div><div className="heading-inline"><h1>{confirm ? '入力内容の確認' : task.template.title}</h1><TaskBadge task={task} /></div><p>{task.employeeName} さんの入社手続き <span className="deadline">提出期限 {formatDate(task.template.dueDate)}</span></p></div></div>
    {task.status === 'SUBMITTED' && <div className="success-notice" role="status"><CheckCircle2 size={21} /><div><strong>資料は提出済みです。</strong><p>入力内容は保存されました。HR の確認をお待ちください。</p></div></div>}
    {task.status === 'CONFIRMED' && <div className="success-notice"><ShieldCheck size={21} /><div><strong>入社手続きが完了しました。</strong><p>HR が提出内容を確認しました。</p></div></div>}
    {task.status === 'RETURNED' && <div className="warning-notice"><strong>修正をお願いします</strong><p>{[...task.history].reverse().find((entry) => entry.type === 'RETURNED')?.note}</p></div>}
    <div className="task-layout"><div className="form-column">
      <Block className="form-intro"><h2>{confirm ? '内容を確認してから提出してください' : 'ご入社おめでとうございます'}</h2><p>{confirm ? '口座番号やメールアドレスに誤りがないかご確認ください。' : task.template.description}</p>{editable && !confirm && <><div className="progress-label"><span>必須項目の入力状況</span><strong>{completed} / {total}</strong></div><progress max={total || 1} value={total === 0 ? 1 : completed} aria-label="必須項目の入力状況" /><nav className="section-jumps" aria-label="フォームのセクション">{MODULES.filter((module) => task.template.modules.includes(module.id)).map((module) => <a href={`#answer-${module.id}`} key={module.id}>{module.label}</a>)}</nav></>}</Block>
      {editable && !confirm ? <form noValidate onSubmit={(event) => { event.preventDefault(); if (validate(true)) setConfirm(true); }}>
        <FormSections template={task.template} answers={answers} onChange={(id, value) => { setAnswers({ ...answers, [id]: value }); setSaved(''); setErrors({ ...errors, [id]: '' }); }} errors={errors} disabled={busy} />
        {Object.values(errors).some(Boolean) && <p className="field-error" role="alert">入力内容を確認してください。エラーのある項目に説明を表示しています。</p>}
        <div className="form-actions"><span className="save-status" role="status">{saved ? `${saved} 一時保存しました` : dirty ? '未保存の変更があります' : '入力内容は一時保存できます'}</span><div className="button-row"><button type="button" className="button secondary" onClick={() => void save()} disabled={busy}><Save size={16} />一時保存</button><button className="button primary" type="submit" disabled={busy}>入力内容を確認</button></div></div>
      </form> : <><AnswerSummary template={task.template} answers={editable ? answers : task.answers} />{editable && confirm && <div className="form-actions"><button className="button secondary" onClick={() => setConfirm(false)} disabled={busy}>入力に戻る</button><button className="button primary" onClick={() => void submit()} disabled={busy}><Check size={16} />{busy ? '提出中…' : 'この内容で提出する'}</button></div>}</>}
      {role === 'hr' && task.status === 'SUBMITTED' && <Block className="form-section review-panel"><h2 className="section-heading">提出内容の確認</h2><p>資料を確認し、修正が必要な場合は理由を添えて差し戻してください。</p>{returning && <div className="form-field"><label htmlFor="return-reason">修正依頼の内容</label><textarea id="return-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={busy} />{reviewError && <p role="alert" className="field-error">{reviewError}</p>}</div>}<div className="button-row"><button className="button secondary" onClick={() => returning ? void review('RETURN') : setReturning(true)} disabled={busy}>{returning ? '修正依頼を送る' : '差し戻す'}</button>{returning ? <button className="text-button" onClick={() => setReturning(false)} disabled={busy}>キャンセル</button> : <button className="button primary" onClick={() => void review('CONFIRM')} disabled={busy}><Check size={16} />確認を完了する</button>}</div></Block>}
    </div><aside className="task-aside"><Block className="task-person"><span className="avatar large">{task.employeeName.slice(0, 1)}</span><strong>{task.employeeName}</strong><small>{task.email}</small><TaskBadge task={task} /></Block><History task={task} /></aside></div>
  </>;
}
