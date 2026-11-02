import fs from 'node:fs/promises';
import path from 'node:path';
import { optimize } from './pipeline.js';
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('用法：npm run optimize -- input/model.gltf [--preset safe|balanced|compact|auto] [--compression meshopt|none] [--out output]');
  process.exit(args.length ? 0 : 1);
}
try {
  const input = path.resolve(args.shift()), options = {}, allowed = new Set(['--preset', '--compression', '--out']);
  while (args.length) {
    const key = args.shift();
    if (!allowed.has(key) || !args.length || args[0].startsWith('--')) throw new Error('参数错误：' + key);
    options[key.slice(2)] = args.shift();
  }
  const result = await optimize(input, options);
  const root = path.resolve(options.out ?? 'output');
  await fs.mkdir(root, { recursive: true });
  // A new run directory prevents clobbering originals or prior runs.
  const dir = await fs.mkdtemp(path.join(root, 'run-'));
  await fs.writeFile(path.join(dir, 'optimized.glb'), result.bytes);
  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify(result.report, null, 2));
  const r = result.report;
  await fs.writeFile(path.join(dir, 'report.md'), `# 模型优化报告\n\n输入：${r.input}\n\n选择：${r.selected}\n\n原始资源总大小：${r.sourceBytes} bytes\n\n输出：${r.outputBytes} bytes（变化 ${r.reductionPercent}%）\n\n| 指标 | 优化前 | 优化后 |\n|---|---:|---:|\n${Object.keys(r.before).map(k => `| ${k} | ${r.before[k]} | ${r.after[k]} |`).join('\n')}\n\n视觉验收：待人工复核。\n\n${r.notes.join('\n\n')}\n`);
  console.log(JSON.stringify({ directory: dir, selected: r.selected, reductionPercent: r.reductionPercent }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
