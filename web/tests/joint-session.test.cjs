'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Session = require('../prototype/joint-session.js');
const Drafts = require('../prototype/joint-drafts.js');

function fixture(options = {}) {
  let time = 10000, nextId = 0, scheduled = 0;
  const timers = new Map(), cleared = [];
  const session = Session.createSession(Object.assign({
    now: () => time,
    setInterval(callback, interval) {
      assert.equal(interval, 200);
      scheduled += 1;
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
    clearInterval(id) { cleared.push(id); timers.delete(id); }
  }, options));
  return { session, timers, cleared, scheduled: () => scheduled,
    tick(ms = 200) { time += ms; Array.from(timers.values()).forEach(callback => callback()); },
    advance(ms) { time += ms; } };
}

test('one session collects while joint, single-servo and curve subscribers come and go', () => {
  const { session, tick, timers } = fixture();
  const store = Drafts.createStore();
  store.setDraft(23, 177);
  const draftBefore = store.getDraft(23), batchBefore = store.snapshot().lastBatch;
  let jointPaints = 0, singlePaints = 0, curvePaints = 0;
  session.start({ state: 'example', onFrame: frame => store.updateSampleFeedback(frame) });
  let unsubscribe = session.subscribe(() => jointPaints++);
  tick(); tick();
  unsubscribe();
  unsubscribe = session.subscribe(() => singlePaints++);
  tick();
  unsubscribe();
  tick(); // No rendered subscriber: acquisition still belongs to console.
  unsubscribe = session.subscribe(() => curvePaints++);
  tick();
  assert.deepEqual([jointPaints, singlePaints, curvePaints], [2, 1, 1]);
  assert.deepEqual(session.history.frames().map(frame => frame.t), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.equal(store.getFeedback(23).relativeSeconds, 1);
  assert.deepEqual(store.getDraft(23), draftBefore);
  assert.deepEqual(store.snapshot().lastBatch, batchBefore);
  assert.deepEqual(session.history.frames([34]), []);
  unsubscribe();
  assert.equal(timers.size, 1);
  assert.equal(session.snapshot().running, true);
  session.stop();
});

test('repeated starts and a start during initial delivery cannot multiply timers', () => {
  const { session, tick, scheduled, timers } = fixture();
  let deliveries = 0;
  session.start({ onFrame() { deliveries++; session.start(); } });
  assert.equal(session.start({ state: 'readonly' }), false);
  assert.equal(session.start({ state: 'read-only' }), false);
  tick();
  assert.equal(deliveries, 2);
  assert.equal(scheduled(), 1);
  assert.equal(timers.size, 1);
  assert.equal(session.snapshot().state, 'read-only');
  session.stop();
});

test('stop cleans even timer ID zero and resume preserves a visible history gap', () => {
  const { session, tick, advance, timers, cleared, scheduled } = fixture();
  let previousOwner = 0;
  session.start({ onFrame() { previousOwner++; } });
  tick();
  const before = session.history.frames();
  session.stop();
  session.stop();
  assert.deepEqual(cleared, [0]);
  assert.equal(timers.size, 0);
  advance(5000);
  assert.deepEqual(session.history.frames(), before);
  session.start();
  assert.equal(session.history.frames().at(-1).t, 5.2);
  assert.equal(previousOwner, 2);
  assert.equal(scheduled(), 2);
  session.stop();
});

test('state previews create missing frames without inventing other joints or real feedback', () => {
  const { session, tick } = fixture();
  session.start({ state: 'example' });
  for (const state of ['offline', 'stale', 'unknown']) {
    session.setState(state);
    tick();
    const current = session.history.frames().at(-1);
    assert.deepEqual([current.actual, current.goal, current.load, current.temp, current.volt],
      [null, null, null, null, null]);
    assert.deepEqual([current.id, current.source, current.sampleOnly], [23, 'sample', true]);
  }
  session.setState('readonly');
  tick();
  const available = session.history.frames().at(-1);
  assert.equal(available.volt, 7.8);
  assert.equal(available.temp, 32);
  assert.equal(available.load, null);
  assert.deepEqual(new Set(session.history.frames().map(frame => frame.id)), new Set([23]));
  session.stop();
});

test('invalid input cannot reach subscribers, rewrite history, or imitate a device frame', () => {
  const { session } = fixture();
  let notified = 0;
  session.subscribe(frame => { notified++; frame.actual = 999; });
  const valid = Session.sampleFrame(1, 'example');
  assert.equal(session.ingest(valid), true);
  for (const changes of [
    { source: 'device' }, { sampleOnly: false }, { id: 999 }, { id: '23' },
    { t: NaN }, { t: -1 }, { t: Infinity }, { actual: '123' }, { load: NaN },
    { t: 1 }, { t: 0.8 }
  ]) assert.equal(session.ingest(Object.assign({}, valid, changes)), false);
  assert.equal(notified, 1);
  assert.equal(session.history.frames()[0].actual, valid.actual);
  const copy = session.snapshot();
  copy.frames[0].actual = 88;
  assert.equal(session.history.frames()[0].actual, valid.actual);
});

test('production session bounds history at 320 samples per joint over long collection', () => {
  const { session, tick } = fixture();
  session.start();
  for (let i = 0; i < 600; i++) tick();
  assert.equal(session.history.capacity, 320);
  assert.equal(session.history.frames().length, 320);
  assert.equal(session.history.frames()[0].t, 56.2);
  assert.equal(session.history.latestTime(), 120);
  const other = Object.assign({}, Session.sampleFrame(1, 'example'), { id: 34, actual: null, goal: null });
  assert.equal(session.ingest(other), true);
  assert.equal(session.history.frames([23]).length, 320);
  assert.equal(session.history.frames([34]).length, 1);
  session.stop();
});

test('invalid and reversed clock readings never create invalid or decreasing sample times', () => {
  let time = NaN, interval;
  const session = Session.createSession({ now: () => time,
    setInterval(callback) { interval = callback; return 0; }, clearInterval() {} });
  session.start();
  time = Infinity; interval();
  time = 5000; interval();
  time = 5200; interval();
  time = 5100; interval();
  time = NaN; interval();
  time = 5600; interval();
  assert.deepEqual(session.history.frames().map(frame => frame.t), [0, 0.2, 0.6]);
  assert.equal(session.now(), 0.6);
  session.stop();
});
