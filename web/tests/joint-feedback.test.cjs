'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../prototype/joint-drafts.js');
const feedback = require('../prototype/joint-feedback.js');

test('feedback inspection preserves every physical joint and never infers calibration', () => {
  const rows = feedback.rowsFor(model.createStore(), 'example');
  assert.deepEqual(rows.map(row => row.id), [20,21,22,23,24,10,11,12,13,14,30,31,32,33,34]);
  assert.equal(rows.find(row => row.id === 34).name, '嘴部');
  for (const row of rows) {
    assert.equal(row.angle, null);
    assert.equal(row.zero, null);
    assert.equal(row.min, null);
    assert.equal(row.max, null);
    assert.equal(row.enabled, null);
  }
});

test('readback error and CSV come from feedback, independently of the target draft', () => {
  const store = model.createStore();
  store.setDraft(23, 200);
  const row = feedback.rowsFor(store, 'example').find(row => row.id === 23);
  assert.equal(row.actual, 126);
  assert.equal(row.goal, 128);
  assert.equal(row.error, -2);
  assert.equal(row.load, null);
  const csv = feedback.toCsv([row]);
  assert.match(csv, /sample,source,id,joint,feedback_state,actual_ticks,goal_readback_ticks/);
  assert.match(csv, /"true","browser-sample","23","left_knee","sample","126","128","-2",,/);
  assert.doesNotMatch(csv, /"200"/);
  assert.equal(store.getDraft(23).value, 200);
});

test('offline snapshots omit old measurements while stale snapshots identify retained samples', () => {
  const store = model.createStore();
  const offline = feedback.rowsFor(store, 'offline');
  for (const row of offline) {
    assert.equal(row.state, 'offline');
    for (const key of ['actual','goal','error','load','volt','temp']) assert.equal(row[key], null);
  }
  const stale = feedback.rowsFor(store, 'stale').find(row => row.id === 23);
  assert.equal(stale.state, 'stale');
  assert.equal(stale.actual, 126);
  assert.match(feedback.toCsv([stale]), /"stale"/);
});

test('feedback filtering preserves display order and the independent application selection', () => {
  const store = model.createStore();
  store.setSelection('left');
  const rows = feedback.rowsFor(store, 'example');
  assert.deepEqual(rows.filter(row => feedback.matches(row, 'right', '')).map(row => row.id), [10,11,12,13,14]);
  assert.deepEqual(rows.filter(row => feedback.matches(row, 'head', 'mouth')).map(row => row.id), [34]);
  assert.deepEqual(rows.filter(row => feedback.matches(row, 'all', '23')).map(row => row.id), [23]);
  assert.deepEqual(store.selectedIds(), [20,21,22,23,24]);
});

test('CSV escapes textual cells and suppresses spreadsheet formula interpretation', () => {
  const row = feedback.rowsFor(model.createStore(), 'example')[0];
  const csv = feedback.toCsv([{ ...row, raw: '=SUM(1,2)"', error: -2 }]);
  assert.match(csv, /"'=SUM\(1,2\)"""/);
  assert.match(csv, /"-2"/);
});
