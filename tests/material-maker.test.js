import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {catalog,preparePreset,validatePresetRequest,exportPreset} from '../src/material-maker.js';
import {validateArtPlan,preflight,beautify} from '../src/beautify.js';
import {createIO} from '../src/pipeline.js';
import {beautyFixture} from './beauty-fixture.js';

const request={id:'wood',size:64,seed:7,uv:'generate-if-missing'};
const plan=()=>JSON.parse(JSON.stringify(basePlan));
const basePlan=JSON.parse(await fs.readFile(new URL('../art/material-maker-demo.json',import.meta.url),'utf8'));

async function fakeExporter(dir,{empty=false,badSize=false}={}) {
  const png=await sharp({create:{width:badSize?32:64,height:64,channels:3,background:'#a87939'}}).png().toBuffer();
  const normal=await sharp({create:{width:64,height:64,channels:3,background:{r:128,g:128,b:255}}}).png().toBuffer();
  const script=path.join(dir,'exporter.cjs');
  await fs.writeFile(script,`#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');const a=process.argv.slice(2);if(a[0]!=='--export-material'||a[a.indexOf('--target')+1]!=='Blender')process.exit(9);const out=a[a.indexOf('--output-dir')+1];${empty?'':`fs.writeFileSync(path.join(out,'surface_albedo.png'),Buffer.from('${png.toString('base64')}','base64'));fs.writeFileSync(path.join(out,'surface_normal.png'),Buffer.from('${normal.toString('base64')}','base64'));if(fs.existsSync(path.join(__dirname,'rough.exr')))fs.copyFileSync(path.join(__dirname,'rough.exr'),path.join(out,'surface_rough.exr'));`}\n`);
  await fs.chmod(script,0o755);return script;
}
test('all six vendored presets match pinned source and expose editable numeric parameters',async()=>{
  assert.equal(catalog.presets.length,6);
  for(const p of catalog.presets) assert.ok((await preparePreset({...request,id:p.id})).graph.nodes.length>0);
  const edited=await preparePreset({...request,parameters:[{node:'perlin_2',parameter:'scale_x',value:16}]});
  assert.equal(edited.graph.seed_int,7);
  assert.equal(edited.graph.nodes.find(n=>n.name==='perlin_2').parameters.scale_x,16);
  assert.equal((await preparePreset(request)).graph.nodes.find(n=>n.name==='perlin_2').parameters.scale_x,32);
  await assert.rejects(preparePreset({...request,parameters:[{node:'perlin_2',parameter:'bad',value:1}]}),/参数/);
});
test('preset requests reject unknown IDs, shader injection, invalid UV/size and implicit replacement',()=>{
  for(const edit of [r=>r.id='../wood',r=>r.size=100,r=>r.uv='auto',r=>r.uvScale=[0,1],r=>r.seed=-1,r=>r.shader='code']) {
    const r=structuredClone(request);edit(r);assert.throws(()=>validatePresetRequest(r));
  }
  const p=plan();p.materials[0].replaceTextures=false;assert.throws(()=>validateArtPlan(p),/replaceTextures/);
});
test('preset preflight checks missing UVs and rejects transparent sources',()=>{
  const p=plan(),d=beautyFixture();validateArtPlan(p);preflight(d,p);
  p.materials[0].preset.uv='preserve';assert.throws(()=>preflight(d,p),/UV/);
  p.materials[0].preset.uv='generate-if-missing';d.getRoot().listMaterials()[0].setAlphaMode('BLEND');
  assert.throws(()=>preflight(d,p),/不透明/);
});
test('adapter checks process output, dimensions, defaults and provenance (simulated exporter)',{skip:process.platform==='win32'},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mm-adapter-'));
  try {
    const binary=await fakeExporter(dir);
    const result=await exportPreset(request,path.join(dir,'good'),{binary});
    assert.ok(result.maps.baseColor);assert.ok(result.maps.normal);assert.equal(result.defaults.metallic,0);
    assert.equal(result.source.ref,'1.8');assert.equal(result.request.seed,7);
    const noOutput=await fakeExporter(dir,{empty:true});
    await assert.rejects(exportPreset(request,path.join(dir,'empty'),{binary:noOutput}),/未生成/);
    const badSize=await fakeExporter(dir,{badSize:true});
    await assert.rejects(exportPreset(request,path.join(dir,'bad'),{binary:badSize}),/尺寸/);
    await assert.rejects(exportPreset(request,path.join(dir,'missing'),{binary:path.join(dir,'missing-bin')}),/无法启动/);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

const blender=process.env.BLENDER_BIN??'blender';
const available=spawnSync(blender,['--version'],{timeout:10000,encoding:'utf8'}).status===0;
test('real Blender applies generated PBR maps, generates UVs, exports textures and preserves bindings (simulated MM exporter)',{skip:!available||process.platform==='win32',timeout:180000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mm-blender-'));
  try {
    const exr=spawnSync(blender,['--background','--factory-startup','--python-exit-code','1','--python-expr',`import bpy; im=bpy.data.images.new('rough',width=64,height=64,float_buffer=True); im.pixels.foreach_set([0.3,0.3,0.3,1.0]*4096); im.colorspace_settings.name='Non-Color'; bpy.context.scene.render.image_settings.file_format='OPEN_EXR'; im.save_render(${JSON.stringify(path.join(dir,'rough.exr'))})`],{timeout:30000,encoding:'utf8'});
    assert.equal(exr.status,0,exr.stderr);
    const binary=await fakeExporter(dir),io=await createIO(),input=path.join(dir,'input.glb');
    await io.write(input,beautyFixture());
    const p=plan();p.materials[0].preset.size=64;p.render={resolution:64,samples:1,views:['hero']};
    const filename=path.join(dir,'plan.json');await fs.writeFile(filename,JSON.stringify(p));
    const {directory,report}=await beautify(input,{plan:filename,out:dir,blender,materialMaker:binary});
    assert.equal(report.contractPreserved,true);assert.equal(report.validation.errors,0);
    const out=await io.read(path.join(directory,'beautified.glb'));
    const body=out.getRoot().listNodes().find(n=>n.getName()==='Body');
    const prim=body.getMesh().listPrimitives()[0];
    assert.ok(prim.getAttribute('TEXCOORD_0'));assert.ok(prim.getMaterial().getBaseColorTexture());
    assert.ok(prim.getMaterial().getNormalTexture());assert.equal(prim.getMaterial().getMetallicFactor(),0);
    assert.ok(prim.getMaterial().getMetallicRoughnessTexture(),'EXR roughness must become a glTF metallic-roughness map');
    assert.ok(report.blender.changes.some(c=>c.operation==='material-maker-uv'&&c.generated));
    assert.equal(report.visualReview,'pending');
    assert.equal(JSON.parse(await fs.readFile(path.join(directory,'materials-report.json'),'utf8'))[0].preset,'wood');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

const mm=process.env.MATERIAL_MAKER_BIN;
test('real Material Maker 1.8 exports bundled wood preset',{skip:!mm?'Set MATERIAL_MAKER_BIN to enable actual GPU exporter test':false,timeout:600000},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mm-real-'));
  try {
    const result=await exportPreset(request,dir,{binary:mm});assert.ok(result.maps.baseColor);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
