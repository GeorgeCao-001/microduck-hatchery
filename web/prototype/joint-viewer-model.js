(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./joint-drafts.js'));
  } else root.JointViewerModel = factory(root.JointDrafts);
})(typeof window !== 'undefined' ? window : globalThis, function (JointDrafts) {
  'use strict';

  if (!JointDrafts || !JointDrafts.metadata || !JointDrafts.sampleConfig) {
    throw new TypeError('3D 样例姿态需要 JointDrafts 元数据');
  }

  // This is a deliberately invented visual mapping of UI fixtures. It does not
  // describe FT ticks/revolution, physical direction, calibration or limits.
  const mapping = Object.freeze({
    version: 'ui-visual-demo-v1', source: 'sample', sampleOnly: true,
    inputUnit: 'ticks', unit: 'radians', calibrationVersion: null,
    jointSpanDegrees: 45, mouthSpanDegrees: 20,
    label: '仅供 3D 展示的样例角度映射；不代表实机校准或运动限位'
  });
  const states = ['example', 'readonly', 'read-only', 'stale', 'offline'];

  function mapValue(id, value, requireInteger) {
    const range = JointDrafts.sampleConfig.ranges[id];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { angle: null, reason: '无有效样例 ticks，显示参考姿态' };
    }
    if (requireInteger && !Number.isInteger(value)) {
      return { angle: null, reason: '样例草稿 ticks 需为整数，显示参考姿态' };
    }
    if (value < range.min || value > range.max) {
      return { angle: null, reason: '超出样例视觉映射范围，显示参考姿态；未裁剪数值' };
    }
    // Preserve the fixture's exact neutral point despite asymmetric endpoints.
    const denominator = value < range.initial ? range.initial - range.min : range.max - range.initial;
    const normalized = (value - range.initial) / denominator;
    const span = id === 34 ? mapping.mouthSpanDegrees : mapping.jointSpanDegrees;
    return { angle: normalized * span * Math.PI / 180, reason: '' };
  }

  function poseFromStore(store, mode, state) {
    mode = mode === undefined ? 'draft' : mode;
    state = state === undefined ? 'example' : state;
    if (mode !== 'draft' && mode !== 'feedback') throw new RangeError('未知 3D 姿态来源：' + String(mode));
    if (!states.includes(state)) throw new RangeError('未知控制台状态：' + String(state));
    const method = mode === 'draft' ? 'getDraft' : 'getFeedback';
    if (!store || typeof store[method] !== 'function') throw new TypeError('3D 姿态需要只读草稿/反馈访问器');

    const joints = JointDrafts.metadata.map(function (joint) {
      const item = mode === 'draft' ? store.getDraft(joint.id) : store.getFeedback(joint.id, state);
      const row = {
        id: joint.id, raw: joint.raw, name: joint.name,
        source: 'sample', sampleOnly: true, mode: mode,
        angle: null, available: false, stale: false,
        referenceAngle: 0, referenceOnly: true,
        value: item && item.value !== undefined ? item.value : null,
        reason: ''
      };
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        row.reason = '没有姿态数据，显示参考姿态';
        return row;
      }
      if (item.unit !== undefined && item.unit !== mapping.inputUnit) {
        row.reason = '输入单位不是样例 ticks，未转换；显示参考姿态';
        return row;
      }
      if (mode === 'feedback') {
        row.stale = state === 'stale' || item.stale === true;
        if (item.source !== 'sample' || item.sampleOnly !== true) {
          row.reason = '反馈未明确标记为样例，未套用样例角度映射';
          return row;
        }
        if (state === 'offline' || item.available !== true) {
          row.reason = item.reason || (state === 'offline' ? '离线，无反馈；显示参考姿态' : '无反馈，显示参考姿态');
          return row;
        }
      } else if (item.valid !== true) {
        row.reason = item.reason || '草稿无效，显示参考姿态';
        return row;
      }

      const mapped = mapValue(joint.id, item.value, mode === 'draft');
      row.angle = mapped.angle;
      row.available = mapped.angle !== null;
      row.referenceOnly = !row.available;
      row.reason = mapped.reason || (row.stale ? '陈旧样例反馈，仅显示最后参考；不代表当前实测姿态' : '');
      return row;
    });

    return {
      mode: mode, state: state, source: mapping.source, sampleOnly: true,
      unit: mapping.unit, inputUnit: mapping.inputUnit,
      mappingVersion: mapping.version, calibrationVersion: null,
      label: mapping.label, joints: joints,
      summary: {
        total: joints.length,
        available: joints.filter(function (joint) { return joint.available; }).length,
        missing: joints.filter(function (joint) { return !joint.available; }).length,
        stale: joints.filter(function (joint) { return joint.available && joint.stale; }).length
      }
    };
  }

  return Object.freeze({ mapping: mapping, poseFromStore: poseFromStore });
});
