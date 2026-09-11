import { useState } from 'react';
import { ArrowLeft, Eye, Plus } from 'lucide-react';
import { FIELDS, MODULES, type Action, type ModuleId, type Template, type Workspace } from '../../domain/onboarding';
import { Block, TextField } from '../mf';
import { FormSections } from './FormSections';

export type RunAction = (action: Action) => Promise<Workspace | null>;

export function TemplateBuilder({ run, busy, onCreated, onBack }: { run: RunAction; busy: boolean; onCreated: (id: string) => void; onBack: () => void }) {
  const [template, setTemplate] = useState<Template>(() => ({ id: crypto.randomUUID(), title: '入社手続きフォーム', description: 'ご入社おめでとうございます。\n入社前に、以下の情報をご入力ください。途中で一時保存し、後から再開できます。', dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), modules: ['personal', 'bank', 'commute'], requiredFields: FIELDS.filter((field) => field.id !== 'commuteRoute').map((field) => field.id), createdAt: '' }));
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  function toggleModule(id: ModuleId) {
    const modules = template.modules.includes(id) ? template.modules.filter((item) => item !== id) : [...template.modules, id];
    setTemplate({ ...template, modules, requiredFields: template.requiredFields.filter((id) => FIELDS.some((field) => field.id === id && modules.includes(field.module))) });
  }
  async function create() {
    if (!template.title.trim() || !template.dueDate || template.modules.length === 0) { setError('フォーム名、提出期限、1つ以上の入力セクションを指定してください。'); return; }
    const { createdAt: _createdAt, ...input } = template;
    void _createdAt;
    const result = await run({ type: 'CREATE_TEMPLATE', template: input });
    if (result) onCreated(template.id);
  }
  return <>
    <button className="back-button" onClick={onBack} disabled={busy}><ArrowLeft size={16} />手続き一覧に戻る</button>
    <div className="page-heading"><div><h1>ワークフローを作成</h1><p>集めたい情報を選び、新入社員に同じフォームを届けます。</p></div><button className="button secondary" onClick={() => setPreview(!preview)} disabled={busy}><Eye size={16} />{preview ? '設定に戻る' : '従業員画面をプレビュー'}</button></div>
    <div className="builder-layout">
      <div className={preview ? 'form-column' : 'builder-main'}>{preview ? <><div className="preview-banner">従業員画面のプレビュー・入力内容は保存されません</div><Block className="form-intro"><h2>{template.title}</h2><p>{template.description}</p></Block><FormSections template={template} answers={{}} onChange={() => {}} disabled prefix="preview" /></> : <>
        <Block className="form-section"><h2 className="section-heading">フォームの基本設定</h2><div className="form-field"><label htmlFor="template-title">フォーム名</label><TextField id="template-title" value={template.title} onChange={(e) => setTemplate({ ...template, title: e.target.value })} maxLength={100} disabled={busy} /></div><div className="form-field"><label htmlFor="template-description">従業員への説明</label><textarea id="template-description" value={template.description} onChange={(e) => setTemplate({ ...template, description: e.target.value })} rows={4} maxLength={1000} disabled={busy} /></div><div className="form-field"><label htmlFor="template-date">提出期限</label><TextField id="template-date" type="date" value={template.dueDate} onChange={(e) => setTemplate({ ...template, dueDate: e.target.value })} disabled={busy} /></div></Block>
        <Block className="form-section"><h2 className="section-heading">収集する情報</h2><p className="section-caption">セクションを選択し、必要な項目を必須に設定してください。</p>{MODULES.map((module) => <div className="module-config" key={module.id}><label className="module-toggle"><input type="checkbox" checked={template.modules.includes(module.id)} onChange={() => toggleModule(module.id)} disabled={busy} /><span><strong>{module.label}</strong><small>{module.description}</small></span></label>{template.modules.includes(module.id) && <div className="required-config">{FIELDS.filter((field) => field.module === module.id).map((field) => <label key={field.id}><span>{field.label}</span><span><input type="checkbox" aria-label={`${field.label}を必須にする`} checked={template.requiredFields.includes(field.id)} onChange={() => setTemplate({ ...template, requiredFields: template.requiredFields.includes(field.id) ? template.requiredFields.filter((id) => id !== field.id) : [...template.requiredFields, field.id] })} disabled={busy} />必須</span></label>)}</div>}</div>)}</Block>
      </>}</div>
      <aside className="builder-summary"><Block className="form-section"><h2>このワークフロー</h2><dl><div><dt>セクション</dt><dd>{template.modules.length}</dd></div><div><dt>入力項目</dt><dd>{FIELDS.filter((field) => template.modules.includes(field.module)).length}</dd></div><div><dt>必須項目</dt><dd>{template.requiredFields.length}</dd></div></dl><p>作成後に従業員と送信先を選びます。送信済みのフォームは変更されません。</p>{error && <p role="alert" className="field-error">{error}</p>}<button className="button primary full-width" onClick={() => void create()} disabled={busy}><Plus size={16} />{busy ? '保存中…' : '作成して送信先を選ぶ'}</button></Block></aside>
    </div>
  </>;
}
