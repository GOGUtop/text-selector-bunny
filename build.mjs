import { readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const source = 'src/index.js';
const checked = spawnSync(process.execPath, ['--check', source], { encoding: 'utf8' });
if (checked.status !== 0) throw new Error(checked.stderr || 'syntax check failed');
const code = await readFile(source, 'utf8');
// Vendetta evaluates the downloaded entry file as:
//   vendetta => { return ${plugin.js} }
// A leading // or multi-line comment followed by a newline can cause ASI to
// turn that into `return;`, resulting in an enabled-but-inert plugin.
if (!code.startsWith('(function () {')) {
  throw new Error('ENTRYPOINT_ERROR: Plugin must begin directly with its IIFE expression (no leading comment/newline)');
}
const smokeApi = { metro: { common: { React: {}, ReactNative: {} } }, patcher: {}, ui: {} };
const loaded = (0, eval)(`vendetta=>{return ${code}}`)(smokeApi);
if (!loaded || typeof loaded.onLoad !== 'function' || typeof loaded.onUnload !== 'function' || typeof loaded.settings !== 'function') {
  throw new Error('ENTRYPOINT_ERROR: Vendetta loader smoke test did not receive plugin lifecycle + settings');
}
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
manifest.main = 'index.js';
manifest.hash = createHash('sha256').update(code).digest('hex');
for (const dir of ['docs', 'dist']) {
  await mkdir(dir, { recursive: true });
  await writeFile(dir + '/index.js', code);
  await writeFile(dir + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  await cp('README.md', dir + '/README.md');
}
await writeFile('docs/.nojekyll', '');
console.log(`Built ${manifest.name} v${manifest.version}.`);
