'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(onTelemetry){
  const sockets=[],peers=[],states=[],listeners=new Map(),sent=[],timers=new Map();let next=0;
  class Socket{constructor(url){this.url=url;this.readyState=1;sockets.push(this);}send(v){sent.push(JSON.parse(v));}close(){this.closed=true;}message(v){this.onmessage?.({data:JSON.stringify(v)});}}
  class Peer{constructor(){peers.push(this);this.candidates=[];}async setRemoteDescription(v){this.remoteDescription=v;}async addIceCandidate(v){this.candidates.push(v);}async createAnswer(){return {type:'answer',sdp:'answer-sdp'};}async setLocalDescription(v){this.localDescription=v;}close(){this.closed=true;}}
  const video={style:{},srcObject:null,videoWidth:0,readyState:0,pause(){},play:async()=>{},addEventListener(k,v){listeners.set(k,v);},removeEventListener(k){listeners.delete(k);}};
  const context={URL,WebSocket:Socket,RTCPeerConnection:Peer,MediaStream:class{constructor(tracks){this.tracks=tracks;}getTracks(){return this.tracks;}},setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}};
  context.window=context;vm.runInNewContext(fs.readFileSync(require.resolve('../prototype/camera-stream.js'),'utf8'),context);
  return {api:context.CameraStream,video,sockets,peers,states,listeners,sent,timers,stream:context.CameraStream.create({video,onState:s=>states.push(s),onTelemetry})};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('signalling uses the media host and rejects credentials and non-HTTP addresses',()=>{
  const {api}=fixture();assert.equal(api.signalling('http://127.0.0.1:8080/frame?x=1'), 'ws://127.0.0.1:8443/');assert.equal(api.signalling('https://duck.local/',9000),'wss://duck.local:9000/');
  for(const address of ['file:///tmp','http://user:secret@host/','bad'])assert.equal(api.signalling(address),null);
});
test('official offer/answer and ICE ordering produce video without sending robot RPCs',async()=>{
  const f=fixture();f.stream.start('http://192.168.8.2:8080');const ws=f.sockets[0];
  ws.message({type:'welcome'});await settle();assert.equal(f.sent[0].type,'list');
  ws.message({type:'list',producers:[{id:'camera'}]});await settle();assert.equal(f.sent[1].peerId,'camera');
  ws.message({type:'sessionStarted',sessionId:'session1'});await settle();const pc=f.peers[0];
  ws.message({type:'peer',sessionId:'other',ice:{candidate:'ignored',sdpMLineIndex:0}});
  ws.message({type:'peer',sessionId:'session1',ice:{candidate:'first',sdpMLineIndex:0}});await settle();assert.equal(pc.candidates.length,0);
  ws.message({type:'peer',sessionId:'session1',sdp:{type:'offer',sdp:'offer-sdp'}});await settle();assert.equal(pc.candidates[0].candidate,'first');assert.equal(f.sent.at(-1).sdp.type,'answer');
  let stopped=false;pc.ontrack({track:{kind:'video',stop(){stopped=true;}},streams:[]});f.video.videoWidth=1280;f.video.readyState=2;f.listeners.get('playing')();assert.equal(f.stream.snapshot().phase,'live');
  assert.ok(f.sent.every(v=>!v.method));f.stream.destroy();assert.ok(pc.closed);assert.ok(ws.closed);assert.ok(stopped);assert.equal(f.video.srcObject,null);assert.equal(f.timers.size,0);
});
test('missing producers and negotiation timeout stop cleanly without retrying',async()=>{
  const f=fixture();f.stream.start('http://duck/');f.sockets[0].message({type:'list',producers:[]});await settle();assert.equal(f.stream.snapshot().phase,'error');assert.equal(f.sockets.length,1);assert.equal(f.timers.size,0);
  f.stream.start('http://duck/');[...f.timers.values()][0]();assert.equal(f.stream.snapshot().active,false);assert.equal(f.sockets.length,2);
});

test('ToF uses one official read subscription and ignores data from an ended peer',async()=>{
  const events=[],calls=[],f=fixture(event=>events.push(event));
  f.stream.start('http://duck/');f.sockets[0].message({type:'sessionStarted',sessionId:'session1'});await settle();
  const channel={readyState:'open',send:raw=>calls.push(JSON.parse(raw))};
  f.peers[0].ondatachannel({channel});channel.onopen();
  assert.equal(calls.length,1);assert.equal(calls[0].method,'tof.stream');
  channel.onmessage({data:JSON.stringify({jsonrpc:'2.0',id:'hatchery.tof',result:{accepted:true}})});
  assert.equal(events.at(-1).kind,'status');
  const frame={seq:1,at_us:100,rows:1,cols:1,distance_mm:[123],status:[5]};
  channel.onmessage({data:JSON.stringify({jsonrpc:'2.0',method:'tof.frame',params:frame})});
  assert.equal(events.at(-1).frame.seq,1);
  channel.onmessage({data:JSON.stringify({jsonrpc:'2.0',method:'media.detections',params:{width:720,height:1280,took_ms:12,boxes:[]}})});
  assert.equal(events.at(-1).kind,'detections');
  f.stream.stop();const count=events.length;
  channel.onmessage({data:JSON.stringify({jsonrpc:'2.0',method:'tof.frame',params:frame})});channel.onopen();
  assert.equal(events.length,count);assert.equal(calls.length,1);
});

test('a camera-only consumer does not subscribe to ToF',async()=>{
  const calls=[],f=fixture();f.stream.start('http://duck/');
  f.sockets[0].message({type:'sessionStarted',sessionId:'session1'});await settle();
  const channel={readyState:'open',send:raw=>calls.push(raw)};f.peers[0].ondatachannel({channel});channel.onopen();
  assert.equal(calls.length,0);f.stream.stop();
});

test('ToF decoding follows official ST validity and rejects malformed measurements',()=>{
  const data=require('../prototype/sensor-data.js');
  const frame={seq:1,at_us:100,rows:2,cols:3,distance_mm:[100,200,-1,0,400,500],status:[5,9,5,9,255,4]};
  const decoded=data.decodeTof(frame);
  assert.deepEqual(decoded.zones.map(z=>z.kind),['valid','valid','invalid','invalid','no-return','invalid']);
  assert.equal(data.tofSummary(decoded).nearest,100);assert.equal(data.tofSummary(decoded).valid,2);
  assert.equal(decoded.zones[4].distanceMm,null);assert.equal(decoded.source,'tofd');
  for(const change of [f=>f.rows=9,f=>f.distance_mm.pop(),f=>f.status[0]=256,f=>f.distance_mm[0]=40000,f=>f.seq=-1,f=>f.at_us=NaN]){
    const bad=structuredClone(frame);change(bad);assert.equal(data.decodeTof(bad),null);
  }
});

test('detector metadata preserves quantized raw scores and bounds the overlay',()=>{
  const data=require('../prototype/sensor-data.js');
  const frame={width:720,height:1280,took_ms:12.5,boxes:[{x0:10,y0:20,x1:110,y1:220,score:1.38}]};
  const decoded=data.decodeDetections(frame);
  assert.equal(decoded.boxes[0].score,1.38);assert.equal(decoded.tookMs,12.5);
  decoded.boxes[0].x0=99;assert.equal(frame.boxes[0].x0,10);
  for(const edit of [f=>f.width=0,f=>f.boxes[0].x0=-1,f=>f.boxes[0].x1=721,f=>f.boxes[0].y1=Infinity,f=>f.boxes[0].score=NaN,f=>f.took_ms=-1]){
    const bad=structuredClone(frame);edit(bad);assert.equal(data.decodeDetections(bad),null);
  }
});
