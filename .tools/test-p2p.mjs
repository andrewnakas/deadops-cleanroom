// Online play: one page hosts a room, a second joins over WebRTC (PeerJS cloud signalling; needs internet).
// Checks the join takes over a bot, the host sees the client's movement, and the client's shots hurt through the host.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const port = 5194, room = 'T' + Math.random().toString(36).slice(2, 7).toUpperCase();
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errors = []; const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); assert.ok(ok, name); };
try {
  await new Promise(r => setTimeout(r, 800));
  const mk = async url => { const p = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage(); p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); await p.goto(url); return p; };
  const host = await mk(`http://127.0.0.1:${port}/mp.html?host=${room}&size=3&diff=recruit`);
  await host.waitForFunction(() => globalThis.game?.debug.net().status.startsWith('hosting'), null, { timeout: 60000 });
  await host.evaluate(() => { game.debug.start(); document.getElementById('menu').hidden = true; });
  const client = await mk(`http://127.0.0.1:${port}/mp.html?join=${room}`);
  await client.waitForFunction(() => { const s = globalThis.game?.debug.getState(); return s?.started && s.soldiers.some(x => x.human && x.alive); }, null, { timeout: 60000 });
  await client.evaluate(() => { game.debug.setActive(true); document.getElementById('menu').hidden = true; });
  const h1 = await host.evaluate(() => ({ net: game.debug.net(), remote: game.debug.soldiers.filter(s => s.remote).map(s => ({ id: s.id, name: s.name, team: s.team })) }));
  const c1 = await client.evaluate(() => ({ net: game.debug.net(), n: game.debug.soldiers.length, me: game.debug.getState().soldiers.find(s => s.human) }));
  check('client took over a bot slot', h1.remote.length === 1 && c1.net.myId === h1.remote[0].id, JSON.stringify(h1.remote));
  check('client sees every soldier', c1.n === 6);
  await client.waitForTimeout(1500);
  const cpos = (await client.evaluate(() => game.debug.getState().soldiers.find(s => s.human).pos));
  const hpos = await host.evaluate(() => game.debug.soldiers.find(s => s.remote).pos.toArray());
  check('host tracks the client position', Math.hypot(cpos[0] - hpos[0], cpos[2] - hpos[2]) < 40, `${cpos.map(Math.round)} vs ${hpos.map(Math.round)}`);
  // the client aims at the nearest living enemy and keeps firing; the host decides the damage
  let hits = 0, kills = 0;
  for (let i = 0; i < 120 && (kills === 0 || i < 25); i++) {
    await client.evaluate(() => { const d = game.debug, me = d.soldiers.find(s => s.human), foes = d.soldiers.filter(s => s.team !== me.team && s.alive);
      if (!foes.length || !me.alive) return; const eye = d.camera.position, f = foes.sort((a, b) => a.pos.distanceTo(eye) - b.pos.distanceTo(eye))[0]; d.camera.lookAt(f.pos.x, f.pos.y + 40, f.pos.z); d.fire(); });
    await client.waitForTimeout(150);
    const r = await host.evaluate(() => { const s = game.debug.soldiers.find(x => x.remote); return { kills: s.kills, lastFire: s.lastFire, time: game.debug.getState().time }; });
    if (r.time - r.lastFire < 1) hits++; kills = r.kills;
  }
  check('host receives the client shots', hits > 3, `${hits} polls with recent fire`);
  const ck = await client.evaluate(() => game.debug.getState());
  console.log(JSON.stringify({ hostKillsForClient: kills, clientView: { score: ck.score, me: ck.soldiers.find(s => s.human) } }));
  check('scores replicate to the client', ck.score[0] + ck.score[1] > 0);
  await client.close(); await host.waitForTimeout(8000);
  const h2 = await host.evaluate(() => game.debug.soldiers.filter(s => s.remote).length);
  check('slot returns to a bot when the client leaves', h2 === 0);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('PASS p2p');
} catch (e) { console.error('FAIL', e.message, errors.slice(0, 5)); process.exitCode = 1; }
finally { await browser.close(); server.kill(); }
