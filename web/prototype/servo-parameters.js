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

  // Configuration is edited here only. Consumers receive immutable, unconfirmed mappings.
  // It never supplies authoritative hardware state or commands.
  const store = profile.createDraftStore(joints.metadata, { allowNewIds: true });
  const bindings = new Map(joints.metadata.map(joint => [joint.id, joint.id]));
  let selectedDevice = 23, backend = null, deviceSelection = false, discovered = [], ledgerDirty = false;
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
  function draftFor(id) { return store.get(bindings.get(Number(id)) ?? Number(id)); }
  function deviceDraft() { store.ensure(selectedDevice); return store.get(selectedDevice); }
  function actualTargets() { return [...new Set(store.selectedIds().map(id => deviceSelection ? id : bindings.get(id) ?? id))]; }
  function liveReading() { return [...(backend?.joints || []), ...(backend?.unassigned_devices || [])].find(row => row.id === selectedDevice); }
  function freshCounts() {
    const row = liveReading();
    return backend?.connection === 'open' && row?.status === 'response' && row.received_monotonic_ms != null && backend.collected_monotonic_ms - row.received_monotonic_ms <= backend.max_age_ms ? row.decoded_reference?.position_raw ?? null : null;
  }
  function deviceContext(id, jointId = selectedJoint) {
    if (root.ServoDevice?.isPending() || !store.ensure(id)) return;
    if (selectedDevice === id && selectedJoint === jointId) return;
    selectedDevice = id; selectedJoint = jointId == null ? null : jointFor(jointId).id;
    invalidateBatch(); repaint();
  }
  function bindDevice(jointId, id) {
    const duplicate = [...bindings].find(([joint, device]) => joint !== jointId && device === id);
    if (duplicate) { updateNotice(`ID ${id} 已关联 ${jointFor(duplicate[0]).name}；先更改该关联草稿。`); return false; }
    if (!store.ensure(id) || !joints.metadata.some(j => j.id === jointId)) return false;
    bindings.set(jointId, id); selectedDevice=id; selectedJoint=jointId; invalidateBatch(); repaint(); updateNotice('已改关节关联草稿；没有改变舵机自身 ID、运行时或策略索引。'); return true;
  }
  function remapDevice(oldId, newId) {
    if (!store.ensure(newId)) return;
    const old = store.get(oldId), next = store.get(newId);
    const hasDraft = [...Object.values(next.parameters), ...Object.values(next.calibration)].some(value => value !== null);
    if (!hasDraft) { store.setParameters(newId, { ...old.parameters, busId: newId }); store.setCalibration(newId, old.calibration); }
    const existing = [...bindings].find(([, id]) => id === newId);
    if (!existing) [...bindings].forEach(([joint, id]) => { if (id === oldId) bindings.set(joint, newId); });
    deviceContext(newId, existing?.[0] ?? selectedJoint);
    updateNotice(`后端已确认新 ID 与锁位回读；断电持久性仍需核对。${hasDraft ? '新 ID 已有草稿，原样保留；旧 ID 草稿也保留。' : '已复制原 ID 的标定草稿。'}${existing ? '新 ID 已有关节关联；保留原关联，请核对实际装配。' : ''}`);
  }
  function ready(calibration) { return profile.calibrationPreview(2048, calibration, referenceOptions).valid; }
  function countFields(row) { return profile.fields.filter(field => row.parameters[field.key] != null).length; }
  function fieldLabel(key) {
    return profile.fields.find(field => field.key === key)?.label || calibrationFields.find(field => field[0] === key)?.[1] || key;
  }

  function formatChange(change) {
    return `${escape(fieldLabel(change.field))} ${numberText(change.before)} → ${numberText(change.after)}`;
  }

  function headerMarkup() {
    const complete = joints.metadata.filter(joint => ready(draftFor(joint.id).calibration)).length;
    return `<div class="servo-parameters-tools"><div class="servo-configuration-status"><span class="badge offline" data-servo-connection>等待读取后端</span><span>HD-1910-C001 · 标定草稿 <span data-servo-ready-count>${complete} / 15</span> · 实机未确认</span><span data-backend-message></span><button type="button" class="servo-text-button" data-backend-refresh ${root.HATCHERY_BACKEND?.readOnly === true ? '' : 'disabled'}>刷新状态</button></div><div class="servo-file-actions"><button type="button" class="button secondary" data-servo-import>导入草稿</button><button type="button" class="button secondary" data-servo-export>导出 JSON</button><input type="file" data-servo-file accept=".json,application/json" hidden></div></div>`;
  }
  function editorTabsMarkup() {
    return `<div class="servo-parameters-tabs" role="tablist" aria-label="当前舵机设置">${[['parameters','参数'],['calibration','软件标定'],['tuning','位置调节']].map(([key,label]) => `<button type="button" id="servo-tab-${key}" role="tab" data-servo-tab="${key}" aria-controls="servo-editor-body" aria-selected="${tab === key}" tabindex="${tab === key ? 0 : -1}">${label}</button>`).join('')}</div>`;
  }
  function scopeMarkup() {
    return `<section class="panel servo-scope-panel" aria-label="参数批量范围"><div><strong>批量范围</strong><span>独立于联调目标范围</span></div><div class="servo-scope-buttons" role="group" aria-label="选择批量关节">${[['all','全部'],['left','左腿'],['right','右腿'],['head','头颈与嘴部'],['bus','已发现舵机'],['custom','自定义']].map(([key,name]) => `<button type="button" data-servo-range="${key}" aria-pressed="${range === key}">${name}</button>`).join('')}</div><span data-servo-selection-count>已选 ${store.selectedIds().length} / ${deviceSelection ? discovered.length : 15}</span><button type="button" data-servo-clear class="servo-text-button">清空选择</button></section>`;
  }
  function ledgerMarkup() {
    const selected = new Set(actualTargets());
    const cal = tab === 'calibration';
    return `<section class="panel servo-ledger-panel" aria-labelledby="servo-ledger-title"><div class="servo-section-heading"><h3 id="servo-ledger-title">${cal ? '软件标定草稿' : '关节参数草稿'}</h3><span>关节关联为本地草稿</span></div>${root.ServoDevice?.scanMarkup() || ''}<div class="servo-ledger-scroll" tabindex="0" role="region" aria-label="15 个关节草稿表，可横向滚动"><table class="servo-ledger"><thead><tr><th scope="col">范围</th><th scope="col">关节 / ID</th>${cal ? '<th scope="col">参考 counts</th><th scope="col">参考 °</th><th scope="col">方向</th><th scope="col">最小 °</th><th scope="col">最大 °</th><th scope="col">草稿状态</th>' : '<th scope="col">设备值</th><th scope="col">已填字段</th><th scope="col">草稿状态</th>'}</tr></thead><tbody>${joints.metadata.map(joint => {
      const row = draftFor(joint.id), calibrated = ready(row.calibration);
      return `<tr data-servo-row="${joint.id}" class="${joint.id === selectedJoint ? 'selected' : ''}"><td><input id="servo-scope-${joint.id}" type="checkbox" data-servo-select="${joint.id}" ${selected.has(bindings.get(joint.id)) ? 'checked' : ''} aria-label="将 ${escape(joint.name)} #${joint.id} 纳入批量范围"></td><th scope="row"><button type="button" data-servo-joint="${joint.id}" aria-pressed="${joint.id === selectedJoint}" title="${escape(joint.raw)}"><span class="servo-joint-id">${bindings.get(joint.id)}</span><strong>${escape(joint.name)}</strong></button></th>${cal ? `<td>${numberText(row.calibration.zeroCounts)}</td><td>${numberText(row.calibration.referenceDeg)}</td><td>${row.calibration.direction === 1 ? '+1' : row.calibration.direction === -1 ? '−1' : '—'}</td><td>${numberText(row.calibration.minDeg)}</td><td>${numberText(row.calibration.maxDeg)}</td><td><span class="servo-draft-status">${calibrated ? '完整草稿' : '待补齐'}</span></td>` : `<td data-servo-ledger-feedback="${bindings.get(joint.id)}">—</td><td>${countFields(row)} / ${profile.fields.length}</td><td><span class="servo-draft-status">${countFields(row) ? '本地草稿' : '未填写'}</span></td>`}</tr>`;
    }).join('')}${extraDeviceRows(selected,cal)}</tbody></table></div><p class="servo-ledger-note">左腿 → 右腿 → 头颈与嘴部。勾选范围与查看详情分别操作，全部 15 个关节保留。</p></section>`;
  }

  function extraDeviceRows(selected, cal) {
    return discovered.filter(id => ![...bindings.values()].includes(id)).map(id => {
      const row = store.get(id);
      return `<tr data-servo-device-row="${id}" class="${selectedJoint === null && selectedDevice === id ? 'selected' : ''}"><td><input type="checkbox" data-servo-select-device="${id}" ${selected.has(id) ? 'checked' : ''} aria-label="将 ID ${id} 纳入批量草稿"></td><th scope="row"><button type="button" data-servo-device="${id}"><span class="servo-joint-id">${id}</span><strong>未关联舵机</strong></button></th>${cal ? `<td>${numberText(row.calibration.zeroCounts)}</td><td>${numberText(row.calibration.referenceDeg)}</td><td>${numberText(row.calibration.direction)}</td><td>${numberText(row.calibration.minDeg)}</td><td>${numberText(row.calibration.maxDeg)}</td><td>本地草稿</td>` : `<td data-servo-ledger-feedback="${id}">—</td><td>${countFields(row)} / ${profile.fields.length}</td><td>本地草稿</td>`}</tr>`;
    }).join('');
  }

  function parameterFieldMarkup(field, row) {
    const key = field.key;
    return `<div class="servo-parameter-field"><div><label for="servo-field-${key}">${escape(field.label)}</label><span>${escape(field.unit || 'raw')} · 寄存器范围待核实</span></div><div class="servo-readback"><span>设备回读</span><strong>—</strong></div><label class="servo-draft-input"><span class="visually-hidden">${escape(field.label)}本地草稿</span><input id="servo-field-${key}" type="number" inputmode="numeric" step="1" value="${escape(row.parameters[key])}" placeholder="未填写" ${key === 'busId' ? 'min="0" max="253" data-device-new-id' : ''} data-servo-parameter="${key}" aria-label="${escape(field.label)}本地草稿"></label><label class="servo-batch-check"><input id="servo-batch-${key}" type="checkbox" data-servo-batch-field="${key}" ${batchFields.has(key) ? 'checked' : ''}>批量</label>${key === 'busId' ? root.ServoDevice?.identityMarkup() || '' : ''}</div>`;
  }

  function parameterEditorMarkup(joint, row) {
    return `<div class="servo-editor-fields"><div class="servo-editor-intro"><h4>本地参数草稿</h4><p>填写不写入设备；raw 字段的地址、单位与有效范围仍需按型号和固件确认。</p></div>${Object.keys(groupLabels).map(group => {
      const fields = profile.fields.filter(field => (['operatingMode', 'resolution'].includes(field.key) ? 'output' : field.group) === group);
      return fields.length ? `<fieldset class="servo-parameter-group"><legend>${groupLabels[group]}</legend>${fields.map(field => parameterFieldMarkup(field, row)).join('')}</fieldset>` : '';
    }).join('')}<div class="servo-disabled-actions"><button type="button" class="button secondary" disabled title="参数寄存器映射与回读尚未接通">回读设备参数</button><button type="button" class="button primary" disabled title="需核实当前固件寄存器、控制权和写入确认">写入设备参数</button><span>待权威后端、型号寄存器与逐项确认接通。</span></div></div>`;
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
    return `<div class="servo-editor-fields"><div class="servo-editor-intro"><h4>${ready(row.calibration) ? '完整软件标定草稿' : '软件标定草稿待补齐'}</h4><p>逐颗填写已核对的姿态、方向与机械限位。完整草稿仍未生效；实测位置可显式填入草稿，关节角预览使用同一公式。</p></div><div class="servo-device-actions"><button type="button" class="button secondary" data-servo-use-feedback disabled>实测位置 → 参考 counts 草稿</button><span data-servo-live-angle>—</span></div><div class="servo-calibration-fields">${calibrationFields.map(field => calibrationFieldMarkup(field, row.calibration)).join('')}</div>${calculatorMarkup(row)}<div class="servo-disabled-actions"><button type="button" class="button secondary" disabled title="权威后端与实机标定确认尚未接通">提交实机标定</button><details><summary>设备中位与持久偏移</summary><p>设备中位校准会改变编码器偏移，与本地软件参考位置分别处理。当前命令与固件尚未核实。</p><button type="button" class="button secondary" disabled title="须核实固件命令、副作用和回读">设备中位校准</button><button type="button" class="button secondary" disabled title="须核实持久偏移与标定失效规则">写入设备偏移</button></details></div></div>`;
  }

  function batchMarkup() {
    const results = batchPreview?.results || [];
    return `<section class="panel servo-batch-panel" aria-labelledby="servo-batch-title"><div class="servo-section-heading"><div><h3 id="servo-batch-title">批量草稿差异</h3><p>以当前舵机勾选字段为来源，只修改所选舵机的本地${tab === 'calibration' ? '标定' : '参数'}草稿。</p></div><span class="badge draft">不发送命令</span></div><div class="servo-batch-toolbar"><span>已选 ${actualTargets().length} 颗舵机 · ${batchFields.size} 个字段</span><button type="button" class="button secondary" data-servo-batch-preview>预览逐关节差异</button><button type="button" class="button primary" data-servo-batch-apply ${!batchPreview?.valid || batchPreview.applied ? 'disabled' : ''}>应用到本地草稿</button></div>${results.length ? `<div class="servo-batch-results" role="region" aria-label="逐关节草稿应用结果"><table><thead><tr><th scope="col">关节 / ID</th><th scope="col">差异</th><th scope="col">结果</th></tr></thead><tbody>${results.map(result => `<tr><th scope="row">${escape(joints.metadata.find(j => bindings.get(j.id) === result.id)?.name || '未关联舵机')} <span class="mono">#${result.id}</span></th><td>${(result.changes || []).map(formatChange).join('；') || '无字段变化'}</td><td>${escape(result.valid ? batchPreview.applied ? result.changed ? '已改本地草稿' : '草稿未变' : '可应用草稿' : result.reason || '校验未通过')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="servo-batch-empty">勾选字段并预览后，这里显示旧值、新值与逐关节校验结果。</p>'}</section>`;
  }

  function editorMarkup() {
    const joint = selectedJoint == null ? {name:'未关联舵机',raw:'bus-device'} : jointFor(selectedJoint), row=deviceDraft();
    return `<section class="panel servo-editor-panel" aria-labelledby="servo-editor-title"><div class="servo-section-heading"><div><h3 id="servo-editor-title">${escape(joint.name)}${selectedJoint !== null && bindings.get(selectedJoint) !== selectedDevice ? '（关联待应用）' : ''} <span class="mono">ID ${selectedDevice}</span></h3><p class="mono">${escape(joint.raw)}</p></div><span class="badge draft">本地草稿</span></div>${root.ServoDevice?.selectionMarkup() || ''}${root.ServoDevice?.feedbackMarkup() || ''}<div class="servo-editor-consent">${root.ServoDevice?.confirmationMarkup() || ''}</div>${editorTabsMarkup()}<div id="servo-editor-body" role="tabpanel" aria-labelledby="servo-tab-${tab}">${tab === 'calibration' ? calibrationEditorMarkup(joint,row) : tab === 'tuning' ? root.ServoDevice?.controlsMarkup() || '' : parameterEditorMarkup(joint,row)}</div><div class="servo-editor-footer"><p class="servo-device-result" data-device-result role="status">目标编辑只改草稿；写入由后端核对并确认。</p>${root.ServoDevice?.registersMarkup() || ''}</div></section>`;
  }
  function render(options = {}) {
    if (options.jointId != null && selectedJoint !== null && activeId(options) !== selectedJoint) { selectedJoint = activeId(options); selectedDevice = bindings.get(selectedJoint); invalidateBatch(); }
    return `<div class="servo-parameters-workspace">${headerMarkup()}${scopeMarkup()}<div id="servo-parameters-body" class="servo-parameters-body"><div class="servo-parameters-grid">${ledgerMarkup()}${editorMarkup()}</div>${tab === 'tuning' ? '' : batchMarkup()}</div><p class="servo-parameters-notice" data-servo-notice role="status" aria-live="polite">${escape(notice)}</p></div>`;
  }

  function repaint() {
    if (!container) return;
    const active = root.document?.activeElement;
    const focusId = active && container.contains(active) ? active.id : '';
    ledgerDirty = false;
    root.ServoDevice?.capture();
    container.innerHTML = render();
    updateBackend(backend);
    root.ServoDevice?.repaint();
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
    if (root.ServoDevice?.isPending()) return;
    const joint = jointFor(id).id;
    if (root.ServoDevice) root.ServoDevice.selectId(bindings.get(joint),joint);
    else deviceContext(bindings.get(joint),joint);
    context?.onSelect?.(joint);
  }
  function switchTab(next) {
    if (!['parameters','calibration','tuning'].includes(next) || next === tab) return;
    tab=next;
    if (batchFieldsBySection[next]) batchFields=batchFieldsBySection[next];
    invalidateBatch(); repaint();
  }
  function chooseRange(next) {
    range = next;
    if (next === 'bus') { deviceSelection = true; store.select(discovered); }
    else if (next !== 'custom') deviceSelection = false;
    if (next !== 'bus' && next !== 'custom') store.select(joints.metadata.filter(joint => next === 'all' || joint.group === ({ left: '左腿', right: '右腿', head: '头颈' })[next]).map(joint => joint.id));
    invalidateBatch(); repaint();
  }
  function patchForBatch() {
    const values = deviceDraft()[tab];
    const patch = {};
    batchFields.forEach(key => { patch[key] = values[key]; });
    return patch;
  }

  function download() {
    const exported = JSON.stringify({ format:'hatchery-servo-workspace', version:1, bindings:[...bindings].map(([jointId,deviceId]) => ({ jointId, deviceId })), devices:JSON.parse(store.exportJSON()) },null,2);
    const url = root.URL.createObjectURL(new root.Blob([exported], { type: 'application/json;charset=utf-8' }));
    const link = root.document.createElement('a');
    link.href = url; link.download = 'Microduck-Hatchery-LOCAL-DRAFTS-HD1910.json';
    link.click();
    root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    updateNotice('已导出本地草稿；文件标记 sampleOnly，不能作为已实机标定或参数写入证明。');
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button || !container?.contains(button) || button.disabled) return;
    if (tab === 'tuning' && button.matches('[data-servo-batch-preview],[data-servo-batch-apply]')) return;
    if (button.matches('[data-servo-use-feedback]')) { const raw = freshCounts(); if (raw !== null) { store.setCalibration(selectedDevice,{zeroCounts:raw}); invalidateBatch(); repaint(); updateNotice('仅将当前实测位置填入标定草稿；参考角、方向与限位仍需核对。'); } }
    else if (button.matches('[data-servo-tab]')) switchTab(button.dataset.servoTab);
    else if (button.matches('[data-servo-range]')) chooseRange(button.dataset.servoRange);
    else if (button.matches('[data-servo-clear]')) { range = 'custom'; store.select([]); invalidateBatch(); repaint(); }
    else if (button.matches('[data-servo-device]')) { root.ServoDevice?.selectId(Number(button.dataset.servoDevice),null); }
    else if (button.matches('[data-servo-joint]')) chooseJoint(button.dataset.servoJoint);
    else if (button.matches('[data-servo-export]')) download();
    else if (button.matches('[data-servo-import]')) container.querySelector('[data-servo-file]').click();
    else if (button.matches('[data-servo-batch-preview]')) {
      if (!batchFields.size || !store.selectedIds().length) { updateNotice('先选择批量舵机，并在当前舵机详情中勾选要应用的字段。'); return; }
      const review = Object.freeze({
        section: tab, patch: Object.freeze(patchForBatch()),
        ids: Object.freeze(actualTargets()), sourceId: selectedDevice
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
      let document;
      try { document = JSON.parse(String(reader.result)); } catch (_) { updateNotice('JSON 格式无效；原草稿保留。'); return; }
      let mapped = null;
      if (document.format === 'hatchery-servo-workspace') {
        mapped = document.bindings;
        if (document.version !== 1 || !Array.isArray(mapped) || mapped.length !== 15 || new Set(mapped.map(item => item?.jointId)).size !== 15 || new Set(mapped.map(item => item?.deviceId)).size !== 15 || mapped.some(item => !joints.metadata.some(j => j.id === item?.jointId) || !Number.isInteger(item.deviceId) || item.deviceId < 0 || item.deviceId > 253)) { updateNotice('关节关联草稿无效；原草稿保留。'); return; }
        document = document.devices;
      }
      const report = store.importJSON(JSON.stringify(document));
      if (report.valid && mapped) { mapped.forEach(item => { store.ensure(item.deviceId); bindings.set(item.jointId,item.deviceId); }); selectedDevice = bindings.get(selectedJoint) ?? selectedDevice; root.ServoDevice?.selectId(selectedDevice,selectedJoint); }
      invalidateBatch();
      updateNotice(report.valid ? '已载入经过校验的本地草稿；未写入设备，选择范围保持原样。' : '导入拒绝：' + report.reason + '；原草稿未改动。');
      repaint();
    };
    reader.onerror = function () { if (generation === fileGeneration && container) updateNotice('文件读取失败；原草稿未改动。'); };
    reader.readAsText(file, 'UTF-8');
  }

  function refreshDraftValues() {
    if (!container) return;
    if (!container.querySelectorAll) { repaint(); return; }
    const complete=container.querySelector('[data-servo-ready-count]'); if (complete) complete.textContent=joints.metadata.filter(joint=>ready(draftFor(joint.id).calibration)).length + ' / 15';
    container.querySelectorAll('[data-servo-row],[data-servo-device-row]').forEach(element => {
      const row=element.hasAttribute('data-servo-device-row') ? store.get(Number(element.dataset.servoDeviceRow)) : draftFor(Number(element.dataset.servoRow));
      const cells=element.querySelectorAll('td');
      if (tab === 'calibration') {
        const values=[row.calibration.zeroCounts,row.calibration.referenceDeg,row.calibration.direction,row.calibration.minDeg,row.calibration.maxDeg];
        values.forEach((value,index)=>{ if (cells[index+1]) cells[index+1].textContent=numberText(value); });
        if (cells[6]) cells[6].textContent=ready(row.calibration) ? '完整草稿' : '待补齐';
      } else if (cells.length >= 4) { cells[2].textContent=`${countFields(row)} / ${profile.fields.length}`; cells[3].textContent=countFields(row) ? '本地草稿' : '未填写'; }
    });
    const apply=container.querySelector('[data-servo-batch-apply]'); if (apply) apply.disabled=true;
    container.querySelector('.servo-batch-results')?.remove();
    if (tab === 'calibration') {
      const reference=profile.referencePosition(counts,referenceOptions), preview=profile.calibrationPreview(counts,deviceDraft().calibration,referenceOptions);
      for (const [key,value] of [['encoder-angle',reference.valid ? numberText(reference.encoderDeg)+'°' : '—'],['center-angle',reference.valid ? numberText(reference.centerDeg)+'°' : '—'],['draft-angle',preview.valid ? numberText(preview.angleDeg)+'°' : '—'],['preview-reason',preview.valid ? preview.inRange ? '按完整本地草稿换算，未实机确认。' : '草稿预览超出机械限位；没有裁剪或执行。' : preview.reason]]) { const element=container.querySelector('[data-servo-'+key+']'); if (element) element.textContent=value; }
    }
    updateBackend(backend);
  }
  function change(event) {
    const target = event.target;
    if (target.matches('[data-servo-joint-select]')) chooseJoint(target.value);
    else if (target.matches('[data-servo-select],[data-servo-select-device]')) {
      if (target.hasAttribute('data-servo-select-device') && !deviceSelection) { store.select(actualTargets()); deviceSelection = true; }
      const id = target.hasAttribute('data-servo-select-device') ? Number(target.dataset.servoSelectDevice) : deviceSelection ? bindings.get(Number(target.dataset.servoSelect)) : Number(target.dataset.servoSelect);
      const selected = new Set(store.selectedIds());
      if (target.checked) selected.add(id);
      else selected.delete(id);
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
      const report = parameter ? store.setParameters(selectedDevice, { [key]: value }) : store.setCalibration(selectedDevice, { [key]: value });
      invalidateBatch();
      updateNotice(report.valid ? '已保存当前关节的本地草稿；没有实机写入。' : '草稿未保存：' + report.reason);
      if (report.valid) refreshDraftValues(); else repaint();
    } else if (target.matches('[data-servo-counts]')) { counts = target.value === '' ? null : Number(target.value); repaint(); }
    else if (target.matches('[data-servo-file]')) { const file = target.files?.[0]; target.value = ''; readFile(file); }
  }

  function keydown(event) {
    if (!event.target.matches('[data-servo-tab]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const tabs=['parameters','calibration','tuning'], at=tabs.indexOf(tab);
    switchTab(event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[2] : tabs[(at + (event.key === 'ArrowLeft' ? 2 : 1)) % 3]);
    container.querySelector(`[data-servo-tab="${tab}"]`).focus();
  }
  function mount(options) {
    unmount();
    container = options?.container;
    if (!container) return false;
    context = { ...options };
    selectedJoint = activeId(options); selectedDevice = bindings.get(selectedJoint);
    // unmount invalidates reviews, so replace even an existing stale markup tree.
    repaint();
    container.addEventListener('click', click); container.addEventListener('change', change); container.addEventListener('keydown', keydown);
    return true;
  }
  function setContext(options = {}) {
    if (!context) return;
    context = { ...context, ...options };
    if (!root.ServoDevice?.isPending() && options.jointId != null && activeId(options) !== selectedJoint) { selectedJoint = activeId(options); selectedDevice = bindings.get(selectedJoint); root.ServoDevice?.selectId(selectedDevice, selectedJoint); invalidateBatch(); repaint(); }
  }
  function unmount() {
    fileGeneration += 1;
    invalidateBatch();
    if (!container) return;
    container.removeEventListener('click', click); container.removeEventListener('change', change); container.removeEventListener('keydown', keydown);
    container = null; context = null;
  }
  function snapshot() { return { mounted: Boolean(container), tab, jointId: selectedJoint, counts, range, batchFields: [...batchFields], deviceId: selectedDevice, deviceSelection, bindings:[...bindings], drafts: store.snapshot() }; }

  function updateBackend(frame) {
    backend = frame;
    const ids = [...(frame?.joints || []).filter(row => row.status !== 'missing' || frame?.scan?.found_ids?.includes(row.id)), ...(frame?.unassigned_devices || [])].map(row => row.id).sort((a,b) => a-b);
    if (ids.join(',') !== discovered.join(',')) {
      discovered = ids; ledgerDirty = true; ids.forEach(id => store.ensure(id));
      // Only discovery changes the ledger tree; position polling does not repaint drafts.
    }
    const active = root.document?.activeElement;
    if (ledgerDirty && container && !(active && container.contains(active) && active.matches('input,select'))) { repaint(); return; }
    container?.querySelectorAll?.('[data-servo-ledger-feedback]').forEach(element => {
      const row=[...(frame?.joints || []),...(frame?.unassigned_devices || [])].find(item=>item.id === Number(element.dataset.servoLedgerFeedback));
      const fresh=row && row.received_monotonic_ms != null && frame.collected_monotonic_ms-row.received_monotonic_ms <= frame.max_age_ms && ['response','fixture'].includes(row.status);
      element.textContent=fresh ? row.decoded_reference ? row.decoded_reference.position_raw + ' counts' : 'PING 应答' : '—';
    });
    const badge = container?.querySelector('[data-servo-connection]');
    if (badge) { badge.textContent = frame?.connection === 'open' ? '总线已连接' : frame?.fake ? 'fake 夹具' : '后端未连接'; badge.className = 'badge ' + (frame?.connection === 'open' ? 'readonly' : 'offline'); }
    const button = container?.querySelector('[data-servo-use-feedback]');
    if (button) button.disabled = freshCounts() === null;
    const live = container?.querySelector('[data-servo-live-angle]');
    if (live) { const raw = freshCounts(), preview = profile.calibrationPreview(raw, deviceDraft().calibration, referenceOptions); live.textContent = raw === null ? '—' : `${raw} counts · ${preview.valid ? numberText(preview.angleDeg) + '°（标定草稿换算）' : '关节角待补齐标定草稿'}`; }
  }
  return Object.freeze({ render, mount, setContext, unmount, snapshot, deviceContext, bindDevice, remapDevice, updateBackend, boundId: id => bindings.get(id), mappingFor: id => { const deviceId=bindings.get(id), row=store.get(deviceId); return row ? Object.freeze({jointId:id,deviceId,calibration:Object.freeze({...row.calibration}),parameters:Object.freeze({...row.parameters}),hardwareConfirmed:false,source:'local-configuration-draft'}) : null; }, currentSelection: () => ({ id:selectedDevice, jointId:selectedJoint }) });
});
