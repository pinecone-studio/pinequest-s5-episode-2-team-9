// Lists every node of a GLB with its mesh, triangle count and world-space bounds.
// Usage: npx tsx scripts/inspect-glb.ts <file.glb> [nameFilterRegex]
import { NodeIO, type Node } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { worldBounds } from './lib/gltf'

const [file, filter] = process.argv.slice(2)
if (!file) {
  console.error('Usage: npx tsx scripts/inspect-glb.ts <file.glb> [nameFilterRegex]')
  process.exit(1)
}

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(file)
const pattern = filter ? new RegExp(filter, 'i') : null
const fmt = (v: number[]) => v.map((n) => n.toFixed(3)).join(', ')

let totalTris = 0
const visit = (node: Node, depth: number) => {
  const mesh = node.getMesh()
  const tris = mesh
    ? mesh.listPrimitives().reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3, 0)
    : 0
  totalTris += tris
  if (!pattern || pattern.test(node.getName())) {
    const b = mesh ? worldBounds(node) : null
    console.log(
      `${'  '.repeat(depth)}${node.getName() || '(unnamed)'}${mesh ? `  [${tris} tris]` : ''}` +
        (b ? `  min(${fmt(b.min)}) max(${fmt(b.max)})` : ''),
    )
  }
  node.listChildren().forEach((c) => visit(c, depth + 1))
}
doc.getRoot().listScenes().forEach((s) => s.listChildren().forEach((n) => visit(n, 0)))
console.log(`\nTotal triangles: ${totalTris}`)
