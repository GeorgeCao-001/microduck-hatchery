'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Charts = require('../prototype/joint-charts.js');
const frame = (t, changes = {}) => Object.assign({ id: 23, t, source: 'sample', sampleOnly: true, actual: 126, goal: 128, load: null, temp: 32, volt: 7.8 }, changes);

test('ring buffers remain bounded per joint and retain chronological sample frames', () => {
  const buffer = Charts.createBuffer(3);
  for (let t = 0; t < 8; t += 1) assert.equal(buffer.push(frame(t)), true);
  assert.deepEqual(buffer.frames([23]).map(item => item.t), [5, 6, 7]);
  for (let t = 0; t < 4; t += 1) buffer.push(frame(t, { id: 34, actual: null, goal: null }));
  assert.equal(buffer.frames().length, 6);
  assert.equal(buffer.latestTime(), 7);
  assert.throws(() => Charts.createBuffer(1), RangeError);
});

test('buffer rejects invalid or duplicate time and non-sample frames without losing valid data', () => {
  const buffer = Charts.createBuffer(3);
  assert.equal(buffer.push(frame(1)), true);
  assert.equal(buffer.push(frame(1)), false);
  assert.equal(buffer.push(frame(0)), false);
  assert.equal(buffer.push(frame(2, { source: 'device' })), false);
  assert.equal(buffer.push(frame(2, { id: 999 })), false);
  assert.equal(buffer.push(frame(2, { actual: NaN })), false);
  assert.equal(buffer.frames().length, 1);
  const copy = buffer.frames();
  copy[0].actual = 9;
  assert.equal(buffer.frames()[0].actual, 126);
});

test('relative clock uses elapsed monotonic time and never reverses', () => {
  const times = [10000, 10200, 10100, 10400, NaN];
  const clock = Charts.createRelativeClock(() => times.shift());
  assert.deepEqual([clock(), clock(), clock(), clock()], [0.2, 0.2, 0.4, 0.4]);
});

test('continuous samples preserve source marker and the existing knee-only units', () => {
  const first = Charts.sampleFrame(0, 'example');
  const second = Charts.sampleFrame(2, 'readonly');
  assert.equal(first.id, 23);
  assert.equal(first.goal, 120);
  assert.equal(second.goal, 128);
  assert.ok(second.actual > 120 && second.actual < 129);
  assert.deepEqual([first.temp, first.volt, first.load, first.source, first.sampleOnly], [32, 7.8, null, 'sample', true]);
  assert.equal(Charts.channels.load.unit, 'raw load');
  assert.equal(Charts.channels.position.unit, 'ticks');
  assert.equal(Charts.channels.temp.unit, '°C');
  assert.equal(Charts.channels.volt.unit, 'V');
});

test('offline, stale and unknown states create explicit missing frames', () => {
  for (const state of ['offline', 'stale', 'unknown']) {
    const current = Charts.sampleFrame(1, state);
    assert.deepEqual([current.actual, current.goal, current.temp, current.volt, current.load], [null, null, null, null, null]);
  }
  assert.throws(() => Charts.sampleFrame(-1), RangeError);
});

test('tracking error comes from actual minus goal readback and never from draft values', () => {
  const points = Charts.seriesFor([frame(0, { draft: 250 }), frame(0.2, { actual: 0, goal: 0 }), frame(0.4, { actual: null })], 23, 'error', 0, 1);
  assert.deepEqual(points.map(point => point.value), [-2, 0, null]);
  assert.deepEqual(Charts.seriesFor([frame(0)], 34, 'actual', 0, 1), []);
});

test('SVG paths break at null data and acquisition gaps instead of connecting across them', () => {
  const points = [
    { t: 0, value: 1 }, { t: 0.2, value: 2 }, { t: 0.4, value: null },
    { t: 0.6, value: 3 }, { t: 0.8, value: 4 }, { t: 2, value: 5 }
  ];
  const path = Charts.pathFor(points, t => t * 10, value => value * 10);
  assert.equal(path, 'M0.00,10.00L2.00,20.00M6.00,30.00L8.00,40.00M20.00,50.00');
  assert.equal(Charts.pathFor([{ t: 0, value: 0 }, { t: 0.2, value: 2 }], t => t, value => value, 0.65, true), 'M0.00,0.00H0.20V2.00');
});

test('flat constant samples retain a readable unit-specific axis extent', () => {
  assert.deepEqual(Charts.extentFor([{ points: [{ value: 7.8 }] }], 'volt'), [7.6, 8]);
  assert.deepEqual(Charts.extentFor([{ points: [{ value: 32 }] }], 'temp'), [31, 33]);
  assert.equal(Charts.extentFor([{ points: [{ value: null }] }], 'load'), null);
});

test('context focus does not replace independently selected curves or visible channels', () => {
  const initial = Charts.snapshot();
  Charts.setContext({ jointId: 34, state: 'offline' });
  const changed = Charts.snapshot();
  assert.equal(changed.focusedJointId, 34);
  assert.deepEqual(changed.visibleJointIds, initial.visibleJointIds);
  assert.deepEqual(changed.channels, ['position', 'error']);
  assert.equal(changed.running, false);
});

test('render lists all 15 physical joints, independent channel selectors and missing-data markers', () => {
  const html = Charts.render({ jointId: 23, state: 'example' });
  assert.equal((html.match(/data-chart-joint="/g) || []).length, 15);
  assert.match(html, /data-chart-joint="34"/);
  assert.equal((html.match(/data-chart-channel="/g) || []).length, 5);
  assert.match(html, /独立于草稿应用范围/);
  assert.match(html, /目标草稿不会代替目标回读/);
  assert.match(html, /浏览器生成样例/);
  assert.match(html, /暂无可绘制数据/);
  assert.match(html, /不是设备 Unix 时间/);
  assert.match(html, /<details class="chart-selection-tools" >/);
  assert.match(html, /曲线显示设置 · 1 个关节 · 2 项数据/);
  assert.equal(Charts.snapshot().selectionExpanded, false);
});
