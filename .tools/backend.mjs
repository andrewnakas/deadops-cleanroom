// Runs the Worker locally (workerd + a throwaway D1 file) for tests. No Cloudflare login is needed.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..'), worker = path.join(root, 'worker');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };

export async function startBackend(port, vars = {}) {
  const dir = path.join(root, 'artifacts', 'd1-' + port);
  fs.rmSync(dir, { recursive: true, force: true });
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'graveshift', '--local', '--persist-to', dir], { cwd: worker, env, stdio: 'pipe' });
  const all = { DEV: '1', MIN_MATCH_SECONDS: '0', REPORT_GRACE_SECONDS: '2', REPORTS_TO_MUTE: '2', ...vars };
  const child = spawn(process.execPath, [wrangler, 'dev', '--local', '--port', String(port), '--persist-to', dir, ...Object.entries(all).flatMap(([k, v]) => ['--var', `${k}:${v}`])], { cwd: worker, env, stdio: 'ignore', windowsHide: true });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try { await fetch(url + '/v1/rooms'); break; } catch { if (i > 150) throw new Error('local Worker did not start'); await new Promise(r => setTimeout(r, 200)); }
  }
  const stop = () => { try { process.platform === 'win32' ? execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) : child.kill(); } catch {} };
  return { url, stop };
}
