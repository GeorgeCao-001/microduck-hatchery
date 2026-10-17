(function (root, factory) {
  'use strict';
  const api=factory(root);
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.DeviceOverview=api;
})(typeof window!=='undefined' ? window : globalThis, function (root) {
  'use strict';
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const glyphs={
    duck:'<path d="M8 13V8a4 4 0 0 1 8 0v2h4l-2 3h-6v4m-4-4H5v4h12v-4M8 17v4m7-4v4M6 21h4m3 0h4"/><circle cx="12" cy="8" r=".6"/>',
    wifi:'<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r=".7"/>',
    usb:'<path d="M12 21V3m-3 3 3-3 3 3M12 16l-6-4V9m6 3 6-4V5"/><circle cx="6" cy="8" r="1"/><path d="M17 3h2v2h-2z"/>',
    bluetooth:'<path d="m8 7 9 10-5 4V3l5 4L8 17"/>',
    network:'<rect x="7" y="3" width="10" height="6" rx="1"/><path d="M12 9v5M4 17v-3h16v3"/><rect x="2" y="17" width="5" height="4" rx="1"/><rect x="17" y="17" width="5" height="4" rx="1"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
    refresh:'<path d="M20 8a8 8 0 0 0-14-2L3 9m0-5v5h5m-4 7a8 8 0 0 0 14 2l3-3m0 5v-5h-5"/>',
    edit:'<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    gamepad:'<path d="M7 7h10c3 0 5 11 3 12s-5-3-5-3H9s-3 4-5 3S4 7 7 7Z"/><path d="M8 10v5m-2-2h4m6-2h.01M18 14h.01"/>',
    camera:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="m7 7 2-4h6l2 4"/><circle cx="12" cy="14" r="4"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    pause:'<path d="M8 5v14m8-14v14"/>', play:'<path d="m8 4 12 8-12 8z"/>',
    check:'<path d="m5 12 4 4L19 6"/>'
  };
  const icon=name=>`<svg class="device-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]||glyphs.info}</svg>`;
  const value=(n,digits=1)=>typeof n==='number' && Number.isFinite(n) ? n.toFixed(digits) : '—';
  const bytes=n=>typeof n!=='number' ? '—' : n>=1024**3 ? `${value(n/1024**3)} GB` : `${value(n/1024**2,0)} MB`;
  const clock=n=>typeof n!=='number' ? '等待设备' : n<60 ? `${Math.floor(n)} 秒` : n<3600 ? `${Math.floor(n/60)} 分钟` : `${Math.floor(n/3600)} 小时 ${Math.floor(n%3600/60)} 分`;
  const kinds={wifi:'Wi-Fi','usb-network':'USB-C',bluetooth:'蓝牙',network:'其他网络'};
  let host=null, view=null, history=null, metadata=null, settings=null, toastTimer=null, resizeObserver=null;
  let geometry={left:42,right:694,width:720};
  const ui={channel:'cpu',seconds:60,network:'',frozen:null,hover:null};
  const now=()=>root.performance.now()/1000;
  function inject(key,markup) {
    const node=host?.querySelector('[data-device-'+key+']');
    if(node && node._deviceMarkup!==markup){node.innerHTML=markup;node._deviceMarkup=markup;}
  }
  function put(key,text){host?.querySelectorAll('[data-device-'+key+']').forEach(n=>{n.textContent=text;});}
  function fields(rows){return `<dl class="device-fields">${rows.map(([k,v])=>`<div><dt>${escape(k)}</dt><dd>${escape(v??'—')}</dd></div>`).join('')}</dl>`;}
  function gauge(channel,title,caption) {
    const temperature=channel==='temperature';
    return `<button type="button" class="device-gauge ${temperature?'device-temperature':''}" data-device-channel="${channel}" aria-pressed="${channel===ui.channel}"><span class="device-gauge-visual">${temperature?'<svg viewBox="32 10 52 110" aria-hidden="true"><path class="device-thermometer-track" d="M46 75V30a12 12 0 0 1 24 0v45a24 24 0 1 1-24 0Z"/><path class="device-thermometer-fill" d="M58 80V40"/><circle class="device-thermometer-bulb" cx="58" cy="92" r="10"/></svg>':'<svg viewBox="0 0 116 116" aria-hidden="true"><circle class="device-gauge-track" cx="58" cy="58" r="46"/><circle class="device-gauge-fill" cx="58" cy="58" r="46" pathLength="100" stroke-dasharray="0 100"/></svg>'}<span class="device-gauge-value"><strong class="mono" data-device-value="${channel}">—</strong><small>${temperature?'°C':'%'}</small></span></span><span class="device-gauge-title">${title}</span><span class="device-gauge-caption" data-device-caption="${channel}">${caption}</span></button>`;
  }
  function render(){return `<div class="device-workspace">
    <section class="panel device-home-card"><div class="device-profile"><div class="device-portrait" role="img" aria-label="Microduck 参考外观照片"><span>参考外观</span></div><div class="device-profile-copy"><span class="device-kicker">MY MICRODUCK</span><h2 data-device-page-name>我的 Microduck</h2><p data-device-model>连接后识别设备型号</p><div class="device-profile-meta"><span class="device-status-pill" data-device-hero-status>等待连接</span><span data-device-updated>尚无设备读数</span></div></div><div class="device-health" data-device-health data-tone="quiet"><span class="device-health-icon" data-device-health-icon>${icon('network')}</span><div><h3 data-device-health-title>让你的小鸭上线</h3><p data-device-health-detail>连接后查看它的运行与网络状态。</p></div></div></div><div class="device-quick-status"><div>${icon('clock')}<span>本次运行</span><strong data-device-uptime>等待设备</strong></div><div>${icon('network')}<span>网络链路</span><strong data-device-network-summary>待确认</strong></div><div>${icon('chip')}<span>设备服务</span><strong data-device-version>待确认</strong></div></div></section>
    <div class="device-dashboard-grid"><section class="panel device-vitals"><div class="device-panel-heading"><div><span class="device-kicker">VITALS</span><h3>运行状态</h3></div><span class="device-status-pill" data-device-reading-status>等待设备</span></div><div class="device-gauges">${gauge('cpu','CPU 占用','等待首次采样')}${gauge('memory','内存占用','等待内存读数')}${gauge('temperature','板载温度','最高温区读数')}</div><div class="device-trend"><div class="device-trend-heading"><div><h4 data-device-chart-title>CPU 占用趋势</h4><span data-device-chart-subtitle>从连接开始，保留实际采样。</span></div><div class="device-segments" role="group" aria-label="趋势时间范围"><button type="button" data-device-range="60" aria-pressed="true">1 分钟</button><button type="button" data-device-range="180" aria-pressed="false">3 分钟</button></div></div><div class="device-chart-area" data-device-chart tabindex="0" role="group" aria-label="系统趋势图，左右方向键查看采样"><div data-device-chart-content></div><div class="device-chart-tooltip" data-device-tooltip hidden></div></div><div class="device-trend-footer"><span data-device-chart-note>连接后开始记录</span><button type="button" class="device-text-button" data-device-pause aria-pressed="false">${icon('pause')}暂停曲线</button></div></div></section>
    ${root.ConnectionsPanel.render()}</div>
    <div class="device-bottom-grid"><section class="panel device-functions"><div class="device-panel-heading"><div><span class="device-kicker">BOARD SERVICES</span><h3>程序服务</h3></div><span class="device-caption" data-device-service-summary>等待连接</span></div><div class="device-service-grid" data-device-services></div><details class="device-disclosure"><summary>查看服务详情</summary><div data-device-service-details></div></details></section><section class="panel device-about"><div class="device-panel-heading"><div><span class="device-kicker">THIS DEVICE</span><h3>关于这台设备</h3></div><button type="button" class="device-text-button" data-device-settings>编辑显示名称 ${icon('edit')}</button></div><div data-device-host-info></div><details class="device-disclosure"><summary>网络地址与 SSH</summary><div data-device-addresses></div></details><details class="device-disclosure"><summary>系统与技术详情</summary><div data-device-system-details></div></details></section></div>
    <p class="device-data-note">系统状态来自当前连接的后端主机；未取得的数据保留未知。名称与连接备注仅保存在当前浏览器。</p>
    <dialog class="device-settings-dialog" data-device-settings-dialog aria-labelledby="device-settings-title"><form data-device-label-form><div class="device-dialog-heading"><div><span class="device-kicker">MAKE IT YOURS</span><h3 id="device-settings-title">设备显示设置</h3></div><button type="button" class="icon-button" data-device-close aria-label="关闭显示设置">×</button></div><p>给这台设备起个熟悉的名字，方便识别。</p><label>显示名称<input data-device-alias maxlength="80" placeholder="例如：家庭小鸭"></label><label>当前连接方式备注<select data-device-path-choice><option value="unknown">未注明</option><option value="ssh">SSH 转发</option><option value="usb">USB 网络</option><option value="wifi">Wi-Fi</option><option value="local">电脑本地维护</option></select></label><label>SSH 用户名<input data-device-ssh-user maxlength="32" placeholder="duck" autocomplete="off" spellcheck="false"></label><p class="device-caption">仅调整本浏览器的显示和复制命令，不修改板端名称、账号或网络。</p><div class="device-dialog-actions"><button type="button" class="button secondary" data-device-close>取消</button><button class="button primary" type="submit">保存设置</button></div></form></dialog>
    <dialog class="device-copy-dialog" data-device-copy-dialog aria-labelledby="device-copy-title"><h3 id="device-copy-title">复制连接信息</h3><p>选中下方内容，使用系统的复制快捷键。</p><input readonly aria-label="要复制的连接信息" data-device-copy-value><button type="button" class="button secondary" data-device-copy-close>完成</button></dialog>
    <div class="device-inline-toast" data-device-message role="status" aria-live="polite" hidden></div></div>`;}

  function observe(snapshot){
    if(!history) history=root.DeviceTelemetry.createHistory();
    const old=view?.data, next=snapshot.data;
    if(old && next && (old.identity.id!==next.identity.id || (typeof old.system.uptime_seconds==='number' && typeof next.system.uptime_seconds==='number' && next.system.uptime_seconds<old.system.uptime_seconds))) {ui.frozen=null;ui.hover=null;}
    view=snapshot;history.accept(snapshot,now());
  }
  function paint(snapshot,meta){
    if(!host) return;
    view=snapshot;metadata=meta;
    const data=snapshot.data, live=snapshot.fresh?data:null, id=data?.identity, status=root.DeviceTelemetry.connection(snapshot);
    put('model',id?[id.model||id.os,id.hostname].filter(Boolean).join(' · '):'连接后识别设备型号');
    put('hero-status',status.label);put('health-title',status.title);put('health-detail',status.detail);
    host.querySelector('[data-device-health]').dataset.tone=status.tone;
    host.querySelector('[data-device-hero-status]').dataset.tone=status.tone;
    inject('health-icon',icon(snapshot.fresh?'check':'network'));
    put('updated',snapshot.receivedAt?`${new Date(snapshot.receivedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})} ${snapshot.fresh?'更新':'上次更新'}`:'尚无设备读数');
    put('reading-status',snapshot.fresh?'实时更新':data?'上次读数':'等待设备');
    host.querySelector('[data-device-reading-status]').dataset.tone=snapshot.fresh?'online':'quiet';
    const metric=root.DeviceTelemetry.metrics(data), active=root.DeviceTelemetry.links(data).filter(n=>n.online&&n.address);
    put('uptime',metric.uptime===null?'等待设备':clock(metric.uptime)+(snapshot.fresh?'':' · 上次'));
    put('network-summary',live?active.length?`${active.length} 条链路有地址`:'尚无可用地址':data?'状态待刷新':'待确认');
    put('version',live?`v${live.service.version}`:data?'状态待刷新':'待确认');
    for(const channel of Object.keys(root.DeviceTelemetry.channels)){
      const node=host.querySelector(`[data-device-channel="${channel}"]`), n=metric[channel];
      node.classList.toggle('is-missing',n===null);node.classList.toggle('is-stale',!!data&&!snapshot.fresh);node.setAttribute('aria-pressed',String(ui.channel===channel));
      node.querySelector('[data-device-value]').textContent=value(n);
      const ring=node.querySelector('.device-gauge-fill');if(ring)ring.setAttribute('stroke-dasharray',`${Math.min(100,Math.max(0,n??0))} 100`);
    }
    host.querySelector('[data-device-caption="cpu"]').textContent=metric.cpu===null?'等待有效采样':'点选查看 CPU 趋势';
    host.querySelector('[data-device-caption="memory"]').textContent=metric.used===null?'等待内存读数':`${bytes(metric.used)} / ${bytes(metric.total)}`;
    host.querySelector('[data-device-caption="temperature"]').textContent=metric.temperature===null?'温度尚未提供':'最高温区 · 点选看趋势';
    paintChart();paintNetwork();paintServices();
    inject('host-info',fields([['设备名称',meta.name],['主机名',id?.hostname],['设备型号',id?.model],['操作系统',id?.os]]));
    inject('system-details',fields([['设备 ID',id?.id],['身份来源',id?.id_source==='configured'?'设备配置':id?.id_source==='machine-id-derived'?'系统身份派生':null],['内核',id?.kernel],['架构',id?.architecture],['Load · 1 min',value(data?.system.load_one,2)],['当前网页入口',meta.endpoint],['快照接收时间',snapshot.receivedAt?new Date(snapshot.receivedAt).toLocaleString()+(snapshot.fresh?'':' · 陈旧'):null]]));
  }
  function paintNetwork(){
    const links=root.DeviceTelemetry.links(view.data);
    inject('addresses',links.map(n=>`<div class="device-link-card"><div><strong>${escape(n.name)}</strong><span class="device-status-pill">${escape(kinds[n.kind]||n.kind)} · ${view.fresh?escape(n.label):'上次状态'}</span></div><div class="device-link-address"><span>IPv4</span><strong class="mono">${escape(n.address||'未取得地址')}</strong><button type="button" class="device-icon-button" data-device-copy-ip="${escape(n.address||'')}" aria-label="复制 IPv4" ${!n.address?'disabled':''}>${icon('copy')}</button></div><button type="button" class="device-ssh-button" data-device-copy-ssh="${escape(n.address||'')}" ${!n.address?'disabled':''}>${icon('copy')}复制 SSH 命令</button><p class="device-caption mono">${(n.addresses||[]).map(escape).join(' · ')}</p></div>`).join('')||'<p class="device-caption">暂无网络地址</p>');
  }
  function paintServices(){
    const fresh=view.fresh, data=view.data, service=data?.service, rows=root.DeviceTelemetry.services(view);
    const known=rows.filter(row=>(row.row && row.row.state!=='unknown') || row.row?.process_pid).length;
    put('service-summary',fresh?(known?`${rows.filter(row=>row.running).length} / ${rows.length} 已启动`:'服务状态待获取'):data?'上次状态 · 等待更新':'等待连接');
    inject('services',rows.map(row=>`<div class="device-service-card" data-daemon="${row.name}" data-state="${row.row?.state||'unknown'}" ${!fresh?'data-stale="true"':''}><span class="device-service-symbol">${icon(row.icon)}</span><div><div class="device-service-title"><strong class="mono">${row.name}</strong><span class="device-service-state" data-tone="${row.tone}">${escape(row.label)}</span></div><p>${row.description}</p><small>${escape(row.hint)}</small></div></div>`).join(''));
    const unitNames={active:'active',restarting:'activating / restarting',failed:'failed',inactive:'inactive',absent:'not-found',unknown:'unknown'};
    const details=rows.map(row=>`<div class="device-daemon-detail"><strong class="mono">${row.name}</strong>${fields([['运行方式',row.row?.state==='active'?'systemd 管理':row.row?.process_pid?'独立进程':'未运行'],['服务单元',row.row?.unit],['systemd 状态',row.row?unitNames[row.row.state]:null],['启动阶段',row.row?.sub_state],['单元主进程 PID',row.row?.main_pid],['检测到的程序 PID',row.row?.process_pid]])}</div>`).join('');
    const maintenance=(data?.services||[]).filter(row=>['robotd-maintenance','mediad-maintenance'].includes(row.name));
    inject('service-details',`<p class="device-service-explanation">每约 2 秒只读更新。独立进程与 systemd 单元分别核对；未安装服务单元不代表磁盘中没有可执行程序。${fresh?'':' 当前没有新状态。'}</p>${details}<div class="device-daemon-detail"><strong>当前维护连接</strong>${fields([['状态接口',service?.name],['软件版本',service?.version],...maintenance.map(row=>[row.name,row.process_pid?`PID ${row.process_pid}${fresh?'':' · 上次'}`:'未取得进程信息'])])}</div>`);
  }
  function chartState(){
    const end=ui.frozen?ui.frozen.end:now(), samples=ui.frozen?ui.frozen.samples:history.values();
    const points=root.DeviceTelemetry.series(samples,ui.channel,end,ui.seconds);
    return {end,points,extent:root.DeviceTelemetry.extent(points,ui.channel),valid:points.filter(p=>typeof p.value==='number')};
  }
  function paintChart(){
    const width=Math.max(260,Math.round(host.querySelector('[data-device-chart]').getBoundingClientRect().width)||640);
    const channel=root.DeviceTelemetry.channels[ui.channel], chart=chartState(), left=34,right=width-16,top=16,bottom=147;
    geometry={left,right,width};
    const x=t=>left+(t-chart.end+ui.seconds)/ui.seconds*(right-left), y=v=>bottom-(v-chart.extent[0])/(chart.extent[1]-chart.extent[0])*(bottom-top);
    const grid=[0,.5,1].map(f=>{const v=chart.extent[0]+f*(chart.extent[1]-chart.extent[0]),py=y(v);return `<path d="M${left} ${py}H${right}" class="device-chart-grid"/><text x="${left-9}" y="${py+4}" text-anchor="end">${value(v,0)}</text>`;}).join('');
    const path=root.JointCharts.pathFor(chart.points,x,y,6), last=chart.valid[chart.valid.length-1];
    inject('chart-content',`<svg viewBox="0 0 ${width} 180" role="img" aria-label="${channel.name}，仅显示实际接收到的系统采样">${grid}<path d="${path}" fill="none" stroke="${channel.color}" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${last?`<circle cx="${x(last.t)}" cy="${y(last.value)}" r="4" fill="${channel.color}"/>`:`<text x="${(left+right)/2}" y="78" text-anchor="middle" class="device-chart-empty-text">连接后，趋势会从真实采样开始</text>`}<text x="${left}" y="174">−${ui.seconds/60} min</text><text x="${right}" y="174" text-anchor="end">${ui.frozen?'暂停时刻':'现在'}</text></svg>`);
    put('chart-title',channel.name+'趋势');put('chart-subtitle',ui.frozen?'曲线已暂停，设备状态继续更新。':view.fresh?'点选仪表切换趋势，移入曲线查看采样。':view.data?'连接中断，当前仅保留接收到的历史。':'从连接开始，保留实际采样。');
    put('chart-note',last?`${chart.valid.length} 个有效采样 · ${channel.unit}`:'尚无有效采样');
    host.querySelectorAll('[data-device-range]').forEach(n=>n.setAttribute('aria-pressed',String(Number(n.dataset.deviceRange)===ui.seconds)));
    const pause=host.querySelector('[data-device-pause]'), markup=icon(ui.frozen?'play':'pause')+(ui.frozen?'继续曲线':'暂停曲线');
    pause.setAttribute('aria-pressed',String(!!ui.frozen));if(pause._deviceMarkup!==markup){pause.innerHTML=markup;pause._deviceMarkup=markup;}
    paintTooltip(chart);
  }
  function paintTooltip(chart=chartState()){
    const tooltip=host?.querySelector('[data-device-tooltip]');if(!tooltip)return;
    if(ui.hover===null||!chart.valid.length){tooltip.hidden=true;return;}
    const target=chart.end-ui.seconds+ui.hover*ui.seconds, point=chart.valid.reduce((a,b)=>Math.abs(a.t-target)<=Math.abs(b.t-target)?a:b), channel=root.DeviceTelemetry.channels[ui.channel];
    tooltip.textContent=`${new Date(point.receivedAt).toLocaleTimeString()} · ${value(point.value)} ${channel.unit}${view.fresh?'':' · 历史'}`;tooltip.hidden=false;
  }
  function pointer(event){
    const area=event.target.closest('[data-device-chart]');if(!area)return;
    if(event.type==='pointerout'&&!area.contains(event.relatedTarget))ui.hover=null;
    else if(event.type==='pointermove'){const rect=area.getBoundingClientRect();ui.hover=Math.min(1,Math.max(0,((event.clientX-rect.left)/rect.width*geometry.width-geometry.left)/(geometry.right-geometry.left)));}
    paintTooltip();
  }
  function keydown(event){
    if(!event.target.matches('[data-device-chart]'))return;
    if(event.key==='Escape')ui.hover=null;
    else if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();const chart=chartState(),points=chart.valid;if(!points.length)return;
      const target=chart.end-ui.seconds+(ui.hover??1)*ui.seconds;
      const index=points.reduce((best,p,i)=>Math.abs(p.t-target)<Math.abs(points[best].t-target)?i:best,0);
      const next=event.key==='Home'?0:event.key==='End'?points.length-1:Math.max(0,Math.min(points.length-1,index+(event.key==='ArrowLeft'?-1:1)));
      ui.hover=(points[next].t-chart.end+ui.seconds)/ui.seconds;
    }else return;
    paintTooltip();
  }
  function message(text){
    const node=host?.querySelector('[data-device-message]');if(!node)return;
    root.clearTimeout(toastTimer);node.textContent=text;node.hidden=false;toastTimer=root.setTimeout(()=>{node.hidden=true;},4500);
  }
  async function copy(text,label){
    const container=host;
    try{if(!root.navigator?.clipboard?.writeText)throw new Error('manual-copy');await root.navigator.clipboard.writeText(text);if(container===host)message(label+'已复制');}
    catch(_){if(container!==host)return;const dialog=host.querySelector('[data-device-copy-dialog]'),field=dialog.querySelector('input');field.value=text;if(!dialog.open)dialog.showModal();field.focus();field.select();}
  }
  function closeSettings(){host?.querySelector('[data-device-settings-dialog]')?.close();}
  function click(event){
    const button=event.target.closest('button');if(!button||!host?.contains(button)||button.disabled)return;
    if(button.matches('[data-device-settings]')){settings?.();const dialog=host.querySelector('[data-device-settings-dialog]');if(!dialog.open)dialog.showModal();}
    else if(button.matches('[data-device-close]'))closeSettings();
    else if(button.matches('[data-device-copy-close]'))host.querySelector('[data-device-copy-dialog]').close();
    else if(button.matches('[data-device-channel]')){ui.channel=button.dataset.deviceChannel;ui.hover=null;paint(view,metadata);}
    else if(button.matches('[data-device-range]')){ui.seconds=Number(button.dataset.deviceRange);ui.hover=null;paintChart();}
    else if(button.matches('[data-device-network]')){ui.network=button.dataset.deviceNetwork;paintNetwork();}
    else if(button.matches('[data-device-pause]')){ui.frozen=ui.frozen?null:{end:now(),samples:history.values()};ui.hover=null;paintChart();}
    else if(button.matches('[data-device-copy-ip]'))copy(button.dataset.deviceCopyIp,'IPv4 地址');
    else if(button.matches('[data-device-copy-ssh]'))copy(`ssh ${metadata.sshUser}@${button.dataset.deviceCopySsh}`,'SSH 命令');
  }
  function mount(options){
    unmount();if(!options.container?.querySelector('.device-workspace'))return;
    host=options.container;settings=options.onSettings;
    root.ConnectionsPanel.mount(host.querySelector('.connections-panel'));
    if(root.ResizeObserver){resizeObserver=new root.ResizeObserver(()=>{if(host&&metadata&&view)paintChart();});resizeObserver.observe(host.querySelector('[data-device-chart]'));}
    for(const [name,handler] of Object.entries({click,keydown,pointermove:pointer,pointerout:pointer}))host.addEventListener(name,handler);
  }
  function unmount(){
    root.ConnectionsPanel.unmount();
    for(const [name,handler] of Object.entries({click,keydown,pointermove:pointer,pointerout:pointer}))host?.removeEventListener(name,handler);
    host?.querySelectorAll('[data-device-settings-dialog],[data-device-copy-dialog]').forEach(d=>{if(d.open)d.close();});
    root.clearTimeout(toastTimer);resizeObserver?.disconnect();resizeObserver=null;ui.frozen=null;ui.hover=null;host=null;settings=null;metadata=null;
  }
  return Object.freeze({render,observe,paint,mount,unmount,message,closeSettings,icon});
});
