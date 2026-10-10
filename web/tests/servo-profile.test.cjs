'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const profile = require('../prototype/servo-profile.js');
const jointModel = require('../prototype/joint-drafts.js');

const options = Object.freeze({
  profileId: profile.hd1910.id, unit: 'counts', singleTurn: true,
  resolutionConfirmed: true, countReference: 'default-single-turn', source: 'sample'
});
const calibration = Object.freeze({ zeroCounts: 2048, referenceDeg: 0, direction: 1, minDeg: -90, maxDeg: 90 });

test('manufacturer resolution preserves 4096 division, encoder midpoint and both endpoints', () => {
  assert.equal(profile.hd1910.model, 'HD-1910-C001');
  assert.equal(profile.hd1910.degreesPerCount, 0.087890625);
  assert.deepEqual(profile.referencePosition(0, options), { valid: true, encoderDeg: 0, centerDeg: -180, reason: '' });
  assert.deepEqual(profile.referencePosition(2048, options), { valid: true, encoderDeg: 180, centerDeg: 0, reason: '' });
  assert.deepEqual(profile.referencePosition(4095, options), { valid: true, encoderDeg: 359.912109375, centerDeg: 179.912109375, reason: '' });
  assert.equal(profile.hd1910.hardwareConfirmed, false);
  assert.equal(profile.hd1910.registerProfileConfirmed, false);
});

test('unknown units, UI fixtures, unconfirmed resolution and unknown turns cannot invent angles', () => {
  const rejected = [
    [2048, undefined], [2048, {}], [128, { ...options, profileId: 'ui-fixture-v1' }],
    [128, { ...options, unit: 'ticks' }], [2048, { ...options, resolutionConfirmed: false }],
    [2048, { ...options, singleTurn: false }], [2048, { ...options, singleTurn: undefined }],
    [-1, options], [4096, options], [8192, options], [2048.1, options],
    [null, options], [undefined, options], ['2048', options], [Infinity, options], [NaN, options]
  ];
  for (const [counts, context] of rejected) {
    const result = profile.referencePosition(counts, context);
    assert.equal(result.valid, false);
    assert.equal(result.encoderDeg, null);
    assert.equal(result.centerDeg, null);
    assert.ok(result.reason);
  }
});

test('calibration previews apply known reference and both mechanical directions without becoming measurements', () => {
  const forward = profile.calibrationPreview(3072, calibration, options);
  const reverse = profile.calibrationPreview(3072, { ...calibration, direction: -1 }, options);
  assert.equal(forward.angleDeg, 90);
  assert.equal(reverse.angleDeg, -90);
  assert.equal(forward.inRange, true);
  assert.equal(reverse.inRange, true);
  assert.equal(profile.calibrationPreview(1024, calibration, options).angleDeg, -90);
  assert.equal(profile.calibrationPreview(2048, { ...calibration, referenceDeg: 12 }, options).angleDeg, 12);
  assert.equal(forward.hardwareConfirmed, false);
  assert.equal(forward.sampleOnly, true);
  assert.equal(forward.status, 'local-draft-preview');
  assert.deepEqual(calibration, { zeroCounts: 2048, referenceDeg: 0, direction: 1, minDeg: -90, maxDeg: 90 });
});

test('calibration previews reject incomplete or inconsistent drafts and do not wrap or clamp limits', () => {
  const invalid = [
    null, {}, { ...calibration, zeroCounts: null }, { ...calibration, zeroCounts: 4096 },
    { ...calibration, zeroCounts: 2048.5 }, { ...calibration, direction: 0 },
    { ...calibration, direction: 2 }, { ...calibration, minDeg: 90 },
    { ...calibration, maxDeg: -100 }, { ...calibration, referenceDeg: 100 },
    { ...calibration, referenceDeg: NaN }, { ...calibration, zeroCounts: Infinity },
    { ...calibration, minDeg: -36001 }, { ...calibration, confirmed: true }
  ];
  for (const draft of invalid) {
    const result = profile.calibrationPreview(2048, draft, options);
    assert.equal(result.valid, false);
    assert.equal(result.angleDeg, null);
    assert.equal(result.inRange, null);
  }
  assert.equal(profile.calibrationPreview(2048, calibration, { ...options, countReference: undefined }).valid, false);
  const outside = profile.calibrationPreview(4095, calibration, options);
  assert.equal(outside.valid, true);
  assert.equal(outside.angleDeg, 179.912109375);
  assert.equal(outside.inRange, false);
  assert.match(outside.reason, /未裁剪/);
  // Finite single-turn subtraction is intentional; the short wrapped difference would be -1 count.
  const acrossSeam = profile.calibrationPreview(4095, { ...calibration, zeroCounts: 0 }, options);
  assert.equal(acrossSeam.angleDeg, 359.912109375);
});

test('read-only HD fixtures preserve all 15 physical joints including mouth and carry no hardware claim', () => {
  const fixture = profile.createReferenceFixture(jointModel.metadata);
  assert.deepEqual(fixture.rows.map(row => row.id), jointModel.metadata.map(row => row.id));
  assert.equal(fixture.rows.at(-1).id, 34);
  assert.equal(fixture.origin, 'browser-hd-reference-fixture');
  assert.equal(fixture.fake, true);
  assert.equal(fixture.simulated, false);
  assert.equal(fixture.calibrationVersion, null);
  for (const row of fixture.rows) {
    assert.equal(profile.referencePosition(row.value, row).valid, true);
    assert.equal(profile.referencePosition(row.goal, row).valid, true);
    assert.equal(row.sampleOnly, true);
    assert.equal(row.hardwareConfirmed, false);
    assert.equal(row.calibration, null);
    assert.equal(row.actualAngleDeg, null);
    assert.equal(row.current, null);
    assert.equal(row.volt, null);
    assert.equal(row.sampledAtUnix, null);
    assert.ok(Object.isFrozen(row));
  }
  assert.ok(Object.isFrozen(fixture));
  assert.ok(Object.isFrozen(fixture.rows));
});

test('parameter catalogue retains unknown register, coefficient and firmware ranges as null', () => {
  for (const field of profile.fields) {
    assert.equal(field.verified, false);
    assert.equal(field.registerAddress, null);
    assert.equal(field.physicalUnit, null);
    assert.equal(field.min, null);
    assert.equal(field.max, null);
    assert.equal(field.defaultValue, null);
    assert.equal(field.validationScope, 'local-draft-shape-only');
  }
});

test('draft state and selections are isolated from feedback, motion drafts and returned copies', () => {
  const motorStore = jointModel.createStore();
  const original = motorStore.snapshot();
  const store = profile.createDraftStore(jointModel.metadata);
  assert.deepEqual(store.selectedIds(), profile.defaultIds);
  assert.equal(store.select([23, 34]).valid, true);
  assert.deepEqual(store.selectedIds(), [23, 34]);
  const patch = Object.freeze({ speedRaw: 400, accelerationRaw: 15 });
  const result = store.setParameters(23, patch);
  assert.equal(result.valid, true);
  assert.equal(result.changed, true);
  assert.equal(store.get(23).version, 1);
  assert.deepEqual(result.changes, [
    { field: 'speedRaw', before: null, after: 400 },
    { field: 'accelerationRaw', before: null, after: 15 }
  ]);
  const exposed = store.get(23);
  exposed.parameters.speedRaw = 999;
  exposed.hardwareConfirmed = true;
  assert.equal(store.get(23).parameters.speedRaw, 400);
  assert.equal(store.get(23).hardwareConfirmed, false);
  store.setCalibration(23, calibration);
  assert.deepEqual(motorStore.snapshot(), original);
  assert.deepEqual(patch, { speedRaw: 400, accelerationRaw: 15 });
  assert.equal(store.get(23).calibration.zeroCounts, 2048);
  assert.equal(store.get(34).calibration.zeroCounts, null);
});

test('batch preview lists per-joint changes and application changes only independently selected local drafts', () => {
  const store = profile.createDraftStore();
  store.select([20, 21]);
  store.setParameters(21, { speedRaw: 20 });
  const before = store.snapshot();
  const preview = store.previewBatch('parameters', { speedRaw: 20 });
  assert.equal(preview.valid, true);
  assert.equal(preview.applied, false);
  assert.deepEqual(preview.results.map(row => [row.id, row.changed]), [[20, true], [21, false]]);
  assert.deepEqual(store.snapshot(), before);
  const applied = store.applyBatch('parameters', { speedRaw: 20 });
  assert.equal(applied.applied, true);
  assert.equal(store.get(20).parameters.speedRaw, 20);
  assert.equal(store.get(21).parameters.speedRaw, 20);
  assert.equal(store.get(22).parameters.speedRaw, null);
  assert.equal(store.get(21).version, 1);
  assert.equal(store.select([999]).valid, false);
  assert.deepEqual(store.selectedIds(), [20, 21]);
});

test('batch edits validate all rows before mutation and retain honest per-joint errors', () => {
  const store = profile.createDraftStore([20, 21]);
  store.setCalibration(20, { minDeg: -10, maxDeg: 10, referenceDeg: 0 });
  store.setCalibration(21, { minDeg: -90, maxDeg: 90, referenceDeg: 0 });
  const before = store.snapshot();
  const report = store.applyBatch('calibration', { referenceDeg: 20 });
  assert.equal(report.valid, false);
  assert.equal(report.applied, false);
  assert.equal(report.results[0].valid, false);
  assert.equal(report.results[1].valid, true);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(store.applyBatch('parameters', { speedRaw: 1 }, [20, 20]).valid, false);
  store.select([]);
  assert.equal(store.previewBatch('parameters', { speedRaw: 1 }).valid, false);
});

test('draft updates reject unbounded numbers, unexpected keys, inherited objects and getters', () => {
  const store = profile.createDraftStore([20]);
  const before = store.snapshot();
  const invalid = [
    { speedRaw: Infinity }, { speedRaw: NaN }, { speedRaw: 1.5 }, { speedRaw: '20' },
    { accelerationRaw: -1 }, { speedRaw: 1000000001 }, { resolution: 0 }, { baudRate: 0 },
    { address: 42 }, { speedRaw: { value: 20 } }, { hardwareConfirmed: true },
    Object.create({ speedRaw: 20 }), JSON.parse('{"__proto__":{"polluted":true}}')
  ];
  for (const patch of invalid) assert.equal(store.setParameters(20, patch).valid, false);
  const accessor = {};
  let accessed = false;
  Object.defineProperty(accessor, 'speedRaw', { enumerable: true, get() { accessed = true; return 20; } });
  assert.equal(store.setParameters(20, accessor).valid, false);
  assert.equal(accessed, false);
  assert.equal(store.setCalibration(20, { direction: 0 }).valid, false);
  assert.equal(store.setCalibration(20, { zeroCounts: 4096 }).valid, false);
  assert.equal(store.setCalibration(20, { minDeg: 10, maxDeg: -10 }).valid, false);
  assert.deepEqual(store.snapshot(), before);
  assert.equal({}.polluted, undefined);
});

test('raw speed drafts retain signed values without asserting an unverified physical coefficient', () => {
  const store = profile.createDraftStore([20]);
  assert.equal(store.setParameters(20, { speedRaw: -400 }).valid, true);
  assert.equal(store.get(20).parameters.speedRaw, -400);
  const before = store.snapshot();
  for (const speedRaw of [-1000000001, -0.5, -Infinity, NaN, '-400']) {
    assert.equal(store.setParameters(20, { speedRaw }).valid, false);
    assert.deepEqual(store.snapshot(), before);
  }
  const speedField = profile.fields.find(field => field.key === 'speedRaw');
  assert.equal(speedField.unit, 'raw');
  assert.equal(speedField.physicalUnit, null);
  assert.equal(speedField.verified, false);
  assert.equal(speedField.min, null);
  assert.equal(speedField.max, null);
});

test('JSON round trip imports only local drafts, preserving independent selection and unverified status', () => {
  const source = profile.createDraftStore();
  source.setParameters(23, { speedRaw: 123, offsetRaw: -12 });
  source.setCalibration(23, calibration);
  const text = source.exportJSON();
  const target = profile.createDraftStore();
  target.select([34]);
  const result = target.importJSON(text);
  assert.equal(result.valid, true);
  assert.equal(result.applied, true);
  assert.equal(result.results.length, 15);
  assert.equal(target.get(23).parameters.speedRaw, 123);
  assert.deepEqual(target.get(23).calibration, calibration);
  assert.deepEqual(target.selectedIds(), [34]);
  assert.equal(target.get(23).hardwareConfirmed, false);
  assert.equal(target.get(23).sampleOnly, true);
  assert.equal(target.get(23).version, 1);
  const document = JSON.parse(text);
  assert.equal(document.format, 'hatchery-servo-drafts');
  assert.equal(document.version, 1);
  assert.equal(document.hardwareConfirmed, false);
  assert.equal(document.sampleOnly, true);
  assert.equal(document.profileId, profile.hd1910.id);
});

test('JSON import is atomic for malformed last rows, duplicate/unknown IDs and forged calibration claims', () => {
  const store = profile.createDraftStore();
  const pristine = store.snapshot();
  const base = JSON.parse(store.exportJSON());
  base.joints[0].parameters.speedRaw = 40;
  const cases = [];
  const changed = mutate => { const value = structuredClone(base); mutate(value); cases.push(JSON.stringify(value)); };
  changed(value => { value.joints.at(-1).calibration.direction = 0; });
  changed(value => { value.joints.at(-1).id = 20; });
  changed(value => { value.joints.at(-1).id = 99; });
  changed(value => { value.profileId = 'another-firmware'; });
  changed(value => { value.model = 'STS3215'; });
  changed(value => { value.version = 2; });
  changed(value => { value.hardwareConfirmed = true; });
  changed(value => { value.sampleOnly = false; });
  changed(value => { value.joints.at(-1).hardwareConfirmed = true; });
  changed(value => { value.joints.at(-1).parameters.speedRaw = '10'; });
  changed(value => { value.joints.at(-1).version = -1; });
  changed(value => { value.joints.at(-1).parameters = {}; });
  changed(value => { value.joints.at(-1).calibration = {}; });
  changed(value => { value.extra = 'unknown'; });
  cases.push('{bad JSON');
  cases.push(store.exportJSON().replace('"speedRaw": null', '"__proto__": {"polluted":true}, "speedRaw": null'));
  cases.push(store.exportJSON().replace('"referenceDeg": null', '"constructor": {}, "referenceDeg": null'));
  for (const text of cases) {
    const report = store.importJSON(text);
    assert.equal(report.valid, false);
    assert.equal(report.applied, false);
    assert.deepEqual(store.snapshot(), pristine);
  }
  assert.equal({}.polluted, undefined);
});

test('import limits actual UTF-8 bytes and constructors reject excessive or duplicated device identities', () => {
  const store = profile.createDraftStore();
  assert.equal(store.importJSON(' '.repeat(profile.maxImportBytes + 1)).valid, false);
  assert.equal(store.importJSON('汉'.repeat(Math.floor(profile.maxImportBytes / 3) + 1)).valid, false);
  assert.equal(store.importJSON('😀'.repeat(Math.floor(profile.maxImportBytes / 4) + 1)).valid, false);
  assert.equal(store.importJSON({}).valid, false);
  assert.throws(() => profile.createDraftStore([20, 20]), /重复/);
  assert.throws(() => profile.createDraftStore(['20']), /无效/);
  assert.throws(() => profile.createDraftStore([]), /非空/);
  assert.throws(() => profile.createDraftStore(Array.from({ length: 254 }, (_, index) => index)), /有界/);
});

test('UMD browser export creates no DOM, network, serial access or persistent calibration', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../prototype/servo-profile.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.window.ServoProfile.referencePosition, 'function');
  assert.equal(sandbox.window.ServoProfile.hd1910.model, 'HD-1910-C001');
  assert.equal(typeof sandbox.window.ServoProfile.createDraftStore, 'function');
  assert.equal(sandbox.window.ServoProfile.createDraftStore().get(23).hardwareConfirmed, false);
});
