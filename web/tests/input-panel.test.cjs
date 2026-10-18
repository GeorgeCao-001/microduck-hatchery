'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),api=require('../prototype/input-panel.js');
const input=()=>({protocol_version:'hatchery-input/1',source:'padd',session_id:'pad-1',connected:true,fresh:true,device:{name:'Pad',bus:5,axes:[{code:0,name:'ABS_X',min:-32768,max:32767,value:16}],buttons:[{code:304,name:'BTN_SOUTH',pressed:true}]},frame:null});
test('raw pad metadata preserves kernel ranges and key states without invented mapping',()=>{const raw=input(),r=api.validate(raw);assert.ok(r);assert.equal(r.device.axes[0].min,-32768);r.device.buttons[0].pressed=false;assert.equal(raw.device.buttons[0].pressed,true);});
test('invalid source, ranges, button types and freshness are rejected',()=>{for(const edit of [v=>v.source='browser',v=>v.connected=false,v=>v.device.axes[0].max=-32768,v=>v.device.buttons[0].pressed=1,v=>v.device.axes[0].value=Infinity]){const v=input();edit(v);assert.equal(api.validate(v),null);}});
