import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, weld, simplify, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import draco from 'draco3dgltf';
import sharp from 'sharp';
import validator from 'gltf-validator';
import fs from 'node:fs/promises';
import path from 'node:path';

import config from '../project.json' with { type: 'json' };
export const PRESETS = config.presets;
export async function createIO() {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
    'draco3d.decoder': await draco.createDecoderModule(),
    'draco3d.encoder': await draco.createEncoderModule()
  });
}
export function stats(doc) {
  const r = doc.getRoot();
  let vertices = 0, triangles = 0, primitives = 0;
  for (const mesh of r.listMeshes()) for (const p of mesh.listPrimitives()) {
    primitives++;
    const count = p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0;
    vertices += p.getAttribute('POSITION')?.getCount() ?? 0;
    if (p.getMode() === 4) triangles += count / 3;
    else if ([5, 6].includes(p.getMode())) triangles += Math.max(0, count - 2);
  }
  return { nodes: r.listNodes().length, meshes: r.listMeshes().length, primitives, vertices, triangles,
    materials: r.listMaterials().length, textures: r.listTextures().length,
    textureBytes: r.listTextures().reduce((s, t) => s + (t.getImage()?.byteLength ?? 0), 0),
    animations: r.listAnimations().length, skins: r.listSkins().length };
}
// Identity and graph are editor contracts; geometry changes must not rename or flatten nodes.
export function contract(doc) {
  const r = doc.getRoot(), nodes = r.listNodes(), index = n => nodes.indexOf(n);
  return JSON.stringify({ nodes: nodes.map(n => ({ name: n.getName(), extras: n.getExtras(),
    children: n.listChildren().map(index), t: n.getTranslation(), r: n.getRotation(), s: n.getScale(),
    mesh: !!n.getMesh(), skin: !!n.getSkin(), weights: n.getWeights() })),
    scenes: r.listScenes().map(s => ({ name: s.getName(), children: s.listChildren().map(index) })),
    animations: r.listAnimations().map(a => ({ name: a.getName(), channels: a.listChannels().map(c => ({
      target: index(c.getTargetNode()), path: c.getTargetPath() })) })),
    skins: r.listSkins().map(s => ({ name: s.getName(), joints: s.listJoints().map(index) })) });
}
export async function validate(bytes) {
  const r = await validator.validateBytes(bytes, { maxIssues: 1000 });
  return { errors: r.issues.numErrors, warnings: r.issues.numWarnings,
    truncated: r.issues.truncated, messages: r.issues.messages };
}
export async function loadInput(input, io) {
  const ext = path.extname(input).toLowerCase();
  if (!['.gltf', '.glb'].includes(ext)) throw new Error('只支持 .gltf / .glb');
  // Resolve every external resource before NodeIO reads it, including GLB external images.
  const raw = await fs.readFile(input);
  const json = ext === '.gltf' ? JSON.parse(raw.toString()) : JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString());
  const base = await fs.realpath(path.dirname(input));
  let inputBytes = raw.byteLength;
  const resources = new Set();
  for (const item of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (!item.uri || item.uri.startsWith('data:')) continue;
    const uri = decodeURIComponent(item.uri);
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || path.isAbsolute(uri) || uri.includes('\\')) throw new Error('资源必须位于模型文件夹内：' + item.uri);
    const resolved = await fs.realpath(path.resolve(base, uri));
    if (!resolved.startsWith(base + path.sep)) throw new Error('资源越出模型文件夹：' + item.uri);
    resources.add(resolved);
  }
  for (const resource of resources) inputBytes += (await fs.stat(resource)).size;
  const supported = new Set(ALL_EXTENSIONS.map(e => e.EXTENSION_NAME));
  for (const e of new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])) {
    if (!supported.has(e)) throw new Error('不支持的扩展，停止以避免丢失数据：' + e);
  }
  // Validate source JSON and binary resources before any reserialization can repair it silently.
  const validationOptions = { maxIssues: 1000, externalResourceFunction: async uri => {
    if (uri.startsWith('data:')) throw new Error('验证器不应请求内嵌数据');
    return new Uint8Array(await fs.readFile(path.resolve(base, decodeURIComponent(uri))));
  }};
  const result = ext === '.gltf'
    ? await validator.validateString(raw.toString(), validationOptions)
    : await validator.validateBytes(new Uint8Array(raw), validationOptions);
  if (result.issues.numErrors) throw new Error('原始模型验证失败：' + JSON.stringify(result.issues.messages.filter(m => m.severity === 0)));
  return { doc: await io.read(input), inputBytes, sourceValidation: result.issues };
}
export async function candidate(io, original, preset, compression) {
  const doc = await io.readBinary(original), beforeContract = contract(doc);
  const config = PRESETS[preset], notes = [];
  // Material/texture identity may be referenced by the editor: deduplicate accessors only.
  await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR] }));
  const deforming = doc.getRoot().listSkins().length > 0 || doc.getRoot().listMeshes().some(m => m.listPrimitives().some(p => p.listTargets().length));
  if (config.ratio < 1 && !deforming) {
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: config.ratio, error: config.error, lockBorder: true }));
  } else if (config.ratio < 1) notes.push('检测到蒙皮或 morph，整模跳过减面。');
  if (config.textureSize) await doc.transform(textureCompress({ encoder: sharp,
    resize: [config.textureSize, config.textureSize], formats: /^image\/(png|jpeg)$/ }));
  // Direct encoder configuration avoids the meshopt() transform's automatic quantization.
  if (compression === 'meshopt') doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  else for (const extension of doc.getRoot().listExtensionsUsed()) {
    if (['EXT_meshopt_compression', 'KHR_draco_mesh_compression'].includes(extension.extensionName)) extension.dispose();
  }
  const bytes = await io.writeBinary(doc), validation = await validate(bytes);
  const decoded = await io.readBinary(bytes);
  const preserved = contract(decoded) === beforeContract;
  return { bytes, report: { preset, config, bytes: bytes.byteLength, stats: stats(decoded), validation,
    contractPreserved: preserved, accepted: validation.errors === 0 && preserved, notes } };
}
export async function optimize(input, { preset = 'safe', compression = 'meshopt' } = {}) {
  if (!(preset in PRESETS) && preset !== 'auto') throw new Error('未知 preset：' + preset);
  if (!['meshopt', 'none'].includes(compression)) throw new Error('compression 必须为 meshopt 或 none');
  const io = await createIO(), loaded = await loadInput(input, io);
  for (const extension of loaded.doc.getRoot().listExtensionsUsed()) {
    if (['EXT_meshopt_compression', 'KHR_draco_mesh_compression'].includes(extension.extensionName)) extension.dispose();
  }
  const original = await io.writeBinary(loaded.doc);
  const baselineValidation = await validate(original);
  if (baselineValidation.errors) throw new Error('模型重写验证失败');
  const reports = [], candidates = [{ bytes: original, report: { preset: 'baseline', bytes: original.length,
    stats: stats(loaded.doc), accepted: true, validation: baselineValidation, contractPreserved: true } }];
  // Auto is explicitly lossy; safe is the default.
  for (const name of preset === 'auto' ? Object.keys(PRESETS) : [preset]) {
    try {
      const c = await candidate(io, original, name, compression);
      reports.push(c.report);
      if (c.report.accepted) candidates.push(c);
    } catch (error) { reports.push({ preset: name, accepted: false, error: error.message }); }
  }
  const accepted = candidates.filter(c => c.report.preset !== 'baseline');
  if (!accepted.length) throw new Error('全部优化候选失败：' + JSON.stringify(reports));
  // Keep the baseline if optimization grows the normalized GLB.
  const best = candidates.sort((a, b) => a.bytes.length - b.bytes.length)[0];
  return { bytes: best.bytes, report: { input: path.basename(input), preset, compression,
    sourceBytes: loaded.inputBytes, normalizedBytes: original.length, outputBytes: best.bytes.length,
    reductionPercent: Number(((1 - best.bytes.length / loaded.inputBytes) * 100).toFixed(2)),
    selected: best.report.preset, before: stats(loaded.doc), after: best.report.stats,
    sourceValidation: loaded.sourceValidation, candidates: reports,
    visualReview: 'pending', notes: ['结构验证不能替代视觉验收。三角形/顶点为资源统计，不是运行时 draw calls。',
      'auto/balanced/compact 允许有损；ratio 是目标保留比例，误差阈值可能使其无法达到。',
      'baseline 表示候选更大，输出规范化原始 GLB；不保证文件一定缩小。'] } };
}
