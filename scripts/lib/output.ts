// Builds an optimized GLB from named parts (world-space triangle data).
import { Document, NodeIO, PropertyType } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { dedup, prune, reorder, simplifyPrimitive, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { stat } from 'node:fs/promises'
import { addMeshNode, centroid, mergeMeshData, type MeshData, type Vec3 } from './gltf'

export interface OutputPart {
  id: string
  data: MeshData
  /** Max triangles after simplification (per primitive). */
  maxTriangles: number
  /**
   * Optional sub-meshes with their own realistic look (a material named after
   * the look id), e.g. gold contacts on a memory module. `data` is then ignored.
   */
  layers?: { look: string; data: MeshData }[]
}

/** All geometry of a part, layers included. */
export function partData(part: OutputPart): MeshData {
  return part.layers ? mergeMeshData(part.layers.map((l) => l.data)) : part.data
}

/** Writes parts as child nodes of one root, centered on `origin`, each pivoted at its centroid. */
export async function writePartsGlb(
  file: string,
  rootName: string,
  parts: OutputPart[],
  origin: Vec3,
  extras?: Record<string, unknown>,
): Promise<void> {
  await MeshoptSimplifier.ready
  await MeshoptEncoder.ready
  const doc = new Document()
  doc.createBuffer()
  doc.createMaterial('holo').setDoubleSided(true)
  const root = doc.createNode(rootName)
  if (extras) root.setExtras(extras)
  doc.createScene(rootName).addChild(root)

  const shift = (d: MeshData): MeshData => {
    const positions = new Float32Array(d.positions.length)
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = d.positions[i] - origin[0]
      positions[i + 1] = d.positions[i + 1] - origin[1]
      positions[i + 2] = d.positions[i + 2] - origin[2]
    }
    return { ...d, positions }
  }
  for (const part of parts) {
    const pivot = centroid(shift(partData(part)).positions)
    if (!part.layers) {
      root.addChild(addMeshNode(doc, part.id, shift(part.data), pivot))
      continue
    }
    // One primitive per layer, each with a material named after its look.
    const [first, ...rest] = part.layers
    const node = addMeshNode(doc, part.id, shift(first.data), pivot, lookMaterial(doc, first.look))
    rest.forEach((layer, i) => {
      const extra = addMeshNode(doc, `${part.id}_${i + 1}`, shift(layer.data), pivot, lookMaterial(doc, layer.look))
      for (const prim of extra.getMesh()!.listPrimitives()) node.getMesh()!.addPrimitive(prim)
      extra.getMesh()!.dispose()
      extra.dispose()
    })
    root.addChild(node)
  }

  await doc.transform(weld())
  for (const part of parts) {
    const node = root.listChildren().find((n) => n.getName() === part.id)!
    for (const prim of node.getMesh()!.listPrimitives()) {
      const tris = prim.getIndices()!.getCount() / 3
      if (tris > part.maxTriangles) {
        simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: part.maxTriangles / tris, error: 0.01 })
      }
    }
  }
  // Materials differ only by name (the look id), so dedup must leave them alone.
  await doc.transform(
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH] }),
    prune(),
    reorder({ encoder: MeshoptEncoder }),
  )

  // Zero-length normals turn into NaN in lit shaders, and bloom smears NaN
  // pixels across the screen. Give them a valid direction.
  let fixed = 0
  for (const node of root.listChildren()) {
    for (const prim of node.getMesh()!.listPrimitives()) {
      const normal = prim.getAttribute('NORMAL')
      if (!normal) continue
      const v: number[] = [0, 0, 0]
      for (let i = 0; i < normal.getCount(); i++) {
        normal.getElement(i, v)
        const l = Math.hypot(v[0], v[1], v[2])
        if (!(l > 1e-4)) {
          normal.setElement(i, [0, 1, 0])
          fixed++
        } else if (Math.abs(l - 1) > 1e-3) normal.setElement(i, [v[0] / l, v[1] / l, v[2] / l])
      }
    }
  }
  if (fixed) console.log(`fixed ${fixed} zero-length normals`)
  doc.createExtension(KHRMeshQuantization).setRequired(true)
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })

  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  await io.write(file, doc)

  const tris = root
    .listChildren()
    .reduce((s, n) => s + n.getMesh()!.listPrimitives().reduce((a, p) => a + p.getIndices()!.getCount() / 3, 0), 0)
  const { size } = await stat(file)
  console.log(`${file}: ${parts.length} parts, ${tris} triangles, ${(size / 1024 / 1024).toFixed(2)} MB`)
}

function lookMaterial(doc: Document, look: string) {
  return doc.getRoot().listMaterials().find((m) => m.getName() === look) ?? doc.createMaterial(look).setDoubleSided(true)
}
