'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Geometry = require('../prototype/joint-viewer-geometry.js');
const ids = [20, 21, 22, 23, 24, 10, 11, 12, 13, 14, 30, 31, 32, 33, 34];
const clone = value => JSON.parse(JSON.stringify(value));

function triangle(indexBytes = 2) {
  const descriptor = {
    voff: 4, nverts: 3, ioff: 24, ntris: 1, index_bytes: indexBytes,
    bbox_min: [-1, 2, -3], bbox_max: [3, 6, 5]
  };
  const buffer = new ArrayBuffer(24 + indexBytes * 3);
  const bytes = new DataView(buffer);
  const quantized = [-32768, -32768, -32768, 32767, -32768, -32768, -32768, 32767, 32767];
  quantized.forEach((value, index) => bytes.setInt16(4 + index * 2, value, true));
  [0, 1, 2].forEach((value, index) => indexBytes === 2 ? bytes.setUint16(24 + index * 2, value, true) : bytes.setUint32(24 + index * 4, value, true));
  return { descriptor, buffer };
}

function modelFixture() {
  return {
    bodies: [{ name: 'base', parent: -1, pos: [0, 0, 0], quat: [1, 0, 0, 0], joint: null, geoms: [] },
      ...ids.map((id, index) => ({ name: 'joint-' + id, parent: index, pos: [0, 0, 0.01], quat: [1, 0, 0, 0],
        joint: { id, axis: [0, 0, 1] }, geoms: [] }))],
    meshes: { triangle: triangle().descriptor }
  };
}

test('quantized little-endian triangle decodes exact bbox endpoints and triangle winding for 16/32-bit indices', () => {
  [2, 4].forEach(indexBytes => {
    const fixture = triangle(indexBytes);
    const before = new Uint8Array(fixture.buffer).slice();
    const descriptor = clone(fixture.descriptor);
    const decoded = Geometry.decodeMesh(fixture.descriptor, fixture.buffer);
    assert.ok(decoded.positions instanceof Float32Array);
    assert.ok(decoded.indices instanceof (indexBytes === 2 ? Uint16Array : Uint32Array));
    assert.deepEqual([...decoded.positions], [-1, 2, -3, 3, 2, -3, -1, 6, 5]);
    assert.deepEqual([...decoded.indices], [0, 1, 2]);
    assert.deepEqual(new Uint8Array(fixture.buffer), before);
    assert.deepEqual(fixture.descriptor, descriptor);
  });
});

test('flat bounding-box axes remain fixed and the signed midpoint is not mistaken for unsigned coordinates', () => {
  const fixture = triangle();
  fixture.descriptor.bbox_min = [-1, 7, -1];
  fixture.descriptor.bbox_max = [1, 7, 1];
  new DataView(fixture.buffer).setInt16(fixture.descriptor.voff, -1, true);
  const decoded = Geometry.decodeMesh(fixture.descriptor, fixture.buffer);
  assert.ok(decoded.positions[0] < 0 && Math.abs(decoded.positions[0]) < 0.00002);
  assert.deepEqual([decoded.positions[1], decoded.positions[4], decoded.positions[7]], [7, 7, 7]);
});

test('32-bit indices retain vertex IDs above 65535', () => {
  const descriptor = { voff: 0, nverts: 65537, ioff: 65537 * 6, ntris: 1, index_bytes: 4,
    bbox_min: [0, 0, 0], bbox_max: [0, 0, 0] };
  const buffer = new ArrayBuffer(descriptor.ioff + 12);
  const bytes = new DataView(buffer);
  [65534, 65535, 65536].forEach((value, index) => bytes.setUint32(descriptor.ioff + index * 4, value, true));
  assert.deepEqual([...Geometry.decodeMesh(descriptor, buffer).indices], [65534, 65535, 65536]);
});

test('bad offsets, counts, widths, overlapping spans and truncated binaries fail before decoding', () => {
  const fixture = triangle();
  const mutations = [
    { voff: -1 }, { voff: 0.5 }, { ioff: '24' }, { nverts: 0 }, { nverts: 3.5 },
    { ntris: -1 }, { index_bytes: 1 }, { index_bytes: 8 },
    { ioff: 10 }, { voff: Number.MAX_SAFE_INTEGER },
    { nverts: Geometry.limits.verticesPerMesh + 1 },
    { ntris: Geometry.limits.trianglesPerMesh + 1 }
  ];
  mutations.forEach(mutation => assert.throws(() => Geometry.decodeMesh({ ...fixture.descriptor, ...mutation }, fixture.buffer), RangeError));
  assert.throws(() => Geometry.decodeMesh(fixture.descriptor, fixture.buffer.slice(0, 29)), /二进制长度/);
  assert.throws(() => Geometry.decodeMesh(fixture.descriptor, new Uint8Array(fixture.buffer)), TypeError);
  assert.throws(() => Geometry.decodeMesh(fixture.descriptor, new ArrayBuffer(Geometry.limits.binaryBytes + 1)), /资源上限/);
});

test('nonfinite, reversed or unrepresentable bbox data and out-of-range indices cannot reach the renderer', () => {
  const fixture = triangle();
  [
    { bbox_min: [NaN, 0, 0] }, { bbox_max: [Infinity, 0, 0] },
    { bbox_min: [0, 0] }, { bbox_min: [4, 2, -3] },
    { bbox_max: [Number.MAX_VALUE, 6, 5] }
  ].forEach(mutation => assert.throws(() => Geometry.decodeMesh({ ...fixture.descriptor, ...mutation }, fixture.buffer)));
  new DataView(fixture.buffer).setUint16(fixture.descriptor.ioff, 3, true);
  assert.throws(() => Geometry.decodeMesh(fixture.descriptor, fixture.buffer), /索引超出顶点/);
});

test('model validation returns the unchanged model only when parent topology and all 15 physical IDs are valid', () => {
  const model = modelFixture();
  const before = clone(model);
  assert.equal(Geometry.validateModel(model), model);
  assert.deepEqual(model, before);
  const bad = [
    model => { model.bodies[1].parent = 1; },
    model => { model.bodies[1].parent = 2; },
    model => { model.bodies[1].parent = -1; },
    model => { model.bodies[0].parent = 0; },
    model => { model.bodies[1].joint.id = 200; },
    model => { model.bodies[2].joint.id = 20; },
    model => { model.bodies.pop(); }
  ];
  bad.forEach(change => {
    const mutated = clone(model);
    change(mutated);
    assert.throws(() => Geometry.validateModel(mutated), RangeError);
  });
});

test('body and geom transforms, joint axes and mesh references are checked without inventing missing transforms', () => {
  const original = modelFixture();
  original.bodies[0].geoms = [{ mesh: 'triangle', pos: [0, 0, 0], quat: [1, 0, 0, 0], rgba: [0.5, 0.5, 0.5, 1] }];
  assert.equal(Geometry.validateModel(original), original);
  [
    model => { model.bodies[1].pos = [0, NaN, 0]; },
    model => { model.bodies[1].quat = [0, 0, 0, 0]; },
    model => { model.bodies[1].joint.axis = [0, 0, 0]; },
    model => { model.bodies[1].joint.axis = [0, '1', 0]; },
    model => { model.bodies[1].name = 'base'; },
    model => { model.bodies[0].geoms[0].mesh = 'missing'; },
    model => { model.bodies[0].geoms[0].quat = [0, 0, 0]; },
    model => { model.bodies[0].geoms[0].rgba = [0, 1, 2, 1]; }
  ].forEach(change => {
    const model = clone(original);
    change(model);
    assert.throws(() => Geometry.validateModel(model));
  });
});

test('the actual reference asset has valid 15-joint topology and all 28 meshes decode within their declared bounds', () => {
  const assetPath = path.resolve(__dirname, '../prototype/assets/microduck-reference');
  const model = JSON.parse(fs.readFileSync(path.join(assetPath, 'model.json'), 'utf8'));
  const binary = fs.readFileSync(path.join(assetPath, 'meshes.bin'));
  const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  assert.equal(binary.byteLength, 2856560);
  assert.equal(Geometry.validateModel(model), model);
  assert.equal(model.bodies.length, 16);
  assert.equal(Object.keys(model.meshes).length, 28);
  assert.equal(model.bodies.find(body => body.joint?.id === 34).joint.synthetic, true);
  for (const descriptor of Object.values(model.meshes)) {
    const { positions, indices } = Geometry.decodeMesh(descriptor, buffer);
    assert.equal(positions.length, descriptor.nverts * 3);
    assert.equal(indices.length, descriptor.ntris * 3);
    assert.ok(indices.every(index => index < descriptor.nverts));
    for (let axis = 0; axis < 3; axis++) {
      let minimum = Infinity, maximum = -Infinity;
      for (let index = axis; index < positions.length; index += 3) {
        assert.ok(Number.isFinite(positions[index]));
        minimum = Math.min(minimum, positions[index]);
        maximum = Math.max(maximum, positions[index]);
      }
      assert.ok(Math.abs(minimum - descriptor.bbox_min[axis]) < 1e-7);
      assert.ok(Math.abs(maximum - descriptor.bbox_max[axis]) < 1e-7);
    }
  }
});
