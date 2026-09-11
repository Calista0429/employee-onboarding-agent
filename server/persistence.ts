import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StorePersistence, StoreState } from '../src/store/types';

function isState(value: unknown): value is StoreState {
  const candidate = value as StoreState | null;
  return Boolean(candidate) && typeof candidate === 'object'
    && Array.isArray(candidate?.workspace?.templates) && Array.isArray(candidate?.workspace?.tasks)
    && Array.isArray(candidate?.notifications) && Array.isArray(candidate?.outbox);
}

/** Single JSON document persistence. A corrupt or missing file falls back to the seed instead of failing the server. */
export function createFilePersistence(file: string): StorePersistence {
  return {
    read: async () => {
      try {
        const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
        return isState(parsed) ? parsed : null;
      } catch { return null; }
    },
    write: async (state) => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    },
  };
}
