'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const panel=require('../prototype/connections-panel.js');
function state(){return {protocol_version:'hatchery-connections/1',session_id:'test',source:'hardware',available:true,wifi:{enabled:true,state:{state:'disconnected',ssid:null}},bluetooth:{available:true,powered:true,devices:[]},networks:[{ssid:'PKU',signal:90,security:'open',saved:false}],operation:null};}
test('connection snapshots reject malformed or unbounded network and Bluetooth data',()=>{
  assert.ok(panel.validate(state()));
  for(const edit of [v=>v.source='guessed',v=>v.networks[0].signal=101,v=>v.networks[0].security='unknown',v=>v.networks=Array(257).fill(v.networks[0]),v=>v.bluetooth.devices=[{mac:'invalid',name:'x',paired:false,connected:false}],v=>v.wifi.enabled='on',v=>v.operation={state:'success',request_id:'a'}]){
    const bad=state();edit(bad);assert.equal(panel.validate(bad),null);
  }
});
test('connection picker keeps addresses out of the list and passwords out of persistent settings',()=>{
  const html=panel.render();assert.match(html,/role="tablist"/);assert.match(html,/type="password"/);assert.match(html,/data-connections-scan disabled/);assert.doesNotMatch(html,/IPv4|复制 SSH|\?{3}/);
});
