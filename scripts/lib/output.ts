// Builds an optimized GLB from named parts (world-space triangle data).
import { Document, NodeIO, PropertyType, type Node } from '@gltf-transform/core'
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
  /**
   * Optional smaller pieces the part splits into (see PieceDef), nested to any depth.
   * Each becomes a child node `<parent>__<piece>`. A part or piece without its own
   * `data` has no mesh of its own: the app shows its pieces merged.
   */
  pieces?: OutputPiece[]
}

export interface OutputPiece {
  id: string
  data?: MeshData
  maxTriangles: number
  /** Simplifier error limit, relative to the mesh size (default 0.01). Small smooth pieces can take more. */
  error?: number
  pieces?: OutputPiece[]
}

/** All geometry of a piece: its own, or else its pieces'. */
function pieceData(piece: OutputPiece): MeshData {
  if (piece.data?.indices.length) return piece.data
  return mergeMeshData((piece.pieces ?? []).map(pieceData))
}

/** All geometry of a part, layers and pieces included. */
export function partData(part: OutputPart): MeshData {
  if (part.pieces && !part.data.indices.length) return pieceData({ ...part, data: undefined })
  return part.layers ? mergeMeshData(part.layers.map((l) => l.data)) : part.data
}

/** Every node with a mesh under the root, at any depth. */
function meshNodes(root: Node): Node[] {
  const out: Node[] = []
  const visit = (n: Node) => {
    if (n.getMesh()) out.push(n)
    n.listChildren().forEach(visit)
  }
  root.listChildren().forEach(visit)
  return out
}

const triangles = (node: Node) => node.getMesh()!.listPrimitives().reduce((a, p) => a + p.getIndices()!.getCount() / 3, 0)

/** Writes parts as child nodes of one root, centered on `origin`, each pivoted at its centroid. */
export async function writePartsGlb(
  file: string,
  rootName: string,
  parts: OutputPart[],
  origin: Vec3,
  extras?: Record<string, unknown>,
  /** Meshopt filters (octahedral normals...): about 30% smaller, for large models. */
  options: { filter?: boolean } = {},
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
  /** Triangle budget of every node with a mesh. */
  const budgets = new Map<Node, number>()
  const errors = new Map<Node, number>()
  /** A piece node at its centroid (relative to the parent's pivot), with its pieces below it. */
  const pieceNode = (name: string, piece: OutputPiece, parentPivot: Vec3): Node => {
    const at = centroid(shift(pieceData(piece)).positions)
    const own = piece.data?.indices.length ? piece.data : null
    const node = own ? addMeshNode(doc, name, shift(own), at) : doc.createNode(name)
    if (own) {
      budgets.set(node, piece.maxTriangles)
      if (piece.error) errors.set(node, piece.error)
    }
    node.setTranslation([at[0] - parentPivot[0], at[1] - parentPivot[1], at[2] - parentPivot[2]])
    for (const child of piece.pieces ?? []) node.addChild(pieceNode(`${name}__${child.id}`, child, at))
    return node
  }
  for (const part of parts) {
    const pivot = centroid(shift(partData(part)).positions)
    if (part.pieces) {
      const node = pieceNode(part.id, { id: part.id, data: part.data, maxTriangles: part.maxTriangles, pieces: part.pieces }, [0, 0, 0])
      root.addChild(node)
      continue
    }
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
    if (!part.pieces) budgets.set(node, part.maxTriangles)
  }
  for (const [node, budget] of budgets) {
    for (const prim of node.getMesh()!.listPrimitives()) {
      const tris = prim.getIndices()!.getCount() / 3
      if (tris > budget) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: budget / tris, error: errors.get(node) ?? 0.01 })
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
  for (const node of meshNodes(root)) {
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
    .setEncoderOptions({ method: options.filter ? EXTMeshoptCompression.EncoderMethod.FILTER : EXTMeshoptCompression.EncoderMethod.QUANTIZE })

  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  await io.write(file, doc)

  const tris = meshNodes(root).reduce((s, n) => s + triangles(n), 0)
  const { size } = await stat(file)
  console.log(`${file}: ${parts.length} parts, ${tris} triangles, ${(size / 1024 / 1024).toFixed(2)} MB`)
}

function lookMaterial(doc: Document, look: string) {
  return doc.getRoot().listMaterials().find((m) => m.getName() === look) ?? doc.createMaterial(look).setDoubleSided(true)
}
