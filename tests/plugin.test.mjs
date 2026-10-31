import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(resolve(here, '../src/index.js'), 'utf8');

function setup() {
  const hooks = [];
  const opened = [];
  const copied = [];
  const notified = [];
  let hidden = 0;
  let closed = 0;
  const FormRow = function FormRow() {};
  const FormSection = function FormSection() {};
  const React = {
    createElement(type, props, ...children) {
      return { type, key: props?.key ?? null, props: { ...props, children: children.length === 1 ? children[0] : children } };
    },
    cloneElement(element, props, ...children) {
      return {
        ...element,
        props: {
          ...element.props,
          ...props,
          children: children.length === 1 ? children[0] : children.length > 1 ? children : element.props.children
        }
      };
    },
    isValidElement(x) { return !!x && typeof x === 'object' && !!x.type && !!x.props; }
  };
  const RN = { Text: 'Text', View: 'View', ScrollView: 'ScrollView' };
  const ActionSheet = { openLazy() {}, hideActionSheet() { hidden++; } };
  const Context = { ContextMenu() {} };
  const MessageSheet = { default() {} };
  const AlertManager = { openLazy() {}, close() { closed++; } };
  const vendetta = {
    metro: {
      common: { React, ReactNative: RN, clipboard: { setString(value) { copied.push(value); } } },
      findByName(name) {
        if (name === 'MessageLongPressActionSheet') return MessageSheet;
      },
      findByProps(...args) {
        if (args[0] === 'openLazy' && args[1] === 'hideActionSheet') return ActionSheet;
        if (args[0] === 'openLazy' && args[1] === 'close') return AlertManager;
        if (args[0] === 'ContextMenu') return Context;
      }
    },
    patcher: {
      before(name, obj, fn) {
        const patch = { name, obj, fn, kind: 'before', active: true };
        hooks.push(patch);
        return () => { patch.active = false; };
      },
      after(name, obj, fn) {
        const patch = { name, obj, fn, kind: 'after', active: true };
        hooks.push(patch);
        return () => { patch.active = false; };
      }
    },
    ui: {
      components: { Forms: { FormRow, FormSection }, Alert: 'Alert' },
      toasts: { showToast(message) { notified.push(message); } },
      alerts: { showCustomAlert(component, props) { opened.push({ component, props }); } }
    }
  };
  const plugin = vm.runInNewContext(code, { vendetta, setTimeout, clearTimeout, Promise, console, WeakSet, Object, Array });
  function before(name, obj, args) {
    for (const x of hooks) if (x.active && x.kind === 'before' && x.name === name && x.obj === obj) x.fn(args);
  }
  function after(name, obj, args, out) {
    for (const x of hooks) if (x.active && x.kind === 'after' && x.name === name && x.obj === obj) out = x.fn(args, out);
    return out;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function walk(n) {
    if (Array.isArray(n)) return n.flatMap(walk);
    if (n && n.props) return [n, ...walk(n.props.children)];
    return [];
  }
  return { plugin, hooks, opened, copied, notified, FormRow, FormSection, ActionSheet, Context, MessageSheet, before, after, sleep, walk, get hidden() { return hidden; }, get closed() { return closed; }, React };
}

test('plugin exports lifecycle and settings', () => {
  const t = setup();
  assert.equal(typeof t.plugin.onLoad, 'function');
  assert.equal(typeof t.plugin.onUnload, 'function');
  assert.equal(typeof t.plugin.settings, 'function');
  t.plugin.onLoad();
  assert.ok(t.hooks.some(x => x.name === 'openLazy'));
  assert.ok(t.walk(t.plugin.settings()).some(e => e.props?.label === '测试文字选择窗口'));
  t.plugin.onUnload();
  assert.ok(t.hooks.every(x => !x.active));
});

test('inject a message action after Copy Text; pass exact original message into dialog', async () => {
  const t = setup();
  t.plugin.onLoad();
  const module = { default() {} };
  t.before('openLazy', t.ActionSheet, [Promise.resolve(module), 'MessageLongPressActionSheet']);
  await t.sleep(0);
  const copy = t.React.createElement(t.FormRow, { label: '复制文字', onPress() {} });
  const reply = t.React.createElement(t.FormRow, { label: '回复', onPress() {} });
  const root = t.React.createElement('Group', {}, [reply, copy]);
  const content = '消息 A：现在能够只选取其中几个字。';
  const patched = t.after('default', module, [{ message: { content } }], root);
  const rowList = patched.props.children;
  assert.equal(rowList[1].props.label, '复制文字');
  assert.equal(rowList[2].props.label, '编辑文字');
  rowList[2].props.onPress();
  assert.equal(t.hidden, 1);
  await t.sleep(165);
  assert.equal(t.opened.length, 1);
  assert.equal(t.opened[0].props.text, content);
  const rendered = t.opened[0].component(t.opened[0].props);
  const texts = t.walk(rendered);
  assert.ok(texts.some(e => e.props?.selectable === true && e.props?.children === content));
  assert.ok(texts.some(e => e.props?.confirmText === '关闭'));
  texts.find(e => e.props?.cancelText === '复制全文').props.onCancel();
  assert.equal(t.copied[0], content);
  t.plugin.onUnload();
});

test('do not attach menu to media-only messages or unrelated actions', async () => {
  const t = setup();
  t.plugin.onLoad();
  const module = { default() {} };
  t.before('openLazy', t.ActionSheet, [Promise.resolve(module), 'MessageLongPressActionSheet']);
  await t.sleep(0);
  const original = t.React.createElement('Group', {}, [
    t.React.createElement(t.FormRow, { label: '复制文字', onPress() {} })
  ]);
  assert.equal(t.after('default', module, [{ message: { content: '' } }], original), original);
  assert.equal(t.after('default', module, [{ attachment: { url: 'img' } }], original), original);
  t.plugin.onUnload();
});

test('ContextMenu fallback adds item only when message content is present', async () => {
  const t = setup();
  t.plugin.onLoad();
  const untouched = { items: [{ id: 'copy', label: '复制文字' }] };
  const unrelatedArgs = [untouched];
  t.before('ContextMenu', t.Context, unrelatedArgs);
  assert.equal(unrelatedArgs[0], untouched);
  const args = [{ message: { content: 'Hello world' }, items: [{ id: 'copy', label: '复制文字' }] }];
  t.before('ContextMenu', t.Context, args);
  assert.equal(args[0].items[1].label, '编辑文字');
  assert.equal(args[0].items.length, 2);
  args[0].items[1].action();
  await t.sleep(165);
  assert.equal(t.opened[0].props.text, 'Hello world');
  t.plugin.onUnload();
});

test('pending dialog is cancelled when plugin unloads', async () => {
  const t = setup();
  t.plugin.onLoad();
  const item = t.walk(t.plugin.settings()).find(e => e.props?.label === '测试文字选择窗口');
  item.props.onPress();
  t.plugin.onUnload();
  await t.sleep(170);
  assert.equal(t.opened.length, 0);
});


test('directly patches message sheet already loaded before plugin startup', () => {
  const t = setup();
  t.plugin.onLoad();
  assert.ok(t.hooks.some(x => x.active && x.kind === 'after' && x.obj === t.MessageSheet));
  const content = '无需先调用 openLazy，也能看到编辑文字';
  const sections = t.React.createElement('Section', {}, [
    t.React.createElement(t.FormRow, { label: '回复', onPress() {} }),
    t.React.createElement(t.FormRow, { label: '复制文字', onPress() {} })
  ]);
  const result = t.after('default', t.MessageSheet, [{ message: { content } }], sections);
  assert.ok(t.walk(result).some(e => e.props?.label === '编辑文字'));
  t.plugin.onUnload();
});

test('inserts standalone keyed section when actions are grouped', () => {
  const t = setup();
  t.plugin.onLoad();
  const section = t.React.createElement('ActionSection', { key: 'actions' },
    t.React.createElement(t.FormRow, { label: '其他操作', onPress() {} }));
  const tree = t.React.createElement('Root', {}, [section]);
  const result = t.after('default', t.MessageSheet, [{ message: { content: 'sample' } }], tree);
  const groups = result.props.children;
  assert.equal(groups.length, 2);
  assert.equal(groups[1].key, 'text-selector-edit-message');
  assert.ok(t.walk(groups[1]).some(e => e.props?.label === '编辑文字'));
  t.plugin.onUnload();
});

test('intercepts a real lazy importer function instead of treating it as a module', async () => {
  const t = setup();
  t.plugin.onLoad();
  const module = { default() {} };
  let calls = 0;
  const args = [() => { calls++; return Promise.resolve(module); }, 'MessageLongPressActionSheet'];
  t.before('openLazy', t.ActionSheet, args);
  assert.equal(calls, 0, 'do not invoke importer prematurely');
  assert.equal(typeof args[0], 'function');
  assert.equal(await args[0](), module);
  assert.equal(calls, 1);
  const root = t.React.createElement('Group', {}, [
    t.React.createElement(t.FormRow, {label:'回复', onPress(){}}),
    t.React.createElement(t.FormRow, {label:'复制文字', onPress(){}})
  ]);
  const result = t.after('default', module, [{message:{content:'Importer works'}}], root);
  assert.ok(t.walk(result).some(x => x.props?.label === '编辑文字'));
  t.plugin.onUnload();
});

test('settings property is returned even if runtime module lookups throw at load', () => {
  const t = setup();
  // onLoad catches runtime errors without preventing settings from registering.
  const beforeCount = t.hooks.length;
  t.plugin.onLoad();
  assert.equal(typeof t.plugin.settings, 'function');
  assert.ok(t.notified.some(x => x.includes('1.2 已启动')));
  assert.ok(t.hooks.length > beforeCount);
  assert.ok(t.walk(t.plugin.settings()).some(e => e.props?.label === '启动状态'));
  t.plugin.onUnload();
});
