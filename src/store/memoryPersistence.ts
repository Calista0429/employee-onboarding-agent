import type { StorePersistence, StoreState } from './types';

/** In-process persistence used by tests and by the in-memory API. Values are cloned so callers cannot alias stored state. */
export function createMemoryPersistence(initial: StoreState | null = null): StorePersistence {
  let state = initial;
  return {
    read: async () => (state ? structuredClone(state) : null),
    write: async (next) => { state = structuredClone(next); },
  };
}
