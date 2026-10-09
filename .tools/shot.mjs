// Headless boot + screenshots: node .tools/shot.mjs <outdir> [port] [script.json]
// script.json: [{"name":"lobby","pos":[x,y,z],"look":[x,y,z],"step":1,"eval":"js"}]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const out = path.resolve(process.argv[2] ?? 'artifacts/shots'), port = +(process.argv[3] ?? 5199);
const script = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : [{ name: 'spawn', step: 1 }];
fs.mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], failed = [];
try {
  await new Promise(r => setTimeout(r, 800));
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => globalThis.game?.debug.getState().ready || document.getElementById('load-label')?.textContent.startsWith('Unable'), null, { timeout: 120000 });
  const boot = (Date.now() - t0) / 1000;
  await page.screenshot({ path: path.join(out, 'menu.png') });
  await page.evaluate(() => { game.debug.setActive(true); game.debug.setInvulnerable(true); });
  for (const s of script) {
    if (s.pos) await page.evaluate(p => game.debug.teleportPlayer(p), s.pos);
    if (s.eval) await page.evaluate(s.eval);
    if (s.step) await page.evaluate(n => game.debug.step(n), s.step);
    if (s.look) await page.evaluate(p => game.debug.lookAt(p), s.look);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.waitForTimeout(s.wait ?? 300);
    await page.screenshot({ path: path.join(out, s.name + '.png') });
  }
  const st = await page.evaluate(() => { const s = game.debug.getState(); return { round: s.round, phase: s.phase, enemies: s.enemies.length, fps: s.performance.fps, calls: s.performance.calls, tris: s.performance.triangles, weapon: s.weapon, errors: s.errors, assets: game.debug.assetLog().length }; });
  console.log(JSON.stringify({ boot, ...st }));
} catch (e) { console.log('FAIL', e.message); }
finally {
  console.log('errors:', errors.slice(0, 15).join('\n  ')); console.log('failed requests:', failed.slice(0, 15).join('\n  '));
  await browser.close(); server.kill();
}
