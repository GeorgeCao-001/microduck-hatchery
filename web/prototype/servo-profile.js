(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ServoProfile = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Specification reference only: no register table or hardware calibration is implied.
  const hd1910 = Object.freeze({
    id: 'hd1910-default-resolution-v1', model: 'HD-1910-C001',
    countsPerRevolution: 4096, degreesPerCount: 360 / 4096, encoderCenter: 2048,
    source: 'manufacturer-specification', specVersion: '2026-09-07 A/0',
    registerProfileConfirmed: false, hardwareConfirmed: false
  });
  const defaultIds = Object.freeze([20, 21, 22, 23, 24, 10, 11, 12, 13, 14, 30, 31, 32, 33, 34]);
  const maxImportBytes = 128 * 1024;
  const numericDraftBound = 1000000000;
  const calibrationKeys = Object.freeze(['zeroCounts', 'referenceDeg', 'direction', 'minDeg', 'maxDeg']);
  const fields = Object.freeze([
    ['busId', '舵机 ID', 'identity', 'ID'],
    ['baudRate', '波特率', 'identity', 'baud'],
    ['operatingMode', '运行模式', 'identity', 'raw'],
    ['resolution', '分辨率参数', 'identity', 'raw'],
    ['offsetRaw', '设备偏移', 'output', 'raw'],
    ['speedRaw', '速度参数', 'output', 'raw'],
    ['accelerationRaw', '加速度参数', 'output', 'raw'],
    ['outputLimitRaw', '输出限制', 'output', 'raw'],
    ['pGainRaw', 'P 系数', 'control', 'raw'],
    ['iGainRaw', 'I 系数', 'control', 'raw'],
    ['dGainRaw', 'D 系数', 'control', 'raw'],
    ['minVoltageRaw', '最低电压阈值', 'protection', 'raw'],
    ['maxVoltageRaw', '最高电压阈值', 'protection', 'raw'],
    ['maxTemperatureRaw', '温度保护阈值', 'protection', 'raw'],
    ['maxCurrentRaw', '电流保护阈值', 'protection', 'raw']
  ].map(function (row) {
    return Object.freeze({
      key: row[0], label: row[1], group: row[2], unit: row[3], type: 'integer',
      verified: false, registerAddress: null, physicalUnit: null, min: null, max: null,
      storage: null, access: null, defaultValue: null,
      validationScope: 'local-draft-shape-only',
      reason: 'HD 型号 / 固件寄存器定义待核实；本地草稿不表示硬件可写'
    });
  }));
  const parameterKeys = Object.freeze(fields.map(function (field) { return field.key; }));
  const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);

  function plainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (plainObject(value)) {
      const result = {};
      Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
      return result;
    }
    return value;
  }

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (key) { freeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }

  function keysReason(value, allowed, complete) {
    if (!plainObject(value)) return '对象格式无效';
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (typeof key !== 'string' || dangerousKeys.has(key) || !allowed.includes(key)) return '未知或不安全字段';
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable) {
        return '不接受访问器或隐藏字段';
      }
    }
    if (complete && allowed.some(function (key) { return !Object.prototype.hasOwnProperty.call(value, key); })) {
      return '缺少必需字段';
    }
    return '';
  }

  function referencePosition(counts, options) {
    const unknown = function (reason) {
      return { valid: false, encoderDeg: null, centerDeg: null, reason: reason };
    };
    if (!plainObject(options) || options.profileId !== hd1910.id) return unknown('缺少已知的 HD 分辨率 profile');
    if (options.unit !== 'counts') return unknown('只接受明确的 counts；旧 UI ticks 不可换算');
    if (options.singleTurn !== true) return unknown('多圈或圈数未知；不推断计数参考');
    if (options.resolutionConfirmed !== true) return unknown('当前计数分辨率未确认');
    if (!finite(counts) || !Number.isInteger(counts)) return unknown('counts 必须为有限整数');
    if (counts < 0 || counts >= hd1910.countsPerRevolution) return unknown('超出默认单圈 0–4095 counts；未 wrap 或裁剪');
    return {
      valid: true, encoderDeg: counts * hd1910.degreesPerCount,
      centerDeg: (counts - hd1910.encoderCenter) * hd1910.degreesPerCount, reason: ''
    };
  }

  function calibrationReason(draft, complete) {
    const shape = keysReason(draft, calibrationKeys, complete);
    if (shape) return shape;
    for (const key of calibrationKeys) {
      const value = draft[key];
      if (value === undefined && !complete) continue;
      if (value === null && !complete) continue;
      if (!finite(value)) return complete ? '零位、参考角、方向与机械限位尚未完整填写' : '标定字段必须为有限数值或 null';
      if (key === 'zeroCounts' && (!Number.isInteger(value) || value < 0 || value > 4095)) return '零位 counts 必须为单圈整数 0–4095';
      if (key === 'direction' && value !== 1 && value !== -1) return '机械方向必须为 +1 或 −1';
      if (key.endsWith('Deg') && Math.abs(value) > 36000) return '角度超出本地草稿资源界限';
    }
    if (finite(draft.minDeg) && finite(draft.maxDeg) && draft.minDeg >= draft.maxDeg) return '最小角必须小于最大角';
    if (finite(draft.referenceDeg) && finite(draft.minDeg) && finite(draft.maxDeg) &&
        (draft.referenceDeg < draft.minDeg || draft.referenceDeg > draft.maxDeg)) {
      return '标定参考姿态必须位于机械限位内';
    }
    return '';
  }

  function calibrationPreview(counts, draft, options) {
    const result = {
      valid: false, angleDeg: null, inRange: null, reason: '',
      sampleOnly: true, hardwareConfirmed: false, status: 'local-draft-preview'
    };
    const reference = referencePosition(counts, options);
    if (!reference.valid) { result.reason = reference.reason; return result; }
    if (options.countReference !== 'default-single-turn') {
      result.reason = '当前 counts 与零位 counts 必须明确使用同一默认单圈参考';
      return result;
    }
    const reason = calibrationReason(draft, true);
    if (reason) { result.reason = reason; return result; }
    const angle = draft.referenceDeg + draft.direction * (counts - draft.zeroCounts) * hd1910.degreesPerCount;
    result.valid = true;
    result.angleDeg = angle;
    result.inRange = angle >= draft.minDeg && angle <= draft.maxDeg;
    result.reason = result.inRange ? '' : '草稿计算角超出机械限位；未裁剪或发出运动命令';
    return result;
  }

  function normalizedIds(idsOrMetadata) {
    const input = idsOrMetadata === undefined ? defaultIds : idsOrMetadata;
    if (!Array.isArray(input) || !input.length || input.length > 253) throw new TypeError('关节 ID 列表必须为非空、有界数组');
    const ids = input.map(function (entry) {
      const id = plainObject(entry) ? entry.id : entry;
      if (!Number.isInteger(id) || id < 0 || id > 253) throw new RangeError('关节 ID 无效');
      return id;
    });
    if (new Set(ids).size !== ids.length) throw new RangeError('关节 ID 不可重复');
    return ids;
  }

  function createReferenceFixture(idsOrMetadata) {
    const ids = normalizedIds(idsOrMetadata);
    const marker = {
      source: 'sample', origin: 'browser-hd-reference-fixture',
      fixtureId: 'hd1910-single-turn-reference-fixture-v1', sampleOnly: true,
      fake: true, simulated: false, hardwareConfirmed: false,
      profileId: hd1910.id, model: hd1910.model, unit: 'counts',
      singleTurn: true, resolutionConfirmed: true, countReference: 'default-single-turn',
      calibrationVersion: null
    };
    return freeze(Object.assign({}, marker, {
      // Deliberate examples, not measured encoder values or installed joint zeroes.
      rows: ids.map(function (id, index) {
        return Object.assign({}, marker, {
          id: id, value: 2048 + (index % 5 - 2) * 128,
          goal: 2048 + (index % 3 - 1) * 64,
          calibration: null, actualAngleDeg: null, rawBytes: null,
          load: null, speed: null, current: null, volt: null, temp: null,
          enabled: null, sampledAtUnix: null
        });
      })
    }));
  }

  function blank(keys) {
    const result = {};
    keys.forEach(function (key) { result[key] = null; });
    return result;
  }

  function parametersReason(parameters, complete) {
    const shape = keysReason(parameters, parameterKeys, complete);
    if (shape) return shape;
    for (const key of Object.keys(parameters)) {
      const value = parameters[key];
      if (value === null) continue;
      if (!finite(value) || !Number.isInteger(value) || Math.abs(value) > numericDraftBound) {
        return '参数草稿必须为有界有限整数或 null';
      }
      // Speed is signed in the frozen FT reference; retain its raw sign here.
      // These broad draft limits do not substitute for a verified firmware range.
      if (key !== 'offsetRaw' && key !== 'speedRaw' && value < 0) return '该参数草稿不可为负数';
      if ((key === 'baudRate' || key === 'resolution') && value === 0) return '波特率与分辨率草稿必须大于零';
    }
    // These are shape checks only; register/firmware ranges remain unverified.
    return '';
  }

  function createDraftStore(idsOrMetadata) {
    const ids = normalizedIds(idsOrMetadata);
    const records = new Map();
    let selection = new Set(ids);
    ids.forEach(function (id) {
      records.set(id, {
        id: id, parameters: blank(parameterKeys), calibration: blank(calibrationKeys),
        version: 0, sampleOnly: true, hardwareConfirmed: false
      });
    });

    function get(id) { return records.has(id) ? copy(records.get(id)) : null; }
    function list() { return ids.map(get); }
    function selectedIds() { return ids.filter(function (id) { return selection.has(id); }); }

    function idsReason(targetIds) {
      if (!Array.isArray(targetIds) || targetIds.length > ids.length) return '目标 ID 列表无效或超出资源界限';
      if (targetIds.some(function (id) { return !records.has(id); })) return '存在未知关节 ID';
      if (new Set(targetIds).size !== targetIds.length) return '目标 ID 不可重复';
      return '';
    }

    function select(targetIds) {
      const reason = idsReason(targetIds);
      if (reason) return { valid: false, reason: reason, selectedIds: selectedIds() };
      selection = new Set(targetIds);
      return { valid: true, reason: '', selectedIds: selectedIds() };
    }

    function preview(id, section, patch) {
      const result = { id: id, valid: false, changed: false, changes: [], reason: '' };
      if (!records.has(id)) { result.reason = '未知关节 ID'; return result; }
      if (section !== 'parameters' && section !== 'calibration') { result.reason = '未知草稿分区'; return result; }
      const keys = section === 'parameters' ? parameterKeys : calibrationKeys;
      const patchReason = keysReason(patch, keys, false);
      if (patchReason) { result.reason = patchReason; return result; }
      const current = records.get(id)[section];
      const next = Object.assign({}, current, patch);
      const reason = section === 'parameters' ? parametersReason(next, true) : calibrationReason(next, false);
      if (reason) { result.reason = reason; return result; }
      Object.keys(patch).forEach(function (field) {
        if (current[field] !== patch[field]) result.changes.push({ field: field, before: current[field], after: patch[field] });
      });
      result.valid = true;
      result.changed = result.changes.length > 0;
      return result;
    }

    function applyResult(section, result) {
      if (!result.changed) return;
      const row = records.get(result.id);
      result.changes.forEach(function (change) { row[section][change.field] = change.after; });
      row.version += 1;
    }

    function set(id, section, patch) {
      const result = preview(id, section, patch);
      if (result.valid) applyResult(section, result);
      return result;
    }

    function previewBatch(section, patch, targetIds) {
      const targets = targetIds === undefined ? selectedIds() : targetIds;
      const reason = idsReason(targets);
      if (reason || !targets.length) return { valid: false, applied: false, results: [], reason: reason || '未选择关节' };
      const results = targets.map(function (id) { return preview(id, section, patch); });
      const valid = results.every(function (result) { return result.valid; });
      return { valid: valid, applied: false, results: results, reason: valid ? '' : '草稿校验失败；未批量修改' };
    }

    function applyBatch(section, patch, targetIds) {
      const report = previewBatch(section, patch, targetIds);
      // Atomic local draft update: a bad row does not leave a partial edit behind.
      if (report.valid) {
        report.results.forEach(function (result) { applyResult(section, result); });
        report.applied = true;
      }
      return report;
    }

    function exportJSON() {
      return JSON.stringify({
        format: 'hatchery-servo-drafts', version: 1,
        profileId: hd1910.id, model: hd1910.model,
        sampleOnly: true, hardwareConfirmed: false, joints: list()
      }, null, 2);
    }

    function importJSON(text) {
      const rejected = function (reason) { return { valid: false, applied: false, results: [], reason: reason }; };
      if (typeof text !== 'string' || text.length > maxImportBytes || utf8Length(text) > maxImportBytes) {
        return rejected('导入仅接受不超过 128 KiB 的 JSON 文本');
      }
      let document;
      try { document = JSON.parse(text); }
      catch (error) { return rejected('JSON 格式无效'); }
      const documentKeys = ['format', 'version', 'profileId', 'model', 'sampleOnly', 'hardwareConfirmed', 'joints'];
      const reason = keysReason(document, documentKeys, true);
      if (reason) return rejected(reason);
      if (document.format !== 'hatchery-servo-drafts' || document.version !== 1 ||
          document.profileId !== hd1910.id || document.model !== hd1910.model ||
          document.sampleOnly !== true || document.hardwareConfirmed !== false) {
        return rejected('草稿版本 / 型号 / profile 或样例声明不匹配；不接受硬件标定声明');
      }
      if (!Array.isArray(document.joints) || !document.joints.length || document.joints.length > ids.length) {
        return rejected('关节草稿列表无效或超出资源界限');
      }
      const seen = new Set();
      const replacements = [];
      const results = [];
      for (const row of document.joints) {
        const rowReason = keysReason(row, ['id', 'parameters', 'calibration', 'version', 'sampleOnly', 'hardwareConfirmed'], true);
        if (rowReason) return rejected(rowReason);
        if (!records.has(row.id) || seen.has(row.id)) return rejected('导入含未知或重复关节 ID');
        seen.add(row.id);
        if (row.sampleOnly !== true || row.hardwareConfirmed !== false ||
            !Number.isInteger(row.version) || row.version < 0 || row.version > numericDraftBound) {
          return rejected('关节草稿声明或本地版本无效');
        }
        const parameterReason = parametersReason(row.parameters, true);
        const calibrationShape = keysReason(row.calibration, calibrationKeys, true);
        const calReason = calibrationShape || calibrationReason(row.calibration, false);
        if (parameterReason || calReason) return rejected(parameterReason || calReason);
        const parameterResult = preview(row.id, 'parameters', row.parameters);
        const calibrationResult = preview(row.id, 'calibration', row.calibration);
        const changes = parameterResult.changes.map(function (change) { return Object.assign({ section: 'parameters' }, change); })
          .concat(calibrationResult.changes.map(function (change) { return Object.assign({ section: 'calibration' }, change); }));
        results.push({ id: row.id, valid: true, changed: changes.length > 0, changes: changes, reason: '' });
        replacements.push({ id: row.id, parameters: copy(row.parameters), calibration: copy(row.calibration), changed: changes.length > 0 });
      }
      // Validation is complete before the first mutation; file revisions are never authoritative.
      replacements.forEach(function (replacement) {
        const current = records.get(replacement.id);
        if (replacement.changed) {
          current.parameters = replacement.parameters;
          current.calibration = replacement.calibration;
          current.version += 1;
        }
      });
      return { valid: true, applied: true, results: results, reason: '' };
    }

    function snapshot() {
      return {
        profileId: hd1910.id, model: hd1910.model, sampleOnly: true,
        hardwareConfirmed: false, selectedIds: selectedIds(), joints: list()
      };
    }

    return Object.freeze({
      get: get, list: list, select: select, selectedIds: selectedIds,
      setParameters: function (id, patch) { return set(id, 'parameters', patch); },
      setCalibration: function (id, patch) { return set(id, 'calibration', patch); },
      previewBatch: previewBatch, applyBatch: applyBatch,
      exportJSON: exportJSON, importJSON: importJSON, snapshot: snapshot
    });
  }

  function utf8Length(text) {
    // Bound file bytes in both browser and Node without depending on TextEncoder.
    let length = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code <= 0x7f) length += 1;
      else if (code <= 0x7ff) length += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length &&
               text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
        length += 4; index += 1;
      } else length += 3;
      if (length > maxImportBytes) return length;
    }
    return length;
  }

  return Object.freeze({
    hd1910: hd1910, fields: fields, defaultIds: defaultIds,
    calibrationKeys: calibrationKeys, maxImportBytes: maxImportBytes,
    referencePosition: referencePosition, calibrationPreview: calibrationPreview,
    createReferenceFixture: createReferenceFixture, createDraftStore: createDraftStore
  });
});
