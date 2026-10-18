(function(root){
  'use strict';
  let host=null,request=null,epoch=0;
  function render(){return `<details class="device-disclosure device-journal" data-device-journal><summary>服务日志</summary><div class="device-journal-controls"><label>程序<select data-journal-unit>${root.DeviceSystem.units.map(u=>`<option value="${u}">${u}</option>`).join('')}</select></label><button type="button" class="button secondary" data-journal-refresh>读取日志</button><span class="device-caption" data-journal-status role="status">本次开机 · 最近 100 条</span></div><pre data-journal-lines tabindex="0" aria-label="服务日志">尚未读取</pre></details>`;}
  function clear(){epoch++;request?.abort();request=null;if(!host)return;host.querySelector('[data-journal-lines]').textContent='尚未读取';host.querySelector('[data-journal-status]').textContent='本次开机 · 最近 100 条';host.querySelector('[data-journal-refresh]').disabled=false;}
  async function load(){
    if(!host||request)return;
    const ticket=epoch,controller=new root.AbortController(),unit=host.querySelector('[data-journal-unit]').value;request=controller;
    const button=host.querySelector('[data-journal-refresh]'),status=host.querySelector('[data-journal-status]'),lines=host.querySelector('[data-journal-lines]');
    button.disabled=true;status.textContent='正在读取…';lines.textContent='';const timeout=root.setTimeout(()=>controller.abort(),6000);
    try{const result=await root.DeviceSystem.logs(unit,controller.signal);if(!host||ticket!==epoch)return;
      lines.textContent=result.lines.join('\n')||'此服务在本次开机尚无日志';status.textContent=`${result.lines.length} 条${result.truncated?' · 较早内容已截断':''}`;
    }catch(error){if(host&&ticket===epoch){status.textContent=error.name==='AbortError'?'日志读取超时':error.message;lines.textContent='未取得日志';}}
    finally{root.clearTimeout(timeout);if(request===controller)request=null;if(host&&ticket===epoch)button.disabled=false;}
  }
  function click(event){if(event.target.closest('[data-journal-refresh]'))load();}
  function toggle(){if(!host.open)clear();}
  function mount(container){unmount();host=container;if(!host)return;host.addEventListener('click',click);host.addEventListener('change',clear);host.addEventListener('toggle',toggle);}
  function unmount(){clear();host?.removeEventListener('click',click);host?.removeEventListener('change',clear);host?.removeEventListener('toggle',toggle);host=null;}
  root.DeviceJournal=Object.freeze({render,mount,unmount});
})(window);
