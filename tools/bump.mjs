// Run before every push: node tools/bump.mjs
// Writes a new build id into version.json and js/app.js so open copies of the app know they are stale.
import fs from 'node:fs';
const id = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
fs.writeFileSync(new URL('../version.json', import.meta.url), JSON.stringify({ build: id }) + '\n');
const p = new URL('../js/app.js', import.meta.url);
fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/const BUILD = '[^']*';/, `const BUILD = '${id}';`));
const s = new URL('../sw.js', import.meta.url);
fs.writeFileSync(s, fs.readFileSync(s, 'utf8').replace(/const CACHE = '[^']*';/, `const CACHE = 'mealy-${id}';`));
console.log('build', id);
