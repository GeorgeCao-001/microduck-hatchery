'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('../prototype/device-system.js');
const fixture=()=>({protocol_version:'hatchery-system/1',available:true,info:{name:'Ducky',serial:'board-a',uptime_seconds:40},services:[{unit:'mediad.service',state:'active',identity:{service:'mediad',version:'0.17.6',pid:45,revision:'abc',exe:'/home/duck/mediad'}}]});
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function environment(){
  let now=0,next=0;const requests=[],intervals=new Map();
  const ctx={module:{exports:{}},performance:{now:()=>now},AbortController,setTimeout,clearTimeout,setInterval:fn=>{intervals.set(++next,fn);return next;},clearInterval:id=>intervals.delete(id),fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))};
  vm.runInNewContext(fs.readFileSync(require.resolve('../prototype/device-system.js'),'utf8'),ctx);
  const answer=(index,body,ok=true,status=200)=>requests[index].resolve({ok,status,text:async()=>JSON.stringify(body)});
  return {api:ctx.module.exports,ctx,requests,intervals,answer,time:n=>{now=n;},connect:async()=>{ctx.HATCHERY_BACKEND={apiBase:'/api/v1/maintenance',readOnly:true};ctx.module.exports.start();answer(requests.length-1,fixture());await turn();}};
}
test('official identity and service build metadata stay bounded and separate from host metrics',()=>{
  const data=fixture(),copy=api.validate(data);assert.ok(copy);copy.info.name='changed';assert.equal(data.info.name,'Ducky');
  for(const edit of [v=>v.available=false,v=>v.info.name='x\n',v=>v.info.uptime_seconds=-1,v=>v.info.simulated='yes',v=>v.services[0].unit='sshd.service',v=>v.services[0].identity.service='robotd',v=>v.services[0].identity.pid=0,v=>v.services.push(v.services[0])]){const bad=fixture();edit(bad);assert.equal(api.validate(bad),null);}
  assert.ok(api.validate({protocol_version:'hatchery-system/1',available:false,info:null,services:null}));
});
test('static pages issue no requests and connected console shares one read poll',async()=>{
  const e=environment();e.api.start();assert.equal(e.requests.length,0);
  await e.connect();e.api.start();assert.equal(e.requests.length,1);assert.equal(e.intervals.size,1);
  assert.equal(e.requests[0].options.method,'GET');assert.equal(e.requests[0].options.credentials,'same-origin');assert.equal(e.api.snapshot().fresh,true);
  e.time(9000);assert.equal(e.api.snapshot().fresh,false);e.api.stop();
});
test('late polling replies cannot restore an abandoned device session',async()=>{
  const e=environment();e.ctx.HATCHERY_BACKEND={apiBase:'/api/v1/maintenance',readOnly:true};e.api.start();
  e.api.stop();assert.equal(e.requests[0].options.signal.aborted,true);e.answer(0,fixture());await turn();assert.equal(e.api.snapshot().data,null);assert.equal(e.intervals.size,0);
});
test('missing configd removes live identity without inventing a running build',async()=>{
  const e=environment();await e.connect();const pending=e.api.refresh();e.answer(1,{protocol_version:'hatchery-system/1',available:false,info:null,services:null});await pending;
  assert.equal(e.api.snapshot().fresh,false);assert.equal(e.api.snapshot().data.info,null);e.api.stop();
});
test('renaming uses one explicit POST and trusts the name returned by configd',async()=>{
  const e=environment();await e.connect();const saved=e.api.rename('  My Duck  ');
  const request=e.requests[1];assert.equal(request.url,'/api/v1/maintenance/system/name');assert.equal(request.options.method,'POST');assert.equal(request.options.headers['X-Hatchery-Command'],'1');assert.deepEqual(JSON.parse(request.options.body),{name:'My Duck'});
  await assert.rejects(e.api.rename('Another Duck'));e.answer(1,{name:'My Duck'});assert.equal((await saved).name,'My Duck');
  assert.equal(e.requests.length,3);assert.equal(e.requests[2].options.method,'GET');e.answer(2,fixture());await turn();e.api.stop();
});
test('failed name saves are not retried or replaced by a local success',async()=>{
  const e=environment();await e.connect();await assert.rejects(e.api.rename('bad\nname'));
  const saved=e.api.rename('Ducky');e.answer(1,{},false,503);await assert.rejects(saved);
  assert.equal(e.requests.filter(r=>r.options.method==='POST').length,1);e.answer(2,fixture());await turn();assert.equal(e.api.snapshot().data.info.name,'Ducky');e.api.stop();
});
test('journal calls use the fixed unit set and reject oversized or mismatched replies',async()=>{
  const e=environment();await e.connect();await assert.rejects(e.api.logs('../sshd'));
  const first=e.api.logs('mediad');e.answer(1,{unit:'mediad.service',lines:['<script>literal text</script>'],truncated:false});assert.equal((await first).lines.length,1);
  const second=e.api.logs('mediad');e.answer(2,{unit:'robotd.service',lines:[],truncated:false});await assert.rejects(second);
  const third=e.api.logs('mediad');e.answer(3,{unit:'mediad.service',lines:Array(101).fill('x'),truncated:false});await assert.rejects(third);e.api.stop();
});
