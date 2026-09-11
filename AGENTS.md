# Project Instructions

- Write every README and source-code comment in English.
- Use synthetic employee and bank-account data only.
- Preserve immutable invitation templates, employee ownership and version-checked submissions.
- Route every state change — including Agent tool calls — through the shared domain rules in `src/domain/`; the Agent must never bypass validation.
- Keep the local service bound to loopback. Local mode has no authentication: never expose it publicly, and never add cloud credentials or real email sending.
- Label notifications and mailbox records as simulated wherever they appear in the UI.
- Run `npm run check` after code changes.
- Keep the demo small; explain material tradeoffs in the documentation.
