/* Read-only semantic adapter. Backend radians never enter the UI sample tick store. */
(function(root,factory){const api=factory(root,typeof module==='object'&&module.exports?require('./joint-drafts.js'):root.JointDrafts);if(typeof module==='object'&&module.exports)module.exports=api;else root.RuntimeFeedback=api;})(typeof window!=='undefined'?window:globalThis,function(root,model){
  'use strict';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  function decode(snapshot){
    const d=snapshot?.data,s=d?.state,names=d?.joint_names;
    if(!snapshot?.fresh||d?.source!=='robotd'||d.joint_unit!=='rad'||!Array.isArray(names)||names.length!==15||new Set(names).size!==15||!model.metadata.every(j=>names.includes(j.raw))||!s||!finite(s.t))return null;
    const vector=key=>Array.isArray(s[key])&&s[key].length===15&&s[key].every(finite)?s[key]:null;
    const actual=vector('joints'),goal=vector('targets'),velocity=vector('velocities'),current=vector('currents_ma');
    return {session:d.session_id,t:s.t,stamp:d.device_mono_ns||String(s.t),joints:model.metadata.map(j=>{const i=names.indexOf(j.raw);return {id:j.id,raw:j.raw,name:j.name,t:s.t,actual:actual?.[i]??null,goal:goal?.[i]??null,velocity:velocity?.[i]??null,current:current?.[i]??null,load:null,volt:null,temp:null};})};
  }
  function create(){
    let frames=[],latest=null,session=null,stamp=null,epoch=0,unsubscribe=null;const listeners=new Set();
    const snapshot=()=>({frames:frames.map(f=>({...f})),latest:latest?JSON.parse(JSON.stringify(latest)):null,session,epoch,fresh:latest!==null});
    const emit=()=>listeners.forEach(f=>f(snapshot()));
    function receive(s){const next=decode(s),incoming=s?.data?.session_id??null;
      if(incoming!==session){frames=[];stamp=null;session=incoming;epoch++;}
      if(!next){if(latest){frames=[];stamp=null;epoch++;}latest=null;emit();return;}
      if(latest&&next.t<latest.t){frames=[];stamp=null;epoch++;}
      latest=next;if(next.stamp!==stamp){frames.push(...next.joints);stamp=next.stamp;frames=frames.filter(f=>f.t>=next.t-60).slice(-4800);}emit();
    }
    function start(){if(!unsubscribe&&root.RobotSession){unsubscribe=root.RobotSession.subscribe(receive);root.RobotSession.start();}}
    function stop(){unsubscribe?.();unsubscribe=null;frames=[];latest=null;stamp=null;session=null;epoch++;emit();}
    return {receive,start,stop,snapshot,subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);},history:{frames:()=>frames.map(f=>({...f})),latestTime:()=>latest?.t??0}};
  }
  const shared=create();return Object.freeze({decode,create,...shared});
});
