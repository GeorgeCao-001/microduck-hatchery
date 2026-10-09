(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JointDrafts = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Reference mapping only. Display order never defines a runtime or policy index.
  const metadata = [
    [20, '左髋 Yaw', 'left_hip_yaw', '左腿', 0, 0],
    [21, '左髋 Roll', 'left_hip_roll', '左腿', 1, 1],
    [22, '左髋 Pitch', 'left_hip_pitch', '左腿', 2, 2],
    [23, '左膝', 'left_knee', '左腿', 3, 3],
    [24, '左踝', 'left_ankle', '左腿', 4, 4],
    [10, '右髋 Yaw', 'right_hip_yaw', '右腿', 10, 9],
    [11, '右髋 Roll', 'right_hip_roll', '右腿', 11, 10],
    [12, '右髋 Pitch', 'right_hip_pitch', '右腿', 12, 11],
    [13, '右膝', 'right_knee', '右腿', 13, 12],
    [14, '右踝', 'right_ankle', '右腿', 14, 13],
    [30, '颈部 Pitch', 'neck_pitch', '头颈', 5, 5],
    [31, '头部 Pitch', 'head_pitch', '头颈', 6, 6],
    [32, '头部 Yaw', 'head_yaw', '头颈', 7, 7],
    [33, '头部 Roll', 'head_roll', '头颈', 8, 8],
    [34, '嘴部', 'mouth', '头颈', 9, null]
  ].map(function (row, index) {
    return Object.freeze({
      id: row[0], name: row[1], raw: row[2], group: row[3],
      displayOrder: index + 1, runtimeIndex: row[4], policyIndex: row[5],
      calibration: null, physicalRange: null
    });
  });
  Object.freeze(metadata);
  const byId = new Map(metadata.map(function (joint) { return [joint.id, joint]; }));

  // These bounds are invented UI fixtures, NOT FT registers or physical limits.
  const ranges = {};
  metadata.forEach(function (joint) {
    ranges[joint.id] = Object.freeze({
      min: 0, max: joint.id === 34 ? 127 : 255, step: 1,
      initial: joint.id === 34 ? 64 : 128
    });
  });
  const sampleConfig = Object.freeze({
    source: 'sample', sampleOnly: true, unit: 'ticks',
    mappingVersion: 'hatchery-reference-15-v1', calibrationVersion: null,
    rangeVersion: 'ui-fixture-v1',
    rangeLabel: '仅供草稿交互的样例范围；实机限位未知',
    ranges: Object.freeze(ranges)
  });
  const mirrorAvailability = Object.freeze({
    available: false,
    reason: '缺少已验证的方向、零位、比例与语义镜像符号'
  });

  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === 'object') {
      const result = {};
      Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
      return result;
    }
    return value;
  }

  function jointFor(id) {
    const joint = byId.get(Number(id));
    if (!joint) throw new RangeError('未知关节 ID：' + String(id));
    return joint;
  }

  function validate(id, value) {
    const range = ranges[id];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { valid: false, reason: '请输入有效的 ticks 数值' };
    }
    if (!Number.isInteger(value)) return { valid: false, reason: '样例 ticks 需为整数' };
    if (value < range.min || value > range.max) {
      return { valid: false, reason: '超出样例编辑范围 ' + range.min + '–' + range.max + ' ticks；未自动裁剪' };
    }
    return { valid: true, reason: '' };
  }

  function createStore() {
    const drafts = {}, feedback = {}, results = {};
    let selection = new Set(metadata.map(function (joint) { return joint.id; }));
    let batchCount = 0, lastBatch = null;
    metadata.forEach(function (joint) {
      drafts[joint.id] = { value: ranges[joint.id].initial, version: 0 };
      results[joint.id] = null;
    });

    function refreshSampleFeedback() {
      const generatedAtUnix = Math.floor(Date.now() / 1000);
      metadata.forEach(function (joint) {
        const hasSample = joint.id === 23;
        feedback[joint.id] = {
          value: hasSample ? 126 : null, goal: hasSample ? 128 : null,
          temp: hasSample ? 32 : null, volt: hasSample ? 7.8 : null, load: null,
          source: 'sample', sampleOnly: true, generatedAtUnix: generatedAtUnix,
          timeSource: 'browser-sample-generation', calibrationVersion: null
        };
      });
      return copy(feedback);
    }
    refreshSampleFeedback();

    function updateSampleFeedback(frame) {
      if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
        return { accepted: false, reason: '样例反馈帧格式无效' };
      }
      if (frame.source !== 'sample' || frame.sampleOnly !== true) {
        return { accepted: false, reason: '只接受明确标记的浏览器样例反馈' };
      }
      if (typeof frame.id !== 'number' || !Number.isInteger(frame.id) || !byId.has(frame.id)) {
        return { accepted: false, reason: '样例反馈关节 ID 无效' };
      }
      if (typeof frame.t !== 'number' || !Number.isFinite(frame.t) || frame.t < 0) {
        return { accepted: false, reason: '样例反馈相对时间无效' };
      }
      const fields = ['actual', 'goal', 'temp', 'volt', 'load'];
      const values = {};
      for (const field of fields) {
        const value = frame[field];
        if (value === null || value === undefined) values[field] = null;
        else if (typeof value === 'number' && Number.isFinite(value)) values[field] = value;
        else return { accepted: false, reason: '样例反馈 ' + field + ' 必须为有限数值或 null' };
      }
      // This is a local sample arrival, not a device observation or command ack.
      // Missing measurements stay null; feedback never mutates the draft layer.
      feedback[frame.id] = {
        value: values.actual, goal: values.goal, temp: values.temp, volt: values.volt,
        load: values.load, source: 'sample', sampleOnly: true,
        generatedAtUnix: Math.floor(Date.now() / 1000),
        timeSource: 'browser-sample-generation', relativeSeconds: frame.t,
        calibrationVersion: null
      };
      return { accepted: true, id: frame.id, feedback: copy(feedback[frame.id]) };
    }

    function getDraft(id) {
      id = jointFor(id).id;
      return Object.assign(copy(drafts[id]), validate(id, drafts[id].value));
    }

    function setDraft(id, value) {
      id = jointFor(id).id;
      // Preserve an invalid numeric-field edit so validation can explain it.
      // Invalid drafts can never pass the explicit sample check or pose loading.
      if (!Object.is(drafts[id].value, value)) {
        drafts[id] = { value: value, version: drafts[id].version + 1 };
      }
      return getDraft(id);
    }

    function getFeedback(id, mode) {
      id = jointFor(id).id;
      mode = mode || 'example';
      const knownMode = ['example', 'readonly', 'read-only', 'stale', 'offline'].includes(mode);
      const offline = mode === 'offline' || !knownMode;
      const stale = mode === 'stale';
      const item = copy(feedback[id]);
      const available = !offline && item.value !== null;
      if (offline) item.value = item.goal = item.temp = item.volt = item.load = null;
      return Object.assign(item, {
        available: available, stale: stale, valid: available && !stale,
        ageSeconds: stale ? 12 : available ? 0 : null,
        ageLabel: offline ? '离线' : stale && available ? '12 秒前（样例）' : available ? '样例时间' : '无反馈',
        reason: !knownMode ? '未知状态，反馈不可用' : offline ? '离线，跳过反馈' :
          stale ? '反馈陈旧，未填入草稿' : !available ? '没有有效反馈' : ''
      });
    }

    function selectedIds() {
      return metadata.filter(function (joint) { return selection.has(joint.id); })
        .map(function (joint) { return joint.id; });
    }

    function setSelection(scope) {
      const groups = { left: '左腿', right: '右腿', head: '头颈' };
      if (!['all', 'left', 'right', 'head', 'none'].includes(scope)) {
        throw new RangeError('未知选择范围：' + String(scope));
      }
      selection = new Set(metadata.filter(function (joint) {
        return scope === 'all' || joint.group === groups[scope];
      }).map(function (joint) { return joint.id; }));
      return selectedIds();
    }

    function select(id, selected) {
      id = jointFor(id).id;
      if (selected) selection.add(id);
      else selection.delete(id);
      return selectedIds();
    }

    function fillFromFeedback(mode) {
      const report = { applied: [], skipped: [] };
      selectedIds().forEach(function (id) {
        const item = getFeedback(id, mode);
        if (!item.valid) report.skipped.push({ id: id, reason: item.reason });
        else {
          const checked = validate(id, item.value);
          if (!checked.valid) report.skipped.push({ id: id, reason: checked.reason });
          else {
            setDraft(id, item.value);
            report.applied.push({ id: id, value: item.value });
          }
        }
      });
      return report;
    }

    function previewApply(mode) {
      const targets = selectedIds().map(function (id) {
        return Object.assign({ id: id }, copy(drafts[id]));
      });
      const counts = { passed: 0, skipped: 0, failed: 0 };
      const batchResults = targets.map(function (target) {
        const checked = validate(target.id, target.value);
        const item = getFeedback(target.id, mode);
        const status = !checked.valid ? 'failed' : !item.valid ? 'skipped' : 'passed';
        const reason = !checked.valid ? checked.reason : !item.valid ? item.reason :
          '样例检查通过；未发送、未写入，也未确认到位';
        const result = { id: target.id, status: status, reason: reason, source: 'sample', sampleOnly: true };
        counts[status] += 1;
        results[target.id] = copy(result);
        return result;
      });
      let summary;
      if (!targets.length) summary = '未选择关节；未发送任何命令';
      else if (counts.failed || counts.skipped) {
        summary = '样例检查：' + counts.passed + ' 项通过、' + counts.skipped + ' 项跳过、' + counts.failed + ' 项失败；未发送';
      } else summary = '所选 ' + counts.passed + ' 项样例检查通过；未发送、未确认到位';
      batchCount += 1;
      lastBatch = {
        id: batchCount, source: 'sample', sampleOnly: true, unit: 'ticks',
        summary: summary, targets: targets, results: batchResults, counts: counts
      };
      return copy(lastBatch);
    }

    function savePose(name) {
      return {
        format: 'microduck-hatchery/sample-joint-pose', version: 1,
        name: typeof name === 'string' && name.trim() ? name.trim() : '样例草稿姿态',
        source: 'sample', sampleOnly: true, unit: 'ticks',
        mappingVersion: sampleConfig.mappingVersion,
        calibrationVersion: sampleConfig.calibrationVersion,
        rangeVersion: sampleConfig.rangeVersion,
        targets: metadata.map(function (joint) {
          return {
            id: joint.id, raw: joint.raw, runtimeIndex: joint.runtimeIndex,
            policyIndex: joint.policyIndex, value: drafts[joint.id].value
          };
        })
      };
    }

    function loadPose(pose) {
      const report = { applied: [], skipped: [] };
      let incompatible = '';
      if (!pose || typeof pose !== 'object' || Array.isArray(pose)) incompatible = '姿态格式无效';
      else if (pose.format !== 'microduck-hatchery/sample-joint-pose' || pose.version !== 1) incompatible = '姿态格式或版本不兼容';
      else if (pose.source !== 'sample' || pose.sampleOnly !== true) incompatible = '只接受本地样例草稿姿态';
      else if (pose.unit !== 'ticks') incompatible = '姿态单位不兼容，需要 ticks';
      else if (pose.mappingVersion !== sampleConfig.mappingVersion) incompatible = '关节映射版本不兼容';
      else if (pose.calibrationVersion !== sampleConfig.calibrationVersion) incompatible = '校准版本不兼容；当前校准未知';
      else if (pose.rangeVersion !== sampleConfig.rangeVersion) incompatible = '样例编辑范围版本不兼容';
      else if (!Array.isArray(pose.targets) || !pose.targets.length) incompatible = '姿态目标列表无效';
      if (incompatible) {
        metadata.forEach(function (joint) { report.skipped.push({ id: joint.id, reason: incompatible }); });
        return report;
      }

      const idCounts = new Map();
      pose.targets.forEach(function (target) {
        if (target && typeof target === 'object') idCounts.set(target.id, (idCounts.get(target.id) || 0) + 1);
      });
      // Validate every field of each target before changing any compatible draft.
      const compatible = [];
      pose.targets.forEach(function (target) {
        if (!target || typeof target !== 'object' || Array.isArray(target)) {
          report.skipped.push({ id: null, reason: '目标条目格式无效' });
          return;
        }
        const joint = byId.get(target.id);
        let reason = '';
        if (!joint) reason = '未知关节 ID，未加载';
        else if (!selection.has(joint.id)) reason = '关节未选择，保留原草稿';
        else if (idCounts.get(target.id) !== 1) reason = '姿态中存在重复关节 ID，未加载';
        else if (target.raw !== joint.raw || target.runtimeIndex !== joint.runtimeIndex || target.policyIndex !== joint.policyIndex) reason = '关节名称或运行时/策略映射不兼容';
        else reason = validate(joint.id, target.value).reason;
        if (reason) report.skipped.push({ id: target.id, reason: reason });
        else compatible.push({ id: joint.id, value: target.value });
      });
      compatible.forEach(function (target) {
        setDraft(target.id, target.value);
        report.applied.push(copy(target));
      });
      return report;
    }

    function snapshot() {
      return {
        drafts: copy(drafts), feedback: copy(feedback), selectedIds: selectedIds(),
        results: copy(results), lastBatch: copy(lastBatch), batchCount: batchCount
      };
    }

    return {
      getDraft: getDraft, setDraft: setDraft, getFeedback: getFeedback,
      refreshSampleFeedback: refreshSampleFeedback, updateSampleFeedback: updateSampleFeedback,
      selectedIds: selectedIds,
      setSelection: setSelection, select: select, fillFromFeedback: fillFromFeedback,
      previewApply: previewApply, savePose: savePose, loadPose: loadPose, snapshot: snapshot
    };
  }

  return Object.freeze({
    metadata: metadata, sampleConfig: sampleConfig,
    mirrorAvailability: mirrorAvailability, createStore: createStore
  });
});
