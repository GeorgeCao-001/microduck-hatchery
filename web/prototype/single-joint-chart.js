(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SingleJointChart = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  // This view owns no acquisition, targets or independent multi-joint chart settings.
  let container = null, unsubscribe = null, observer = null;
  let context = { jointId: 23, state: 'example' };
  let channel = 'position', windowSeconds = 10, paused = false, frozenFrames = null;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const text = value => finite(value) ? String(Number(value.toFixed(2))) : '—';
  const names = { position: '实测位置 / 目标回读', error: '跟踪误差', load: '负载原始读数', volt: '电压', temp: '温度' };
  function joint() { return root.JointDrafts.metadata.find(item => item.id === context.jointId) || root.JointDrafts.metadata[0]; }
  function frames() { return paused && frozenFrames ? frozenFrames : root.JointSession.history.frames(); }

  function plotMarkup() {
    const config = root.JointCharts.channels[channel];
    const history = frames(), end = history.length ? history[history.length - 1].t : 0;
    const axisEnd = Math.max(windowSeconds, end), start = Math.max(0, end - windowSeconds), axisStart = axisEnd - windowSeconds;
    const series = config.keys.map(key => ({ key, points: root.JointCharts.seriesFor(history, context.jointId, key, start, end) }));
    const extent = root.JointCharts.extentFor(series, channel);
    const plot = container?.querySelector('[data-single-plot]');
    const width = plot ? Math.max(120, Math.round(plot.clientWidth)) : 640;
    const height = root.innerWidth <= 760 ? 340 : 480;
    if (!extent) return `<div class="single-plot-empty" style="--single-plot-height:${height}px"><strong>该关节暂无${channel === 'load' ? ' raw load' : ''}数据</strong><p>缺测不补零；当前仅左膝 #23 有浏览器位置样例。</p></div>`;
    const left = width < 460 ? 44 : 58, right = 20, top = 24, bottom = 34;
    const x = t => left + (t - axisStart) / windowSeconds * (width - left - right);
    const y = value => height - bottom - (value - extent[0]) / (extent[1] - extent[0]) * (height - top - bottom);
    let grid = `<text x="${left}" y="13">${config.unit}</text>`;
    for (let i = 0; i <= 4; i += 1) {
      const value = extent[0] + (extent[1] - extent[0]) * i / 4;
      grid += `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${text(value)}</text>`;
    }
    const ticks = width < 460 ? 2 : 4;
    for (let i = 0; i <= ticks; i += 1) {
      const t = axisStart + windowSeconds * i / ticks;
      grid += `<text x="${x(t)}" y="${height - 8}" text-anchor="middle">${text(t)} s</text>`;
    }
    const paths = series.map(item => {
      const points = item.points.filter(point => finite(point.value));
      const style = item.key === 'goal' ? 'goal' : 'actual';
      const path = root.JointCharts.pathFor(item.points, x, y, 0.65, item.key === 'goal');
      return `<path class="single-line ${style}" data-single-line="${item.key}" d="${path}"/>${points.length === 1 ? `<circle class="single-dot ${style}" cx="${x(points[0].t)}" cy="${y(points[0].value)}" r="3"/>` : ''}`;
    }).join('');
    const legend = series.map(item => `<span><i class="${item.key === 'goal' ? 'goal' : 'actual'}"></i>${item.key === 'goal' ? '目标回读' : item.key === 'actual' ? '实测位置' : names[channel]} <b>${text(item.points[item.points.length - 1]?.value)}</b> ${config.unit}</span>`).join('');
    return `<svg class="single-chart-svg" style="--single-plot-height:${height}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${joint().name} ${names[channel]}，只读浏览器样例">${grid}${paths}</svg><div class="single-chart-legend">${legend}</div>`;
  }

  function sourceText() {
    return `${paused ? '显示已暂停 · ' : ''}${context.state === 'offline' ? '离线，仅保留历史样例' : context.state === 'stale' ? '反馈陈旧，仅保留历史样例' : '浏览器样例 · 每 200 ms 更新'} · 目标草稿不作为目标回读`;
  }
  function render(options) {
    context = { ...context, ...options };
    return `<section class="panel single-joint-chart" aria-labelledby="single-chart-title"><div class="single-chart-heading"><h2 id="single-chart-title">关节曲线 <span data-single-chart-name>${joint().name} · #${joint().id}</span></h2><select data-single-channel aria-label="单关节曲线数据">${Object.keys(names).map(key => `<option value="${key}" ${channel === key ? 'selected' : ''}>${names[key]} · ${root.JointCharts.channels[key].unit}</option>`).join('')}</select></div><div class="single-chart-toolbar"><label>时间窗 <select data-single-window><option value="10" ${windowSeconds === 10 ? 'selected' : ''}>10 秒</option><option value="30" ${windowSeconds === 30 ? 'selected' : ''}>30 秒</option></select></label><button type="button" data-single-pause>${paused ? '恢复显示' : '暂停显示'}</button><a href="#console/charts">多关节曲线 ↗</a></div><div data-single-plot>${plotMarkup()}</div><p class="single-chart-source" data-single-chart-source>${sourceText()}</p></section>`;
  }
  function paint() {
    if (!container || !container.isConnected) return;
    container.querySelector('[data-single-chart-name]').textContent = joint().name + ' · #' + joint().id;
    container.querySelector('[data-single-plot]').innerHTML = plotMarkup();
    container.querySelector('[data-single-chart-source]').textContent = sourceText();
  }
  function onFrame() { if (!paused) paint(); }
  function click(event) {
    if (!event.target.closest('[data-single-pause]')) return;
    paused = !paused;
    frozenFrames = paused ? root.JointSession.history.frames() : null;
    container.querySelector('[data-single-pause]').textContent = paused ? '恢复显示' : '暂停显示';
    paint();
  }
  function change(event) {
    if (event.target.matches('[data-single-channel]') && names[event.target.value]) channel = event.target.value;
    else if (event.target.matches('[data-single-window]') && [10, 30].includes(Number(event.target.value))) windowSeconds = Number(event.target.value);
    else return;
    paint();
  }
  function setContext(options) { context = { ...context, ...options }; paint(); }
  function mount(options) {
    unmount();
    container = options.container;
    context = { ...context, state: options.state, jointId: options.jointId };
    if (!container) return false;
    container.addEventListener('click', click); container.addEventListener('change', change);
    unsubscribe = root.JointSession.subscribe(onFrame);
    if (root.ResizeObserver) {
      let previousWidth = -1;
      observer = new root.ResizeObserver(() => {
        const width = container?.querySelector('[data-single-plot]')?.clientWidth;
        if (width !== previousWidth) { previousWidth = width; paint(); }
      });
      observer.observe(container);
    }
    paint();
    return true;
  }
  function unmount() {
    unsubscribe?.(); unsubscribe = null;
    observer?.disconnect(); observer = null;
    if (container) { container.removeEventListener('click', click); container.removeEventListener('change', change); }
    container = null;
  }
  function snapshot() { return { mounted: Boolean(container), jointId: context.jointId, channel, windowSeconds, paused, displayTime: frames().at(-1)?.t ?? 0 }; }
  return { render, mount, setContext, unmount, snapshot };
});
