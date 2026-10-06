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

  function row(joint, mode, activeId) {
    const { id } = joint;
    const range = model.sampleConfig.ranges[id];
    const draft = store.getDraft(id);
    const feedback = store.getFeedback(id, mode);
    const result = resultFor(id);
    const slider = validity(id) ? draft.value : range.initial;
    return `<div data-joint-row="${id}" class="joint-tile ${id === activeId ? 'selected' : ''}">
      <div class="joint-tile-heading"><input type="checkbox" data-joint-select="${id}" aria-label="选择${joint.name}" ${selected(id) ? 'checked' : ''}><button class="joint-select" data-joint="${id}" aria-pressed="${id === activeId}" title="${joint.raw}"><strong>${joint.name}</strong><span>#${id}</span></button></div>
      <div class="joint-draft-controls"><input type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${slider}" data-joint-target-range="${id}" aria-label="${joint.name}样例目标滑块，ticks"><div><button type="button" data-joint-step="${id}" data-delta="-1" aria-label="${joint.name}草稿减少1 tick">−</button><input type="number" min="${range.min}" max="${range.max}" step="${range.step}" value="${escape(draft.value)}" data-joint-target-number="${id}" aria-label="${joint.name}样例目标数字，ticks"><button type="button" data-joint-step="${id}" data-delta="1" aria-label="${joint.name}草稿增加1 tick">+</button><small>ticks · 演示 ${range.min}–${range.max}</small></div></div>
      <div class="joint-tile-feedback"><span>反馈 <strong class="mono" data-joint-feedback="${id}">${feedback.available ? numberText(feedback.value) : '—'}</strong></span><small data-joint-age="${id}">${escape(feedback.ageLabel)}</small></div>
      <div class="joint-tile-state"><span data-joint-draft-state="${id}">${draftStatus(id, true)}</span><small data-joint-feedback-state="${id}">${feedback.valid ? '样例' : feedback.stale ? '陈旧' : '缺测'} · 校准未知</small></div>
      <div class="joint-tile-result"><span data-joint-result="${id}" class="joint-result ${result?.status || ''}">${result ? compactStatusText[result.status] : '尚未检查'}</span><small data-joint-result-reason="${id}" title="${result ? escape(result.reason) : '不代表命令确认'}">${result ? escape(result.reason) : '不代表命令确认'}</small></div>
    </div>`;
  }

  function panel(mode, activeId) {
    const rows = ['左腿', '右腿', '头颈'].map(group => `<section class="joint-limb" aria-label="${group}"><h3>${group === '头颈' ? '头颈与嘴部' : group}<span>5 个关节</span></h3>${model.metadata.filter(joint => joint.group === group).map(joint => row(joint, mode, activeId)).join('')}</section>`).join('');
    return `<section class="panel joint-panel coordination-panel" aria-labelledby="coordination-title">
      <div class="panel-title"><div><h2 id="coordination-title">关节联调</h2><p>15 个物理关节 · 目标草稿与反馈分别保存</p></div><span class="badge example">本地样例</span></div>
      <div class="joint-toolbar">
        <div class="joint-toolbar-line"><label for="joint-selection-range">应用范围</label><select id="joint-selection-range">${[['all', '全部关节'], ['left', '左腿'], ['right', '右腿'], ['head', '头颈与嘴部'], ['none', '取消全选'], ['custom', '自定义']].map(([value, label]) => `<option value="${value}" ${value === scope ? 'selected' : ''}>${label}</option>`).join('')}</select><span id="joint-selection-count" class="small muted">已选 ${store.selectedIds().length} / 15</span></div>
        <details class="joint-extra-tools" ${extraToolsExpanded ? 'open' : ''}><summary>更多草稿操作 · 反馈填入、镜像与姿态</summary>
        <div class="joint-toolbar-line"><button id="joint-fill-feedback" class="button secondary">反馈填入已选草稿</button><button id="joint-refresh-feedback" class="button ghost">刷新样例反馈</button><label class="joint-mirror-label"><input id="joint-mirror" type="checkbox" disabled aria-describedby="joint-mirror-reason">左右镜像</label></div>
        <p id="joint-mirror-reason" class="joint-toolbar-note">镜像不可用：缺少已验证的方向、零位、比例与镜像符号，不直接复制 ticks。</p>
        <details class="joint-pose-tools" ${poseExpanded ? 'open' : ''}><summary>姿态草稿 · 保存与加载（仅改草稿）</summary>
        <div class="joint-toolbar-line joint-pose-controls"><label for="joint-pose-select">姿态草稿</label><select id="joint-pose-select">${poses.map(item => `<option value="${item.key}" ${item.key === poseKey ? 'selected' : ''}>${escape(item.pose.name)}</option>`).join('')}</select><button id="joint-load-pose" class="button secondary">加载到已选草稿</button></div>
        <div class="joint-toolbar-line joint-pose-controls"><input id="joint-pose-name" type="text" maxlength="60" value="${escape(poseName)}" aria-label="保存姿态名称" placeholder="姿态名称"><button id="joint-save-pose" class="button secondary">保存全部草稿</button></div>
        <p class="joint-toolbar-note">姿态保留映射、单位与样例校准版本；仅存在本页面会话中，刷新后清空。加载只改草稿。</p></details></details>
        <div class="joint-toolbar-line joint-apply-controls"><button id="joint-apply-example" class="button primary" ${store.selectedIds().length ? '' : 'disabled'}>样例应用已选草稿</button><button id="joint-apply-hardware" class="button secondary" disabled>实机应用（未连接）</button></div>
        <p class="joint-toolbar-note">样例应用仅做本地逐项检查，不执行动作。编辑范围是演示配置，实机限位未知。</p>
      </div>
      <div id="joint-coordination-scroll" class="coordination-board" role="region" aria-label="15关节联调大面板，全部展开，无内部滚动">${rows}</div>
      <div class="joint-batch-box"><p id="joint-batch-result" role="status" aria-live="polite">${escape(store.snapshot().lastBatch?.summary || '尚未应用样例草稿；没有发送设备请求。')}</p><p id="joint-operation-notice" role="status" aria-live="polite">${escape(notice)}</p><details id="joint-operation-details" ${noticeItems.length ? '' : 'hidden'}><summary>逐关节草稿操作结果</summary><ul>${noticeItems.map(item => `<li>${escape(item)}</li>`).join('')}</ul></details></div>
      <p class="joint-note">左腿 → 右腿 → 头颈与嘴部；未选或缺测关节仍保留。实机反馈待接入；当前仅左膝有生成样例。</p>
    </section>`;
  }

  function detailControls(id) {
    const joint = model.metadata.find(item => item.id === id);
    const draft = store.getDraft(id);
    const result = resultFor(id);
    return `<div class="command-box"><h3>当前目标草稿</h3><p class="joint-detail-draft"><strong data-detail-draft>${draft.value === null ? '—' : escape(draft.value)} ticks</strong><span data-detail-draft-state>${draftStatus(id)}</span></p><p>实机方向 / 零位 / 限位未知；草稿尚未发送到设备。</p><dl class="joint-index-list"><div><dt>显示序号</dt><dd>${joint.displayOrder}</dd></div><div><dt>物理运行时索引</dt><dd>${joint.runtimeIndex}</dd></div><div><dt>策略索引</dt><dd>${joint.policyIndex === null ? '无 · 嘴部独立控制' : joint.policyIndex}</dd></div></dl><p data-detail-result>${result ? statusText[result.status] + '：' + escape(result.reason) : '尚无样例检查结果；接收、应用、反馈与物理到位待设备端确认。'}</p><div class="button-row"><button class="button primary" disabled>发送目标</button><button class="button secondary" disabled>关闭舵机使能</button><button class="button secondary" disabled>停止序列</button></div><p>关闭使能、停止序列与停止记录分别定义；release 不是停止或硬件急停。</p></div>`;
  }

  function applySidebarLayout(grid, sidebar, button) {
    const collapsed = sidebarPreference ?? window.innerWidth <= 1120;
    sidebar.hidden = collapsed;
    grid.classList.toggle('sidebar-collapsed', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    button.textContent = collapsed ? '展开导航' : '收起导航';
  }

  function render(baseMarkup, options) {
    const template = document.createElement('template');
    template.innerHTML = baseMarkup;
    const wrap = template.content.querySelector('.console-wrap');
    wrap.classList.toggle('wide-console', currentMode === 'joint');
    const grid = template.content.querySelector('.console-grid');
    grid.classList.toggle('coordination-grid', currentMode === 'joint');
    const tabs = document.createElement('div');
    tabs.className = 'joint-view-switch';
    tabs.setAttribute('aria-label', '关节调试视图');
    tabs.innerHTML = `<button id="joint-view-joint" data-console-view="joint" aria-pressed="${currentMode === 'joint'}">关节联调</button><button id="joint-view-single" data-console-view="single" aria-pressed="${currentMode === 'single'}">单关节调试</button><button id="console-sidebar-toggle" aria-controls="console-sidebar">收起导航</button><span>草稿保留在本页面会话中 · 实机未连接</span>`;
    wrap.insertBefore(tabs, grid);
    const sidebar = grid.querySelector('.console-sidebar');
    sidebar.id = 'console-sidebar';
    applySidebarLayout(grid, sidebar, tabs.querySelector('#console-sidebar-toggle'));
    if (currentMode === 'joint') {
      const replacement = document.createElement('template');
      replacement.innerHTML = panel(options.state, options.jointId);
      grid.querySelector('.joint-panel').replaceWith(replacement.content);
    }
    const feedback = store.getFeedback(options.jointId, options.state);
    const metrics = template.content.querySelectorAll('.metric');
    metrics[0].innerHTML = `<span>样例位置回读</span><strong>${feedback.available ? numberText(feedback.value) : '—'}<small>ticks</small></strong>`;
    metrics[1].innerHTML = `<span>样例目标回读</span><strong>${feedback.available ? numberText(feedback.goal) : '—'}<small>ticks</small></strong>`;
    const controls = document.createElement('template');
    controls.innerHTML = detailControls(options.jointId);
    template.content.querySelector('.command-box').replaceWith(controls.content);
    if (feedback.available) template.content.querySelector('.detail-chart .chart-controls span').textContent = '生成样例曲线 · 不跟随当前草稿';
    if (currentMode === 'joint') {
      const workspace = document.createElement('div');
      workspace.className = 'coordination-workspace';
      const mainColumn = document.createElement('div');
      mainColumn.className = 'coordination-controls';
      mainColumn.append(grid.querySelector('.joint-panel'));
      const monitor = document.createElement('div');
      monitor.className = 'coordination-monitor';
      const charts = document.createElement('div');
      charts.id = 'joint-charts';
      charts.innerHTML = window.JointCharts.render({ jointId: options.jointId, state: options.state });
      const detail = grid.querySelector('.console-detail');
      detail.querySelector('.detail-chart').remove();
      monitor.append(charts, detail);
      workspace.append(mainColumn, monitor);
      grid.append(workspace);
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
      const number = rowElement.querySelector('[data-joint-target-number]');
      const slider = rowElement.querySelector('[data-joint-target-range]');
      if (number !== sourceInput && number !== document.activeElement) number.value = draft.value ?? '';
      if (slider !== sourceInput && slider !== document.activeElement && validity(id)) slider.value = draft.value;
      slider.setAttribute('aria-invalid', String(!validity(id)));
      number.setAttribute('aria-invalid', String(!validity(id)));
      rowElement.querySelector('[data-joint-select]').checked = selected(id);
      rowElement.querySelector('[data-joint-feedback]').textContent = feedback.available ? numberText(feedback.value) : '—';
      rowElement.querySelector('[data-joint-age]').textContent = feedback.ageLabel;
      rowElement.querySelector('[data-joint-draft-state]').textContent = draftStatus(id, true);
      rowElement.querySelector('[data-joint-feedback-state]').textContent = `${feedback.valid ? '样例' : feedback.stale ? '陈旧' : '缺测'} · 校准未知`;
      const result = snapshot.results[id];
      const resultElement = rowElement.querySelector('[data-joint-result]');
      resultElement.textContent = result ? compactStatusText[result.status] : '尚未检查';
      resultElement.className = 'joint-result ' + (result?.status || '');
      rowElement.querySelector('[data-joint-result-reason]').textContent = result?.reason || '不代表命令确认';
      rowElement.querySelector('[data-joint-result-reason]').title = result?.reason || '不代表命令确认';
      rowElement.classList.toggle('selected', id === activeId);
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
    const detailResult = document.querySelector('[data-detail-result]');
    if (detailResult) {
      const result = snapshot.results[activeId];
      detailResult.textContent = result ? statusText[result.status] + '：' + result.reason : '尚无样例检查结果；接收、应用、反馈与物理到位待设备端确认。';
    }
    const feedback = store.getFeedback(activeId, mode);
    const metricValues = document.querySelectorAll('.metrics .metric strong');
    [feedback.value, feedback.goal, feedback.volt].forEach((value, index) => {
      if (metricValues[index]) metricValues[index].innerHTML = `${feedback.available ? numberText(value) : '—'}<small>${index === 2 ? 'V' : 'ticks'}</small>`;
    });
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
    if (element.matches('[data-console-view]')) {
      if (currentMode !== element.dataset.consoleView) {
        rememberScroll();
        currentMode = element.dataset.consoleView;
        options.redraw();
        restoreScroll();
        document.querySelector(`#joint-view-${currentMode}`)?.focus({ preventScroll: true });
      }
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

  return { store, render, sync, handleClick, handleInput, handleChange, rememberScroll, restoreScroll, mode: () => currentMode };
})();
