'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
  const sockets=[],peers=[],states=[],listeners=new Map(),sent=[],timers=new Map();let next=0;
  class Socket{constructor(url){this.url=url;this.readyState=1;sockets.push(this);}send(v){sent.push(JSON.parse(v));}close(){this.closed=true;}message(v){this.onmessage?.({data:JSON.stringify(v)});}}
  class Peer{constructor(){peers.push(this);this.candidates=[];}async setRemoteDescription(v){this.remoteDescription=v;}async addIceCandidate(v){this.candidates.push(v);}async createAnswer(){return {type:'answer',sdp:'answer-sdp'};}async setLocalDescription(v){this.localDescription=v;}close(){this.closed=true;}}
  const video={style:{},srcObject:null,videoWidth:0,readyState:0,pause(){},play:async()=>{},addEventListener(k,v){listeners.set(k,v);},removeEventListener(k){listeners.delete(k);}};
  const context={URL,WebSocket:Socket,RTCPeerConnection:Peer,MediaStream:class{constructor(tracks){this.tracks=tracks;}getTracks(){return this.tracks;}},setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}};
  context.window=context;vm.runInNewContext(fs.readFileSync(require.resolve('../prototype/camera-stream.js'),'utf8'),context);
  return {api:context.CameraStream,video,sockets,peers,states,listeners,sent,timers,stream:context.CameraStream.create({video,onState:s=>states.push(s)})};
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
