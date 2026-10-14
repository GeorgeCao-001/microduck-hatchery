const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const session = require('../prototype/device-session.js');

function hostStatus() {
  return {
    protocol_version:'hatchery-device/1', source:'host-system', generated_unix_ms:1234,
    identity:{id:'host-a',id_source:'configured',name:'Radxa',hostname:'duck',model:'Radxa Zero 3W',os:'Debian',kernel:'6.1',architecture:'aarch64'},
    system:{cpu_percent:null,load_one:0.1,memory_total_bytes:2048,memory_available_bytes:1024,uptime_seconds:60,hottest_zone_celsius:42},
    interfaces:[{name:'usb0',kind:'usb-network',state:'up',carrier:true,addresses:['192.168.8.2/24']}], bluetooth:[],
    service:{name:'robotd-maintenance',version:'0.15.1',servo_source:'fixture',servo_connection:'fixture',servo_fake:true,serial_port:null,baud:null,control_enabled:false,bus_owner:'robotd'}
  };
}

test('real host metadata stays independent of fake servos and missing measurements', () => {
  const input=hostStatus(), output=session.validate(input);
  assert.equal(output.source,'host-system'); assert.equal(output.service.servo_fake,true);
  assert.equal(output.system.cpu_percent,null);
  output.identity.name='changed';assert.equal(input.identity.name,'Radxa');
  for(const edit of [v=>v.source='fixture',v=>v.system.cpu_percent=101,v=>v.system.memory_available_bytes=3000,
    v=>v.service.servo_fake=false,v=>v.service.control_enabled=true,v=>v.interfaces[0].addresses=['x'.repeat(513)],
    v=>v.system.uptime_seconds=NaN,v=>v.generated_unix_ms=-1]) {
    const bad=hostStatus();edit(bad);assert.equal(session.validate(bad),null);
  }
});

test('one current endpoint uses GET only; static pages, stale data and late replies stay explicit', async () => {
  let now=0, requests=[], intervals=new Map(), next=0;
  const context={module:{exports:{}},performance:{now:()=>now},AbortController,
    setTimeout,clearTimeout,setInterval:fn=>{intervals.set(++next,fn);return next;},clearInterval:id=>intervals.delete(id),
    fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))};
  vm.runInNewContext(fs.readFileSync(require.resolve('../prototype/device-session.js'),'utf8'),context);
  const api=context.module.exports;
  api.start(); assert.equal(requests.length,0); assert.equal(api.snapshot().status,'static');
  context.HATCHERY_BACKEND={readOnly:true,apiBase:'/api/v1/maintenance'};
  api.start(); api.start(); assert.equal(requests.length,1);assert.equal(intervals.size,1);
  assert.equal(requests[0].url,'/api/v1/maintenance/device');assert.equal(requests[0].options.method,'GET');
  assert.equal(requests[0].options.credentials,'same-origin');
  requests[0].resolve({ok:true,text:async()=>JSON.stringify(hostStatus())});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(api.snapshot().fresh,true);
  now=6001;assert.equal(api.snapshot().fresh,false);assert.equal(api.snapshot().status,'stale');
  const pending=api.refresh();api.stop();assert.equal(requests[1].options.signal.aborted,true);
  requests[1].resolve({ok:true,text:async()=>JSON.stringify(hostStatus())});await pending;
  assert.equal(api.snapshot().data,null);assert.equal(intervals.size,0);
});
