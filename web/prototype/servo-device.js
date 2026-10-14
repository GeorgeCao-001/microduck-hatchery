(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ServoDevice = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let host = null, state = null, selected = null, pending = false, controller = null, refresh = null, generation = 0;
  let confirmed = false, singleConfirmed = false, session = null, jointId = null;
  let resultText = '目标编辑只改草稿；执行不自动重试。关闭输出会卸力，不等于急停。', bytesText = '未回读';
  const uiValues = new Map();
  const drafts = new Map();
  const byId = () => [...(state?.joints || []), ...(state?.unassigned_devices || [])].find(row => row.id === selected);
  const reference = counts => Number.isInteger(counts) && counts >= 0 && counts <= 4095 ? (counts * 360 / 4096).toFixed(2) : '—';
  // These fragments belong to the parameter ledger/editor, never a second workbench.
  function scanMarkup() {
    return `<div class="servo-ledger-scan"><button class="button secondary" type="button" data-device-scan disabled>扫描总线</button><button class="button secondary" type="button" data-device-scan-cancel disabled>取消</button><details data-device-details="scan"><summary>范围 <span>0–253</span></summary><div class="servo-scan-range"><label>起始 ID<input type="number" min="0" max="253" value="0" data-device-scan-start></label><label>结束 ID<input type="number" min="0" max="253" value="253" data-device-scan-end></label></div></details><label class="servo-probe-id"><span class="visually-hidden">查找指定 ID</span><input type="number" min="0" max="253" step="1" data-device-id value="1" aria-label="查找指定 ID"></label><button class="button secondary" type="button" data-device-probe disabled>查找 ID</button><span data-device-scan-status role="status">按当前波特率扫描</span></div>`;
  }
  function selectionMarkup() {
    return `<div class="servo-editor-device"><label>实际舵机 ID<select data-device-select aria-label="选择实际总线舵机"></select></label><label>关联关节<select data-device-joint aria-label="关节关联草稿"><option value="">未关联</option>${(root.JointDrafts?.metadata || []).map(j => `<option value="${j.id}">${esc(j.name)}</option>`).join('')}</select></label><button class="button secondary" type="button" data-device-bind>应用关联</button><span data-device-identity>等待后端状态</span></div>`;
  }
  function feedbackMarkup() { return '<div class="servo-device-values" data-device-values></div>'; }
  function controlsMarkup() {
    return `<div class="servo-editor-fields servo-adjustment"><div class="servo-device-target"><label>目标 counts<input type="number" data-device-target min="0" max="4095" step="1" placeholder="先对齐实测" aria-label="目标原始计数"></label><label class="servo-device-slider">目标草稿<input type="range" data-device-slider min="0" max="4095" step="1" value="2048" aria-label="目标原始计数滑块"><span data-device-angle>12-bit 参考角 — °</span></label><label>速度 raw<input type="number" data-device-speed min="1" max="200" value="50" aria-label="速度原始值"></label><label>加速度 raw<input type="number" data-device-acceleration min="1" max="50" value="10" aria-label="加速度原始值"></label></div><div class="servo-device-actions"><button class="button secondary" type="button" data-device-align disabled>实测 → 草稿</button><button class="button secondary" type="button" data-device-step="-32">−32</button><button class="button secondary" type="button" data-device-step="32">+32</button><button class="button primary" type="button" data-device-move disabled>执行目标</button><button class="button secondary" type="button" data-device-torque="on" disabled>开启输出</button><button class="button secondary" type="button" data-device-torque="off" disabled>关闭输出</button></div><p class="servo-device-capability" data-device-capability>默认只读。开启台架控制需后端显式授权。</p></div>`;
  }
  function confirmationMarkup() {
    return '<label class="servo-device-confirm"><input type="checkbox" data-device-confirm>已核对 FD HLS 寄存器适用，当前为无遮挡的裸机台架。</label>';
  }
  function identityMarkup() {
    return '<div class="servo-identity-actions"><button class="button secondary" type="button" data-device-change-id disabled>写入此 ID</button><label class="servo-device-confirm"><input type="checkbox" data-device-single-confirm>总线仅此一颗，输出已关闭</label><span>后端核对固件、ID 占用，写入后回读并恢复锁位。</span></div>';
  }
  function registersMarkup() {
    return `<details class="servo-device-registers" data-device-details="registers"><summary>原始寄存器回读</summary><div class="servo-device-actions"><button class="button secondary" type="button" data-device-read="0,5">身份原码</button><button class="button secondary" type="button" data-device-read="30,4">分辨率 / 模式</button><button class="button secondary" type="button" data-device-read="40,9">输出 / 目标</button><button class="button secondary" type="button" data-device-read="56,15">反馈窗口</button></div><div class="servo-device-register-inputs"><label>地址<input type="number" min="0" max="255" value="56" data-device-address></label><label>字节数<input type="number" min="1" max="32" value="15" data-device-length></label><button class="button secondary" type="button" data-device-read-custom>读取</button></div><pre data-device-bytes>未回读</pre><p>保留原始字节；FD 参考表与当前 HD 固件仍需逐项核对。</p></details>`;
  }
  function put(selector, property, value) { const element = host?.querySelector(selector); if (element) element[property] = value; }
  function message(text) { resultText = text; put('[data-device-result]', 'textContent', text); }
  function capture() {
    if (!host) return;
    for (const key of ['scan-start','scan-end','id','address','length']) { const element = host.querySelector('[data-device-' + key + ']'); if (element) uiValues.set(key, element.value); }
    host.querySelectorAll('[data-device-details]').forEach(element => uiValues.set('details-' + element.dataset.deviceDetails, element.open));
  }
  function repaint() {
    if (!host) return;
    const selection = root.ServoParameters?.currentSelection();
    if (selection && (selection.id !== selected || selection.jointId !== jointId)) { selected = selection.id; jointId = selection.jointId; singleConfirmed = false; }
    for (const [key,value] of uiValues) {
      if (key.startsWith('details-')) put('[data-device-details="' + key.slice(8) + '"]','open',value);
      else put('[data-device-' + key + ']','value',value);
    }
    showDraft(); update(state);
  }
  function draft() {
    if (!drafts.has(selected)) {
      const current = byId()?.decoded_reference?.position_raw;
      drafts.set(selected, { target: Number.isInteger(current) && current >= 0 && current <= 4095 ? current : null, speed:50, acceleration:10 });
    }
    return drafts.get(selected);
  }
  function showDraft() {
    if (!host || selected === null) return;
    const value = draft();
    for (const [key,number] of Object.entries({target:value.target ?? '',slider:value.target ?? 2048,speed:value.speed,acceleration:value.acceleration})) put('[data-device-' + key + ']','value',number);
    put('[data-device-angle]','textContent',`12-bit 参考角 ${reference(value.target)} °`);
  }
  function update(value) {
    state = value;
    if (!host) return;
    if (session !== value?.session_id) { session = value?.session_id ?? null; confirmed = false; singleConfirmed = false; }
    const rows = [...(value?.joints || []).filter(row => row.status !== 'missing' || value?.scan?.found_ids?.includes(row.id)), ...(value?.unassigned_devices || [])];
    if (selected !== null && !rows.some(row => row.id === selected)) rows.unshift({id:selected,status:'missing'});
    const select = host.querySelector('[data-device-select]');
    const optionsKey = rows.map(row => `${row.id}:${row.status === 'missing'}:${(root.JointDrafts?.metadata || []).find(j => root.ServoParameters?.boundId(j.id) === row.id)?.name || ''}`).join(',');
    if (select && select.dataset.options !== optionsKey) {
      select.innerHTML = rows.map(row => { const meta = root.JointDrafts?.metadata?.find(j => root.ServoParameters?.boundId(j.id) === row.id); return `<option value="${row.id}">#${row.id} · ${esc(meta?.name || '未关联')}${row.status === 'missing' ? ' · 缺测' : ''}</option>`; }).join('');
      select.dataset.options = optionsKey;
    }
    put('[data-device-select]','value',selected ?? ''); put('[data-device-select]','disabled',pending || !rows.length);
    put('[data-device-joint]','value',jointId ?? ''); put('[data-device-joint]','disabled',pending);
    put('[data-device-confirm]','checked',confirmed); put('[data-device-single-confirm]','checked',singleConfirmed);
    put('[data-device-result]','textContent',resultText); put('[data-device-bytes]','textContent',bytesText);
    const scan = value?.scan, open = value?.connection === 'open';
    put('[data-device-scan]','disabled',pending || !open || !!scan?.active);
    put('[data-device-scan-cancel]','disabled',pending || !scan?.active);
    put('[data-device-probe]','disabled',pending || !open);
    put('[data-device-bind]','disabled',selected === null || jointId === null || pending || root.ServoParameters?.boundId(jointId) === selected);
    const scanLabels = {scanning:'扫描中',complete:'扫描完成',cancelled:'已取消',disconnected:'已断开'};
    put('[data-device-scan-status]','textContent',scan?.status ? `${scanLabels[scan.status] || scan.status} · ${scan.completed}/${scan.end_id-scan.start_id+1} · 找到 ${scan.found_ids.length} 颗` : '按当前波特率扫描');
    const row = byId(), data = row?.decoded_reference;
    const fresh = row && row.received_monotonic_ms != null && value.collected_monotonic_ms-row.received_monotonic_ms <= value.max_age_ms && ['response','fixture'].includes(row.status);
    const word = key => fresh && data ? data[key] : '—';
    put('[data-device-identity]','textContent',selected === null ? '等待后端状态' : `ID ${selected} · ${fresh ? value.source === 'fixture' ? 'fake 夹具' : '已应答' : '缺测 / 陈旧'} · ${value?.profile_id || 'profile 待核对'}`);
    put('[data-device-values]','innerHTML',[['位置 counts',word('position_raw')],['参考角 °',fresh && data ? reference(data.position_raw) : '—'],['速度 raw',word('speed_raw')],['raw load',word('load_raw')],['电流 raw',word('current_raw')],['电压 raw',word('voltage_raw')],['温度 raw',word('temperature_raw')],['移动 raw',word('moving_raw')]].map(([label,number]) => `<div><span>${label}</span><strong class="mono">${esc(number)}</strong></div>`).join(''));
    const writable = value?.control_enabled === true && open && fresh && confirmed && !scan?.active;
    host.querySelectorAll('[data-device-move],[data-device-torque]').forEach(button => button.disabled = pending || !writable);
    put('[data-device-torque="off"]','disabled',pending || !value?.control_enabled || !open || !confirmed || !!scan?.active);
    host.querySelectorAll('[data-device-read],[data-device-read-custom]').forEach(button => button.disabled = pending || !open);
    const newId=host.querySelector('[data-device-new-id]'), validId=newId && newId.value !== '' && Number.isInteger(Number(newId.value)) && Number(newId.value) >= 0 && Number(newId.value) <= 253 && Number(newId.value) !== selected;
    put('[data-device-change-id]','disabled',pending || !writable || !singleConfirmed || !validId);
    put('[data-device-align]','disabled',pending || !fresh || !data);
    put('[data-device-capability]','textContent',value?.control_enabled ? '单次目标限定在新鲜实测 ±128 counts；后端核对模式 4、分辨率 1。' : '当前只读；台架控制须在后端显式开放。');
  }
  function input(event) {
    if (!host || selected === null) return;
    const element = event.target, value = draft();
    if (element.matches('[data-device-target],[data-device-slider]')) {
      value.target = element.value === '' ? null : Number(element.value);
      showDraft();
    } else if (element.matches('[data-device-speed]')) value.speed = Number(element.value);
    else if (element.matches('[data-device-acceleration]')) value.acceleration = Number(element.value);
    else if (element.matches('[data-device-new-id]')) update(state);
    else if (element.matches('[data-device-single-confirm]')) { singleConfirmed = element.checked; update(state); }
    else if (element.matches('[data-device-confirm]')) { confirmed = element.checked; update(state); }
  }
  function change(event) {
    if (event.target.matches('[data-device-select]')) {
      const id = Number(event.target.value), mapped = root.JointDrafts?.metadata?.find(j => root.ServoParameters?.boundId(j.id) === id);
      if (selectId(id,mapped?.id ?? jointId)) send({action:'ping',id});
    } else if (event.target.matches('[data-device-joint]')) {
      if (pending) { update(state); return; }
      jointId = event.target.value === '' ? null : Number(event.target.value);
      root.ServoParameters?.deviceContext(selected,jointId);
    }
  }
  async function send(operation) {
    if (!host || pending || !state || state.connection !== 'open') return;
    if (['move','torque','change_id'].includes(operation.action) && (!confirmed || !state.control_enabled)) { message('台架控制未开放或未确认。'); return; }
    pending = true; update(state);
    let changedId = null;
    controller = new root.AbortController();
    const requestController = controller;
    const ticket = generation, localHost = host, commandId = root.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timer = root.setTimeout(() => requestController.abort(),4000);
    message(`${operation.id == null ? '总线' : 'ID ' + operation.id} · 正在${operation.action === 'read' ? '回读' : '执行一次操作'}…`);
    try {
      const reply = await root.fetch('/api/v1/maintenance/command', {method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Hatchery-Command':'1'},signal:controller.signal,body:JSON.stringify({command_id:commandId,session_id:session,expires_unix_ms:Date.now()+1500,bench_confirmed:confirmed,operation})});
      const text = await reply.text();
      if (!reply.ok || text.length > 65536) throw new Error('后端拒绝或未能确认；不会自动重发。');
      const result = JSON.parse(text);
      if (ticket !== generation || host !== localHost) return;
      if (result.command_id !== commandId || result.id !== (operation.id ?? null)) throw new Error('命令确认不匹配。');
      const labels = {read:'已回读',rejected:'已拒绝',unconfirmed:'结果未确认',readback_match:'写入已应答，回读一致',readback_mismatch:'写入已应答，回读不一致',scan_started:'开始扫描',scan_cancelled:'已取消扫描'};
      message(`${result.id === null ? '总线' : 'ID ' + result.id} · ${labels[result.status] || '未知结果'}${result.reason ? '：'+result.reason : ''}${operation.action === 'move' ? '；物理到位仍需观察反馈。' : ''}`);
      if (operation.action === 'change_id' && result.status === 'readback_match' && result.new_id === operation.new_id && result.eeprom_locked === true) changedId = result.new_id;
      if (result.status === 'read' && Array.isArray(result.raw_bytes)) { bytesText = `ID ${result.id} / 地址 ${result.address}\n${result.raw_bytes.map(byte=>byte.toString(16).padStart(2,'0')).join(' ')}`; put('[data-device-bytes]','textContent',bytesText); }
    } catch (error) {
      if (ticket === generation && host === localHost) message(`${operation.id == null ? '总线' : 'ID ' + operation.id} · ${error.name === 'AbortError' ? '请求中断，执行结果可能未确认；不会自动重发。' : error.message}`);
    } finally {
      root.clearTimeout(timer);
      if (ticket === generation && host === localHost) {
        pending=false; controller=null;
        if (changedId !== null) {
          root.ServoParameters?.remapDevice(operation.id,changedId);
          selectId(changedId,root.ServoParameters?.currentSelection().jointId ?? null);
        }
        update(state); refresh?.();
      }
    }
  }
  function click(event) {
    const element = event.target.closest('button');
    if (!element || element.disabled) return;
    if (element.matches('[data-device-scan]')) {
      const start_id = Number(host.querySelector('[data-device-scan-start]').value), end_id = Number(host.querySelector('[data-device-scan-end]').value);
      if (!Number.isInteger(start_id) || !Number.isInteger(end_id) || start_id < 0 || end_id > 253 || start_id > end_id) { message('扫描范围为 0–253，起始 ID 不能大于结束 ID。'); return; }
      send({action:'scan',start_id,end_id}); return;
    }
    if (element.matches('[data-device-scan-cancel]')) { send({action:'cancel_scan'}); return; }
    if (element.matches('[data-device-probe]')) {
      const id = Number(host.querySelector('[data-device-id]').value);
      if (!Number.isInteger(id) || id < 0 || id > 253) { message('舵机 ID 必须是 0–253 的整数。'); return; }
      if (selectId(id,jointId)) send({action:'ping',id}); return;
    }
    if (selected === null) return;
    const value = draft();
    if (element.matches('[data-device-bind]')) { root.ServoParameters?.bindDevice(jointId,selected); update(state); }
    else if (element.matches('[data-device-change-id]')) {
      const new_id = Number(host.querySelector('[data-device-new-id]').value);
      if (host.querySelector('[data-device-new-id]').value === '' || !Number.isInteger(new_id) || new_id < 0 || new_id > 253 || new_id === selected) { message('新 ID 必须是不同的 0–253 整数。'); return; }
      send({action:'change_id',id:selected,new_id,single_device_confirmed:singleConfirmed});
    }
    else if (element.matches('[data-device-align]')) { value.target = byId()?.decoded_reference?.position_raw ?? null; showDraft(); }
    else if (element.matches('[data-device-step]')) {
      if (value.target === null) return;
      value.target = Math.max(0,Math.min(4095,value.target + Number(element.dataset.deviceStep))); showDraft();
    } else if (element.matches('[data-device-move]')) {
      if (!Number.isInteger(value.target) || !Number.isInteger(value.speed) || !Number.isInteger(value.acceleration)) { message('请输入整数目标、速度和加速度。'); return; }
      send({action:'move',id:selected,target_raw:value.target,speed_raw:value.speed,acceleration_raw:value.acceleration});
    } else if (element.matches('[data-device-torque]')) send({action:'torque',id:selected,enabled:element.dataset.deviceTorque==='on'});
    else if (element.matches('[data-device-read],[data-device-read-custom]')) {
      const [address,length] = element.dataset.deviceRead ? element.dataset.deviceRead.split(',').map(Number) : [Number(host.querySelector('[data-device-address]').value),Number(host.querySelector('[data-device-length]').value)];
      if (!Number.isInteger(address) || !Number.isInteger(length) || address<0 || address>255 || length<1 || length>32 || address+length>256) { message('读取地址 0–255，字节数 1–32，范围不能越过 255。'); return; }
      send({action:'read',id:selected,address,length});
    }
  }
  function selectId(id, joint = jointId) {
    if (pending || !Number.isInteger(id) || id < 0 || id > 253) return false;
    const changed = selected !== id;
    selected = id; jointId = joint;
    if (changed) singleConfirmed = false;
    root.ServoParameters?.deviceContext(id,jointId);
    showDraft(); update(state); return true;
  }
  function mount(options) {
    unmount(); host=options?.container; refresh=options?.refresh || null;
    if (!host) return false;
    const initial=root.ServoParameters?.currentSelection(); selected=initial?.id ?? null; jointId=initial?.jointId ?? null;
    host.addEventListener('input',input); host.addEventListener('change',change); host.addEventListener('click',click); repaint(); return true;
  }
  function unmount() {
    generation++; controller?.abort(); controller=null;
    host?.removeEventListener('input',input); host?.removeEventListener('change',change); host?.removeEventListener('click',click);
    host=null; state=null; selected=null; pending=false; confirmed=false; session=null; jointId=null; singleConfirmed=false; refresh=null; uiValues.clear();
    resultText='目标编辑只改草稿；执行不自动重试。关闭输出会卸力，不等于急停。'; bytesText='未回读';
  }
  return Object.freeze({scanMarkup,selectionMarkup,feedbackMarkup,controlsMarkup,confirmationMarkup,identityMarkup,registersMarkup,mount,unmount,update,repaint,capture,reference,selectId,isPending:()=>pending});
});
