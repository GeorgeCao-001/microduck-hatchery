'use strict';

// Local draft editing and sample inspection only. This module has no transport.
window.JointConsole = (() => {
  const model = window.JointDrafts;
  const store = model.createStore();
  const poses = [{ key: 'initial', pose: store.savePose('样例初始草稿') }];
  const scrollPositions = { joint: 0, single: 0 };
  let currentMode = 'joint';
  let scope = 'all';
  let poseKey = 'initial';
  let poseName = '';
  let poseExpanded = false;
  let extraToolsExpanded = false;
  let sidebarPreference = null;
  let notice = '仅编辑本地样例草稿；没有设备会话、控制权或实机校准。';
  let noticeItems = [];

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const numberText = value => typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
  const selected = id => store.selectedIds().includes(id);
  const resultFor = id => store.snapshot().results[id];
  const statusText = { passed: '样例检查通过', skipped: '样例已跳过', failed: '样例检查失败' };
  const compactStatusText = { passed: '样例通过', skipped: '样例跳过', failed: '样例失败' };

  function validity(id) {
    const value = store.getDraft(id).value;
    const range = model.sampleConfig.ranges[id];
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
      && value >= range.min && value <= range.max;
  }

  function draftStatus(id, compact = false) {
    const draft = store.getDraft(id);
    if (!validity(id)) return compact ? '草稿无效' : '草稿无效 · 检查演示范围';
    const batch = store.snapshot().lastBatch;
    const previous = batch?.targets.find(target => target.id === id);
    if (previous && previous.version !== draft.version) return compact ? '有新草稿' : '有新草稿 · 尚未检查';
    return compact ? `草稿 v${draft.version}` : `样例草稿 · v${draft.version}`;
  }

  function draftNeedsAttention(id) {
    const previous = store.snapshot().lastBatch?.targets.find(target => target.id === id);
    return !validity(id) || Boolean(previous && previous.version !== store.getDraft(id).version);
  }

  function feedbackMarker(id, mode) {
    const feedback = store.getFeedback(id, mode);
    const range = model.sampleConfig.ranges[id];
    const inRange = feedback.available && Number.isFinite(feedback.value)
      && feedback.value >= range.min && feedback.value <= range.max;
    return {
      visible: inRange,
      percentage: inRange ? (feedback.value - range.min) / (range.max - range.min) * 100 : 0,
      label: feedback.available ? `样例实测 ${numberText(feedback.value)} ticks${feedback.stale ? ' · 陈旧' : ''}` : '没有实测位置',
      state: `${feedback.available ? feedback.stale ? '陈旧样例' : '样例反馈' : '缺测'}${feedback.available && !inRange ? ' · 超演示范围' : ''}`
    };
  }

  function draftEditor(joint, mode) {
    const { id } = joint;
    const range = model.sampleConfig.ranges[id];
    const draft = store.getDraft(id);
    const marker = feedbackMarker(id, mode);
    const slider = validity(id) ? draft.value : range.initial;
    return `<div class="joint-draft-controls">
      <div class="joint-slider-track"><input type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${slider}" data-joint-target-range="${id}" aria-invalid="${!validity(id)}" aria-label="${joint.name}样例目标滑块，ticks"><div class="joint-feedback-meter" aria-hidden="true"><span data-joint-feedback-marker="${id}" class="joint-feedback-marker${store.getFeedback(id, mode).stale ? ' stale' : ''}" style="left:${marker.percentage}%" title="${escape(marker.label)}" ${marker.visible ? '' : 'hidden'}></span></div></div>
      <div class="joint-number-controls"><button type="button" data-joint-step="${id}" data-delta="-1" aria-label="${joint.name}草稿减少1 tick">−</button><input type="number" min="${range.min}" max="${range.max}" step="${range.step}" value="${escape(draft.value)}" data-joint-target-number="${id}" aria-invalid="${!validity(id)}" aria-label="${joint.name}样例目标数字，ticks"><button type="button" data-joint-step="${id}" data-delta="1" aria-label="${joint.name}草稿增加1 tick">+</button></div>
    </div>`;
  }

  function row(joint, mode, activeId) {
    const { id } = joint;
    const feedback = store.getFeedback(id, mode);
    const result = resultFor(id);
    return `<div data-joint-row="${id}" class="joint-servo-row ${id === activeId ? 'selected' : ''}">
      <div class="joint-row-heading"><input type="checkbox" data-joint-select="${id}" aria-label="选择${joint.name}" ${selected(id) ? 'checked' : ''}><button class="joint-select" data-joint="${id}" aria-pressed="${id === activeId}" title="${joint.raw}"><strong>${joint.name}</strong><span>#${id}</span></button></div>
      ${draftEditor(joint, mode)}
      <div class="joint-row-feedback"><span>实测 <strong class="mono" data-joint-feedback="${id}">${numberText(feedback.value)}</strong></span><span title="目标回读，ticks" aria-label="目标回读，ticks">回读 <strong class="mono" data-joint-measurement="goal">${numberText(feedback.goal)}</strong></span><span title="负载原始值，raw load" aria-label="负载原始值，raw load">负载 <strong class="mono" data-joint-measurement="load">${numberText(feedback.load)}</strong></span><span><strong class="mono" data-joint-measurement="volt">${numberText(feedback.volt)}</strong> V</span><span><strong class="mono" data-joint-measurement="temp">${numberText(feedback.temp)}</strong> °C</span><span data-joint-age="${id}">${escape(feedback.available || mode === 'offline' ? feedback.ageLabel : '')}</span><span data-joint-feedback-state="${id}">${feedbackMarker(id, mode).state}</span><details class="joint-inline-result" data-joint-result-details ${result ? '' : 'hidden'}><summary data-joint-result="${id}" class="joint-result ${result?.status || ''}">${result ? compactStatusText[result.status] : ''}</summary><p data-joint-result-reason="${id}">${escape(result?.reason || '')}</p></details><span data-joint-result-empty ${result ? 'hidden' : ''}>尚未检查</span></div>
      <div class="joint-row-attention" data-joint-draft-state="${id}" ${draftNeedsAttention(id) ? '' : 'hidden'}>${draftStatus(id, true)}</div>
    </div>`;
  }

  function panel(mode, activeId) {
    const rows = ['左腿', '右腿', '头颈'].map(group => `<section class="joint-limb" aria-label="${group}"><h3>${group === '头颈' ? '头颈与嘴部' : group}<span>5 个关节</span></h3>${model.metadata.filter(joint => joint.group === group).map(joint => row(joint, mode, activeId)).join('')}</section>`).join('');
    return `<section class="panel joint-panel coordination-panel" aria-labelledby="coordination-title">
      <div class="panel-title"><div><h2 id="coordination-title">关节联调</h2></div><span class="badge example">本地样例 · 未连接</span></div>
      <div class="joint-toolbar">
        <div class="joint-toolbar-line"><label for="joint-selection-range">应用范围</label><select id="joint-selection-range">${[['all', '全部关节'], ['left', '左腿'], ['right', '右腿'], ['head', '头颈与嘴部'], ['none', '取消全选'], ['custom', '自定义']].map(([value, label]) => `<option value="${value}" ${value === scope ? 'selected' : ''}>${label}</option>`).join('')}</select><span id="joint-selection-count" class="small muted">已选 ${store.selectedIds().length} / 15</span></div>
        <div class="joint-toolbar-line joint-apply-controls"><button id="joint-apply-example" class="button primary" ${store.selectedIds().length ? '' : 'disabled'}>样例应用已选草稿</button><button id="joint-fill-feedback" class="button secondary">反馈填入已选草稿</button><button id="joint-apply-hardware" class="button secondary" disabled>实机应用</button></div>
        <div class="joint-toolbar-line joint-hardware-controls"><button class="button secondary" disabled title="未连接设备，真实使能状态未知">全部使能</button><button class="button secondary" disabled title="未连接设备；关闭使能不等同于停止或急停">全部关闭使能</button><button id="joint-refresh-feedback" class="button ghost">刷新样例反馈</button></div>
        <details class="joint-extra-tools" ${extraToolsExpanded ? 'open' : ''}><summary>姿态草稿与镜像</summary>
        <div class="joint-toolbar-line"><label class="joint-mirror-label"><input id="joint-mirror" type="checkbox" disabled aria-describedby="joint-mirror-reason">左右镜像</label></div>
        <p id="joint-mirror-reason" class="joint-toolbar-note">镜像不可用：缺少已验证的方向、零位、比例与镜像符号，不直接复制 ticks。</p>
        <details class="joint-pose-tools" ${poseExpanded ? 'open' : ''}><summary>姿态草稿 · 保存与加载（仅改草稿）</summary>
        <div class="joint-toolbar-line joint-pose-controls"><label for="joint-pose-select">姿态草稿</label><select id="joint-pose-select">${poses.map(item => `<option value="${item.key}" ${item.key === poseKey ? 'selected' : ''}>${escape(item.pose.name)}</option>`).join('')}</select><button id="joint-load-pose" class="button secondary">加载到已选草稿</button></div>
        <div class="joint-toolbar-line joint-pose-controls"><input id="joint-pose-name" type="text" maxlength="60" value="${escape(poseName)}" aria-label="保存姿态名称" placeholder="姿态名称"><button id="joint-save-pose" class="button secondary">保存全部草稿</button></div>
        <p class="joint-toolbar-note">姿态保留映射、单位与样例校准版本；仅存在本页面会话中，刷新后清空。加载只改草稿。</p></details></details>
      </div>
      <div class="joint-edit-legend"><span>滑块：目标草稿</span><span><i class="joint-marker-key" aria-hidden="true"></i>三角：实测 ticks</span><span>回读：目标回读 ticks · 负载：raw load</span><span>使能 / 校准 / 限位未知 · 编辑不发送</span></div>
      <div id="joint-coordination-scroll" class="coordination-board" role="region" aria-label="15关节联调面板，全部展开，无内部滚动">${rows}</div>
      <div class="joint-batch-box"><p id="joint-batch-result" role="status" aria-live="polite">${escape(store.snapshot().lastBatch?.summary || '尚未应用样例草稿；没有发送设备请求。')}</p><p id="joint-operation-notice" role="status" aria-live="polite">${escape(notice)}</p><details id="joint-operation-details" ${noticeItems.length ? '' : 'hidden'}><summary>逐关节草稿操作结果</summary><ul>${noticeItems.map(item => `<li>${escape(item)}</li>`).join('')}</ul></details></div>
      <div class="joint-panel-footer"><p class="joint-note">15 关节完整保留，样例检查不代表命令确认；实测超范围隐藏标记，完整原因可在逐项结果中展开。</p><a id="joint-open-single" class="button secondary" href="#console/servos/single">查看 <span data-joint-current-name>${escape(model.metadata.find(joint => joint.id === activeId)?.name || '')}</span> · 单舵机详情</a><a class="button secondary" href="#console/charts">打开曲线页</a></div>
    </section>`;
  }

  function detailControls(id, mode) {
    const joint = model.metadata.find(item => item.id === id);
    const draft = store.getDraft(id);
    const result = resultFor(id);
    const range = model.sampleConfig.ranges[id];
    const feedback = store.getFeedback(id, mode);
    const measurements = { actual: feedback.value, goal: feedback.goal, load: feedback.load, volt: feedback.volt, temp: feedback.temp,
      error: Number.isFinite(feedback.value) && Number.isFinite(feedback.goal) ? feedback.value - feedback.goal : null };
    return `<div class="command-box workbench-content" data-joint-row="${id}">
      <div class="workbench-heading"><h2>关节工作台</h2><span class="badge draft">实机校准未知</span></div>
      <div class="workbench-position"><label>选择关节<select data-workbench-joint aria-label="工作台关节">${['左腿', '右腿', '头颈'].map(group => `<optgroup label="${group === '头颈' ? '头颈与嘴部' : group}">${model.metadata.filter(item => item.group === group).map(item => `<option value="${item.id}" ${item.id === id ? 'selected' : ''}>${item.id} · ${item.name}</option>`).join('')}</optgroup>`).join('')}</select></label><div><span>样例实测 / ticks</span><strong data-workbench-value="actual">${numberText(measurements.actual)}</strong></div><div><span>实际角度 / °</span><strong>—</strong></div></div>
      <div class="workbench-measurements">${[['goal', '目标回读', 'ticks'], ['error', '跟踪误差', 'ticks'], ['load', '负载原始值', 'raw load'], ['volt', '电压', 'V'], ['temp', '温度', '°C']].map(([key, name, unit]) => `<div><span>${name} <small>${unit}</small></span><strong data-workbench-value="${key}">${numberText(measurements[key])}</strong></div>`).join('')}</div>
      <section class="workbench-section workbench-target"><div class="workbench-section-heading"><h3>目标草稿 <small>ticks</small></h3><span data-detail-draft-state>${draftStatus(id)}</span></div>${draftEditor(joint, mode)}<p class="workbench-hint">演示范围 ${range.min}–${range.max} ticks · 黄色三角为样例实测 · 编辑不发送</p><div class="workbench-actions"><button class="button primary" disabled>发送目标</button><button class="button secondary" disabled>关闭使能</button><button class="button secondary" disabled>停止序列</button></div></section>
      <section class="workbench-section"><div class="workbench-section-heading"><h3>实际关节校准</h3><span>待设备数据</span></div><dl class="workbench-calibration">${[['零位 / ticks', '—'], ['编码器正方向', '—'], ['实际最小角 / °', '—'], ['实际最大角 / °', '—']].map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('')}</dl><p class="workbench-hint">尚无实机方向、零位和比例；3D 样例角度不作为校准值。</p></section>
      <details class="workbench-details"><summary>索引与执行结果</summary><dl class="joint-index-list"><div><dt>显示序号</dt><dd>${joint.displayOrder}</dd></div><div><dt>物理运行时索引</dt><dd>${joint.runtimeIndex}</dd></div><div><dt>策略索引</dt><dd>${joint.policyIndex === null ? '无 · 嘴部独立控制' : joint.policyIndex}</dd></div></dl><p data-detail-result>${result ? statusText[result.status] + '：' + escape(result.reason) : '尚无样例检查结果；未发送设备命令。'}</p><p>关闭使能、停止序列与停止记录分别定义；release 不是停止或硬件急停。</p></details>
    </div>`;
  }

  function applySidebarLayout(grid, sidebar, button) {
    if (!grid || !sidebar || !button) return;
    const collapsed = sidebarPreference ?? window.innerWidth <= 1120;
    sidebar.hidden = collapsed;
    grid.classList.toggle('sidebar-collapsed', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    button.textContent = collapsed ? '展开导航' : '收起导航';
  }

  function render(baseMarkup, options) {
    if (options.view === 'joint' || options.view === 'single') currentMode = options.view;
    const template = document.createElement('template');
    template.innerHTML = baseMarkup;
    const wrap = template.content.querySelector('.console-wrap');
    wrap.classList.toggle('wide-console', currentMode === 'joint');
    const grid = template.content.querySelector('.console-grid');
    grid.classList.toggle('coordination-grid', currentMode === 'joint');
    const tabs = document.createElement('div');
    tabs.className = 'console-navigation-tools';
    tabs.innerHTML = '<button id="console-sidebar-toggle" aria-controls="console-sidebar">收起导航</button><span>草稿保留在本页面会话中 · 实机未连接</span>';
    wrap.insertBefore(tabs, grid);
    const sidebar = grid.querySelector('.console-sidebar');
    sidebar.id = 'console-sidebar';
    applySidebarLayout(grid, sidebar, tabs.querySelector('#console-sidebar-toggle'));
    if (currentMode === 'joint') {
      const replacement = document.createElement('template');
      replacement.innerHTML = panel(options.state, options.jointId);
      grid.querySelector('.joint-panel').replaceWith(replacement.content);
      grid.querySelector('.console-detail')?.remove();
    } else {
      grid.querySelector('.joint-panel .panel-title h2').textContent = '单舵机调试';
      for (const button of grid.querySelectorAll('.joint-table [data-joint]')) {
        const rowElement = button.closest('tr');
        const id = Number(button.dataset.joint);
        rowElement.dataset.jointRow = id;
        rowElement.cells[1].dataset.jointFeedback = id;
        rowElement.cells[2].dataset.jointTemperature = id;
        rowElement.cells[3].dataset.jointFeedbackState = id;
      }
      const feedback = store.getFeedback(options.jointId, options.state);
      const metrics = template.content.querySelectorAll('.metric');
      metrics[0].innerHTML = `<span>样例位置回读</span><strong>${feedback.available ? numberText(feedback.value) : '—'}<small>ticks</small></strong>`;
      metrics[1].innerHTML = `<span>样例目标回读</span><strong>${feedback.available ? numberText(feedback.goal) : '—'}<small>ticks</small></strong>`;
      metrics[2].innerHTML = `<span>样例电压</span><strong>${feedback.available ? numberText(feedback.volt) : '—'}<small>V</small></strong>`;
      const controls = document.createElement('template');
      controls.innerHTML = detailControls(options.jointId, options.state);
      template.content.querySelector('.command-box').replaceWith(controls.content);
      template.content.querySelector('.detail-chart')?.remove();
    }
    return template.innerHTML;
  }

  function rememberScroll() {
    scrollPositions[currentMode] = document.querySelector('.joint-list-scroll')?.scrollTop || 0;
  }

  function restoreScroll() {
    const list = document.querySelector('.joint-list-scroll');
    if (list) list.scrollTop = scrollPositions[currentMode];
  }

  function sync(mode, activeId, sourceInput = null) {
    const snapshot = store.snapshot();
    for (const joint of model.metadata) {
      const id = joint.id;
      const rowElement = document.querySelector(`[data-joint-row="${id}"]`);
      if (!rowElement) continue;
      const draft = store.getDraft(id);
      const feedback = store.getFeedback(id, mode);
      for (const number of document.querySelectorAll(`[data-joint-target-number="${id}"]`)) {
        if (number !== sourceInput && number !== document.activeElement) number.value = draft.value ?? '';
        number.setAttribute('aria-invalid', String(!validity(id)));
      }
      for (const slider of document.querySelectorAll(`[data-joint-target-range="${id}"]`)) {
        if (slider !== sourceInput && slider !== document.activeElement && validity(id)) slider.value = draft.value;
        slider.setAttribute('aria-invalid', String(!validity(id)));
      }
      const marker = feedbackMarker(id, mode);
      for (const indicator of document.querySelectorAll(`[data-joint-feedback-marker="${id}"]`)) {
        indicator.hidden = !marker.visible;
        indicator.style.left = `${marker.percentage}%`;
        indicator.title = marker.label;
        indicator.classList.toggle('stale', feedback.stale);
      }
      const checkbox = rowElement.querySelector('[data-joint-select]');
      if (checkbox) checkbox.checked = selected(id);
      const feedbackValue = rowElement.querySelector('[data-joint-feedback]');
      if (feedbackValue) feedbackValue.textContent = feedback.available ? numberText(feedback.value) : '—';
      const temperature = rowElement.querySelector('[data-joint-temperature]');
      if (temperature) temperature.textContent = feedback.available ? numberText(feedback.temp) : '—';
      for (const field of ['goal', 'load', 'volt', 'temp']) {
        const element = rowElement.querySelector(`[data-joint-measurement="${field}"]`);
        if (element) element.textContent = numberText(feedback[field]);
      }
      const age = rowElement.querySelector('[data-joint-age]');
      if (age) age.textContent = feedback.available || mode === 'offline' ? feedback.ageLabel : '';
      const draftState = rowElement.querySelector('[data-joint-draft-state]');
      if (draftState) { draftState.textContent = draftStatus(id, true); draftState.hidden = !draftNeedsAttention(id); }
      const feedbackState = rowElement.querySelector('[data-joint-feedback-state]');
      if (feedbackState) feedbackState.textContent = marker.state;
      const result = snapshot.results[id];
      const resultElement = rowElement.querySelector('[data-joint-result]');
      if (resultElement) {
        resultElement.textContent = result ? compactStatusText[result.status] : '尚未检查';
        resultElement.className = 'joint-result ' + (result?.status || '');
      }
      const reason = rowElement.querySelector('[data-joint-result-reason]');
      if (reason) { reason.textContent = result?.reason || ''; reason.title = result?.reason || '不代表命令确认'; }
      const resultDetails = rowElement.querySelector('[data-joint-result-details]');
      if (resultDetails) resultDetails.hidden = !result;
      const resultEmpty = rowElement.querySelector('[data-joint-result-empty]');
      if (resultEmpty) resultEmpty.hidden = Boolean(result);
      rowElement.classList.toggle('selected', id === activeId);
      rowElement.querySelector('[data-joint]')?.setAttribute('aria-pressed', String(id === activeId));
    }
    const count = document.querySelector('#joint-selection-count');
    if (count) count.textContent = `已选 ${snapshot.selectedIds.length} / 15`;
    const rangeSelect = document.querySelector('#joint-selection-range');
    if (rangeSelect) rangeSelect.value = scope;
    const apply = document.querySelector('#joint-apply-example');
    if (apply) apply.disabled = !snapshot.selectedIds.length;
    const batchResult = document.querySelector('#joint-batch-result');
    if (batchResult) batchResult.textContent = snapshot.lastBatch?.summary || '尚未应用样例草稿；没有发送设备请求。';
    const draftDetail = document.querySelector('[data-detail-draft]');
    if (draftDetail) draftDetail.textContent = `${store.getDraft(activeId).value ?? '—'} ticks`;
    const draftDetailState = document.querySelector('[data-detail-draft-state]');
    if (draftDetailState) draftDetailState.textContent = draftStatus(activeId);
    const currentName = document.querySelector('[data-joint-current-name]');
    if (currentName) currentName.textContent = model.metadata.find(joint => joint.id === activeId)?.name || '';
    const detailResult = document.querySelector('[data-detail-result]');
    if (detailResult) {
      const result = snapshot.results[activeId];
      detailResult.textContent = result ? statusText[result.status] + '：' + result.reason : '尚无样例检查结果；接收、应用、反馈与物理到位待设备端确认。';
    }
    const feedback = store.getFeedback(activeId, mode);
    const workbenchValues = { actual: feedback.value, goal: feedback.goal, load: feedback.load, volt: feedback.volt, temp: feedback.temp,
      error: Number.isFinite(feedback.value) && Number.isFinite(feedback.goal) ? feedback.value - feedback.goal : null };
    for (const [key, value] of Object.entries(workbenchValues)) {
      const field = document.querySelector(`[data-workbench-value="${key}"]`);
      if (field) field.textContent = numberText(value);
    }
    const metricValues = document.querySelectorAll('.metrics .metric strong');
    [feedback.value, feedback.goal, feedback.volt].forEach((value, index) => {
      if (metricValues[index]) metricValues[index].innerHTML = `${feedback.available ? numberText(value) : '—'}<small>${index === 2 ? 'V' : 'ticks'}</small>`;
    });
    // A display notification only: viewers read the existing draft/feedback
    // layers and never use this event to write a target or control hardware.
    window.dispatchEvent(new CustomEvent('joint-draft-change'));
  }

  function showOperation(title, result) {
    notice = `${title}：更新 ${result.applied.length} 项，跳过 ${result.skipped.length} 项；只改草稿。`;
    noticeItems = [...result.applied.map(item => `#${item.id} 已更新草稿`), ...result.skipped.map(item => `#${item.id} 跳过：${item.reason}`)];
    const element = document.querySelector('#joint-operation-notice');
    if (element) element.textContent = notice;
    const details = document.querySelector('#joint-operation-details');
    if (details) {
      details.hidden = !noticeItems.length;
      details.querySelector('ul').innerHTML = noticeItems.map(item => `<li>${escape(item)}</li>`).join('');
    }
  }

  function refreshPoses() {
    const select = document.querySelector('#joint-pose-select');
    if (select) select.innerHTML = poses.map(item => `<option value="${item.key}" ${item.key === poseKey ? 'selected' : ''}>${escape(item.pose.name)}</option>`).join('');
  }

  function handleClick(element, options) {
    if (element.id === 'console-sidebar-toggle') {
      sidebarPreference = element.getAttribute('aria-expanded') === 'true';
      applySidebarLayout(document.querySelector('.console-grid'), document.querySelector('#console-sidebar'), element);
      return true;
    }
    if (element.matches('[data-joint-step]')) {
      const id = Number(element.dataset.jointStep);
      const value = store.getDraft(id).value;
      if (typeof value === 'number' && Number.isFinite(value)) store.setDraft(id, value + Number(element.dataset.delta));
      sync(options.state, options.jointId);
      return true;
    }
    if (element.id === 'joint-refresh-feedback') {
      store.refreshSampleFeedback();
      sync(options.state, options.jointId);
      options.toast('已刷新生成样例反馈；目标草稿保持原值。');
      return true;
    }
    if (element.id === 'joint-fill-feedback') {
      showOperation('反馈填入已选草稿', store.fillFromFeedback(options.state));
      sync(options.state, options.jointId);
      return true;
    }
    if (element.id === 'joint-save-pose') {
      const name = poseName.trim() || `样例姿态 ${poses.length}`;
      const key = 'pose-' + poses.length;
      poses.push({ key, pose: store.savePose(name) });
      poseKey = key;
      refreshPoses();
      options.toast('已保存全部目标草稿及版本元信息；未执行动作。');
      return true;
    }
    if (element.id === 'joint-load-pose') {
      const pose = poses.find(item => item.key === poseKey)?.pose;
      if (pose) showOperation('加载姿态到已选草稿', store.loadPose(pose));
      sync(options.state, options.jointId);
      return true;
    }
    if (element.id === 'joint-apply-example') {
      store.previewApply(options.state);
      sync(options.state, options.jointId);
      return true;
    }
    return false;
  }

  function handleInput(input, options) {
    if (input.matches('[data-joint-target-number], [data-joint-target-range]')) {
      const id = Number(input.dataset.jointTargetNumber || input.dataset.jointTargetRange);
      store.setDraft(id, input.value === '' ? null : Number(input.value));
      sync(options.state, options.jointId, input);
      return true;
    }
    if (input.id === 'joint-pose-name') { poseName = input.value; return true; }
    return false;
  }

  function handleChange(input, options) {
    if (input.matches('[data-workbench-joint]')) {
      const id = Number(input.value);
      if (model.metadata.some(joint => joint.id === id)) options.onSelect?.(id);
      return true;
    }
    if (input.matches('[data-joint-select]')) {
      store.select(Number(input.dataset.jointSelect), input.checked);
      scope = 'custom';
      sync(options.state, options.jointId);
      return true;
    }
    if (input.id === 'joint-selection-range') {
      scope = input.value;
      if (scope !== 'custom') store.setSelection(scope);
      sync(options.state, options.jointId);
      return true;
    }
    if (input.id === 'joint-pose-select') { poseKey = input.value; return true; }
    return false;
  }

  document.addEventListener('toggle', event => {
    if (event.target.matches?.('.joint-pose-tools')) poseExpanded = event.target.open;
    if (event.target.matches?.('.joint-extra-tools')) extraToolsExpanded = event.target.open;
  }, true);

  window.addEventListener('resize', () => {
    const button = document.querySelector('#console-sidebar-toggle');
    if (button) applySidebarLayout(document.querySelector('.console-grid'), document.querySelector('#console-sidebar'), button);
  });

  return { store, render, detailControls, sync, handleClick, handleInput, handleChange, rememberScroll, restoreScroll, mode: () => currentMode };
})();
