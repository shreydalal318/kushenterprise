// Stop early, with a clear message, when the preview is already running or building
// (GitHub Codespaces starts one automatically in its own terminal when you open the codespace).
import { execSync } from 'node:child_process';
import { createConnection } from 'node:net';

const port = Number(process.env.PORT ?? 3000);
const running = (pattern) => {
  if (process.platform === 'win32') return false;
  try { return execSync(`pgrep -f "${pattern}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').filter((p) => p && Number(p) !== process.pid).length > 0; } catch { return false; }
};
const listening = await new Promise((done) => {
  const s = createConnection({ port, host: '127.0.0.1' });
  s.once('connect', () => { s.destroy(); done(true); });
  s.once('error', () => done(false));
  setTimeout(() => { s.destroy(); done(false); }, 1500);
});

if (listening) {
  console.log(`\nThe preview is already running on port ${port}. Open it from the Ports tab (port ${port}).\nTo restart it: stop it with Ctrl+C in its terminal (or run: pkill -f "next start"), then run pnpm preview again.\n`);
  process.exit(1);
}
if (running('[n]ext build')) { // [n] so the search can't match its own shell
  console.log('\nA build is already running in another terminal (Codespaces starts one automatically when you open it).\nWait for it to finish and show "Ready", then open port 3000 from the Ports tab.\nIf it is stuck: pkill -f "next build" and run pnpm preview again.\n');
  process.exit(1);
}
