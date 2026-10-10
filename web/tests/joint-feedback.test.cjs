'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../prototype/joint-drafts.js');
const profiles = require('../prototype/servo-profile.js');
const feedback = require('../prototype/joint-feedback.js');

function fixtureWithFrame(changes) {
  const fixture = JSON.parse(JSON.stringify(profiles.createReferenceFixture(model.metadata)));
  fixture.rows[0] = { ...fixture.rows[0], value: 2048, goal: 4095, ...changes };
  return fixture;
}

function csvRecord(csv) {
  const lines = csv.trimEnd().split('\r\n');
  const values = Array.from(lines[1].matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g), match => (match[1] ?? match[2]).replace(/""/g, '"'));
  return Object.fromEntries(lines[0].split(',').map((name, index) => [name, values[index]]));
}

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
    assert.equal(row.unit, 'ticks');
    assert.equal(row.profileId, null);
    assert.equal(row.encoderAngle, null);
    assert.equal(row.centerAngle, null);
    assert.equal(row.goalEncoderAngle, null);
    assert.equal(row.actualAngle, null);
    assert.equal(row.goalAngle, null);
    assert.equal(row.calibrationStatus, 'unknown');
    assert.equal(row.fake, true);
    assert.equal(row.simulated, false);
    assert.equal(row.hardwareConfirmed, false);
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

test('explicit HD counts fixture shows nominal references without claiming physical calibration', () => {
  const rows = feedback.rowsFor(model.createStore(), 'example', fixtureWithFrame({
    calibration: { zeroCounts: 2048, direction: 1, confirmed: true },
    actualAngleDeg: 0, goalAngleDeg: 179.912109375
  }));
  assert.deepEqual(rows.map(row => row.id), model.metadata.map(joint => joint.id));
  const row = rows[0];
  assert.equal(row.source, 'browser-hd-reference-fixture');
  assert.equal(row.state, 'reference');
  assert.equal(row.profileId, profiles.hd1910.id);
  assert.equal(row.unit, 'counts');
  assert.equal(row.rawPos, 2048);
  assert.equal(row.rawGoal, 4095);
  assert.equal(row.encoderAngle, 180);
  assert.equal(row.centerAngle, 0);
  assert.equal(row.goalEncoderAngle, 359.912109375);
  assert.equal(row.goalCenterAngle, 179.912109375);
  assert.equal(row.angle, null);
  assert.equal(row.actualAngle, null);
  assert.equal(row.goalAngle, null);
  assert.equal(row.zero, null);
  assert.equal(row.min, null);
  assert.equal(row.max, null);
  assert.equal(row.calibrationStatus, 'unknown');
  assert.equal(row.calibrationVersion, null);
  assert.match(row.angleReason, /参考角不是实际关节角/);
  assert.equal(row.fake, true);
  assert.equal(row.hardwareConfirmed, false);
});

test('HD reference conversion requires an explicit matching unit, profile, resolution and single-turn mode per row', () => {
  const cases = [
    { profileId: undefined }, { profileId: 'unknown-model' },
    { unit: undefined }, { unit: 'ticks' },
    { resolutionConfirmed: undefined }, { resolutionConfirmed: false },
    { singleTurn: undefined }, { singleTurn: false }
  ];
  for (const changes of cases) {
    const row = feedback.rowsFor(model.createStore(), 'example', fixtureWithFrame(changes))[0];
    assert.equal(row.rawPos, 2048, JSON.stringify(changes));
    for (const key of ['encoderAngle', 'centerAngle', 'goalEncoderAngle', 'goalCenterAngle', 'actualAngle', 'goalAngle']) {
      assert.equal(row[key], null, key + ' ' + JSON.stringify(changes));
    }
    assert.ok(row.referenceReason);
  }
});

test('raw out-of-range or multi-turn values remain visible but cannot masquerade as single-turn angles', () => {
  for (const value of [-1, 4096, 8192, 2048.5]) {
    const row = feedback.rowsFor(model.createStore(), 'example', fixtureWithFrame({ value, goal: value }))[0];
    assert.equal(row.rawPos, value);
    assert.equal(row.rawGoal, value);
    assert.equal(row.encoderAngle, null);
    assert.equal(row.centerAngle, null);
    assert.equal(row.goalEncoderAngle, null);
    assert.equal(row.actualAngle, null);
    assert.ok(row.referenceReason);
  }
});

test('missing current position does not hide an independently valid target reference or reuse its reason', () => {
  const row = feedback.rowsFor(model.createStore(), 'example', fixtureWithFrame({ value: null, goal: 2048 }))[0];
  assert.equal(row.state, 'missing');
  assert.equal(row.encoderAngle, null);
  assert.equal(row.goalEncoderAngle, 180);
  assert.equal(row.goalCenterAngle, 0);
  assert.ok(row.referenceReason);
  assert.equal(row.goalReferenceReason, '');
  const record = csvRecord(feedback.toCsv([row]));
  assert.ok(record.reference_reason);
  assert.equal(record.goal_reference_reason, '');
});

test('malformed, duplicate or unknown fixture rows are rejected rather than bound to a physical joint', () => {
  const alterations = [
    rows => { rows.push({ ...rows[0] }); },
    rows => { rows[0].id = 99; },
    rows => { rows[0] = null; },
    rows => { rows[0] = []; },
    rows => { rows[0].id = '20'; }
  ];
  for (const alter of alterations) {
    const fixture = fixtureWithFrame({});
    alter(fixture.rows);
    const rows = feedback.rowsFor(model.createStore(), 'example', fixture);
    assert.equal(rows.length, 15);
    for (const row of rows) {
      assert.equal(row.state, 'missing');
      assert.equal(row.rawPos, null);
      assert.equal(row.encoderAngle, null);
    }
  }
});

test('independent HD inspection and filtering do not change old drafts, application scope or sample feedback', () => {
  const store = model.createStore();
  store.setDraft(20, 200);
  store.setSelection('right');
  const before = store.snapshot();
  const rows = feedback.rowsFor(store, 'example', profiles.createReferenceFixture(model.metadata));
  assert.equal(rows.filter(row => feedback.matches(row, 'left', '')).length, 5);
  feedback.toCsv(rows.filter(row => feedback.matches(row, 'head', 'mouth')));
  assert.deepEqual(store.snapshot(), before);
  const original = feedback.rowsFor(store, 'example');
  assert.equal(original[0].rawPos, null);
  assert.equal(original.find(row => row.id === 23).rawPos, 126);
  assert.equal(original.find(row => row.id === 23).encoderAngle, null);
});

test('CSV retains legacy columns and explicitly identifies raw units, nominal angles and unknown calibration', () => {
  const row = feedback.rowsFor(model.createStore(), 'example', fixtureWithFrame({}))[0];
  const csv = feedback.toCsv([row]);
  assert.match(csv, /^sample,source,id,joint,feedback_state,actual_ticks,goal_readback_ticks,error_ticks,raw_load,voltage_v,temperature_c,actual_angle_deg,zero_ticks,physical_min_deg,physical_max_deg,enabled,/);
  const record = csvRecord(csv);
  assert.equal(record.actual_ticks, '2048');
  assert.equal(record.raw_position, '2048');
  assert.equal(record.raw_goal_readback, '4095');
  assert.equal(record.raw_unit, 'counts');
  assert.equal(record.profile_id, profiles.hd1910.id);
  assert.equal(record.encoder_reference_deg, '180');
  assert.equal(record.center_reference_deg, '0');
  assert.equal(record.actual_angle_deg, '');
  assert.equal(record.actual_joint_angle_deg, '');
  assert.equal(record.goal_joint_angle_deg, '');
  assert.equal(record.calibration_status, 'unknown');
  assert.equal(record.fake, 'true');
  assert.equal(record.simulated, 'false');
  assert.equal(record.hardware_confirmed, 'false');
  assert.match(record.angle_reason, /实际关节角/);
});

test('offline HD snapshots have no counts or reference angles, and non-sample fixtures are rejected', () => {
  const fixture = fixtureWithFrame({});
  const offline = feedback.rowsFor(model.createStore(), 'offline', fixture);
  for (const row of offline) {
    assert.equal(row.state, 'offline');
    for (const key of ['rawPos', 'rawGoal', 'error', 'encoderAngle', 'centerAngle', 'goalEncoderAngle', 'load', 'volt', 'temp']) assert.equal(row[key], null);
  }
  const stale = feedback.rowsFor(model.createStore(), 'stale', fixture)[0];
  assert.equal(stale.state, 'stale');
  assert.equal(stale.encoderAngle, 180);
  const notSample = feedback.rowsFor(model.createStore(), 'example', { ...fixture, hardwareConfirmed: true, fake: false });
  assert.equal(notSample[0].state, 'missing');
  assert.equal(notSample[0].rawPos, null);
  assert.equal(notSample[0].encoderAngle, null);
  const unmarkedRow = feedback.rowsFor(model.createStore(), 'example', fixtureWithFrame({ fake: undefined }))[0];
  assert.equal(unmarkedRow.state, 'missing');
  assert.equal(unmarkedRow.rawPos, null);
  assert.equal(unmarkedRow.encoderAngle, null);
});

test('feedback table starts with original sample units and offers an independent, clearly labelled HD preview', () => {
  const html = feedback.render({ store: model.createStore(), state: 'example', jointId: 23 });
  assert.match(html, /data-feedback-reference >HD counts 参考样例/);
  assert.doesNotMatch(html, /data-feedback-reference checked/);
  assert.match(html, /原交互样例 ticks · 与 HD counts 无关/);
  assert.match(html, /编码器参考/);
  assert.match(html, /实际关节/);
  assert.equal(feedback.snapshot().referenceMode, false);
});
