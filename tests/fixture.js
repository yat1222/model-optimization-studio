import { Document } from '@gltf-transform/core';
export function fixture({ morph = false } = {}) {
  const d = new Document(), b = d.createBuffer(), positions = [], indices = [];
  const size = 40;
  for (let y = 0; y <= size; y++) for (let x = 0; x <= size; x++) positions.push(x / size, y / size, Math.sin(x / size * Math.PI) * 0.05);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = y * (size + 1) + x;
    indices.push(a, a + 1, a + size + 1, a + 1, a + size + 2, a + size + 1);
  }
  const p = d.createPrimitive().setAttribute('POSITION', d.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(b))
    .setIndices(d.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(b));
  if (morph) p.addTarget(d.createPrimitiveTarget().setAttribute('POSITION', d.createAccessor().setType('VEC3').setArray(new Float32Array(positions.length)).setBuffer(b)));
  const node = d.createNode('设备-001').setExtras({ equipmentId: 'pump-1' }).setMesh(d.createMesh('grid').addPrimitive(p));
  if (morph) node.setWeights([0]);
  d.createScene('园区').addChild(d.createNode('分组').addChild(node)).addChild(d.createNode('空锚点'));
  const times = d.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(b);
  const values = d.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0])).setBuffer(b);
  const sampler = d.createAnimationSampler().setInput(times).setOutput(values);
  d.createAnimation('移动').addSampler(sampler).addChannel(d.createAnimationChannel().setTargetNode(node).setTargetPath('translation').setSampler(sampler));
  return d;
}
