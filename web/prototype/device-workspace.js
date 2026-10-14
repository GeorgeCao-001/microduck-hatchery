(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeviceWorkspace = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const storageKey = 'hatchery-device-preferences/1';
  let host = null, unsubscribe = null, view = null, page = 'device', labelsLoaded = false;
  const routes = { unknown:'未注明', ssh:'SSH 转发', usb:'USB 网络', wifi:'Wi-Fi', local:'电脑本地维护' };
  let preferences = { aliases: Object.create(null), paths: Object.create(null) };
  try {
    const saved = JSON.parse(root.localStorage?.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') {
      for (const key of ['aliases','paths']) if (saved[key] && typeof saved[key] === 'object' && !Array.isArray(saved[key])) preferences[key] = Object.assign(Object.create(null), Object.fromEntries(Object.entries(saved[key]).slice(0,64).filter(([k,v]) => k.length <= 256 && typeof v === 'string' && v.length <= 80 && (key === 'aliases' || Object.hasOwn(routes,v)))));
    }
  } catch (_) { /* Browser storage may be unavailable; current session still works. */ }
  const endpoint = () => ['http:','https:'].includes(root.location?.protocol) ? root.location.origin : '离线文件';
  const identityKey = snapshot => snapshot?.data?.identity.id || endpoint();
  const nameFor = snapshot => preferences.aliases[identityKey(snapshot)] || snapshot?.data?.identity.name || snapshot?.data?.identity.hostname || 'Hatchery · 等待设备身份';
  const value = (v, digits=1) => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—';
  const bytes = v => typeof v === 'number' ? `${value(v / 1024 / 1024,0)} MiB` : '—';
  const clock = v => typeof v === 'number' ? `${Math.floor(v / 3600)}h ${Math.floor(v % 3600 / 60)}m` : '—';
  function busText(service) { return !service ? '状态待获取' : service.servo_fake ? 'fixture · 非硬件' : service.servo_connection === 'open' ? '串口已打开' : '串口未连接'; }
  function headerMarkup() {
    return `<div class="devicebar"><div class="device-id"><span class="device-icon" aria-hidden="true">⌁</span><div><strong data-device-name>Hatchery · 等待设备身份</strong><p class="mono" data-device-identity>设备 ID — / 主机 —</p></div><span class="badge draft" data-device-online>状态待获取</span></div><div class="device-stats"><div>当前入口<strong class="mono" data-device-endpoint>${escape(endpoint())}</strong></div><div>连接方式<strong data-device-path>未注明 · 可在设备页备注</strong></div><div>总线状态<strong data-device-bus>状态待获取</strong></div><div>数据来源<strong data-device-source>状态待获取</strong></div></div></div>`;
  }
  function render() {
    return `<div class="device-workspace"><div class="console-page-intro"><h2>设备</h2><p>先确认正在访问哪台设备，再查看系统与连接状态。</p><button type="button" class="button secondary" data-device-refresh>刷新状态</button></div>
      <section class="panel device-summary"><div class="device-panel-heading"><h3 data-device-page-name>设备身份</h3><span class="badge readonly">只读系统状态</span></div><div data-device-host-info></div><form class="device-local-labels" data-device-label-form><label>本地显示名称<input data-device-alias maxlength="80" placeholder="例如 George · Radxa"></label><label>当前连接方式备注<select data-device-path-choice>${Object.entries(routes).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><button class="button secondary" type="submit">保存本地备注</button><p>仅保存在当前浏览器，不修改主机名、网络配置或权威设备 ID。</p></form></section>
      <div class="device-monitor-grid"><section class="panel"><div class="device-panel-heading"><h3>系统状态</h3><span class="badge draft" data-device-system-status>待获取</span></div><div data-device-system></div></section><section class="panel"><div class="device-panel-heading"><h3>服务与连接</h3><span class="badge draft" data-device-service-status>待获取</span></div><div data-device-services></div></section></div>
      <section class="panel"><div class="device-panel-heading"><h3>网络与蓝牙</h3><span class="small muted">当前服务主机的实际接口</span></div><div class="device-interface-table" data-device-interfaces></div><div class="device-bluetooth" data-device-bluetooth></div><p class="device-panel-note">接口有地址不等于能访问公网；蓝牙控制器存在不等于已配对或已实现 BLE 控制桥。当前页面只读，不更改 Wi-Fi、蓝牙和 USB 配置。</p></section>
      <p class="device-form-message" data-device-message role="status"></p></div>`;
  }
  function fields(rows) { return `<dl class="device-fields">${rows.map(([k,v])=>`<div><dt>${escape(k)}</dt><dd>${escape(v ?? '—')}</dd></div>`).join('')}</dl>`; }
  function banner(snapshot) {
    if (!snapshot.available) return '静态预览 · 尚未连接设备后端，系统与接口状态保留未知。';
    if (!snapshot.fresh) return (snapshot.data ? '设备状态陈旧 · ' : '设备后端未连接 · ') + (snapshot.error || '正在获取状态。');
    const source = snapshot.data.service.servo_fake ? '舵机仍使用 fixture 假数据，未连接硬件。' : snapshot.data.service.servo_connection === 'open' ? '串口已打开，不代表关节标定或实机到位。' : '舵机串口未连接。';
    return page === 'device' || page === 'parameters' ? `系统信息来自当前后端主机；${source}` : `设备栏显示后端系统状态；当前${page === 'sensors' ? 'IMU / ToF' : '联调、曲线与 3D'}仍为浏览器样例。${source}`;
  }
  function paint(snapshot) {
    if (!host) return;
    view = snapshot;
    const put = (key,text) => host.querySelectorAll('[data-device-'+key+']').forEach(n => { n.textContent=text; });
    const data = snapshot.data, live = snapshot.fresh ? data : null;
    const name = nameFor(snapshot), id = data?.identity;
    put('name', snapshot.available ? name : 'Hatchery · 静态预览'); put('page-name', name);
    put('identity', `${id?.id || '设备 ID 未提供'} / ${id?.hostname || '主机名待获取'}${data && !live ? ' · 上次身份' : ''}`);
    put('endpoint', endpoint()); put('path', (routes[preferences.paths[endpoint()]] || routes.unknown) + ' · 本地备注');
    put('bus', live ? busText(live.service) : '状态未知');
    put('source', live ? `系统实读 / 舵机${live.service.servo_fake ? 'fixture' : live.service.servo_source === 'hardware' ? '硬件回读' : '未连接'}` : '尚无有效快照');
    const online = host.querySelector('[data-device-online]');
    if (online) { online.textContent = snapshot.fresh ? '后端已连接' : snapshot.status === 'stale' ? '连接失效 / 陈旧' : snapshot.status === 'connecting' ? '连接中' : snapshot.available ? '后端不可达' : '静态预览'; online.className = 'badge ' + (snapshot.fresh ? 'readonly' : snapshot.status === 'stale' ? 'stale' : 'draft'); }
    const statusBanner = host.querySelector('[data-device-banner]');
    if (statusBanner) { statusBanner.textContent = banner(snapshot); statusBanner.className = 'status-banner ' + (snapshot.available && !snapshot.fresh && snapshot.status !== 'connecting' ? 'offline' : ''); }
    const panel = host.querySelector('.device-workspace'); if (!panel) return;
    if (data && !labelsLoaded) {
      const alias = panel.querySelector('[data-device-alias]');
      if (alias && !alias.value && root.document?.activeElement !== alias) alias.value = preferences.aliases[identityKey(snapshot)] || '';
      labelsLoaded = true;
    }
    const inject = (key,markup) => { const node=panel.querySelector('[data-device-'+key+']'); if(node)node.innerHTML=markup; };
    inject('host-info',fields([['设备 ID',id?.id],['身份来源',id?.id_source === 'configured' ? '板端配置' : id?.id_source === 'machine-id-derived' ? '系统 machine-id 派生 · 非认证凭据' : '未提供'],['主机名',id?.hostname],['板卡型号',id?.model],['操作系统',id?.os],['内核 / 架构',id ? `${id.kernel || '—'} / ${id.architecture}` : '—']]));
    const s = live?.system, used = s?.memory_total_bytes !== null && s?.memory_available_bytes !== null && s ? s.memory_total_bytes - s.memory_available_bytes : null;
    const metric = (title,v,unit,percent) => `<div class="device-system-metric"><span>${title}</span><strong class="mono">${v}<small>${unit}</small></strong>${typeof percent === 'number' ? `<meter min="0" max="100" value="${percent}" aria-label="${title}"></meter>` : ''}</div>`;
    inject('system',`<div class="device-system-metrics">${metric('CPU 使用率',value(s?.cpu_percent),'%',s?.cpu_percent)}${metric('内存使用',bytes(used),s?.memory_total_bytes !== null && s ? '/ '+bytes(s.memory_total_bytes) : '',used !== null && s.memory_total_bytes > 0 ? used / s.memory_total_bytes * 100 : null)}${metric('板载最高温度',value(s?.hottest_zone_celsius),'°C')}${metric('系统运行时间',clock(s?.uptime_seconds),'')}</div><p class="device-panel-note">Load 1 min：${value(s?.load_one,2)} · CPU 首次采样和平台未提供的指标显示“—”。${snapshot.fresh ? '系统读数独立于舵机 fixture。' : '当前没有有效系统快照。'}</p>`);
    put('system-status',snapshot.fresh ? '系统实读' : '缺测'); put('service-status',snapshot.fresh ? '后端可达' : '不可确认');
    const service=live?.service;
    inject('services',fields([['浏览器入口',endpoint()],['robotd 服务',service ? `${service.name} / ${service.version}` : null],['舵机来源',service ? busText(service) : null],['串口路径',service?.serial_port],['波特率',service?.baud],['控制权限',service ? service.control_enabled ? '台架控制已开放 · 后端裁定' : '只读 / 控制关闭' : null],['总线所有者',service?.bus_owner],['浏览器接收时间',snapshot.receivedAt ? new Date(snapshot.receivedAt).toLocaleTimeString() + (snapshot.fresh ? '' : ' · 陈旧') : null]]));
    inject('interfaces',!live || live.interfaces === null ? '<p class="device-empty">网络接口尚未取得，或当前平台未提供。</p>' : `<table><thead><tr><th>接口</th><th>类型</th><th>链路状态</th><th>地址</th></tr></thead><tbody>${live.interfaces.map(n=>`<tr><td class="mono">${escape(n.name)}</td><td>${escape({wifi:'Wi-Fi','usb-network':'USB 网络（接口识别）',network:'网络接口',loopback:'Loopback'}[n.kind])}</td><td>${escape(n.carrier === true ? '链路在线' : n.carrier === false ? '链路离线' : n.state)}<small>${escape(n.state)}</small></td><td class="mono">${n.addresses === null ? '地址未知' : n.addresses.length ? n.addresses.map(escape).join('<br>') : '未分配地址'}</td></tr>`).join('')}</tbody></table>`);
    inject('bluetooth',`<h4>蓝牙控制器</h4>${!live || live.bluetooth === null ? '<p>状态未提供。</p>' : !live.bluetooth.length ? '<p>系统尚未枚举蓝牙控制器；不据此断言硬件不支持。</p>' : fields(live.bluetooth.map(n=>[n.name,`${n.address || '地址未提供'} · ${n.blocked === null ? '无线开关未知' : n.blocked ? '无线被阻断' : '未被 rfkill 阻断'} · 配对状态未读取`]))}`);
  }
  function save() {
    try { root.localStorage.setItem(storageKey,JSON.stringify(preferences)); return true; } catch (_) { return false; }
  }
  function message(text) { const n=host?.querySelector('[data-device-message]'); if(n)n.textContent=text; }
  function submit(event) {
    if(event.target.matches('[data-device-label-form]')) {
      event.preventDefault(); const alias=host.querySelector('[data-device-alias]').value.trim();
      if(alias)preferences.aliases[identityKey(view)]=alias;else delete preferences.aliases[identityKey(view)];
      preferences.paths[endpoint()]=host.querySelector('[data-device-path-choice]').value;
      const persisted=save(); paint(view); message(persisted?'本地备注已保存；设备配置没有改变。':'浏览器禁止持久存储；备注仅保留在本页面会话。');

    }
  }
  function click(event) {
    const button=event.target.closest('button');if(!button || !host?.contains(button))return;
    if(button.matches('[data-device-refresh]'))root.DeviceSession.refresh();
  }
  function mount(options) {
    unmount(); host=options?.container;page=options?.view||'device';labelsLoaded=false;if(!host)return;
    host.addEventListener('submit',submit);host.addEventListener('click',click);
    unsubscribe=root.DeviceSession.subscribe(paint);
    const alias=host.querySelector('[data-device-alias]');if(alias)alias.value=preferences.aliases[identityKey(view)]||'';
    const path=host.querySelector('[data-device-path-choice]');if(path)path.value=preferences.paths[endpoint()]||'unknown';
    root.DeviceSession.start();
  }
  function unmount() { unsubscribe?.();unsubscribe=null;host?.removeEventListener('submit',submit);host?.removeEventListener('click',click);host=null; }
  return Object.freeze({render,headerMarkup,mount,unmount});
});
