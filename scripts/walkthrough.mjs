#!/usr/bin/env node
// Drives a real Chrome through the full HR and employee journey and saves screenshots.
//
// Requirements: Google Chrome installed, `playwright-core` available (npm i -D playwright-core),
// and the app running (npm run build && npm start). Start from a fresh STATE_FILE so the seed data
// is present, and keep AGENT_API_KEY unset for the deterministic offline Agent if you want identical
// wording, or set it to exercise a real model (titles and section choices will then vary).
//
// Usage: node scripts/walkthrough.mjs [baseUrl] [outputDir]

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const baseUrl = process.argv[2] ?? process.env.WALKTHROUGH_URL ?? 'http://127.0.0.1:8787';
const outDir = resolve(process.argv[3] ?? 'docs/images');
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };

// Japanese inputs used for the walkthrough. All data is synthetic. Fields are addressed by their
// stable domain id (`answer-<fieldId>`) so the script does not depend on label wording or on which
// fields the assistant marked required.
const AGENT_REQUEST = '本人情報と給与振込口座、通勤情報の入社手続きフォームを作成して、山田 太郎 yamada@example.com と 佐藤 花子 sato@example.com に送ってください。期限は今月末です。';
const TEXT_FIELDS = [
  ['lastName', '佐藤'], ['firstName', '花子'], ['lastNameKana', 'サトウ'], ['firstNameKana', 'ハナコ'],
  ['birthDate', '1995-04-12'], ['address', '東京都千代田区丸の内1-1-1 Effectiveビル10F'], ['contactEmail', 'hanako.sato@example.com'],
  ['bankName', 'みずほ銀行'], ['bankCode', '0001'], ['branchName', '丸の内支店'], ['branchCode', '001'],
  ['accountNumber', '0012345'], ['accountHolder', 'サトウ ハナコ'],
  ['commuteFrom', '横浜駅'], ['commuteTo', '東京駅'], ['commuteRoute', '東海道線（普通）'], ['commuteCost', '12000'],
];
const SELECT_FIELDS = [['accountType', '普通'], ['commuteMethod', '電車・バス']];
const EMPLOYEE_EMAIL = 'sato@example.com';

const { chromium } = await import('playwright-core').catch(() => {
  console.error('playwright-core is not installed. Run: npm i -D playwright-core');
  process.exit(1);
});

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const context = await browser.newContext({ viewport: desktop, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const page = await context.newPage();
// The app guards unsaved work with window.confirm; a human would accept it.
page.on('dialog', (dialog) => dialog.accept());

const answer = (fieldId) => page.locator(`#answer-${fieldId}`);
const rowFor = (email) => page.locator('.task-table tbody tr', { hasText: email });
let index = 0;

async function shot(name, options = {}) {
  const file = `${String((index += 1)).padStart(2, '0')}-${name}.png`;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${file}`, ...options });
  console.log(`  saved ${file}`);
}

async function fillIfPresent(fieldId, value) {
  const target = answer(fieldId);
  if (!(await target.count())) return false;
  await target.fill(value);
  return true;
}

console.log(`Walking ${baseUrl} as a human would. Screenshots go to ${outDir}`);

// 1. HR opens the workspace and starts from the seeded data so a re-run stays comparable.
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.getByRole('heading', { level: 1, name: '入社手続き' }).waitFor();
await page.getByRole('button', { name: 'リセット' }).click();
await page.getByRole('heading', { level: 1, name: '入社手続き' }).waitFor();
await page.waitForTimeout(600);
await shot('hr-dashboard');
console.log('  note: seeded dashboard with two synthetic employees');

// 2. HR asks the assistant, in Japanese, to create and send the workflow.
await page.getByRole('button', { name: 'AI アシスタント' }).click();
await page.getByRole('heading', { level: 1, name: 'AI アシスタント' }).waitFor();
await page.getByLabel('アシスタントへの依頼').fill(AGENT_REQUEST);
await shot('assistant-request');

await page.getByRole('button', { name: '依頼する' }).click();
console.log('  waiting for the assistant (a real model can take a minute)…');
await page.locator('.agent-message.assistant').first().waitFor({ timeout: 300_000 });
await page.locator('.agent-actions span').first().waitFor({ timeout: 60_000 });
const reply = (await page.locator('.agent-message.assistant p').last().innerText()).replace(/\s+/g, ' ').trim();
console.log(`  assistant reply: ${reply.slice(0, 240)}`);
await shot('assistant-result');

// 3. The notifications the assistant produced.
await page.getByRole('button', { name: /^通知/ }).click();
await page.locator('.notification-list li').first().waitFor();
await shot('notifications');

// 4. The task list now carries the new invitations.
await page.getByRole('button', { name: '入社手続き' }).click();
await page.getByRole('heading', { level: 1, name: '入社手続き' }).waitFor();
await rowFor(EMPLOYEE_EMAIL).first().waitFor();
await shot('task-list');

// 5. HR checks the simulated message that was recorded for the employee.
await rowFor(EMPLOYEE_EMAIL).getByRole('button', { name: /模拟メールを見る/ }).click();
await page.getByRole('heading', { level: 1, name: '模拟メール' }).waitFor();
await shot('simulated-mail');

// 6. HR opens the form as the employee and fills it with Japanese data.
await page.getByRole('button', { name: 'この従業員としてフォームを開く' }).click();
await page.getByRole('button', { name: '入力内容を確認' }).waitFor();
let filled = 0;
for (const [fieldId, value] of TEXT_FIELDS) if (await fillIfPresent(fieldId, value)) filled += 1;
for (const [fieldId, value] of SELECT_FIELDS) {
  const target = answer(fieldId);
  if (await target.count()) { await target.selectOption(value); filled += 1; }
}
console.log(`  filled ${filled} fields (sections chosen by the model may differ)`);
await page.evaluate(() => window.scrollTo({ top: 0 }));
await shot('employee-form-desktop');

// 7. The same form on a phone viewport.
await page.setViewportSize(mobile);
await shot('employee-form-mobile');
await page.setViewportSize(desktop);

// 8. Review before submitting: the account number must be masked.
await page.getByRole('button', { name: '入力内容を確認' }).click();
await page.getByText('••••345').waitFor({ timeout: 30_000 });
await shot('confirmation-masked', { fullPage: true });
await page.getByRole('button', { name: '口座番号を表示' }).click();
await shot('confirmation-revealed', { fullPage: true });

// 9. Submit, and confirm the answers were persisted.
await page.getByRole('button', { name: 'この内容で提出する' }).click();
await page.getByText('資料は提出済みです。').waitFor({ timeout: 30_000 });
await shot('employee-submitted');

// 10. HR reviews and confirms the submission.
await page.getByLabel('表示ユーザー').selectOption('hr');
await page.getByRole('heading', { level: 1, name: '入社手続き' }).waitFor();
await rowFor(EMPLOYEE_EMAIL).getByRole('button', { name: /を開く$/ }).click();
await page.getByRole('button', { name: '確認を完了する' }).waitFor();
// The review controls sit below the read-only answers.
await page.getByRole('heading', { name: '提出内容の確認' }).scrollIntoViewIfNeeded();
await shot('hr-review');
await page.getByRole('button', { name: '確認を完了する' }).click();
await page.getByText('入社手続きが完了しました。').waitFor({ timeout: 30_000 });

// 11. The audit trail.
await page.getByRole('button', { name: '手続きの履歴' }).click();
await page.locator('.activity-list li').first().waitFor();
await shot('task-history');

await browser.close();
console.log(`Done. ${index} screenshots written to ${outDir}`);
