# Verification record

Verified locally on 2026-09-11, after removing the Amplify/Cognito/AppSync/Lambda/DynamoDB/SES backend and adding the local Node service and the Agent. No cloud resources were created and no real email was sent. A live model endpoint was exercised; see below.

## Automated checks

- `npm run check` passed: ESLint, frontend TypeScript (`tsconfig.app.json`), server TypeScript (`tsconfig.server.json`), 37 Vitest tests across 7 files, and the production Vite build.
- Production bundle: 202 kB minified (63 kB gzip) JavaScript and 30 kB (7 kB gzip) CSS in a single entry, because the cloud authentication bundle was removed. There is no size advisory.

Coverage by area:

- Domain: enabled/unknown field validation, prototype-shaped keys, bank identifier formats with leading zeroes, impossible dates, roles and ownership, immutable template snapshots, duplicate recipients, stale writes, idempotent repeat submission, return/correct/resubmit, reminder version safety and the idle/cap policy.
- Store: seed-once behaviour, actor-scoped reads, invitation notification and mailbox records, `SIMULATED` delivery, transport failure to `FAILED` and recovery on resend, automatic reminder run with cap, per-actor read marking.
- Agent: offline parsing of recipients (honorific, bracketed and inter-address forms), sections, deadlines and intents; the create-then-invite multi-step plan; asking for missing addresses; surfacing tool failures; the runtime loop, error pass-through and the step limit; tool argument validation, template creation, invitation and reminders carrying an HR message.
- HTTP: health and provider mode, HR and employee workspace scoping, 403 when an employee calls the assistant, an end-to-end agent request that creates and invites, transcript round-tripping on a follow-up turn, repeated reminder runs, and 400/404 handling for malformed input and unknown routes.
- UI: the HR dashboard with the assistant entry point, the full journey (template builder → invitation → employee draft save/resume → submit → HR confirm with leading-zero preservation and account-number masking), the assistant panel driving a workflow that then appears in the notification centre, and required-field focus that blocks an incomplete submission.

## Live model check

`AGENT_API_KEY` was configured in the git-ignored `.env` and the OpenAI-compatible provider was exercised against `https://api.deepseek.com/v1`. The account offers `deepseek-flash` and `deepseek-v4-pro`; `AGENT_MODEL=deepseek-flash` was used because `deepseek-chat` is not available on that endpoint.

- `GET /api/agent/status` → `{"provider":"openai-compatible","model":"deepseek-flash","simulated":false}`.
- `本人情報と給与振込口座の入社手続きフォームを作成して、田中 葵 tanaka@example.com と 小林 海 kobayashi@example.com に送ってください。期限は 2026-12-31 です。` → tool calls `['create_template','invite_employees']`. One template and two `SIMULATED` tasks were stored, and the reply reported the form name, both recipients and zero reminders.
- Follow-up `進捗を教えてください。` sent with the exact transcript the API had returned → `['get_workspace_overview','list_pending_tasks']` and an accurate per-status summary. This confirms the assistant tool-call history round-trips over HTTP.
- `未提出の従業員にリマインドを送ってください。` → `['list_pending_tasks','send_reminders']`; four open tasks were reminded, each recorded once as a `REMINDER` notification and mailbox entry, and the reply noted that the same two employees appear on more than one open form.
- `通勤情報だけの入社手続きフォームを作ってください。` → a single `create_template` call, then a request for the missing names and addresses rather than invented ones.
- `田中 葵 さんの口座番号と銀行コードを教えてください。` → no tool calls; the model refused and correctly stated that no tool exposes submitted answers.
- `期限を 2026-02-30 にして、入社手続きフォームを作成し、test@example.com に送ってください。` → no tool calls; the model rejected the impossible date and asked for a valid deadline and the missing recipient name.

Workspace state after the live run: three templates, four tasks, eight notifications (four `INVITED`, four `REMINDER`) and eight mailbox records, with employee reads still limited to that employee's two tasks and no templates.

## Browser walkthrough

The built app (`npm run build && npm start`) was driven through a real Chrome by `scripts/walkthrough.mjs` (`npm run walkthrough`) with Japanese input at every step, a real OpenAI-compatible model (`AGENT_MODEL=deepseek-flash`) behind the assistant, and a fresh `STATE_FILE` reset to the seed at the start. Thirteen screenshots were captured, reviewed by eye, and annotated in the README.

Covered: the HR dashboard with seed data; a Japanese assistant request that produced `create_template` + `invite_employees`; the notification centre; the task list; the recorded simulated message; the employee form filled with 19 synthetic Japanese values; the same form at 390 × 844; the confirmation with `••••345` masking and the explicit reveal; submission; HR review; and the task history.

Observed and correct: the account number kept its leading zeroes as a string, the model-driven workflow appeared in the UI without a manual refresh, switching to the employee exposed only that employee's task, and every simulated message carried the "not actually sent" statement.

## Defects found and fixed during verification

1. The live follow-up turn first failed with HTTP 400. The assistant endpoint returned the server-side system prompt inside its `transcript`, so a client that sent the transcript back was rejected as containing an invalid message role. `server/app.ts` now strips the system message from the response, and `server/app.test.ts` asserts that the returned transcript contains no system message and that resending it succeeds. The provider error message was also made actionable (it now names the base URL and model and points at `GET /models`).
2. The browser walkthrough exposed a UI defect that the test suite had missed: `tool` messages were rendered as assistant chat bubbles, so raw tool JSON (task ids and delivery states) appeared in the conversation. `src/components/agent/AgentPanel.tsx` now keeps tool messages in the transcript — the provider needs the full pairing on the next turn — but renders only user and assistant bubbles, with tool activity shown as action chips. `src/App.test.tsx` asserts that the raw payload is absent from the document.

Both defects were found by exercising the running system rather than by the unit tests, which is why the walkthrough and the live-model check are part of this record.

## Local server checks (offline provider)

Started `tsx server/index.ts` on `127.0.0.1:8791` with an isolated `STATE_FILE` and drove it with `curl`:

- `GET /api/health` → `{"ok":true,"provider":"mock","simulated":true}`.
- `GET /api/workspace?role=hr` → the seed template and two synthetic employees.
- `POST /api/agent/chat` with the Japanese invite instruction → reply naming the created form and both recipients, actions `['create_template', 'invite_employees']`, one new template and two new tasks with `delivery: SIMULATED`.
- `POST /api/reminders/run` → four task ids reminded (two seeded and two new), each recorded once; a second run in the test suite returns none.
- `GET /api/workspace?role=employee&email=tanaka@example.com` → that employee's tasks only, no templates, and only their own mailbox records.

## Not verified

- **The walkthrough is one happy path, in Chrome only.** It does not cover Safari or Firefox, screen readers, keyboard-only navigation, browser zoom and reflow, slow or failed network conditions, or error recovery. No automated accessibility tool was run. Exploratory and adversarial coverage is limited to the scripted steps plus the live-model probes (privacy question, impossible date, missing recipients).
- **The live check used one provider, one model and scripted prompts.** Model choice is not deterministic, so no assertion depends on the live model; provider reliability, rate limits, timeouts, retries and cost were not measured, and no second provider was tried.
- **The scheduler's wall-clock tick was not observed.** The pure policy, the manual API run and the HTTP route were exercised; the `setInterval` firing on its own was not.
- No accessibility audit, load test or persistence-corruption drill was performed beyond the JSON shape check that falls back to the seed.
- `npm install` reported that the `esbuild` and `fsevents` install scripts were skipped by the local npm allow-scripts policy. The Vite build and Vitest run succeeded with the binaries already present; a clean install elsewhere may need `npm approve-scripts`.
- No remote push, pull request or deployment was performed.

## Limits

Single JSON document, in-memory scans, one process, no authentication, loopback binding only. Notification and mailbox records are simulated by construction; real mail transport is out of scope now that the cloud backend has been removed.
