import { beautify } from './beautify.js';
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('用法：npm run beautify -- input/model.glb [--plan art/industrial.json] [--blender /path/to/blender] [--out output]');
  process.exit(args.length ? 0 : 1);
}
try {
  const input = args.shift(), options = {};
  while (args.length) {
    const key = args.shift();
    if (!['--plan', '--blender', '--out'].includes(key) || !args.length || args[0].startsWith('--')) throw new Error('参数错误：' + key);
    options[key.slice(2)] = args.shift();
  }
  const result = await beautify(input, options);
  console.log(JSON.stringify({directory: result.directory, status: result.report.status, visualReview: result.report.visualReview}, null, 2));
} catch (e) { console.error(e.message); process.exitCode = 1; }
