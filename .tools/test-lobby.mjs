// Pre-game lobby: a host opens a room, a second page joins, switches team, readies up, and the host starts.
// Checks the roster replicates, the countdown starts the match, and the joiner lands on the team they chose.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const port = 5193, room = 'L' + Math.random().toString(36).slice(2, 7).toUpperCase();
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errors = []; const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); assert.ok(ok, name); };
try {
  await new Promise(r => setTimeout(r, 800));
  const mk = async url => { const p = await (await browser.newContext({ viewport: { width: 960, height: 720 } })).newPage(); p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); await p.goto(url); return p; };
  const lobby = p => p.evaluate(() => game.debug.lobby());
  const host = await mk(`http://127.0.0.1:${port}/mp.html?host=${room}&size=3&diff=recruit`);
  await host.waitForFunction(() => globalThis.game?.debug.net().status.startsWith('hosting'), null, { timeout: 60000 });
  check('host waits in the lobby', await host.evaluate(() => !game.debug.getState().started && !document.getElementById('lobby').hidden));
  const client = await mk(`http://127.0.0.1:${port}/mp.html?join=${room}`);
  await client.waitForFunction(() => globalThis.game?.debug.lobby()?.players.length === 2, null, { timeout: 60000 });
  const c0 = await lobby(client);
  check('joiner sees both players', c0.you === 1 && c0.players[0].host && !c0.players[1].ready, JSON.stringify(c0.players));
  check('joiner is balanced onto the other team', c0.players[1].team !== c0.players[0].team);
  await client.click('#lobby button[data-act=team]');
  await host.waitForFunction(t => game.debug.lobby().players[1].team === t, c0.players[0].team, { timeout: 10000 });
  await client.click('#lobby button[data-act=team]');
  await host.waitForFunction(t => game.debug.lobby().players[1].team === t, c0.players[1].team, { timeout: 10000 });
  check('team switch reaches the host', true);
  await client.click('#start');
  await host.waitForFunction(() => game.debug.lobby().players[1].ready, null, { timeout: 10000 });
  check('ready-up reaches the host', (await host.textContent('#start')).includes('2/2'));
  await host.click('#start');
  await client.waitForFunction(() => game.debug.lobby()?.count > 0, null, { timeout: 5000 });
  check('countdown reaches the joiner', true);
  await client.waitForFunction(() => { const s = game.debug.getState(); return s.started && s.soldiers.some(x => x.human && x.alive); }, null, { timeout: 20000 });
  const h = await host.evaluate(() => ({ started: game.debug.getState().started, remote: game.debug.soldiers.filter(s => s.remote).map(s => s.team), n: game.debug.soldiers.length, lobbyHidden: document.getElementById('lobby').hidden }));
  const me = await client.evaluate(() => game.debug.getState().soldiers.find(s => s.human));
  check('match starts for both', h.started && h.lobbyHidden && h.n === 6);
  check('joiner plays on the chosen team', h.remote.length === 1 && h.remote[0] === c0.players[1].team && me.team === c0.players[1].team, JSON.stringify({ host: h.remote, me: me.team }));
  // a second room: the host removes a joiner from the lobby
  await client.close(); await host.close();
  const room2 = room + 'K';
  const host2 = await mk(`http://127.0.0.1:${port}/mp.html?host=${room2}&size=2`);
  await host2.waitForFunction(() => globalThis.game?.debug.net().status.startsWith('hosting'), null, { timeout: 60000 });
  const client2 = await mk(`http://127.0.0.1:${port}/mp.html?join=${room2}`);
  await host2.waitForFunction(() => game.debug.lobby()?.players.length === 2, null, { timeout: 60000 });
  await host2.click('#lobby button[data-kick]');
  await client2.waitForFunction(() => document.getElementById('menu-status').textContent.includes('removed'), null, { timeout: 10000 });
  check('host can remove a player', (await lobby(host2)).players.length === 1);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('PASS lobby');
} catch (e) { console.error('FAIL', e.message, errors.slice(0, 5)); process.exitCode = 1; }
finally { await browser.close(); server.kill(); }
