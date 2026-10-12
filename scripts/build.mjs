// Bundles the app with esbuild, copies static files and injects the service-worker precache list.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const out = 'dist';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp('public', out, { recursive: true });

// Version = hash of everything the user can receive (so every content change updates the cache).
async function hashDir(dir, skip = []) {
  const h = createHash('sha256');
  for (const f of (await readdir(dir)).sort()) {
    if (skip.includes(f)) continue;
    h.update(f).update(await readFile(join(dir, f)));
  }
  return h.digest('hex').slice(0, 10);
}

const staticHash = await hashDir(out, ['sw.js']);
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: true,
  target: 'es2020',
  format: 'iife',
  outfile: join(out, 'app.js'),
  define: { __VERSION__: JSON.stringify(staticHash) },
  legalComments: 'none',
  logLevel: 'warning',
});
const version = await hashDir(out, ['sw.js']);

const files = (await readdir(out)).filter((f) => f !== 'sw.js');
const precache = ['./', ...files.map((f) => `./${f}`)];
let sw = await readFile(join(out, 'sw.js'), 'utf8');
sw = sw.replaceAll('__VERSION__', version).replaceAll('__PRECACHE__', JSON.stringify(precache));
if (sw.includes('__PRECACHE__') || sw.includes('__VERSION__')) throw new Error('service worker placeholders not replaced');
await writeFile(join(out, 'sw.js'), sw);
console.log(`built dist/ (version ${version}, ${files.length} files)`);
