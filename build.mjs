import { readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const source = 'src/index.js';
const checked = spawnSync(process.execPath, ['--check', source], { encoding: 'utf8' });
if (checked.status !== 0) throw new Error(checked.stderr || 'syntax check failed');
const code = await readFile(source, 'utf8');
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
