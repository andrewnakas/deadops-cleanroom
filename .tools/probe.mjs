// Ad hoc probe: node .tools/probe.mjs '<query>' '<js expression run in the page after start>'
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const port = 5196, server = spawn(process.execPath, [path.resolve(import.meta.dirname, 'serve.mjs'), String(port)], { stdio: 'ignore', windowsHide: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  const page = await browser.newPage(); page.on('pageerror', e => console.log('ERR', String(e)));
  await page.goto(`http://127.0.0.1:${port}/mp.html?${process.argv[2]}`);
  await page.waitForFunction(() => globalThis.game?.debug.getState().ready, null, { timeout: 120000 });
  console.log(JSON.stringify(await page.evaluate(process.argv[3])));
} finally { await browser.close(); server.kill(); }
