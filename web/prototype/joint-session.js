(function (root, factory) {
  'use strict';
  const model = typeof module === 'object' && module.exports
    ? require('./joint-drafts.js') : root.JointDrafts;
  const api = factory(model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JointSession = api;
})(typeof window !== 'undefined' ? window : globalThis, function (model) {
  'use strict';

  // This session produces browser samples only. It has no device transport,
  // command authority, device Unix clock or knowledge of hardware limits.
  const jointIds = new Set(model.metadata.map(function (joint) { return joint.id; }));
  const finite = function (value) { return typeof value === 'number' && Number.isFinite(value); };

  function normalizeFrame(frame) {
    if (!frame || frame.source !== 'sample' || frame.sampleOnly !== true || !jointIds.has(frame.id)
      || !finite(frame.t) || frame.t < 0) return null;
    const normalized = { id: frame.id, t: frame.t, source: 'sample', sampleOnly: true };
    for (const key of ['actual', 'goal', 'load', 'temp', 'volt']) {
      const value = frame[key];
      if (value != null && !finite(value)) return null;
      normalized[key] = finite(value) ? value : null;
    }
    return normalized;
  }

  // Each physical joint gets its own bounded ring. Selecting more curves does
  // not shorten the available history of the other joints.
  function createBuffer(capacity) {
    capacity = capacity == null ? 320 : capacity;
    if (!Number.isInteger(capacity) || capacity < 2) throw new RangeError('缓冲容量至少为 2');
    const rings = new Map();
    let latest = 0;
    function push(frame) {
      const next = normalizeFrame(frame);
      if (!next) return false;
      let ring = rings.get(next.id);
      if (!ring) {
        ring = { values: new Array(capacity), start: 0, length: 0, lastTime: -1 };
        rings.set(next.id, ring);
      }
      if (next.t <= ring.lastTime) return false;
      const index = (ring.start + ring.length) % capacity;
      ring.values[index] = next;
      if (ring.length < capacity) ring.length += 1;
      else ring.start = (ring.start + 1) % capacity;
      ring.lastTime = next.t;
      latest = Math.max(latest, next.t);
      return true;
    }
    function frames(ids) {
      const requested = ids == null ? Array.from(rings.keys()) : ids;
      const result = [];
      requested.forEach(function (id) {
        const ring = rings.get(id);
        if (!ring) return;
        for (let i = 0; i < ring.length; i += 1) {
          result.push(Object.assign({}, ring.values[(ring.start + i) % capacity]));
        }
      });
      return result.sort(function (a, b) { return a.t - b.t || a.id - b.id; });
    }
    return { push: push, frames: frames, latestTime: function () { return latest; }, capacity: capacity };
  }

  function createRelativeClock(readNow) {
    readNow = readNow || function () { return performance.now(); };
    const initial = readNow();
    let origin = finite(initial) ? initial : null;
    let previous = 0;
    return function () {
      const current = readNow();
      if (!finite(current)) return previous;
      if (origin === null) origin = current;
      const delta = (current - origin) / 1000;
      if (finite(delta)) previous = Math.max(previous, delta, 0);
      return previous;
    };
  }

  function sampleFrame(t, state) {
    if (!finite(t) || t < 0) throw new RangeError('样例相对时间必须为非负有限值');
    const available = ['example', 'readonly', 'read-only'].includes(state || 'example');
    const phase = t % 10;
    const goal = phase < 1.5 ? 120 : phase < 6.5 ? 128 : 120;
    const response = phase < 1.5 ? 0 : phase < 6.5
      ? 8 * (1 - Math.exp(-(phase - 1.5) / 0.6))
      : 8 * Math.exp(-(phase - 6.5) / 0.7);
    return {
      id: 23, t: t, source: 'sample', sampleOnly: true,
      goal: available ? goal : null,
      actual: available ? Math.round(120 + response + 0.3 * Math.sin(t * 10 / 3)) : null,
      load: null, temp: available ? 32 : null, volt: available ? 7.8 : null
    };
  }

  function createSession(options) {
    options = options || {};
    const buffer = createBuffer(options.capacity);
    const schedule = options.setInterval || function (callback, interval) { return setInterval(callback, interval); };
    const cancel = options.clearInterval || function (id) { clearInterval(id); };
    const listeners = new Set();
    let state = 'example', timer = null, onFrame = null, clock = null;
    const history = Object.freeze({ frames: buffer.frames, latestTime: buffer.latestTime, capacity: buffer.capacity });

    function now() {
      if (!clock) clock = createRelativeClock(options.now);
      return clock();
    }

    function ingest(frame) {
      if (!buffer.push(frame)) return false;
      const accepted = normalizeFrame(frame);
      if (onFrame) onFrame(Object.assign({}, accepted));
      Array.from(listeners).forEach(function (listener) { listener(Object.assign({}, accepted)); });
      return true;
    }

    function tick() { ingest(sampleFrame(now(), state)); }

    function setState(next) {
      if (typeof next === 'string') state = next;
      return state;
    }

    function start(settings) {
      settings = settings || {};
      setState(settings.state);
      if (Object.prototype.hasOwnProperty.call(settings, 'onFrame')) {
        onFrame = typeof settings.onFrame === 'function' ? settings.onFrame : null;
      }
      if (timer !== null) return false;
      // Assign the timer before publishing the initial frame, so a subscriber
      // cannot start a second stream while handling that first notification.
      timer = schedule(tick, 200);
      tick();
      return true;
    }

    function stop() {
      if (timer !== null) cancel(timer);
      timer = null;
      onFrame = null;
      // The clock and history survive stop/start. The elapsed gap will remain
      // visible instead of connecting samples across time away from console.
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('样例订阅者必须是函数');
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    }

    function snapshot() {
      return { state: state, running: timer !== null, frames: buffer.frames(), latestTime: buffer.latestTime() };
    }

    return Object.freeze({ start: start, stop: stop, setState: setState, subscribe: subscribe,
      ingest: ingest, now: now, history: history, snapshot: snapshot });
  }

  return Object.freeze(Object.assign({}, createSession(), {
    createSession: createSession, createBuffer: createBuffer, createRelativeClock: createRelativeClock,
    normalizeFrame: normalizeFrame, sampleFrame: sampleFrame
  }));
});
