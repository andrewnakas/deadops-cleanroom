// Frame rate per quality tier: node .tools/perf.mjs [index|mp] [tiers...]   (headless, 1280x720, real time)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const pageName = process.argv[2] ?? 'index', tiers = process.argv.slice(3).length ? process.argv.slice(3) : ['low', 'medium', 'high', 'ultra'], port = 5197;
const server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  for (const tier of tiers) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    await page.goto(`http://127.0.0.1:${port}/${pageName}.html${pageName === 'mp' ? '?size=4&diff=recruit&map=suburb&gfx=' + tier : "?gfx=" + tier + (process.env.Q ?? "")}`);
    await page.waitForFunction(() => globalThis.game?.debug.getState().ready, null, { timeout: 120000 });
    if (pageName === 'mp') await page.evaluate(() => { game.debug.start(); document.getElementById('menu').hidden = true; });
    else await page.evaluate(() => { game.debug.setActive(true); game.debug.setInvulnerable(true); game.debug.openAllDoors(); game.debug.setPower(true); game.debug.teleportPlayer([0, 0, -150]); game.debug.lookAt([0, 60, -1200]); game.debug.setAutoSpawn?.(false); game.debug.clearEnemies(); for (let i = 0; i < +(new URLSearchParams(location.search).get("z") ?? 12); i++) game.debug.spawnEnemy([-300 + i * 50, 0, -500]); });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => new Promise(done => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else done({ fps: Math.round(n / 4), calls: gfx.renderer.info.render.calls, tris: gfx.renderer.info.render.triangles, gpu: (() => { const g = gfx.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })() }); }; requestAnimationFrame(tick); }));
    console.log(pageName, tier.padEnd(7), JSON.stringify(r));
    await page.close();
  }
} catch (e) { console.log('FAIL', e.message); }
finally { await browser.close(); server.kill(); }
