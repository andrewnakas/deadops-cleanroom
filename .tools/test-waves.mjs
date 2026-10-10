// Headless survival run: the player stands in the lobby and shoots every zombie
// that gets through (real hitscan path, real AI, real round logic) until round N.
//   node .tools/test-waves.mjs [rounds=10] [port]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const target = +(process.argv[2] ?? 10), port = +(process.argv[3] ?? 5198);
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const errors = [], log = [];
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => globalThis.game?.debug.getState().ready, null, { timeout: 120000 });
  await page.evaluate(() => { game.debug.setActive(true); game.debug.setInvulnerable(true); game.debug.giveWeapon('halvard'); });
  const t0 = Date.now();
  let lastRound = 1, shots = 0, sim = 0, maxEnemies = 0;
  while (sim < 3600) {
    const r = await page.evaluate(() => {
      const d = game.debug, s = d.getState();
      // keep ammo topped up; aim at the nearest inside zombie and fire through the normal path
      if (s.weapon.reserve < 60) d.collectPowerup('supply');
      const inside = s.enemies.filter(z => z.state === 'chase' || z.state === 'attack');
      let fired = 0;
      if (inside.length) {
        const feet = s.player.feet, z = inside.sort((a, b) => Math.hypot(a.position[0] - feet[0], a.position[2] - feet[2]) - Math.hypot(b.position[0] - feet[0], b.position[2] - feet[2]))[0];
        d.aimAtEnemy(z.id, false); if (d.shoot()) fired++;
      }
      if (s.weapon.mag === 0) d.reload();
      d.step(.25);
      const n = d.getState();
      return { round: n.round, phase: n.phase, enemies: n.enemies.length, kills: n.kills, fired, health: n.health, points: n.points, states: [...new Set(n.enemies.map(z => z.state))].join(',') };
    });
    sim += .25; shots += r.fired; maxEnemies = Math.max(maxEnemies, r.enemies);
    if (r.round !== lastRound) { log.push(`round ${r.round} at t=${sim.toFixed(0)}s kills=${r.kills} points=${r.points}`); lastRound = r.round; }
    if (r.round >= target) break;
  }
  const s = await page.evaluate(() => { const s = game.debug.getState(); return { round: s.round, kills: s.kills, headshots: s.headshots, points: s.points, fps: s.performance.fps }; });
  console.log(log.join('\n'));
  console.log(JSON.stringify({ ...s, simSeconds: sim, wallSeconds: (Date.now() - t0) / 1000, shots, maxEnemies, errors: errors.length }));
  assert.ok(s.round >= target, `reached round ${s.round} of ${target}`);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS waves');
} catch (e) { console.error('FAIL', e.message); process.exitCode = 1; }
finally { await browser.close(); server.kill(); }
