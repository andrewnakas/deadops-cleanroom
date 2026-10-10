// Zombies co-op: a host and a joiner share the undead, the round, doors and power; the joiner's kill is scored by
// the host; a downed player is revived by the other; the game ends for both when everyone is down.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const port = 5184, room = 'C' + Math.random().toString(36).slice(2, 7).toUpperCase();
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errors = []; const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); assert.ok(ok, name); };
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  const mk = async (url, name) => {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 720 } });
    await ctx.addInitScript(n => localStorage.setItem('graveshift.class', JSON.stringify({ name: n })), name);
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto(url); return p;
  };
  const st = p => p.evaluate(() => game.debug.getState());
  const host = await mk(`http://127.0.0.1:${port}/index.html?host=${room}`, 'Hana');
  await host.waitForFunction(() => globalThis.game?.debug.getState().ready && game.debug.getState().coop?.net.startsWith('hosting'), null, { timeout: 90000 });
  await host.evaluate(() => { game.debug.resume(); game.debug.setInvulnerable(true); });
  const client = await mk(`http://127.0.0.1:${port}/index.html?join=${room}`, 'Jo');
  await client.waitForFunction(() => globalThis.game?.debug.getState().ready && game.debug.getState().coop?.seat === 1, null, { timeout: 90000 });
  await client.evaluate(() => { game.debug.resume(); game.debug.setInvulnerable(true); });
  await host.waitForFunction(() => game.debug.getState().coop.mates[0]?.state === 0, null, { timeout: 20000 });
  const names = [(await st(host)).coop.mates[0].name, (await st(client)).coop.mates[0].name];
  check('each player sees the other', names[0] === 'Jo' && names[1] === 'Hana', names.join());
  // Shared zombies.
  await client.waitForFunction(() => game.debug.getState().enemies.length > 0 && game.debug.getState().phase === 'fighting', null, { timeout: 60000 });
  const [hs, cs] = [await st(host), await st(client)];
  check('the joiner sees the host\'s zombies and round', cs.round === hs.round && cs.total === hs.total && Math.abs(cs.enemies.length - hs.enemies.length) <= 1, `${cs.enemies.length}/${hs.enemies.length} of ${cs.total}`);
  const before = cs.points;
  await client.evaluate(() => game.debug.damageEnemy(game.debug.getState().enemies[0].id));
  await client.waitForFunction(p => game.debug.getState().points >= p + 60 && game.debug.getState().kills === 1, before, { timeout: 15000 });
  await host.waitForFunction(() => game.debug.getState().killed >= 1, null, { timeout: 10000 });
  const h2 = await st(host);
  check('the joiner\'s kill is confirmed by the host and scored for the joiner only', h2.kills === 0 && h2.points === hs.points, `host ${h2.points} joiner ${(await st(client)).points}`);
  // Doors and power.
  await client.evaluate(() => { game.debug.grantPoints(5000); });
  check('joiner buys a door', await client.evaluate(() => game.debug.interactWith('door')));
  await host.waitForFunction(() => game.debug.getState().doors.some(d => d.open), null, { timeout: 10000 });
  check('the door opens for the host too', true);
  await host.evaluate(() => game.debug.interactWith('power'));
  await client.waitForFunction(() => game.debug.getState().power, null, { timeout: 10000 });
  check('power thrown by the host reaches the joiner', true);
  await client.evaluate(() => game.debug.setBoards(game.debug.getState().barriers[0].id, 0));
  await host.evaluate(() => game.debug.setBoards(game.debug.getState().barriers[1].id, 1));
  await client.waitForFunction(() => game.debug.getState().barriers[1].count === 1, null, { timeout: 10000 });
  check('barricades follow the host', (await st(client)).barriers[0].count === (await st(host)).barriers[0].count);
  // Power-up dropped on the host is seen and shared.
  await host.evaluate(() => game.debug.dropPowerup('double', [0, -4000, 0]));
  await client.waitForFunction(() => game.debug.specialState().pickups.length === 1, null, { timeout: 10000 });
  await host.evaluate(() => { const p = game.debug.getState().player.feet; game.debug.dropPowerup('supply', p); });
  await client.waitForFunction(() => game.debug.getState().grenades === 4 && game.debug.getState().inventory[0].reserve > 0, null, { timeout: 10000 });
  check('power-ups are shown to and collected for everyone', true);
  // Down and revive.
  await client.evaluate(() => { game.debug.setInvulnerable(false); game.debug.damagePlayer(500); });
  await host.waitForFunction(() => game.debug.getState().coop.mates[0].state === 1, null, { timeout: 10000 });
  const down = await st(client);
  check('a joiner at zero health goes down instead of ending the game', down.downState === 'down' && down.phase !== 'gameover');
  await host.evaluate(p => game.debug.teleportPlayer(p), down.player.feet);
  await host.waitForFunction(() => document.getElementById('prompt').textContent.includes('revive Jo'), null, { timeout: 10000 });
  check('the host is offered the revive', await host.evaluate(() => game.debug.coopRevive()));
  await client.waitForFunction(() => game.debug.getState().downState === null && game.debug.getState().health === 100, null, { timeout: 10000 });
  check('the joiner is revived', true);
  // Everyone down ends the game for both.
  await client.evaluate(() => { game.debug.setInvulnerable(false); game.debug.damagePlayer(500); });
  await host.waitForFunction(() => game.debug.getState().coop.mates[0].state === 1, null, { timeout: 10000 });
  await host.evaluate(() => { game.debug.setInvulnerable(false); game.debug.damagePlayer(500); });
  for (const p of [host, client]) await p.waitForFunction(() => game.debug.getState().phase === 'gameover' && !document.getElementById('menu').hidden, null, { timeout: 15000 });
  check('with everyone down the game ends for both', true);
  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 400));
  console.log('COOP OK');
} finally { await browser.close(); server.kill(); }
