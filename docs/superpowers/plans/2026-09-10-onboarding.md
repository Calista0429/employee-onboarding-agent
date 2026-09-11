# Onboarding Workflow Implementation Plan

> **Historical record.** This plan delivered an Amplify/Cognito/SES backend that was later removed. The current architecture is the local Node service plus Agent described in [design](../../design.md) and [agent](../../agent.md). This file is kept for history only.

> For agentic workers: Use superpowers:subagent-driven-development for the backend task and independent review; the controller owns frontend integration.

**Goal:** Deliver HR-configured onboarding collection with individual email invitations, persisted employee answers and review history.
**Architecture:** Shared domain contract drives local simulation and cloud validation. Cognito/AppSync/Lambda/DynamoDB implement authorization and storage; SES delivers task links. React composes adapted MIT-licensed MF primitives.
**Tech Stack:** React 18, TypeScript, Amplify Gen 2, AWS SDK v3, Vitest.
**Spec:** docs/superpowers/specs/2026-09-10-onboarding-design.md

## Global constraints
English README/comments; synthetic demo data; server-side cloud authorization; no AWS deployment or real email during implementation. Work in the existing dedicated repository on codex/onboarding-workflow to preserve the user's live preview and requested folder.

## Task 1: Domain, persistence and AWS backend
Owner: backend implementer. Files: src/domain/onboarding.ts and tests, src/data/{api,demo,cloud}.ts; amplify/ backend/auth/data/workflow; scripts/verify-backend.mjs; docs/deployment.md. Consume the exact shared contract in the spec. Produce WorkspaceApi for the UI. Replace obsolete address domain and backend tests only after new tests cover current behavior. Write failing focused tests, implement validated transitions, conditional database writes, verified identity checks and retryable email delivery. Use SDK Cognito creation for first-login email and SES for invite links. Run focused tests, backend typecheck and offline synthesis. No commits while controller changes shared files; provide a report.

## Task 2: React workflow and MF components
Owner: controller. Files: src/App.tsx, src/CloudApp.tsx, src/components/onboarding/*, src/components/mf/*, src/styles.css, src/App.test.tsx, THIRD_PARTY_NOTICES.md. Consume WorkspaceApi and domain definitions from Task 1. Vendor and adapt TextField, Block and related suitable primitives with exact upstream commit and MIT license. Builder selects modules/required fields and previews the employee form. Invitations are a distinct review step. Employee form saves drafts and previews before submit. HR table displays delivery and task statuses and opens answers/history for review. Use local demo to show recipient-specific invitation preview; no fake delivery claims. First add a failing UI smoke test, then implement, expand through the full journey and exercise validation/accessibility.

## Task 3: Integration and review
Owner: controller with independent reviewer. Update README/design/verification and obsolete instructions. Run npm run check and npm run verify:backend, inspect desktop/mobile in the browser, and fix material issues. Review cloud authorization, version checks, bank validation and email retries. Document actual verification and cloud gaps. Commit a clean local feature branch; no cloud deployment or remote push.

## Execution record

- [x] Domain, local/cloud APIs, transactional storage and mail adapters implemented. The controller completed the backend after the implementer's tool usage interruption.
- [x] MF primitives adapted with MIT attribution; HR, invitation, employee and review screens implemented.
- [x] Automated checks and desktop/mobile browser journey passed. Independent review findings were reproduced and fixed.
- [x] Documentation updated; AWS remains undeployed and live mail acceptance remains an explicit deployment check.

Ruling: preserve the existing repository location and a new feature branch rather than create another checkout, because the user requested work in this folder and has an active local preview.
Ruling: deadlines are informational in this version; submission persists immediately, including late submissions. No Scheduler or address effective-date worker remains.
Ruling: runtime-only network dependency audit remains unperformed after automatic approval rejection. This does not alter the completed functional verification.
