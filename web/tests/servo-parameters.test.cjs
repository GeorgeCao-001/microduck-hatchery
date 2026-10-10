'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const parameters = require('../prototype/servo-parameters.js');
const jointDrafts = require('../prototype/joint-drafts.js');

function node(attributes = {}, value = '') {
  return {
    id: '', disabled: false, value, checked: false, files: [],
    dataset: Object.fromEntries(Object.keys(attributes).map(key => [key.replace(/^data-/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase()), attributes[key]])),
    hasAttribute(key) { return Object.hasOwn(attributes, key); },
    matches(selector) { return selector.split(',').some(part => Object.hasOwn(attributes, part.trim().replace(/^\[|\]$/g, ''))); },
    closest() { return this; }
  };
}
function view() {
  const listeners = new Map();
  const container = {
    innerHTML: '', contains() { return true; },
    querySelector() { return null; },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); }
  };
  parameters.mount({ container, state: 'offline', jointId: 23 });
  return { container, listeners, dispatch(type, target) { listeners.get(type)({ target }); } };
}
function draft(id) { return parameters.snapshot().drafts.joints.find(row => row.id === id); }

test('the parameter page keeps all 15 joints and unknown device values in every preview state', () => {
  const baseline = parameters.snapshot().drafts;
  for (const state of ['example', 'offline', 'stale', 'readonly']) {
    const html = parameters.render({ state, jointId: 23 });
    assert.deepEqual([...html.matchAll(/data-servo-row="(\d+)"/g)].map(match => Number(match[1])), [20,21,22,23,24,10,11,12,13,14,30,31,32,33,34]);
    assert.match(html, /嘴部/);
    assert.match(html, /左髋 Yaw/);
    assert.match(html, /设备未连接/);
    assert.match(html, /实机标定 0 \/ 15/);
    assert.match(html, /权威串口后端尚未接通/);
    assert.equal((html.match(/data-servo-parameter=/g) || []).length, 15);
    assert.match(html, /data-servo-parameter="speedRaw"[^>]+/);
  }
  assert.deepEqual(parameters.snapshot().drafts, baseline);
});

test('field drafts and batch ranges stay separate from the joint target store', () => {
  const targetStore = jointDrafts.createStore();
  const targetsBefore = targetStore.snapshot();
  const ui = view();
  ui.dispatch('change', node({ 'data-servo-parameter': 'speedRaw' }, '47'));
  assert.equal(draft(23).parameters.speedRaw, 47);
  assert.equal(draft(20).parameters.speedRaw, null);
  ui.dispatch('click', node({ 'data-servo-range': 'left' }));
  const batchField = node({ 'data-servo-batch-field': 'speedRaw' }); batchField.checked = true;
  ui.dispatch('change', batchField);
  ui.dispatch('click', node({ 'data-servo-batch-preview': '' }));
  assert.equal(draft(20).parameters.speedRaw, null);
  assert.match(ui.container.innerHTML, /速度参数 — → 47/);
  ui.dispatch('click', node({ 'data-servo-batch-apply': '' }));
  for (const id of [20,21,22,23,24]) assert.equal(draft(id).parameters.speedRaw, 47);
  for (const id of [10,11,12,13,14,30,31,32,33,34]) assert.equal(draft(id).parameters.speedRaw, null);
  assert.deepEqual(targetStore.snapshot(), targetsBefore);
  parameters.unmount();
});

test('changing the externally selected joint invalidates a batch review instead of replacing its source', () => {
  const ui = view();
  ui.dispatch('change', node({ 'data-servo-parameter':'speedRaw' }, '47'));
  ui.dispatch('click', node({ 'data-servo-range':'left' }));
  const batchField = node({ 'data-servo-batch-field':'speedRaw' }); batchField.checked = true;
  ui.dispatch('change', batchField);
  ui.dispatch('change', node({ 'data-servo-parameter':'pGainRaw' }, '19'));
  const coefficient = node({ 'data-servo-batch-field':'pGainRaw' }); coefficient.checked = true;
  ui.dispatch('change', coefficient);
  ui.dispatch('click', node({ 'data-servo-batch-preview':'' }));
  assert.match(ui.container.innerHTML, /P 系数 — → 19/);
  assert.equal(draft(20).parameters.pGainRaw, null);

  // An external route render can change the detail joint before mount runs.
  const changedMarkup = parameters.render({ jointId:20, state:'offline' });
  assert.match(changedMarkup, /data-servo-batch-apply disabled/);
  ui.dispatch('click', node({ 'data-servo-batch-apply':'' }));
  assert.equal(draft(23).parameters.pGainRaw, 19);
  assert.equal(draft(20).parameters.pGainRaw, null);

  parameters.setContext({ jointId:23 });
  ui.dispatch('click', node({ 'data-servo-batch-preview':'' }));
  const staleMarkup = ui.container.innerHTML;
  assert.doesNotMatch(staleMarkup, /data-servo-batch-apply disabled/);
  parameters.unmount();

  // A reused container deliberately exposes the old markup to mount.
  ui.container.innerHTML = staleMarkup;
  ui.container.querySelector = () => ({});
  parameters.mount({ container:ui.container, state:'offline', jointId:20 });
  assert.match(ui.container.innerHTML, /data-servo-batch-apply disabled/);
  assert.equal(parameters.snapshot().jointId, 20);
  assert.equal(parameters.snapshot().range, 'left');
  assert.ok(parameters.snapshot().batchFields.includes('pGainRaw'));
  ui.dispatch('click', node({ 'data-servo-batch-apply':'' }));
  assert.equal(draft(23).parameters.pGainRaw, 19);
  assert.equal(draft(20).parameters.pGainRaw, null);

  // A fresh review from the original source still applies the reviewed values.
  parameters.setContext({ jointId:23 });
  ui.dispatch('click', node({ 'data-servo-batch-preview':'' }));
  ui.dispatch('click', node({ 'data-servo-batch-apply':'' }));
  for (const id of [20,21,22,23,24]) assert.equal(draft(id).parameters.pGainRaw, 19);
  for (const id of [10,11,12,13,14,30,31,32,33,34]) assert.equal(draft(id).parameters.pGainRaw, null);
  parameters.unmount();
});

test('calibration previews remain local drafts and distinguish the encoder reference from a joint angle', () => {
  const ui = view();
  ui.dispatch('click', node({ 'data-servo-tab': 'calibration' }));
  assert.match(ui.container.innerHTML, /data-servo-encoder-angle>180°/);
  assert.match(ui.container.innerHTML, /data-servo-center-angle>0°/);
  assert.match(ui.container.innerHTML, /data-servo-draft-angle>—/);
  for (const [key, value] of Object.entries({ zeroCounts:2048, referenceDeg:5, direction:-1, minDeg:-30, maxDeg:30 })) {
    ui.dispatch('change', node({ 'data-servo-calibration': key }, String(value)));
  }
  assert.match(ui.container.innerHTML, /data-servo-draft-angle>5°/);
  assert.match(ui.container.innerHTML, /data-servo-ready-count>1 \/ 15/);
  assert.match(ui.container.innerHTML, /实机标定 0 \/ 15/);
  ui.dispatch('change', node({ 'data-servo-counts': '' }, '3072'));
  assert.match(ui.container.innerHTML, /data-servo-draft-angle>-85°/);
  assert.match(ui.container.innerHTML, /超出填写的机械限位/);
  assert.equal(draft(23).hardwareConfirmed, false);
  assert.equal(draft(23).sampleOnly, true);
  ui.dispatch('change', node({ 'data-servo-counts': '' }, '4096'));
  assert.match(ui.container.innerHTML, /data-servo-encoder-angle>—/);
  assert.match(ui.container.innerHTML, /data-servo-draft-angle>—/);
  assert.match(ui.container.innerHTML, /未 wrap 或裁剪/);
  parameters.unmount();
});

test('invalid edits preserve prior drafts and mount lifecycle removes its listeners', () => {
  const ui = view();
  ui.dispatch('change', node({ 'data-servo-calibration': 'direction' }, '0'));
  assert.equal(draft(23).calibration.direction, -1);
  assert.match(ui.container.innerHTML, /机械方向必须为/);
  assert.equal(ui.listeners.size, 3);
  const before = parameters.snapshot();
  parameters.setContext({ state: 'stale' });
  assert.deepEqual(parameters.snapshot().drafts, before.drafts);
  parameters.unmount();
  assert.equal(ui.listeners.size, 0);
  assert.equal(parameters.snapshot().mounted, false);
  const next = view();
  assert.equal(parameters.snapshot().tab, 'calibration');
  assert.equal(draft(23).calibration.direction, -1);
  assert.equal(next.listeners.size, 3);
  parameters.unmount();
});

test('file imports reject forged hardware claims and late reads cannot replace newer edits', () => {
  const originalReader = globalThis.FileReader;
  const pending = [];
  globalThis.FileReader = class {
    readAsText(file) { this.result = file.text; pending.push(this); }
  };
  const ui = view();
  const current = parameters.snapshot().drafts;
  const fileDocument = {
    format:'hatchery-servo-drafts', version:1, profileId:current.profileId,
    model:current.model, sampleOnly:true, hardwareConfirmed:false, joints:current.joints
  };
  function importText(text, size = text.length) {
    const input = node({ 'data-servo-file': '' });
    input.files = [{ text, size }];
    ui.dispatch('change', input);
  }
  try {
    const before = parameters.snapshot().drafts;
    importText(JSON.stringify({ ...fileDocument, hardwareConfirmed:true }));
    pending.pop().onload();
    assert.deepEqual(parameters.snapshot().drafts, before);
    assert.match(ui.container.innerHTML, /导入拒绝/);
    fileDocument.joints.find(row => row.id === 23).parameters.speedRaw = 80;
    importText(JSON.stringify(fileDocument));
    const delayed = pending.pop();
    ui.dispatch('change', node({ 'data-servo-parameter':'speedRaw' }, '-7'));
    delayed.onload();
    assert.equal(draft(23).parameters.speedRaw, -7);
    importText(JSON.stringify(fileDocument));
    pending.pop().onload();
    assert.equal(draft(23).parameters.speedRaw, 80);
    assert.equal(draft(23).hardwareConfirmed, false);
    const readersBefore = pending.length;
    importText('{}', 128 * 1024 + 1);
    assert.equal(pending.length, readersBefore);
    importText(JSON.stringify(fileDocument));
    const afterUnmount = pending.pop();
    parameters.unmount();
    const draftBeforeUnmount = parameters.snapshot().drafts;
    afterUnmount.onload();
    assert.deepEqual(parameters.snapshot().drafts, draftBeforeUnmount);
  } finally {
    parameters.unmount();
    if (originalReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalReader;
  }
});
