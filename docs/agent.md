# Agent design

The assistant lets HR create onboarding workflows, invite employees and chase non-submitters by writing a request in Japanese. It runs inside the local Node service and acts only through a fixed tool catalogue.

## Provider interface

`src/domain/agent.ts` defines the shared transcript contract:

- `AgentMessage` — `system`, `user`, `assistant` (with optional `toolCalls`) or `tool` (with `toolCallId`).
- `AgentToolSpec` — name, description and JSON-schema parameters.
- `AgentProvider.complete(messages, tools) → { content, toolCalls }`.

`server/agent/provider.ts` selects an implementation:

| Provider | Selected when | Behaviour |
| --- | --- | --- |
| `mock` | no `AGENT_API_KEY`, or `AGENT_PROVIDER=mock` | Deterministic rule engine. Offline, free, reproducible. |
| `openai` | `AGENT_API_KEY` is set | `POST {AGENT_BASE_URL}/chat/completions` with `tools` and `tool_choice: auto`. |

The OpenAI-compatible provider is transport only: it maps the transcript to the wire format and normalises `tool_calls` back. It works with DeepSeek, OpenAI, a gateway or a local runtime by changing `AGENT_BASE_URL` / `AGENT_MODEL`. Model names differ per account, so check what the endpoint accepts before choosing one:

```sh
curl -s "$AGENT_BASE_URL/models" -H "Authorization: Bearer $AGENT_API_KEY"
```

The API never returns the server-side system prompt: `transcript` contains only the conversation and tool messages, so a client may send the previous transcript back unchanged on the next turn. A rejected model or endpoint produces an error naming the base URL, the model and the `/models` route.

## Runtime loop

`server/agent/runtime.ts` runs at most `maxSteps` (default 6) provider turns. Tool results are appended as `tool` messages and returned to the provider, so a model can chain steps — for example create a template, read its id, then invite. A tool that throws becomes `{ "error": "..." }` in the transcript instead of failing the request, which lets the model correct a bad argument.

## Tools

`server/agent/tools.ts` defines and executes the catalogue. Arguments are validated before use: required strings, length limits, module ids from the fixed list, `YYYY-MM-DD` deadlines, 1–20 recipients, and a 1 MB-free default deadline of two weeks. Invalid arguments throw, which the runtime returns to the model as data.

| Tool | Notes |
| --- | --- |
| `get_workspace_overview` | Templates plus a task summary (no answers, no account numbers) |
| `list_pending_tasks` | Statuses `NOT_STARTED`, `IN_PROGRESS`, `RETURNED` |
| `create_template` | New id, title, description, deadline, modules; required fields default to the selected sections minus the commute route |
| `invite_employees` | Runs the normal `INVITE` transition, so duplicate recipients and template immutability still apply |
| `send_reminders` | Reminds the given tasks, or every open task; optional HR message is stored in the notification and mail body |

Tools execute as the single local HR identity (`HR_ACTOR`). The HTTP layer rejects `/api/agent/chat` for any non-HR actor, and the assistant page is hidden from employees.

## Offline provider behaviour

`server/agent/mock.ts` classifies a request as invite, remind, status or unknown, then emits the next missing tool call by inspecting the transcript. It extracts:

- **Recipients** from email addresses, reading the name from the text between two addresses (`田中 葵 tanaka@example.com と 小林 海 kobayashi@example.com`), from an honorific (`田中さん(tanaka@example.com)`) or from a bracketed name. Without a usable name it uses the local part of the address.
- **Sections** from keywords (`本人`/`個人`/`personal`, `口座`/`銀行`/`給与`/`bank`, `通勤`/`交通`/`commute`); all sections when no keyword matches.
- **Deadlines** from `YYYY-MM-DD`, `M月D日`, `来月末`, `今月末`, `来週`, defaulting to two weeks.
- **Titles** from a quoted phrase, otherwise from the recognised sections.

Known limits, by design: it does not understand negation, follow-up corrections, arbitrary phrasing or languages beyond Japanese/English keywords; it will ask for addresses rather than guess them; and it never invents recipients. Use a real provider for open-ended conversation.

## Reminder policy

`dueForReminder(task, now, policy)` in `src/domain/onboarding.ts` returns true when a task is `NOT_STARTED`, `IN_PROGRESS` or `RETURNED`, has fewer than `maxReminders` automatic reminders, and has been idle for `idleHours` (or its deadline has passed). Because the last reminder counts as activity, the idle window also spaces reminders out. The scheduler skips overlapping ticks. Explicit `send_reminders` calls from the Agent or the **リマインドを実行** button bypass the idle window but not the domain transition rules.

## Cost and safety

A real provider sends the system prompt, the HR request and tool results over the network; no employee answers or bank details are included in any tool result. Nothing is sent when the offline provider is active, which is the default.
