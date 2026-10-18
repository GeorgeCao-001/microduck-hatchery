(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ConsoleWorkspace = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  // Navigation composes sample workspaces with independent read-only host status.
  const stateNames = { example: '示例数据', offline: '未连接', stale: '数据陈旧', readonly: '只读' };
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
      ${link('#console/overview', '总控', view === 'overview')}
      ${link('#console/device', '设备', view === 'device')}
      <div class="console-nav-group ${servos ? 'active-group' : ''}"><a href="#console/servos" class="console-nav-parent" ${servos ? 'aria-current="true"' : ''}>舵机</a><div class="console-nav-children">
        ${link('#console/servos/joint', '关节联调', view === 'joint')}
        ${link('#console/servos/single', '单舵机调试', view === 'single')}
        ${link('#console/servos/parameters', '参数与标定', view === 'parameters')}
      </div></div>
      ${link('#console/charts', '曲线', view === 'charts')}
      ${link('#console/sensors', '传感器', view === 'sensors')}
      ${link('#console/logs', '日志', view === 'logs')}
      <hr class="divider">${link('#records', '实验记录', false)}${link('#learn', '教程', false)}
      <p>${view === 'device' ? '查看当前设备的连接与运行情况。' : view === 'parameters' ? '扫描和选择实际舵机 ID；关联关节、调节、参数与标定在同一页。' : view === 'sensors' ? '观察 IMU、ToF 与相机画面；各项独立标明数据来源。' : '曲线与 3D 读取后端反馈；参数修改在参数与标定中进行。'}</p>
    </nav>`;
  }

  function baseMarkup(options) {
    const { state, jointId } = options;
    const isMaintenance = options.view === 'parameters';
    const isDevice = options.view === 'device';
    const isRuntime = options.view === 'overview' || root.HATCHERY_BACKEND?.apiBase === '/api/v1/maintenance' && ['joint','single','charts'].includes(options.view);
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
    return `<div class="console-wrap"><section class="console-heading"><div><span class="eyebrow">${isDevice ? 'MY MICRODUCK' : 'DEVICE WORKSPACE'}</span><h1>${isDevice ? '我的设备' : '调试台'}</h1><p>${isDevice ? '认识你的小鸭，随时了解它的状态。' : '先核对设备与反馈，再进行台架操作。'}</p></div><div>${isMaintenance || isDevice || isRuntime ? '' : `<label for="state-select" class="small muted">预览状态</label><select id="state-select" class="design-state-select">${Object.keys(stateNames).map(value => `<option value="${value}" ${value === state ? 'selected' : ''}>${stateNames[value]}</option>`).join('')}</select>`}${isDevice ? `<button type="button" class="button secondary" data-device-refresh>${root.DeviceOverview.icon('refresh')}刷新</button><button type="button" class="button secondary" data-device-settings>${root.DeviceOverview.icon('edit')}显示设置</button>` : ''}<button class="button secondary" data-connect-open ${isMaintenance ? 'data-connect-default="maintenance"' : ''}>连接说明</button></div></section>
      ${isDevice ? '' : root.DeviceWorkspace.headerMarkup() + '<div class="status-banner" data-device-banner>正在核对设备身份与后端状态…</div>'}
      <div class="console-grid"><aside class="console-sidebar"></aside>
        <section class="panel joint-panel"><div class="panel-title"><h2>单舵机调试</h2><span class="small muted">配置 15 个关节</span></div><div class="joint-list-scroll" tabindex="0" role="region" aria-label="关节列表，可滚动"><table class="joint-table"><thead><tr><th>名称 / ID</th><th>位置 ticks</th><th>温度 °C</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div><p class="joint-note">完整列出 15 个关节；ID 读取参数与标定的关联草稿；实机校准仍待核对。</p></section>
        <div class="console-detail"><section class="panel"><div class="detail-title"><div><h2>${escape(joint.name)}</h2><p class="mono">#${root.ServoParameters?.boundId(joint.id) ?? joint.id} / ${escape(joint.raw)}</p></div>${badge(feedback.available ? '样例回读' : '回读待获取', feedback.available ? 'example' : 'draft')}</div><div class="metrics"><div class="metric"><span>样例位置回读</span><strong>${feedback.available ? numberText(feedback.value) : '—'}<small>ticks</small></strong></div><div class="metric"><span>样例目标回读</span><strong>${feedback.available ? numberText(feedback.goal) : '—'}<small>ticks</small></strong></div><div class="metric"><span>舵机电压</span><strong>${feedback.available ? numberText(feedback.volt) : '—'}<small>V</small></strong></div></div><div class="detail-chart"><div class="chart-controls"><span>曲线位于独立页面</span></div></div><div class="command-box"></div></section>
        <section class="log-panel" id="console-logs"><div class="panel-title"><h3>示例事件</h3>${badge('非设备日志')}</div><div class="log-lines">${joint.id === 23 && feedback.available ? '<div><span>示例</span> 浏览器生成左膝回读；没有发送设备目标。</div>' : '<span>—</span> 尚未取得该关节真实事件。'}</div></section></div>
      </div></div>`;
  }

  function placeholder(view) {
    const copy = {
      overview: ['整机总控尚未实现', '整机总览与全局操作仍在审查方案中。设备栏独立显示后端身份与系统状态；整机健康与全局控制仍待实现。'],
      logs: ['设备日志待接入', '正式事件和运行日志尚未接入。单舵机页的示例事件不能作为执行确认或正式记录。']
    }[view];
    return `<section class="panel console-placeholder"><div class="panel-title"><h2>${titles[view]}</h2><span class="badge draft">待实现</span></div><div class="empty-state"><h3>${copy[0]}</h3><p>${copy[1]}</p><a class="button secondary" href="#console/servos/joint">打开关节联调样例</a></div></section>`;
  }

  function render(options) {
    const view = options.view || 'joint';
    const runtime = root.HATCHERY_BACKEND?.apiBase === '/api/v1/maintenance';
    const markup = root.JointConsole.render(baseMarkup(options), { ...options, view: view === 'single' ? 'single' : 'joint' });
    const template = root.document.createElement('template');
    template.innerHTML = markup;
    const wrap = template.content.querySelector('.console-wrap');
    if (view === 'parameters') template.content.querySelector('.console-navigation-tools span').textContent = '参数与标定 · 按实际总线 ID 调试';
    if (view === 'device') template.content.querySelector('.console-navigation-tools span').textContent = '我的设备 · 连接与运行状态';
    if (runtime && ['joint','single','charts','overview'].includes(view)) template.content.querySelector('.console-navigation-tools span').textContent = 'robotd 反馈 · 只读';
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
      if(runtime) {workspace.querySelector('.joint-panel').remove();workspace.insertAdjacentHTML('beforeend',root.RuntimeJoints.render());}
      content.append(workspace);
      const feedback = root.document.createElement('div');
      feedback.id = 'joint-feedback';
      feedback.innerHTML = root.JointFeedback.render({ ...options, store: root.JointConsole.store });
      if(runtime) feedback.innerHTML = '';
      content.append(feedback);
      grid.append(content);
    }
    if (view === 'single') {
      grid.querySelectorAll('.joint-panel,.console-detail').forEach(element => element.remove());
      const content = root.document.createElement('div');
      content.className = 'console-page-content single-workspace';
      content.innerHTML = `<div id="joint-feedback">${root.JointFeedback.render({ ...options, store: root.JointConsole.store })}</div><div class="single-detail-grid"><div id="single-joint-chart">${root.SingleJointChart.render(options)}</div><section class="panel single-workbench" id="joint-workbench">${root.JointConsole.detailControls(options.jointId, options.state)}</section></div>`;
      grid.append(content);
      if(runtime) content.innerHTML = `${root.RuntimeJoints.render()}<div id="joint-charts">${root.JointCharts.render({...options,onlyJoint:true})}</div>`;
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
      } else if (view === 'device') {
        content.innerHTML = `<div id="device-workspace">${root.DeviceWorkspace.render(options)}</div>`;
      } else if (view === 'sensors') {
        content.innerHTML = `<div id="sensor-workspace">${root.SensorWorkspace.render(options)}</div>`;
      } else if (view === 'overview') {
        content.innerHTML = `<div id="robot-overview">${root.RobotOverview.render()}</div>`;
      } else if (view === 'logs') {
        content.innerHTML = `<section class="panel" id="runtime-journal"><div class="panel-title"><h2>程序日志</h2><span class="small muted">当前设备 · 只读</span></div>${root.DeviceJournal.render()}</section>`;
        content.querySelector('[data-device-journal]').open = true;
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
    root.RobotOverview.unmount();
    root.RobotSession.start();
    root.RuntimeFeedback.start();
    root.JointCharts.unmount();
    root.RuntimeJoints.unmount();
    root.JointViewer.unmount();
    root.JointFeedback.unmount();
    root.SingleJointChart.unmount();
    root.ServoParameters.unmount();
    root.ServoBackend.unmount();
    root.SensorWorkspace.unmount();
    root.DeviceWorkspace.unmount();
    context = { ...options };
    if(root.HATCHERY_BACKEND?.apiBase !== '/api/v1/maintenance')root.JointSession.start({ state: context.state, onFrame: onSampleFrame });else root.JointSession.stop();
    const container = root.document.querySelector('#joint-charts');
    if (container) root.JointCharts.mount({ container, state: context.state, jointId: context.jointId, onlyJoint:context.view==='single' });
    root.RuntimeJoints.mount(root.document.querySelector('.runtime-joint-panel'),context.onSelect);
    root.RuntimeJoints.setSelected(context.jointId);
    const viewer = root.document.querySelector('#joint-viewer');
    if (context.view === 'joint' && viewer) root.JointViewer.mount({ container: viewer, store: root.JointConsole.store, state: context.state, jointId: context.jointId, onSelect: context.onSelect });
    const feedback = root.document.querySelector('#joint-feedback');
    if (feedback?.childElementCount) root.JointFeedback.mount({ container: feedback, store: root.JointConsole.store, state: context.state, jointId: context.jointId, onSelect: context.onSelect });
    const singleChart = root.document.querySelector('#single-joint-chart');
    if (context.view === 'single' && singleChart) root.SingleJointChart.mount({ container: singleChart, state: context.state, jointId: context.jointId });
    const parameters = root.document.querySelector('#servo-parameters');
    if (context.view === 'parameters' && parameters) root.ServoParameters.mount({ container: parameters, state: context.state, jointId: context.jointId, onSelect: context.onSelect });
    if (context.view === 'parameters' && parameters) root.ServoBackend.mount({ container:parameters, onFrame:frame => root.ServoParameters.updateBackend(frame) });
    const sensors = root.document.querySelector('#sensor-workspace');
    if (context.view === 'sensors' && sensors) root.SensorWorkspace.mount({ container:sensors, state:context.state });
    root.DeviceWorkspace.mount({ container:root.document.querySelector('#main'), view:context.view });
    root.RobotOverview.mount(root.document.querySelector('#robot-overview'));
    if (context.view === 'logs') root.DeviceJournal.mount(root.document.querySelector('#runtime-journal [data-device-journal]'));
    root.JointConsole.restoreScroll();
  }

  function setContext(options) {
    if (!context) return;
    context = { ...context, ...options };
    root.RuntimeJoints.setSelected(context.jointId);
    root.JointSession.setState(context.state);
    root.JointCharts.setContext({ state: context.state, jointId: context.jointId, onlyJoint:context.view==='single' });
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

  function unmountView() { root.RuntimeJoints.unmount(); root.RobotOverview.unmount(); root.JointCharts.unmount(); root.JointViewer.unmount(); root.JointFeedback.unmount(); root.SingleJointChart.unmount(); root.ServoParameters.unmount(); root.ServoBackend.unmount(); root.SensorWorkspace.unmount(); root.DeviceWorkspace.unmount(); }

  function leave() {
    unmountView();
    root.JointSession.stop();
    root.DeviceSession.stop();
    root.RuntimeFeedback.stop();
    root.RobotSession.stop();
    context = null;
  }

  return { resolve, render, mount, setContext, refreshWorkbench, unmountView, leave };
});
