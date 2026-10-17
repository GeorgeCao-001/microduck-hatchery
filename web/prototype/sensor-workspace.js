(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SensorWorkspace = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  // Owns sensor display only. Samples and media frames have independent sources.
  let host = null, timer = null, state = 'example', startedAt = 0;
  let history = [], frozen = null, paused = false;
  let zoneIndex = 27, unit = 'mm', channel = 'gravity';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const number = (value, digits = 2) => finite(value) ? value.toFixed(digits) : '—';
  const put = (key, value) => { const node = host?.querySelector('[data-sensor-' + key + ']'); if (node) node.textContent = value; };
  const sampleState = () => ['example', 'readonly'].includes(state);
  const sourceText = () => state === 'offline' ? '尚无遥测' : state === 'stale' ? '陈旧样例' : paused ? '样例已暂停' : '浏览器样例';

  function render() {
    return `<div class="sensor-workspace">
      <div class="sensor-page-heading"><div><h2>传感器观察</h2><p>姿态、距离与画面，各自保留来源和有效性。</p></div><button type="button" class="button secondary" data-sensor-pause>暂停样例显示</button></div>
      <div class="sensor-grid">
        <section class="panel sensor-card sensor-camera" aria-labelledby="sensor-camera-title">
          <header class="sensor-card-header"><div><span class="sensor-number">01</span><h3 id="sensor-camera-title">摄像头</h3></div><span class="badge draft" data-camera-source>尚无画面</span></header>
          <div class="sensor-camera-layout" data-sensor-camera>
            <div class="sensor-camera-stage"><img data-camera-image hidden alt="板端媒体服务最近一次快照"><div class="sensor-camera-empty" data-camera-empty><svg viewBox="0 0 240 130" aria-hidden="true"><path d="M32 46V24h34m108 0h34v22m0 38v22h-34m-108 0H32V84" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="120" cy="65" r="24" fill="none" stroke="currentColor"/><path d="M120 31v14m0 40v14M86 65h14m40 0h14" stroke="currentColor"/></svg><strong>相机未连接</strong><p>连接板端媒体服务查看画面。</p></div></div>
            <div class="sensor-camera-controls"><label for="sensor-camera-address">媒体服务</label><div class="camera-address-row"><input id="sensor-camera-address" data-camera-address type="url" placeholder="http://&lt;Radxa地址&gt;:8080" autocomplete="off" spellcheck="false"><button type="button" class="button primary" data-camera-connect>连接</button></div><div class="sensor-camera-actions"><button type="button" class="button secondary" data-camera-pause disabled>暂停</button><button type="button" class="button secondary" data-camera-capture disabled>快照</button></div><p class="sensor-camera-status" data-camera-status role="status">相机未连接</p><div class="camera-capture-info" aria-label="采集信息，只读"><span data-camera-fps title="配置的采集帧率，非浏览器刷新率">— FPS</span><span data-camera-capture-size>— × —</span><span data-camera-mode>—</span></div><div data-camera-tuning>${root.CameraParameters?.render()||''}</div></div>
          </div>
        </section>
        <div class="sensor-telemetry">
        <section class="panel sensor-card sensor-imu" aria-labelledby="sensor-imu-title">
          <header class="sensor-card-header"><div><span class="sensor-number">02</span><h3 id="sensor-imu-title">IMU · 姿态与运动</h3></div><span class="badge example" data-sensor-source>浏览器样例</span></header>
          <div class="sensor-card-body">
            <div class="sensor-attitude-row"><div class="sensor-attitude" data-sensor-attitude></div><div class="sensor-angles">${['roll', 'pitch', 'yaw'].map(key => `<div><span>${key[0].toUpperCase() + key.slice(1)}</span><strong class="mono" data-sensor-${key}>—</strong><small>°</small></div>`).join('')}<p>安装方向未确认<br><span data-sensor-coordinate>当前为传感器坐标样例</span></p></div></div>
            <div class="sensor-plot-toolbar"><label>观察量 <select data-sensor-channel><option value="gravity" ${channel === 'gravity' ? 'selected' : ''}>Gravity XYZ · 单位向量</option><option value="gyro" ${channel === 'gyro' ? 'selected' : ''}>Gyro XYZ · rad/s</option></select></label><span class="mono" data-sensor-time>—</span></div>
            <div class="sensor-plot" data-sensor-plot></div><div class="sensor-plot-legend"><span><i class="axis-x"></i>X</span><span><i class="axis-y"></i>Y</span><span><i class="axis-z"></i>Z</span><span data-sensor-window>样例相对时间 · 最近 60 s</span></div>
            <details class="sensor-raw"><summary>原始观察量与四元数</summary><dl><div><dt>Gravity XYZ · 单位向量</dt><dd class="mono" data-sensor-gravity>—</dd></div><div><dt>Gyro XYZ · rad/s</dt><dd class="mono" data-sensor-gyro>—</dd></div><div><dt>Quaternion · w x y z</dt><dd class="mono" data-sensor-quat>—</dd></div></dl></details>
          </div><footer class="sensor-card-footer">选型 LSM6DSV16X · 真实 IMU 尚未接入；安装方向读取后续确认的配置。</footer>
        </section>
        <section class="panel sensor-card sensor-tof" aria-labelledby="sensor-tof-title">
          <header class="sensor-card-header"><div><span class="sensor-number">03</span><h3 id="sensor-tof-title">ToF · 距离分区</h3></div><span class="badge example" data-sensor-source>浏览器样例</span></header>
          <div class="sensor-card-body">
            <div class="sensor-distance-summary"><div><span>最近有效距离</span><strong class="mono" data-sensor-nearest>—</strong><small data-sensor-unit>${unit}</small></div><div><span>中心有效均值</span><strong class="mono" data-sensor-center>—</strong><small data-sensor-unit>${unit}</small></div><div><span>有效分区</span><strong class="mono" data-sensor-valid>—</strong></div></div>
            <div class="sensor-tof-field">
            <div class="sensor-tof-toolbar"><span data-sensor-geometry>8 × 8 样例 · 点击分区查看</span><div class="sensor-unit-switch" role="group" aria-label="距离显示单位"><button type="button" data-sensor-unit-choice="mm" aria-pressed="${unit === 'mm'}">mm</button><button type="button" data-sensor-unit-choice="cm" aria-pressed="${unit === 'cm'}">cm</button></div></div>
            <div class="sensor-tof-grid" data-sensor-grid role="group" aria-label="ToF 距离分区"></div>
            <div class="sensor-depth-scale"><span>近 · 0 m</span><i></i><span>远 · 4 m</span></div>
            </div>
            <div class="sensor-zone-detail"><strong data-sensor-zone-title>分区 —</strong><span class="mono" data-sensor-zone-distance>—</span><span data-sensor-zone-state>尚无数据</span><small class="mono" data-sensor-zone-raw>status raw —</small></div>
          </div><footer class="sensor-card-footer">选型 VL53L5X · 无效与无回波分区保留缺测；网格尺寸、距离及状态以未来板端帧为准。</footer>
        </section>
        </div>
      </div>
    </div>`;
  }

  function initialize(nextState) {
    state = nextState || 'example'; startedAt = root.performance.now(); paused = false; frozen = null;
    history = state === 'offline' ? [] : Array.from({ length: 41 }, (_, i) => root.SensorData.sample(i * .5));
  }
  const displayHistory = () => frozen || history;
  const frame = () => displayHistory().at(-1) || null;

  function attitudeMarkup(imu) {
    const available = finite(imu?.roll) && finite(imu?.pitch);
    const roll = available ? imu.roll : 0, pitch = available ? Math.max(-35, Math.min(35, imu.pitch)) : 0;
    const ticks = [-60, -45, -30, -15, 0, 15, 30, 45, 60].map(angle => `<path d="M80 10v${angle % 30 === 0 ? 7 : 4}" transform="rotate(${angle} 80 80)" stroke="var(--muted)" stroke-width="1.2"/>`).join('');
    const ladder = [-20, -10, 10, 20].map(angle => `<path d="M${angle % 20 === 0 ? 65 : 70} ${80 - angle * 1.3}h${angle % 20 === 0 ? 30 : 20}" stroke="var(--moss)" opacity=".45"/>`).join('');
    return `<svg viewBox="0 0 160 160" role="img" aria-label="${available ? 'Roll / Pitch 样例姿态仪，安装方向未确认' : '姿态缺测'}"><defs><clipPath id="sensor-horizon-clip"><circle cx="80" cy="80" r="56"/></clipPath></defs><circle cx="80" cy="80" r="74" fill="var(--surface)" stroke="var(--line)"/>${ticks}<g clip-path="url(#sensor-horizon-clip)" opacity="${available ? 1 : .25}"><g transform="rotate(${-roll} 80 80)"><g transform="translate(0 ${pitch * 1.3})"><path d="M-40-40H200V80H-40Z" fill="var(--paper)"/><path d="M-40 80H200V200H-40Z" fill="#e7ede1"/><path d="M-40 80H200" stroke="var(--moss)" stroke-width="2"/>${ladder}</g></g></g><circle cx="80" cy="80" r="56" fill="none" stroke="var(--line)"/><path d="M80 17l-4 7h8Z" fill="var(--moss)"/>${available ? '<path d="M46 80h21l7 5h12l7-5h21" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/><circle cx="80" cy="80" r="2" fill="var(--ink)"/>' : '<text x="80" y="85" text-anchor="middle">—</text>'}</svg>`;
  }

  function plotMarkup(frames) {
    if (!frames.length) return '<div class="sensor-chart-empty">尚无 IMU 数据</div>';
    const end = frames.at(-1).t, start = Math.max(0, end - 60), min = channel === 'gyro' ? -.025 : -1.15, max = channel === 'gyro' ? .025 : 1.15;
    const x = t => 48 + (t - start) / Math.max(1, end - start) * 520, y = value => 108 - (value - min) / (max - min) * 88;
    const colors = ['var(--moss)', '#a2711c', '#286879'];
    const grid = [min, 0, max].map(v => `<path d="M48 ${y(v)}H568" stroke="var(--line)"/><text x="40" y="${y(v) + 4}" text-anchor="end">${number(v, channel === 'gyro' ? 3 : 2)}</text>`).join('');
    const paths = [0, 1, 2].map(axis => {
      const points = frames.filter(f => f.t >= start).map(f => ({ t: f.t, value: f.imu[channel][axis] }));
      return `<path d="${root.JointCharts.pathFor(points, x, y, 1.1)}" stroke="${colors[axis]}" stroke-width="2.4" fill="none"/>`;
    }).join('');
    return `<svg viewBox="0 0 592 132" preserveAspectRatio="none" role="img" aria-label="${channel === 'gyro' ? 'Gyro rad/s' : 'Gravity 单位向量'} XYZ 样例曲线">${grid}${paths}<text x="48" y="128">${number(start, 0)} s</text><text x="568" y="128" text-anchor="end">${number(end, 0)} s</text></svg>`;
  }

  function paintTof(tof) {
    const grid = host.querySelector('[data-sensor-grid]');
    grid.dataset.displayUnit = unit;
    const rows = tof?.rows || 8, cols = tof?.cols || 8, count = rows * cols;
    if (grid.children.length !== count) {
      grid.style.setProperty('--tof-cols', cols);
      grid.innerHTML = Array.from({ length: count }, (_, i) => `<button type="button" data-sensor-zone="${i}" aria-pressed="false">—</button>`).join('');
    }
    zoneIndex = Math.min(zoneIndex, count - 1);
    const summary = root.SensorData.tofSummary(tof);
    put('nearest', root.SensorData.distance(summary.nearest, unit)); put('center', root.SensorData.distance(summary.center, unit));
    put('valid', tof ? `${summary.valid} / ${summary.total}` : '—');
    put('geometry', tof ? `${rows} × ${cols} 样例 · 帧 ${tof.seq}` : '尚无距离帧 · 8 × 8 占位');
    host.querySelectorAll('[data-sensor-unit]').forEach(node => { node.textContent = unit; });
    host.querySelectorAll('[data-sensor-unit-choice]').forEach(node => node.setAttribute('aria-pressed', node.dataset.sensorUnitChoice === unit));
    Array.from(grid.children).forEach((button, i) => {
      const zone = tof?.zones[i], valid = zone?.kind === 'valid' && finite(zone.distanceMm) && zone.distanceMm >= 0;
      const ratio = valid ? Math.max(0, Math.min(1, zone.distanceMm / 4000)) : 0;
      button.textContent = valid ? root.SensorData.distance(zone.distanceMm, unit) : '—';
      button.classList.toggle('missing', !valid); button.setAttribute('aria-pressed', i === zoneIndex);
      button.style.backgroundColor = valid ? `hsl(${43 + ratio * 90} 38% ${85 - ratio * 28}%)` : '';
      button.setAttribute('aria-label', `第 ${Math.floor(i / cols) + 1} 行，第 ${i % cols + 1} 列，${valid ? button.textContent + ' ' + unit : zone?.kind === 'no-return' ? '无回波' : '缺测'}`);
    });
    const selected = tof?.zones[zoneIndex], valid = selected?.kind === 'valid' && finite(selected.distanceMm) && selected.distanceMm >= 0;
    put('zone-title', `R${Math.floor(zoneIndex / cols) + 1} · C${zoneIndex % cols + 1}`);
    put('zone-distance', valid ? `${root.SensorData.distance(selected.distanceMm, unit)} ${unit}` : '—');
    put('zone-state', !selected ? '尚无数据' : valid ? '有效 · 样例' : selected.kind === 'no-return' ? '无回波 · 样例' : '无效 · 样例');
    put('zone-raw', `status raw ${selected?.statusRaw ?? '—'}`);
  }

  function paint() {
    if (!host) return;
    const current = frame(), imu = current?.imu;
    host.querySelectorAll('[data-sensor-source]').forEach(node => { node.textContent = sourceText(); node.className = 'badge ' + (state === 'offline' ? 'draft' : state === 'stale' ? 'stale' : 'example'); });
    const pause = host.querySelector('[data-sensor-pause]'); pause.disabled = !sampleState(); pause.textContent = paused ? '继续样例显示' : '暂停样例显示';
    ['roll', 'pitch', 'yaw'].forEach(key => put(key, number(imu?.[key], 1)));
    put('coordinate', imu ? '当前为传感器坐标样例' : '尚无坐标反馈');
    ['gravity', 'gyro', 'quat'].forEach(key => put(key, imu ? imu[key].map(v => number(v, 3)).join(' / ') : '—'));
    put('time', current ? `${number(current.t, 1)} s · 相对时间` : '—');
    host.querySelector('[data-sensor-attitude]').innerHTML = attitudeMarkup(imu);
    host.querySelector('[data-sensor-plot]').innerHTML = plotMarkup(displayHistory());
    paintTof(current?.tof);
  }

  function click(event) {
    const button = event.target.closest('button'); if (!button || button.disabled || !host?.contains(button)) return;
    if (button.matches('[data-sensor-pause]')) { paused = !paused; frozen = paused ? history.slice() : null; }
    else if (button.matches('[data-sensor-zone]')) zoneIndex = Number(button.dataset.sensorZone);
    else if (button.matches('[data-sensor-unit-choice]')) unit = button.dataset.sensorUnitChoice;
    else return;
    paint();
  }
  function change(event) {
    if (event.target.matches('[data-sensor-channel]')) { channel = event.target.value; paint(); }
  }
  function mount(options) {
    unmount(); host = options?.container; if (!host) return false;
    initialize(options.state); host.addEventListener('click', click); host.addEventListener('change', change);
    root.SensorCamera.mount({ container: host }); paint();
    timer = root.setInterval(() => {
      if (!sampleState()) return;
      history.push(root.SensorData.sample(20 + (root.performance.now() - startedAt) / 1000));
      if (history.length > 121) history.shift();
      if (!paused) paint();
    }, 500);
    return true;
  }
  function setContext(options) {
    if (!host || !options?.state || state === options.state) return;
    initialize(options.state); paint();
  }
  function unmount() {
    if (timer !== null) root.clearInterval(timer); timer = null;
    root.SensorCamera.unmount(); host?.removeEventListener('click', click); host?.removeEventListener('change', change);
    host = null; history = []; frozen = null; paused = false;
  }
  return Object.freeze({ render, mount, setContext, unmount, snapshot: () => ({ mounted: !!host, state, paused, zoneIndex, unit, channel, historyLength: history.length, displayTime: frame()?.t ?? null }) });
});
