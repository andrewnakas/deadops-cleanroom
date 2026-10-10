// Multiplayer screenshots: node .tools/shot-mp.mjs <outdir> <arena> '[{"name":"a","pos":[x,y,z],"look":[x,y,z]}]'
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const out = path.resolve(process.argv[2] ?? 'artifacts/shots'), arena = process.argv[3] ?? 'suburb', script = JSON.parse(process.argv[4] ?? '[]'), port = 5198;
fs.mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  await new Promise(r => setTimeout(r, 800));
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${port}/mp.html?size=1&diff=recruit&map=${arena}`);
  await page.waitForFunction(() => globalThis.game?.debug.getState().ready, null, { timeout: 120000 });
  await page.evaluate(() => { game.debug.start(); document.getElementById('menu').hidden = true; document.body.classList.remove('menu-open'); });
  for (const s of script) {
    await page.evaluate(s => { const d = game.debug; d.teleport(s.pos); d.step(.2); d.camera.lookAt(...s.look); }, s);
    await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, s.name + '.png') });
  }
  console.log('shots', script.map(s => s.name).join(' '));
} catch (e) { console.log('FAIL', e.message); process.exitCode = 1; }
finally { await browser.close(); server.kill(); }
