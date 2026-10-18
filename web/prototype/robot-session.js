/* Official robotd read-only subscription, cached once by the existing gateway. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RobotSession=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const plain=v=>v&&typeof v==='object'&&!Array.isArray(v),finite=n=>typeof n==='number'&&Number.isFinite(n);
  const text=v=>typeof v==='string'&&v.length<=512,optional=v=>v==null||text(v);
  const vector=v=>Array.isArray(v)&&v.length<=32&&v.every(finite);
  function validate(v){
    if(!plain(v)||v.protocol_version!=='hatchery-runtime/1'||v.source!=='robotd'||v.capture_mode!=='unreported'||!text(v.session_id)||!v.session_id||!['connected','fresh','health_fresh'].every(k=>typeof v[k]==='boolean')||!text(v.error))return null;
    if(v.device_mono_ns!=null&&!(typeof v.device_mono_ns==='string'&&/^\d{1,20}$/.test(v.device_mono_ns)))return null;
    if(v.hello!==null&&(!plain(v.hello)||!Number.isInteger(v.hello.api_version)||v.hello.api_version<37||v.hello.api_version>44||!optional(v.hello.daemon_version)||!optional(v.hello.revision)))return null;
    if(v.connected!==(v.hello!==null))return null;
    const h=v.health;
    if(h!==null&&(!plain(h)||typeof h.healthy!=='boolean'||(h.degraded!==undefined&&typeof h.degraded!=='boolean')||!optional(h.reason)))return null;
    if(h?.control_loop&&(!plain(h.control_loop)||!finite(h.control_loop.target_hz)||(h.control_loop.achieved_hz!=null&&!finite(h.control_loop.achieved_hz))||!['ticks','missed','last_tick_age_ms'].every(k=>Number.isSafeInteger(h.control_loop[k])&&h.control_loop[k]>=0)))return null;
    if(h?.battery&&(!finite(h.battery.volts)||h.battery.volts<0))return null;
    if(h?.imu&&(!plain(h.imu)||typeof h.imu.ready!=='boolean'))return null;
    const s=v.state;
    if(s!==null&&(!plain(s)||!finite(s.t)||s.t<0||!text(s.policy)||!plain(s.loop)||!finite(s.loop.hz)||s.loop.hz<0||!Number.isSafeInteger(s.loop.missed)||s.loop.missed<0||!plain(s.safety)||!['fallen','limp'].every(k=>typeof s.safety[k]==='boolean')||!['joints','targets'].every(k=>vector(s[k]))))return null;
    if(v.fresh&&(!v.connected||s===null||!finite(v.frame_age_ms)||v.frame_age_ms<0||v.frame_age_ms>=1500))return null;
    if(v.health_fresh&&(!v.connected||h===null))return null;
    const sub=v.subscription;
    if(sub!==null&&(!plain(sub)||sub.accepted!==true||!['walk','stand','unavailable'].every(k=>optional(sub[k]))))return null;
    return JSON.parse(JSON.stringify(v));
  }
  let data=null,received=null,timer=null,controller=null,epoch=0,error='';const listeners=new Set();
  const available=()=>root.HATCHERY_BACKEND?.apiBase==='/api/v1/maintenance'&&root.HATCHERY_BACKEND?.readOnly===true;
  function snapshot(){const age=received===null?Infinity:root.performance.now()-received;return {data:data?JSON.parse(JSON.stringify(data)):null,available:available(),fresh:!!data?.fresh&&age<2000,healthFresh:!!data?.health_fresh&&age<3000,error,receivedMono:received};}
  const emit=()=>listeners.forEach(fn=>fn(snapshot()));
  async function refresh(){
    if(!available()||controller)return;
    const ticket=epoch,request=new root.AbortController();controller=request;const timeout=root.setTimeout(()=>request.abort(),2500);
    try{const reply=await root.fetch('/api/v1/maintenance/runtime',{method:'GET',credentials:'same-origin',cache:'no-store',signal:request.signal});if(!reply.ok)throw Error(reply.status===404?'当前网关尚未提供正式状态接口':'正式状态接口不可用');
      const raw=await reply.text();if(raw.length>131072)throw Error('正式状态超过限制');const next=validate(JSON.parse(raw));if(!next)throw Error('正式状态协议校验失败');
      if(ticket!==epoch)return;data=next;received=root.performance.now();error='';
    }catch(failure){if(ticket===epoch){received=null;error=failure.name==='AbortError'?'正式状态请求超时':failure.message;}}
    finally{root.clearTimeout(timeout);if(controller===request)controller=null;if(ticket===epoch)emit();}
  }
  function start(){if(timer!==null)return;if(!available()){emit();return;}refresh();timer=root.setInterval(()=>{emit();refresh();},500);}
  function stop(){epoch++;controller?.abort();controller=null;root.clearInterval(timer);timer=null;data=null;received=null;error='';}
  function subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);}
  return Object.freeze({validate,start,stop,refresh,subscribe,snapshot});
});
