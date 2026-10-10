// Local progression: a solo match against recruit bots. Checks a kill pays XP, the match end pays XP,
// the profile is saved, and locked class options are disabled at level 1.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const port = 5192;
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const errors = []; const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); assert.ok(ok, name); };
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/mp.html?size=2&diff=recruit`);
  await page.waitForFunction(() => globalThis.game?.debug.getState().ready, null, { timeout: 120000 });
  const menu = await page.evaluate(() => ({ rank: document.getElementById('rank').textContent, locked: [...document.querySelectorAll('#cls-primary option:disabled')].length, open: [...document.querySelectorAll('#cls-primary option:not(:disabled)')].map(o => o.value), p: game.debug.progress() }));
  check('a new profile starts at level 1', menu.p.level === 1 && menu.p.xp === 0 && menu.rank.startsWith('LEVEL 1'), menu.rank);
  check('locked weapons are disabled in the class menu', menu.locked === 4 && menu.open.join() === 'halvard', `${menu.locked} locked, open: ${menu.open}`);
  const slots = await page.evaluate(() => { const $ = id => document.getElementById(id), pick = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event('change')); };
    $('cls-secondary').value = 'warden'; pick('cls-slot', '2'); const before = game.debug.loadout().slot; pick('cls-slot', '0');
    return { before, l: game.debug.loadout(), stored: JSON.parse(localStorage.getItem('graveshift.class')) }; });
  check('five classes are kept and the chosen one is saved', slots.before === 2 && slots.l.slots.length === 5 && slots.l.slot === 0 && slots.stored.slots.length === 5 && slots.stored.slot === 0);
  await page.evaluate(() => { game.debug.start(); document.getElementById('menu').hidden = true; });
  const frag = await page.evaluate(() => { const d = game.debug, me = d.soldiers.find(s => s.human); d.camera.rotation.x = .3; d.throwFrag(); const thrown = d.getState().nades, left = me.frags; d.step(3);
    return { thrown, left, after: d.getState().nades }; });
  await page.waitForTimeout(400);
  check('a frag is thrown and bursts on its fuse', frag.thrown === 1 && frag.left === 1 && frag.after === 0, JSON.stringify(frag));
  let arc = false;
  for (let i = 0; i < 60 && !arc; i++) {
    await page.evaluate(() => { if (game.debug.soldiers.find(s => s.human).alive) game.debug.hurtFrom([0, 0, 0]); });
    await page.waitForTimeout(150); arc = await page.evaluate(() => document.getElementById('hit-arc').style.opacity === '1');
  }
  check('the damage arc shows', arc);
  let p = null;
  for (let i = 0; i < 400; i++) {
    p = await page.evaluate(() => { const d = game.debug, me = d.soldiers.find(s => s.human), foes = d.soldiers.filter(s => s.team !== me.team && s.alive), eye = d.camera.position;
      if (me.alive && foes.length) { const f = foes.sort((a, b) => a.pos.distanceTo(eye) - b.pos.distanceTo(eye))[0]; d.camera.lookAt(f.pos.x, f.pos.y + 40, f.pos.z); d.fire(); } return d.progress(); });
    if (p.kills > 0) break; await page.waitForTimeout(120);
  }
  check('a kill pays XP', p.kills >= 1 && p.xp >= 100 && p.match.xp === p.xp, JSON.stringify({ kills: p.kills, xp: p.xp, medals: p.match.medals }));
  await page.evaluate(() => { for (let i = 0; i < 80 && !game.debug.getState().ended; i++) game.debug.step(10); });
  const end = await page.evaluate(() => ({ s: game.debug.getState(), p: game.debug.progress(), text: document.getElementById('end-xp').textContent, stored: JSON.parse(localStorage.getItem('graveshift.progress')) }));
  check('the match ends', end.s.ended, end.s.score.join('-'));
  check('finishing pays XP and counts the match', end.p.matches === 1 && end.p.xp >= p.xp + 150 && end.text.includes('XP'), end.text);
  check('the profile is saved', end.stored.xp === end.p.xp && end.stored.matches === 1);
  await page.reload();
  await page.waitForFunction(() => globalThis.game?.debug.getState().ready, null, { timeout: 120000 });
  const again = await page.evaluate(() => game.debug.progress());
  check('the profile survives a reload', again.xp === end.p.xp && again.level === end.p.level, `level ${again.level}, ${again.xp} XP`);
  check('challenges are listed with progress', (await page.textContent('#challenges')).includes('Marksman ' + again.kills + '/25') && await page.evaluate(() => document.getElementById('tour').hidden));
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('graveshift.progress')); p.xp = 145000; p.kills = 30; localStorage.setItem('graveshift.progress', JSON.stringify(p)); });
  await page.reload(); await page.waitForFunction(() => globalThis.game?.debug.getState().ready, null, { timeout: 120000 });
  check('the level cap offers a new tour', await page.evaluate(() => !document.getElementById('tour').hidden && game.debug.progress().level === 30));
  await page.evaluate(() => document.getElementById('tour').click());
  await page.waitForFunction(() => globalThis.game?.debug.getState().ready && game.debug.progress().tour === 1, null, { timeout: 120000 });
  const tour = await page.evaluate(() => ({ p: game.debug.progress(), rank: document.getElementById('rank').textContent, locked: document.querySelectorAll('#cls-primary option:disabled').length }));
  check('a new tour resets level and unlocks and keeps totals', tour.p.level === 1 && tour.p.kills === 30 && tour.rank.startsWith('TOUR 2 · LEVEL 1') && tour.locked === 4, tour.rank);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('PASS progress');
} catch (e) { console.error('FAIL', e.message, errors.slice(0, 5)); process.exitCode = 1; }
finally { await browser.close(); server.kill(); }
