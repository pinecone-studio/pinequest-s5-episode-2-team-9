# Lists every mesh object in the Z-Anatomy .blend with its collection path,
# vertex count and world bounds. Run headless:
#   Blender -b Startup.blend --python index_zanatomy.py -- out.json
import bpy, json, sys

out = sys.argv[sys.argv.index("--") + 1]

def collection_paths():
    paths = {}
    def walk(col, trail):
        for obj in col.objects:
            paths.setdefault(obj.name, "/".join(trail))
        for child in col.children:
            walk(child, trail + [child.name])
    walk(bpy.context.scene.collection, [])
    return paths

paths = collection_paths()
items = []
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    bb = [obj.matrix_world @ v.co for v in obj.data.vertices[:: max(1, len(obj.data.vertices) // 200)]]
    if not bb:
        continue
    mn = [min(p[i] for p in bb) for i in range(3)]
    mx = [max(p[i] for p in bb) for i in range(3)]
    items.append({
        "name": obj.name,
        "collection": paths.get(obj.name, ""),
        "verts": len(obj.data.vertices),
        "min": mn,
        "max": mx,
        "hidden": obj.hide_get() if hasattr(obj, "hide_get") else False,
    })
with open(out, "w") as f:
    json.dump(items, f)
print("indexed", len(items))
