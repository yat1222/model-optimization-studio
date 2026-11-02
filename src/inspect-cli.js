import path from 'node:path';
import { createIO, loadInput, stats } from './pipeline.js';
try {
  if (process.argv.length !== 3) throw new Error('用法：npm run inspect -- input/model.glb');
  const {doc} = await loadInput(path.resolve(process.argv[2]), await createIO());
  const root = doc.getRoot();
  console.log(JSON.stringify({stats:stats(doc), nodes:root.listNodes().map(n=>({name:n.getName(),
    parent:n.getParentNode()?.getName()??null, matrix:n.getMatrix(), extras:n.getExtras(),
    materials:n.getMesh()?.listPrimitives().map(p=>p.getMaterial()?.getName()??null)??[]})),
    materials:root.listMaterials().map(m=>({name:m.getName(),baseColorLinear:m.getBaseColorFactor(),
      roughness:m.getRoughnessFactor(),metallic:m.getMetallicFactor(),alphaMode:m.getAlphaMode(),
      textured:!!(m.getBaseColorTexture()||m.getMetallicRoughnessTexture()),normalMap:!!m.getNormalTexture()}))},null,2));
} catch(e) { console.error(e.message); process.exitCode=1; }
