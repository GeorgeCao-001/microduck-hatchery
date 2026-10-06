(function (root, factory) {
  'use strict';
  const model = typeof module === 'object' && module.exports
    ? require('./joint-drafts.js') : root.JointDrafts;
  const api = factory(model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JointCharts = api;
})(typeof window !== 'undefined' ? window : globalThis, function (model) {
  'use strict';

  // A browser-generated sample stream only: no transport, device clock or command.
  const joints = model.metadata;
  const jointIds = new Set(joints.map(function (joint) { return joint.id; }));
  const colors = ['#2e5b42', '#a2711c', '#286879', '#7e486a', '#665294', '#426438', '#ad533a', '#267b75', '#82602f', '#766185', '#385ca0', '#956022', '#78574c', '#546835', '#9d4267'];
  const channels = Object.freeze({
    position: { title: '位置', unit: 'ticks', height: 300, keys: ['goal', 'actual'] },
    error: { title: '跟踪误差 · 实测 − 目标回读', unit: 'ticks', height: 160, keys: ['error'] },
    load: { title: '负载原始读数', unit: 'raw load', height: 180, keys: ['load'] },
    volt: { title: '电压', unit: 'V', height: 180, keys: ['volt'] },
    temp: { title: '温度', unit: '°C', height: 180, keys: ['temp'] }
  });
  const finite = function (value) { return typeof value === 'number' && Number.isFinite(value); };
  const escape = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  };
  const colorFor = function (id) { return colors[joints.findIndex(function (joint) { return joint.id === id; })] || colors[0]; };
  const numberText = function (value) { return finite(value) ? Number(value.toFixed(2)).toString() : '—'; };

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

  // Each joint has a bounded ring, so showing more joints does not shorten a window.
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
    const origin = readNow();
    let previous = 0;
    return function () {
      const delta = (readNow() - origin) / 1000;
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

  function seriesFor(frames, id, key, start, end) {
    return frames.filter(function (frame) {
      return frame.id === id && frame.t >= start && frame.t <= end;
    }).map(function (frame) {
      const value = key === 'error'
        ? finite(frame.actual) && finite(frame.goal) ? frame.actual - frame.goal : null
        : frame[key];
      return { t: frame.t, value: finite(value) ? value : null };
    });
  }

  function pathFor(points, x, y, maxGap, stepped) {
    maxGap = maxGap == null ? 0.65 : maxGap;
    let path = '', previous = null;
    points.forEach(function (point) {
      if (!finite(point.t) || !finite(point.value)) { previous = null; return; }
      const px = x(point.t).toFixed(2), py = y(point.value).toFixed(2);
      const connected = previous && point.t > previous.t && point.t - previous.t <= maxGap;
      path += !connected ? 'M' + px + ',' + py
        : stepped ? 'H' + px + 'V' + py : 'L' + px + ',' + py;
      previous = point;
    });
    return path;
  }

  function extentFor(series, key) {
    const values = series.flatMap(function (item) {
      return item.points.filter(function (point) { return finite(point.value); })
        .map(function (point) { return point.value; });
    });
    if (!values.length) return null;
    let min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (key === 'error') { min = Math.min(min, 0); max = Math.max(max, 0); }
    const minimumSpan = key === 'volt' ? 0.4 : key === 'temp' ? 2 : 2;
    const padding = Math.max((max - min) * 0.12, minimumSpan / 2);
    return [min - padding, max + padding];
  }

  const buffer = createBuffer();
  let context = { jointId: 23, state: 'example' };
  let visibleJointIds = new Set([23]);
  let visibleChannels = new Set(['position', 'error']);
  let windowSeconds = 10, paused = false, frozenFrames = null;
  let selectionExpanded = false;
  let container = null, timer = null, onFrame = null, clock = null;

  function selectionMarkup() {
    return `<details class="chart-selection-tools" ${selectionExpanded ? 'open' : ''}><summary data-chart-selection-summary>${selectionSummary()}</summary><div class="chart-picker-row"><fieldset class="chart-joint-picker"><legend>显示关节 <span>独立于草稿应用范围</span></legend><div class="chart-joint-groups">${['左腿', '右腿', '头颈'].map(function (group) {
      return `<div class="chart-joint-group"><strong>${group === '头颈' ? '头颈与嘴部' : group}</strong>${joints.filter(function (joint) { return joint.group === group; }).map(function (joint) {
        return `<label><input type="checkbox" data-chart-joint="${joint.id}" ${visibleJointIds.has(joint.id) ? 'checked' : ''}><i style="--joint-chart-color:${colorFor(joint.id)}" aria-hidden="true"></i>${escape(joint.name)} <small>#${joint.id}</small></label>`;
      }).join('')}</div>`;
    }).join('')}</div><div class="chart-picker-actions"><button type="button" data-chart-all-joints>显示全部</button><button type="button" data-chart-clear-joints>清空显示</button><span data-chart-count>已选 ${visibleJointIds.size} / 15</span></div></fieldset><fieldset class="chart-channel-picker"><legend>显示数据</legend>${Object.keys(channels).map(function (key) {
      const label = { position: '目标回读 / 实测位置', error: '跟踪误差', load: 'raw load', volt: '电压', temp: '温度' }[key];
      return `<label><input type="checkbox" data-chart-channel="${key}" ${visibleChannels.has(key) ? 'checked' : ''}>${label} <small>${channels[key].unit}</small></label>`;
    }).join('')}<p>按单位分别绘图；目标草稿不会代替目标回读。</p></fieldset></div></details>`;
  }

  function selectionSummary() {
    return '曲线显示设置 · ' + visibleJointIds.size + ' 个关节 · ' + visibleChannels.size + ' 项数据';
  }

  function contextText() {
    if (context.state === 'offline') return '离线状态预览 · 写入缺测间隙，未连接设备';
    if (context.state === 'stale') return '反馈陈旧状态预览 · 写入缺测间隙，未延续旧测量';
    if (!['example', 'readonly', 'read-only'].includes(context.state)) return '当前状态无可用样例 · 未连接设备';
    return '浏览器生成样例 · 每 200 ms 更新 · 实机数据尚未接入';
  }

  function render(options) {
    if (options) setContext(options);
    return `<section class="panel large-chart-panel" aria-labelledby="large-chart-title"><div class="large-chart-heading"><div><h2 id="large-chart-title">实时曲线</h2><p>选择要一起观察的关节和数据。</p></div><span class="badge example">只读样例</span></div>${selectionMarkup()}<div class="large-chart-toolbar"><label>时间窗 <select data-chart-window aria-label="曲线时间窗"><option value="10" ${windowSeconds === 10 ? 'selected' : ''}>最近 10 秒</option><option value="30" ${windowSeconds === 30 ? 'selected' : ''}>最近 30 秒</option></select></label><button type="button" data-chart-pause>${paused ? '恢复显示' : '暂停显示'}</button><span data-chart-follow>${paused ? '显示已暂停，样例继续采集' : '跟随最新样例'}</span><output data-chart-relative-time>0.0 s</output></div><p class="chart-source-status" data-chart-source-status>${contextText()}</p><div data-chart-plots>${plotsMarkup()}</div><p class="large-chart-footnote">仅左膝 #23 有生成的位置样例；温度 32 °C、电压 7.8 V 为常量样例。其他 14 个关节没有反馈，raw load 尚无数据。横轴是本页面单调相对时间，不是设备 Unix 时间；暂停仅暂停显示，不执行任何控制。</p></section>`;
  }

  function plotsMarkup() {
    if (!visibleJointIds.size) return '<div class="chart-empty"><strong>尚未选择显示关节</strong><p>勾选关节后，可在同一个曲线面板观察。</p></div>';
    if (!visibleChannels.size) return '<div class="chart-empty"><strong>尚未选择显示数据</strong><p>勾选位置、误差或其他数据。</p></div>';
    const frames = paused && frozenFrames ? frozenFrames : buffer.frames();
    const end = frames.length ? Math.max.apply(null, frames.map(function (frame) { return frame.t; })) : 0;
    const start = Math.max(0, end - windowSeconds);
    // Before a full window is available, keep the axis at its selected length.
    const axisEnd = Math.max(windowSeconds, end), axisStart = axisEnd - windowSeconds;
    return Object.keys(channels).filter(function (key) { return visibleChannels.has(key); }).map(function (key) {
      return plotMarkup(key, frames, start, end, axisStart, axisEnd);
    }).join('');
  }

  function plotMarkup(key, frames, start, end, axisStart, axisEnd) {
    const channel = channels[key], series = [];
    const selectedJoints = joints.filter(function (joint) { return visibleJointIds.has(joint.id); });
    selectedJoints.forEach(function (joint) {
      channel.keys.forEach(function (measurement) {
        series.push({ joint: joint, key: measurement, points: seriesFor(frames, joint.id, measurement, start, end) });
      });
    });
    const extent = extentFor(series, key);
    const latestValues = series.map(function (item) { return item.points[item.points.length - 1]?.value; });
    const missing = selectedJoints.filter(function (joint) {
      return !series.some(function (item) {
        return item.joint.id === joint.id && item.points.some(function (point) { return finite(point.value); });
      });
    });
    const missingMarkup = missing.length ? `<p class="chart-missing" data-chart-missing="${key}">${missing.map(function (joint) { return escape(joint.name) + ' #' + joint.id; }).join('、')}：无${key === 'load' ? ' raw load' : ''}数据</p>` : '';
    const legend = `<div class="large-chart-legend">${series.map(function (item, index) {
      const suffix = item.key === 'goal' ? '目标回读' : item.key === 'actual' ? '实测' : '';
      return `<span data-chart-legend-joint="${item.joint.id}"><i class="${item.key === 'goal' ? 'goal' : ''}" style="--joint-chart-color:${colorFor(item.joint.id)}" aria-hidden="true"></i>${escape(item.joint.name)} #${item.joint.id}${suffix ? ' · ' + suffix : ''}<b>${numberText(latestValues[index])}</b></span>`;
    }).join('')}</div>`;
    if (!extent) return `<section class="large-chart-track chart-${key}" data-chart-track="${key}"><div class="chart-track-heading"><h3>${channel.title}</h3><span>${channel.unit}</span></div><div class="chart-empty chart-empty-track" style="--chart-height:${channel.height}px"><strong>暂无可绘制数据</strong><p>缺测保留为空，不生成替代值。</p></div>${legend}${missingMarkup}</section>`;
    const plotElement = container && container.querySelector('[data-chart-plots]');
    const innerWidth = plotElement ? plotElement.getBoundingClientRect().width - 44 : 900;
    const width = Math.max(320, Math.round(innerWidth)), height = channel.height;
    const left = width < 500 ? 46 : 64, right = 18, top = 22, bottom = 34;
    const x = function (t) { return left + (t - axisStart) / (axisEnd - axisStart) * (width - left - right); };
    const y = function (value) { return height - bottom - (value - extent[0]) / (extent[1] - extent[0]) * (height - top - bottom); };
    let grid = '';
    for (let i = 0; i <= 4; i += 1) {
      const value = extent[0] + (extent[1] - extent[0]) * i / 4;
      grid += `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" class="chart-grid-line"/><text x="${left - 9}" y="${y(value) + 4}" text-anchor="end">${numberText(value)}</text>`;
    }
    for (let i = 0; i <= 5; i += 1) {
      const t = axisStart + windowSeconds * i / 5;
      grid += `<text x="${x(t)}" y="${height - 8}" text-anchor="middle">${numberText(t)} s</text>`;
    }
    const paths = series.map(function (item) {
      const path = pathFor(item.points, x, y, 0.65, item.key === 'goal');
      const only = item.points.filter(function (point) { return finite(point.value); });
      const dot = only.length === 1 ? `<circle cx="${x(only[0].t)}" cy="${y(only[0].value)}" r="3" fill="${colorFor(item.joint.id)}"/>` : '';
      return `<path data-chart-line-joint="${item.joint.id}" data-chart-measurement="${item.key}" d="${path}" fill="none" stroke="${colorFor(item.joint.id)}" stroke-width="2.5" ${item.key === 'goal' ? 'stroke-dasharray="7 5"' : ''} vector-effect="non-scaling-stroke"/>${dot}`;
    }).join('');
    const notCurrent = context.state === 'offline' || context.state === 'stale';
    return `<section class="large-chart-track chart-${key}" data-chart-track="${key}"><div class="chart-track-heading"><h3>${channel.title}</h3><span>${channel.unit}${notCurrent ? ' · 当前缺测，仅保留历史样例' : ''}</span></div><svg class="large-chart-svg" style="--chart-height:${height}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(channel.title)}，${selectedJoints.map(function (joint) { return escape(joint.name); }).join('、')}，浏览器生成的只读样例"><text x="${left}" y="12">${channel.unit}</text>${grid}${paths}</svg>${legend}${missingMarkup}</section>`;
  }

  function paint() {
    if (!container || !container.isConnected) return;
    const plots = container.querySelector('[data-chart-plots]');
    if (plots && !paused) plots.innerHTML = plotsMarkup();
    const status = container.querySelector('[data-chart-source-status]');
    if (status) status.textContent = contextText();
    const relative = container.querySelector('[data-chart-relative-time]');
    if (relative) relative.textContent = buffer.latestTime().toFixed(1) + ' s';
  }

  function ingest(frame) {
    const accepted = buffer.push(frame);
    if (accepted) {
      if (onFrame) onFrame(Object.assign({}, normalizeFrame(frame)));
      paint();
    }
    return accepted;
  }

  function sampleTick() {
    if (!container || !container.isConnected) { unmount(); return; }
    const t = clock();
    ingest(sampleFrame(t, context.state));
  }

  function updateSelectionControls() {
    if (!container) return;
    container.querySelectorAll('[data-chart-joint]').forEach(function (input) { input.checked = visibleJointIds.has(Number(input.dataset.chartJoint)); });
    const count = container.querySelector('[data-chart-count]');
    if (count) count.textContent = '已选 ' + visibleJointIds.size + ' / 15';
    const summary = container.querySelector('[data-chart-selection-summary]');
    if (summary) summary.textContent = selectionSummary();
    const plots = container.querySelector('[data-chart-plots]');
    if (plots) plots.innerHTML = plotsMarkup();
  }

  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button || !container.contains(button)) return;
    if (button.matches('[data-chart-all-joints]')) { visibleJointIds = new Set(joints.map(function (joint) { return joint.id; })); updateSelectionControls(); }
    else if (button.matches('[data-chart-clear-joints]')) { visibleJointIds.clear(); updateSelectionControls(); }
    else if (button.matches('[data-chart-pause]')) {
      paused = !paused;
      frozenFrames = paused ? buffer.frames() : null;
      button.textContent = paused ? '恢复显示' : '暂停显示';
      const follow = container.querySelector('[data-chart-follow]');
      if (follow) follow.textContent = paused ? '显示已暂停，样例继续采集' : '跟随最新样例';
      updateSelectionControls();
    }
  }

  function handleChange(event) {
    const input = event.target;
    if (input.matches('[data-chart-joint]')) {
      const id = Number(input.dataset.chartJoint);
      if (!jointIds.has(id)) return;
      if (input.checked) visibleJointIds.add(id); else visibleJointIds.delete(id);
      updateSelectionControls();
    } else if (input.matches('[data-chart-channel]')) {
      const key = input.dataset.chartChannel;
      if (!channels[key]) return;
      if (input.checked) visibleChannels.add(key); else visibleChannels.delete(key);
      updateSelectionControls();
    } else if (input.matches('[data-chart-window]')) {
      const next = Number(input.value);
      if ([10, 30].includes(next)) { windowSeconds = next; updateSelectionControls(); }
    }
  }

  function handleToggle(event) {
    if (event.target.matches && event.target.matches('.chart-selection-tools')) {
      selectionExpanded = event.target.open;
    }
  }

  function setContext(options) {
    options = options || {};
    if (jointIds.has(options.jointId)) context.jointId = options.jointId;
    if (typeof options.state === 'string') context.state = options.state;
    // Focus changes intentionally leave the user's curve selection unchanged.
    paint();
  }

  function mount(options) {
    options = options || {};
    const nextContainer = options.container || (typeof document !== 'undefined' ? document.querySelector('#joint-charts') : null);
    if (!nextContainer) return false;
    setContext(options);
    onFrame = typeof options.onFrame === 'function' ? options.onFrame : null;
    if (nextContainer !== container) {
      unmount();
      container = nextContainer;
      onFrame = typeof options.onFrame === 'function' ? options.onFrame : null;
      container.addEventListener('click', handleClick);
      container.addEventListener('change', handleChange);
      container.addEventListener('toggle', handleToggle, true);
    }
    if (!clock) clock = createRelativeClock(options.now);
    if (!timer) { sampleTick(); timer = setInterval(sampleTick, 200); }
    paint();
    return true;
  }

  function unmount() {
    if (timer) clearInterval(timer);
    timer = null;
    if (container) {
      const settings = container.querySelector('.chart-selection-tools');
      if (settings) selectionExpanded = settings.open;
      container.removeEventListener('click', handleClick);
      container.removeEventListener('change', handleChange);
      container.removeEventListener('toggle', handleToggle, true);
    }
    container = null;
    onFrame = null;
  }

  function snapshot() {
    return {
      visibleJointIds: joints.filter(function (joint) { return visibleJointIds.has(joint.id); }).map(function (joint) { return joint.id; }),
      channels: Object.keys(channels).filter(function (key) { return visibleChannels.has(key); }),
      windowSeconds: windowSeconds, paused: paused, state: context.state,
      selectionExpanded: selectionExpanded,
      focusedJointId: context.jointId, running: timer !== null, frames: buffer.frames()
    };
  }

  return Object.freeze({
    channels: channels, createBuffer: createBuffer, createRelativeClock: createRelativeClock,
    normalizeFrame: normalizeFrame, sampleFrame: sampleFrame, seriesFor: seriesFor,
    pathFor: pathFor, extentFor: extentFor,
    render: render, mount: mount, unmount: unmount, setContext: setContext,
    ingest: ingest, snapshot: snapshot
  });
});
