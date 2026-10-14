(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ConsoleWorkspace = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  // Page navigation and a browser sample session. No device transport or commands.
  const stateNames = { example: '示例数据', offline: '未连接', stale: '数据陈旧', readonly: '只读' };
  const stateDescriptions = {
    example: '示例视图 · 所有数值与日志由原型生成，未连接设备。',
    offline: '未连接设备 · 尚未取得服务信息或实时状态。',
    stale: '数据陈旧 · 仅保留最后一次样例回读，实机操作不可用。',
    readonly: '只读样例视图 · 未连接设备，实机操作不可用。'
  };
  const servoViews = ['joint', 'single', 'parameters'];
  const titles = { joint: '关节联调', single: '单舵机调试', parameters: '参数与标定', charts: '曲线', overview: '总控', device: '设备', sensors: '传感器', logs: '日志' };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const numberText = value => typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
  let context = null;

  function resolve(hash) {
    const parts = String(hash || '').replace(/^#/, '').split('/');
    if (parts[0] !== 'console') return null;
    let view = 'joint';
    if (parts[1] === 'servos') view = parts[2] === 'maintenance' ? 'parameters' : servoViews.includes(parts[2]) ? parts[2] : 'joint';
    else if (Object.hasOwn(titles, parts[1])) view = parts[1];
    const suffix = servoViews.includes(view) ? 'servos/' + view : view;
    return { view, key: 'console/' + suffix, title: titles[view], anchor: '' };
  }

  function navigation(view) {
    const link = (href, name, active, extra = '') => `<a href="${href}" class="${active ? 'active' : ''} ${extra}" ${active ? 'aria-current="page"' : ''}>${name}</a>`;
    const servos = servoViews.includes(view);
    return `<nav class="console-navigation" aria-label="调试台导航">
      ${link('#console/overview', '总控 <small>待实现</small>', view === 'overview')}
      <div class="console-nav-group ${servos ? 'active-group' : ''}"><a href="#console/servos" class="console-nav-parent" ${servos ? 'aria-current="true"' : ''}>舵机</a><div class="console-nav-children">
        ${link('#console/servos/joint', '关节联调', view === 'joint')}
        ${link('#console/servos/single', '单舵机调试', view === 'single')}
        ${link('#console/servos/parameters', '参数与标定', view === 'parameters')}
      </div></div>
      ${link('#console/charts', '曲线', view === 'charts')}
      ${link('#console/device', '设备', view === 'device')}
      ${link('#console/sensors', '传感器', view === 'sensors')}
      ${link('#console/logs', '日志', view === 'logs')}
      <hr class="divider">${link('#records', '实验记录', false)}${link('#learn', '教程', false)}
      <p>${view === 'parameters' ? '扫描和选择实际舵机 ID；关联关节、调节、参数与标定在同一页。' : view === 'sensors' ? '观察 IMU、ToF 与相机画面；各项独立标明数据来源。' : '真实舵机调试位于参数与标定；其他页面仍使用浏览器样例。'}</p>
    </nav>`;
  }

  function baseMarkup(options) {
    const { state, jointId } = options;
    const isMaintenance = options.view === 'parameters';
    const isSensors = options.view === 'sensors';
    const sensorDescription = state === 'offline' ? 'IMU / ToF 遥测尚未接入；摄像头可手动指定媒体服务，只读查看快照。' : state === 'stale' ? 'IMU / ToF 保留陈旧样例；摄像头独立显示画面来源与接收时间。' : 'IMU / ToF 为浏览器样例，未接入硬件；摄像头独立显示画面来源与接收时间。';
    const backendAvailable = root.HATCHERY_BACKEND?.readOnly === true;
    const model = root.JointDrafts;
    const joint = model.metadata.find(item => item.id === jointId) || model.metadata[0];
    const store = root.JointConsole.store;
    const feedback = store.getFeedback(joint.id, state);
    const offline = state === 'offline';
    const badge = (text, kind = 'example') => `<span class="badge ${kind}">${text}</span>`;
    const groups = ['左腿', '右腿', '头颈'];
    const rows = groups.map(group => `<tr class="joint-group"><th colspan="4" scope="rowgroup">${group === '头颈' ? '头颈与嘴部' : group} · 5 个关节</th></tr>` + model.metadata.filter(item => item.group === group).map(item => {
      const f = store.getFeedback(item.id, state);
      return `<tr class="${item.id === joint.id ? 'selected' : ''}"><td><button class="joint-select" data-joint="${item.id}" aria-pressed="${item.id === joint.id}"><strong>${escape(item.name)}</strong><span>#${root.ServoParameters?.boundId(item.id) ?? item.id} · ${escape(item.raw)}</span></button></td><td class="mono">${f.available ? numberText(f.value) : '—'}</td><td class="mono">${f.available ? numberText(f.temp) : '—'}</td><td class="joint-status">${f.available ? (f.stale ? '陈旧' : '样例') : '缺测'}</td></tr>`;
    }).join('')).join('');
    return `<div class="console-wrap"><section class="console-heading"><div><span class="eyebrow">DEVICE WORKSPACE</span><h1>调试台</h1><p>先核对设备与反馈，再进行台架操作。</p></div><div>${isMaintenance ? '' : `<label for="state-select" class="small muted">预览状态</label><select id="state-select" class="design-state-select">${Object.keys(stateNames).map(value => `<option value="${value}" ${value === state ? 'selected' : ''}>${stateNames[value]}</option>`).join('')}</select>`}<button class="button secondary" data-connect-open ${isMaintenance ? 'data-connect-default="maintenance"' : ''}>连接说明</button></div></section>
      ${isMaintenance ? `<div class="devicebar"><div class="device-id"><span class="device-icon" aria-hidden="true">⌁</span><div><strong>Hatchery · 台架维护</strong><p class="mono">设备型号 / 固件身份尚未核对</p></div>${badge(backendAvailable ? '本机服务入口' : '静态预览', 'readonly')}</div><div class="device-stats"><div>连接路径<strong>本机 USB 串口</strong></div><div>总线模式<strong>由后端裁定</strong></div><div>数据来源<strong>${backendAvailable ? '下方后端快照' : '尚未取得快照'}</strong></div></div></div>` : `<div class="devicebar"><div class="device-id"><span class="device-icon" aria-hidden="true">⌁</span><div><strong>${offline ? '等待设备身份' : 'Microduck · 样例设备'}</strong><p class="mono">${offline ? 'device_id — / service —' : 'device_id EXAMPLE-01 / service 0.15.4（源码参考）'}</p></div>${badge(stateNames[state], state)}</div><div class="device-stats"><div>连接路径<strong>${offline ? '—' : 'Wi-Fi（样例）'}</strong></div><div>总线模式<strong>${offline ? '—' : '校准台（样例）'}</strong></div><div>数据来源<strong>浏览器样例 · 非硬件</strong></div></div></div>`}
      <div class="status-banner ${!isMaintenance && offline ? 'offline' : ''}">${isMaintenance ? '参数与标定读取真实后端状态；联调、曲线与 3D 仍使用浏览器样例。' : isSensors ? sensorDescription : stateDescriptions[state]}</div>
      <div class="console-grid"><aside class="console-sidebar"></aside>
        <section class="panel joint-panel"><div class="panel-title"><h2>单舵机调试</h2><span class="small muted">配置 15 个关节</span></div><div class="joint-list-scroll" tabindex="0" role="region" aria-label="关节列表，可滚动"><table class="joint-table"><thead><tr><th>名称 / ID</th><th>位置 ticks</th><th>温度 °C</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div><p class="joint-note">完整列出 15 个关节；ID 读取参数与标定的关联草稿；实机校准仍待核对。</p></section>
        <div class="console-detail"><section class="panel"><div class="detail-title"><div><h2>${escape(joint.name)}</h2><p class="mono">#${root.ServoParameters?.boundId(joint.id) ?? joint.id} / ${escape(joint.raw)}</p></div>${badge(feedback.available ? '样例回读' : '回读待获取', feedback.available ? 'example' : 'draft')}</div><div class="metrics"><div class="metric"><span>样例位置回读</span><strong>${feedback.available ? numberText(feedback.value) : '—'}<small>ticks</small></strong></div><div class="metric"><span>样例目标回读</span><strong>${feedback.available ? numberText(feedback.goal) : '—'}<small>ticks</small></strong></div><div class="metric"><span>舵机电压</span><strong>${feedback.available ? numberText(feedback.volt) : '—'}<small>V</small></strong></div></div><div class="detail-chart"><div class="chart-controls"><span>曲线位于独立页面</span></div></div><div class="command-box"></div></section>
        <section class="log-panel" id="console-logs"><div class="panel-title"><h3>示例事件</h3>${badge('非设备日志')}</div><div class="log-lines">${joint.id === 23 && feedback.available ? '<div><span>示例</span> 浏览器生成左膝回读；没有发送设备目标。</div>' : '<span>—</span> 尚未取得该关节真实事件。'}</div></section></div>
      </div></div>`;
  }

  function placeholder(view) {
    const copy = {
      overview: ['整机总控尚未实现', '整机总览与全局操作仍在审查方案中。当前状态栏仅为样例，没有控制权、健康或真实在线状态。'],
      device: ['设备信息待接入', '当前没有设备发现或真实身份核对。连接说明中的地址是占位符。'],
      logs: ['设备日志待接入', '正式事件和运行日志尚未接入。单舵机页的示例事件不能作为执行确认或正式记录。']
    }[view];
    return `<section class="panel console-placeholder"><div class="panel-title"><h2>${titles[view]}</h2><span class="badge draft">待实现</span></div><div class="empty-state"><h3>${copy[0]}</h3><p>${copy[1]}</p><a class="button secondary" href="#console/servos/joint">打开关节联调样例</a></div></section>`;
  }

  function render(options) {
    const view = options.view || 'joint';
    const markup = root.JointConsole.render(baseMarkup(options), { ...options, view: view === 'single' ? 'single' : 'joint' });
    const template = root.document.createElement('template');
    template.innerHTML = markup;
    const wrap = template.content.querySelector('.console-wrap');
    if (view === 'parameters') template.content.querySelector('.console-navigation-tools span').textContent = '参数与标定 · 按实际总线 ID 调试';
    if (view === 'sensors') template.content.querySelector('.console-navigation-tools span').textContent = '只读观察 · IMU / ToF 样例 · 相机独立来源';
    wrap.dataset.consolePage = view;
    wrap.classList.add('wide-console', 'console-layout');
    template.content.querySelector('.console-sidebar').innerHTML = navigation(view);
    const grid = template.content.querySelector('.console-grid');
    grid.classList.add('console-layout-grid');
    if (view === 'joint') {
      const content = root.document.createElement('div');
      content.className = 'console-page-content joint-workspace';
      const workspace = root.document.createElement('div');
      workspace.className = 'coordination-workspace';
      const viewer = root.document.createElement('div');
      viewer.className = 'joint-viewer-slot';
      viewer.id = 'joint-viewer';
      viewer.innerHTML = root.JointViewer.render();
      workspace.append(viewer, grid.querySelector('.joint-panel'));
      content.append(workspace);
      const feedback = root.document.createElement('div');
      feedback.id = 'joint-feedback';
      feedback.innerHTML = root.JointFeedback.render({ ...options, store: root.JointConsole.store });
      content.append(feedback);
      grid.append(content);
    }
    if (view === 'single') {
      grid.querySelectorAll('.joint-panel,.console-detail').forEach(element => element.remove());
      const content = root.document.createElement('div');
      content.className = 'console-page-content single-workspace';
      content.innerHTML = `<div id="joint-feedback">${root.JointFeedback.render({ ...options, store: root.JointConsole.store })}</div><div class="single-detail-grid"><div id="single-joint-chart">${root.SingleJointChart.render(options)}</div><section class="panel single-workbench" id="joint-workbench">${root.JointConsole.detailControls(options.jointId, options.state)}</section></div>`;
      grid.append(content);
    }
    if (view !== 'joint' && view !== 'single') {
      grid.querySelectorAll('.joint-panel,.console-detail,.coordination-workspace').forEach(element => element.remove());
      grid.classList.add('console-full-page-grid');
      const content = root.document.createElement('div');
      content.className = 'console-page-content';
      if (view === 'charts') {
        content.innerHTML = `<div class="console-page-intro"><h2>曲线</h2><p>独立选择需要观察的关节与数据；目标调节位于舵机页。</p><a href="#console/servos/joint">返回关节联调</a></div><div id="joint-charts">${root.JointCharts.render(options)}</div>`;
      } else if (view === 'parameters') {
        content.innerHTML = `<div id="servo-parameters">${root.ServoParameters.render(options)}</div>`;
      } else if (view === 'sensors') {
        content.innerHTML = `<div id="sensor-workspace">${root.SensorWorkspace.render(options)}</div>`;
      }
      else content.innerHTML = placeholder(view);
      grid.append(content);
    }
    return template.innerHTML;
  }

  function onSampleFrame(frame) {
    if (!context || !['example', 'readonly'].includes(context.state)) return;
    const result = root.JointConsole.store.updateSampleFeedback(frame);
    if (result.accepted) root.JointConsole.sync(context.state, context.jointId);
  }

  function mount(options) {
    root.JointCharts.unmount();
    root.JointViewer.unmount();
    root.JointFeedback.unmount();
    root.SingleJointChart.unmount();
    root.ServoParameters.unmount();
    root.ServoBackend.unmount();
    root.SensorWorkspace.unmount();
    context = { ...options };
    root.JointSession.start({ state: context.state, onFrame: onSampleFrame });
    const container = root.document.querySelector('#joint-charts');
    if (context.view === 'charts' && container) root.JointCharts.mount({ container, state: context.state, jointId: context.jointId });
    const viewer = root.document.querySelector('#joint-viewer');
    if (context.view === 'joint' && viewer) root.JointViewer.mount({ container: viewer, store: root.JointConsole.store, state: context.state, jointId: context.jointId, onSelect: context.onSelect });
    const feedback = root.document.querySelector('#joint-feedback');
    if (feedback) root.JointFeedback.mount({ container: feedback, store: root.JointConsole.store, state: context.state, jointId: context.jointId, onSelect: context.onSelect });
    const singleChart = root.document.querySelector('#single-joint-chart');
    if (context.view === 'single' && singleChart) root.SingleJointChart.mount({ container: singleChart, state: context.state, jointId: context.jointId });
    const parameters = root.document.querySelector('#servo-parameters');
    if (context.view === 'parameters' && parameters) root.ServoParameters.mount({ container: parameters, state: context.state, jointId: context.jointId, onSelect: context.onSelect });
    if (context.view === 'parameters' && parameters) root.ServoBackend.mount({ container:parameters, onFrame:frame => root.ServoParameters.updateBackend(frame) });
    const sensors = root.document.querySelector('#sensor-workspace');
    if (context.view === 'sensors' && sensors) root.SensorWorkspace.mount({ container:sensors, state:context.state });
    root.JointConsole.restoreScroll();
  }

  function setContext(options) {
    if (!context) return;
    context = { ...context, ...options };
    root.JointSession.setState(context.state);
    root.JointCharts.setContext({ state: context.state, jointId: context.jointId });
    root.JointViewer.setContext({ state: context.state, jointId: context.jointId });
    root.JointFeedback.setContext({ state: context.state, jointId: context.jointId });
    root.SingleJointChart.setContext({ state: context.state, jointId: context.jointId });
    root.ServoParameters.setContext({ state: context.state, jointId: context.jointId });
    root.SensorWorkspace.setContext({ state: context.state });
  }

  function refreshWorkbench(options) {
    const workbench = root.document.querySelector('#joint-workbench');
    if (workbench) workbench.innerHTML = root.JointConsole.detailControls(options.jointId, options.state);
  }

  function unmountView() { root.JointCharts.unmount(); root.JointViewer.unmount(); root.JointFeedback.unmount(); root.SingleJointChart.unmount(); root.ServoParameters.unmount(); root.ServoBackend.unmount(); root.SensorWorkspace.unmount(); }

  function leave() {
    unmountView();
    root.JointSession.stop();
    context = null;
  }

  return { resolve, render, mount, setContext, refreshWorkbench, unmountView, leave };
});
