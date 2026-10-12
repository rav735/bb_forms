// Runs tests/browser/unit.ts inside headless Chromium (real IndexedDB + DOMParser).
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

await build({ entryPoints: ['tests/browser/unit.ts'], bundle: true, format: 'iife', outfile: 'dist-test/unit.js', target: 'es2020', logLevel: 'warning' });
const server = createServer(async (req, res) => {
  if (req.url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><script src="/unit.js"></script>');
  try { const body = await readFile('dist-test' + req.url); res.writeHead(200, { 'content-type': 'text/javascript' }).end(body); } catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__results, null, { timeout: 60000 });
const results = await page.evaluate(() => window.__results);
await browser.close();
server.close();
let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '\n      ' + r.error}`);
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
