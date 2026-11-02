import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {materialReference,findMaterialProfile,linearToSRGB,materialRule} from '../src/material-reference.js';
import {validateArtPlan,beautify} from '../src/beautify.js';
import {createIO} from '../src/pipeline.js';
import {beautyFixture} from './beauty-fixture.js';

test('pinned reference distinguishes bare metal, dielectric and extended shader recipes',()=>{
  assert.equal(materialReference.profiles.length,14);
  assert.equal(new Set(materialReference.profiles.map(p=>p.id)).size,14);
  assert.equal(findMaterialProfile('brushed-steel').start.metallic,1);
  assert.equal(findMaterialProfile('brushed-steel').start.roughness,.25);
  assert.equal(findMaterialProfile('matte-plastic').start.metallic,0);
  assert.equal(findMaterialProfile('matte-plastic').start.roughness,.6);
  assert.ok(findMaterialProfile('clear-glass').requiredFeatures.includes('transmission'));
  assert.equal(findMaterialProfile('wood-base').adapted,true);
});
test('reference rules fit existing art plans while preserving input color and texture policy',async()=>{
  const plan=JSON.parse(await fs.readFile(new URL('../art/industrial.json',import.meta.url)));
  const rule=materialRule('brushed-steel',{material:'BodyPaint',nodes:['Body']});
  assert.equal(Object.hasOwn(rule,'baseColor'),false);
  assert.equal(Object.hasOwn(rule,'replaceTextures'),false);
  plan.materials=[rule];assert.equal(validateArtPlan(plan),plan);
  const changed=findMaterialProfile('brushed-steel');changed.start.roughness=.9;
  assert.equal(findMaterialProfile('brushed-steel').start.roughness,.25);
});
test('linear source colors convert exactly once; out-of-range gold never silently clips',()=>{
  const original=findMaterialProfile('polished-copper').sourceColorLinear;
  const rule=materialRule('polished-copper',{material:'Copper',color:'source'});
  for(let i=0;i<3;i++) {
    const v=rule.baseColor[i];const linear=v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
    assert.ok(Math.abs(linear-original[i])<1e-10);
  }
  assert.throws(()=>materialRule('polished-gold',{material:'Gold',color:'source'}),/超出/);
  assert.equal(Object.hasOwn(materialRule('polished-gold',{material:'Gold'}),'baseColor'),false);
  for(const c of [[-1,0,0],[NaN,0,0],[1,0],['1',0,0]]) assert.throws(()=>linearToSRGB(c));
});
test('unsupported glass, coat, sheen and SSS cannot become misleading executable rules',()=>{
  for(const id of ['clear-glass','frosted-glass','colored-glass','lacquered-plastic','velvet','skin-light']) assert.throws(()=>materialRule(id,{material:'Target'}),/仅供参考/);
  assert.throws(()=>materialRule('unknown',{material:'Target'}),/未知/);
  assert.throws(()=>materialRule('brushed-steel',{}),/精确材质名/);
  assert.throws(()=>materialRule('brushed-steel',{material:'Target',color:'linear'}),/color/);
});
const binary=process.env.BLENDER_BIN??'blender';
const installed=spawnSync(binary,['--version'],{timeout:10000,encoding:'utf8'}).status===0;
test('real Blender exports a reference rule with correct linear color, roughness and node bindings',{skip:!installed,timeout:180000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'reference-blender-'));
  try {
    const io=await createIO(),input=path.join(dir,'source.glb');await io.write(input,beautyFixture());
    const plan=JSON.parse(await fs.readFile(new URL('../art/industrial.json',import.meta.url)));
    plan.materials=[materialRule('brushed-steel',{material:'BodyPaint',nodes:['Body'],color:'source'})];
    plan.geometry.bevelRatio=0;plan.render={resolution:64,samples:1,views:['hero']};
    const filename=path.join(dir,'plan.json');await fs.writeFile(filename,JSON.stringify(plan));
    const {directory,report}=await beautify(input,{plan:filename,out:dir,blender:binary});
    assert.equal(report.contractPreserved,true);assert.equal(report.validation.errors,0);
    const out=await io.read(path.join(directory,'beautified.glb'));
    const material=out.getRoot().listNodes().find(n=>n.getName()==='Body').getMesh().listPrimitives()[0].getMaterial();
    assert.equal(material.getMetallicFactor(),1);assert.equal(material.getRoughnessFactor(),.25);
    const linear=findMaterialProfile('brushed-steel').sourceColorLinear;
    material.getBaseColorFactor().slice(0,3).forEach((v,i)=>assert.ok(Math.abs(v-linear[i])<1e-5));
    assert.equal(report.visualReview,'pending');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
