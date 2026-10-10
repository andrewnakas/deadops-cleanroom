// Final killcam and after-action report: the kill that ends a solo match is replayed from the killer's eye, then
// the end screen shows score, assists and the report.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const port = 5183;
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const errors = []; const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); assert.ok(ok, name); };
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  const p = await (await browser.newContext({ viewport: { width: 960, height: 720 } })).newPage(); p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`http://127.0.0.1:${port}/mp.html?size=2&diff=recruit`);
  await p.waitForFunction(() => globalThis.game?.debug.getState().ready, null, { timeout: 90000 });
  await p.evaluate(() => game.debug.start());
  await new Promise(r => setTimeout(r, 2500));
  const info = await p.evaluate(() => { const s = game.debug.soldiers, me = s.find(x => x.human), foe = s.find(x => x.team !== me.team), mate = s.find(x => x.team === me.team && !x.human); foe.safeUntil = 0; game.debug.hit(mate.id, foe.id, 10); game.debug.setScore(me.team, 74); game.debug.hit(me.id, foe.id, 999); return { me: me.id, foe: foe.name, mate: mate.id }; });
  const cam = await p.evaluate(() => ({ k: game.debug.killcam(), shown: !document.getElementById('killcam').hidden, ended: game.debug.getState().ended }));
  check('the winning kill starts the killcam before the end screen', cam.k?.victim === info.foe && cam.shown && !cam.ended, JSON.stringify(cam.k));
  await new Promise(r => setTimeout(r, 800));
  const moved = await p.evaluate(() => game.debug.killcam()?.camera);
  check('the replay camera is running', Array.isArray(moved));
  await p.waitForFunction(() => game.debug.getState().ended, null, { timeout: 15000 });
  const end = await p.evaluate(() => ({ cam: document.getElementById('killcam').hidden, end: !document.getElementById('end').hidden, report: document.getElementById('end-report').textContent, board: document.getElementById('scoreboard-body').textContent, s: game.debug.soldiers.map(x => [x.score, x.assists]) }));
  check('the end screen follows with the after-action report', end.cam && end.end && /BEST PLAYER/.test(end.report) && /YOU · 100 score · 1 kills/.test(end.report) && /NEXT CHALLENGE/.test(end.report), end.report);
  check('the kill pays 100 score and the helper gets an assist', end.s[info.me][0] === 100 && end.s[info.mate][1] === 1 && end.s[info.mate][0] === 50 && /SCORE/.test(end.board), JSON.stringify(end.s));
  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  console.log('KILLCAM OK');
} finally { await browser.close(); server.kill(); }
