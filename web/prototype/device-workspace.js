(function (root, factory) {
  'use strict';
  const api=factory(root);
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.DeviceWorkspace=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storageKey='hatchery-device-preferences/1';
  const routes={unknown:'未注明',ssh:'SSH 转发',usb:'USB 网络',wifi:'Wi-Fi',local:'电脑本地维护'};
  const validUser=value=>/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,31}$/.test(value);
  let preferences={aliases:Object.create(null),paths:Object.create(null),users:Object.create(null)};
  try{
    const saved=JSON.parse(root.localStorage?.getItem(storageKey)||'null');
    if(saved&&typeof saved==='object')for(const key of Object.keys(preferences)){
      if(saved[key]&&typeof saved[key]==='object'&&!Array.isArray(saved[key]))preferences[key]=Object.assign(Object.create(null),Object.fromEntries(Object.entries(saved[key]).slice(0,64).filter(([k,v])=>k.length<=256&&typeof v==='string'&&v.length<=80&&(key!=='paths'||Object.hasOwn(routes,v))&&(key!=='users'||validUser(v)))));
    }
  }catch(_){/* Browser preferences are optional. */}
  let host=null,unsubscribe=null,unsubscribeSystem=null,view=null,page='device',generation=0;
  const endpoint=()=>['http:','https:'].includes(root.location?.protocol)?root.location.origin:'离线文件';
  const identityKey=snapshot=>snapshot?.data?.identity.id||endpoint();
  const nameFor=snapshot=>preferences.aliases[identityKey(snapshot)]||snapshot?.configuration?.data?.info?.name||snapshot?.data?.identity.name||snapshot?.data?.identity.hostname||'我的 Microduck';
  const sshUser=()=>preferences.users[identityKey(view)]||'duck';
  const busText=service=>!service?'待确认':service.servo_fake?'舵机样例':service.servo_connection==='open'?'串口已打开':'串口未连接';
  function headerMarkup(){return `<div class="devicebar"><div class="device-id"><span class="device-icon device-header-icon">${root.DeviceOverview.icon('duck')}</span><div><strong data-device-name>Hatchery · 等待设备</strong><p class="mono" data-device-identity>正在确认设备身份</p></div><span class="badge draft" data-device-online>等待连接</span></div><div class="device-stats"><div>当前入口<strong class="mono" data-device-endpoint>${escape(endpoint())}</strong></div><div>连接方式<strong data-device-path>尚未备注</strong></div><div>舵机状态<strong data-device-bus>待确认</strong></div></div></div>`;}
  function render(){return root.DeviceOverview.render()+root.InputPanel.render();}
  function banner(snapshot){
    if(page==='overview')return '总控只读观察正式 robotd；连接、数据模式与有效性以面板状态为准。';
    if(!snapshot.available)return '静态预览 · 尚未连接设备，系统状态保留未知。';
    if(!snapshot.fresh)return(snapshot.data?'连接暂时中断 · 保留上次设备信息。':'设备后端未连接 · ')+(snapshot.error||'正在获取状态。');
    const source=busText(snapshot.data.service);
    return page==='parameters'?`系统信息来自当前设备；${source}。`:page==='sensors'?`IMU 为样例；相机与 ToF 以各自连接状态为准，${source}。`:`系统信息来自当前设备；曲线与 3D 读取 robotd 反馈，缺测保留为空，${source}。`;
  }
  function paint(snapshot){
    if(!host)return;
    snapshot={...snapshot,configuration:root.DeviceSystem.snapshot()};
    view=snapshot;root.DeviceOverview.observe(snapshot);
    const data=snapshot.data,live=snapshot.fresh?data:null,id=data?.identity,name=nameFor(snapshot),status=root.DeviceTelemetry.connection(snapshot);
    const put=(key,text)=>host.querySelectorAll('[data-device-'+key+']').forEach(n=>{n.textContent=text;});
    put('name',snapshot.available?name:'Hatchery · 静态预览');put('page-name',name);
    put('identity',`${id?.hostname||'主机待识别'}${data&&!live?' · 上次连接':''}`);
    put('endpoint',endpoint());put('path',preferences.paths[endpoint()]&&preferences.paths[endpoint()]!=='unknown'?routes[preferences.paths[endpoint()]]+' · 备注':'查看设备页');
    put('bus',live?busText(live.service):'待确认');
    const online=host.querySelector('[data-device-online]');if(online){online.textContent=status.label;online.className='badge '+(snapshot.fresh?'readonly':snapshot.data?'stale':'draft');}
    const notice=host.querySelector('[data-device-banner]');if(notice){notice.textContent=banner(snapshot);notice.className='status-banner'+(snapshot.available&&!snapshot.fresh&&snapshot.status!=='connecting'?' offline':'');}
    root.DeviceOverview.paint(snapshot,{name,endpoint:endpoint(),sshUser:sshUser()});
    const field=host.querySelector('[data-device-remote-name]'),button=host.querySelector('[data-device-rename]');
    if(field)field.disabled=!snapshot.configuration.fresh||snapshot.configuration.pending;
    if(button)button.disabled=!snapshot.configuration.fresh||snapshot.configuration.pending;
  }
  function submit(event){
    if(!event.target.matches('[data-device-label-form]'))return;
    event.preventDefault();const alias=host.querySelector('[data-device-alias]').value.trim(),user=host.querySelector('[data-device-ssh-user]'),username=user.value.trim()||'duck';
    if(!validUser(username)){user.setCustomValidity('请输入有效的 SSH 用户名');user.reportValidity();return;}
    user.setCustomValidity('');
    if(alias)preferences.aliases[identityKey(view)]=alias;else delete preferences.aliases[identityKey(view)];
    preferences.users[identityKey(view)]=username;preferences.paths[endpoint()]=host.querySelector('[data-device-path-choice]').value;
    let saved=true;try{root.localStorage.setItem(storageKey,JSON.stringify(preferences));}catch(_){saved=false;}
    paint(view);root.DeviceOverview.closeSettings();root.DeviceOverview.message(saved?'显示设置已保存到本浏览器':'设置已应用；当前浏览器无法持久保存');
  }
  async function click(event){
    const button=event.target.closest('button');if(!button||!host?.contains(button)||button.disabled)return;
    if(button.matches('[data-device-rename]')){
      const ticket=generation,field=host.querySelector('[data-device-remote-name]'),result=host.querySelector('[data-device-name-result]');
      result.textContent='正在保存…';
      try{const saved=await root.DeviceSystem.rename(field.value);if(ticket!==generation||!host)return;field.value=saved.name;result.textContent='已保存到设备';}
      catch(error){if(ticket===generation&&host)result.textContent=error.message;}
    }else if(button.matches('[data-device-refresh]')){
      root.DeviceSession.refresh();root.DeviceSystem.refresh();root.DeviceOverview.message(view?.available?'正在刷新设备状态':'当前是静态预览，请先连接设备');
    }
  }
  function input(event){if(event.target.matches('[data-device-ssh-user]'))event.target.setCustomValidity('');}
  function mount(options){
    unmount();host=options?.container;page=options?.view||'device';if(!host)return;
    root.InputPanel.mount(host.querySelector('[data-input-panel]'));
    host.addEventListener('submit',submit);host.addEventListener('click',click);host.addEventListener('input',input);
    root.DeviceOverview.mount({container:host,onSettings:()=>{
      const configuration=root.DeviceSystem.snapshot();
      host.querySelector('[data-device-remote-name]').value=configuration.data?.info?.name||'';
      host.querySelector('[data-device-name-result]').textContent=configuration.fresh?'由板端配置服务保存':configuration.error||'配置服务未连接';
      host.querySelector('[data-device-alias]').value=preferences.aliases[identityKey(view)]||'';
      host.querySelector('[data-device-path-choice]').value=preferences.paths[endpoint()]||'unknown';
      const user=host.querySelector('[data-device-ssh-user]');user.value=sshUser();user.setCustomValidity('');
    }});
    unsubscribe=root.DeviceSession.subscribe(paint);root.DeviceSession.start();
    unsubscribeSystem=root.DeviceSystem.subscribe(()=>paint(root.DeviceSession.snapshot()));root.DeviceSystem.start();
  }
  function unmount(){
    root.InputPanel.unmount();
    generation++;unsubscribeSystem?.();unsubscribeSystem=null;root.DeviceSystem.stop();
    unsubscribe?.();unsubscribe=null;host?.removeEventListener('submit',submit);host?.removeEventListener('click',click);host?.removeEventListener('input',input);
    root.DeviceOverview.unmount();host=null;
  }
  return Object.freeze({render,headerMarkup,mount,unmount});
});
