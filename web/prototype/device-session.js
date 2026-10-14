(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeviceSession = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  // One same-origin, read-only host session for the entire console.
  let data = null, status = 'idle', error = '', timer = null, controller = null, generation = 0;
  let receivedAt = null, receivedMono = null;
  const listeners = new Set();
  const text = v => typeof v === 'string' && v.length <= 512;
  const optionalText = v => v === null || text(v);
  const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const optionalNumber = v => v === null || number(v);
  const plain = v => v && typeof v === 'object' && !Array.isArray(v);
  function validate(v) {
    if (!plain(v) || v.protocol_version !== 'hatchery-device/1' || v.source !== 'host-system' || !Number.isSafeInteger(v.generated_unix_ms) || v.generated_unix_ms < 0) return null;
    const id = v.identity, s = v.system, service = v.service;
    if (!plain(id) || !['id','name','hostname','model','kernel'].every(k => optionalText(id[k])) || !text(id.id_source) || !text(id.os) || !text(id.architecture)) return null;
    if (!plain(s) || !['cpu_percent','load_one','memory_total_bytes','memory_available_bytes','uptime_seconds','hottest_zone_celsius'].every(k => optionalNumber(s[k])) || (s.cpu_percent !== null && s.cpu_percent > 100) || (s.memory_total_bytes !== null && s.memory_available_bytes !== null && s.memory_available_bytes > s.memory_total_bytes)) return null;
    if (!plain(service) || !text(service.name) || !text(service.version) || !text(service.bus_owner) || !['fixture','hardware','disconnected'].includes(service.servo_source) || !['fixture','open','disconnected'].includes(service.servo_connection) || service.servo_fake !== (service.servo_source === 'fixture') || typeof service.control_enabled !== 'boolean' || !optionalText(service.serial_port) || !optionalNumber(service.baud)) return null;
    if ((service.servo_source === 'fixture' && service.servo_connection !== 'fixture') || (service.control_enabled && (service.servo_source !== 'hardware' || service.servo_connection !== 'open'))) return null;
    if (v.interfaces !== null && (!Array.isArray(v.interfaces) || v.interfaces.length > 64 || v.interfaces.some(n => !plain(n) || !text(n.name) || !['wifi','usb-network','network','loopback'].includes(n.kind) || !text(n.state) || (n.carrier !== null && typeof n.carrier !== 'boolean') || (n.addresses !== null && (!Array.isArray(n.addresses) || n.addresses.length > 16 || !n.addresses.every(text)))))) return null;
    if (v.bluetooth !== null && (!Array.isArray(v.bluetooth) || v.bluetooth.length > 16 || v.bluetooth.some(n => !plain(n) || !text(n.name) || !optionalText(n.address) || (n.blocked !== null && typeof n.blocked !== 'boolean')))) return null;
    return JSON.parse(JSON.stringify(v));
  }
  const available = () => root.HATCHERY_BACKEND?.apiBase === '/api/v1/maintenance' && root.HATCHERY_BACKEND?.readOnly === true;
  function snapshot() {
    const fresh = status === 'online' && receivedMono !== null && root.performance.now() - receivedMono <= 6000;
    return { data: data ? JSON.parse(JSON.stringify(data)) : null, status: status === 'online' && !fresh ? 'stale' : status, fresh, error, receivedAt, available: available() };
  }
  function emit() { const view = snapshot(); listeners.forEach(fn => fn(view)); }
  async function refresh() {
    if (!available() || controller) return;
    const ticket = generation, request = new root.AbortController(); controller = request;
    const timeout = root.setTimeout(() => request.abort(), 4500);
    if (!data) { status = 'connecting'; emit(); }
    try {
      const reply = await root.fetch('/api/v1/maintenance/device', { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: request.signal });
      if (!reply.ok) throw new Error(reply.status === 404 ? '当前后端缺少设备接口，请更新代码并重新编译。' : reply.status === 401 ? '会话已失效，请刷新网页重新建立会话。' : '设备后端暂不可用。');
      const body = await reply.text();
      if (body.length > 131072) throw new Error('设备回复超过限制。');
      const next = validate(JSON.parse(body));
      if (!next) throw new Error('设备协议或数据来源校验失败。');
      if (ticket !== generation) return;
      data = next; status = 'online'; error = ''; receivedAt = Date.now(); receivedMono = root.performance.now();
    } catch (failure) {
      if (ticket !== generation) return;
      status = data ? 'stale' : 'offline'; error = failure.name === 'AbortError' ? '设备请求超时。' : failure.message;
    } finally {
      root.clearTimeout(timeout);
      if (ticket === generation) { controller = null; emit(); }
    }
  }
  function start() {
    if (timer !== null) { emit(); return; }
    if (!available()) { status = 'static'; emit(); return; }
    refresh(); timer = root.setInterval(() => { emit(); refresh(); }, 2000);
  }
  function stop() {
    generation++; controller?.abort(); controller = null;
    if (timer !== null) root.clearInterval(timer); timer = null;
    data = null; receivedAt = null; receivedMono = null; status = 'idle'; error = '';
  }
  function subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); }
  return Object.freeze({ validate, start, stop, refresh, subscribe, snapshot });
});
