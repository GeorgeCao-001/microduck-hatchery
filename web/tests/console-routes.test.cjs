'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const workspace = require('../prototype/console-workspace.js');

test('legacy console links resolve to the joint page without changing its canonical key', () => {
  const joint = workspace.resolve('#console/servos/joint');
  assert.deepEqual(workspace.resolve('#console'), joint);
  assert.deepEqual(workspace.resolve('#console/servos'), joint);
  assert.equal(joint.view, 'joint');
});

test('console child pages have separate render keys and remain distinct from article anchors', () => {
  const hashes = ['#console/servos/joint', '#console/servos/single', '#console/charts', '#console/overview', '#console/device', '#console/sensors', '#console/logs', '#console/servos/parameters', '#console/servos/maintenance'];
  const routes = hashes.map(workspace.resolve);
  assert.equal(new Set(routes.map(route => route.key)).size, hashes.length);
  assert.equal(routes[1].view, 'single');
  assert.equal(routes[2].view, 'charts');
  assert.equal(workspace.resolve('#article/chapter-3/network'), null);
  assert.equal(workspace.resolve('#records'), null);
});

test('servo parameter and maintenance routes keep canonical keys and legacy fallback', () => {
  assert.deepEqual(workspace.resolve('#console/servos/parameters'), { view: 'parameters', key: 'console/servos/parameters', title: '参数与标定', anchor: '' });
  assert.deepEqual(workspace.resolve('#console/servos/maintenance'), { view: 'maintenance', key: 'console/servos/maintenance', title: '通信与维护', anchor: '' });
  assert.deepEqual(workspace.resolve('#console/servos/unknown'), workspace.resolve('#console/servos/joint'));
});
