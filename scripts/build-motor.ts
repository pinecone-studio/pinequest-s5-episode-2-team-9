// Builds public/models/electric-motor.glb: an original brushed DC motor,
// modelled in code. The shaft runs along x; units are arbitrary (normalized in-app).
//
// Usage: npx tsx scripts/build-motor.ts
import { mkdir } from 'node:fs/promises'
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { boundsOf, mergeMeshData, type MeshData, type Vec3 } from './lib/gltf'
import { writePartsGlb, type OutputPart } from './lib/output'
import { merge, placed } from './lib/three-mesh'

const POLES = 7
const ALONG_X: Vec3 = [0, 0, -Math.PI / 2]

/** Cylinder along x. */
const xcyl = (r: number, length: number, x: number, seg = 48, rEnd = r) =>
  placed(new CylinderGeometry(r, rEnd, length, seg), { position: [x, 0, 0], rotation: ALONG_X })

/** Tube shell (ring) along x between two radii. */
function xring(rIn: number, rOut: number, x0: number, x1: number, seg = 72): MeshData {
  const profile = [new Vector2(rOut, x0), new Vector2(rOut, x1), new Vector2(rIn, x1), new Vector2(rIn, x0), new Vector2(rOut, x0)]
  // Lathe revolves around y; rotate so the axis becomes x.
  return placed(new LatheGeometry(profile, seg), { rotation: ALONG_X })
}

/** Extrudes a 2D shape (in the y-z plane) along x from x0 to x1. */
function extrudeX(shape: Shape, x0: number, x1: number): MeshData {
  const geo = new ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 24 })
  // Extrude goes along +z in shape space; rotate so it goes along +x.
  return placed(geo, { position: [x0, 0, 0], rotation: [0, Math.PI / 2, 0] })
}

const tube = (points: Vec3[], radius: number, closed = false, segments = 64) =>
  placed(new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p)), closed), segments, radius, 10, closed))

// ---- Armature lamination: a hub with T-shaped teeth (poles) ----
const HUB_R = 0.18
const STEM_R = 0.52
const SHOE_R = 0.62
const STEM_HALF = 0.07
const SHOE_HALF = 0.36

function laminationShape(): Shape {
  const pts: Vector2[] = []
  const at = (r: number, a: number) => new Vector2(Math.cos(a) * r, Math.sin(a) * r)
  for (let i = 0; i < POLES; i++) {
    const c = (i / POLES) * Math.PI * 2
    const stemA = STEM_HALF / STEM_R
    const shoeA = SHOE_HALF
    pts.push(at(HUB_R, c - stemA * 1.6))
    pts.push(at(STEM_R, c - stemA))
    pts.push(at(STEM_R, c - shoeA))
    for (let k = 0; k <= 8; k++) pts.push(at(SHOE_R, c - shoeA + (2 * shoeA * k) / 8))
    pts.push(at(STEM_R, c + shoeA))
    pts.push(at(STEM_R, c + stemA))
    pts.push(at(HUB_R, c + stemA * 1.6))
  }
  const shape = new Shape(pts)
  const hole = new Path()
  hole.absarc(0, 0, 0.065, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return shape
}

function armatureCore(): MeshData {
  const shape = laminationShape()
  const sheets: MeshData[] = []
  const count = 14
  const x0 = -0.5
  const pitch = 1.0 / count
  for (let i = 0; i < count; i++) sheets.push(extrudeX(shape, x0 + i * pitch, x0 + i * pitch + pitch * 0.82))
  return merge(...sheets)
}

function windings(): MeshData {
  const loops: MeshData[] = []
  for (let i = 0; i < POLES; i++) {
    const c = (i / POLES) * Math.PI * 2
    const radial = new Vector3(0, Math.cos(c), Math.sin(c))
    const tangent = new Vector3(0, -Math.sin(c), Math.cos(c))
    for (const r of [0.27, 0.34, 0.41, 0.48]) {
      const half = 0.1 + (r - 0.27) * 0.25
      const corners = [
        [-0.56, -half],
        [0.56, -half],
        [0.56, half],
        [-0.56, half],
      ].map(([x, t]) => {
        const p = radial.clone().multiplyScalar(r).add(tangent.clone().multiplyScalar(t))
        return [x, p.y, p.z] as Vec3
      })
      loops.push(tube(corners, 0.028, true, 48))
    }
    // Lead wire from each coil to its commutator segment.
    const end = radial.clone().multiplyScalar(0.2)
    const start = radial.clone().multiplyScalar(0.3)
    loops.push(tube([[0.56, start.y, start.z], [0.68, end.y * 1.2, end.z * 1.2], [0.78, end.y, end.z]], 0.012))
  }
  return merge(...loops)
}

function commutator(): MeshData {
  const segments: MeshData[] = []
  const n = POLES * 2
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 0.2
    segments.push(
      placed(new BoxGeometry(0.34, 0.03, 2 * r * Math.tan(Math.PI / n) * 0.82), {
        position: [0.92, Math.cos(a) * r, Math.sin(a) * r],
        rotation: [a, 0, 0],
      }),
    )
  }
  return merge(xcyl(0.18, 0.36, 0.92, 32), ...segments)
}

function brushes(): MeshData {
  const parts: MeshData[] = []
  for (const s of [1, -1]) {
    const y = s * 0.3
    parts.push(placed(new BoxGeometry(0.14, 0.18, 0.12), { position: [0.92, y, 0] }))
    // Spring pressing the brush onto the commutator.
    const coil: Vec3[] = []
    for (let k = 0; k <= 60; k++) {
      const a = (k / 60) * Math.PI * 2 * 6
      coil.push([0.92 + Math.cos(a) * 0.045, y + s * (0.1 + (k / 60) * 0.16), Math.sin(a) * 0.045])
    }
    parts.push(tube(coil, 0.008, false, 120))
    parts.push(tube([[0.92, y + s * 0.09, 0.06], [1.05, y + s * 0.2, 0.12], [1.22, y + s * 0.2, 0.1]], 0.01))
  }
  return merge(...parts)
}

function magnet(sign: 1 | -1): MeshData {
  const shape = new Shape()
  const a0 = sign > 0 ? Math.PI / 2 - 1.2 : -Math.PI / 2 - 1.2
  const a1 = a0 + 2.4
  shape.absarc(0, 0, 0.82, a0, a1, false)
  shape.absarc(0, 0, 0.67, a1, a0, true)
  return extrudeX(shape, -0.55, 0.55)
}

const housing = () =>
  merge(
    xring(0.82, 0.9, -0.66, 0.66, 96),
    // Mounting feet.
    placed(new BoxGeometry(1.0, 0.1, 1.5), { position: [0, -0.95, 0] }),
    placed(new BoxGeometry(0.8, 0.12, 0.12), { position: [0, -0.88, 0.5] }),
    placed(new BoxGeometry(0.8, 0.12, 0.12), { position: [0, -0.88, -0.5] }),
  )

function endCap(x: number, side: 1 | -1, withHolders: boolean): MeshData {
  const profile = [
    new Vector2(0.05, 0),
    new Vector2(0.9, 0),
    new Vector2(0.9, 0.12 * side),
    new Vector2(0.2, 0.12 * side),
    new Vector2(0.2, 0.26 * side),
    new Vector2(0.12, 0.26 * side),
    new Vector2(0.12, 0.08 * side),
    new Vector2(0.05, 0.08 * side),
  ]
  if (side < 0) profile.reverse()
  const cap = placed(new LatheGeometry([...profile, profile[0]], 72), { position: [x, 0, 0], rotation: ALONG_X })
  const vents = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + 0.3
    return placed(new TorusGeometry(0.06, 0.012, 8, 24), {
      position: [x + 0.13 * side, Math.cos(a) * 0.55, Math.sin(a) * 0.55],
      rotation: [0, Math.PI / 2, 0],
    })
  })
  const parts = [cap, ...vents]
  if (withHolders) {
    for (const s of [1, -1]) {
      parts.push(placed(new BoxGeometry(0.2, 0.3, 0.18), { position: [0.92, s * 0.42, 0] }))
      parts.push(placed(new BoxGeometry(0.34, 0.06, 0.06), { position: [1.08, s * 0.5, 0] }))
    }
  }
  return merge(...parts)
}

function bearing(x: number): MeshData {
  const balls = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2
    return placed(new SphereGeometry(0.028, 12, 8), { position: [x, Math.cos(a) * 0.095, Math.sin(a) * 0.095] })
  })
  return merge(xring(0.065, 0.08, x - 0.04, x + 0.04, 40), xring(0.11, 0.125, x - 0.04, x + 0.04, 40), ...balls)
}

function fan(): MeshData {
  const x = -1.05
  const blades = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2
    return placed(new BoxGeometry(0.12, 0.42, 0.02), {
      position: [x, Math.cos(a) * 0.32, Math.sin(a) * 0.32],
      rotation: [a, 0.45, 0],
    })
  })
  return merge(xcyl(0.12, 0.14, x, 32), ...blades)
}

function terminals(): MeshData {
  const parts: MeshData[] = []
  for (const s of [1, -1]) {
    parts.push(placed(new BoxGeometry(0.16, 0.05, 0.08), { position: [1.42, s * 0.3, 0.3] }))
    parts.push(placed(new TorusGeometry(0.03, 0.01, 8, 16), { position: [1.5, s * 0.3, 0.3], rotation: [Math.PI / 2, 0, 0] }))
    parts.push(tube([[1.36, s * 0.3, 0.3], [1.3, s * 0.28, 0.2], [1.22, s * 0.22, 0.1]], 0.012))
  }
  return merge(...parts)
}

const PARTS: { id: string; build: () => MeshData; maxTriangles: number }[] = [
  { id: 'housing', build: housing, maxTriangles: 4000 },
  { id: 'north_magnet', build: () => magnet(1), maxTriangles: 2000 },
  { id: 'south_magnet', build: () => magnet(-1), maxTriangles: 2000 },
  { id: 'shaft', build: () => xcyl(0.06, 3.0, 0.15, 32), maxTriangles: 800 },
  { id: 'armature_core', build: armatureCore, maxTriangles: 20000 },
  { id: 'windings', build: windings, maxTriangles: 20000 },
  { id: 'commutator', build: commutator, maxTriangles: 3000 },
  { id: 'brushes', build: brushes, maxTriangles: 6000 },
  { id: 'front_bearing', build: () => bearing(-0.82), maxTriangles: 3000 },
  { id: 'rear_bearing', build: () => bearing(1.3), maxTriangles: 3000 },
  { id: 'front_end_cap', build: () => endCap(-0.68, -1, false), maxTriangles: 4000 },
  { id: 'rear_end_cap', build: () => endCap(1.18, 1, true), maxTriangles: 4000 },
  { id: 'fan', build: fan, maxTriangles: 1500 },
  { id: 'terminals', build: terminals, maxTriangles: 2000 },
]

await mkdir('public/models', { recursive: true })
const parts: OutputPart[] = PARTS.map((p) => ({ id: p.id, data: p.build(), maxTriangles: p.maxTriangles }))
const b = boundsOf(mergeMeshData(parts.map((p) => p.data)).positions)
console.log('bounds', b)
const origin: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
await writePartsGlb('public/models/electric-motor.glb', 'electricMotor', parts, origin)
