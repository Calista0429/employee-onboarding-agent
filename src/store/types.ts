import type { MailMessage, Notification, ReminderPolicy, Workspace } from '../domain/onboarding';

/** Persisted state of the local workspace. `workspace` holds the transition state, the rest are derived channels. */
export type StoreState = { workspace: Workspace; notifications: Notification[]; outbox: MailMessage[] };
export type StorePersistence = { read(): Promise<StoreState | null>; write(state: StoreState): Promise<void> };
/**
 * Delivery seam. The shipped transport records simulated mail only; tests inject a failing transport to
 * exercise the FAILED/retry path, and a future real transport could be attached here.
 */
export type MailPort = { deliver(message: MailMessage): Promise<void> };
export type StoreDependencies = {
  persistence: StorePersistence;
  mail: MailPort;
  appUrl: string;
  reminder: ReminderPolicy;
  now(): string;
  id(): string;
};
