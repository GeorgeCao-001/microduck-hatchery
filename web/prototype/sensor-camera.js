(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.SensorCamera=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  let host=null,stream=null,address='',paused=false,active=false,download=null;
  const put=(key,text)=>{const n=host?.querySelector('[data-camera-'+key+']');if(n)n.textContent=text;};
  function parseAddress(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;u.pathname='/frame';u.search='';u.hash='';return u.href;}catch(_){return null;}}
  function controls(){if(!host)return;const info=stream?.snapshot();active=!!info?.active;host.querySelector('[data-camera-connect]').textContent=active?'断开':'连接';host.querySelector('[data-camera-pause]').disabled=!active;host.querySelector('[data-camera-pause]').textContent=paused?'继续':'暂停';host.querySelector('[data-camera-capture]').disabled=!['live','paused'].includes(info?.phase);}
  function onState(info){if(!host)return;const live=info.phase==='live'||info.phase==='paused';put('status',info.message);put('source',live?info.phase==='paused'?'播放已暂停':'实时视频':'等待视频');host.querySelector('[data-camera-video]').hidden=!live;host.querySelector('[data-camera-empty]').hidden=live;controls();}
  function snapshot(){const video=host.querySelector('[data-camera-video]');if(!video.videoWidth||video.readyState<2)return;const canvas=root.document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);canvas.toBlob(blob=>{if(!blob||!host)return;if(download)root.URL.revokeObjectURL(download);download=root.URL.createObjectURL(blob);const a=root.document.createElement('a');a.href=download;a.download='microduck-camera-'+Date.now()+'.png';a.click();},'image/png');}
  function click(event){const button=event.target.closest('button');if(!button||!host?.contains(button)||button.disabled)return;
    if(button.matches('[data-camera-connect]')){if(active){stream.stop();paused=false;controls();return;}address=host.querySelector('[data-camera-address]').value.trim();if(!parseAddress(address)){put('status','请输入有效的相机服务地址');return;}paused=false;stream.start(address,root.HATCHERY_BACKEND?.signallingPort||8443);controls();}
    else if(button.matches('[data-camera-pause]')){paused=!paused;stream.pause(paused);controls();}
    else if(button.matches('[data-camera-capture]'))snapshot();
  }
  function mount(options){unmount();host=options?.container;if(!host)return false;
    if(root.HATCHERY_BACKEND?.apiBase==='/api/v1/maintenance'){const u=new URL(root.location.href);u.port=String(root.HATCHERY_BACKEND.cameraPort||8080);u.pathname='/';u.search='';u.hash='';address=u.href;}
    const field=host.querySelector('[data-camera-address]');field.value=address;field.readOnly=root.HATCHERY_BACKEND?.apiBase==='/api/v1/maintenance';
    const video=host.querySelector('[data-camera-video]');stream=root.CameraStream.create({video,onState});host.addEventListener('click',click);
    root.CameraParameters?.mount({container:host.querySelector('[data-camera-tuning]'),onState:data=>{if(host){put('fps',data.target_fps+' FPS');put('capture-size',data.width+' × '+data.height);put('mode',data.mode);}}});controls();return true;
  }
  function unmount(){root.CameraParameters?.unmount();stream?.destroy();stream=null;host?.removeEventListener('click',click);if(download)root.URL.revokeObjectURL(download);download=null;host=null;active=false;paused=false;}
  return Object.freeze({mount,unmount,parseAddress,snapshot:()=>({mounted:!!host,active,paused,hasFrame:!!stream&&['live','paused'].includes(stream.snapshot().phase)})});
});
