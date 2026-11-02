import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { dequantize } from '@gltf-transform/functions';
import { createIO, loadInput, stats, validate } from './pipeline.js';
import {validatePresetRequest,preparePlanMaterials} from './material-maker.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const finite = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
export function validateArtPlan(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('美术方案必须为 JSON 对象');
  const keys = (o, allowed) => { for (const k of Object.keys(o ?? {})) if (!allowed.includes(k)) throw new Error('未知方案字段：' + k); };
  keys(p, ['version', 'direction', 'geometry', 'materials', 'render']);
  keys(p.geometry, ['bevelRatio', 'segments', 'angle', 'weightedNormals', 'excludeNodes']);
  keys(p.render, ['resolution', 'samples', 'exposure', 'views']);
  if (p.version !== 1 || typeof p.direction !== 'string' || !p.direction.trim()) throw new Error('美术方案需要 version:1 与 direction');
  if (!finite(p.geometry?.bevelRatio, 0, 0.02) || !Number.isInteger(p.geometry?.segments) || !finite(p.geometry.segments, 1, 4)) throw new Error('倒角比例须为 0–0.02，segments 须为 1–4 整数');
  if (!finite(p.geometry.angle, 1, 89) || !Array.isArray(p.geometry.excludeNodes) || !p.geometry.excludeNodes.every(x => typeof x === 'string')) throw new Error('geometry.angle/excludeNodes 无效');
  if (typeof p.geometry.weightedNormals !== 'boolean') throw new Error('weightedNormals 必须为布尔值');
  if (!Array.isArray(p.materials)) throw new Error('materials 必须是数组');
  for (const m of p.materials) {
    if (!m || typeof m !== 'object') throw new Error('材质规则必须为对象');
    keys(m, ['material', 'nodes', 'baseColor', 'metallic', 'roughness', 'replaceTextures', 'preset']);
    if (m.preset !== undefined) {
      validatePresetRequest(m.preset);
      if(m.replaceTextures !== true) throw new Error('使用预设须显式设置 replaceTextures:true');
    }
    if (typeof m.material !== 'string' || !m.material || (m.nodes !== undefined && (!Array.isArray(m.nodes) || !m.nodes.length || !m.nodes.every(n => typeof n === 'string')))) throw new Error('材质规则需要精确 material 名称，nodes 为可选非空节点名数组');
    for (const k of ['roughness', 'metallic']) if (m[k] !== undefined && !finite(m[k], 0, 1)) throw new Error(k + ' 须为 0–1');
    if (m.baseColor !== undefined && (!Array.isArray(m.baseColor) || m.baseColor.length !== 3 || !m.baseColor.every(v => finite(v, 0, 1)))) throw new Error('baseColor 须为三个 0–1 的 sRGB 值');
    if (m.replaceTextures !== undefined && typeof m.replaceTextures !== 'boolean') throw new Error('replaceTextures 必须为布尔值');
  }
  if (!Number.isInteger(p.render?.resolution) || !finite(p.render.resolution, 64, 2048) || !Number.isInteger(p.render.samples) || !finite(p.render.samples, 1, 256)) throw new Error('render.resolution/samples 无效');
  const views = ['front', 'back', 'left', 'right', 'top', 'bottom', 'hero'];
  if (!Array.isArray(p.render.views) || !p.render.views.length || new Set(p.render.views).size !== p.render.views.length || !p.render.views.every(v => views.includes(v))) throw new Error('render.views 无效');
  if (p.render.exposure !== undefined && !finite(p.render.exposure, -5, 5)) throw new Error('exposure 须为 -5–5');
  return p;
}

export function preflight(doc, plan) {
  const r = doc.getRoot(), nodes = r.listNodes(), names = nodes.map(n => n.getName());
  if (r.listAnimations().length || r.listSkins().length || r.listMeshes().some(m => m.listPrimitives().some(p => p.listTargets().length))) throw new Error('Blender 美化目前仅接收静态模型；动画/蒙皮/morph 请使用原 optimize 流程');
  if (!nodes.length || names.some(n => !n) || new Set(names).size !== names.length) throw new Error('美化前须为每个节点设置非空且唯一名称，以便检查业务绑定');
  if (r.listScenes().length !== 1) throw new Error('美化要求恰好一个场景');
  const reachable = new Set(); r.listScenes()[0].traverse(n => reachable.add(n));
  if (nodes.some(n => !reachable.has(n))) throw new Error('存在场景外节点，停止以防 Blender 丢弃');
  if (!r.listMeshes().length || nodes.some(n => n.getCamera())) throw new Error('美化需要网格，暂不支持源摄像机');
  for (const mesh of r.listMeshes()) for (const p of mesh.listPrimitives()) if (p.getMode() !== 4) throw new Error('美化目前仅接收三角形网格');
  // Keep this deliberately narrow: Blender may not round-trip arbitrary glTF extensions.
  const allowed = new Set(['EXT_meshopt_compression', 'KHR_draco_mesh_compression', 'KHR_mesh_quantization']);
  for (const e of r.listExtensionsUsed()) if (!allowed.has(e.extensionName)) throw new Error('Blender 往返尚未验收此扩展：' + e.extensionName);
  for (const name of [...plan.geometry.excludeNodes, ...plan.materials.flatMap(m => m.nodes ?? [])]) if (!names.includes(name)) throw new Error('方案引用未知节点：' + name);
  const mats = r.listMaterials().map(m => m.getName());
  for (const rule of plan.materials) {
    if (mats.filter(n => n === rule.material).length !== 1) throw new Error('规则材质名不存在或不唯一：' + rule.material);
    for (const name of rule.nodes ?? []) {
      const node = nodes.find(n => n.getName() === name);
      if (!node.getMesh()?.listPrimitives().some(p => p.getMaterial()?.getName() === rule.material)) throw new Error(`节点 ${name} 没有材质 ${rule.material}`);
    }
    if (rule.preset) {
      const material=r.listMaterials().find(m=>m.getName()===rule.material);
      if(material.getAlphaMode()!=='OPAQUE') throw new Error('Material Maker 预设暂只支持不透明源材质：'+rule.material);
      for(const node of nodes.filter(n=>!rule.nodes||rule.nodes.includes(n.getName()))) {
        const primitives=node.getMesh()?.listPrimitives()??[];
        for(const p of primitives) if(p.getMaterial()===material&&!p.getAttribute('TEXCOORD_0')) {
          if(rule.preset.uv==='preserve') throw new Error('预设目标缺少 UV：'+node.getName()+'；可显式使用 generate-if-missing');
          if(primitives.some(p=>p.getAttribute('TEXCOORD_0'))) throw new Error('对象只有部分 primitive 有 UV，须先修复：'+node.getName());
        }
      }
    }
  }
  const matched = new Set();
  for (const rule of plan.materials) for (const node of nodes.filter(n => n.getMesh()?.listPrimitives().some(p => p.getMaterial()?.getName() === rule.material) && (!rule.nodes || rule.nodes.includes(n.getName())))) {
    const key = JSON.stringify([rule.material, node.getName()]);
    if (matched.has(key)) throw new Error('材质规则覆盖同一节点，请合并：' + node.getName());
    matched.add(key);
  }
}

const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
export function identity(doc) {
  return doc.getRoot().listNodes().map(n => ({name: n.getName(), parent: n.getParentNode()?.getName() ?? null,
    matrix: n.getMatrix(), extras: canonical(n.getExtras()), mesh: !!n.getMesh()})).sort((a, b) => a.name.localeCompare(b.name));
}
export function compareIdentity(a, b) {
  return a.length === b.length && a.every((n, i) => n.name === b[i].name && n.parent === b[i].parent && n.mesh === b[i].mesh &&
    JSON.stringify(n.extras) === JSON.stringify(b[i].extras) && n.matrix.every((v, j) => Math.abs(v - b[i].matrix[j]) <= 1e-5 * Math.max(1, Math.abs(v))));
}

export async function runBlender(binary, args, logfile, timeoutMs = 30 * 60 * 1000) {
  const log = await fs.open(logfile, 'w');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(binary, args, { shell: false, stdio: ['ignore', log.fd, log.fd] });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
      child.on('error', e => { clearTimeout(timer); reject(new Error('无法启动 Blender：' + e.message + '；安装 Blender 4.5 LTS 或设置 --blender /完整路径')); });
      child.on('close', code => { clearTimeout(timer); code === 0 && !timedOut ? resolve() : reject(new Error(timedOut ? 'Blender 超时，请查看 blender.log' : `Blender 失败（${code}），请查看 blender.log`)); });
    });
  } finally { await log.close(); }
}

export async function beautify(input, { plan: planFile = path.join(root, 'art/industrial.json'), out = 'output', blender = process.env.BLENDER_BIN ?? 'blender', materialMaker = process.env.MATERIAL_MAKER_BIN ?? 'material_maker' } = {}) {
  const plan = validateArtPlan(JSON.parse(await fs.readFile(planFile, 'utf8')));
  const io = await createIO(), loaded = await loadInput(path.resolve(input), io);
  preflight(loaded.doc, plan);
  const beforeIdentity = identity(loaded.doc), beforeStats = stats(loaded.doc);
  // Decode transport compression for Blender without lossy simplification.
  await loaded.doc.transform(dequantize());
  for (const e of [...loaded.doc.getRoot().listExtensionsUsed()]) e.dispose();
  const normalized = await io.writeBinary(loaded.doc);
  if ((await validate(normalized)).errors) throw new Error('Blender 输入规范化验证失败');
  await fs.mkdir(path.resolve(out), {recursive: true});
  const dir = await fs.mkdtemp(path.join(path.resolve(out), 'beauty-'));
  const report = {input: path.basename(input), direction: plan.direction, status: 'running', visualReview: 'pending', before: beforeStats};
  try {
    await fs.writeFile(path.join(dir, 'source.glb'), normalized);
    await fs.writeFile(path.join(dir, 'requested-art-plan.json'), JSON.stringify(plan, null, 2));
    const preparedPlan=await preparePlanMaterials(plan,dir,{binary:materialMaker});
    await fs.writeFile(path.join(dir, 'art-plan.json'), JSON.stringify(preparedPlan, null, 2));
    await runBlender(blender, ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', path.join(root, 'blender/beautify.py'), '--', '--workdir', dir], path.join(dir, 'blender.log'));
    const evidence = JSON.parse(await fs.readFile(path.join(dir, 'blender-report.json'), 'utf8'));
    const bytes = new Uint8Array(await fs.readFile(path.join(dir, 'candidate.glb'))), validation = await validate(bytes);
    const result = await io.readBinary(bytes);
    const contractPreserved = compareIdentity(beforeIdentity, identity(result));
    Object.assign(report, {blender: evidence, validation, contractPreserved, after: stats(result)});
    if (validation.errors || !contractPreserved) throw new Error('导出验收失败：格式或节点名称/层级/变换/extras 改变；候选仅供排查');
    for (const view of plan.render.views) for (const phase of ['before', 'after']) await fs.access(path.join(dir, `${phase}-${view}.png`));
    await fs.access(path.join(dir, 'beautified.blend'));
    // Generated only after structural checks; visual approval remains a separate gate.
    await fs.copyFile(path.join(dir, 'candidate.glb'), path.join(dir, 'beautified.glb'));
    Object.assign(report, {status: 'needs-visual-review', outputBytes: bytes.length, sourceBytes: loaded.inputBytes,
      note: '美化可能增加面数/体积。灯光、地面、AgX 仅属于展示场景；GLB 的材质与几何改动才是模型美化。'});
    const cards = plan.render.views.map(v => `<section><h2>${v}</h2><div><figure><img src="before-${v}.png"><figcaption>Before</figcaption></figure><figure><img src="after-${v}.png"><figcaption>After</figcaption></figure></div></section>`).join('');
    await fs.writeFile(path.join(dir, 'comparison.html'), `<!doctype html><meta charset="utf-8"><title>Beauty review</title><style>body{background:#141922;color:#eee;font:16px system-ui;max-width:1400px;margin:32px auto}section div{display:flex}figure{width:50%;margin:8px}img{width:100%}</style><h1>Blender 美化前后对比</h1><p>相同相机、灯光、曝光。视觉验收：pending。</p>${cards}`);
    await fs.writeFile(path.join(dir, 'review.json'), JSON.stringify({status: 'pending', reviewer: null, criteria: {}, evidence: [], issues: [], nextIteration: []}, null, 2));
    return {directory: dir, report};
  } catch (error) {
    report.status = 'failed'; report.error = error.message;
    throw new Error(`${error.message}\n本次记录：${dir}`);
  } finally { await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); }
}
