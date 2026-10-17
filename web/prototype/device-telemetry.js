(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeviceTelemetry = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const channels = Object.freeze({
    cpu: Object.freeze({ name:'CPU 占用', unit:'%', color:'var(--moss)' }),
    memory: Object.freeze({ name:'内存占用', unit:'%', color:'#a47720' }),
    temperature: Object.freeze({ name:'板载温度', unit:'°C', color:'#9b654a' })
  });
  function metrics(data) {
    const s = data?.system, total = s?.memory_total_bytes, available = s?.memory_available_bytes;
    const used = finite(total) && total > 0 && finite(available) && available >= 0 && available <= total ? total-available : null;
    return { cpu:finite(s?.cpu_percent) ? s.cpu_percent : null, memory:used === null ? null : used/total*100,
      temperature:finite(s?.hottest_zone_celsius) ? s.hottest_zone_celsius : null,
      used, total:finite(total) && total > 0 ? total : null, uptime:finite(s?.uptime_seconds) ? s.uptime_seconds : null };
  }
  function connection(snapshot) {
    if (!snapshot?.available) return { tone:'quiet', label:'等待连接', title:'让你的小鸭上线', detail:'连接设备后，就能查看它的运行与网络状态。' };
    if (snapshot.status === 'connecting') return { tone:'pending', label:'连接中', title:'正在联系设备', detail:'正在获取设备身份与最新状态。' };
    if (!snapshot.fresh) return snapshot.data
      ? { tone:'warning', label:'连接中断', title:'暂时收不到新状态', detail:'保留上次读数供查看，连接恢复后会继续更新。' }
      : { tone:'quiet', label:'尚未连接', title:'还没有联系上设备', detail:'检查设备供电与网络，或打开连接说明。' };
    return { tone:'online', label:'已连接', title:'设备已连接', detail:snapshot.data.service.servo_fake
      ? '设备系统状态正在更新；舵机当前使用样例数据。'
      : snapshot.data.service.servo_connection === 'open' ? '设备系统状态正在更新，舵机串口已打开。' : '设备系统状态正在更新，舵机串口尚未连接。' };
  }
  const daemons = Object.freeze([
    {name:'robotd',description:'运动与舵机控制',icon:'chip'},
    {name:'mediad',description:'相机与媒体传输',icon:'camera'},
    {name:'configd',description:'设备配置',icon:'settings'},
    {name:'btd',description:'蓝牙连接',icon:'bluetooth'},
    {name:'padd',description:'手柄输入',icon:'gamepad'},
    {name:'updaterd',description:'软件更新',icon:'refresh'}
  ].map(Object.freeze));
  function daemonState(row) {
    if (!row) return {label:'未知',tone:'quiet',running:false,hint:'等待板端回报'};
    // Keep crash loops and failures visible even if a process briefly exists.
    if (row.state === 'restarting') return {label:row.sub_state==='auto-restart'?'重启中':'启动中',tone:'pending',running:false,hint:row.sub_state==='auto-restart'?'服务退出后正在重新启动':'systemd 正在启动服务'};
    if (row.state === 'failed') return {label:'启动失败',tone:'error',running:false,hint:row.process_pid?'systemd 失败；另检测到同名进程':'systemd 报告服务失败'};
    if (row.sub_state?.startsWith('stop') || row.sub_state==='final-sigterm') return {label:'停止中',tone:'pending',running:false,hint:'systemd 正在停止服务'};
    if (row.state === 'active') return {label:row.sub_state==='exited'?'已启动':'运行中',tone:'online',running:true,hint:'由 systemd 管理'};
    if (row.process_pid) return {label:'独立运行',tone:'online',running:true,hint:'服务单元未运行，程序进程仍在'};
    if (row.state === 'inactive') return {label:'已停止',tone:'quiet',running:false,hint:'systemd 服务未运行'};
    if (row.state === 'absent') return {label:'未安装服务',tone:'quiet',running:false,hint:'未找到 systemd 服务单元'};
    return {label:'未知',tone:'quiet',running:false,hint:'暂时无法取得启动状态'};
  }
  function services(snapshot) {
    return daemons.map(spec=>{
      const row=snapshot?.data?.services?.find(row=>row.name===spec.name) || null, state=daemonState(row);
      if (!snapshot?.fresh) return {...spec,row,...state,label:row?state.label+' · 上次':'未知',tone:'quiet',running:false,hint:row?'连接中断，等待更新':snapshot?.data?'后端尚未提供服务状态':'连接设备后显示启动状态'};
      return {...spec,row,...state};
    });
  }
  function ipv4(address) {
    if (typeof address !== 'string') return null;
    const candidate = address.split('/')[0];
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)) return null;
    const parts = candidate.split('.').map(Number);
    return parts.every(n=>n<=255) && parts[0] !== 0 && parts[0] !== 127 && !(parts[0]===169 && parts[1]===254) ? candidate : null;
  }
  function links(data) {
    return (data?.interfaces || []).filter(n=>n.kind !== 'loopback').map(n=>{
      const address = (n.addresses || []).map(ipv4).find(Boolean) || null;
      const online = n.carrier === true || (n.carrier !== false && n.state === 'up');
      return { ...n, address, online, label:online ? '链路在线' : n.carrier === false || n.state === 'down' ? '链路离线' : '链路待确认' };
    });
  }
  // Only real, fresh observations; monotonic receipt time survives wall-clock corrections.
  function createHistory(limit=181) {
    let samples=[], identity=null, receipt=null, uptime=null;
    function clear() { samples=[]; identity=null; receipt=null; uptime=null; }
    function accept(snapshot, now) {
      if (!snapshot?.fresh || !snapshot.data || !finite(now)) return false;
      const key=snapshot.data.identity.id || snapshot.data.identity.hostname || 'current-host', next=metrics(snapshot.data);
      if (key !== identity || (finite(uptime) && finite(next.uptime) && next.uptime < uptime)) { clear(); identity=key; }
      if (snapshot.receivedAt === receipt || (samples.length && now <= samples[samples.length-1].t)) return false;
      receipt=snapshot.receivedAt; uptime=next.uptime;
      samples.push({t:now, receivedAt:snapshot.receivedAt, cpu:next.cpu, memory:next.memory, temperature:next.temperature});
      if (samples.length>limit) samples.splice(0,samples.length-limit);
      return true;
    }
    return Object.freeze({accept,clear,values:()=>samples.map(p=>({...p}))});
  }
  function series(samples, channel, end, seconds) {
    return samples.filter(p=>p.t >= end-seconds && p.t <= end).map(p=>({t:p.t,value:p[channel],receivedAt:p.receivedAt}));
  }
  function extent(points, channel) {
    if (channel !== 'temperature') return [0,100];
    const values=points.map(p=>p.value).filter(finite);
    if (!values.length) return [0,100];
    const low=Math.min(...values), high=Math.max(...values), padding=Math.max(2,(high-low)*.2);
    return [Math.floor((low-padding)/5)*5,Math.ceil((high+padding)/5)*5];
  }
  return Object.freeze({channels,metrics,connection,daemons,daemonState,services,ipv4,links,createHistory,series,extent});
});
