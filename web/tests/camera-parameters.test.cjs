'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const camera=require('../prototype/camera-parameters.js');
function state(auto=false){
  const p=(key,min,max,value,unit='raw',source='sensor',choices=[])=>({key,min,max,step:1,value,writable:true,unit,source,choices});
  return {protocol_version:'hatchery-camera/1',session_id:'camera-test',source:'hardware',width:1280,height:720,target_fps:30,mode:'UYVY',auto_exposure:auto,controls:[
    p('exposure',4,1762,600,'lines'),p('analogue_gain',256,2816,1024),
    p('brightness',-64,64,0,'raw','isp'),
    p('white_balance_temperature',2000,8000,4000,'K','isp'),
    p('gain',0,2,0,'raw','isp',[[0,'Low'],[2,'High']])
  ]};
}
test('camera capability snapshots validate bounded ranges, choices and physical source',()=>{
  const input=state(),out=camera.validate(input);assert.ok(out);out.controls[0].value=700;assert.equal(input.controls[0].value,600);
  for(const edit of [s=>s.source='browser',s=>s.controls[0].min=9999,s=>s.controls[0].step=0,s=>s.controls[0].value=Infinity,s=>s.controls.push(s.controls[0]),s=>s.controls[0].key='fps',s=>s.target_fps=-1,s=>s.controls[0].choices=[[5,'x'.repeat(101)]]]){
    const bad=state();edit(bad);assert.equal(camera.validate(bad),null);
  }
});
test('only explicit supported parameter changes are writable; capture configuration stays read-only',()=>{
  const input=state();
  assert.deepEqual(camera.change(input,'exposure',700,'id1'),{session_id:'camera-test',request_id:'id1',key:'exposure',value:700});
  assert.equal(camera.change(input,'brightness',-2,'id2').value,-2);
  for(const key of ['target_fps','fps','width','height','mode','device'])assert.equal(camera.change(input,key,30,'bad'),null);
  assert.equal(camera.change(input,'exposure',1,'bad'),null);
  assert.equal(camera.change(input,'exposure',1.5,'bad'),null);
  assert.equal(camera.change(input,'gain',1,'missing-menu'),null);
  input.controls[0].writable=false;assert.equal(camera.change(input,'exposure',700,'locked'),null);
});
test('automatic exposure locks manual shutter and gain; stale and nonhardware sources cannot write',()=>{
  const input=state(true);
  assert.equal(camera.change(input,'exposure',700,'id'),null);
  assert.equal(camera.change(input,'analogue_gain',512,'id'),null);
  assert.equal(camera.change(input,'auto_exposure',0,'id').value,0);
  assert.equal(camera.canEdit(input,'brightness',false),false);
  input.source='test';assert.equal(camera.change(input,'brightness',1,'id'),null);assert.equal(camera.change(input,'auto_exposure',1,'id'),null);
  input.source='hardware';input.auto_exposure=null;assert.equal(camera.change(input,'auto_exposure',1,'id'),null);
});
test('basic camera controls remain compact and advanced parameters start folded',()=>{
  const html=camera.render();
  for(const key of ['exposure','analogue_gain','brightness'])assert.match(html,new RegExp('data-camera-param-row="'+key+'"'));
  assert.match(html,/<details class="camera-advanced">/);assert.doesNotMatch(html,/<details[^>]*\bopen/);
  assert.doesNotMatch(html,/data-camera-param-(number|range)="(fps|width|height|mode)"/);
});
