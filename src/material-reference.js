import fs from 'node:fs/promises';

export const materialReference = JSON.parse(await fs.readFile(new URL('../art/material-parameters.json', import.meta.url), 'utf8'));

export function findMaterialProfile(id) {
  const profile = materialReference.profiles.find(p => p.id === id);
  if (!profile) throw new Error('未知材质参考：' + id);
  return structuredClone(profile);
}

export function linearToSRGB(color) {
  if (!Array.isArray(color) || color.length !== 3 || !color.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new Error('上游线性颜色超出当前项目的 0–1 范围；请保留原色或另选经过验证的数据，不自动截断');
  }
  return color.map(v => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
}

export function materialRule(id, {material, nodes, color = 'keep', replaceTextures = false} = {}) {
  const p = findMaterialProfile(id);
  if (p.requiredFeatures.length) throw new Error('该配方仅供参考，当前执行器缺少：' + p.requiredFeatures.join(', '));
  if (typeof material !== 'string' || !material.trim()) throw new Error('需要输入模型的精确材质名 --material');
  if (nodes !== undefined && (!Array.isArray(nodes) || !nodes.length || !nodes.every(n => typeof n === 'string' && n.trim()))) throw new Error('nodes 必须为非空节点名称数组');
  if (!['keep', 'source'].includes(color)) throw new Error('color 须为 keep 或 source');
  if (typeof replaceTextures !== 'boolean') throw new Error('replaceTextures 须为布尔值');
  const rule = {material, ...(nodes ? {nodes} : {}), ...p.start};
  if (color === 'source') {
    if (!p.sourceColorLinear) throw new Error('该参考没有可用的上游颜色；默认保留输入颜色');
    rule.baseColor = linearToSRGB(p.sourceColorLinear);
  }
  if (replaceTextures) rule.replaceTextures = true;
  return rule;
}
