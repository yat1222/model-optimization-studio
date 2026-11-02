"""Blender 4.5 LTS worker. Called by src/beautify.js; no model-supplied code runs."""
import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from material_maker import texture_material

import bpy
import bmesh
from mathutils import Vector


def import_model(filename):
    previous = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(filename))
    return list(set(bpy.data.objects) - previous)


def bounds(objects):
    points = [o.matrix_world @ Vector(c) for o in objects if o.type == 'MESH' for c in o.bound_box]
    if not points:
        raise RuntimeError('No mesh bounds')
    lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    if (hi - lo).length < 1e-8:
        raise RuntimeError('Degenerate model bounds')
    return lo, hi


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def make_rig(lo, hi, config):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = config['samples']
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = config['resolution']
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = config.get('exposure', 0)
    scene.view_settings.gamma = 1
    scene.world = bpy.data.worlds.new('Beauty studio world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.16, 0.19, 0.24, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.45
    center, scale = (lo + hi) / 2, (hi - lo).length
    for name, offset, power, size in [
        ('Key', (2, -3, 4), 1600, 2.5),
        ('Fill', (-3, -1, 2), 900, 3),
        ('Rim', (1, 3, 3), 2100, 2),
    ]:
        data = bpy.data.lights.new('Beauty ' + name, 'AREA')
        data.energy, data.shape, data.size = power * scale * scale, 'DISK', size * scale
        obj = bpy.data.objects.new('Beauty ' + name, data)
        scene.collection.objects.link(obj)
        obj.location = center + Vector(offset) * scale
        aim(obj, center)
    bpy.ops.mesh.primitive_plane_add(size=scale * 200, location=(center.x, center.y, lo.z - scale * 0.015))
    floor = bpy.context.object
    floor.name = 'Beauty presentation floor'
    mat = bpy.data.materials.new('Beauty floor')
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (0.105, 0.12, 0.15, 1)
    p.inputs['Roughness'].default_value = 0.85
    floor.data.materials.append(mat)
    data = bpy.data.cameras.new('Beauty comparison camera')
    camera = bpy.data.objects.new('Beauty comparison camera', data)
    scene.collection.objects.link(camera)
    data.type = 'ORTHO'
    data.ortho_scale, data.clip_start, data.clip_end = scale * 1.25, scale * 0.001, scale * 1000
    scene.camera = camera
    return camera, center, scale, floor


DIRECTIONS = {
    'front': (0, -1, 0), 'back': (0, 1, 0), 'left': (-1, 0, 0),
    'right': (1, 0, 0), 'top': (0, 0, 1), 'bottom': (0, 0, -1), 'hero': (1.5, -2, 1.35),
}


def render_views(folder, phase, config, rig):
    camera, center, scale, floor = rig
    for view in config['views']:
        floor.hide_render = view == 'bottom'
        camera.location = center + Vector(DIRECTIONS[view]).normalized() * scale * 4
        aim(camera, center)
        bpy.context.scene.render.filepath = str(folder / f'{phase}-{view}.png')
        bpy.ops.render.render(write_still=True)
    floor.hide_render = False


def srgb_linear(v):
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def material_pass(objects, rules, changes):
    # Explicit rules only: a name is an identifier, never a material classifier.
    material_map = {m.name: m for o in objects if o.type == 'MESH' for m in o.data.materials if m}
    for index, rule in enumerate(rules):
        source = material_map.get(rule['material'])
        if source is None:
            raise RuntimeError('Blender did not preserve material name: ' + rule['material'])
        targets = [o for o in objects if o.type == 'MESH' and ('nodes' not in rule or o.name in rule['nodes']) and source in list(o.data.materials)]
        if not targets:
            raise RuntimeError('Material rule matched no objects: ' + rule['material'])
        result = texture_material(source, rule, index, targets, changes) if rule.get('textureSet') else source.copy()
        result.name = f'{source.name}__beauty_{index}'
        result.use_nodes = True
        principled = next((n for n in result.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if principled is None:
            raise RuntimeError('Unsupported material graph: ' + source.name)
        edited, skipped = [], []
        for key, socket_name in [('baseColor', 'Base Color'), ('roughness', 'Roughness'), ('metallic', 'Metallic')]:
            if key not in rule:
                continue
            socket = principled.inputs[socket_name]
            if socket.is_linked and not rule.get('replaceTextures', False):
                skipped.append(key + ': linked texture preserved')
                continue
            for link in list(socket.links):
                result.node_tree.links.remove(link)
            value = rule[key]
            socket.default_value = tuple(srgb_linear(v) for v in value) + (1,) if key == 'baseColor' else value
            edited.append(key)
        for obj in targets:
            # Mesh data was made single-user before this pass; don't affect untargeted instances.
            for slot in obj.material_slots:
                if slot.material == source:
                    slot.material = result
        changes.append({'operation': 'material', 'material': source.name, 'nodes': [o.name for o in targets], 'edited': edited, 'skipped': skipped})


def geometry_pass(objects, config, changes):
    for obj in objects:
        if obj.type != 'MESH':
            continue
        reason = None
        if obj.name in config['excludeNodes']:
            reason = 'excluded by art plan'
        elif config['bevelRatio'] == 0:
            reason = 'bevel disabled'
        elif len(obj.data.polygons) > 200000:
            reason = 'over 200k faces; requires a targeted artist pass'
        elif any(s <= 0 for s in obj.scale) or max(obj.scale) - min(obj.scale) > 1e-5:
            reason = 'non-uniform/negative scale; not applied to preserve transforms'
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        if not reason and (not bm.edges or any(not e.is_manifold for e in bm.edges)):
            reason = 'open/non-manifold mesh; no automatic bevel'
        bm.free()
        if reason:
            changes.append({'operation': 'geometry', 'node': obj.name, 'skipped': reason})
            continue
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        dims = [max(v.co[i] for v in obj.data.vertices) - min(v.co[i] for v in obj.data.vertices) for i in range(3)]
        width = min(Vector(dims).length * config['bevelRatio'], min(dims) * 0.05)
        if width <= 0:
            continue
        for poly in obj.data.polygons:
            poly.use_smooth = True
        obj.data.set_sharp_from_angle(angle=math.radians(config['angle']))
        bevel = obj.modifiers.new('Beauty edge highlights', 'BEVEL')
        bevel.width = width
        bevel.segments = config['segments']
        bevel.limit_method = 'ANGLE'
        bevel.angle_limit = math.radians(config['angle'])
        bevel.use_clamp_overlap = True
        bevel.harden_normals = True
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        if config['weightedNormals']:
            normal = obj.modifiers.new('Beauty weighted normals', 'WEIGHTED_NORMAL')
            normal.keep_sharp = True
            bpy.ops.object.modifier_apply(modifier=normal.name)
        changes.append({'operation': 'bevel-and-normals', 'node': obj.name, 'widthLocal': width, 'segments': config['segments']})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workdir', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if bpy.app.version[:2] != (4, 5):
        raise RuntimeError('This worker requires Blender 4.5 LTS; other versions are not validated')
    folder = Path(args.workdir).resolve()
    plan = json.loads((folder / 'art-plan.json').read_text(encoding='utf-8'))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    objects = import_model(folder / 'source.glb')
    bpy.context.view_layer.update()
    lo, hi = bounds(objects)
    rig = make_rig(lo, hi, plan['render'])
    render_views(folder, 'before', plan['render'], rig)
    for obj in objects:
        if obj.type == 'MESH':
            obj.data = obj.data.copy()
    changes = []
    material_pass(objects, plan['materials'], changes)
    geometry_pass(objects, plan['geometry'], changes)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(folder / 'candidate.glb'), export_format='GLB', use_selection=True,
                              export_extras=True, export_cameras=False, export_lights=False,
                              export_animations=False, export_apply=True)
    # Inspect the delivered GLB, not only an unexported Blender viewport.
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    import_model(folder / 'candidate.glb')
    render_views(folder, 'after', plan['render'], rig)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'beautified.blend'))
    (folder / 'blender-report.json').write_text(json.dumps({
        'version': bpy.app.version_string, 'changes': changes,
        'render': dict(plan['render'], engine='CYCLES', device='CPU', viewTransform='AgX'),
        'comparison': 'same rig; after images rendered from re-imported candidate.glb',
        'visualReview': 'pending',
    }, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
