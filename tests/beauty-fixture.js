import { Document } from '@gltf-transform/core';
export function beautyFixture() {
  const doc = new Document(), buffer = doc.createBuffer();
  // Closed, shared-vertex box; no source normals, so bevel can expose proper edge highlights.
  const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array([
    -1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,-1,1, 1,1,1, -1,1,1
  ])).setBuffer(buffer);
  const index = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([
    0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7
  ])).setBuffer(buffer);
  const paint = doc.createMaterial('BodyPaint').setBaseColorFactor([0.5,0.5,0.5,1]).setRoughnessFactor(1);
  const trim = doc.createMaterial('Trim').setBaseColorFactor([0.2,0.2,0.2,1]).setRoughnessFactor(1);
  const mesh = (name, mat, dimensions = [1,1,1]) => {
    const scaled = doc.createAccessor().setType('VEC3').setArray(new Float32Array(position.getArray().map((v,i)=>v*dimensions[i%3]))).setBuffer(buffer);
    return doc.createMesh(name).addPrimitive(doc.createPrimitive().setAttribute('POSITION', scaled).setIndices(index).setMaterial(mat));
  };
  const group = doc.createNode('Equipment').setExtras({equipmentId: 'demo-001', nested: {a: 1, b: 2}});
  group.addChild(doc.createNode('Body').setTranslation([0,1.4,0]).setMesh(mesh('BodyMesh',paint)));
  group.addChild(doc.createNode('Base').setTranslation([0,0.2,0]).setMesh(mesh('BaseMesh',trim,[1.2,0.2,1.2])));
  group.addChild(doc.createNode('Anchor').setTranslation([0,2.4,0]));
  doc.createScene('Product').addChild(group);
  return doc;
}
