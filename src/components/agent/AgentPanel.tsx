import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import type { AgentClient, AgentMessage, AgentStatus } from '../../domain/agent';
import type { WorkspaceView } from '../../domain/onboarding';
import { Block, StatusLabel } from '../mf';

const EXAMPLES = [
  '本人情報と給与振込口座の入社手続きフォームを作成して、田中 葵 tanaka@example.com に送ってください。期限は今月末です。',
  '未提出の従業員にリマインドを送ってください。',
  'いまの手続きの進捗を教えてください。',
];
const actionLabels: Record<string, string> = {
  create_template: 'フォームを作成',
  invite_employees: '従業員を招待',
  send_reminders: 'リマインドを送信',
  list_pending_tasks: '未提出者を確認',
  get_workspace_overview: '進捗を取得',
};

/** HR-facing chat. The assistant can only act through its tools, which call the same domain rules as the UI. */
export function AgentPanel({ agent, busy, onBusy, onWorkspace }: {
  agent: AgentClient; busy: boolean; onBusy: (value: boolean) => void; onWorkspace: (view: WorkspaceView) => void;
}) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [transcript, setTranscript] = useState<AgentMessage[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { let active = true; agent.status().then((value) => { if (active) setStatus(value); }).catch(() => { if (active) setStatus(null); }); return () => { active = false; }; }, [agent]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [transcript]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: AgentMessage[] = [...transcript, { role: 'user', content: text }];
    setTranscript(next); setInput(''); setError(''); onBusy(true);
    try {
      const result = await agent.chat(next);
      // Tool messages are kept in the transcript because the provider needs the full pairing on the next
      // turn, but they are never rendered as chat bubbles; the action chips summarise them instead.
      setTranscript(result.transcript.filter((message) => message.role !== 'system' && message.content.trim()));
      setActions(result.actions);
      onWorkspace(result.workspace);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'アシスタントの実行に失敗しました。');
    } finally { onBusy(false); }
  }

  const bubbles = transcript.filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content.trim());

  return <>
    <div className="page-heading"><div><h1>AI アシスタント</h1><p>日本語で依頼すると、フォーム作成・招待・リマインドまでを実行します。</p></div><span className="agent-status">{status?.simulated ? <StatusLabel color="orange" outline>オフライン Agent（ルールベース）</StatusLabel> : <StatusLabel color="blue" outline>接続中: {status?.model ?? 'unknown'}</StatusLabel>}</span></div>
    <div className="agent-layout">
      <Block className="agent-panel">
        <div className="agent-transcript" aria-live="polite">
          {bubbles.length === 0 && <div className="agent-intro"><Bot size={28} /><h2>何をお手伝いしましょうか？</h2><p>フォームの作成、従業員の招待、未提出者へのリマインドを実行できます。実行内容は必ず下の入力欄から確認できます。</p></div>}
          {bubbles.map((message, index) => <div key={`${message.role}-${index}`} className={`agent-message ${message.role}`}><span className="agent-role">{message.role === 'user' ? 'あなた' : 'アシスタント'}</span><p>{message.content}</p></div>)}
          {actions.length > 0 && transcript.at(-1)?.role === 'assistant' && <div className="agent-actions">{actions.map((action, index) => <span key={`${action}-${index}`}><Sparkles size={12} />{actionLabels[action] ?? action}</span>)}</div>}
          <div ref={endRef} />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="agent-input">アシスタントへの依頼</label>
          <textarea id="agent-input" rows={3} value={input} maxLength={2000} placeholder="例：本人情報と口座の入社手続きを作成して、田中さん(tanaka@example.com)に送ってください。" onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} disabled={busy} />
          <div className="agent-composer-actions"><small>Enter で送信 / Shift + Enter で改行</small><button className="button primary" type="submit" disabled={busy || !input.trim()}><Send size={15} />{busy ? '実行中…' : '依頼する'}</button></div>
        </form>
      </Block>
      <aside className="agent-aside">
        <Block className="form-section">
          <h2 className="section-heading">依頼の例</h2>
          <ul className="agent-examples">{EXAMPLES.map((example) => <li key={example}><button type="button" className="text-button" onClick={() => setInput(example)} disabled={busy}>{example}</button></li>)}</ul>
        </Block>
        <Block className="form-section">
          <h2 className="section-heading">実行できる操作</h2>
          <ul className="agent-tools">{Object.entries(actionLabels).map(([name, label]) => <li key={name}><strong>{label}</strong><small>{name}</small></li>)}</ul>
          <p className="muted">アシスタントは専用ツール経由でのみ操作し、フォームの固定や権限の検証は通常の画面と同じルールで行われます。</p>
        </Block>
      </aside>
    </div>
  </>;
}
