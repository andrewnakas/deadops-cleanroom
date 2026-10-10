// Online services end to end: two browsers find each other through matchmaking on a local Worker, play a public
// match, both report it, and the room list, stats and friends panels show the result.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { startBackend } from './backend.mjs';
const port = 5189, back = await startBackend(5188), q = 'api=' + encodeURIComponent(back.url);
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errors = []; const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); assert.ok(ok, name); };
const api = async (who, method, p, body) => (await fetch(back.url + '/v1/' + p, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + who.token } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await sleep(200); } }
  const mk = async (url, name) => {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 720 } });
    await ctx.addInitScript(n => { if (!localStorage.getItem('graveshift.class')) localStorage.setItem('graveshift.class', JSON.stringify({ name: n, size: 2, difficulty: 'recruit' })); }, name);
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); });
    await p.goto(url); return p;
  };
  const base = `http://127.0.0.1:${port}/mp.html`, watcher = await api(null, 'POST', 'account', { name: 'Watcher' });
  const host = await mk(`${base}?quick=&${q}`, 'Hana');
  await host.waitForFunction(() => globalThis.game?.debug.net().status.startsWith('hosting') && game.debug.api().me, null, { timeout: 90000 });
  const h0 = await host.evaluate(() => ({ ...game.debug.api(), room: game.debug.getState().room }));
  check('quick play with nobody online hosts a public room', h0.playlist === 'casual' && /^Q/.test(h0.room), h0.room);
  await host.waitForFunction(() => document.getElementById('online-id').textContent.includes('FRIEND CODE'), null, { timeout: 10000 });
  let rooms = (await api(watcher, 'GET', 'rooms')).rooms;
  check('the room is on the server list', rooms.length === 1 && rooms[0].code === h0.room && rooms[0].size === 2 && rooms[0].free === 3, JSON.stringify(rooms));
  const client = await mk(`${base}?quick=&${q}`, 'Jo');
  await client.waitForFunction(() => globalThis.game?.debug.lobby()?.players.length === 2, null, { timeout: 90000 });
  check('a second player is matched into the same room', await client.evaluate(() => game.debug.getState().room) === h0.room);
  await client.waitForFunction(() => game.debug.lobby().players[1].id && game.debug.lobby().players[0].id, null, { timeout: 20000 });
  const lob = await client.evaluate(() => ({ st: game.debug.lobby(), html: document.getElementById('lobby').innerHTML }));
  check('the lobby shows server-confirmed players with friend and report buttons', lob.st.pl === 'casual' && lob.st.players[0].id === h0.me.id && lob.html.includes('data-report="0"') && lob.html.includes('PUBLIC'), JSON.stringify(lob.st.players));
  await client.click('#lobby button[data-friend="0"]');
  await client.waitForFunction(() => /Friend request sent/.test(document.getElementById('menu-status').textContent), null, { timeout: 10000 });
  await client.click('#start');
  for (const p of [host, client]) await p.waitForFunction(() => game.debug.getState().started && game.debug.api().gameId, null, { timeout: 30000 });
  check('a public room starts by itself once the joiner is ready, with a match record', true);
  rooms = (await api(watcher, 'GET', 'rooms')).rooms;
  check('the listing shows the match in progress', rooms[0]?.started === true && rooms[0].humans === 2, JSON.stringify(rooms));
  await host.evaluate(() => game.debug.finish());
  for (const p of [host, client]) await p.waitForFunction(() => game.debug.api().rank === 'Result recorded', null, { timeout: 40000 });
  check('both players report and the result is recorded', true);
  const c1 = await client.evaluate(() => game.debug.api());
  const st = await api(watcher, 'GET', 'stats/' + h0.me.id), st2 = await api(watcher, 'GET', 'stats/' + c1.me.id);
  check('server stats show a win for the host and a loss for the joiner', st.thisSeason.wins === 1 && st.thisSeason.matches === 1 && st2.thisSeason.losses === 1, JSON.stringify([st.thisSeason, st2.thisSeason]));
  // Online panel on the joiner's page.
  const panel = async (page, tab, want) => { await page.evaluate(t => game.debug.hub(t), tab); await page.waitForFunction(w => new RegExp(w).test(document.getElementById('hub').textContent), want, { timeout: 15000 }); return page.evaluate(() => document.getElementById('hub').textContent); };
  check('room browser lists the room', (await panel(client, 'rooms', h0.room)).includes('CASUAL'));
  check('stats panel shows the match', !!(await panel(client, 'stats', '1 matches · 0 wins · 1 losses')));
  const fr = await panel(client, 'friends', 'Hana · request sent');
  check('friends panel shows the code and the pending request', fr.includes(c1.me.friendCode), fr.slice(0, 120));
  await host.evaluate(() => game.debug.hub('friends'));
  await host.waitForFunction(() => document.querySelector('#hub button[data-add]'), null, { timeout: 15000 });
  await host.evaluate(() => document.querySelector('#hub button[data-add]').click());
  await host.waitForFunction(() => /Jo · \w+ · online/.test(document.getElementById('hub').textContent), null, { timeout: 15000 });
  check('the host accepts and sees the friend online', true);
  // Ranked search opens a ranked room of the fixed size.
  const third = await mk(`${base}?quick=&pl=ranked&${q}`, 'Kit');
  await third.waitForFunction(() => globalThis.game?.debug.net().status.startsWith('hosting') && game.debug.api().playlist === 'ranked' && game.debug.lobby()?.pl === 'ranked', null, { timeout: 90000 });
  const t0 = await third.evaluate(() => ({ size: game.debug.lobby().size, text: document.getElementById('lobby').textContent }));
  check('ranked search hosts a ranked 4 v 4 room', t0.size === 4 && t0.text.includes('RANKED'), String(t0.size));
  // Service unreachable: the page still hosts by code.
  const off = await mk(`${base}?host=OFF${Math.random().toString(36).slice(2, 6).toUpperCase()}&api=${encodeURIComponent('http://127.0.0.1:5999')}`, 'Lu');
  await off.waitForFunction(() => globalThis.game?.debug.net().status.startsWith('hosting'), null, { timeout: 90000 });
  check('with the service down a room by code still opens', await off.evaluate(() => game.debug.api().me === null && !document.getElementById('lobby').hidden));
  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
  console.log('BACKEND OK');
} finally { await browser.close(); server.kill(); back.stop(); }
