(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.ConnectionsPanel=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const endpoint='/api/v1/maintenance/connections',security={open:'开放',wep:'WEP',wpa_psk:'WPA/WPA2',wpa3_sae:'WPA3',enterprise:'企业网络'};
  const plain=v=>v&&typeof v==='object'&&!Array.isArray(v),text=v=>typeof v==='string'&&v.length<=256;
  function validate(v){
    if(!plain(v)||v.protocol_version!=='hatchery-connections/1'||!text(v.session_id)||!['hardware','fixture','unavailable'].includes(v.source)||typeof v.available!=='boolean'||!Array.isArray(v.networks)||v.networks.length>256)return null;
    if(v.networks.some(n=>!plain(n)||!text(n.ssid)||!Number.isInteger(n.signal)||n.signal<0||n.signal>100||!Object.hasOwn(security,n.security)||typeof n.saved!=='boolean'))return null;
    const b=v.bluetooth;
    if(b!=null&&(!plain(b)||typeof b.available!=='boolean'||![true,false,null].includes(b.powered)||!Array.isArray(b.devices)||b.devices.length>128||b.devices.some(d=>!plain(d)||!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(d.mac)||!text(d.name)||typeof d.paired!=='boolean'||typeof d.connected!=='boolean')))return null;
    if(v.wifi!=null&&(!plain(v.wifi)||![true,false,null].includes(v.wifi.enabled)||!plain(v.wifi.state)||!['connected','connecting','disconnected','unavailable'].includes(v.wifi.state.state)||!(v.wifi.state.ssid===null||text(v.wifi.state.ssid))))return null;
    if(v.operation!=null&&(!plain(v.operation)||!['pending','complete','error'].includes(v.operation.state)||!text(v.operation.request_id)))return null;
    return v;
  }
  let host=null,state=null,fresh=false,busy=false,tab='wifi',selected=null,epoch=0,timer=null,request=null,write=null,pending=null,lastOperation=null;
  const icon=name=>root.DeviceOverview?.icon(name)||'';
  function render(){return `<section class="panel device-network-panel connections-panel"><div class="device-panel-heading"><div><span class="device-kicker">CONNECTIONS</span><h3>网络与蓝牙</h3></div><button type="button" class="device-text-button" data-connections-scan disabled>${icon('refresh')}刷新列表</button></div><div class="connections-tabs" role="tablist" aria-label="连接方式"><button type="button" role="tab" data-connections-tab="wifi" aria-selected="true">${icon('wifi')}Wi-Fi</button><button type="button" role="tab" data-connections-tab="bluetooth" aria-selected="false">${icon('bluetooth')}蓝牙</button></div><div class="connections-toolbar"><div><strong data-connections-title>Wi-Fi</strong><span data-connections-summary>读取连接状态</span></div><button type="button" role="switch" aria-checked="false" aria-label="Wi-Fi 开关" class="connections-switch" data-connections-power disabled><i></i></button></div><div class="connections-list" data-connections-list><p class="connections-empty">连接设备后可扫描附近网络</p></div><div class="connections-bottom"><span data-connections-state role="status" aria-live="polite">未连接</span></div><dialog class="connections-dialog" data-connections-dialog aria-labelledby="connections-dialog-title"><form data-connections-form><div class="device-dialog-heading"><h3 id="connections-dialog-title">连接 Wi-Fi</h3><button type="button" class="icon-button" data-connections-close aria-label="关闭">×</button></div><label>网络名称<input data-connections-ssid maxlength="32" required autocomplete="off"></label><label data-connections-password-label>密码<input type="password" data-connections-password maxlength="128" autocomplete="new-password"></label><div class="device-dialog-actions"><button type="button" class="button secondary" data-connections-close>取消</button><button type="submit" class="button primary">连接</button></div></form></dialog></section>`;}
  const enabled=()=>fresh&&state?.source==='hardware'&&state.available&&(tab==='wifi'?state.wifi_available!==false:state.bluetooth_available!==false)&&!busy&&!pending;
  function inject(key,markup){const n=host?.querySelector('[data-connections-'+key+']');if(n&&n._markup!==markup){n.innerHTML=markup;n._markup=markup;}}
  function message(text){const n=host?.querySelector('[data-connections-state]');if(n)n.textContent=text;}
  function paint(){
    if(!host)return;
    const wifi=tab==='wifi',info=state?.wifi?.state,bt=state?.bluetooth,powered=wifi?state?.wifi?.enabled:bt?.powered,can=enabled();
    host.querySelectorAll('[data-connections-tab]').forEach(n=>n.setAttribute('aria-selected',String(n.dataset.connectionsTab===tab)));
    host.querySelector('[data-connections-title]').textContent=wifi?'Wi-Fi':'蓝牙';
    const summary=!fresh?'连接设备后查看':wifi?info?.state==='connected'?info.ssid:info?.state==='connecting'?'正在连接…':powered===false?'已关闭':info?.state==='unavailable'?'Wi-Fi 不可用':'未连接':!bt?.available?'蓝牙不可用':powered?'可连接附近设备':'已关闭';
    host.querySelector('[data-connections-summary]').textContent=summary||'未取得状态';
    const power=host.querySelector('[data-connections-power]');power.setAttribute('aria-checked',String(powered===true));power.setAttribute('aria-label',(wifi?'Wi-Fi':'蓝牙')+' 开关');power.disabled=!can||typeof powered!=='boolean';
    host.querySelector('[data-connections-scan]').disabled=!can||powered===false;
    if(wifi){
      const networks=[...(state?.networks||[])];
      if(info?.state==='connected'&&info.ssid&&!networks.some(n=>n.ssid===info.ssid))networks.unshift({ssid:info.ssid,signal:info.signal??0,security:null,saved:true});
      networks.sort((a,b)=>(b.ssid===info?.ssid)-(a.ssid===info?.ssid)||b.signal-a.signal);
      inject('list',networks.map((n,i)=>{const current=info?.state==='connected'&&n.ssid===info.ssid;return `<div class="connections-row ${current?'is-connected':''}"><span class="connections-row-icon">${icon('wifi')}</span><div class="connections-row-copy"><strong>${escape(n.ssid)}</strong><small>${current?'已连接':n.saved?'已保存':security[n.security]||'安全性未知'}${Number.isInteger(n.signal)?' · '+n.signal+'%':''}</small></div><div class="connections-row-actions">${current?`<button type="button" data-connections-action="wifi_disconnect" ${!can?'disabled':''}>断开</button>`:`<button type="button" data-connections-wifi="${escape(n.ssid)}" ${!can||['enterprise','wep'].includes(n.security)?'disabled':''}>连接</button>`}${n.saved?`<button type="button" class="connections-more" data-connections-forget="${escape(n.ssid)}" ${!can?'disabled':''}>忘记</button>`:''}</div></div>`;}).join('')||`<p class="connections-empty">${!fresh?'连接设备后查看':powered===false?'开启 Wi-Fi 后扫描网络':'点击刷新，查找附近网络'}</p>`);
    }else inject('list',(bt?.devices||[]).map(d=>`<div class="connections-row ${d.connected?'is-connected':''}"><span class="connections-row-icon">${icon(d.icon==='input-gaming'?'gamepad':'bluetooth')}</span><div class="connections-row-copy"><strong>${escape(d.name||'未命名设备')}</strong><small>${d.connected?'已连接':d.paired?'已配对':'未配对'}</small></div><div class="connections-row-actions"><button type="button" data-connections-bt="${d.connected?'disconnect':d.paired?'connect':'pair'}" data-mac="${escape(d.mac)}" ${!can||powered!==true?'disabled':''}>${d.connected?'断开':d.paired?'连接':'配对'}</button>${d.paired?`<button type="button" class="connections-more" data-connections-bt="forget" data-mac="${escape(d.mac)}" ${!can?'disabled':''}>移除</button>`:''}</div></div>`).join('')||`<p class="connections-empty">${!fresh?'连接设备后查看':powered===false?'开启蓝牙后扫描':'点击刷新，查找附近蓝牙设备'}</p>`);
  }
  function outcome(operation){
    if(!operation||operation.state==='pending')return;
    if(pending===operation.request_id)pending=null;else if(pending){pending=null;message('操作记录已更新，请确认当前状态');}
    const key=operation.request_id+operation.state;if(lastOperation===key)return;lastOperation=key;
    const r=operation.result;
    if(operation.state==='error')message('操作未完成，请刷新确认当前状态');
    else if(r?.outcome==='failed'){const labels={bad_key:'密码错误或认证失败',not_found:'找不到网络',timeout:'连接超时',unsupported:'不支持此连接方式',no_adapter:'没有可用蓝牙适配器',ambiguous:'请指定一个设备',other:'操作失败'};message(labels[r.reason]||'连接未完成，请重试');}
    else message(r?.outcome==='connected'?'Wi-Fi 已连接':r?.outcome==='paired'?'已配对':'操作完成，正在更新状态');
  }
  async function refresh(){
    if(!host||request||!root.HATCHERY_BACKEND)return;
    const ticket=epoch,controller=new root.AbortController();request=controller;const timeout=root.setTimeout(()=>controller.abort(),5500);
    try{const reply=await root.fetch(endpoint,{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!reply.ok)throw Error();const next=validate(await reply.json());if(!next)throw Error();if(!host||epoch!==ticket)return;
      if(state?.session_id&&next.session_id!==state.session_id){pending=null;message('服务已重启，请确认连接状态');}
      state=next;fresh=next.available&&next.source==='hardware';busy=next.operation?.state==='pending';outcome(next.operation);if(busy)message('正在操作…');else if(!fresh)message('配置服务未连接');paint();
    }catch(_){if(host&&ticket===epoch){fresh=false;message(pending?'连接中断，请确认操作结果':'配置服务未连接');paint();}}
    finally{root.clearTimeout(timeout);if(request===controller)request=null;}
  }
  async function submit(command){
    if(!enabled()||write)return false;
    const ticket=epoch,controller=new root.AbortController(),id=root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);write=controller;pending=id;busy=true;paint();message('正在操作…');
    const timeout=root.setTimeout(()=>controller.abort(),6000);
    try{const reply=await root.fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Hatchery-Command':'1'},body:JSON.stringify({session_id:state.session_id,request_id:id,command}),signal:controller.signal});if(!reply.ok)throw Error();await reply.json();if(host&&ticket===epoch){busy=false;await refresh();}}
    catch(_){if(host&&ticket===epoch){fresh=false;message('请求中断，请刷新确认结果后重试');paint();}}
    finally{root.clearTimeout(timeout);if(write===controller)write=null;}
    return true;
  }
  function openWifi(ssid,hidden=false){const n=state.networks.find(n=>n.ssid===ssid);if(n?.saved||n?.security==='open'){submit({action:'wifi_connect',ssid,psk:null});return;}selected=n||{ssid,security:'wpa_psk'};const dialog=host.querySelector('[data-connections-dialog]'),name=dialog.querySelector('[data-connections-ssid]');name.value=ssid;name.readOnly=!hidden;dialog.querySelector('[data-connections-password]').value='';dialog.showModal();(hidden?name:dialog.querySelector('[data-connections-password]')).focus();}
  function close(){const d=host?.querySelector('[data-connections-dialog]');if(d){d.querySelector('[data-connections-password]').value='';d.close();}selected=null;}
  function click(event){const b=event.target.closest('button');if(!b||!host?.contains(b)||b.disabled)return;
    if(b.matches('[data-connections-tab]')){tab=b.dataset.connectionsTab;paint();}
    else if(b.matches('[data-connections-scan]'))submit({action:tab==='wifi'?'wifi_scan':'bluetooth_scan'});
    else if(b.matches('[data-connections-power]')){const value=tab==='wifi'?state?.wifi?.enabled:state?.bluetooth?.powered;submit({action:tab==='wifi'?'wifi_radio':'bluetooth_radio',enabled:!value});}
    else if(b.matches('[data-connections-wifi]'))openWifi(b.dataset.connectionsWifi);
    else if(b.matches('[data-connections-forget]')){if(root.confirm('忘记此 Wi-Fi？下次连接需要重新输入密码。'))submit({action:'wifi_forget',ssid:b.dataset.connectionsForget});}
    else if(b.matches('[data-connections-bt]')){if(b.dataset.connectionsBt==='forget'&&!root.confirm('移除此设备并清除配对？'))return;submit({action:'bluetooth_'+b.dataset.connectionsBt,mac:b.dataset.mac});}
    else if(b.matches('[data-connections-action]'))submit({action:b.dataset.connectionsAction});
    else if(b.matches('[data-connections-close]'))close();
  }
  function form(event){if(!event.target.matches('[data-connections-form]'))return;event.preventDefault();const d=host.querySelector('[data-connections-dialog]'),ssid=d.querySelector('[data-connections-ssid]').value,psk=d.querySelector('[data-connections-password]').value||null;close();submit({action:'wifi_connect',ssid,psk});}
  function mount(container){unmount();host=container;if(!host)return;host.addEventListener('click',click);host.addEventListener('submit',form);host.querySelector('[data-connections-dialog]').addEventListener('cancel',close);if(root.HATCHERY_BACKEND){refresh();timer=root.setInterval(refresh,2500);}else{message('未连接');paint();}}
  function unmount(){epoch++;root.clearInterval(timer);timer=null;request?.abort();write?.abort();request=null;write=null;close();host?.removeEventListener('click',click);host?.removeEventListener('submit',form);host=null;state=null;fresh=false;busy=false;pending=null;lastOperation=null;}
  return Object.freeze({render,mount,unmount,validate,refresh});
});
