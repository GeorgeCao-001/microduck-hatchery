const test = require('node:test');
const assert = require('node:assert/strict');
const backend = require('../prototype/servo-backend.js');
const joints = require('../prototype/joint-drafts.js');

function fixture() {
  return {
    protocol_version:'hatchery-maintenance/1',session_id:'test-session',source:'fixture',connection:'fixture',fake:true,simulated:false,
    hardware_confirmed:false,read_only:true,control_enabled:false,register_profile_confirmed:false,calibration_version:null,
    generated_unix_ms:1000,collected_monotonic_ms:100,max_age_ms:1500,
    joints:joints.metadata.map(j => ({id:j.id,runtime_index:j.runtimeIndex,policy_index:j.policyIndex,status:'fixture',received_unix_ms:1000,received_monotonic_ms:100,
      raw_bytes:Array(15).fill(0),decoded_reference:{position_raw:2048,goal_raw:2048,speed_raw:0,load_raw:0,current_raw:0,voltage_raw:78,temperature_raw:32,state_raw:0,moving_raw:0}}))
  };
}

test('maintenance snapshots keep 15 mappings, raw values and source without altering target drafts', () => {
  const store=joints.createStore(), before=store.snapshot(), input=fixture();
  const result=backend.validate(input);
  assert.equal(result.joints.length,15);
  assert.equal(result.joints[14].id,34);
  assert.equal(result.joints[14].policy_index,null);
  result.joints[0].raw_bytes[0]=123;
  assert.equal(input.joints[0].raw_bytes[0],0);
  assert.deepEqual(store.snapshot(),before);
  assert.match(backend.render(),/Radxa Zero 3W/);
  assert.match(backend.render(),/当前为静态预览/);
});

test('invalid sources, control claims, identity mappings and raw frames fail before display', () => {
  const edits=[v=>v.fake=false,v=>v.connection='open',v=>v.control_enabled=true,v=>v.hardware_confirmed=true,v=>v.register_profile_confirmed=true,
    v=>v.joints.pop(),v=>v.joints[0].id=34,v=>v.joints[14].policy_index=14,v=>v.joints[0].raw_bytes[0]=256,
    v=>v.joints[0].decoded_reference.current_raw=NaN,v=>v.joints[0].received_monotonic_ms=101,
    v=>v.joints[0].received_unix_ms=null,v=>v.max_age_ms=0];
  for(const edit of edits) {const value=fixture();edit(value);assert.equal(backend.validate(value),null);}
  const missing=fixture();missing.joints[0].status='missing';assert.equal(backend.validate(missing),null);
});

test('ID 1 stays unassigned and cannot impersonate a physical joint or calibrated reading', () => {
  const input=fixture();
  input.source='hardware';input.connection='open';input.fake=false;
  input.joints=input.joints.map(row=>({...row,status:'missing',received_unix_ms:null,received_monotonic_ms:null,raw_bytes:null,decoded_reference:null}));
  input.unassigned_devices=[{id:1,status:'response',received_unix_ms:1000,received_monotonic_ms:100,raw_bytes:[],decoded_reference:null,device_error:0}];
  const store=joints.createStore(), before=store.snapshot(), result=backend.validate(input);
  assert.equal(result.unassigned_devices[0].id,1);
  assert.equal(result.joints.length,15);
  assert.equal(result.joints[14].id,34);
  assert.deepEqual(store.snapshot(),before);
  for(const edit of [v=>v.unassigned_devices[0].id=20,v=>v.unassigned_devices[0].id=254,
    v=>v.unassigned_devices[0].runtime_index=0,v=>v.unassigned_devices[0].policy_index=null,
    v=>v.unassigned_devices.push({...v.unassigned_devices[0]}),v=>v.unassigned_devices[0].decoded_reference=fixture().joints[0].decoded_reference]) {
    const value=structuredClone(input);edit(value);assert.equal(backend.validate(value),null);
  }
});

test('leaving maintenance aborts pending reads and cannot mount late state or own acquisition', async () => {
  const old={config:globalThis.HATCHERY_BACKEND,fetch:globalThis.fetch};
  const requests=[];
  globalThis.HATCHERY_BACKEND={readOnly:true,apiBase:'/api/v1/maintenance'};
  globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
  const listeners=new Map(), message={textContent:''}, state={innerHTML:''};
  const container={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:(key,fn)=>{if(listeners.get(key)===fn)listeners.delete(key);},querySelector:selector=>selector==='[data-backend-message]'?message:state};
  try {
    backend.mount({container});
    assert.equal(requests.length,2);
    assert.ok(requests.every(r=>r.options.method==='GET'&&r.options.credentials==='same-origin'));
    backend.unmount();
    assert.ok(requests.every(r=>r.options.signal.aborted));
    requests[0].resolve({ok:true,text:async()=>JSON.stringify(fixture())});
    requests[1].resolve({ok:true,text:async()=>JSON.stringify({ports:[]})});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(state.innerHTML,'');
    assert.deepEqual(backend.snapshot(),{mounted:false,state:null});
    assert.equal(listeners.size,0);
  } finally {
    backend.unmount();globalThis.fetch=old.fetch;
    if(old.config===undefined)delete globalThis.HATCHERY_BACKEND;else globalThis.HATCHERY_BACKEND=old.config;
  }
});
