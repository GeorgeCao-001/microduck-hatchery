/* Thin client for official configd system.info / services / logs / set_name.
 * Persistence and system access remain in configd; no installer or motion RPCs. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DeviceSystem=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const endpoint='/api/v1/maintenance/system';
  const units=Object.freeze(['robotd','mediad','configd','btd','padd','updaterd','tofd','netpadd','nfcd','bluetooth','NetworkManager']);
  const states=['active','restarting','failed','inactive','absent','unknown'];
  const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const text=(v,max=512)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
  const optional=v=>v==null||text(v,2048);
  const pid=v=>Number.isInteger(v)&&v>0&&v<=4294967295;
  function validate(v){
    if(!plain(v)||v.protocol_version!=='hatchery-system/1'||typeof v.available!=='boolean')return null;
    if(v.info!==null&&(!plain(v.info)||!text(v.info.name,128)||!(v.info.serial===null||text(v.info.serial))||!Number.isSafeInteger(v.info.uptime_seconds)||v.info.uptime_seconds<0||(v.info.simulated!==undefined&&typeof v.info.simulated!=='boolean')))return null;
    if(v.available!==(v.info!==null))return null;
    if(v.services!==null&&(!Array.isArray(v.services)||v.services.length>9||new Set(v.services.map(s=>s?.unit)).size!==v.services.length||v.services.some(s=>!plain(s)||!units.slice(0,9).some(u=>s.unit===u+'.service')||!states.includes(s.state)||(s.identity!=null&&(!plain(s.identity)||s.identity.service+'.service'!==s.unit||!text(s.identity.version,80)||!pid(s.identity.pid)||!['revision','built_at','exe'].every(k=>optional(s.identity[k])))))))return null;
    return JSON.parse(JSON.stringify(v));
  }
  let data=null,timer=null,poll=null,write=null,epoch=0,revision=0,receipt=null,error='';
  const listeners=new Set();
  const available=()=>root.HATCHERY_BACKEND?.apiBase==='/api/v1/maintenance'&&root.HATCHERY_BACKEND?.readOnly===true;
  const snapshot=()=>({data:data?JSON.parse(JSON.stringify(data)):null,fresh:!!data?.available&&receipt!==null&&root.performance.now()-receipt<9000,available:available(),pending:!!write,error});
  const emit=()=>listeners.forEach(fn=>fn(snapshot()));
  async function request(path,{signal,body}={}){
    if(!available())throw Error('当前未连接设备');
    const reply=await root.fetch(endpoint+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal,
      ...(body?{headers:{'Content-Type':'application/json','X-Hatchery-Command':'1'},body:JSON.stringify(body)}:{})});
    if(!reply.ok)throw Error(reply.status===401?'会话已失效，请刷新网页':reply.status===404?'当前后端尚不支持此功能':'配置服务未完成请求，请刷新确认');
    const raw=await reply.text();if(raw.length>65536)throw Error('设备回复超过限制');
    return JSON.parse(raw);
  }
  async function refresh(){
    if(!available()||poll||write)return;
    const ticket=epoch,version=revision,controller=new root.AbortController();poll=controller;
    const timeout=root.setTimeout(()=>controller.abort(),6500);
    try{const next=validate(await request('',{signal:controller.signal}));if(!next)throw Error('设备配置协议校验失败');
      if(ticket!==epoch||version!==revision)return;data=next;receipt=root.performance.now();error=next.available?'':'配置服务未连接';
    }catch(failure){if(ticket===epoch&&version===revision){receipt=null;error=failure.name==='AbortError'?'配置服务请求超时':failure.message;}}
    finally{root.clearTimeout(timeout);if(poll===controller)poll=null;if(ticket===epoch)emit();}
  }
  async function rename(name){
    if(write||!snapshot().fresh||!text(name,24)||!name.trim())throw Error('设备名称暂不可保存');
    const ticket=epoch,controller=new root.AbortController();write=controller;revision++;poll?.abort();poll=null;emit();
    const timeout=root.setTimeout(()=>controller.abort(),5000);
    try{const result=await request('/name',{signal:controller.signal,body:{name:name.trim()}});
      if(ticket!==epoch)throw Error('页面已离开，请重新查看设备名称');
      if(!plain(result)||!text(result.name,128)||!result.name)throw Error('设备名称回复无效，请刷新确认');
      return result;
    }catch(failure){throw Error(failure.name==='AbortError'?'保存结果未确认，请刷新查看设备名称':failure.message);}
    finally{root.clearTimeout(timeout);if(write===controller){write=null;emit();if(ticket===epoch)refresh();}}
  }
  async function logs(unit,signal){
    if(!units.includes(unit))throw Error('不支持此服务');
    const ticket=epoch,result=await request('/logs/'+unit,{signal});
    if(ticket!==epoch)throw Error('设备会话已离开');
    if(!plain(result)||result.unit!==unit+'.service'||!Array.isArray(result.lines)||result.lines.length>100||!result.lines.every(s=>typeof s==='string'&&s.length<=8192)||typeof result.truncated!=='boolean')throw Error('日志回复无效');
    return result;
  }
  function start(){if(timer!==null)return;refresh();if(available())timer=root.setInterval(()=>{emit();refresh();},4000);}
  function stop(){epoch++;revision++;poll?.abort();write?.abort();poll=write=null;root.clearInterval(timer);timer=null;data=null;receipt=null;error='';}
  function subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);}
  return Object.freeze({units,validate,snapshot,subscribe,start,stop,refresh,rename,logs});
});
