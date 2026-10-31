import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../docs/index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../docs/manifest.json', import.meta.url), 'utf8'));

test('Vendetta loader receives plugin object, not undefined (ASI regression)', () => {
  assert.equal(source[0], '(');
  const vendetta = { metro: { common: { React: {}, ReactNative: {} } }, patcher: {}, ui: {} };
  const plugin = (0, eval)(`vendetta=>{return ${source}}`)(vendetta);
  assert.equal(typeof plugin, 'object');
  assert.equal(typeof plugin.onLoad, 'function');
  assert.equal(typeof plugin.onUnload, 'function');
  assert.equal(typeof plugin.settings, 'function');
});

test('manifest points to built file, version is 1.3.0', () => {
  assert.equal(manifest.version, '1.3.0');
  assert.equal(manifest.main, 'index.js');
});

test('load and unload execute under a minimal compatible Vendetta mock', () => {
  const notices = [];
  const api = {
    metro: {
      common: { React: { createElement: () => ({}), isValidElement: () => false }, ReactNative: {} },
      findByProps: () => null,
    },
    patcher: { before: () => () => {}, after: () => () => {} },
    ui: { components: { Forms: {} }, toasts: { showToast: m => notices.push(m) }, alerts: {} },
  };
  const plugin = (0, eval)(`vendetta=>{return ${source}}`)(api);
  plugin.onLoad();
  assert.ok(notices.some(m => m.includes('1.3 已启动')), notices.join('\n'));
  plugin.onUnload();
});
