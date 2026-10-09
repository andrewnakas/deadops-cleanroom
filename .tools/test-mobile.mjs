// Touch / phone layout: boots in a mobile context, starts by tap, moves with the stick, fires, reloads, uses.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
const out = path.resolve('artifacts/mobile'); fs.mkdirSync(out, { recursive: true });
const port = 5185, server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { windowsHide: true, stdio: 'ignore' });
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const errors = [], failed = [];
const check = (name, ok) => { console.log(ok ? 'PASS' : 'FAIL', name); assert.ok(ok, name); };
try {
  await new Promise(r => setTimeout(r, 800));
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => game?.debug.getState().ready, null, { timeout: 120000 });
  const st = () => page.evaluate(() => game.debug.getState());
  check('touch mode detected', (await st()).input.touch.mode);
  await page.tap('#start');
  await page.waitForFunction(() => game.debug.getState().active);
  check('touch controls visible', await page.locator('#touch-controls').isVisible());
  await page.screenshot({ path: path.join(out, 'play.png') });
  const before = (await st()).player.feet;
  const stick = await page.locator('.touch-move').boundingBox();
  const cdp = await context.newCDPSession(page), cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - i * 8, id: 1 }] }); await page.waitForTimeout(60); }
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = (await st()).player.feet;
  check('stick moves the player', Math.hypot(after[0] - before[0], after[2] - before[2]) > 20);
  await page.waitForTimeout(800);
  const mag = (await st()).weapon.mag;
  await page.locator('.touch-fire').tap(); await page.waitForTimeout(250);
  check('fire button shoots', (await st()).weapon.mag < mag);
  await page.locator('.touch-reload').tap(); await page.waitForTimeout(2500);
  check('reload button reloads', (await st()).weapon.mag === mag);
  await page.screenshot({ path: path.join(out, 'after.png') });
  check('no page errors', errors.length === 0);
  check('no failed requests', failed.length === 0);
} catch (e) { console.error(e.message, errors, failed); process.exitCode = 1; }
finally { await browser.close(); server.kill(); }
