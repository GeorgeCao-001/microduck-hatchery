(function(root){
  'use strict';let host=null,unsubscribe=null;
  const escape=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(v,d=1)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(d):'—';
  function render(){return `<div class="robot-overview"><section class="panel robot-runtime-hero"><div><span class="device-kicker">LIVE ROBOT</span><h2 data-runtime-title>等待正式 robotd</h2><p data-runtime-message>连接板端程序后，显示实时运行状态。</p></div><span class="badge draft" data-runtime-link>只读</span></section><div class="robot-runtime-grid"><section class="panel"><div class="panel-title"><h3>控制循环</h3><span class="small muted" data-runtime-loop-state>等待程序</span></div><div class="robot-runtime-value"><strong data-runtime-hz>—</strong><span>Hz</span><small data-runtime-target></small></div><dl><div><dt>累计周期</dt><dd data-runtime-ticks>—</dd></div><div><dt>超时周期</dt><dd data-runtime-missed>—</dd></div><div><dt>最近周期</dt><dd data-runtime-tick-age>—</dd></div></dl></section><section class="panel"><div class="panel-title"><h3>策略与状态</h3><span class="small muted" data-runtime-frame-state>等待帧</span></div><div class="robot-runtime-value"><strong class="robot-policy-name" data-runtime-policy>—</strong></div><dl><div><dt>姿态判定</dt><dd data-runtime-posture>—</dd></div><div><dt>已报告关节</dt><dd data-runtime-joints>—</dd></div><div><dt>母线电压</dt><dd data-runtime-voltage>—</dd></div></dl></section><section class="panel"><div class="panel-title"><h3>程序检查</h3><span class="small muted">robot.health</span></div><div class="robot-runtime-health" data-runtime-health>等待结果</div><p class="robot-runtime-reason" data-runtime-reason></p><dl><div><dt>IMU 就绪</dt><dd data-runtime-imu>—</dd></div><div><dt>状态帧年龄</dt><dd data-runtime-age>—</dd></div><div><dt>数据模式</dt><dd>后端未声明</dd></div></dl></section></div><details class="panel robot-runtime-details"><summary>运行详情</summary><dl data-runtime-details></dl></details></div>`;}
  function paint(view){
    if(!host)return;const d=view.data,health=view.healthFresh?d?.health:null,frame=view.fresh?d?.state:null,loop=health?.control_loop;
    const put=(key,value)=>{host.querySelector('[data-runtime-'+key+']').textContent=value;};
    put('title',!view.available?'连接后查看实时状态':d?.connected?(view.fresh?'正式状态正在更新':view.healthFresh?'robotd 已连接':'等待新的运行状态'):'等待正式 robotd');
    put('message',!view.available?'当前为静态预览。':frame?'只读观察当前控制循环；动作与参数修改保持在原入口。':health?.reason||view.error||'尚未收到正式状态帧；可以先查看设备页的程序服务。');
    put('link',view.fresh?'实时 · 只读':view.healthFresh?'程序已连接':'尚无实时数据');
    host.querySelector('[data-runtime-link]').className='badge '+(view.fresh||view.healthFresh?'readonly':'draft');
    put('hz',number(loop?loop.achieved_hz:frame?.loop.hz));put('target',loop?' / '+number(loop.target_hz,0)+' Hz':'');
    put('loop-state',loop?'板端回报':'未提供');put('ticks',loop?String(loop.ticks):'—');put('missed',loop?String(loop.missed):frame?String(frame.loop.missed):'—');put('tick-age',loop?loop.last_tick_age_ms+' ms':'—');
    put('frame-state',view.fresh?'实时':d?.state?'已过期':'未收到');put('policy',frame?({held:'保持',walk:'行走策略',stand:'站立策略'}[frame.policy]||frame.policy):'—');
    put('posture',frame?(frame.safety.fallen?'后端报告倾倒':frame.safety.limp?'后端报告卸力':'后端未报告倾倒'):'—');put('joints',frame?frame.joints.length+' 个':'—');put('voltage',health?.battery?number(health.battery.volts,2)+' V':'—');
    put('health',health?(health.healthy?'程序检查通过':health.degraded?'硬件条件未满足':'程序检查未通过'):'等待新结果');put('reason',health?.reason||'');
    put('imu',health?.imu?(health.imu.ready?'后端报告就绪':'后端尚未就绪'):'未提供');put('age',view.fresh?number(d.frame_age_ms,0)+' ms':'—');
    const rows=[['状态会话',d?.session_id],['程序版本',d?.hello?.daemon_version],['API',d?.hello?.api_version],['源码版本',d?.hello?.revision],['设备单调时钟 ns',d?.device_mono_ns],['保持原因',d?.subscription?.unavailable],['接口诊断',view.error||d?.error]];
    host.querySelector('[data-runtime-details]').innerHTML=rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${escape(v||'—')}</dd></div>`).join('');
  }
  function mount(container){unmount();host=container;if(host)unsubscribe=root.RobotSession.subscribe(paint);}
  function unmount(){unsubscribe?.();unsubscribe=null;host=null;}
  root.RobotOverview=Object.freeze({render,mount,unmount});
})(window);
