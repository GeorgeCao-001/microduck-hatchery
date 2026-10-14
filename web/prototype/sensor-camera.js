(function (root,factory) {
  'use strict';
  const api=factory(root);
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.SensorCamera=api;
})(typeof window!=='undefined'?window:globalThis,function (root) {
  'use strict';
  // Reads mediad's existing /frame PNG. Cross-origin <img> does not require CORS.
  // Opening this page never connects to a camera or changes camera configuration.
  let host=null,endpoint=null,timer=null,pending=null,generation=0,active=false,paused=false;
  let frame=null,address='';
  const put=(key,value)=>{const element=host?.querySelector('[data-camera-'+key+']');if(element)element.textContent=value;};
  function parseAddress(text) {
    try {const url=new URL(text);if(!['http:','https:'].includes(url.protocol) || url.username || url.password)return null;url.pathname='/frame';url.search='';url.hash='';return url.href;}catch(_){return null;}
  }
  function controls() {
    if (!host) return;
    host.querySelector('[data-camera-connect]').textContent=active?'断开预览':'连接预览';
    host.querySelector('[data-camera-address]').disabled=active;
    host.querySelector('[data-camera-pause]').disabled=!active;
    host.querySelector('[data-camera-pause]').textContent=paused?'继续读取':'暂停读取';
    host.querySelector('[data-camera-capture]').disabled=!active || !!pending;
    const badge=host.querySelector('[data-camera-source]');
    badge.textContent=frame?active?(paused?'画面已暂停':frame.stale?'陈旧快照':'媒体快照'):'历史快照':'尚无画面';
    badge.className='badge '+(frame?'readonly':'draft');
  }
  function cancelRequest() {
    generation++;
    if (pending) {root.clearTimeout(pending.timeout);pending.image.onload=null;pending.image.onerror=null;pending.image.src='';pending=null;}
  }
  function cancel() {
    if (timer!==null) root.clearInterval(timer); timer=null;
    cancelRequest();
  }
  function disconnect() {
    cancel();active=false;paused=false;endpoint=null;
    put('age',frame?'历史快照':'—');
    put('status',frame?'已断开 · 保留最后快照及其接收时间。':'尚未读取相机帧。');controls();
  }
  function capture() {
    if (!host || !active || pending || root.document?.hidden) return;
    const ticket=++generation,image=new root.Image(),url=new URL(endpoint);
    url.searchParams.set('_hatchery_snapshot',String(Date.now()));
    const request={image,timeout:null};pending=request;
    function finish(error) {
      if (!host || ticket!==generation || pending!==request) return;
      root.clearTimeout(request.timeout);image.onload=null;image.onerror=null;pending=null;
      if (error) {if(frame)frame.stale=true;put('status',error+'；'+(frame?'保留上次快照，画面已陈旧。':'暂无画面。'));put('age',frame?'陈旧快照':'—');}
      else {
        frame={receivedAt:Date.now(),width:image.naturalWidth,height:image.naturalHeight,endpoint};
        const display=host.querySelector('[data-camera-image]');
        image.setAttribute('data-camera-image','');image.alt='板端媒体服务最近一次快照';image.hidden=false;display.replaceWith(image);
        host.querySelector('[data-camera-empty]').hidden=true;
        put('status','已收到媒体服务快照 · 只读显示。');
        put('received',new Date(frame.receivedAt).toLocaleTimeString());put('resolution',`${frame.width} × ${frame.height}`);put('age','刚刚收到');
        put('endpoint',frame.endpoint);
      }
      controls();
    }
    request.timeout=root.setTimeout(()=>{if(ticket===generation){image.src='';finish('读取超时');}},4000);
    image.onload=()=>finish(null);image.onerror=()=>finish('读取失败，请核对媒体服务地址');image.src=url.href;controls();
  }
  function click(event) {
    const button=event.target.closest('button');if(!button || !host?.contains(button) || button.disabled)return;
    if (button.matches('[data-camera-connect]')) {
      if(active){disconnect();return;}
      address=host.querySelector('[data-camera-address]').value.trim();const parsed=parseAddress(address);
      if(!parsed){put('status','请输入 http:// 或 https:// 媒体服务地址。');return;}
      endpoint=parsed;active=true;paused=false;if(frame)frame.stale=true;put('status','正在请求媒体服务快照…');capture();
      timer=root.setInterval(()=>{if(frame)put('age',`${Math.floor((Date.now()-frame.receivedAt)/1000)} s 前收到${frame.stale?' · 陈旧':''}`);if(!paused)capture();},1000);
    }else if(button.matches('[data-camera-pause]')){paused=!paused;if(paused){cancelRequest();put('status','显示已暂停 · 不停止板端采集。');}else capture();controls();}
    else if(button.matches('[data-camera-capture]'))capture();
  }
  function mount(options) {
    unmount();host=options?.container;if(!host)return false;
    host.querySelector('[data-camera-address]').value=address;host.addEventListener('click',click);controls();return true;
  }
  function unmount() {
    cancel();host?.removeEventListener('click',click);host=null;active=false;paused=false;endpoint=null;frame=null;
  }
  return Object.freeze({mount,unmount,parseAddress,snapshot:()=>({mounted:!!host,active,paused,hasFrame:!!frame})});
});
