(function (root, factory) {
  'use strict';
  const model = typeof module === 'object' && module.exports ? require('./joint-drafts.js') : root.JointDrafts;
  const profiles = typeof module === 'object' && module.exports ? require('./servo-profile.js') : root.ServoProfile;
  const api = factory(root, model, profiles);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JointFeedback = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root, model, profiles) {
  'use strict';

  // Read-only feedback inspection. Filtering and row selection never write a draft.
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const numberText = value => finite(value) ? String(Number(value.toFixed(3))) : '—';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const groups = { all: null, left: '左腿', right: '右腿', head: '头颈' };
  const fields = [
    ['actual', '原始位置', 'raw'], ['goal', '目标回读', 'raw'], ['error', '跟踪误差', 'raw'],
    ['encoderAngle', '编码器参考', '°'], ['centerAngle', '中位参考', '°'], ['goalEncoderAngle', '目标参考', '°'],
    ['load', '负载', 'raw load'], ['volt', '电压', 'V'], ['temp', '温度', '°C'],
    ['angle', '实际关节', '°', true], ['zero', '校准零位', 'raw', true],
    ['min', '实机最小', '°', true], ['max', '实机最大', '°', true], ['enabled', '使能', '', true]
  ];
  const stateLabels = { sample: '样例', reference: 'HD参考样例', missing: '缺测', stale: '陈旧样例', offline: '离线' };
  let filter = 'all', query = '', expanded = true, scrollTop = 0, scrollLeft = 0;
  let referenceMode = false, referenceFixture = null;
  let container = null, context = null;

  function rowsFor(store, state, fixture) {
    const knownIds = new Set(model.metadata.map(joint => joint.id));
    const seenIds = new Set();
    const fixtureValid = fixture && fixture.source === 'sample' && fixture.sampleOnly === true &&
      fixture.hardwareConfirmed === false && fixture.fake === true && Array.isArray(fixture.rows) && fixture.rows.every(row => {
        if (!row || typeof row !== 'object' || Array.isArray(row) || !Number.isInteger(row.id) || !knownIds.has(row.id) || seenIds.has(row.id)) return false;
        seenIds.add(row.id);
        return true;
      });
    const offline = !['example', 'readonly', 'read-only', 'stale'].includes(state || 'example');
    return model.metadata.map(joint => {
      const fixtureRow = fixtureValid ? fixture.rows.find(row => row.id === joint.id) : null;
      const rowIsSample = fixtureRow && fixtureRow.source === 'sample' && fixtureRow.sampleOnly === true &&
        fixtureRow.hardwareConfirmed === false && fixtureRow.fake === true;
      const feedback = fixture ? rowIsSample ? fixtureRow : {} : store.getFeedback(joint.id, state);
      const actual = !offline && finite(feedback.value) ? feedback.value : null;
      const goal = !offline && finite(feedback.goal) ? feedback.goal : null;
      // No defaults here: a row must explicitly identify its profile, unit,
      // resolution and single-turn mode before a nominal angle is meaningful.
      const options = {
        profileId: feedback.profileId, unit: feedback.unit,
        singleTurn: feedback.singleTurn, resolutionConfirmed: feedback.resolutionConfirmed
      };
      const position = profiles.referencePosition(actual, options);
      const target = profiles.referencePosition(goal, options);
      return {
        id: joint.id, name: joint.name, raw: joint.raw, group: joint.group,
        source: fixtureValid ? 'browser-hd-reference-fixture' : 'browser-sample', sampleOnly: true,
        fake: true, simulated: false, hardwareConfirmed: false,
        fixtureId: fixtureValid ? fixture.fixtureId : null,
        unit: feedback.unit || (fixture ? 'unknown' : model.sampleConfig.unit),
        profileId: feedback.profileId || null,
        resolutionConfirmed: feedback.resolutionConfirmed === true, singleTurn: feedback.singleTurn === true,
        state: offline ? 'offline' : actual !== null ? state === 'stale' || feedback.stale ? 'stale' : fixtureValid ? 'reference' : 'sample' : 'missing',
        actual, goal, error: finite(actual) && finite(goal) ? actual - goal : null,
        rawPos: actual, rawGoal: goal,
        load: !offline && finite(feedback.load) ? feedback.load : null,
        volt: !offline && finite(feedback.volt) ? feedback.volt : null,
        temp: !offline && finite(feedback.temp) ? feedback.temp : null,
        encoderAngle: position.valid ? position.encoderDeg : null,
        centerAngle: position.valid ? position.centerDeg : null,
        goalEncoderAngle: target.valid ? target.encoderDeg : null,
        goalCenterAngle: target.valid ? target.centerDeg : null,
        referenceReason: position.reason,
        goalReferenceReason: target.reason,
        // Even a matching HD model profile or a local calibration draft is not
        // an authoritative observation of a calibrated physical joint.
        angle: null, actualAngle: null, goalAngle: null,
        angleReason: '实机零位、方向与机械限位尚未确认；参考角不是实际关节角',
        calibrationStatus: 'unknown', calibrationVersion: null,
        zero: null, min: null, max: null, enabled: null
      };
    });
  }

  function activeRows(options) {
    if (referenceMode && !referenceFixture) referenceFixture = profiles.createReferenceFixture(model.metadata);
    return rowsFor(options.store, options.state, referenceMode ? referenceFixture : null);
  }

  function modeLabel() { return referenceMode ? 'HD参考样例 · 未连接' : '只读样例'; }
  function modeNote() {
    return referenceMode ? '独立 HD counts 样例 · 参考角非实机关节角 · 草稿、曲线与 3D 不变' : '原交互样例 ticks · 与 HD counts 无关 · 校准与使能未知';
  }

  function valueTitle(row, key) {
    if (key === 'goalEncoderAngle') return row.goalReferenceReason || '目标回读按型号标称分辨率计算的参考角；不是实机关节目标角';
    if (['encoderAngle', 'centerAngle'].includes(key)) return row.referenceReason || '按型号标称分辨率计算的参考角；不是实机标定角';
    if (key === 'angle') return row.angleReason;
    if (['actual', 'goal', 'error', 'zero'].includes(key)) return `${row.unit} · ${row.profileId || '无型号 profile'} · ${row.source}`;
    return '';
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
    // Keep the original columns in order for existing readers. Their legacy
    // *_ticks labels carry raw values; raw_unit identifies ticks versus counts.
    const columns = ['sample', 'source', 'id', 'joint', 'feedback_state', 'actual_ticks', 'goal_readback_ticks', 'error_ticks', 'raw_load', 'voltage_v', 'temperature_c', 'actual_angle_deg', 'zero_ticks', 'physical_min_deg', 'physical_max_deg', 'enabled', 'raw_unit', 'profile_id', 'raw_position', 'raw_goal_readback', 'encoder_reference_deg', 'center_reference_deg', 'goal_encoder_reference_deg', 'goal_center_reference_deg', 'actual_joint_angle_deg', 'goal_joint_angle_deg', 'calibration_status', 'calibration_version', 'angle_reason', 'reference_reason', 'goal_reference_reason', 'fake', 'simulated', 'hardware_confirmed', 'fixture_id', 'resolution_confirmed', 'single_turn'];
    return columns.join(',') + '\r\n' + rows.map(row => [row.sampleOnly, row.source, row.id, row.raw, row.state, row.actual, row.goal, row.error, row.load, row.volt, row.temp, row.angle, row.zero, row.min, row.max, row.enabled, row.unit, row.profileId, row.rawPos, row.rawGoal, row.encoderAngle, row.centerAngle, row.goalEncoderAngle, row.goalCenterAngle, row.actualAngle, row.goalAngle, row.calibrationStatus, row.calibrationVersion, row.angleReason, row.referenceReason, row.goalReferenceReason, row.fake, row.simulated, row.hardwareConfirmed, row.fixtureId, row.resolutionConfirmed, row.singleTurn].map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  function rowMarkup(row, jointId) {
    const label = stateLabels[row.state];
    return `<tr data-feedback-row="${row.id}" class="${row.id === jointId ? 'selected' : ''}" ${matches(row, filter, query) ? '' : 'hidden'}><th scope="row"><button type="button" data-feedback-select="${row.id}" aria-pressed="${row.id === jointId}" title="${escape(row.raw)}" aria-label="${escape(row.name)}，ID ${row.id}，${escape(row.raw)}"><span class="feedback-id">${row.id}</span><strong>${escape(row.name)}</strong></button></th><td data-feedback-status><span class="feedback-state ${row.state}">${label}</span></td>${fields.map(([key, , , extra]) => `<td data-feedback-value="${key}" title="${escape(valueTitle(row, key))}" ${extra ? `data-feedback-extra ${expanded ? '' : 'hidden'}` : ''}>${numberText(row[key])}</td>`).join('')}</tr>`;
  }

  function render(options) {
    const rows = activeRows(options);
    return `<section class="panel joint-feedback-panel" aria-labelledby="joint-feedback-title"><div class="feedback-heading"><h2 id="joint-feedback-title">全部关节反馈 <span class="badge example" data-feedback-mode-label>${modeLabel()}</span></h2><button type="button" data-feedback-export>↓ CSV 快照</button></div><div class="feedback-toolbar"><div class="feedback-filters" role="group" aria-label="反馈分组">${[['all', '全部关节'], ['left', '左腿'], ['right', '右腿'], ['head', '头颈与嘴部']].map(([value, label]) => `<button type="button" data-feedback-filter="${value}" aria-pressed="${filter === value}">${label}</button>`).join('')}</div><label class="feedback-extra-toggle"><input type="checkbox" data-feedback-columns ${expanded ? 'checked' : ''}>校准与使能列</label><label class="feedback-reference-toggle"><input type="checkbox" data-feedback-reference ${referenceMode ? 'checked' : ''}>HD counts 参考样例</label><label class="feedback-search"><span class="visually-hidden">搜索关节名称或 ID</span><input type="search" data-feedback-search value="${escape(query)}" placeholder="搜索 ID / 关节" aria-label="搜索 ID 或关节"></label></div><div class="feedback-table-scroll" tabindex="0" role="region" aria-label="15 个关节反馈表，可独立滚动"><table class="feedback-table"><thead><tr><th scope="col">关节 / ID</th><th scope="col">反馈状态</th>${fields.map(([, label, unit, extra]) => `<th scope="col" ${extra ? `data-feedback-extra ${expanded ? '' : 'hidden'}` : ''}>${label}${unit ? `<small ${unit === 'raw' ? 'data-feedback-unit' : ''}>${unit === 'raw' ? referenceMode ? 'counts' : 'ticks（样例）' : unit}</small>` : ''}</th>`).join('')}</tr></thead><tbody>${rows.map(row => rowMarkup(row, options.jointId)).join('')}</tbody></table><p class="feedback-empty" data-feedback-empty ${rows.some(row => matches(row, filter, query)) ? 'hidden' : ''}>没有匹配的关节。</p></div><div class="feedback-footnote"><span data-feedback-count>${rows.filter(row => matches(row, filter, query)).length} / 15 个关节</span><span data-feedback-mode-note>${modeNote()}</span><span data-feedback-notice role="status">CSV 导出当前筛选的只读快照。</span></div></section>`;
  }

  function paint() {
    if (!container || !context) return;
    const rows = activeRows(context);
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
      status.textContent = stateLabels[row.state];
      fields.forEach(([key]) => {
        const cell = element.querySelector(`[data-feedback-value="${key}"]`);
        cell.textContent = numberText(row[key]);
        cell.title = valueTitle(row, key);
      });
    });
    container.querySelectorAll('[data-feedback-extra]').forEach(element => { element.hidden = !expanded; });
    container.querySelectorAll('[data-feedback-filter]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.feedbackFilter === filter)); });
    container.querySelector('[data-feedback-count]').textContent = visible + ' / 15 个关节';
    container.querySelector('[data-feedback-empty]').hidden = visible > 0;
    container.querySelector('[data-feedback-mode-label]').textContent = modeLabel();
    container.querySelector('[data-feedback-mode-note]').textContent = modeNote();
    container.querySelector('[data-feedback-reference]').checked = referenceMode;
    container.querySelectorAll('[data-feedback-unit]').forEach(element => { element.textContent = referenceMode ? 'counts' : 'ticks（样例）'; });
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button || !container.contains(button)) return;
    if (button.matches('[data-feedback-filter]')) { filter = button.dataset.feedbackFilter; paint(); }
    else if (button.matches('[data-feedback-select]')) context.onSelect?.(Number(button.dataset.feedbackSelect));
    else if (button.matches('[data-feedback-export]')) {
      const rows = activeRows(context).filter(row => matches(row, filter, query));
      const url = URL.createObjectURL(new Blob(['\uFEFF' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
      const link = root.document.createElement('a');
      link.href = url; link.download = 'Microduck-Hatchery-EXAMPLE-ONLY-joints.csv'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      container.querySelector('[data-feedback-notice]').textContent = `已导出 ${rows.length} 个关节的样例快照；没有发送设备目标。`;
    }
  }

  function input(event) { if (event.target.matches('[data-feedback-search]')) { query = event.target.value; paint(); } }
  function change(event) {
    if (event.target.matches('[data-feedback-columns]')) { expanded = event.target.checked; paint(); }
    else if (event.target.matches('[data-feedback-reference]')) {
      referenceMode = event.target.checked;
      paint();
      container.querySelector('[data-feedback-notice]').textContent = referenceMode ? '仅本表切换为 HD 型号参考样例；未修改任何草稿或实机标定。' : '已回到原交互样例；HD 参考样例未写入反馈 store。';
    }
  }
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
  function snapshot() { return { mounted: Boolean(container), filter, query, expanded, referenceMode, fixtureId: referenceMode ? referenceFixture?.fixtureId : null, jointId: context?.jointId, visibleIds: context ? activeRows(context).filter(row => matches(row, filter, query)).map(row => row.id) : [] }; }

  return Object.freeze({ render, mount, setContext, unmount, snapshot, rowsFor, matches, toCsv });
});
