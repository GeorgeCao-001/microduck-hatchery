(function (root, factory) {
  'use strict';
  const commonJS = typeof module === 'object' && module.exports;
  const profile = commonJS ? require('./servo-profile.js') : root.ServoProfile;
  const joints = commonJS ? require('./joint-drafts.js') : root.JointDrafts;
  const api = factory(root, profile, joints);
  if (commonJS) module.exports = api;
  else root.ServoParameters = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root, profile, joints) {
  'use strict';

  // This store is a local review draft. It never supplies device or viewer state.
  const store = profile.createDraftStore(joints.metadata);
  const groupLabels = { identity: '身份与通信', output: '模式与输出', control: '控制系数', protection: '保护参数' };
  const calibrationFields = [
    ['zeroCounts', '参考位置', 'counts', '1'],
    ['referenceDeg', '参考姿态角', '°', 'any'],
    ['direction', '机械方向', '', '1'],
    ['minDeg', '机械最小角', '°', 'any'],
    ['maxDeg', '机械最大角', '°', 'any']
  ];
  const referenceOptions = Object.freeze({ profileId: profile.hd1910.id, unit: 'counts', singleTurn: true, resolutionConfirmed: true, countReference: 'default-single-turn' });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const numberText = value => finite(value) ? String(Number(value.toFixed(6))) : '—';
  let container = null, context = null, tab = 'parameters', selectedJoint = 23;
  let counts = 2048, range = 'all', notice = '草稿只保存在当前页面会话中，重新加载会清空；导出 JSON 可保存待审查内容。';
  const batchFieldsBySection = { parameters: new Set(), calibration: new Set() };
  let batchFields = batchFieldsBySection.parameters, batchPreview = null, reviewedBatch = null, fileGeneration = 0;

  function jointFor(id) { return joints.metadata.find(joint => joint.id === Number(id)) || joints.metadata[0]; }
  function activeId(options) { return jointFor(options?.jointId ?? selectedJoint).id; }
  function draftFor(id) { return store.get(id); }
  function ready(calibration) { return profile.calibrationPreview(2048, calibration, referenceOptions).valid; }
  function countFields(row) { return profile.fields.filter(field => row.parameters[field.key] != null).length; }
  function fieldLabel(key) {
    return profile.fields.find(field => field.key === key)?.label || calibrationFields.find(field => field[0] === key)?.[1] || key;
  }

  function formatChange(change) {
    return `${escape(fieldLabel(change.field))} ${numberText(change.before)} → ${numberText(change.after)}`;
  }

  function headerMarkup() {
    const complete = store.list().filter(row => ready(row.calibration)).length;
    return `<section class="panel servo-profile-card" aria-labelledby="servo-parameters-title">
      <div class="servo-parameters-heading"><div><span class="eyebrow">SERVO PARAMETERS</span><h2 id="servo-parameters-title">参数与标定</h2><p>HD-1910-C001 · 15 个物理关节</p></div><div class="servo-profile-badges"><span class="badge offline">设备未连接</span><span class="badge draft">实机标定 0 / 15</span></div></div>
      <dl class="servo-profile-facts"><div><dt>规格默认分辨率</dt><dd>4096 <small>counts / rev</small></dd></div><div><dt>参考换算比例</dt><dd>0.087890625 <small>° / count</small></dd></div><div><dt>固件 / 寄存器 profile</dt><dd>待回读核实</dd></div><div><dt>完整软件标定草稿</dt><dd data-servo-ready-count>${complete} / 15 <small>未实机确认</small></dd></div></dl>
      <p class="servo-profile-note">规格确认换算比例；2048 是编码器中位。装机零位、机械方向与限位需逐关节核对，参数初值不会自动填入。</p>
    </section>`;
  }

  function scopeMarkup() {
    return `<div class="servo-parameters-tools"><div class="servo-parameters-tabs" role="tablist" aria-label="参数与标定页面">
      <button type="button" id="servo-tab-parameters" role="tab" data-servo-tab="parameters" aria-controls="servo-parameters-body" aria-selected="${tab === 'parameters'}" tabindex="${tab === 'parameters' ? 0 : -1}">参数草稿</button><button type="button" id="servo-tab-calibration" role="tab" data-servo-tab="calibration" aria-controls="servo-parameters-body" aria-selected="${tab === 'calibration'}" tabindex="${tab === 'calibration' ? 0 : -1}">软件标定</button>
      </div><div class="servo-file-actions"><button type="button" class="button secondary" data-servo-import>导入草稿</button><button type="button" class="button secondary" data-servo-export>导出 JSON</button><input type="file" data-servo-file accept=".json,application/json" hidden></div></div>
      <section class="panel servo-scope-panel" aria-label="参数批量范围"><div><strong>批量范围</strong><span>独立于联调目标范围</span></div><div class="servo-scope-buttons" role="group" aria-label="选择批量关节">${[['all', '全部'], ['left', '左腿'], ['right', '右腿'], ['head', '头颈与嘴部'], ['custom', '自定义']].map(([key, name]) => `<button type="button" data-servo-range="${key}" aria-pressed="${range === key}">${name}</button>`).join('')}</div><span data-servo-selection-count>已选 ${store.selectedIds().length} / 15</span><button type="button" data-servo-clear class="servo-text-button">清空选择</button></section>`;
  }

  function ledgerMarkup() {
    const selected = new Set(store.selectedIds());
    const cal = tab === 'calibration';
    return `<section class="panel servo-ledger-panel" aria-labelledby="servo-ledger-title"><div class="servo-section-heading"><h3 id="servo-ledger-title">${cal ? '软件标定草稿' : '关节参数草稿'}</h3><span>设备回读均待获取</span></div><div class="servo-ledger-scroll" tabindex="0" role="region" aria-label="15 个关节草稿表，可横向滚动"><table class="servo-ledger"><thead><tr><th scope="col">范围</th><th scope="col">关节 / ID</th>${cal ? '<th scope="col">参考 counts</th><th scope="col">参考 °</th><th scope="col">方向</th><th scope="col">最小 °</th><th scope="col">最大 °</th><th scope="col">草稿状态</th>' : '<th scope="col">设备值</th><th scope="col">已填字段</th><th scope="col">草稿状态</th>'}</tr></thead><tbody>${joints.metadata.map(joint => {
      const row = draftFor(joint.id), calibrated = ready(row.calibration);
      return `<tr data-servo-row="${joint.id}" class="${joint.id === selectedJoint ? 'selected' : ''}"><td><input id="servo-scope-${joint.id}" type="checkbox" data-servo-select="${joint.id}" ${selected.has(joint.id) ? 'checked' : ''} aria-label="将 ${escape(joint.name)} #${joint.id} 纳入批量范围"></td><th scope="row"><button type="button" data-servo-joint="${joint.id}" aria-pressed="${joint.id === selectedJoint}" title="${escape(joint.raw)}"><span class="servo-joint-id">${joint.id}</span><strong>${escape(joint.name)}</strong></button></th>${cal ? `<td>${numberText(row.calibration.zeroCounts)}</td><td>${numberText(row.calibration.referenceDeg)}</td><td>${row.calibration.direction === 1 ? '+1' : row.calibration.direction === -1 ? '−1' : '—'}</td><td>${numberText(row.calibration.minDeg)}</td><td>${numberText(row.calibration.maxDeg)}</td><td><span class="servo-draft-status">${calibrated ? '完整草稿' : '待补齐'}</span></td>` : `<td>—</td><td>${countFields(row)} / ${profile.fields.length}</td><td><span class="servo-draft-status">${countFields(row) ? '本地草稿' : '未填写'}</span></td>`}</tr>`;
    }).join('')}</tbody></table></div><p class="servo-ledger-note">左腿 → 右腿 → 头颈与嘴部。勾选范围与查看详情分别操作，全部 15 个关节保留。</p></section>`;
  }

  function parameterFieldMarkup(field, row) {
    const key = field.key;
    return `<div class="servo-parameter-field"><div><label for="servo-field-${key}">${escape(field.label)}</label><span>${escape(field.unit || 'raw')} · 寄存器范围待核实</span></div><div class="servo-readback"><span>设备回读</span><strong>—</strong></div><label class="servo-draft-input"><span class="visually-hidden">${escape(field.label)}本地草稿</span><input id="servo-field-${key}" type="number" inputmode="numeric" step="1" value="${escape(row.parameters[key])}" placeholder="未填写" data-servo-parameter="${key}" aria-label="${escape(field.label)}本地草稿"></label><label class="servo-batch-check"><input id="servo-batch-${key}" type="checkbox" data-servo-batch-field="${key}" ${batchFields.has(key) ? 'checked' : ''}>批量</label></div>`;
  }

  function parameterEditorMarkup(joint, row) {
    return `<div class="servo-editor-fields"><div class="servo-editor-intro"><h4>本地参数草稿</h4><p>填写不写入设备；raw 字段的地址、单位与有效范围仍需按型号和固件确认。</p></div>${Object.keys(groupLabels).map(group => {
      const fields = profile.fields.filter(field => (['operatingMode', 'resolution'].includes(field.key) ? 'output' : field.group) === group);
      return fields.length ? `<fieldset class="servo-parameter-group"><legend>${groupLabels[group]}</legend>${fields.map(field => parameterFieldMarkup(field, row)).join('')}</fieldset>` : '';
    }).join('')}<div class="servo-disabled-actions"><button type="button" class="button secondary" disabled title="权威串口后端尚未接通">回读设备参数</button><button type="button" class="button primary" disabled title="需核实当前固件寄存器、控制权和写入确认">写入设备参数</button><span>待权威后端、型号寄存器与逐项确认接通。</span></div></div>`;
  }

  function calibrationFieldMarkup(field, calibration) {
    const [key, label, unit, step] = field;
    const value = calibration[key];
    const input = key === 'direction' ? `<select id="servo-field-${key}" data-servo-calibration="${key}" aria-label="机械方向本地草稿"><option value="" ${value == null ? 'selected' : ''}>待确认</option><option value="1" ${value === 1 ? 'selected' : ''}>同向 +1</option><option value="-1" ${value === -1 ? 'selected' : ''}>反向 −1</option></select>` : `<input id="servo-field-${key}" type="number" step="${step}" value="${escape(value)}" placeholder="未填写" data-servo-calibration="${key}" aria-label="${label}本地草稿">`;
    return `<div class="servo-calibration-field"><label for="servo-field-${key}">${label}${unit ? ` <small>${unit}</small>` : ''}</label>${input}<label class="servo-batch-check"><input id="servo-batch-${key}" type="checkbox" data-servo-batch-field="${key}" ${batchFields.has(key) ? 'checked' : ''}>纳入批量草稿</label></div>`;
  }

  function calculatorMarkup(row) {
    const reference = profile.referencePosition(counts, referenceOptions);
    const preview = profile.calibrationPreview(counts, row.calibration, referenceOptions);
    return `<section class="servo-calculator" aria-labelledby="servo-calculator-title"><div><h4 id="servo-calculator-title">手动角度预览</h4><span class="badge example">非测量 · 单圈规格测试</span></div><p>输入 counts 仅用于检查公式，默认 2048 不代表设备位置；此处采用规格默认分辨率。</p><div class="servo-calculator-input"><label for="servo-preview-counts">测试位置 <small>counts</small></label><input id="servo-preview-counts" data-servo-counts type="number" min="0" max="4095" step="1" value="${escape(counts)}"><span>单圈 0–4095</span></div><dl class="servo-calculator-values"><div><dt>编码器参考角</dt><dd data-servo-encoder-angle>${reference.valid ? numberText(reference.encoderDeg) + '°' : '—'}</dd></div><div><dt>编码器中位参考角</dt><dd data-servo-center-angle>${reference.valid ? numberText(reference.centerDeg) + '°' : '—'}</dd></div><div><dt>草稿关节角</dt><dd data-servo-draft-angle>${preview.valid ? numberText(preview.angleDeg) + '°' : '—'}</dd></div></dl><p class="servo-preview-reason" data-servo-preview-reason>${escape(reference.valid ? preview.valid ? preview.inRange ? '按完整本地草稿换算，未实机确认。' : '草稿预览角超出填写的机械限位；没有裁剪或执行。' : preview.reason : reference.reason)}</p><code>q = reference° + direction × (counts − zeroCounts) × 360 / 4096</code></section>`;
  }

  function calibrationEditorMarkup(joint, row) {
    return `<div class="servo-editor-fields"><div class="servo-editor-intro"><h4>${ready(row.calibration) ? '完整软件标定草稿' : '软件标定草稿待补齐'}</h4><p>逐颗填写已核对的姿态、方向与机械限位。完整草稿仍未生效，不影响反馈、联调目标或 3D。</p></div><div class="servo-calibration-fields">${calibrationFields.map(field => calibrationFieldMarkup(field, row.calibration)).join('')}</div>${calculatorMarkup(row)}<div class="servo-disabled-actions"><button type="button" class="button secondary" disabled title="权威后端与实机标定确认尚未接通">提交实机标定</button><details><summary>设备中位与持久偏移</summary><p>设备中位校准会改变编码器偏移，与本地软件参考位置分别处理。当前命令与固件尚未核实。</p><button type="button" class="button secondary" disabled title="须核实固件命令、副作用和回读">设备中位校准</button><button type="button" class="button secondary" disabled title="须核实持久偏移与标定失效规则">写入设备偏移</button></details></div></div>`;
  }

  function batchMarkup() {
    const results = batchPreview?.results || [];
    return `<section class="panel servo-batch-panel" aria-labelledby="servo-batch-title"><div class="servo-section-heading"><div><h3 id="servo-batch-title">批量草稿差异</h3><p>以当前关节勾选字段为来源，只修改所选关节的本地${tab === 'calibration' ? '标定' : '参数'}草稿。</p></div><span class="badge draft">不发送命令</span></div><div class="servo-batch-toolbar"><span>已选 ${store.selectedIds().length} 个关节 · ${batchFields.size} 个字段</span><button type="button" class="button secondary" data-servo-batch-preview>预览逐关节差异</button><button type="button" class="button primary" data-servo-batch-apply ${!batchPreview?.valid || batchPreview.applied ? 'disabled' : ''}>应用到本地草稿</button></div>${results.length ? `<div class="servo-batch-results" role="region" aria-label="逐关节草稿应用结果"><table><thead><tr><th scope="col">关节 / ID</th><th scope="col">差异</th><th scope="col">结果</th></tr></thead><tbody>${results.map(result => `<tr><th scope="row">${escape(jointFor(result.id).name)} <span class="mono">#${result.id}</span></th><td>${(result.changes || []).map(formatChange).join('；') || '无字段变化'}</td><td>${escape(result.valid ? batchPreview.applied ? result.changed ? '已改本地草稿' : '草稿未变' : '可应用草稿' : result.reason || '校验未通过')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="servo-batch-empty">勾选字段并预览后，这里显示旧值、新值与逐关节校验结果。</p>'}</section>`;
  }

  function editorMarkup() {
    const joint = jointFor(selectedJoint), row = draftFor(joint.id);
    return `<section class="panel servo-editor-panel" aria-labelledby="servo-editor-title"><div class="servo-section-heading"><div><h3 id="servo-editor-title">${escape(joint.name)} <span class="mono">#${joint.id}</span></h3><p class="mono">${escape(joint.raw)}</p></div><span class="badge draft">本地草稿</span></div><label class="servo-joint-selector" for="servo-edit-joint">查看关节<select id="servo-edit-joint" data-servo-joint-select>${joints.metadata.map(item => `<option value="${item.id}" ${item.id === joint.id ? 'selected' : ''}>${item.id} · ${escape(item.name)}</option>`).join('')}</select></label>${tab === 'calibration' ? calibrationEditorMarkup(joint, row) : parameterEditorMarkup(joint, row)}</section>`;
  }

  function render(options = {}) {
    const nextJoint = activeId(options);
    if (nextJoint !== selectedJoint) invalidateBatch();
    selectedJoint = nextJoint;
    return `<div class="servo-parameters-workspace">${headerMarkup()}${scopeMarkup()}<div id="servo-parameters-body" role="tabpanel" aria-labelledby="servo-tab-${tab}" class="servo-parameters-body"><div class="servo-parameters-grid">${ledgerMarkup()}${editorMarkup()}</div>${batchMarkup()}</div><p class="servo-parameters-notice" data-servo-notice role="status" aria-live="polite">${escape(notice)}</p></div>`;
  }

  function repaint() {
    if (!container) return;
    const active = root.document?.activeElement;
    const focusId = active && container.contains(active) ? active.id : '';
    container.innerHTML = render({ jointId: selectedJoint });
    if (focusId) container.querySelector('#' + focusId)?.focus({ preventScroll: true });
  }
  function updateNotice(message) {
    notice = message;
    const element = container?.querySelector('[data-servo-notice]');
    if (element) element.textContent = message;
  }
  function invalidateBatch() {
    if (reviewedBatch) notice = '批量差异预览已失效，请重新预览；已有草稿、字段勾选和范围保留。';
    batchPreview = null; reviewedBatch = null;
  }
  function chooseJoint(id) {
    selectedJoint = jointFor(id).id;
    invalidateBatch();
    repaint();
    context?.onSelect?.(selectedJoint);
  }
  function switchTab(next) {
    if (!['parameters', 'calibration'].includes(next) || next === tab) return;
    tab = next; batchFields = batchFieldsBySection[next]; invalidateBatch(); repaint();
  }
  function chooseRange(next) {
    range = next;
    if (next !== 'custom') store.select(joints.metadata.filter(joint => next === 'all' || joint.group === ({ left: '左腿', right: '右腿', head: '头颈' })[next]).map(joint => joint.id));
    invalidateBatch(); repaint();
  }
  function patchForBatch() {
    const values = draftFor(selectedJoint)[tab];
    const patch = {};
    batchFields.forEach(key => { patch[key] = values[key]; });
    return patch;
  }

  function download() {
    const url = root.URL.createObjectURL(new root.Blob([store.exportJSON()], { type: 'application/json;charset=utf-8' }));
    const link = root.document.createElement('a');
    link.href = url; link.download = 'Microduck-Hatchery-LOCAL-DRAFTS-HD1910.json';
    link.click();
    root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    updateNotice('已导出本地草稿；文件标记 sampleOnly，不能作为已实机标定或参数写入证明。');
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button || !container?.contains(button) || button.disabled) return;
    if (button.matches('[data-servo-tab]')) switchTab(button.dataset.servoTab);
    else if (button.matches('[data-servo-range]')) chooseRange(button.dataset.servoRange);
    else if (button.matches('[data-servo-clear]')) { range = 'custom'; store.select([]); invalidateBatch(); repaint(); }
    else if (button.matches('[data-servo-joint]')) chooseJoint(button.dataset.servoJoint);
    else if (button.matches('[data-servo-export]')) download();
    else if (button.matches('[data-servo-import]')) container.querySelector('[data-servo-file]').click();
    else if (button.matches('[data-servo-batch-preview]')) {
      if (!batchFields.size || !store.selectedIds().length) { updateNotice('先选择批量关节，并在当前关节详情中勾选要应用的字段。'); return; }
      const review = Object.freeze({
        section: tab, patch: Object.freeze(patchForBatch()),
        ids: Object.freeze(store.selectedIds().slice()), sourceId: selectedJoint
      });
      batchPreview = store.previewBatch(review.section, review.patch, review.ids);
      reviewedBatch = batchPreview.valid ? review : null;
      updateNotice(batchPreview.valid ? '已生成逐关节草稿差异；确认后可应用到本地草稿。' : '部分草稿校验未通过，设备没有收到任何命令。');
      repaint();
    } else if (button.matches('[data-servo-batch-apply]')) {
      if (!batchPreview?.valid || batchPreview.applied || !reviewedBatch) return;
      fileGeneration += 1;
      // Apply exactly the values and IDs shown in the review, never fresh inputs.
      batchPreview = store.applyBatch(reviewedBatch.section, reviewedBatch.patch, reviewedBatch.ids);
      reviewedBatch = null;
      updateNotice(batchPreview.valid ? '已应用到选定关节的本地草稿；未修改设备、反馈或联调目标。' : '草稿校验未通过，未应用。');
      repaint();
    }
  }

  function readFile(file) {
    if (!file) return;
    const limit = profile.maxImportBytes || 128 * 1024;
    if (file.size > limit) { updateNotice(`草稿文件超过 ${limit / 1024} KiB；未导入。`); return; }
    const generation = ++fileGeneration, reader = new root.FileReader();
    reader.onload = function () {
      if (generation !== fileGeneration || !container) return;
      const report = store.importJSON(String(reader.result));
      invalidateBatch();
      updateNotice(report.valid ? '已载入经过校验的本地草稿；未写入设备，选择范围保持原样。' : '导入拒绝：' + report.reason + '；原草稿未改动。');
      repaint();
    };
    reader.onerror = function () { if (generation === fileGeneration && container) updateNotice('文件读取失败；原草稿未改动。'); };
    reader.readAsText(file, 'UTF-8');
  }

  function change(event) {
    const target = event.target;
    if (target.matches('[data-servo-joint-select]')) chooseJoint(target.value);
    else if (target.matches('[data-servo-select]')) {
      const selected = new Set(store.selectedIds());
      if (target.checked) selected.add(Number(target.dataset.servoSelect));
      else selected.delete(Number(target.dataset.servoSelect));
      range = 'custom'; store.select([...selected]); invalidateBatch(); repaint();
    } else if (target.matches('[data-servo-batch-field]')) {
      if (target.checked) batchFields.add(target.dataset.servoBatchField); else batchFields.delete(target.dataset.servoBatchField);
      invalidateBatch(); repaint();
    } else if (target.matches('[data-servo-parameter],[data-servo-calibration]')) {
      const parameter = target.hasAttribute('data-servo-parameter');
      const key = parameter ? target.dataset.servoParameter : target.dataset.servoCalibration;
      if (target.validity?.badInput) { updateNotice('请输入有效数值；原草稿保留。'); return; }
      const value = target.value === '' ? null : Number(target.value);
      fileGeneration += 1;
      const report = parameter ? store.setParameters(selectedJoint, { [key]: value }) : store.setCalibration(selectedJoint, { [key]: value });
      invalidateBatch();
      updateNotice(report.valid ? '已保存当前关节的本地草稿；没有实机写入。' : '草稿未保存：' + report.reason);
      repaint();
    } else if (target.matches('[data-servo-counts]')) { counts = target.value === '' ? null : Number(target.value); repaint(); }
    else if (target.matches('[data-servo-file]')) { const file = target.files?.[0]; target.value = ''; readFile(file); }
  }

  function keydown(event) {
    if (!event.target.matches('[data-servo-tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    switchTab(event.key === 'Home' ? 'parameters' : event.key === 'End' ? 'calibration' : tab === 'parameters' ? 'calibration' : 'parameters');
    container.querySelector(`[data-servo-tab="${tab}"]`).focus();
  }

  function mount(options) {
    unmount();
    container = options?.container;
    if (!container) return false;
    context = { ...options };
    selectedJoint = activeId(options);
    // unmount invalidates reviews, so replace even an existing stale markup tree.
    repaint();
    container.addEventListener('click', click); container.addEventListener('change', change); container.addEventListener('keydown', keydown);
    return true;
  }
  function setContext(options = {}) {
    if (!context) return;
    context = { ...context, ...options };
    if (options.jointId != null && activeId(options) !== selectedJoint) { selectedJoint = activeId(options); invalidateBatch(); repaint(); }
  }
  function unmount() {
    fileGeneration += 1;
    invalidateBatch();
    if (!container) return;
    container.removeEventListener('click', click); container.removeEventListener('change', change); container.removeEventListener('keydown', keydown);
    container = null; context = null;
  }
  function snapshot() { return { mounted: Boolean(container), tab, jointId: selectedJoint, counts, range, batchFields: [...batchFields], drafts: store.snapshot() }; }

  return Object.freeze({ render, mount, setContext, unmount, snapshot });
});
