import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bell, BookOpen, Bot, CheckCheck, ChevronDown, ClipboardList, History as HistoryIcon, RefreshCw, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import type { AgentClient } from './domain/agent';
import { HR_ACTOR, type Action, type Actor, type Task, type WorkspaceApi, type WorkspaceView } from './domain/onboarding';
import { httpAgent, httpApi } from './data/http';
import { Block } from './components/mf';
import { WorkspaceList, ActivityList } from './components/onboarding/WorkspaceList';
import { TemplateBuilder } from './components/onboarding/TemplateBuilder';
import { Invitations, InvitationPreview } from './components/onboarding/Invitations';
import { TaskDetail } from './components/onboarding/TaskDetail';
import { NotificationCentre } from './components/onboarding/Notifications';
import { AgentPanel } from './components/agent/AgentPanel';

const EMPTY_VIEW: WorkspaceView = { templates: [], tasks: [], notifications: [], outbox: [] };

export interface AppProps { api?: WorkspaceApi; agent?: AgentClient }

export default function App({ api: suppliedApi, agent: suppliedAgent }: AppProps) {
  const api = useMemo(() => suppliedApi ?? httpApi, [suppliedApi]);
  const agent = suppliedAgent ?? httpAgent;
  const [directory, setDirectory] = useState<WorkspaceView>(EMPTY_VIEW);
  const [actor, setActor] = useState<Actor>(HR_ACTOR);
  const [dirty, setDirty] = useState(false);
  const [initialTaskId, setInitialTaskId] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshDirectory = useCallback(async () => {
    try { setDirectory(await api.load(HR_ACTOR)); } catch { /* keep the last known directory */ }
  }, [api]);
  useEffect(() => { void refreshDirectory(); }, [refreshDirectory]);

  const people = [...new Map(directory.tasks.map((task) => [task.email, { name: task.employeeName, email: task.email }])).values()];
  const changeActor = (next: Actor, taskId = '') => {
    if (dirty && !window.confirm('未保存の入力内容があります。表示を切り替えますか？')) return;
    setDirty(false); setInitialTaskId(taskId); setActor(next);
  };

  return <div className="app-shell"><a className="skip-link" href="#main">本文へスキップ</a>
    <header className="topbar"><div className="brand"><span className="brand-symbol"><CheckCheck size={22} /></span><span>effective<span className="brand-subtitle">人事ワークスペース</span></span></div><div className="account-controls"><label className="actor-select"><span>表示を切り替え</span><select aria-label="表示ユーザー" value={actor.role === 'hr' ? 'hr' : actor.email} onChange={(event) => changeActor(event.target.value === 'hr' ? HR_ACTOR : { role: 'employee', email: event.target.value })} disabled={busy}><option value="hr">HR 管理者</option>{people.map((person) => <option key={person.email} value={person.email}>{person.name}（従業員）</option>)}</select><ChevronDown size={14} /></label><span className="avatar header-avatar">{actor.role === 'hr' ? 'HR' : people.find((person) => person.email === actor.email)?.name.slice(0, 1) ?? '私'}</span></div></header>
    <WorkspaceScreen key={`${actor.role}:${actor.email}`} actor={actor} api={api} agent={agent} busy={busy} setBusy={setBusy} dirty={dirty} setDirty={setDirty} refreshDirectory={refreshDirectory} initialTaskId={initialTaskId} onEmployee={(task) => changeActor({ role: 'employee', email: task.email }, task.id)} />
  </div>;
}

type Page = 'list' | 'create' | 'invite' | 'task' | 'mail' | 'history' | 'notifications' | 'agent' | 'notes';
type ScreenProps = {
  actor: Actor; api: WorkspaceApi; agent: AgentClient; busy: boolean; setBusy: (value: boolean) => void;
  dirty: boolean; setDirty: (value: boolean) => void; refreshDirectory: () => Promise<void>;
  onEmployee: (task: Task) => void; initialTaskId: string;
};

function WorkspaceScreen({ actor, api, agent, busy, setBusy, dirty, setDirty, refreshDirectory, onEmployee, initialTaskId }: ScreenProps) {
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null);
  const [page, setPage] = useState<Page>('list');
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    api.load(actor).then((data) => {
      if (!active) return;
      setWorkspace(data);
      const taskId = initialTaskId || new URLSearchParams(window.location.search).get('task') || '';
      if (taskId && data.tasks.some((task) => task.id === taskId)) { setSelected(taskId); setPage('task'); }
      else if (taskId && actor.role === 'employee') setError('この手続きにアクセスできません。招待されたメールアドレスかご確認ください。');
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '読み込みに失敗しました。'); });
    return () => { active = false; };
  }, [api, actor, initialTaskId]);

  function navigate(next: Page, id = '') {
    if (dirty && !window.confirm('未保存の変更があります。保存せずに移動しますか？')) return;
    setDirty(false); setPage(next); setSelected(id); setError(''); setNotice(''); window.scrollTo({ top: 0 });
  }
  function describe(cause: unknown, fallback: string) {
    return cause instanceof Error ? cause.message : fallback;
  }
  async function run(action: Action) {
    if (busy) return null;
    setBusy(true); setError(''); setNotice('');
    try { const result = await api.act(actor, action); setWorkspace(result); await refreshDirectory(); return result; }
    catch (cause) { setError(describe(cause, '処理に失敗しました。入力内容を確認して再度お試しください。')); return null; }
    finally { setBusy(false); }
  }
  async function remind() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.runReminders(actor);
      setWorkspace(result.workspace);
      setNotice(result.reminded.length ? `${result.reminded.length}名にリマインドを送信しました。通知センターと模拟メールをご確認ください。` : 'リマインドの必要な手続きはありません。');
      await refreshDirectory();
    } catch (cause) { setError(describe(cause, 'リマインドに失敗しました。')); }
    finally { setBusy(false); }
  }
  async function markRead(ids?: string[]) {
    try { setWorkspace(await api.markNotificationsRead(actor, ids)); }
    catch (cause) { setError(describe(cause, '既読の更新に失敗しました。')); }
  }
  async function reload() {
    if (dirty && !window.confirm('最新の状態を読み込むと未保存の内容が失われます。続けますか？')) return;
    setBusy(true); setError('');
    try { setWorkspace(await api.load(actor)); setDirty(false); setPage('list'); await refreshDirectory(); }
    catch (cause) { setError(describe(cause, '読み込みに失敗しました。')); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!window.confirm('作成したワークフローと入力内容を削除し、サンプルに戻しますか？')) return;
    setBusy(true); setDirty(false);
    try { setWorkspace(await api.reset(actor)); setPage('list'); await refreshDirectory(); }
    catch (cause) { setError(describe(cause, 'リセットに失敗しました。')); }
    finally { setBusy(false); }
  }

  const unread = workspace?.notifications.filter((item) => !item.readAt).length ?? 0;
  const task = workspace?.tasks.find((item) => item.id === selected);
  const template = workspace?.templates.find((item) => item.id === selected);
  const nav: { page: Page; label: string; icon: ReactNode; active: boolean; badge?: number }[] = [
    { page: 'list', label: '入社手続き', icon: <ClipboardList size={18} />, active: ['list', 'task', 'create', 'invite', 'mail'].includes(page) },
    ...(actor.role === 'hr' ? [{ page: 'agent' as Page, label: 'AI アシスタント', icon: <Bot size={18} />, active: page === 'agent' }] : []),
    { page: 'notifications', label: '通知', icon: <Bell size={18} />, active: page === 'notifications', ...(unread ? { badge: unread } : {}) },
    { page: 'history', label: '手続きの履歴', icon: <HistoryIcon size={18} />, active: page === 'history' },
    { page: 'notes', label: 'このプロジェクトについて', icon: <BookOpen size={18} />, active: page === 'notes' },
  ];

  return <><aside className="sidebar"><div className="workspace-name"><span className="workspace-square">E</span><div>Effective 株式会社<small>ローカルデモ</small></div></div><div className="nav-group-label">ワークスペース</div><nav aria-label="メインメニュー">{nav.map((item) => <button key={item.page} className={item.active ? 'active' : ''} onClick={() => navigate(item.page)} disabled={busy}>{item.icon}{item.label}{item.badge ? <span className="nav-badge">{item.badge}</span> : null}</button>)}</nav><div className="sidebar-footer"><ShieldCheck size={19} /><p>必要な情報を、<br />必要な人だけに。</p><small>Employee onboarding</small></div></aside>
    <div className="workspace-body"><div className="demo-banner"><span><Sparkles size={14} /><strong>ローカルデモ</strong><span>架空のデータを使用しています。メールは模拟記録のみで、実際には送信されません。</span></span>{actor.role === 'hr' && <button onClick={() => void reset()} disabled={busy}><RotateCcw size={13} />リセット</button>}</div><div className="breadcrumb"><span>ワークスペース</span><span>/</span><strong>{page === 'history' ? '手続きの履歴' : page === 'notes' ? 'プロジェクトについて' : page === 'agent' ? 'AI アシスタント' : page === 'notifications' ? '通知' : '入社手続き'}</strong><button className="text-button" onClick={() => void reload()} disabled={busy}><RefreshCw size={13} />更新</button></div>
      <main id="main" className="main-content" aria-busy={busy}>
        {error && <div className="error-notice" role="alert">{error}<p>再試行するか、右上の「更新」で最新の状態を確認してください。</p></div>}{notice && <div className="success-notice" role="status">{notice}</div>}
        {!workspace ? <div className="loading">{error ? 'ワークスペースを読み込めませんでした。' : 'ワークスペースを読み込み中…'}</div> : <>
          {page === 'list' && <WorkspaceList workspace={workspace} role={actor.role} busy={busy} onCreate={() => navigate('create')} onOpen={(item) => navigate('task', item.id)} onMail={actor.role === 'hr' ? (item) => navigate('mail', item.id) : undefined} onInvite={(item) => navigate('invite', item.id)} onRemind={() => void remind()} onResend={(item) => { void run({ type: 'RESEND', taskId: item.id }).then((result) => { if (result) setNotice('模拟メールを再記録しました。'); }); }} />}
          {page === 'create' && actor.role === 'hr' && <TemplateBuilder run={run} busy={busy} onCreated={(id) => navigate('invite', id)} onBack={() => navigate('list')} />}
          {page === 'invite' && template && actor.role === 'hr' && <Invitations template={template} run={run} busy={busy} onBack={() => navigate('list')} onDone={() => { navigate('list'); setNotice('招待を作成しました。通知センターと模拟メールから従業員の入力を確認できます。'); }} />}
          {page === 'task' && task && <TaskDetail key={task.id} task={task} role={actor.role} run={run} busy={busy} onBack={() => navigate('list')} onDirtyChange={setDirty} />}
          {page === 'mail' && task && actor.role === 'hr' && <InvitationPreview task={task} message={workspace.outbox.filter((item) => item.taskId === task.id).at(-1)} onOpen={() => onEmployee(task)} onBack={() => navigate('list')} />}
          {page === 'history' && <ActivityList workspace={workspace} onOpen={(item) => navigate('task', item.id)} />}
          {page === 'notifications' && <NotificationCentre notifications={workspace.notifications} role={actor.role} onOpen={(taskId) => navigate('task', taskId)} onMarkRead={(ids) => void markRead(ids)} />}
          {page === 'agent' && actor.role === 'hr' && <AgentPanel agent={agent} busy={busy} onBusy={setBusy} onWorkspace={(view) => { setWorkspace(view); void refreshDirectory(); }} />}
          {page === 'notes' && <ProjectNotes />}
          {['task', 'mail', 'invite'].includes(page) && !task && !template && <Block className="empty-state">手続きが見つかりません。「更新」で一覧を読み込み直してください。</Block>}
        </>}
      </main><footer className="workspace-footer">Effective · Independent portfolio project<span>React / local Node service / Agent</span></footer></div></>;
}

function ProjectNotes() {
  return <><div className="page-heading"><div><h1>このプロジェクトについて</h1><p>フォーム実装の、その先を考える。</p></div></div><Block className="form-section project-notes"><h2>入社情報を集める、小さなワークフロー</h2><p>HR が必要な情報を定義し、従業員が入力・提出し、HR が確認するまでを一つの体験として設計しました。提出された内容はローカルサーバーに保存されます。</p><h3>実装したこと</h3><p>フォームテンプレート、従業員ごとの招待、草稿保存、提出前の確認、確認・差し戻し、操作履歴。送信済みのフォーム定義は固定し、資料の取り違えを防ぎます。</p><h3>AI アシスタント</h3><p>HR は日本語で依頼するだけで、フォームの作成・従業員の招待・未提出者へのリマインドをアシスタントに任せられます。アシスタントは専用のツールを通じてのみ操作し、業務ルールはこれまでと同じ検証層が強制します。API キー未設定時はオフラインのルールベース Agent が動作します。</p><h3>通知と模拟メール</h3><p>招待・リマインド・差し戻しは通知センターに記録され、同じ内容が模拟メールとして保存されます。実際のメール送信は行いません。未提出の手続きはサーバーが定期的に検出し、自動でリマインドします。</p><h3>Money Forward の公開コンポーネント</h3><p>TextField・Block・StatusLabel は、MIT ライセンスの公開リポジトリから局所的に適応しています。React 18 向けにスタイルとアクセシビリティを調整しました。</p><a href="https://github.com/moneyforward/cloud-react-ui/tree/2ef9d67b4196b1178a23fe780f37cc6b652a6516" target="_blank" rel="noreferrer">公開リポジトリを開く</a><p className="muted">Money Forward の製品ではありません。非公開の実装や実在する従業員のデータは含みません。</p></Block></>;
}
