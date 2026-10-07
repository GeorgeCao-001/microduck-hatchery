'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const JointDrafts = require('../prototype/joint-drafts.js');
const ViewerModel = require('../prototype/joint-viewer-model.js');
const displayIds = [20, 21, 22, 23, 24, 10, 11, 12, 13, 14, 30, 31, 32, 33, 34];
const row = (pose, id) => pose.joints.find(joint => joint.id === id);
const radians = degrees => degrees * Math.PI / 180;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12);

test('visual poses use all 15 metadata IDs in display order, including the policy-excluded mouth', () => {
  const pose = ViewerModel.poseFromStore(JointDrafts.createStore());
  assert.deepEqual(pose.joints.map(joint => joint.id), displayIds);
  assert.equal(row(pose, 34).raw, 'mouth');
  assert.deepEqual(pose.summary, { total: 15, available: 15, missing: 0, stale: 0 });
  assert.ok(pose.joints.every(joint => joint.available && joint.angle === 0));
  assert.equal(pose.source, 'sample');
  assert.equal(pose.sampleOnly, true);
  assert.equal(pose.unit, 'radians');
  assert.equal(pose.inputUnit, 'ticks');
  assert.equal(pose.calibrationVersion, null);
  assert.ok(pose.label.includes('不代表实机'));
});

test('invented ticks map around each fixture neutral point, not a 4096-tick hardware conversion', () => {
  const store = JointDrafts.createStore();
  store.setDraft(20, 0);
  store.setDraft(10, 255);
  store.setDraft(21, 64);
  store.setDraft(11, 192);
  store.setDraft(34, 0);
  let pose = ViewerModel.poseFromStore(store, 'draft');
  close(row(pose, 20).angle, radians(-45));
  close(row(pose, 10).angle, radians(45));
  close(row(pose, 21).angle, radians(-22.5));
  close(row(pose, 11).angle, radians(45 * 64 / 127));
  close(row(pose, 34).angle, radians(-20));
  store.setDraft(34, 127);
  pose = ViewerModel.poseFromStore(store, 'draft');
  close(row(pose, 34).angle, radians(20));
  assert.equal(ViewerModel.mapping.jointSpanDegrees < 60, true);
  assert.equal(ViewerModel.mapping.mouthSpanDegrees, 20);
});

test('invalid draft values remain unavailable instead of being coerced, clipped or interpreted as measured zero', () => {
  const store = JointDrafts.createStore();
  ['', '128', 'bad', null, undefined, NaN, Infinity, -1, 256, 12.5].forEach(value => {
    store.setDraft(23, value);
    const pose = ViewerModel.poseFromStore(store, 'draft');
    const knee = row(pose, 23);
    assert.equal(knee.available, false);
    assert.equal(knee.angle, null);
    assert.equal(knee.referenceAngle, 0);
    assert.equal(knee.referenceOnly, true);
    assert.ok(knee.reason);
    assert.equal(pose.summary.missing, 1);
    assert.equal(store.getDraft(23).value, value);
  });
});

test('feedback visualizes only available sample measurements and never fills 14 missing joints with measured zero', () => {
  const store = JointDrafts.createStore();
  const pose = ViewerModel.poseFromStore(store, 'feedback', 'readonly');
  assert.deepEqual(pose.summary, { total: 15, available: 1, missing: 14, stale: 0 });
  close(row(pose, 23).angle, radians(-45 * 2 / 128));
  pose.joints.filter(joint => joint.id !== 23).forEach(joint => {
    assert.equal(joint.angle, null);
    assert.equal(joint.available, false);
    assert.equal(joint.referenceOnly, true);
    assert.ok(joint.reason);
  });
  assert.equal(row(pose, 34).angle, null);
});

test('fractional feedback is displayable, but out-of-fixture feedback remains unknown without clipping', () => {
  const store = JointDrafts.createStore();
  store.updateSampleFeedback({ source: 'sample', sampleOnly: true, id: 23, t: 1, actual: 127.25 });
  let knee = row(ViewerModel.poseFromStore(store, 'feedback'), 23);
  assert.equal(knee.available, true);
  close(knee.angle, radians(-45 * 0.75 / 128));
  store.updateSampleFeedback({ source: 'sample', sampleOnly: true, id: 23, t: 2, actual: 512 });
  knee = row(ViewerModel.poseFromStore(store, 'feedback'), 23);
  assert.equal(knee.available, false);
  assert.equal(knee.angle, null);
  assert.equal(knee.value, 512);
  assert.ok(knee.reason.includes('未裁剪'));
  assert.equal(store.getFeedback(23).value, 512);
});

test('stale feedback is explicitly marked, offline is unknown, and local drafts remain usable offline', () => {
  const store = JointDrafts.createStore();
  let pose = ViewerModel.poseFromStore(store, 'feedback', 'stale');
  assert.equal(row(pose, 23).available, true);
  assert.equal(row(pose, 23).stale, true);
  assert.ok(row(pose, 23).reason.includes('不代表当前实测'));
  assert.equal(pose.summary.stale, 1);
  pose = ViewerModel.poseFromStore(store, 'feedback', 'offline');
  assert.deepEqual(pose.summary, { total: 15, available: 0, missing: 15, stale: 0 });
  assert.ok(pose.joints.every(joint => joint.angle === null));
  pose = ViewerModel.poseFromStore(store, 'draft', 'offline');
  assert.equal(pose.summary.available, 15);
});

test('real, fake, missing source flags and wrong units cannot use the UI sample angle mapping', () => {
  const original = JointDrafts.createStore();
  const mutations = [
    { source: 'robot' }, { source: 'fake' }, { source: undefined },
    { sampleOnly: false }, { sampleOnly: 'true' }, { sampleOnly: undefined },
    { unit: 'degrees' }, { unit: 'radians' }
  ];
  mutations.forEach(mutation => {
    const store = { getFeedback: (id, state) => ({ ...original.getFeedback(id, state), ...mutation }) };
    const knee = row(ViewerModel.poseFromStore(store, 'feedback'), 23);
    assert.equal(knee.angle, null);
    assert.equal(knee.available, false);
    assert.ok(knee.reason);
  });
});

test('invalid mode, state and reader contracts fail before attempting a pose conversion', () => {
  const store = JointDrafts.createStore();
  ['actual', 'robot', null, ''].forEach(mode => assert.throws(() => ViewerModel.poseFromStore(store, mode), RangeError));
  ['connected', null, ''].forEach(state => assert.throws(() => ViewerModel.poseFromStore(store, 'feedback', state), RangeError));
  assert.throws(() => ViewerModel.poseFromStore(null), TypeError);
  assert.throws(() => ViewerModel.poseFromStore({ getDraft: 1 }), TypeError);
  assert.throws(() => ViewerModel.poseFromStore(store, 'feedback', 'readonly-extra'), RangeError);
  assert.equal(ViewerModel.poseFromStore(store, 'feedback', 'read-only').summary.available, 1);
});

test('viewing or mutating returned visual poses cannot change drafts, feedback, selection or batch results', () => {
  const store = JointDrafts.createStore();
  store.setDraft(23, 149);
  store.setSelection('right');
  store.previewApply('example');
  const before = store.snapshot();
  ['draft', 'feedback'].forEach(mode => ['example', 'readonly', 'stale', 'offline'].forEach(state => {
    const pose = ViewerModel.poseFromStore(store, mode, state);
    pose.joints[0].angle = 999;
    pose.joints[0].value = 0;
    pose.joints.length = 0;
    pose.summary.available = 999;
    assert.deepEqual(store.snapshot(), before);
  }));
  assert.equal(ViewerModel.poseFromStore(store).joints.length, 15);
});
