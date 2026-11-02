import fs from 'node:fs/promises';
import { createIO } from '../src/pipeline.js';
import { beautyFixture } from './beauty-fixture.js';
await fs.mkdir('input', {recursive: true});
await (await createIO()).write('input/beauty-demo.glb', beautyFixture());
console.log('已生成 input/beauty-demo.glb。运行 npm run beautify -- input/beauty-demo.glb --plan art/demo.json');
