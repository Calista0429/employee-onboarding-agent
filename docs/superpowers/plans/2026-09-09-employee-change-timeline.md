# Employee Change Timeline Implementation Plan

> **Historical record.** This is the original address-change prototype plan. It was replaced first by the onboarding workflow and then by the current local Node service plus Agent ([design](../../design.md), [agent](../../agent.md)). This file is kept for history only.

> **For agentic workers:** Use superpowers:subagent-driven-development for independent backend implementation and review. Track steps below.

**Goal:** Build a working employee address-change timeline demo and a deployable AWS Amplify backend.

**Architecture:** React has a local persistent demo and a Cognito-authenticated cloud adapter. Shared domain rules describe submission, review and due application. Amplify provides GraphQL, DynamoDB, Lambda and an hourly Scheduler.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, AWS Amplify Gen 2, AWS CDK, DynamoDB SDK.

**Spec:** docs/design.md

## Global Constraints

- All README files and source comments are English.
- Work only in /Users/huangbaoxi/Code/employee-change-timeline.
- Use synthetic data. Keep preview read-only. Cloud authorization is server-side.
- Preserve the approved scope: one address change, one HR approval, future effective dates.

## Task 1: Domain and local demo

Files: src/domain/workflow.ts, src/domain/workflow.test.ts, src/data/demo.ts.
Interfaces: Employee, ChangeRequest, Workspace; submitRequest(workspace, employeeId, newAddress, effectiveDate, now, id), reviewRequest(workspace, requestId, decision, reviewer, reason, now), applyDueChanges(workspace, now), tokyoDate(now).

- [x] Write tests for approval preserving the address, pending requests remaining unchanged after the effective date, approved changes applying once, duplicate pending submissions, rejected resubmission, invalid dates and read-only preview.
- [x] Run `npm test` and confirm missing behavior fails.
- [x] Implement immutable transitions and input checks.
- [x] Run tests and confirm transitions pass.

## Task 2: AWS backend

Files: amplify/auth/resource.ts, amplify/data/resource.ts, amplify/functions/**, amplify/backend.ts, amplify/tsconfig.json, docs/deployment.md.
Interfaces: GraphQL contract in docs/design.md; consume shared workflow types and validation where useful.

- [x] Define authenticated API operations and read-only model access or custom tables.
- [x] Test ownership, HR-only review, concurrency conditions, repeat-safe application and pagination.
- [x] Implement workflow Lambda, atomic DynamoDB transitions, hourly Scheduler and log retention.
- [x] Validate backend TypeScript and inspect synthesized infrastructure if locally possible.
- [x] Document actual deployment and test-account provisioning steps; do not claim cloud verification without a deployment.

## Task 3: Frontend

Files: src/App.tsx, src/components/**, src/data/cloud.ts, src/main.tsx, src/styles.css.

- [x] Test the employee-to-HR approval journey and immutable date preview.
- [x] Implement sidebar, address form, review view, timeline, role switch in demo and explicit cloud login.
- [x] Preserve input on failures and disable duplicate in-flight actions.
- [x] Verify desktop and mobile views and complete an interactive browser journey.

## Task 4: Delivery

Files: README.md, .github/workflows/ci.yml, amplify.yml, docs/verification.md.

- [x] Add setup, architecture, AWS deployment, limitations and public reference attribution.
- [x] Run lint, frontend/backend type checks, all tests and production build.
- [x] Review authorization and state transitions; resolve actionable findings.
- [x] Commit the verified implementation and report exact local/cloud validation status.

## Execution record

- The user approved the project scope and requested implementation in ~/Code with English README files and code comments.
- The existing empty repository provides isolation on codex/initial-build; no additional worktree was needed.
- AWS backend implementation was delegated; backend review caught and corrected the actual Amplify Lambda payload shape before delivery.
- A separate final reviewer hit the service usage limit. The coordinator completed the frontend/integration review and real-browser checks directly.
- AWS deployment remains a separate environment step, documented in docs/deployment.md. No cloud deployment is claimed.
