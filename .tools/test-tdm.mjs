// Bots-only team deathmatch, simulated to completion (score limit or time limit).
//   node .tools/test-tdm.mjs [size=6] [difficulty=regular]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const size = process.argv[2] ?? '6', diff = process.argv[3] ?? 'regular', port = 5196;
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const errors = [];fs.mkdirSync('artifacts/tdm', { recursive: true });
try {
  await new Promise(r => setTimeout(r, 800));
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/mp.html?bots=only&size=${size}&diff=${diff}`);
  await page.waitForFunction(() => globalThis.game?.debug.getState().started, null, { timeout: 120000 });
  const t0 = Date.now(); let st, shot = 0;
  for (let i = 0; i < 400; i++) {
    st = await page.evaluate(() => { game.debug.step(5); const s = game.debug.getState(); return { time: s.time, score: s.score, ended: s.ended, alive: s.soldiers.filter(x => x.alive).length, fighting: s.soldiers.filter(x => x.target).length }; });
    if (i % 12 === 0) { console.log(`t=${st.time.toFixed(0)}s score ${st.score.join('-')} alive ${st.alive} engaging ${st.fighting}`); await page.waitForTimeout(100); await page.screenshot({ path: `artifacts/tdm/frame${shot++}.png` }); }
    if (st.ended) break;
  }
  const s = await page.evaluate(() => game.debug.getState());
  await page.screenshot({ path: 'artifacts/tdm/end.png' });
  const top = s.soldiers.sort((a, b) => b.kills - a.kills).slice(0, 3).map(x => `${x.name}(${['Dawn', 'Dusk'][x.team]}) ${x.kills}/${x.deaths}`).join(', ');
  console.log(JSON.stringify({ ended: s.ended, score: s.score, matchSeconds: Math.round(s.time), wallSeconds: (Date.now() - t0) / 1000, top, errors: errors.length }));
  assert.ok(s.ended, 'match ended'); assert.ok(Math.max(...s.score) >= 20, 'bots actually fight'); assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS tdm');
} catch (e) { console.error('FAIL', e.message, errors.slice(0, 5)); process.exitCode = 1; }
finally { await browser.close(); server.kill(); }
