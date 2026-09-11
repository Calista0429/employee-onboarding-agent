# Employee onboarding design

Local-only design: a React app, a small Node service and a pluggable tool-calling Agent. The earlier Amplify/Cognito/SES deployment was removed; see [the Agent notes](agent.md) for the automation details and [the verification record](verification.md) for what has been checked.

## Experience

HR configures personal, bank-account and commuting sections, previews the form and invites named employees. Employees save drafts, review answers and submit. Submission immediately persists data and locks editing until HR returns it. HR confirms or returns with a reason. Append-only task history records each step. HR can reach every one of these steps either through the UI or by asking the assistant in Japanese.

## Automation

`server/agent/` implements a provider-independent tool-calling loop. A provider proposes tool calls, the runtime executes them against the workspace store and feeds results back until the provider answers without tools. Providers: a deterministic offline rule engine (default) and any OpenAI-compatible `/chat/completions` endpoint. Tools: overview, pending list, create template, invite employees, send reminders.

Automation is completed by two deterministic mechanisms rather than by the model:

- Invitations, reminders and correction requests always produce an in-app notification plus a simulated mailbox record, composed by `src/store/messages.ts`.
- A scheduler tick evaluates the reminder policy in `src/domain/onboarding.ts` and reminds idle or overdue open tasks, capped per task.

## Visual direction

An original Effective identity with reference-inspired HR form layout. Navy-gray `#32373f` navigation, `#eff1f4` workspace, white form sections, blue `#2166bd` actions, `#333b46` body text and red required labels. Japanese system sans-serif typography, left-aligned labels, two-column related fields on desktop and single-column fields on mobile. Section links help navigate long forms. HR uses a compact progress table; employees see only their own tasks. The assistant is a chat column with an example list; notifications use the same block primitives. Input, block and status primitives derive from MIT-licensed Money Forward public components with attribution.

## Boundaries

The shared domain validates allowed fields, types, bank formatting and legal transitions. The store adds role scoping, notification records, simulated delivery and reminder policy, and serializes read-modify-write cycles so concurrent requests cannot lose an action. State is a single JSON document; reads are in-memory scans. There is no authentication, database, queue or real mail transport, and the service binds to loopback only.
