import { useState } from 'react';
import { FIELDS, MODULES, type Answers, type Task, type Template } from '../../domain/onboarding';
import { Block, StatusLabel, TextField } from '../mf';
import { taskLabels, formatDate } from './display';

export function TaskBadge({ task }: { task: Task }) {
  const color = task.status === 'CONFIRMED' ? 'green' : task.status === 'RETURNED' ? 'orange' : task.status === 'SUBMITTED' ? 'blue' : 'gray';
  return <StatusLabel color={color} outline>{taskLabels[task.status]}</StatusLabel>;
}

export function FormSections({ template, answers, onChange, errors = {}, disabled = false, prefix = 'answer' }: {
  template: Template; answers: Answers; onChange: (id: string, value: string) => void; errors?: Record<string, string>; disabled?: boolean; prefix?: string;
}) {
  return <div className="form-sections">{MODULES.filter((module) => template.modules.includes(module.id)).map((module) => <Block className="form-section" key={module.id} id={`${prefix}-${module.id}`}>
    <h2 className="section-heading">{module.label}</h2><p className="section-caption">{module.description}</p>
    <div className="fields-grid">{FIELDS.filter((field) => field.module === module.id).map((field) => {
      const id = `${prefix}-${field.id}`;
      const required = template.requiredFields.includes(field.id);
      return <div className={`form-field ${['address', 'contactEmail', 'accountHolder', 'commuteRoute'].includes(field.id) ? 'field-wide' : ''}`} key={id}>
        <label htmlFor={id}><StatusLabel color={required ? 'red' : 'gray'}>{required ? '必須' : '任意'}</StatusLabel><span>{field.label}</span></label>
        {field.type === 'select' ? <select id={id} className={`mf-input ${errors[field.id] ? 'mf-input-error' : ''}`} value={answers[field.id] ?? ''} onChange={(event) => onChange(field.id, event.target.value)} disabled={disabled} aria-required={required} aria-invalid={Boolean(errors[field.id])} aria-describedby={errors[field.id] ? `${id}-error` : undefined}>
          <option value="">選択してください</option>{field.options?.map((option) => <option key={option}>{option}</option>)}
        </select> : <TextField id={id} name={field.id} type={field.type === 'number' ? 'text' : field.type ?? 'text'} inputMode={['bankCode', 'branchCode', 'accountNumber', 'commuteCost'].includes(field.id) ? 'numeric' : undefined} value={answers[field.id] ?? ''} onChange={(event) => onChange(field.id, event.target.value)} disabled={disabled} error={Boolean(errors[field.id])} aria-required={required} aria-describedby={errors[field.id] ? `${id}-error` : field.hint ? `${id}-hint` : undefined} maxLength={500} autoComplete="off" />}
        {field.hint && <small id={`${id}-hint`}>{field.hint} {['bankCode', 'branchCode', 'accountNumber'].includes(field.id) && '・先頭の 0 も入力してください'}</small>}
        {field.id === 'commuteCost' && <small>1か月あたりの金額（円）</small>}
        {field.id === 'accountHolder' && <small>金融機関に登録した名義をカタカナで入力してください。</small>}
        {errors[field.id] && <p className="field-error" id={`${id}-error`}>{errors[field.id]}</p>}
      </div>;
    })}</div>
  </Block>)}</div>;
}

export function AnswerSummary({ template, answers }: { template: Template; answers: Answers }) {
  const [reveal, setReveal] = useState(false);
  return <div className="form-sections">{MODULES.filter((module) => template.modules.includes(module.id)).map((module) => <Block className="form-section" key={module.id}>
    <h2 className="section-heading">{module.label}</h2>
    <dl className="answer-list">{FIELDS.filter((field) => field.module === module.id).map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{field.id === 'accountNumber' && answers[field.id] ? <><span>{reveal ? answers[field.id] : `••••${answers[field.id].slice(-3)}`}</span><button type="button" className="text-button reveal-button" onClick={() => setReveal(!reveal)}>{reveal ? '非表示' : '口座番号を表示'}</button></> : answers[field.id] || '未入力'}</dd></div>)}</dl>
  </Block>)}</div>;
}

const historyLabels: Record<string, string> = { INVITED: '入社手続きが届きました', CREATED: '手続きが作成されました', DRAFT_SAVED: '入力内容を一時保存しました', SAVED: '入力内容を一時保存しました', SUBMITTED: '資料を提出しました', CONFIRMED: 'HR が資料を確認しました', RETURNED: '修正依頼が届きました', REMINDED: 'リマインドが届きました', EMAIL_SIMULATED: '模拟メールを記録しました', EMAIL_FAILED: '模拟メールの記録に失敗しました' };
export function History({ task }: { task: Task }) {
  return <Block className="history-panel"><h2>手続きの履歴</h2><ol className="timeline">{[...task.history].reverse().map((entry) => <li key={entry.id}><span className="timeline-dot" /><div><strong>{historyLabels[entry.type] ?? entry.type}</strong><time dateTime={entry.at}>{formatDate(entry.at)}</time>{entry.note && <p>{entry.note}</p>}</div></li>)}</ol></Block>;
}
