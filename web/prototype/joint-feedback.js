(function (root, factory) {
  'use strict';
  const model = typeof module === 'object' && module.exports ? require('./joint-drafts.js') : root.JointDrafts;
  const api = factory(root, model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JointFeedback = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root, model) {
  'use strict';

  // Read-only feedback inspection. Filtering and row selection never write a draft.
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const numberText = value => finite(value) ? String(Number(value.toFixed(3))) : '—';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const groups = { all: null, left: '左腿', right: '右腿', head: '头颈' };
  const fields = [
    ['actual', '位置', 'ticks'], ['goal', '目标回读', 'ticks'], ['error', '跟踪误差', 'ticks'],
    ['load', '负载', 'raw load'], ['volt', '电压', 'V'], ['temp', '温度', '°C'],
    ['angle', '实际角度', '°', true], ['zero', '校准零位', 'ticks', true],
    ['min', '实机最小', '°', true], ['max', '实机最大', '°', true], ['enabled', '使能', '', true]
  ];
  let filter = 'all', query = '', expanded = true, scrollTop = 0, scrollLeft = 0;
  let container = null, context = null;

  function rowsFor(store, state) {
    return model.metadata.map(joint => {
      const feedback = store.getFeedback(joint.id, state);
      const actual = finite(feedback.value) ? feedback.value : null;
      const goal = finite(feedback.goal) ? feedback.goal : null;
      return {
        id: joint.id, name: joint.name, raw: joint.raw, group: joint.group,
        source: 'browser-sample', sampleOnly: true,
        state: state === 'offline' ? 'offline' : feedback.available ? feedback.stale ? 'stale' : 'sample' : 'missing',
        actual, goal, error: finite(actual) && finite(goal) ? actual - goal : null,
        load: feedback.load, volt: feedback.volt, temp: feedback.temp,
        // Visual model angles and UI fixture ranges are not physical calibration.
        angle: null, zero: null, min: null, max: null, enabled: null
      };
    });
  }

  function matches(row, selectedFilter, search) {
    const group = groups[selectedFilter];
    const normalized = String(search || '').trim().toLocaleLowerCase();
    return (!group || row.group === group) && (!normalized || [row.id, row.name, row.raw].join(' ').toLocaleLowerCase().includes(normalized));
  }

  function csvCell(value) {
    if (value == null) return '';
    let text = String(value);
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function toCsv(rows) {
    const columns = ['sample', 'source', 'id', 'joint', 'feedback_state', 'actual_ticks', 'goal_readback_ticks', 'error_ticks', 'raw_load', 'voltage_v', 'temperature_c', 'actual_angle_deg', 'zero_ticks', 'physical_min_deg', 'physical_max_deg', 'enabled'];
    return columns.join(',') + '\r\n' + rows.map(row => [true, row.source, row.id, row.raw, row.state, row.actual, row.goal, row.error, row.load, row.volt, row.temp, row.angle, row.zero, row.min, row.max, row.enabled].map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  function rowMarkup(row, jointId) {
    const label = { sample: '样例', missing: '缺测', stale: '陈旧样例', offline: '离线' }[row.state];
    return `<tr data-feedback-row="${row.id}" class="${row.id === jointId ? 'selected' : ''}" ${matches(row, filter, query) ? '' : 'hidden'}><th scope="row"><button type="button" data-feedback-select="${row.id}" aria-pressed="${row.id === jointId}" title="${escape(row.raw)}" aria-label="${escape(row.name)}，ID ${row.id}，${escape(row.raw)}"><span class="feedback-id">${row.id}</span><strong>${escape(row.name)}</strong></button></th><td data-feedback-status><span class="feedback-state ${row.state}">${label}</span></td>${fields.map(([key, , , extra]) => `<td data-feedback-value="${key}" ${extra ? `data-feedback-extra ${expanded ? '' : 'hidden'}` : ''}>${numberText(row[key])}</td>`).join('')}</tr>`;
  }

  function render(options) {
    const rows = rowsFor(options.store, options.state);
    return `<section class="panel joint-feedback-panel" aria-labelledby="joint-feedback-title"><div class="feedback-heading"><h2 id="joint-feedback-title">全部关节反馈 <span class="badge example">只读样例</span></h2><button type="button" data-feedback-export>↓ CSV 快照</button></div><div class="feedback-toolbar"><div class="feedback-filters" role="group" aria-label="反馈分组">${[['all', '全部关节'], ['left', '左腿'], ['right', '右腿'], ['head', '头颈与嘴部']].map(([value, label]) => `<button type="button" data-feedback-filter="${value}" aria-pressed="${filter === value}">${label}</button>`).join('')}</div><label class="feedback-extra-toggle"><input type="checkbox" data-feedback-columns ${expanded ? 'checked' : ''}>校准与使能列</label><label class="feedback-search"><span class="visually-hidden">搜索关节名称或 ID</span><input type="search" data-feedback-search value="${escape(query)}" placeholder="搜索 ID / 关节" aria-label="搜索 ID 或关节"></label></div><div class="feedback-table-scroll" tabindex="0" role="region" aria-label="15 个关节反馈表，可独立滚动"><table class="feedback-table"><thead><tr><th scope="col">关节 / ID</th><th scope="col">反馈状态</th>${fields.map(([, label, unit, extra]) => `<th scope="col" ${extra ? `data-feedback-extra ${expanded ? '' : 'hidden'}` : ''}>${label}${unit ? `<small>${unit}</small>` : ''}</th>`).join('')}</tr></thead><tbody>${rows.map(row => rowMarkup(row, options.jointId)).join('')}</tbody></table><p class="feedback-empty" data-feedback-empty ${rows.some(row => matches(row, filter, query)) ? 'hidden' : ''}>没有匹配的关节。</p></div><div class="feedback-footnote"><span data-feedback-count>${rows.filter(row => matches(row, filter, query)).length} / 15 个关节</span><span>浏览器样例 · 缺测保留 — · 校准与使能未知</span><span data-feedback-notice role="status">CSV 导出当前筛选的只读快照。</span></div></section>`;
  }

  function paint() {
    if (!container || !context) return;
    const rows = rowsFor(context.store, context.state);
    let visible = 0;
    rows.forEach(row => {
      const element = container.querySelector(`[data-feedback-row="${row.id}"]`);
      if (!element) return;
      element.hidden = !matches(row, filter, query);
      if (!element.hidden) visible += 1;
      const selected = row.id === context.jointId;
      element.classList.toggle('selected', selected);
      element.querySelector('[data-feedback-select]').setAttribute('aria-pressed', String(selected));
      const status = element.querySelector('[data-feedback-status] span');
      status.className = 'feedback-state ' + row.state;
      status.textContent = { sample: '样例', missing: '缺测', stale: '陈旧样例', offline: '离线' }[row.state];
      fields.forEach(([key]) => { element.querySelector(`[data-feedback-value="${key}"]`).textContent = numberText(row[key]); });
    });
    container.querySelectorAll('[data-feedback-extra]').forEach(element => { element.hidden = !expanded; });
    container.querySelectorAll('[data-feedback-filter]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.feedbackFilter === filter)); });
    container.querySelector('[data-feedback-count]').textContent = visible + ' / 15 个关节';
    container.querySelector('[data-feedback-empty]').hidden = visible > 0;
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button || !container.contains(button)) return;
    if (button.matches('[data-feedback-filter]')) { filter = button.dataset.feedbackFilter; paint(); }
    else if (button.matches('[data-feedback-select]')) context.onSelect?.(Number(button.dataset.feedbackSelect));
    else if (button.matches('[data-feedback-export]')) {
      const rows = rowsFor(context.store, context.state).filter(row => matches(row, filter, query));
      const url = URL.createObjectURL(new Blob(['\uFEFF' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
      const link = root.document.createElement('a');
      link.href = url; link.download = 'Microduck-Hatchery-EXAMPLE-ONLY-joints.csv'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      container.querySelector('[data-feedback-notice]').textContent = `已导出 ${rows.length} 个关节的样例快照；没有发送设备目标。`;
    }
  }

  function input(event) { if (event.target.matches('[data-feedback-search]')) { query = event.target.value; paint(); } }
  function change(event) { if (event.target.matches('[data-feedback-columns]')) { expanded = event.target.checked; paint(); } }
  function setContext(options) { if (context) { context = { ...context, ...options }; paint(); } }
  function mount(options) {
    unmount();
    container = options.container;
    if (!container) return false;
    context = { ...options };
    container.addEventListener('click', click); container.addEventListener('input', input); container.addEventListener('change', change);
    root.addEventListener('joint-draft-change', paint);
    paint();
    const scroll = container.querySelector('.feedback-table-scroll');
    scroll.scrollTop = scrollTop; scroll.scrollLeft = scrollLeft;
    return true;
  }
  function unmount() {
    if (!container) return;
    const scroll = container.querySelector('.feedback-table-scroll');
    scrollTop = scroll.scrollTop; scrollLeft = scroll.scrollLeft;
    container.removeEventListener('click', click); container.removeEventListener('input', input); container.removeEventListener('change', change);
    root.removeEventListener('joint-draft-change', paint);
    container = null; context = null;
  }
  function snapshot() { return { mounted: Boolean(container), filter, query, expanded, jointId: context?.jointId, visibleIds: context ? rowsFor(context.store, context.state).filter(row => matches(row, filter, query)).map(row => row.id) : [] }; }

  return Object.freeze({ render, mount, setContext, unmount, snapshot, rowsFor, matches, toCsv });
});
