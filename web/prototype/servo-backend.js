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
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
  let container = null, controller = null, generation = 0, frame = null;
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
      value.read_only !== true || value.control_enabled !== false || value.hardware_confirmed !== false ||
      value.register_profile_confirmed !== false || value.calibration_version !== null ||
      !['disconnected','fixture','hardware'].includes(value.source) || value.simulated !== false ||
      !['disconnected','fixture','open'].includes(value.connection) ||
      (value.source === 'fixture' && value.connection !== 'fixture') ||
      (value.source === 'disconnected' && value.connection !== 'disconnected') ||
      value.fake !== (value.source === 'fixture') || typeof value.session_id !== 'string' || value.session_id.length > 128 ||
      !integer(value.generated_unix_ms) || !integer(value.collected_monotonic_ms) ||
      !integer(value.max_age_ms) || value.max_age_ms === 0 || value.max_age_ms > 60000 || !Array.isArray(value.joints) || value.joints.length !== 15) return null;
    for (let i = 0; i < ids.length; i++) {
      const row = value.joints[i];
      if (!plain(row) || row.id !== ids[i] || row.runtime_index !== runtimes.indexOf(row.id) ||
        row.policy_index !== (row.id === 34 ? null : policies.indexOf(row.id)) ||
        !validReading(row, value)) return null;
    }
    const devices = value.unassigned_devices ?? [];
    if (!Array.isArray(devices) || devices.length > 32 || new Set(devices.map(row => row?.id)).size !== devices.length) return null;
    for (const row of devices) {
      if (!plain(row) || !integer(row.id) || row.id > 253 || ids.includes(row.id) ||
        Object.hasOwn(row, 'runtime_index') || Object.hasOwn(row, 'policy_index') || !validReading(row, value)) return null;
    }
    return JSON.parse(JSON.stringify(value));
  }
  function connectionGuide(available) {
    return `<details class="servo-backend-guide" ${available ? '' : 'open'}><summary>USB 台架连接步骤 · Windows / macOS</summary><ol><li>给舵机独立供电并核对接线；在 FD1985 或其他调试程序中关闭串口。</li><li>在仓库根目录枚举串口：<code>python scripts/hatchery-maintenance.py --list-ports</code></li><li>用实际串口、ID 和波特率启动。下方示例为 COM5 / ID 1 / 1 Mbps；macOS 使用枚举到的路径，命令可用 python3。<code>python scripts/hatchery-maintenance.py --port COM5 --ids 1 --baud 1000000</code></li><li>打开 <a href="http://127.0.0.1:8088/#console/servos/maintenance">本机维护网页</a>；页面不会直接打开串口。Ctrl+C 停止后端并释放串口。</li></ol><p>目前默认只 PING，确认应答后仍需核对 HD 寄存器才能取得位置原码和角度。ID 1 单独显示，不自动绑定关节。</p></details>`;
  }
  function markup() {
    const available = root.HATCHERY_BACKEND?.readOnly === true;
    return `<section class="panel servo-backend-panel" aria-labelledby="servo-backend-title"><div class="panel-title"><h2 id="servo-backend-title">本机维护后端 · 只读</h2><button type="button" class="button secondary" data-backend-refresh ${available ? '' : 'disabled'}>刷新只读状态</button></div><p class="servo-backend-note">Radxa Zero 3W 负责整机运行；此入口用于电脑台架维护。原联调、曲线与 3D 仍使用浏览器样例，后端状态独立展示。</p><p class="servo-backend-message" data-backend-message role="status">${available ? '等待读取 robotd 状态。' : '当前为静态预览。请按下方步骤启动本机维护后端，再打开维护网页。'}</p>${connectionGuide(available)}<div data-backend-state></div><div data-backend-ports></div></section>`;
  }
  function paint(value) {
    const host = container.querySelector('[data-backend-state]');
    const label = value.source === 'fixture' ? '后端测试夹具 · fake' : value.source === 'hardware' ? (value.connection === 'open' ? '串口已打开 · 只读' : '串口已断开 · 需显式重启') : '串口未连接';
    const meta = root.JointDrafts?.metadata || [];
    const devices = value.unassigned_devices || [];
    const all = [...value.joints, ...devices];
    const fresh = row => row.received_monotonic_ms !== null && value.collected_monotonic_ms - row.received_monotonic_ms <= value.max_age_ms;
    const responses = all.filter(row => fresh(row) && ['response','fixture'].includes(row.status)).length;
    const status = row => row.status === 'missing' ? '缺测' : !fresh(row) ? '陈旧' : row.status === 'device_error' ? '设备错误' : value.source === 'fixture' ? '夹具' : '应答';
    host.innerHTML = `<div class="servo-backend-summary"><span class="badge example">${label}</span><span class="mono">${escape(value.port || '—')} / ${escape(value.baud ?? '—')} baud</span><span>有效应答 ${responses} · 控制禁用 · 实机标定未知</span><span>总线所有者 ${escape(value.bus_owner)}</span><span>快照时间 ${escape(new Date(value.generated_unix_ms).toLocaleTimeString())} · 手动刷新</span></div>${devices.length ? `<div class="servo-backend-unassigned"><h3>未分配关节的舵机</h3><p>这些 ID 尚未绑定物理关节；不会替代下方 15 关节，也不参与联调、策略或角度映射。</p><div class="servo-backend-table-scroll" tabindex="0" role="region" aria-label="未分配舵机只读诊断"><table><thead><tr><th>舵机 / ID</th><th>读取状态</th><th>设备状态 raw</th><th>主机接收时间</th><th>诊断</th></tr></thead><tbody>${devices.map(row => `<tr><th class="mono">ID ${row.id}</th><td>${status(row)}</td><td class="mono">${fresh(row) ? escape(row.device_error ?? '—') : '—'}</td><td class="mono">${row.received_unix_ms === null ? '—' : escape(new Date(row.received_unix_ms).toLocaleTimeString())}</td><td>${row.status === 'missing' ? escape(row.reason) : row.raw_bytes?.length === 0 ? 'PING 回复 · 不含位置数据' : '参考窗口回复 · HD 寄存器未确认'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}<div class="servo-backend-table-scroll" tabindex="0" role="region" aria-label="15 关节原始诊断只读表"><table><thead><tr><th>关节 / ID</th><th>读取状态</th><th>位置 raw</th><th>目标 raw</th><th>速度 raw</th><th>raw load</th><th>电流 raw</th><th>原始字节</th></tr></thead><tbody>${value.joints.map(row => {
      const data = row.decoded_reference;
      const age = row.received_monotonic_ms === null ? null : value.collected_monotonic_ms - row.received_monotonic_ms;
      const missing = age === null || age > value.max_age_ms || row.status === 'missing' || row.status === 'device_error';
      const words = key => !missing && data ? escape(data[key]) : '—';
      const name = meta.find(j => j.id === row.id)?.name || row.id;
      return `<tr><th title="${escape(row.reason)}">${escape(name)} <span class="mono">#${row.id}</span></th><td>${row.status === 'missing' ? '缺测' : row.status === 'device_error' ? '设备错误' : age > value.max_age_ms ? '陈旧' : value.source === 'fixture' ? '夹具' : '应答'}</td>${['position_raw','goal_raw','speed_raw','load_raw','current_raw'].map(key => `<td class="mono">${words(key)}</td>`).join('')}<td class="mono">${row.raw_bytes?.map(n => n.toString(16).padStart(2,'0')).join(' ') || '—'}</td></tr>`;
    }).join('')}</tbody></table></div><p class="servo-backend-note">raw 字段仅按冻结 SCS 参考解释，HD 固件 / 寄存器 / 单位尚未确认；不换算电流、速度或真实角度。时间为主机读取完成时间，不是舵机内置采样时钟。</p>`;
  }
  async function refresh() {
    if (!container || root.HATCHERY_BACKEND?.apiBase !== '/api/v1/maintenance') return;
    controller?.abort(); controller = new root.AbortController();
    const ticket = ++generation, signal = controller.signal;
    const requestController = controller;
    let timedOut = false;
    const timer = root.setTimeout(() => { timedOut = true; requestController.abort(); }, 5000);
    const message = container.querySelector('[data-backend-message]');
    message.textContent = '正在读取本机只读状态…';
    try {
      const replies = await Promise.all(['state','ports'].map(path => root.fetch('/api/v1/maintenance/' + path, { method:'GET', credentials:'same-origin', cache:'no-store', signal })));
      if (replies.some(reply => !reply.ok)) throw new Error('后端不可用或会话已失效；重新打开本机入口。');
      const texts = await Promise.all(replies.map(reply => reply.text()));
      if (texts.some(text => text.length > 65536)) throw new Error('只读回复超过限制。');
      const state = validate(JSON.parse(texts[0])), ports = JSON.parse(texts[1]);
      if (!state || !plain(ports) || !Array.isArray(ports.ports) || ports.ports.length > 256) throw new Error('协议、来源或关节映射未通过校验。');
      if (ticket !== generation || !container) return;
      frame = state; paint(state);
      message.textContent = '已取得 robotd 只读快照；刷新不会打开串口或发送目标。';
      container.querySelector('[data-backend-ports]').innerHTML = `<details class="servo-backend-ports"><summary>本机串口 ${ports.ports.length} 个 · 仅枚举，未打开</summary>${ports.ports.map(port => `<p class="mono">${escape(port.path)} ${port.usb ? `VID ${escape(port.usb.vid)} / PID ${escape(port.usb.pid)} · ${escape(port.usb.product)}` : ''}</p>`).join('')}<p>${escape(ports.error || 'FE-URT2 的身份与实际接线需核对；此处不自动连接。')}</p></details>`;
    } catch (error) {
      if (ticket !== generation || !container || (error.name === 'AbortError' && !timedOut)) return;
      frame = null; container.querySelector('[data-backend-state]').innerHTML = '';
      container.querySelector('[data-backend-ports]').innerHTML = '';
      message.textContent = '只读状态不可用：' + (timedOut ? '请求超时，请检查本机后端。' : error.message);
    } finally {
      root.clearTimeout(timer);
    }
  }
  function click(event) { if (event.target.closest('[data-backend-refresh]')) refresh(); }
  function mount(options) {
    unmount(); container = options?.container;
    if (!container) return false;
    container.addEventListener('click',click);
    if (root.HATCHERY_BACKEND?.readOnly === true) refresh();
    return true;
  }
  function unmount() {
    generation++; controller?.abort(); controller = null;
    container?.removeEventListener('click',click); container = null; frame = null;
  }
  return Object.freeze({ render:markup, validate, mount, unmount, snapshot:() => ({ mounted:!!container, state:frame ? JSON.parse(JSON.stringify(frame)) : null }) });
});
