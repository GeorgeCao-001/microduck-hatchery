(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.SensorCamera=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  let host=null,stream=null,address='',paused=false,active=false,download=null;
  let detectionFrame=null,detectionAt=0,detectionTimer=null;
  const put=(key,text)=>{const n=host?.querySelector('[data-camera-'+key+']');if(n)n.textContent=text;};
  function parseAddress(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;u.pathname='/frame';u.search='';u.hash='';return u.href;}catch(_){return null;}}
  function controls(){if(!host)return;const info=stream?.snapshot();active=!!info?.active;host.querySelector('[data-camera-connect]').textContent=active?'断开':'连接';host.querySelector('[data-camera-pause]').disabled=!active;host.querySelector('[data-camera-pause]').textContent=paused?'继续':'暂停';host.querySelector('[data-camera-capture]').disabled=!['live','paused'].includes(info?.phase);}
  function onState(info){if(!host)return;const live=info.phase==='live'||info.phase==='paused';put('status',info.message);put('source',live?info.phase==='paused'?'播放已暂停':'实时视频':'等待视频');host.querySelector('[data-camera-video]').hidden=!live;host.querySelector('[data-camera-empty]').hidden=live;controls();paintDetections();}
  // Adapted from official mediad/webclient onDetections at 5323046, Apache-2.0.
  function paintDetections(){
    if(!host)return;const svg=host.querySelector('[data-camera-boxes]');if(!svg)return;
    const fresh=detectionFrame&&root.performance.now()-detectionAt<=2000;
    const enabled=host.querySelector('[data-camera-detections]')?.checked;
    svg.hidden=!fresh||!enabled||paused||stream?.snapshot().phase!=='live';svg.replaceChildren();
    put('detection-label',fresh?`检测框 ${detectionFrame.boxes.length}`:'检测框');
    if(svg.hidden)return;
    svg.setAttribute('viewBox',`0 0 ${detectionFrame.width} ${detectionFrame.height}`);
    for(const box of detectionFrame.boxes){
      const rect=root.document.createElementNS('http://www.w3.org/2000/svg','rect');
      for(const [key,value] of Object.entries({x:box.x0,y:box.y0,width:box.x1-box.x0,height:box.y1-box.y0}))rect.setAttribute(key,String(value));
      svg.appendChild(rect);
      const label=root.document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('x',String(box.x0));label.setAttribute('y',String(box.y0>16?box.y0-4:Math.min(detectionFrame.height-4,box.y1+14)));
      label.textContent='小鸭';svg.appendChild(label);
    }
  }
  function telemetry(message,forward){
    if(!host)return;
    if(message.kind==='video'){root.VisionTools.metadata(message.video);return;}
    if(message.kind==='closed')root.VisionTools.metadata(null);
    if(message.kind==='detections'){detectionFrame=root.SensorData.decodeDetections(message.frame);detectionAt=root.performance.now();paintDetections();}
    else {if(message.kind==='closed'){detectionFrame=null;paintDetections();}forward?.(message);}
  }
  function snapshot(){const video=host.querySelector('[data-camera-video]');if(!video.videoWidth||video.readyState<2)return;const canvas=root.document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);canvas.toBlob(blob=>{if(!blob||!host)return;if(download)root.URL.revokeObjectURL(download);download=root.URL.createObjectURL(blob);const a=root.document.createElement('a');a.href=download;a.download='microduck-camera-'+Date.now()+'.png';a.click();},'image/png');}
  function click(event){const button=event.target.closest('button');if(!button||!host?.contains(button)||button.disabled)return;
    if(button.matches('[data-camera-connect]')){if(active){stream.stop();paused=false;controls();return;}address=host.querySelector('[data-camera-address]').value.trim();if(!parseAddress(address)){put('status','请输入有效的相机服务地址');return;}paused=false;stream.start(address,root.HATCHERY_BACKEND?.signallingPort||8443);controls();}
    else if(button.matches('[data-camera-pause]')){paused=!paused;stream.pause(paused);controls();}
    else if(button.matches('[data-camera-capture]'))snapshot();
  }
  function mount(options){unmount();host=options?.container;if(!host)return false;
    root.VisionTools.mount(host);
    if(root.HATCHERY_BACKEND?.apiBase==='/api/v1/maintenance'){const u=new URL(root.location.href);u.port=String(root.HATCHERY_BACKEND.cameraPort||8080);u.pathname='/';u.search='';u.hash='';address=u.href;}
    const field=host.querySelector('[data-camera-address]');field.value=address;field.readOnly=root.HATCHERY_BACKEND?.apiBase==='/api/v1/maintenance';
    const video=host.querySelector('[data-camera-video]');stream=root.CameraStream.create({video,onState,onTelemetry:root.HATCHERY_BACKEND?.apiBase==='/api/v1/maintenance'?message=>telemetry(message,options.onTelemetry):undefined});host.addEventListener('click',click);host.addEventListener('change',paintDetections);detectionTimer=root.setInterval(paintDetections,500);
    root.CameraParameters?.mount({container:host.querySelector('[data-camera-tuning]'),onState:data=>{if(host){put('fps',data.target_fps+' FPS');put('capture-size',data.width+' × '+data.height);put('mode',data.mode);}}});controls();return true;
  }
  function unmount(){root.VisionTools?.unmount();if(detectionTimer!==null)root.clearInterval(detectionTimer);detectionTimer=null;detectionFrame=null;detectionAt=0;host?.removeEventListener('change',paintDetections);root.CameraParameters?.unmount();stream?.destroy();stream=null;host?.removeEventListener('click',click);if(download)root.URL.revokeObjectURL(download);download=null;host=null;active=false;paused=false;}
  return Object.freeze({mount,unmount,parseAddress,snapshot:()=>({mounted:!!host,active,paused,hasFrame:!!stream&&['live','paused'].includes(stream.snapshot().phase)})});
});
