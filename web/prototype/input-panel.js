/* Official padd raw-input monitor. It does not claim robot control ownership. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.InputPanel=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const integer=Number.isSafeInteger,plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
  function validate(v){
    if(!plain(v)||v.protocol_version!=='hatchery-input/1'||v.source!=='padd'||typeof v.session_id!=='string'||v.session_id.length>100||typeof v.connected!=='boolean'||typeof v.fresh!=='boolean'||(v.fresh&&!v.connected))return null;
    if(v.device!==null){const d=v.device;if(!plain(d)||typeof d.name!=='string'||d.name.length>512||!integer(d.bus)||!Array.isArray(d.axes)||d.axes.length>64||!Array.isArray(d.buttons)||d.buttons.length>256)return null;
      if(!d.axes.every(a=>plain(a)&&integer(a.code)&&typeof a.name==='string'&&a.name.length<=100&&['min','max','value'].every(k=>integer(a[k]))&&a.min<a.max)||!d.buttons.every(b=>plain(b)&&integer(b.code)&&typeof b.name==='string'&&b.name.length<=100&&typeof b.pressed==='boolean'))return null;}
    return JSON.parse(JSON.stringify(v));
  }
  let host=null,timer=null,request=null,generation=0,last=null,lastAt=0;
  function render(){return `<section class="panel input-panel" data-input-panel><div class="panel-title"><h3>输入设备</h3><span class="badge draft" data-input-status>等待连接</span></div><div class="input-panel-body"><strong data-input-name>未发现手柄</strong><p class="small muted" data-input-message>连接板端 padd 后查看按键与摇杆。</p><div class="input-axes" data-input-axes></div><div class="input-buttons" data-input-buttons></div><details><summary>输入详情</summary><dl data-input-detail></dl></details></div></section>`;}
  function paint(v,message){if(!host)return;const d=v?.device,live=v?.fresh&&d;
    host.querySelector('[data-input-name]').textContent=d?.name||'未发现手柄';
    host.querySelector('[data-input-status]').textContent=!v?.connected?'服务未连接':live?'正在接收':d?'等待新输入':'等待手柄';
    host.querySelector('[data-input-message]').textContent=message||(d?`${d.bus===5?'蓝牙':d.bus===3?'USB':'其他总线'} · ${live?'实时输入':'输入值暂不显示'} · 仅观察`:'可在上方蓝牙面板配对手柄，也可通过 USB 连接。');
    host.querySelector('[data-input-axes]').innerHTML=(d?.axes||[]).map(a=>`<label><span>${escape(a.name)}</span><meter min="${a.min}" max="${a.max}" value="${live?a.value:a.min}" ${live?'':'hidden'}></meter><output>${live?a.value:'—'}</output></label>`).join('');
    host.querySelector('[data-input-buttons]').innerHTML=(d?.buttons||[]).map(b=>`<span class="input-key ${live&&b.pressed?'pressed':''}" aria-label="${escape(b.name)} ${live?(b.pressed?'按下':'松开'):'状态未知'}">${escape(b.name)}</span>`).join('');
    host.querySelector('[data-input-detail]').innerHTML=[['来源','padd · pad.input'],['设备节点',d?.node||'—'],['输入序号',v?.frame?.seq??'—'],['距离最近输入',v?.age_ms==null?'—':`${Math.round(v.age_ms)} ms`],['控制来源','该只读报告不声明运动控制权']].map(([k,x])=>`<div><dt>${escape(k)}</dt><dd>${escape(x)}</dd></div>`).join('');
  }
  async function refresh(){if(!host||request)return;const id=generation,ctrl=new root.AbortController();request=ctrl;const timeout=root.setTimeout(()=>ctrl.abort(),2500);try{const response=await root.fetch('/api/v1/maintenance/input',{credentials:'same-origin',cache:'no-store',signal:ctrl.signal});if(!response.ok)throw Error('输入服务不可用');const raw=await response.text();if(raw.length>131072)throw Error('输入报告过大');const value=validate(JSON.parse(raw));if(!value)throw Error('输入报告无效');if(id===generation){last=value;lastAt=root.performance.now();paint(value);}}catch(e){if(id===generation)paint(null,e.name==='AbortError'?'输入读取超时':e.message);}finally{root.clearTimeout(timeout);if(request===ctrl)request=null;}}
  function mount(container){unmount();host=container;if(!host)return;if(root.HATCHERY_BACKEND?.apiBase!=='/api/v1/maintenance'){paint(null,'离线预览 · 不读取设备输入');return;}refresh();timer=root.setInterval(()=>{if(last&&root.performance.now()-lastAt>=1500)paint({...last,fresh:false},'输入读取已过期');refresh();},500);}
  function unmount(){generation++;request?.abort();request=null;if(timer!==null)root.clearInterval(timer);timer=null;host=null;last=null;lastAt=0;}
  return Object.freeze({render,mount,unmount,validate});
});
