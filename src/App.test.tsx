import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import App from './App';
import { createMemoryApi } from './data/memory';
import type { AgentClient, AgentMessage } from './domain/agent';
import { FIELDS, HR_ACTOR, type WorkspaceView } from './domain/onboarding';

beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });

test('opens the HR workspace with the assistant entry point and the simulated-mail disclosure', async () => {
  render(<App api={createMemoryApi()} />);
  expect(await screen.findByRole('heading', { name: '入社手続き', level: 1 })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ワークフローを作成' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'AI アシスタント' })).toBeInTheDocument();
  expect(screen.getByText(/実際には送信されません/)).toBeInTheDocument();
});

test('creates a bank form, invites employees, resumes a draft, submits and confirms', async () => {
  const user = userEvent.setup();
  const api = createMemoryApi();
  render(<App api={api} />);
  await user.click(await screen.findByRole('button', { name: 'ワークフローを作成' }));
  await user.clear(screen.getByLabelText('フォーム名'));
  await user.type(screen.getByLabelText('フォーム名'), '口座登録テスト');
  await user.click(screen.getByRole('checkbox', { name: /本人情報.*氏名/ }));
  await user.click(screen.getByRole('checkbox', { name: /通勤情報.*通勤方法/ }));
  await user.click(screen.getByRole('button', { name: '従業員画面をプレビュー' }));
  expect(screen.getByLabelText(/銀行コード$/)).toBeDisabled();
  expect(screen.queryByLabelText(/生年月日$/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '作成して送信先を選ぶ' }));
  await user.type(await screen.findByLabelText('従業員名'), '佐藤 花子');
  await user.type(screen.getByLabelText('メールアドレス'), 'sato@example.com');
  await user.click(screen.getByRole('button', { name: '従業員を追加' }));
  await user.type(screen.getAllByLabelText('従業員名')[1], '鈴木 太郎');
  await user.type(screen.getAllByLabelText('メールアドレス')[1], 'suzuki@example.com');
  await user.click(screen.getByRole('button', { name: '送信内容を確認' }));
  await user.click(screen.getByRole('button', { name: '2名に招待を送信' }));
  await user.click(await screen.findByRole('button', { name: '佐藤 花子の模拟メールを見る' }));
  await user.click(screen.getByRole('button', { name: 'この従業員としてフォームを開く' }));
  expect(await screen.findByRole('heading', { name: '口座登録テスト', level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'ワークフローを作成' })).not.toBeInTheDocument();
  await user.type(screen.getByLabelText(/銀行名$/), 'デモ銀行');
  await user.click(screen.getByRole('button', { name: '一時保存' }));
  expect(await screen.findByText(/\d{2}:\d{2} 一時保存しました$/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '手続き一覧に戻る' }));
  await user.click(await screen.findByRole('button', { name: '佐藤 花子の口座登録テストを開く' }));
  expect(screen.getByLabelText(/銀行名$/)).toHaveValue('デモ銀行');
  const answers = { bankCode: '0001', branchName: '架空支店', branchCode: '001', accountNumber: '0012345', accountHolder: 'サトウ ハナコ' };
  for (const [id, value] of Object.entries(answers)) {
    const field = FIELDS.find((item) => item.id === id)!;
    fireEvent.change(screen.getByLabelText(new RegExp(`${field.label}$`)), { target: { value } });
  }
  await user.selectOptions(screen.getByLabelText(/口座種別$/), '普通');
  await user.click(screen.getByRole('button', { name: '入力内容を確認' }));
  expect(screen.getByText('••••345')).toBeInTheDocument();
  expect(screen.queryByText('0012345')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'この内容で提出する' }));
  expect(await screen.findByText('資料は提出済みです。')).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('表示ユーザー'), 'hr');
  await user.click(await screen.findByRole('button', { name: '佐藤 花子の口座登録テストを開く' }));
  await user.click(screen.getByRole('button', { name: '確認を完了する' }));
  expect(await screen.findByText('入社手続きが完了しました。')).toBeInTheDocument();
  const view = await api.load(HR_ACTOR);
  const task = view.tasks.find((item) => item.email === 'sato@example.com');
  expect(task?.answers.accountNumber).toBe('0012345');
  expect(task?.status).toBe('CONFIRMED');
  expect(view.outbox.filter((message) => message.to === 'sato@example.com')).toHaveLength(1);
}, 30000);

test('an agent request creates a workflow and the notification centre records the invitation', async () => {
  const user = userEvent.setup();
  const api = createMemoryApi();
  let created = false;
  const agent: AgentClient = {
    status: async () => ({ provider: 'mock', model: 'mock', simulated: true, reminder: { idleHours: 48, maxReminders: 2 } }),
    chat: async (messages: AgentMessage[]) => {
      if (!created) {
        created = true;
        await api.act(HR_ACTOR, { type: 'CREATE_TEMPLATE', template: { id: 'agent-template', title: 'エージェント作成', description: '説明', dueDate: '2026-12-31', modules: ['personal'], requiredFields: ['lastName'] } });
      }
      const workspace: WorkspaceView = await api.act(HR_ACTOR, { type: 'INVITE', templateId: 'agent-template', recipients: [{ name: '佐藤 花子', email: 'sato@example.com' }] });
      const reply = '「エージェント作成」を作成し、1名（佐藤 花子）に招待を送信しました。';
      const transcript: AgentMessage[] = [
        ...messages,
        { role: 'assistant', content: '', toolCalls: [{ id: 'call-1', name: 'invite_employees', arguments: { templateId: 'agent-template' } }] },
        { role: 'tool', toolCallId: 'call-1', name: 'invite_employees', content: JSON.stringify({ invited: [{ taskId: 'task-1', email: 'sato@example.com' }] }) },
        { role: 'assistant', content: reply },
      ];
      return { reply, transcript, workspace, actions: ['create_template', 'invite_employees'] };
    },
  };
  render(<App api={api} agent={agent} />);
  await user.click(await screen.findByRole('button', { name: 'AI アシスタント' }));
  expect(await screen.findByText(/オフライン Agent/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('アシスタントへの依頼'), '入社手続きを作成して田中さんに送ってください');
  await user.click(screen.getByRole('button', { name: '依頼する' }));
  expect(await screen.findByText(/1名（佐藤 花子）に招待を送信しました/)).toBeInTheDocument();
  expect(screen.getAllByText('フォームを作成').length).toBeGreaterThan(0);
  // Raw tool results drive the next provider turn but must never render as a chat bubble.
  expect(screen.queryByText(/invited/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^通知/ }));
  expect(await screen.findByText('エージェント作成のご案内')).toBeInTheDocument();
  expect(screen.getByText(/佐藤 花子 様/)).toBeInTheDocument();
});

test('focuses the first missing required field and does not submit incomplete answers', async () => {
  const user = userEvent.setup();
  const api = createMemoryApi();
  render(<App api={api} />);
  await user.click(await screen.findByRole('button', { name: '田中 葵の模拟メールを見る' }));
  await user.click(screen.getByRole('button', { name: 'この従業員としてフォームを開く' }));
  await user.click(await screen.findByRole('button', { name: '入力内容を確認' }));
  expect(screen.getByLabelText(/^必須\s*姓$/)).toHaveFocus();
  expect(screen.getAllByText('必須項目です。').length).toBeGreaterThan(1);
  const view = await api.load({ role: 'employee', email: 'tanaka@example.com' });
  expect(view.tasks[0].status).toBe('NOT_STARTED');
});
