/* Adapted from Pollen Robotics Microduck mediad/webclient/index.html at 9136aa4.
 * Apache-2.0; see src/NOTICE-UPSTREAM.md. Video-only adapter: no robot commands. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.CameraStream=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  function signalling(address,port=8443){try{const u=new URL(address);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!Number.isInteger(port)||port<1||port>65535)return null;u.protocol=u.protocol==='https:'?'wss:':'ws:';u.port=String(port);u.pathname='/';u.search='';u.hash='';return u.href;}catch(_){return null;}}
  function create({video,onState}){
    let ws=null,pc=null,sessionId=null,starting=false,wanted=false,epoch=0,timer=null,ice=[],queue=Promise.resolve(),media=null,phase='idle';
    const state=(next,message)=>{phase=next;onState?.({phase:next,message});};
    const send=message=>{if(ws?.readyState===1)ws.send(JSON.stringify(message));};
    function clearPeer(){if(pc){pc.ontrack=pc.onicecandidate=pc.onconnectionstatechange=pc.ondatachannel=null;pc.close();pc=null;}ice=[];media?.getTracks().forEach(t=>t.stop());media=null;video.pause();video.srcObject=null;video.style.transform='';}
    function stop(){epoch++;wanted=false;starting=false;root.clearTimeout(timer);timer=null;if(sessionId)send({type:'endSession',sessionId});sessionId=null;if(ws){ws.onopen=ws.onerror=ws.onclose=ws.onmessage=null;ws.close();ws=null;}clearPeer();state('idle','未连接');}
    function fail(message){stop();state('error',message);}
    function playing(){if(!wanted||!video.videoWidth||video.readyState<2)return;root.clearTimeout(timer);timer=null;state('live','实时视频 · WebRTC');}
    video.addEventListener('playing',playing);
    function newPeer(){
      pc=new root.RTCPeerConnection();
      const peer=pc;
      peer.ontrack=event=>{if(peer!==pc||event.track.kind!=='video')return;media=event.streams[0]||new root.MediaStream([event.track]);video.srcObject=media;video.play().catch(()=>{if(peer===pc&&wanted)state('paused','点击继续播放');});};
      peer.onicecandidate=event=>{if(peer===pc&&event.candidate)send({type:'peer',sessionId,ice:{candidate:event.candidate.candidate,sdpMLineIndex:event.candidate.sdpMLineIndex}});};
      peer.onconnectionstatechange=()=>{if(peer!==pc)return;if(peer.connectionState==='failed')fail('视频连接失败，请检查板端 ICE 连接');else if(peer.connectionState==='disconnected')state('interrupted','视频连接中断');else if(peer.connectionState==='connected'&&phase==='interrupted')playing();};
      // The producer creates its datachannel. Read only media.video; never send robot RPCs.
      peer.ondatachannel=event=>{event.channel.onmessage=event=>{try{const msg=JSON.parse(event.data);if(msg.method==='media.video'){const rotation=msg.params?.rotate??msg.params?.rotation??0;if([0,90,180,270].includes(rotation))video.style.transform=`rotate(${rotation}deg)${rotation%180?' scale(.5625)':''}`;}}catch(_){}};};
    }
    async function onSignalling(raw,ticket){
      if(typeof raw!=='string'||raw.length>1024*1024)throw Error('Invalid signalling message');
      const msg=JSON.parse(raw);
      switch(msg.type){
        case 'welcome':send({type:'list'});break;
        case 'list':{
          if(sessionId||starting||!wanted)break;
          const producers=msg.producers||[];
          if(!producers.length)throw Error('板端尚未发布视频');
          if(producers.length!==1)throw Error('检测到多个视频源，请检查板端服务');
          starting=true;send({type:'startSession',peerId:producers[0].id});break;
        }
        case 'sessionStarted':
          if(!wanted)break;starting=false;sessionId=msg.sessionId;state('negotiating','正在协商视频…');newPeer();break;
        case 'peer':{
          if(!pc||msg.sessionId!==sessionId)break;const peer=pc;
          if(msg.sdp){if(msg.sdp.type!=='offer')throw Error('Unexpected SDP');await peer.setRemoteDescription(msg.sdp);if(ticket!==epoch||peer!==pc)return;for(const item of ice.splice(0))await peer.addIceCandidate(item);const answer=await peer.createAnswer();await peer.setLocalDescription(answer);if(ticket===epoch&&peer===pc)send({type:'peer',sessionId,sdp:{type:'answer',sdp:answer.sdp}});}
          else if(msg.ice){const candidate={candidate:msg.ice.candidate,sdpMLineIndex:msg.ice.sdpMLineIndex};if(peer.remoteDescription)await peer.addIceCandidate(candidate);else ice.push(candidate);}
          break;
        }
        case 'endSession':if(msg.sessionId===sessionId)fail('视频会话已结束，请重新连接');break;
        case 'sessionRejected':throw Error('板端拒绝了视频会话');
        case 'error':throw Error('视频信令服务返回错误');
      }
    }
    function start(address,port){
      stop();const url=signalling(address,port);if(!url){state('error','相机地址无效');return false;}
      if(!root.RTCPeerConnection||!root.WebSocket){state('error','当前浏览器不支持 WebRTC');return false;}
      wanted=true;const ticket=epoch;state('connecting','正在连接相机…');queue=Promise.resolve();
      try{ws=new root.WebSocket(url);}catch(_){fail('无法连接视频信令服务');return false;}
      timer=root.setTimeout(()=>{if(wanted&&ticket===epoch)fail('等待视频超时，请检查信令和网络');},20000);
      ws.onopen=()=>state('connecting','正在查找视频源…');
      ws.onerror=()=>{if(ticket===epoch)fail('无法连接信令，请检查 8443 端口');};
      ws.onclose=()=>{if(ticket===epoch)fail('视频信令连接已关闭');};
      ws.onmessage=event=>{queue=queue.then(()=>{if(ticket===epoch&&wanted)return onSignalling(event.data,ticket);}).catch(error=>{if(ticket===epoch)fail(error.message||'视频连接失败');});};
      return true;
    }
    function pause(paused){if(!wanted)return;if(paused){video.pause();state('paused','播放已暂停');}else video.play().then(playing).catch(()=>{if(wanted)state('paused','点击继续播放视频');});}
    function destroy(){stop();video.removeEventListener('playing',playing);}
    return Object.freeze({start,stop,pause,destroy,snapshot:()=>({phase,active:wanted,sessionId})});
  }
  return Object.freeze({create,signalling});
});
