// Starts the local API server and the Vite dev server together for `npm run dev`.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'dev:server'], { stdio: 'inherit' }),
  spawn(npm, ['run', 'dev:web'], { stdio: 'inherit' }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

for (const child of children) {
  child.on('exit', (code) => { if (!stopping && code !== 0) stop(code ?? 1); });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
