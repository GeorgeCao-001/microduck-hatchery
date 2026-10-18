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
  // Frame::zone in official tof/src/lib.rs at 5323046: ST status 5/9 and positive mm.
  function decodeTof(frame) {
    if (!frame || !Number.isSafeInteger(frame.seq) || frame.seq<0 || !finite(frame.at_us) || frame.at_us<0 ||
      !Number.isInteger(frame.rows) || frame.rows<1 || frame.rows>8 || !Number.isInteger(frame.cols) || frame.cols<1 || frame.cols>8 ||
      !Array.isArray(frame.distance_mm) || !Array.isArray(frame.status) || frame.distance_mm.length!==frame.rows*frame.cols || frame.status.length!==frame.distance_mm.length ||
      frame.distance_mm.some(n=>!Number.isInteger(n)||n< -32768||n>32767) || frame.status.some(n=>!Number.isInteger(n)||n<0||n>255)) return null;
    return {source:'tofd',rows:frame.rows,cols:frame.cols,seq:frame.seq,atUs:frame.at_us,zones:frame.distance_mm.map((distance,i)=>{
      const statusRaw=frame.status[i],valid=[5,9].includes(statusRaw)&&distance>0;
      return {statusRaw,kind:valid?'valid':statusRaw===255?'no-return':'invalid',distanceMm:valid?distance:null};
    })};
  }
  function decodeDetections(frame) {
    if(!frame || !Number.isInteger(frame.width) || frame.width<1 || frame.width>8192 || !Number.isInteger(frame.height) || frame.height<1 || frame.height>8192 ||
      !finite(frame.took_ms) || frame.took_ms<0 || !Array.isArray(frame.boxes) || frame.boxes.length>128 || frame.boxes.some(b=>!b ||
        !['x0','y0','x1','y1','score'].every(k=>finite(b[k])) || b.score<0 || b.x0<0 || b.y0<0 ||
        b.x1>frame.width || b.y1>frame.height || b.x1<=b.x0 || b.y1<=b.y0)) return null;
    // Official quantized scores can exceed one. Preserve raw values; never invent percentages.
    return {width:frame.width,height:frame.height,tookMs:frame.took_ms,boxes:frame.boxes.map(b=>({...b}))};
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
  return Object.freeze({sample,decodeTof,decodeDetections,tofSummary,distance});
});
