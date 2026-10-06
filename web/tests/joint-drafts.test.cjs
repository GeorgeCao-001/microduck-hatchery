'use strict';

// Run with Node's built-in test runner; no DOM, network or hardware is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const JointDrafts = require('../prototype/joint-drafts.js');
const expectedDisplay = [20, 21, 22, 23, 24, 10, 11, 12, 13, 14, 30, 31, 32, 33, 34];
const expectedRuntime = [20, 21, 22, 23, 24, 30, 31, 32, 33, 34, 10, 11, 12, 13, 14];
const expectedPolicy = [20, 21, 22, 23, 24, 30, 31, 32, 33, 10, 11, 12, 13, 14];
const clone = value => JSON.parse(JSON.stringify(value));

test('15 physical joints have independent display, runtime and policy mappings', () => {
  const rows = JointDrafts.metadata;
  assert.equal(rows.length, 15);
  assert.equal(new Set(rows.map(row => row.id)).size, 15);
  assert.deepEqual(rows.map(row => row.id), expectedDisplay);
  assert.deepEqual(rows.map(row => row.displayOrder), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.deepEqual([...rows].sort((a, b) => a.runtimeIndex - b.runtimeIndex).map(row => row.id), expectedRuntime);
  assert.deepEqual(rows.filter(row => row.policyIndex !== null).sort((a, b) => a.policyIndex - b.policyIndex).map(row => row.id), expectedPolicy);
  assert.equal(rows.find(row => row.id === 34).policyIndex, null);
  assert.equal(rows.find(row => row.id === 34).name, '嘴部');
});

test('UI ranges are marked as samples while real calibration and limits stay unknown', () => {
  assert.equal(JointDrafts.sampleConfig.source, 'sample');
  assert.equal(JointDrafts.sampleConfig.sampleOnly, true);
  assert.equal(JointDrafts.sampleConfig.unit, 'ticks');
  JointDrafts.metadata.forEach(row => {
    assert.equal(row.calibration, null);
    assert.equal(row.physicalRange, null);
    assert.notDeepEqual(
      [JointDrafts.sampleConfig.ranges[row.id].min, JointDrafts.sampleConfig.ranges[row.id].max],
      [112, 136]
    );
  });
  assert.throws(() => { JointDrafts.metadata[0].runtimeIndex = 10; }, TypeError);
});

test('only the existing left-knee sample has feedback, never fabricated values for 14 others', () => {
  const store = JointDrafts.createStore();
  const knee = store.getFeedback(23);
  assert.deepEqual([knee.value, knee.goal, knee.temp, knee.volt], [126, 128, 32, 7.8]);
  assert.equal(knee.source, 'sample');
  assert.equal(knee.valid, true);
  JointDrafts.metadata.filter(row => row.id !== 23).forEach(row => {
    const feedback = store.getFeedback(row.id);
    assert.deepEqual([feedback.value, feedback.goal, feedback.temp, feedback.volt], [null, null, null, null]);
    assert.equal(feedback.available, false);
    assert.equal(feedback.valid, false);
  });
});

test('sample refresh and state changes do not overwrite an edited draft or edit version', () => {
  const store = JointDrafts.createStore();
  store.setDraft(23, 144);
  const before = store.getDraft(23);
  store.refreshSampleFeedback();
  ['offline', 'stale', 'readonly', 'example'].forEach(mode => store.getFeedback(23, mode));
  assert.deepEqual(store.getDraft(23), before);
  assert.equal(store.getFeedback(23).value, 126);
  store.setDraft(23, 144);
  assert.equal(store.getDraft(23).version, before.version);
  store.setDraft(23, 145);
  assert.equal(store.getDraft(23).version, before.version + 1);
});

test('scope selection includes all rows without conflating the right leg with runtime positions', () => {
  const store = JointDrafts.createStore();
  assert.deepEqual(store.selectedIds(), expectedDisplay);
  assert.deepEqual(store.setSelection('right'), [10, 11, 12, 13, 14]);
  assert.deepEqual(store.setSelection('head'), [30, 31, 32, 33, 34]);
  assert.deepEqual(store.setSelection('none'), []);
  store.select(34, true);
  store.select(23, true);
  assert.deepEqual(store.selectedIds(), [23, 34]);
  store.select(23, false);
  assert.deepEqual(store.selectedIds(), [34]);
  assert.equal(Object.keys(store.snapshot().drafts).length, 15);
});

test('filling selected fresh sample feedback reports every missing joint and touches no others', () => {
  const store = JointDrafts.createStore();
  store.setDraft(23, 145);
  store.setDraft(20, 150);
  const report = store.fillFromFeedback('readonly');
  assert.deepEqual(report.applied, [{ id: 23, value: 126 }]);
  assert.equal(report.skipped.length, 14);
  assert.ok(report.skipped.every(item => item.reason.includes('反馈')));
  assert.equal(store.getDraft(20).value, 150);
  assert.equal(store.getDraft(23).value, 126);
  assert.equal(store.snapshot().batchCount, 0);
  store.setSelection('right');
  const right = store.fillFromFeedback('example');
  assert.equal(right.applied.length, 0);
  assert.deepEqual(right.skipped.map(item => item.id), [10, 11, 12, 13, 14]);
});

test('offline, stale and unknown-state feedback are never filled into drafts', () => {
  ['offline', 'stale', 'unrecognized-mode'].forEach(mode => {
    const store = JointDrafts.createStore();
    store.setDraft(23, 150);
    store.setSelection('left');
    const before = store.snapshot().drafts;
    const report = store.fillFromFeedback(mode);
    assert.equal(report.applied.length, 0);
    assert.equal(report.skipped.length, 5);
    assert.deepEqual(store.snapshot().drafts, before);
    assert.equal(store.getFeedback(23, mode).valid, false);
  });
  const offline = JointDrafts.createStore().getFeedback(23, 'offline');
  assert.equal(offline.value, null);
  assert.equal(offline.available, false);
});

test('batch checking yields selected per-joint sample outcomes and never calls partial success complete', () => {
  const store = JointDrafts.createStore();
  store.setDraft(20, 999);
  const batch = store.previewApply('example');
  assert.deepEqual(batch.counts, { passed: 1, skipped: 13, failed: 1 });
  assert.deepEqual(batch.results.find(result => result.id === 23), {
    id: 23, status: 'passed', reason: '样例检查通过；未发送、未写入，也未确认到位', source: 'sample', sampleOnly: true
  });
  assert.equal(batch.results.find(result => result.id === 20).status, 'failed');
  assert.equal(batch.results.find(result => result.id === 34).status, 'skipped');
  assert.ok(batch.summary.includes('13 项跳过'));
  assert.ok(batch.summary.includes('1 项失败'));
  assert.ok(batch.summary.includes('未发送'));
  assert.equal(batch.summary.includes('成功'), false);
  assert.equal(batch.source, 'sample');
  assert.equal(batch.sampleOnly, true);
  assert.equal(store.snapshot().results[23].status, 'passed');
});

test('a batch owns its target/version snapshot even if targets or returned objects later change', () => {
  const store = JointDrafts.createStore();
  store.setSelection('none');
  store.select(23, true);
  store.setDraft(23, 140);
  const batch = store.previewApply('example');
  assert.deepEqual(batch.targets, [{ id: 23, value: 140, version: 1 }]);
  store.setDraft(23, 150);
  assert.deepEqual(batch.targets, [{ id: 23, value: 140, version: 1 }]);
  batch.targets[0].value = 1;
  batch.results[0].reason = 'mutated';
  assert.equal(store.snapshot().lastBatch.targets[0].value, 140);
  assert.notEqual(store.snapshot().results[23].reason, 'mutated');
});

test('invalid numeric edits stay visible and fail sample checks without implicit zero or clipping', () => {
  ['', ' ', '12x', NaN, Infinity, -1, 256, 12.5].forEach(value => {
    const store = JointDrafts.createStore();
    store.setSelection('none');
    store.select(23, true);
    const edit = store.setDraft(23, value);
    assert.equal(edit.valid, false);
    assert.ok(Object.is(edit.value, value));
    const batch = store.previewApply();
    assert.deepEqual(batch.counts, { passed: 0, skipped: 0, failed: 1 });
    assert.ok(Object.is(batch.targets[0].value, value));
  });
});

test('saving all joints and loading a compatible pose updates selected drafts only, never execution state', () => {
  const store = JointDrafts.createStore();
  store.setDraft(23, 140);
  store.setDraft(34, 60);
  const pose = store.savePose(' bench ');
  assert.equal(pose.name, 'bench');
  assert.equal(pose.targets.length, 15);
  assert.equal(pose.calibrationVersion, null);
  store.setDraft(23, 150);
  store.setDraft(34, 70);
  store.setSelection('none');
  store.select(23, true);
  store.previewApply();
  const before = store.snapshot();
  const report = store.loadPose(pose);
  assert.deepEqual(report.applied, [{ id: 23, value: 140 }]);
  assert.equal(report.skipped.length, 14);
  assert.ok(report.skipped.every(item => item.reason.includes('未选择')));
  assert.equal(store.getDraft(23).value, 140);
  assert.equal(store.getDraft(34).value, 70);
  const after = store.snapshot();
  assert.equal(after.batchCount, before.batchCount);
  assert.deepEqual(after.lastBatch, before.lastBatch);
  assert.deepEqual(after.results, before.results);
  assert.deepEqual(after.feedback, before.feedback);
  assert.deepEqual(after.selectedIds, before.selectedIds);
});

test('globally incompatible pose fields reject all entries atomically', () => {
  const mutations = [
    pose => { pose.version = 2; },
    pose => { pose.format = 'device-pose'; },
    pose => { pose.source = 'robot'; },
    pose => { pose.sampleOnly = false; },
    pose => { pose.unit = 'degrees'; },
    pose => { pose.mappingVersion = 'another-map'; },
    pose => { pose.calibrationVersion = 'real-calibration'; },
    pose => { delete pose.calibrationVersion; },
    pose => { pose.rangeVersion = 'another-range'; },
    pose => { pose.targets = {}; }
  ];
  mutations.forEach(mutate => {
    const store = JointDrafts.createStore();
    const pose = store.savePose();
    pose.targets[0].value = 160;
    mutate(pose);
    const before = store.snapshot();
    const report = store.loadPose(pose);
    assert.equal(report.applied.length, 0);
    assert.equal(report.skipped.length, 15);
    assert.deepEqual(store.snapshot(), before);
  });
});

test('per-joint pose mapping, missing fields and out-of-range targets are skipped without clipping', () => {
  const store = JointDrafts.createStore();
  const pose = store.savePose();
  pose.targets.find(target => target.id === 20).raw = 'right_hip_yaw';
  pose.targets.find(target => target.id === 21).runtimeIndex = 11;
  pose.targets.find(target => target.id === 22).policyIndex = 11;
  pose.targets.find(target => target.id === 23).value = 999;
  delete pose.targets.find(target => target.id === 34).policyIndex;
  pose.targets.find(target => target.id === 10).value = 150;
  const before = store.snapshot();
  const report = store.loadPose(pose);
  assert.deepEqual(report.skipped.map(item => item.id), [20, 21, 22, 23, 34]);
  assert.equal(report.applied.length, 10);
  [20, 21, 22, 23, 34].forEach(id => assert.deepEqual(store.snapshot().drafts[id], before.drafts[id]));
  assert.equal(store.getDraft(10).value, 150);
  assert.equal(store.snapshot().batchCount, 0);
});

test('duplicate or unknown pose IDs cannot alias another joint', () => {
  const store = JointDrafts.createStore();
  const pose = store.savePose();
  const duplicate = clone(pose.targets.find(target => target.id === 23));
  duplicate.value = 150;
  pose.targets.push(duplicate);
  pose.targets.push({ id: '23', raw: 'left_knee', runtimeIndex: 3, policyIndex: 3, value: 160 });
  pose.targets.push({ id: 200, value: 160 });
  const report = store.loadPose(pose);
  assert.equal(report.skipped.filter(item => item.id === 23).length, 2);
  assert.ok(report.skipped.some(item => item.id === '23'));
  assert.ok(report.skipped.some(item => item.id === 200));
  assert.equal(store.getDraft(23).value, 128);
});

test('missing calibration disables mirror without changing either leg target', () => {
  const store = JointDrafts.createStore();
  store.setDraft(20, 150);
  const before = store.snapshot();
  assert.equal(JointDrafts.mirrorAvailability.available, false);
  assert.ok(JointDrafts.mirrorAvailability.reason.includes('方向'));
  assert.ok(JointDrafts.mirrorAvailability.reason.includes('零位'));
  assert.deepEqual(store.snapshot(), before);
});

test('returned snapshots, feedback and saved poses cannot mutate internal layers', () => {
  const store = JointDrafts.createStore();
  const snapshot = store.snapshot();
  snapshot.drafts[23].value = 1;
  snapshot.feedback[23].value = 1;
  snapshot.selectedIds.length = 0;
  const feedback = store.getFeedback(23);
  feedback.value = 2;
  const pose = store.savePose();
  pose.targets.find(target => target.id === 23).value = 3;
  assert.equal(store.getDraft(23).value, 128);
  assert.equal(store.getFeedback(23).value, 126);
  assert.equal(store.selectedIds().length, 15);
});

test('sample frame arrivals update feedback without changing drafts, versions, selection or batch outcomes', () => {
  const store = JointDrafts.createStore();
  store.setDraft(23, 144);
  store.setSelection('left');
  store.previewApply('example');
  const before = store.snapshot();
  const report = store.updateSampleFeedback({
    source: 'sample', sampleOnly: true, id: 23, t: 0.2,
    actual: 127.25, goal: 128, temp: 32, volt: 7.8, load: null
  });
  assert.equal(report.accepted, true);
  assert.equal(report.id, 23);
  const feedback = store.getFeedback(23);
  assert.deepEqual([feedback.value, feedback.goal, feedback.temp, feedback.volt, feedback.load], [127.25, 128, 32, 7.8, null]);
  assert.equal(feedback.relativeSeconds, 0.2);
  assert.equal(feedback.source, 'sample');
  assert.equal(feedback.sampleOnly, true);
  const after = store.snapshot();
  ['drafts', 'selectedIds', 'results', 'lastBatch', 'batchCount'].forEach(key => {
    assert.deepEqual(after[key], before[key]);
  });
  JointDrafts.metadata.filter(row => row.id !== 23).forEach(row => {
    assert.deepEqual(after.feedback[row.id], before.feedback[row.id]);
  });
});

test('missing sample measurements remain null while valid zero and fractional feedback are preserved without clipping', () => {
  const store = JointDrafts.createStore();
  store.updateSampleFeedback({ source: 'sample', sampleOnly: true, id: 23, t: 0.4, actual: 0, goal: null, temp: 0 });
  let feedback = store.getFeedback(23);
  assert.deepEqual([feedback.value, feedback.goal, feedback.temp, feedback.volt, feedback.load], [0, null, 0, null, null]);
  assert.equal(feedback.valid, true);
  store.updateSampleFeedback({ source: 'sample', sampleOnly: true, id: 23, t: 0.6 });
  feedback = store.getFeedback(23);
  assert.deepEqual([feedback.value, feedback.goal, feedback.temp, feedback.volt, feedback.load], [null, null, null, null, null]);
  assert.equal(feedback.available, false);
  store.updateSampleFeedback({ source: 'sample', sampleOnly: true, id: 23, t: 0.8, actual: -5.25, load: 0 });
  assert.equal(store.getFeedback(23).value, -5.25);
  assert.equal(store.getFeedback(23).load, 0);
  assert.equal(store.getDraft(23).value, 128);
  assert.equal(store.getFeedback(23, 'offline').load, null);
});

test('sample frame metadata rejects absent, fake, real or unknown sources and malformed IDs or relative times', () => {
  const base = { source: 'sample', sampleOnly: true, id: 23, t: 1, actual: 127 };
  const badFrames = [null, [], {},
    ...['robot', 'fake', 'prototype-generated', 'unknown', undefined].map(source => ({ ...base, source })),
    ...[false, undefined, 'true'].map(sampleOnly => ({ ...base, sampleOnly })),
    ...[undefined, '23', 200, 23.5, NaN].map(id => ({ ...base, id })),
    ...[undefined, '1', -1, NaN, Infinity].map(t => ({ ...base, t }))
  ];
  const store = JointDrafts.createStore();
  const before = store.snapshot();
  badFrames.forEach(frame => {
    const report = store.updateSampleFeedback(frame);
    assert.equal(report.accepted, false);
    assert.ok(report.reason);
    assert.deepEqual(store.snapshot(), before);
  });
});

test('every sample measurement is validated before feedback can change', () => {
  const store = JointDrafts.createStore();
  const before = store.snapshot();
  ['actual', 'goal', 'temp', 'volt', 'load'].forEach(field => {
    [NaN, Infinity, -Infinity, '', '128', true, {}].forEach(value => {
      const frame = { source: 'sample', sampleOnly: true, id: 23, t: 1, actual: 127, [field]: value };
      assert.equal(store.updateSampleFeedback(frame).accepted, false);
      assert.deepEqual(store.snapshot(), before);
    });
  });
});

test('sample arrival time is explicitly browser-generated and returned feedback cannot mutate the store', () => {
  const store = JointDrafts.createStore();
  const start = Math.floor(Date.now() / 1000);
  const report = store.updateSampleFeedback({
    source: 'sample', sampleOnly: true, id: 23, t: 1, actual: 127,
    generatedAtUnix: 1, timeSource: 'hardware', calibrationVersion: 'calibrated'
  });
  const feedback = report.feedback;
  assert.equal(feedback.timeSource, 'browser-sample-generation');
  assert.equal(feedback.calibrationVersion, null);
  assert.ok(feedback.generatedAtUnix >= start);
  assert.ok(feedback.generatedAtUnix <= Math.floor(Date.now() / 1000));
  feedback.value = 1;
  assert.equal(store.getFeedback(23).value, 127);
});

test('streaming one sample joint and measurement gaps keep all 15 joints including the mouth', () => {
  const store = JointDrafts.createStore();
  store.updateSampleFeedback({ source: 'sample', sampleOnly: true, id: 23, t: 1, actual: 127 });
  store.updateSampleFeedback({ source: 'sample', sampleOnly: true, id: 23, t: 2, actual: null });
  const snapshot = store.snapshot();
  assert.equal(Object.keys(snapshot.feedback).length, 15);
  assert.equal(Object.keys(snapshot.drafts).length, 15);
  assert.deepEqual(snapshot.selectedIds, expectedDisplay);
  assert.equal(JointDrafts.metadata.find(row => row.id === 34).policyIndex, null);
  assert.equal(store.getFeedback(34).value, null);
  assert.equal(store.getFeedback(34).available, false);
  assert.equal(store.getDraft(34).value, 64);
});
