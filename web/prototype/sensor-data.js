(function (root,factory) {
  'use strict';
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.SensorData=api;
})(typeof window!=='undefined'?window:globalThis,function () {
  'use strict';
  const finite=value=>typeof value==='number' && Number.isFinite(value);
  const round=(value,digits=3)=>Number(value.toFixed(digits));
  // UI fixtures only. No sensor decoding, hardware defaults or device commands.
  function sample(t) {
    const roll=3*Math.sin(t*.32),pitch=2.4*Math.cos(t*.27),yaw=9*Math.sin(t*.09);
    const [r,p,y]=[roll,pitch,yaw].map(v=>v*Math.PI/360);
    const quat=[Math.cos(r)*Math.cos(p)*Math.cos(y)+Math.sin(r)*Math.sin(p)*Math.sin(y),Math.sin(r)*Math.cos(p)*Math.cos(y)-Math.cos(r)*Math.sin(p)*Math.sin(y),Math.cos(r)*Math.sin(p)*Math.cos(y)+Math.sin(r)*Math.cos(p)*Math.sin(y),Math.cos(r)*Math.cos(p)*Math.sin(y)-Math.sin(r)*Math.sin(p)*Math.cos(y)].map(v=>round(v,6));
    const zones=Array.from({length:64},(_,index)=>{
      const row=Math.floor(index/8),col=index%8,kind=[3,19,48].includes(index)?'invalid':[7,56].includes(index)?'no-return':'valid';
      return {kind,statusRaw:kind==='valid'?5:kind==='no-return'?0:255,distanceMm:kind==='valid'?Math.round(420+col*85+row*30+110*Math.sin(t*.2+row*.3+col*.18)):null};
    });
    return {source:'browser-sample',fake:true,hardwareConfirmed:false,t:round(t,2),imu:{roll,pitch,yaw,quat,gyro:[.016*Math.cos(t*.32),-.011*Math.sin(t*.27),.005*Math.cos(t*.09)],gravity:[-.04*Math.cos(t*.27),.05*Math.sin(t*.32),-.998]},tof:{rows:8,cols:8,zones,seq:Math.floor(t*2)}};
  }
  function tofSummary(frame) {
    if (!frame || !Number.isInteger(frame.rows) || !Number.isInteger(frame.cols) || !Array.isArray(frame.zones) || frame.zones.length!==frame.rows*frame.cols) return {nearest:null,center:null,valid:0,total:0};
    const valid=frame.zones.filter(z=>z.kind==='valid' && finite(z.distanceMm) && z.distanceMm>=0);
    const centers=[];
    for (const r of new Set([Math.floor((frame.rows-1)/2),Math.ceil((frame.rows-1)/2)])) for (const c of new Set([Math.floor((frame.cols-1)/2),Math.ceil((frame.cols-1)/2)])) {
      const zone=frame.zones[r*frame.cols+c]; if (zone?.kind==='valid' && finite(zone.distanceMm) && zone.distanceMm>=0) centers.push(zone.distanceMm);
    }
    return {nearest:valid.length?Math.min(...valid.map(z=>z.distanceMm)):null,center:centers.length?Math.round(centers.reduce((a,b)=>a+b,0)/centers.length):null,valid:valid.length,total:frame.zones.length};
  }
  function distance(value,unit) { return finite(value)?unit==='cm'?String(round(value/10,1)):String(Math.round(value)):'—'; }
  return Object.freeze({sample,tofSummary,distance});
});
