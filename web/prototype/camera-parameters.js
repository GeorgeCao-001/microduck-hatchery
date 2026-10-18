(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CameraParameters=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const names={exposure:'曝光时间',analogue_gain:'模拟增益',brightness:'亮度',gain:'数字增益',digital_gain:'数字增益',contrast:'对比度',saturation:'饱和度',sharpness:'锐度',auto_gamma:'Gamma 模式',gamma:'Gamma 系数',white_balance_automatic:'自动白平衡',auto_white_balance:'自动白平衡',white_balance_temperature:'白平衡色温',red_balance:'红色增益',blue_balance:'蓝色增益',noise_reduction:'降噪强度',temporal_noise_reduction:'时域降噪'};
  const basic=['exposure','analogue_gain','brightness'];
  const advancedKeys=['contrast','saturation','sharpness','auto_gamma','gamma','noise_reduction','temporal_noise_reduction','white_balance_temperature'];
  const scale=p=>p?.unit==='×0.01' ? .01 : p?.unit==='×0.001' ? .001 : 1;
  const displayed=(p,n)=>n===null||n===undefined?'':scale(p)===1?String(n):(n*scale(p)).toFixed(scale(p)===.001?3:2);
  function fromDisplay(p,n){const raw=Number(n)/scale(p);return Number.isFinite(raw)&&Math.abs(raw-Math.round(raw))<1e-6?Math.round(raw):NaN;}
  function advancedControls(data){
    const controls=(data?.controls||[]).filter(p=>!basic.includes(p.key));
    const keys=[...new Set([...controls.map(p=>p.key),...advancedKeys])];
    return keys.map(key=>({key,parameter:controls.find(p=>p.key===key)}));
  }
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let host=null,state=null,timer=null,reader=null,writer=null,epoch=0,sequence=0,connected=false,onState=null;
  const endpoint='/api/v1/maintenance/camera';
  const available=()=>root.HATCHERY_BACKEND?.apiBase==='/api/v1/maintenance';
  const integer=n=>Number.isSafeInteger(n)&&Math.abs(n)<=1e9;
  function validate(value){
    if(!value||value.protocol_version!=='hatchery-camera/1'||!['hardware','test','sim'].includes(value.source)||typeof value.session_id!=='string'||value.session_id.length>128||!value.session_id||!['width','height','target_fps'].every(k=>integer(value[k])&&value[k]>0)||typeof value.mode!=='string'||value.mode.length>80||![true,false,null].includes(value.auto_exposure)||!Array.isArray(value.controls)||value.controls.length>24)return null;
    const seen=new Set();
    for(const p of value.controls){
      if(!p||!Object.hasOwn(names,p.key)||seen.has(p.key)||![p.min,p.max,p.step].every(integer)||p.min>p.max||p.step<1||typeof p.writable!=='boolean'||!['sensor','isp','ae-target'].includes(p.source)||!['unit'].every(k=>typeof p[k]==='string'&&p[k].length<=20)||!(p.value===null||(integer(p.value)&&p.value>=p.min&&p.value<=p.max))||!Array.isArray(p.choices)||p.choices.length>64||p.choices.some(c=>!Array.isArray(c)||c.length!==2||!integer(c[0])||c[0]<p.min||c[0]>p.max||typeof c[1]!=='string'||c[1].length>100))return null;
      seen.add(p.key);
    }
    return JSON.parse(JSON.stringify(value));
  }
  function canEdit(data,key,fresh=true){
    const p=data?.controls.find(p=>p.key===key);
    return !!(fresh&&data?.source==='hardware'&&p?.writable&&(p.value!==null||['gamma','white_balance_temperature'].includes(key))&&!(data.auto_exposure&&['exposure','analogue_gain','gain','digital_gain'].includes(key))&&!(key==='gamma'&&data.controls.find(c=>c.key==='auto_gamma')?.value===1)&&(!['red_balance','blue_balance','white_balance_temperature'].includes(key)||data.controls.find(c=>['auto_white_balance','white_balance_automatic'].includes(c.key))?.value!==1));
  }
  function change(data,key,value,id){
    if(key==='auto_exposure'){
      if(data?.source!=='hardware'||data.auto_exposure===null||![0,1].includes(value))return null;
    }else{
      const p=data?.controls.find(p=>p.key===key);
      if(!canEdit(data,key)||!integer(value)||value<p.min||value>p.max||(value-p.min)%p.step!==0||(p.choices.length&&!p.choices.some(c=>c[0]===value)))return null;
    }
    return {session_id:data.session_id,request_id:id,key,value};
  }
  function row(key,p){
    const choices=p?.choices.length?p.choices:p&&p.min===0&&p.max===1?[[0,'关闭'],[1,'开启']]:null;
    const menu=!!choices;
    const field=menu?'<select data-camera-param-choice="'+key+'" aria-label="'+names[key]+'">'+choices.map(([v,label])=>'<option value="'+v+'">'+escape(label)+'</option>').join('')+'</select>':'<input type="range" data-camera-param-range="'+key+'" aria-label="'+names[key]+'">';
    return '<div class="camera-param-row" data-camera-param-row="'+key+'"><label>'+names[key]+'</label><span class="camera-param-unit" data-camera-param-unit="'+key+'"></span>'+field+'<input type="number" data-camera-param-number="'+key+'" aria-label="'+names[key]+'数值" placeholder="—"></div>';
  }
  function render(){return '<div class="camera-adjustments"><div class="camera-exposure-mode"><span>曝光模式</span><div role="group" aria-label="曝光模式"><button type="button" data-camera-exposure-mode="1" aria-pressed="false" disabled>自动</button><button type="button" data-camera-exposure-mode="0" aria-pressed="false" disabled>手动</button></div></div><div data-camera-basic>'+basic.map(k=>row(k,null)).join('')+'</div><details class="camera-advanced"><summary>高级设置</summary><div data-camera-advanced>'+advancedControls(null).map(p=>row(p.key,null)).join('')+'</div></details><span class="camera-control-feedback" data-camera-control-feedback role="status">等待相机</span></div>';}
  function status(text){const node=host?.querySelector('[data-camera-control-feedback]');if(node)node.textContent=text;}
  function paint(){
    if(!host)return;
    const advanced=advancedControls(state),signature=JSON.stringify(advanced.map(p=>[p.key,p.parameter?.choices]));
    const container=host.querySelector('[data-camera-advanced]');
    if(container.dataset.signature!==signature){container.innerHTML=advanced.map(p=>row(p.key,p.parameter)).join('');container.dataset.signature=signature;}
    host.querySelectorAll('[data-camera-exposure-mode]').forEach(button=>{
      button.disabled=!connected||!!writer||state?.source!=='hardware'||state.auto_exposure===null;
      button.setAttribute('aria-pressed',String(connected&&state?.auto_exposure!==null&&Number(button.dataset.cameraExposureMode)===Number(state?.auto_exposure)));
    });
    host.querySelectorAll('[data-camera-param-row]').forEach(node=>{
      const key=node.dataset.cameraParamRow,p=state?.controls.find(p=>p.key===key),editing=node.contains(root.document?.activeElement);
      node.classList.toggle('is-disabled',!canEdit(state,key,connected));
      node.title=!p?(connected?'当前设备未提供此参数':'连接相机后读取可用参数'):key==='auto_gamma'?'自动沿用 IQ 曲线；切换手动从 2.20 开始':key==='white_balance_temperature'?'手动色温与红蓝增益为不同白平衡方式；编辑后切换为色温控制':key==='gamma'&&p.value===null?'当前曲线没有单一系数；明确输入系数后应用':p.source==='ae-target'?'自动曝光目标亮度':p.unit==='lines'?'传感器曝光行数':'';
      node.querySelector('[data-camera-param-unit]').textContent=!p?(connected?'未提供':'—'):scale(p)!==1?'':p.unit||'';
      node.querySelectorAll('input,select').forEach(input=>{
        const numeric=input.type==='number';
        input.disabled=!!writer||!canEdit(state,key,connected)||(input.type==='range'&&p?.value===null);
        if(p){input.min=numeric?displayed(p,p.min):p.min;input.max=numeric?displayed(p,p.max):p.max;input.step=numeric?p.step*scale(p):p.step;}
        if(numeric)input.placeholder=p?.value===null&&p?.writable?'输入数值':'—';
        if(!editing||writer){input.value=numeric?displayed(p,p?.value):p?.value??(input.type==='range'?0:'');}
      });
    });
  }
  async function refresh(){
    if(!host||!available()||reader||writer)return;
    const ticket=epoch,request=new root.AbortController();reader=request;
    const timeout=root.setTimeout(()=>request.abort(),2800);
    try{
      const response=await root.fetch(endpoint,{credentials:'same-origin',cache:'no-store',signal:request.signal});
      if(!response.ok)throw new Error('相机未连接');
      const body=await response.text();if(body.length>32768)throw new Error('参数读取失败');
      const next=validate(JSON.parse(body));if(!next)throw new Error('参数读取失败');
      if(!host||ticket!==epoch)return;
      state=next;connected=true;status(next.source==='hardware'?'已连接':'非实机画面');paint();onState?.(next);
    }catch(error){if(host&&ticket===epoch){connected=false;status('相机未连接');paint();}}
    finally{root.clearTimeout(timeout);if(reader===request)reader=null;}
  }
  async function write(key,value){
    if(!host||writer||!connected)return;
    const body=change(state,key,value,Date.now().toString(36)+'-'+(++sequence));if(!body){paint();return;}
    epoch++;reader?.abort();reader=null;
    const ticket=epoch,request=new root.AbortController();writer=request;paint();status('正在应用…');
    const timeout=root.setTimeout(()=>request.abort(),3500);
    try{
      const response=await root.fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',signal:request.signal,headers:{'Content-Type':'application/json','X-Hatchery-Command':'1'},body:JSON.stringify(body)});
      const text=await response.text();if(text.length>32768)throw new Error('未确认');
      if(!response.ok)throw new Error('未确认，请刷新');
      const next=validate(JSON.parse(text));if(!next)throw new Error('结果待确认');
      if(host&&ticket===epoch){state=next;connected=true;status('已应用');onState?.(next);}
    }catch(error){if(host&&ticket===epoch){connected=false;status(error.name==='AbortError'?'结果待确认':error.message);}}
    finally{root.clearTimeout(timeout);if(writer===request)writer=null;if(host&&ticket===epoch)paint();}
  }
  function input(event){
    const range=event.target.closest('[data-camera-param-range]');
    if(range){const key=range.dataset.cameraParamRange,p=state?.controls.find(p=>p.key===key),number=host.querySelector('[data-camera-param-number="'+key+'"]');if(number)number.value=displayed(p,Number(range.value));}
  }
  function edit(event){
    const node=event.target;if(!host?.contains(node)||node.disabled)return;
    const key=node.dataset.cameraParamRange||node.dataset.cameraParamNumber||node.dataset.cameraParamChoice;
    if(key&&node.value.trim()!=='')write(key,node.dataset.cameraParamNumber?fromDisplay(state?.controls.find(p=>p.key===key),node.value):Number(node.value));
  }
  function click(event){
    const button=event.target.closest('[data-camera-exposure-mode]');
    if(button&&!button.disabled&&button.getAttribute('aria-pressed')!=='true')write('auto_exposure',Number(button.dataset.cameraExposureMode));
  }
  function mount(options){
    unmount();host=options?.container;onState=options?.onState||null;if(!host)return false;
    host.addEventListener('input',input);host.addEventListener('change',edit);host.addEventListener('click',click);
    paint();refresh();if(available())timer=root.setInterval(refresh,2000);return true;
  }
  function unmount(){
    epoch++;reader?.abort();writer?.abort();reader=null;writer=null;
    if(timer!==null)root.clearInterval(timer);timer=null;
    host?.removeEventListener('input',input);host?.removeEventListener('change',edit);host?.removeEventListener('click',click);
    host=null;state=null;connected=false;onState=null;
  }
  return Object.freeze({render,mount,unmount,validate,canEdit,change,refresh,advancedControls,displayed,fromDisplay});
});
