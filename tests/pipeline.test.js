import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture } from './fixture.js';
import { createIO, optimize, contract, validate } from '../src/pipeline.js';
async function setup(t, ext = 'glb', options) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'model-studio-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const io = await createIO(), input = path.join(dir, 'model.' + ext), doc = fixture(options);
  await io.write(input, doc);
  return { input, doc, io, dir };
}
test('safe compresses and roundtrips graph, extras, animation and positions', async t => {
  const { input, io, doc } = await setup(t);
  const r = await optimize(input);
  assert.equal((await validate(r.bytes)).errors, 0);
  const out = await io.readBinary(r.bytes);
  assert.equal(contract(out), contract(doc));
  assert.deepEqual(out.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getArray(), doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getArray());
  assert.ok(r.report.outputBytes < r.report.sourceBytes);
  assert.equal(r.report.candidates[0].accepted, true);
});
test('external glTF resources and auto candidates', async t => {
  const { input } = await setup(t, 'gltf');
  const r = await optimize(input, { preset: 'auto' });
  assert.equal(r.report.candidates.length, 3);
  assert.ok(r.report.candidates.every(c => c.accepted));
  assert.ok(r.report.after.triangles < r.report.before.triangles);
});
test('morph meshes skip simplification', async t => {
  const { input } = await setup(t, 'glb', { morph: true });
  const r = await optimize(input, { preset: 'compact' });
  assert.equal(r.report.after.triangles, r.report.before.triangles);
  assert.match(r.report.candidates[0].notes[0], /跳过减面/);
});
test('none outputs without geometry compression', async t => {
  const { input, io } = await setup(t);
  const compressed = await optimize(input);
  await fs.writeFile(input, compressed.bytes);
  const r = await optimize(input, { compression: 'none' });
  const out = await io.readBinary(r.bytes);
  assert.ok(!out.getRoot().listExtensionsUsed().some(e => /compression/.test(e.extensionName)));
});
test('reject unknown extensions and out-of-folder resources', async t => {
  const { input } = await setup(t, 'gltf');
  const json = JSON.parse(await fs.readFile(input, 'utf8'));
  json.extensionsUsed = ['VENDOR_unknown'];
  await fs.writeFile(input, JSON.stringify(json));
  await assert.rejects(optimize(input), /不支持的扩展/);
  json.extensionsUsed = [];
  json.buffers[0].uri = 'https://example.org/buffer.bin';
  await fs.writeFile(input, JSON.stringify(json));
  await assert.rejects(optimize(input), /资源必须/);
});
test('invalid arguments fail early', async () => {
  await assert.rejects(optimize('missing.glb', { preset: 'typo' }), /未知 preset/);
});
test('compact resizes PNG textures and preserves alpha', async t => {
  const { input, io, doc } = await setup(t);
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 1100, height: 800, channels: 4, background: { r: 120, g: 80, b: 40, alpha: 0.5 } } }).png().toBuffer();
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(prim.getAttribute('POSITION').getCount() * 2)).setBuffer(doc.getRoot().listBuffers()[0]));
  const texture = doc.createTexture('base').setMimeType('image/png').setImage(png);
  doc.getRoot().listMeshes()[0].listPrimitives()[0].setMaterial(doc.createMaterial('paint').setBaseColorTexture(texture).setAlphaMode('BLEND'));
  await io.write(input, doc);
  const { candidate } = await import('../src/pipeline.js');
  const r = await candidate(io, await io.writeBinary(doc), 'compact', 'meshopt');
  assert.equal(r.report.accepted, true);
  const decoded = await io.readBinary(r.bytes);
  const meta = await sharp(decoded.getRoot().listTextures()[0].getImage()).metadata();
  assert.equal(meta.width, 1024);
  assert.equal(meta.hasAlpha, true);
});
test('invalid source geometry fails validation before optimization', async t => {
  const { input } = await setup(t, 'gltf');
  const json = JSON.parse(await fs.readFile(input, 'utf8'));
  json.meshes[0].primitives[0].attributes.POSITION = 999;
  await fs.writeFile(input, JSON.stringify(json));
  await assert.rejects(optimize(input), /原始模型验证失败/);
});
