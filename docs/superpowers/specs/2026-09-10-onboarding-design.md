# Employee onboarding workflow

> **Historical record.** The cloud contract in this specification (Cognito, AppSync, Lambda, DynamoDB, SES) was removed. See [design](../../design.md) and [agent](../../agent.md) for the current architecture. This file is kept for history only.

## Approved scope
Replace the address-change demonstration with HR-created onboarding forms. HR chooses personal, bank-account and commute modules, configures required fields, previews the form and invites up to 20 named email recipients per batch. Each employee receives an immutable template snapshot and their own task. Employees authenticate, save drafts, review answers and submit. Submission immediately persists data. HR can confirm or return with a reason. An append-only task history explains the journey. Remove address effective dates, Scheduler, due worker and its failure queue/alarm.

## UI
Japanese employee-facing copy follows the supplied reference: dark navigation, pale gray workspace, narrow white form sections, required/optional badges, blue action buttons. HR has a task table, template builder, employee preview and invite screen. Local demo clearly labels simulated emails and synthetic data and lets a visitor switch between HR and an invited employee. Cloud does not allow role switching. Bank codes and account numbers are strings. Summary masks account numbers with an explicit reveal control. Preserve MF MIT attribution for locally adapted components; do not import the entire archived React 17 package.

## Shared contract
`src/domain/onboarding.ts` exports types below, `MODULES`, `FIELDS`, and `validateAnswers(template, answers, complete): Record<string,string>`.

ModuleId = 'personal' | 'bank' | 'commute'. Field definitions: {id,label,module,type?: 'text'|'email'|'date'|'number'|'select',options?:string[],hint?:string}. Answers = Record<string,string>.
Template = {id,title,description,dueDate,modules:ModuleId[],requiredFields:string[],createdAt}.
Task = {id,employeeName,email,template:Template,status:'NOT_STARTED'|'IN_PROGRESS'|'SUBMITTED'|'CONFIRMED'|'RETURNED',answers:Answers,version:number,delivery:'DEMO'|'PENDING'|'SENT'|'FAILED',deliveryError?:string,history:{id,type:string,at:string,note?:string}[]}.
Workspace = {templates:Template[],tasks:Task[]}.
Actor = {role:'hr'|'employee',email:string}.
Action is a discriminated union with `type`:
- CREATE_TEMPLATE: {template: Omit<Template,'createdAt'>}
- INVITE: {templateId:string,recipients:{name:string,email:string}[]}
- SAVE_DRAFT or SUBMIT: {taskId:string,answers:Answers,version:number}
- REVIEW: {taskId:string,decision:'CONFIRM'|'RETURN',reason:string,version:number}
- RESEND: {taskId:string}
WorkspaceApi = {load():Promise<Workspace>; act(action:Action):Promise<Workspace>}.

Field IDs: personal: lastName,firstName,lastNameKana,firstNameKana,birthDate,address,contactEmail; bank: bankName,bankCode,branchName,branchCode,accountType,accountNumber,accountHolder; commute: commuteMethod,commuteFrom,commuteTo,commuteRoute,commuteCost. Bank code 4 digits, branch code 3 digits, account number 7 digits. Account type options 普通/当座; commute options 電車・バス/自転車/徒歩/自動車. Validate only enabled fields and reject unknown answers at the server. Required fields must belong to selected modules. Templates require valid dates and bounded text. Drafts allow missing fields; completed submissions enforce required fields. Preserve leading zeroes. Same-version repeated SUBMIT with identical answers must not duplicate history; stale distinct changes fail. A recipient cannot be invited twice to the same template.

## Cloud
Reuse Cognito, AppSync and Lambda; DynamoDB stores templates/tasks with conditional writes. AppSync operations `getOnboarding` and `manageOnboarding(action: AWSJSON!)` return AWSJSON Workspace. Lambda enforces HR actions and employee ownership using verified Cognito email; never trust client role/email. Provision employee accounts through Cognito admin API as needed; Cognito handles initial temporary-password email, SES sends the task link separately. SES config requires a verified sender and deployed HTTPS app URL. Do not send actual email or deploy during implementation. Record recoverable failed delivery and allow resend without duplicate tasks. A task ID in a URL never grants access. Query/scan pagination must be handled. Logs must not include bank answers or passwords. Retain tables with PITR. Document SES sandbox and live validation requirements.

## Verification
Meaningful unit tests cover validation, ownership, immutable snapshots, duplicate recipients, stale writes, submit persistence/idempotency and return/resubmit. UI tests exercise builder to invitation to employee draft/submit to HR confirm. Run npm run check and npm run verify:backend. Browser-test desktop/mobile. All README and code comments are English. Demo uses synthetic data only.
