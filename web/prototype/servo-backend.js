(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ServoBackend = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const ids = [20,21,22,23,24,10,11,12,13,14,30,31,32,33,34];
  const runtimes = [20,21,22,23,24,30,31,32,33,34,10,11,12,13,14];
  const policies = runtimes.filter(id => id !== 34);
  let container = null, controller = null, generation = 0, frame = null, poll = null, onFrame = null;
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  function validReading(row, value) {
    if (!plain(row) || !['missing','fixture','response','device_error'].includes(row.status) ||
      (row.received_unix_ms !== null && !integer(row.received_unix_ms)) ||
      (row.received_monotonic_ms !== null && (!integer(row.received_monotonic_ms) || row.received_monotonic_ms > value.collected_monotonic_ms)) ||
      (row.raw_bytes !== null && (!Array.isArray(row.raw_bytes) || ![0,15].includes(row.raw_bytes.length) || row.raw_bytes.some(n => !Number.isInteger(n) || n < 0 || n > 255)))) return false;
    if (row.status === 'missing' && (row.raw_bytes !== null || row.decoded_reference !== null || row.received_unix_ms !== null || row.received_monotonic_ms !== null)) return false;
    if (row.status !== 'missing' && (row.received_unix_ms === null || row.received_monotonic_ms === null || row.raw_bytes === null)) return false;
    if (row.status === 'fixture' && value.source !== 'fixture') return false;
    if (row.decoded_reference !== null) {
      const words = row.decoded_reference;
      if (!plain(words) || !Array.isArray(row.raw_bytes) || row.raw_bytes.length !== 15 ||
        ['position_raw','goal_raw','speed_raw','load_raw','current_raw','voltage_raw','temperature_raw','state_raw','moving_raw'].some(key => !Number.isSafeInteger(words[key]))) return false;
    }
    return true;
  }
  function validate(value) {
    if (!plain(value) || value.protocol_version !== 'hatchery-maintenance/1' ||
      typeof value.read_only !== 'boolean' || typeof value.control_enabled !== 'boolean' || value.read_only === value.control_enabled || value.hardware_confirmed !== false ||
      value.register_profile_confirmed !== false || value.calibration_version !== null ||
      !['disconnected','fixture','hardware'].includes(value.source) || value.simulated !== false ||
      !['disconnected','fixture','open'].includes(value.connection) ||
      (value.source === 'fixture' && value.connection !== 'fixture') ||
      (value.source === 'disconnected' && value.connection !== 'disconnected') ||
      value.fake !== (value.source === 'fixture') || typeof value.session_id !== 'string' || value.session_id.length > 128 ||
      !integer(value.generated_unix_ms) || !integer(value.collected_monotonic_ms) ||
      !integer(value.max_age_ms) || value.max_age_ms === 0 || value.max_age_ms > 60000 || !Array.isArray(value.joints) || value.joints.length !== 15) return null;
    if (value.control_enabled && (value.source !== 'hardware' || value.connection !== 'open' || value.profile_id !== 'fd-hlsxx-bench-reference-v1')) return null;
    for (let i = 0; i < ids.length; i++) {
      const row = value.joints[i];
      if (!plain(row) || row.id !== ids[i] || row.runtime_index !== runtimes.indexOf(row.id) ||
        row.policy_index !== (row.id === 34 ? null : policies.indexOf(row.id)) ||
        !validReading(row, value)) return null;
    }
    const devices = value.unassigned_devices ?? [];
    if (!Array.isArray(devices) || devices.length > 254 || new Set(devices.map(row => row?.id)).size !== devices.length) return null;
    for (const row of devices) {
      if (!plain(row) || !integer(row.id) || row.id > 253 || ids.includes(row.id) ||
        Object.hasOwn(row, 'runtime_index') || Object.hasOwn(row, 'policy_index') || !validReading(row, value)) return null;
    }
    if (value.scan !== undefined) {
      const scan = value.scan;
      if (!plain(scan) || typeof scan.active !== 'boolean' || !integer(scan.start_id) || !integer(scan.end_id) || scan.end_id > 253 || scan.start_id > scan.end_id || !integer(scan.completed) || scan.completed > scan.end_id - scan.start_id + 1 || !Array.isArray(scan.found_ids) || scan.found_ids.length > scan.completed || new Set(scan.found_ids).size !== scan.found_ids.length || scan.found_ids.some(id => !integer(id) || id < scan.start_id || id > scan.end_id) || typeof scan.status !== 'string') return null;
    }
    return JSON.parse(JSON.stringify(value));
  }
  async function refresh(quiet = false) {
    if (!container || root.HATCHERY_BACKEND?.apiBase !== '/api/v1/maintenance') return;
    if (quiet && controller) return;
    controller?.abort(); controller = new root.AbortController();
    const ticket = ++generation, signal = controller.signal;
    const requestController = controller;
    let timedOut = false;
    const timer = root.setTimeout(() => { timedOut = true; requestController.abort(); }, 5000);
    const message = text => { const element=container?.querySelector('[data-backend-message]'); if (element) element.textContent=text; };
    if (!quiet) message('正在读取本机状态…');
    try {
      const replies = await Promise.all(['state','ports'].map(path => root.fetch('/api/v1/maintenance/' + path, { method:'GET', credentials:'same-origin', cache:'no-store', signal })));
      if (replies.some(reply => !reply.ok)) throw new Error('后端不可用或会话已失效；重新打开本机入口。');
      const texts = await Promise.all(replies.map(reply => reply.text()));
      if (texts.some(text => text.length > 524288)) throw new Error('只读回复超过限制。');
      const state = validate(JSON.parse(texts[0])), ports = JSON.parse(texts[1]);
      if (!state || !plain(ports) || !Array.isArray(ports.ports) || ports.ports.length > 256) throw new Error('协议、来源或关节映射未通过校验。');
      if (ticket !== generation || !container) return;
      frame = state; onFrame?.(state); root.ServoDevice?.update(state);
      message(`${state.port || '未连接'} · ${state.baud ?? '—'} baud · ${state.fake ? 'fake 夹具' : state.source === 'hardware' ? '硬件回读' : '未连接'} · ${state.control_enabled ? '台架控制' : '只读'}`);
    } catch (error) {
      if (ticket !== generation || !container || (error.name === 'AbortError' && !timedOut)) return;
      frame = null;
      root.ServoDevice?.update(null); onFrame?.(null);
      message('状态不可用：' + (timedOut ? '请求超时，请检查本机后端。' : error.message));
    } finally {
      root.clearTimeout(timer);
      if (ticket === generation) controller = null;
    }
  }
  function click(event) { if (event.target.closest('[data-backend-refresh]')) refresh(); }
  function mount(options) {
    unmount(); container = options?.container; onFrame = options?.onFrame || null;
    if (!container) return false;
    container.addEventListener('click',click);
    root.ServoDevice?.mount({container,refresh});
    if (root.HATCHERY_BACKEND?.readOnly === true) { refresh(); poll=root.setInterval(() => refresh(true),700); }
    return true;
  }
  function unmount() {
    generation++; controller?.abort(); controller = null;
    if (poll !== null) root.clearInterval(poll); poll=null; root.ServoDevice?.unmount();
    container?.removeEventListener('click',click); container = null; frame = null; onFrame = null;
  }
  return Object.freeze({ validate, refresh, mount, unmount, snapshot:() => ({ mounted:!!container, state:frame ? JSON.parse(JSON.stringify(frame)) : null }) });
});
