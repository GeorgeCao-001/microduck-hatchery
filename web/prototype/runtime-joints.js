/* Backend radians, semantic names; display IDs never become bus addresses. */
(function(root){'use strict';let host=null,unsubscribe=null,select=null;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=v=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(3):'—';
  function render(){return `<section class="panel runtime-joint-panel" data-runtime-joints><div class="panel-title"><h3>关节反馈</h3><span class="small muted">robotd · 只读</span></div><div class="joint-list-scroll"><table class="joint-table"><thead><tr><th>关节</th><th>实测 rad</th><th>目标 rad</th><th>状态</th></tr></thead><tbody>${root.JointDrafts.metadata.map(j=>`<tr data-runtime-joint-row="${j.id}"><td><button type="button" data-runtime-joint="${j.id}" class="joint-select"><strong>${escape(j.name)}</strong><span>${escape(j.raw)}</span></button></td><td data-runtime-actual>—</td><td data-runtime-goal>—</td><td data-runtime-valid>缺测</td></tr>`).join('')}</tbody></table></div></section>`;}
  function paint(s){if(!host)return;for(const j of root.JointDrafts.metadata){const row=host.querySelector(`[data-runtime-joint-row="${j.id}"]`),v=s.fresh?s.latest?.joints.find(v=>v.raw===j.raw):null;row.querySelector('[data-runtime-actual]').textContent=number(v?.actual);row.querySelector('[data-runtime-goal]').textContent=number(v?.goal);row.querySelector('[data-runtime-valid]').textContent=v?.actual==null?'缺测':'已回报';}}
  function setSelected(id){if(!host)return;for(const row of host.querySelectorAll('[data-runtime-joint-row]')){const selected=Number(row.dataset.runtimeJointRow)===id;row.classList.toggle('selected',selected);row.querySelector('button').setAttribute('aria-pressed',String(selected));}}
  function click(e){const b=e.target.closest('[data-runtime-joint]');if(b){setSelected(Number(b.dataset.runtimeJoint));select?.(Number(b.dataset.runtimeJoint));}}
  function mount(container,onSelect){unmount();host=container;select=onSelect;if(!host)return;host.addEventListener('click',click);unsubscribe=root.RuntimeFeedback.subscribe(paint);}
  function unmount(){unsubscribe?.();unsubscribe=null;host?.removeEventListener('click',click);host=null;select=null;}
  root.RuntimeJoints=Object.freeze({render,mount,unmount,setSelected});
})(window);
