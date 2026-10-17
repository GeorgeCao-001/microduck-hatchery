'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const telemetry=require('../prototype/device-telemetry.js');
const charts=require('../prototype/joint-charts.js');
function snapshot(receivedAt=1000, system={}){
  return {available:true,fresh:true,status:'online',receivedAt,data:{identity:{id:'radxa-a',hostname:'duck'},system:{cpu_percent:12,memory_total_bytes:2048,memory_available_bytes:512,uptime_seconds:100,hottest_zone_celsius:45,...system},service:{servo_fake:true,servo_connection:'fixture'},interfaces:[],bluetooth:[]}};
}
test('missing system measurements stay unknown and real zero readings survive',()=>{
  assert.deepEqual(telemetry.metrics(null),{cpu:null,memory:null,temperature:null,used:null,total:null,uptime:null});
  const values=telemetry.metrics(snapshot(1,{cpu_percent:0,hottest_zone_celsius:0,memory_available_bytes:2048}).data);
  assert.equal(values.cpu,0);assert.equal(values.temperature,0);assert.equal(values.memory,0);
  assert.equal(telemetry.metrics(snapshot().data).memory,75);
  for(const system of [{memory_total_bytes:0},{memory_available_bytes:null},{memory_available_bytes:4096}])assert.equal(telemetry.metrics(snapshot(1,system).data).memory,null);
});
test('a reachable host with fixture servos is never presented as whole-robot health',()=>{
  const input=snapshot(), state=telemetry.connection(input);
  assert.equal(state.label,'已连接');assert.match(state.detail,/样例/);assert.doesNotMatch(state.title,/全部.*正常/);
  input.fresh=false;assert.equal(telemetry.connection(input).tone,'warning');assert.match(telemetry.connection(input).detail,/上次读数/);
  input.available=false;assert.equal(telemetry.connection(input).label,'等待连接');
});
test('interface addresses are validated and an address alone does not imply an online link',()=>{
  const data=snapshot().data;
  data.interfaces=[{name:'lo',kind:'loopback',addresses:['127.0.0.1/8'],state:'up',carrier:true},{name:'wlan0',kind:'wifi',addresses:['192.168.8.22/24'],state:'down',carrier:false},{name:'usb0',kind:'usb-network',addresses:['192.168.8.2/24'],state:'unknown',carrier:true}];
  const links=telemetry.links(data);assert.equal(links.length,2);assert.equal(links[0].online,false);assert.equal(links[1].online,true);assert.equal(links[1].address,'192.168.8.2');
  for(const address of ['256.1.2.3','127.0.0.1','169.254.1.2','0.0.0.0','::1','192.168.8.2;poweroff'])assert.equal(telemetry.ipv4(address),null);
});
test('history deduplicates receipt notifications, ignores stale frames and stays bounded',()=>{
  const history=telemetry.createHistory(3), first=snapshot();
  assert.equal(history.accept(first,1),true);assert.equal(history.accept(first,2),false);
  assert.equal(history.accept({...snapshot(1001),fresh:false},2),false);
  for(let i=1;i<=5;i++)history.accept(snapshot(1000+i,{uptime_seconds:100+i}),1+i*2);
  const rows=history.values();assert.equal(rows.length,3);assert.equal(rows[0].receivedAt,1003);
  rows[0].cpu=99;assert.equal(history.values()[0].cpu,12);
});
test('history uses monotonic time across clock corrections and resets on reboot or identity change',()=>{
  const history=telemetry.createHistory();history.accept(snapshot(10000),1);history.accept(snapshot(1000,{uptime_seconds:102}),3);
  assert.equal(history.values().length,2);assert.deepEqual(history.values().map(p=>p.t),[1,3]);
  history.accept(snapshot(2000,{uptime_seconds:1}),5);assert.equal(history.values().length,1);
  const other=snapshot(3000,{uptime_seconds:10});other.data.identity.id='radxa-b';history.accept(other,7);assert.equal(history.values().length,1);
});
test('time windows preserve missing samples and rendering never bridges a disconnect',()=>{
  const points=telemetry.series([{t:1,cpu:10},{t:3,cpu:null},{t:5,cpu:20},{t:15,cpu:30}], 'cpu',15,15);
  assert.deepEqual(points.map(p=>p.value),[10,null,20,30]);
  const path=charts.pathFor(points,x=>x,y=>y,6);
  assert.equal((path.match(/M/g)||[]).length,3);assert.doesNotMatch(path,/L/);
  assert.equal(telemetry.series([{t:1,cpu:10},{t:10,cpu:20}], 'cpu',10,3).length,1);
  const range=telemetry.extent([{value:45},{value:45},{value:null}],'temperature');assert.ok(range[0]<45&&range[1]>45);
});

test('daemon states distinguish failure, restarting, stopped, absent and foreground processes',()=>{
  const row=(state,sub_state=null,process_pid=null)=>({name:'mediad',unit:'mediad.service',state,sub_state,main_pid:null,process_pid});
  assert.equal(telemetry.daemonState(row('active','running')).label,'运行中');
  assert.equal(telemetry.daemonState(row('restarting','auto-restart',123)).label,'重启中');
  assert.equal(telemetry.daemonState(row('restarting','start-pre')).label,'启动中');
  assert.equal(telemetry.daemonState(row('failed',null,123)).tone,'error');
  assert.equal(telemetry.daemonState(row('inactive')).label,'已停止');
  assert.equal(telemetry.daemonState(row('absent')).label,'未安装服务');
  assert.equal(telemetry.daemonState(row('unknown')).label,'未知');
  const foreground=telemetry.daemonState(row('absent',null,123));
  assert.equal(foreground.label,'独立运行');assert.match(foreground.hint,/进程仍在/);
  assert.equal(telemetry.daemonState(row('unknown','stop-sigterm',123)).label,'停止中');
});

test('only observed runtime services count as started and disconnected states become historical',()=>{
  const input=snapshot();
  input.data.services=[
    {name:'robotd-maintenance',state:'unknown',process_pid:1},
    {name:'mediad',state:'active',sub_state:'running',main_pid:2,process_pid:2},
    {name:'configd',state:'inactive',process_pid:null}
  ];
  const rows=telemetry.services(input);
  assert.deepEqual(rows.map(row=>row.name),['robotd','mediad','configd','btd','padd','updaterd']);
  assert.equal(rows[0].label,'未知');assert.equal(rows[0].running,false);
  assert.equal(rows[1].running,true);assert.equal(rows[2].label,'已停止');
  input.fresh=false;
  const stale=telemetry.services(input);
  assert.equal(stale[1].label,'运行中 · 上次');assert.equal(stale[1].tone,'quiet');
  assert.ok(stale.every(row=>!row.running));
  delete input.data.services;
  assert.ok(telemetry.services(input).every(row=>row.label==='未知'));
});
