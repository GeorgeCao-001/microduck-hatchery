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

test('curve mounting never owns acquisition and unmount preserves paused settings and growing history', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  let time = 0, scheduled = 0, cancelled = 0, tick;
  const window = { JointDrafts: require('../prototype/joint-drafts.js') };
  const environment = { window, performance: { now: () => time },
    setInterval(callback) { tick = callback; scheduled++; return 0; },
    clearInterval() { cancelled++; } };
  for (const name of ['joint-session.js', 'joint-charts.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../prototype', name), 'utf8'), environment);
  }
  const charts = window.JointCharts, session = window.JointSession;
  function panel() {
    const handlers = {}, plots = { innerHTML: '', getBoundingClientRect: () => ({ width: 1000 }) };
    const settings = { open: false };
    const elements = { '[data-chart-plots]': plots, '.chart-selection-tools': settings,
      '[data-chart-relative-time]': {}, '[data-chart-source-status]': {},
      '[data-chart-count]': {}, '[data-chart-selection-summary]': {}, '[data-chart-follow]': {} };
    return { handlers, elements, isConnected: true,
      querySelector: selector => elements[selector] || null, querySelectorAll: () => [], contains: () => true,
      addEventListener: (name, handler) => { handlers[name] = handler; },
      removeEventListener: name => { delete handlers[name]; } };
  }
  const first = panel();
  assert.equal(charts.mount({ container: first }), true);
  assert.equal(scheduled, 0);
  charts.setContext({ state: 'offline' });
  assert.equal(session.snapshot().state, 'example');
  session.start({ state: 'example' });
  assert.equal(scheduled, 1);
  const change = (dataset, value, checked = true) => first.handlers.change({ target: {
    dataset, value, checked, matches: selector => selector === (dataset.chartJoint
      ? '[data-chart-joint]' : dataset.chartChannel ? '[data-chart-channel]' : '[data-chart-window]')
  } });
  change({ chartJoint: '34' });
  change({ chartChannel: 'volt' });
  change({}, '30');
  const pause = { textContent: '', matches: selector => selector === '[data-chart-pause]' };
  first.handlers.click({ target: { closest: () => pause } });
  first.elements['.chart-selection-tools'].open = true;
  const before = charts.snapshot();
  charts.unmount();
  assert.equal(cancelled, 0);
  assert.equal(session.snapshot().running, true);
  assert.equal(Object.keys(first.handlers).length, 0);
  time = 3000; tick();
  const html = charts.render({ state: 'example' });
  assert.match(html, /恢复显示/);
  assert.match(html, /data-chart-joint="34" checked/);
  assert.match(html, /data-chart-channel="volt" checked/);
  assert.match(html, /value="30" selected/);
  assert.match(html, /<details class="chart-selection-tools" open>/);
  const second = panel();
  charts.mount({ container: second, state: 'example' });
  const after = charts.snapshot();
  assert.deepEqual(Array.from(after.visibleJointIds), Array.from(before.visibleJointIds));
  assert.deepEqual(Array.from(after.channels), Array.from(before.channels));
  assert.equal(after.paused, true);
  assert.equal(after.frames.at(-1).t, 3);
  assert.equal(second.elements['[data-chart-relative-time]'].textContent, '0.0 s');
  second.handlers.click({ target: { closest: () => pause } });
  assert.equal(charts.snapshot().paused, false);
  time = 3200; tick();
  assert.equal(second.elements['[data-chart-relative-time]'].textContent, '3.2 s');
  charts.unmount();
  session.stop();
  assert.equal(cancelled, 1);
});
