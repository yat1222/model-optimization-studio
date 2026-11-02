import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../materials/', import.meta.url));
export const catalog = JSON.parse(await fs.readFile(path.join(root, 'catalog.json'), 'utf8'));
export function presetById(id) {
  const preset = catalog.presets.find(p => p.id === id);
  if (!preset) throw new Error('未知 Material Maker 预设：' + id);
  return preset;
}
export function validatePresetRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('preset 必须为对象');
  for (const key of Object.keys(request)) if (!['id', 'size', 'seed', 'parameters', 'uv', 'uvScale', 'normalStrength'].includes(key)) throw new Error('未知预设字段：' + key);
  presetById(request.id);
  if (!Number.isInteger(request.size) || request.size < 64 || request.size > 2048 || (request.size & (request.size-1))) throw new Error('预设 size 须为 64–2048 的 2 次幂');
  if (request.seed !== undefined && (!Number.isInteger(request.seed) || request.seed < 0 || request.seed > 2147483647)) throw new Error('seed 须为 0–2147483647 整数');
  if (!['preserve','generate-if-missing'].includes(request.uv)) throw new Error('preset.uv 须为 preserve 或 generate-if-missing');
  if (request.uvScale !== undefined && (!Array.isArray(request.uvScale) || request.uvScale.length !== 2 || !request.uvScale.every(v=>Number.isFinite(v)&&v>=.01&&v<=100))) throw new Error('uvScale 须为两个 0.01–100 的数');
  if (request.normalStrength !== undefined && (!Number.isFinite(request.normalStrength) || request.normalStrength < 0 || request.normalStrength > 2)) throw new Error('normalStrength 须为 0–2');
  if (request.parameters !== undefined && !Array.isArray(request.parameters)) throw new Error('parameters 须为数组');
  for (const p of request.parameters ?? []) {
    if (!p || typeof p.node !== 'string' || typeof p.parameter !== 'string' || typeof p.value !== 'number' || !Number.isFinite(p.value) || Math.abs(p.value)>10000 || Object.keys(p).some(k=>!['node','parameter','value'].includes(k))) throw new Error('参数覆盖需要 node、parameter、有限数值 value');
  }
  return request;
}
export async function preparePreset(request) {
  validatePresetRequest(request);
  const entry = presetById(request.id);
  const bytes = await fs.readFile(path.join(root,'material-maker',entry.file));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('上游预设校验失败：' + entry.id);
  const graph = JSON.parse(bytes.toString());
  if (request.seed !== undefined) graph.seed_int = request.seed;
  for (const patch of request.parameters ?? []) {
    const nodes = graph.nodes.filter(n=>n.name === patch.node);
    if (nodes.length !== 1 || !Object.hasOwn(nodes[0].parameters ?? {},patch.parameter) || typeof nodes[0].parameters[patch.parameter] !== 'number') throw new Error('未知或非数值的预设节点参数：' + patch.node + '.' + patch.parameter);
    nodes[0].parameters[patch.parameter] = patch.value;
  }
  // Avoid evaluating 2K preview buffers while asking the exporter for a small draft.
  for(const node of graph.nodes) if(node.type==='material') node.parameters.size=Math.log2(request.size);
  return {entry, graph};
}
export async function runMaterialMaker(binary, args, logfile, timeoutMs = 10*60*1000) {
  const log = await fs.open(logfile,'w');
  try {
    await new Promise((resolve,reject)=>{
      const child = spawn(binary,args,{shell:false,stdio:['ignore',log.fd,log.fd]});
      let timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
      child.on('error',e=>{clearTimeout(timer);reject(new Error('无法启动 Material Maker：'+e.message));});
      child.on('close',(code,signal)=>{clearTimeout(timer);code===0&&!timedOut?resolve():reject(new Error(timedOut?'Material Maker 导出超时；检查日志和 Vulkan/显示环境':'Material Maker 导出失败（'+(signal??code)+'）；检查日志'));});
    });
  } finally { await log.close(); }
}
export async function exportPreset(request, directory, {binary = process.env.MATERIAL_MAKER_BIN ?? 'material_maker'} = {}) {
  const {entry,graph}=await preparePreset(request);
  await fs.mkdir(directory,{recursive:true});
  const graphFile=path.resolve(directory,'preset.ptex');
  await fs.writeFile(graphFile,JSON.stringify(graph,null,2));
  // Godot's dummy headless renderer cannot generate these GPU textures. Use the actual renderer.
  const args=['--export-material','--target','Blender','--size',String(request.size),'--output-dir',path.resolve(directory),'--output-file','surface',graphFile];
  await runMaterialMaker(binary,args,path.join(directory,'material-maker.log'));
  const names={baseColor:'surface_albedo.png',roughness:'surface_rough.exr',metallic:'surface_metal.exr',normal:'surface_normal.png'};
  const maps={};
  for(const [slot,name] of Object.entries(names)) {
    const filename=path.join(directory,name);
    try { await fs.access(filename); } catch { continue; }
    if(name.endsWith('.png')) {
      const info=await sharp(filename).metadata();
      if(info.format!=='png'||info.width!==request.size||info.height!==request.size) throw new Error('Material Maker 贴图尺寸或格式错误：'+name);
    } else {
      const header=await fs.readFile(filename);
      if(header.length<16||header.readUInt32LE(0)!==20000630) throw new Error('Material Maker EXR 无效：'+name);
    }
    maps[slot]=path.resolve(filename);
  }
  if(!maps.baseColor) throw new Error('Material Maker 未生成 albedo；即使退出码为 0 也不能视为成功，请检查日志');
  if(!entry.useMetallicMap) delete maps.metallic;
  const manifest={preset:entry.id,source:catalog.source,sha256:entry.sha256,request,maps,
    defaults:{metallic:entry.useMetallicMap?1:0,roughness:.5},normalConvention:'Material Maker Blender target',
    omitted:['displacement','occlusion','sss','emission'],note:'仅接入不透明表面的 baseColor/roughness/metallic/normal，其他输出不应用。'};
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
  return manifest;
}

export async function preparePlanMaterials(plan, directory, options) {
  const prepared=structuredClone(plan), manifests=[];
  for(let i=0;i<prepared.materials.length;i++) {
    const rule=prepared.materials[i];
    if(!rule.preset) continue;
    const manifest=await exportPreset(rule.preset,path.join(directory,'materials',String(i)),options);
    rule.textureSet=manifest;
    manifests.push({material:rule.material,nodes:rule.nodes, ...manifest});
  }
  await fs.writeFile(path.join(directory,'materials-report.json'),JSON.stringify(manifests,null,2));
  return prepared;
}
