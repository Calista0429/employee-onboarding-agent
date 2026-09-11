import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Minimal `.env` reader so the server needs no extra dependency and never overrides real environment values. */
export function loadEnvFiles(root: string, files = ['.env.local', '.env']): void {
  for (const name of files) {
    let content: string;
    try { content = readFileSync(resolve(root, name), 'utf8'); } catch { continue; }
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

export function numberFrom(value: string | undefined, fallback: number, minimum = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}
