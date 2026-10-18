/* Port of spaces/vision-demo/filters.py (5323046), using official OpenCV.js. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.VisionTools=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  let library=null;
  function load(){if(library)return library;library=new Promise((resolve,reject)=>{
    const tag=root.document.createElement('script');tag.src='vendor/opencv/opencv.js';tag.async=true;
    const timeout=root.setTimeout(()=>reject(Error('视觉工具加载超时')),20000);
    tag.onerror=()=>{root.clearTimeout(timeout);reject(Error('视觉工具加载失败'));};
    tag.onload=()=>{const ready=cv=>{root.clearTimeout(timeout);resolve({cv});};if(root.cv?.Mat)ready(root.cv);else if(typeof root.cv?.then==='function')root.cv.then(ready);else reject(Error('OpenCV 初始化失败'));};root.document.head.append(tag);
  }).catch(e=>{library=null;throw e;});return library;}
  function createProcessor(cv){let previous=null;
    function reset(){previous?.delete();previous=null;}
    function process(image,mode){const owned=[],mat=(...args)=>{const m=new cv.Mat(...args);owned.push(m);return m;};let source;
      try{source=cv.matFromImageData(image);owned.push(source);const gray=mat(),output=source.clone();owned.push(output);cv.cvtColor(source,gray,cv.COLOR_RGBA2GRAY);
        const same=previous&&previous.rows===gray.rows&&previous.cols===gray.cols;
        if(mode==='edges'||mode==='motion'&&same){const mask=mat(),tint=cv.Mat.zeros(source.rows,source.cols,cv.CV_8UC4);owned.push(tint);
          if(mode==='edges')cv.Canny(gray,mask,80,180);
          else{const difference=mat(),kernel=cv.Mat.ones(5,5,cv.CV_8U);owned.push(kernel);cv.absdiff(gray,previous,difference);cv.threshold(difference,mask,18,255,cv.THRESH_BINARY);cv.dilate(mask,mask,kernel);}
          tint.setTo(mode==='edges'?new cv.Scalar(255,220,40,255):new cv.Scalar(255,60,60,255),mask);cv.addWeighted(source,mode==='edges'?.6:.7,tint,mode==='edges'?1:.9,0,output);
        }else if(mode==='flow'&&same){const corners=mat(),moved=mat(),found=mat(),error=mat();cv.goodFeaturesToTrack(previous,corners,200,.01,12);
          if(corners.rows){cv.calcOpticalFlowPyrLK(previous,gray,corners,moved,found,error);for(let i=0;i<corners.rows;i++){if(!found.data[i])continue;const x0=corners.data32F[2*i],y0=corners.data32F[2*i+1],x1=moved.data32F[2*i],y1=moved.data32F[2*i+1];if((x1-x0)**2+(y1-y0)**2<4)continue;cv.arrowedLine(output,new cv.Point(Math.trunc(x0),Math.trunc(y0)),new cv.Point(Math.trunc(x1),Math.trunc(y1)),new cv.Scalar(60,220,255,255),2,cv.LINE_8,0,.35);}}
        }
        const result=new Uint8ClampedArray(output.data);for(let i=3;i<result.length;i+=4)result[i]=255;
        reset();previous=gray.clone();return {data:result,width:source.cols,height:source.rows};
      }finally{owned.forEach(m=>m.delete());}
    }return {process,reset,destroy:reset};
  }
  let host=null,video=null,canvas=null,timer=null,processor=null,mode='raw',generation=0,lastTime=null,geometry=null;
  function metadata(value){geometry=value;clear();}
  function drawGeometry(context,w,h){
    const i=geometry?.intrinsics,finite=Number.isFinite;
    if(!i||!['fx','fy','cx','cy'].every(k=>finite(i[k]))||!finite(geometry.width)||!finite(geometry.height)||geometry.width<=0||geometry.height<=0){put('后端尚未提供相机内参');return;}
    const x=i.cx*w/geometry.width,y=i.cy*h/geometry.height;
    context.strokeStyle='#fff';context.lineWidth=2;context.beginPath();context.moveTo(x-14,y);context.lineTo(x+14,y);context.moveTo(x,y-14);context.lineTo(x,y+14);context.stroke();
    put(`fx ${i.fx.toFixed(1)} · fy ${i.fy.toFixed(1)} · cx ${i.cx.toFixed(1)} · cy ${i.cy.toFixed(1)} px · ${i.calibrated===true?'已标定':'后端估计'}`);
  }
  const put=text=>{const node=host?.querySelector('[data-vision-status]');if(node)node.textContent=text;};
  const clear=()=>{if(canvas)canvas.hidden=true;processor?.reset();lastTime=null;};
  async function change(){const ticket=++generation;mode=host.querySelector('[data-vision-mode]').value;clear();processor?.destroy();processor=null;
    if(mode==='raw'){put('');return;}if(mode==='geometry'){processor={process:v=>v,reset(){},destroy(){}};put('读取 media.video 内参');return;}put('正在加载…');try{const result=await load();if(ticket!==generation||!host)return;processor=createProcessor(result.cv);put('本机处理 · 最长边 640 px · 5 Hz');}catch(e){if(ticket===generation)put(e.message);}}
  function tick(){if(!host||mode==='raw'||!processor)return;if(video.hidden||video.paused||video.readyState<2||!video.videoWidth){clear();return;}if(video.currentTime===lastTime)return;
    const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight)),w=Math.max(1,Math.round(video.videoWidth*scale)),h=Math.max(1,Math.round(video.videoHeight*scale));
    try{const buffer=root.document.createElement('canvas');buffer.width=w;buffer.height=h;const ctx=buffer.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,w,h);const result=processor.process(ctx.getImageData(0,0,w,h),mode);canvas.width=w;canvas.height=h;const output=canvas.getContext('2d');output.putImageData(new root.ImageData(result.data,w,h),0,0);if(mode==='geometry')drawGeometry(output,w,h);canvas.style.transform=video.style.transform;canvas.hidden=false;lastTime=video.currentTime;}
    catch(e){clear();put('视觉处理不可用');processor?.destroy();processor=null;}
  }
  function onChange(e){if(e.target.matches('[data-vision-mode]'))change();}
  function mount(container){unmount();host=container;if(!host)return;video=host.querySelector('[data-camera-video]');canvas=host.querySelector('[data-vision-canvas]');if(root.location?.protocol==='file:'){host.querySelector('[data-vision-mode]').disabled=true;put('请通过板端 Web 使用视觉工具');return;}host.addEventListener('change',onChange);timer=root.setInterval(tick,200);}
  function unmount(){generation++;if(timer!==null)root.clearInterval(timer);timer=null;host?.removeEventListener('change',onChange);clear();processor?.destroy();processor=null;host=video=canvas=null;mode='raw';geometry=null;}
  return Object.freeze({createProcessor,mount,unmount,metadata});
});
