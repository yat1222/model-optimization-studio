import fs from 'node:fs/promises';
import { fixture } from './fixture.js';
import { createIO } from '../src/pipeline.js';
await fs.mkdir('input', { recursive: true });
await (await createIO()).write('input/demo.glb', fixture());
console.log('已生成 input/demo.glb');
