# Exports selected objects from a .blend as world-space triangle soups (float32,
# little-endian, x y z per vertex) plus exact bounds. Run headless:
#   Blender -b --disable-autoexec file.blend --python export_objects.py -- request.json outdir
import bpy, json, os, struct, sys

request_path, outdir = sys.argv[sys.argv.index("--") + 1 :][:2]
request = json.load(open(request_path))
os.makedirs(outdir, exist_ok=True)
depsgraph = bpy.context.evaluated_depsgraph_get()
bounds = {}

for name in request["meshes"] + request["bounds"]:
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        print("missing", name)
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    m = obj.matrix_world
    verts = [m @ v.co for v in mesh.vertices]
    mn = [min(v[i] for v in verts) for i in range(3)]
    mx = [max(v[i] for v in verts) for i in range(3)]
    bounds[name] = {"min": mn, "max": mx}
    if name in request["meshes"]:
        data = bytearray()
        for tri in mesh.loop_triangles:
            for vi in tri.vertices:
                v = verts[vi]
                data += struct.pack("<3f", v[0], v[1], v[2])
        with open(os.path.join(outdir, name + ".f32"), "wb") as f:
            f.write(data)
    evaluated.to_mesh_clear()

with open(os.path.join(outdir, "bounds.json"), "w") as f:
    json.dump(bounds, f)
print("exported", len(bounds))
