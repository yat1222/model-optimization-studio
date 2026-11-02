"""Connect only generated Material Maker textures to exportable Principled nodes."""
import math
import bpy


def texture_material(source, rule, index, targets, changes):
    spec = rule['textureSet']
    settings = rule['preset']
    result = bpy.data.materials.new(f'{source.name}__mm_{index}')
    result.use_nodes = True
    tree = result.node_tree
    principled = tree.nodes.get('Principled BSDF')
    principled.inputs['Metallic'].default_value = spec['defaults']['metallic']
    principled.inputs['Roughness'].default_value = spec['defaults']['roughness']
    coordinates = tree.nodes.new('ShaderNodeUVMap')
    # An unnamed UV Map node uses the active render UV map of each object.
    coordinates.uv_map = ''
    for slot, filename in spec['maps'].items():
        image = bpy.data.images.load(filename, check_existing=False)
        if tuple(image.size) != (settings['size'], settings['size']):
            raise RuntimeError('Preset texture dimensions do not match request: ' + filename)
        image.colorspace_settings.name = 'sRGB' if slot == 'baseColor' else 'Non-Color'
        tex = tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.extension = 'REPEAT'
        tree.links.new(coordinates.outputs['UV'], tex.inputs['Vector'])
        if slot == 'normal':
            normal = tree.nodes.new('ShaderNodeNormalMap')
            normal.space = 'TANGENT'
            normal.inputs['Strength'].default_value = settings.get('normalStrength', 1)
            tree.links.new(tex.outputs['Color'], normal.inputs['Color'])
            tree.links.new(normal.outputs['Normal'], principled.inputs['Normal'])
        else:
            target = {'baseColor': 'Base Color', 'roughness': 'Roughness', 'metallic': 'Metallic'}[slot]
            tree.links.new(tex.outputs['Color'], principled.inputs[target])
    for obj in targets:
        generated = False
        if not obj.data.uv_layers:
            if settings['uv'] != 'generate-if-missing':
                raise RuntimeError('Preset requires UVs: ' + obj.name)
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
            bpy.ops.object.mode_set(mode='OBJECT')
            generated = True
        sx, sy = settings.get('uvScale', [1, 1])
        slots = {i for i, m in enumerate(obj.data.materials) if m == source}
        uv = obj.data.uv_layers.active.data
        for polygon in obj.data.polygons:
            if polygon.material_index in slots:
                for i in polygon.loop_indices:
                    uv[i].uv.x *= sx
                    uv[i].uv.y *= sy
        changes.append({'operation': 'material-maker-uv', 'node': obj.name, 'generated': generated, 'uvScale': [sx, sy]})
    changes.append({'operation': 'material-maker-textures', 'material': source.name, 'preset': spec['preset'],
                    'maps': list(spec['maps']), 'source': spec['source'], 'omitted': spec['omitted']})
    return result
