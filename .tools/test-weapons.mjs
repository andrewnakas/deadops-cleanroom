// Every weapon loads its CC0 model, fires and reloads; --upgraded runs each through the Refinery.
//   node .tools/test-weapons.mjs [--upgraded] [ids...]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const data = JSON.parse(fs.readFileSync('export/web/data/game.json'));
const upgraded = process.argv.includes('--upgraded'), selected = process.argv.slice(2).filter(a => !a.startsWith('--'));
const port = 5197, server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const browser = await chromium.launch({ executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync), headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [], checks = [];
fs.mkdirSync('artifacts/weapons', { recursive: true });
page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await new Promise(r => setTimeout(r, 800));
  await page.goto(`http://127.0.0.1:${port}/`); await page.waitForFunction(() => game?.debug.getState().ready, null, { timeout: 120000 });
  const ents = await page.evaluate(() => game.debug.getEntities());
  const power = ents.find(e => e.type === 'power'), ref = ents.find(e => e.type === 'refinery');
  const front = (e, d, up) => [e.position[0] + Math.sin(e.yaw) * d, e.position[1] + up, e.position[2] + Math.cos(e.yaw) * d];
  for (const [id, base] of Object.entries(data.weapons)) {
    if (selected.length && !selected.includes(id)) continue;
    const def = upgraded ? { ...base, ...base.upgrade } : base;
    await page.evaluate(id => { game.debug.reset(); game.debug.setActive(true); game.debug.setInvulnerable(true); game.debug.setAutoSpawn(false); game.debug.giveWeapon(id); }, id);
    await page.waitForFunction(() => game.debug.getState().viewmodelReady, null, { timeout: 20000 });
    if (upgraded) {
      await page.evaluate(({ power, ref }) => {
        const d = game.debug; d.grantPoints(5000); d.teleportPlayer(power); d.lookAt([power[0], power[1] + 40, power[2]]); d.interact();
        d.teleportPlayer(ref); if (!d.interact()) throw new Error('Refinery purchase failed'); d.step(4.2); if (!d.interact()) throw new Error('Refinery retrieval failed');
      }, { power: front(power, 24, 0), ref: front(ref, 40, 0) });
      await page.waitForFunction(() => game.debug.getState().viewmodelReady, null, { timeout: 20000 });
    }
    await page.evaluate(() => game.debug.step(.6));
    let state = await page.evaluate(() => game.debug.getState()); assert.equal(state.weapon.id, id); assert.equal(state.weapon.mag, def.clipSize, id + ' clip');
    if (upgraded) assert.ok(state.weapon.upgraded, id + ' refined');
    await page.screenshot({ path: `artifacts/weapons/${id}${upgraded ? '-upgraded' : ''}.png` });
    await page.evaluate(() => game.debug.shoot()); state = await page.evaluate(() => game.debug.getState()); assert.ok(state.weapon.mag < def.clipSize, id + ' fires');
    await page.evaluate(() => { game.debug.step(1); game.debug.reload(); game.debug.step(12); }); state = await page.evaluate(() => game.debug.getState()); assert.equal(state.weapon.mag, def.clipSize, id + ' reloads');
    checks.push({ id, passed: true, model: def.view.model }); console.log('PASS', id, upgraded ? '(refined: ' + def.name + ')' : '', 'loads, fires, reloads');
  }
  assert.equal(errors.length, 0, errors.join('\n'));
} catch (e) { checks.push({ passed: false, error: String(e) }); console.error(e); process.exitCode = 1; }
finally { fs.writeFileSync('artifacts/weapons/' + (upgraded ? 'upgraded-report' : 'report') + '.json', JSON.stringify({ checks, errors }, null, 2)); await browser.close(); server.kill(); }
