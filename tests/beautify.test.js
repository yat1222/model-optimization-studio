import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateArtPlan, preflight, identity, compareIdentity, runBlender, beautify } from '../src/beautify.js';
import { createIO } from '../src/pipeline.js';
import { beautyFixture } from './beauty-fixture.js';
const base = JSON.parse(await fs.readFile(new URL('../art/industrial.json', import.meta.url)));
const copy = () => structuredClone(base);

test('art plan rejects malformed geometry, color and render parameters', () => {
  assert.equal(validateArtPlan(copy()).version, 1);
  for (const edit of [p => p.geometry.bevelRatio = -1, p => p.geometry.segments = 1.2,
    p => p.materials = [{material:'paint', baseColor:[1,2,3]}], p => p.render.views = ['unknown'],
    p => p.render.resolution = 4096, p => p.geometry.weightedNormals = 'yes', p => p.geometry.bevelWidht = .2]) {
    const p = copy(); edit(p); assert.throws(() => validateArtPlan(p));
  }
});
test('static preflight refuses deforming assets, ambiguous names and wrong material targets', () => {
  const d = beautyFixture(); preflight(d, base);
  d.createAnimation('moving'); assert.throws(() => preflight(d, base), /静态/);
  d.getRoot().listAnimations()[0].dispose();
  d.getRoot().listNodes()[0].setName(''); assert.throws(() => preflight(d, base), /唯一/);
  const p = copy(); p.materials = [{material:'Trim', nodes:['Body']}];
  assert.throws(() => preflight(beautyFixture(), p), /没有材质/);
  p.materials[0].material = 'Unknown'; assert.throws(() => preflight(beautyFixture(), p), /材质名/);
});
test('business contract tolerates float error but catches missing anchors and changed extras', () => {
  const a = identity(beautyFixture()), b = structuredClone(a);
  b[0].matrix[12] += 1e-7; assert.equal(compareIdentity(a,b), true);
  b.pop(); assert.equal(compareIdentity(a,b), false);
  const c = structuredClone(a); c[0].extras = {changed:true}; assert.equal(compareIdentity(a,c), false);
});
test('Blender launch propagates missing binary, nonzero exit and timeout', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'beauty-process-'));
  try {
    await assert.rejects(runBlender(path.join(dir,'missing'), [], path.join(dir,'missing.log')), /无法启动/);
    await assert.rejects(runBlender(process.execPath, ['-e','process.exit(7)'], path.join(dir,'exit.log')), /失败/);
    await assert.rejects(runBlender(process.execPath, ['-e','setInterval(()=>{},1000)'], path.join(dir,'timeout.log'), 30), /超时/);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('failed beauty run retains report and never publishes beautified GLB', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'beauty-failure-'));
  try {
    const input = path.join(dir,'source.glb'); await (await createIO()).write(input, beautyFixture());
    await assert.rejects(beautify(input,{out:dir,blender:path.join(dir,'missing')}), /无法启动/);
    const run = (await fs.readdir(dir)).find(n => n.startsWith('beauty-'));
    const report = JSON.parse(await fs.readFile(path.join(dir,run,'report.json'),'utf8'));
    assert.equal(report.status,'failed');
    await assert.rejects(fs.access(path.join(dir,run,'beautified.glb')));
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
const binary = process.env.BLENDER_BIN ?? 'blender';
const installed = spawnSync(binary,['--version'],{timeout:10000,encoding:'utf8'});
test('Blender 4.5 integration: exported geometry/material changes, stable bindings and render evidence', {skip: installed.status !== 0 ? 'Blender not installed; integration NOT RUN' : false, timeout:180000}, async () => {
  assert.match(installed.stdout, /Blender 4\.5\./, 'Use Blender 4.5 LTS');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'beauty-integration-'));
  try {
    const doc = beautyFixture();
    // Uniform object scale allows automatic bevel, without applying business transforms.
    doc.getRoot().listNodes().find(n=>n.getName()==='Body').setScale([1,1,1]);
    const io = await createIO(), input = path.join(dir,'input.glb'); await io.write(input,doc);
    const plan = JSON.parse(await fs.readFile(new URL('../art/demo.json',import.meta.url)));
    plan.render = {resolution:64,samples:1,views:['hero','bottom']};
    const planFile = path.join(dir,'plan.json'); await fs.writeFile(planFile,JSON.stringify(plan));
    const {directory,report} = await beautify(input,{out:dir,plan:planFile,blender:binary});
    assert.equal(report.contractPreserved,true); assert.equal(report.validation.errors,0);
    assert.equal(report.visualReview,'pending'); assert.ok(report.after.triangles>report.before.triangles);
    assert.ok(report.blender.changes.some(c=>c.operation==='material' && c.edited.includes('baseColor')));
    const out = await io.read(path.join(directory,'beautified.glb'));
    assert.ok(out.getRoot().listMaterials().some(m=>Math.abs(m.getRoughnessFactor()-.32)<1e-5));
    for (const f of ['beautified.blend','before-hero.png','after-hero.png','before-bottom.png','after-bottom.png','comparison.html']) assert.ok((await fs.stat(path.join(directory,f))).size>0);
    assert.notDeepEqual(await fs.readFile(path.join(directory,'before-hero.png')), await fs.readFile(path.join(directory,'after-hero.png')));
    assert.equal(out.getRoot().listCameras().length,0); // Studio rig must not leak into GLB.
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
