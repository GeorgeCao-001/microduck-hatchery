(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JointViewerGeometry = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Resource bounds describe this viewer's accepted asset format, not hardware.
  const limits = Object.freeze({
    bodies: 128, meshes: 128, geoms: 512,
    verticesPerMesh: 250000, trianglesPerMesh: 500000,
    totalVertices: 1000000, totalTriangles: 2000000,
    binaryBytes: 64 * 1024 * 1024
  });
  const jointIds = Object.freeze([20, 21, 22, 23, 24, 10, 11, 12, 13, 14, 30, 31, 32, 33, 34]);

  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' 必须是对象');
  }

  function vector(value, size, label, nonzero) {
    if (!Array.isArray(value) || value.length !== size ||
        !value.every(function (item) { return typeof item === 'number' && Number.isFinite(item); })) {
      throw new TypeError(label + ' 必须包含 ' + size + ' 个有限数值');
    }
    if (nonzero && (!(Math.hypot.apply(Math, value) > 1e-12) || !Number.isFinite(Math.hypot.apply(Math, value)))) {
      throw new RangeError(label + ' 不能是零长度或无法归一化的向量');
    }
  }

  function integer(value, min, max, label) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(label + ' 超出有效整数范围');
  }

  function descriptorRanges(descriptor) {
    object(descriptor, '网格描述');
    integer(descriptor.voff, 0, limits.binaryBytes, '顶点 offset');
    integer(descriptor.ioff, 0, limits.binaryBytes, '索引 offset');
    integer(descriptor.nverts, 1, limits.verticesPerMesh, '顶点 count');
    integer(descriptor.ntris, 1, limits.trianglesPerMesh, '三角形 count');
    if (descriptor.index_bytes !== 2 && descriptor.index_bytes !== 4) throw new RangeError('索引宽度仅支持 2 或 4 bytes');
    vector(descriptor.bbox_min, 3, 'bbox_min');
    vector(descriptor.bbox_max, 3, 'bbox_max');
    for (let axis = 0; axis < 3; axis += 1) {
      const lo = descriptor.bbox_min[axis], hi = descriptor.bbox_max[axis];
      if (hi < lo || !Number.isFinite(hi - lo) || !Number.isFinite(Math.fround(lo)) || !Number.isFinite(Math.fround(hi))) {
        throw new RangeError('网格 bbox 范围倒置或超出 Float32 可显示范围');
      }
    }
    const vertexEnd = descriptor.voff + descriptor.nverts * 6;
    const indexEnd = descriptor.ioff + descriptor.ntris * 3 * descriptor.index_bytes;
    if (vertexEnd > limits.binaryBytes || indexEnd > limits.binaryBytes) throw new RangeError('网格字节范围超出资源上限');
    if (descriptor.voff < indexEnd && descriptor.ioff < vertexEnd) throw new RangeError('同一网格顶点与索引字节范围重叠');
    return { vertexEnd: vertexEnd, indexEnd: indexEnd };
  }

  function validateModel(model) {
    object(model, '模型');
    if (!Array.isArray(model.bodies) || !model.bodies.length || model.bodies.length > limits.bodies) {
      throw new RangeError('模型 bodies 数量超出有效范围');
    }
    object(model.meshes, '模型 meshes');
    const meshNames = Object.keys(model.meshes);
    if (!meshNames.length || meshNames.length > limits.meshes) throw new RangeError('模型 meshes 数量超出有效范围');
    let totalVertices = 0, totalTriangles = 0;
    meshNames.forEach(function (name) {
      const descriptor = model.meshes[name];
      descriptorRanges(descriptor);
      totalVertices += descriptor.nverts;
      totalTriangles += descriptor.ntris;
    });
    if (totalVertices > limits.totalVertices || totalTriangles > limits.totalTriangles) throw new RangeError('模型网格总资源超出上限');

    const seenIds = new Set(), names = new Set();
    let geomCount = 0;
    model.bodies.forEach(function (body, index) {
      object(body, 'body');
      if (typeof body.name !== 'string' || !body.name || body.name.length > 256 || names.has(body.name)) throw new TypeError('body 名称必须非空且唯一');
      names.add(body.name);
      integer(body.parent, -1, index - 1, 'body parent');
      if ((index === 0) !== (body.parent === -1)) throw new RangeError('模型仅允许首个 body 为根；父 body 必须先于子 body');
      vector(body.pos, 3, 'body pos');
      // Quaternions are stored in wxyz order. The renderer owns conversion to xyzw.
      vector(body.quat, 4, 'body quat (wxyz)', true);
      if (body.joint !== null && body.joint !== undefined) {
        object(body.joint, 'joint');
        if (!jointIds.includes(body.joint.id) || seenIds.has(body.joint.id)) throw new RangeError('joint ID 未知或重复');
        seenIds.add(body.joint.id);
        vector(body.joint.axis, 3, 'joint axis', true);
      }
      if (!Array.isArray(body.geoms)) throw new TypeError('body geoms 必须是数组');
      geomCount += body.geoms.length;
      if (geomCount > limits.geoms) throw new RangeError('模型 geoms 总数超出上限');
      body.geoms.forEach(function (geom) {
        object(geom, 'geom');
        if (typeof geom.mesh !== 'string' || !Object.prototype.hasOwnProperty.call(model.meshes, geom.mesh)) throw new RangeError('geom 引用了未知网格');
        vector(geom.pos, 3, 'geom pos');
        vector(geom.quat, 4, 'geom quat (wxyz)', true);
        vector(geom.rgba, 4, 'geom rgba');
        if (geom.rgba.some(function (value) { return value < 0 || value > 1; })) throw new RangeError('geom rgba 需在 0–1 范围');
      });
    });
    if (seenIds.size !== jointIds.length || jointIds.some(function (id) { return !seenIds.has(id); })) {
      throw new RangeError('模型必须保留全部 15 个关节 ID（含嘴部 #34）');
    }
    return model;
  }

  function decodeMesh(descriptor, buffer) {
    const ranges = descriptorRanges(descriptor);
    if (!(buffer instanceof ArrayBuffer)) throw new TypeError('网格数据必须是 ArrayBuffer');
    if (buffer.byteLength > limits.binaryBytes) throw new RangeError('网格二进制超出资源上限');
    if (ranges.vertexEnd > buffer.byteLength || ranges.indexEnd > buffer.byteLength) throw new RangeError('网格 offset/count 超出二进制长度');
    const bytes = new DataView(buffer);
    const positions = new Float32Array(descriptor.nverts * 3);
    const indices = descriptor.index_bytes === 2 ? new Uint16Array(descriptor.ntris * 3) : new Uint32Array(descriptor.ntris * 3);
    const spans = descriptor.bbox_max.map(function (hi, axis) { return hi - descriptor.bbox_min[axis]; });
    for (let index = 0; index < positions.length; index += 1) {
      const axis = index % 3;
      const quantized = bytes.getInt16(descriptor.voff + index * 2, true);
      // Upstream packs q = round(normalized * 65535 - 32768), little endian.
      positions[index] = descriptor.bbox_min[axis] + (quantized + 32768) / 65535 * spans[axis];
    }
    for (let index = 0; index < indices.length; index += 1) {
      const offset = descriptor.ioff + index * descriptor.index_bytes;
      const vertex = descriptor.index_bytes === 2 ? bytes.getUint16(offset, true) : bytes.getUint32(offset, true);
      if (vertex >= descriptor.nverts) throw new RangeError('三角形索引超出顶点数量');
      indices[index] = vertex;
    }
    return { positions: positions, indices: indices };
  }

  return Object.freeze({ limits: limits, validateModel: validateModel, decodeMesh: decodeMesh });
});
