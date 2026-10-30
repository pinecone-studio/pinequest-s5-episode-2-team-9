// The apple, its tree and the patch of grass it falls onto (procedural, no files).
import { useEffect, useMemo } from 'react'
import {
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  IcosahedronGeometry,
  LatheGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Cheap repeatable noise in [0, 1) for vertex colours and bumps. */
function hash(x: number, y: number, z = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}

/** Apple profile, bottom to top: a wider shoulder and dimples where the stem and calyx sit. */
function appleGeometry(): BufferGeometry {
  const pts: Vector2[] = []
  const N = 48
  for (let i = 0; i <= N; i++) {
    const a = (Math.PI * i) / N
    const r = 1 - 0.09 * Math.cos(a)
    let y = -r * Math.cos(a) * 0.9
    y -= 0.3 * Math.exp(-(((Math.PI - a) / 0.34) ** 2))
    y += 0.14 * Math.exp(-((a / 0.3) ** 2))
    pts.push(new Vector2(Math.max(1e-3, r * Math.sin(a)), y))
  }
  const g = new LatheGeometry(pts, 72)
  const uv = g.getAttribute('uv')
  const pos = g.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const deep = new Color('#7d0d12')
  const red = new Color('#c4231f')
  const blush = new Color('#e2552b')
  const yellow = new Color('#c9b04a')
  const c = new Color()
  for (let i = 0; i < pos.count; i++) {
    const around = uv.getX(i) * Math.PI * 2
    const along = uv.getY(i)
    // Streaks running from stem to calyx, broken up with noise.
    const streak = 0.5 + 0.5 * Math.sin(around * 15 + Math.sin(along * 9) * 0.8 + hash(i % 73, 1) * 0.6)
    c.copy(deep).lerp(red, 0.45 + 0.4 * streak)
    // One cheek caught more sun.
    c.lerp(blush, Math.max(0, Math.cos(around - 0.6)) * 0.35 * Math.sin(along * Math.PI))
    // Yellow-green round the stem cavity and the calyx.
    c.lerp(yellow, Math.max(0, along - 0.86) * 4.5 * 0.7 + Math.max(0, 0.12 - along) * 3)
    // Lenticels: tiny pale freckles.
    if (hash(pos.getX(i) * 40, pos.getY(i) * 40, pos.getZ(i) * 40) > 0.985) c.lerp(yellow, 0.6)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

function leafGeometry(): BufferGeometry {
  const s = new Shape()
  s.moveTo(0, 0)
  s.quadraticCurveTo(0.42, 0.28, 0, 1)
  s.quadraticCurveTo(-0.42, 0.28, 0, 0)
  const g = new ShapeGeometry(s, 16)
  // A gentle fold along the midrib.
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * 0.35 - p.getY(i) * p.getY(i) * 0.15)
  g.computeVertexNormals()
  return g
}

/** An apple of unit radius, stem up. */
export function Apple() {
  const geo = useMemo(() => {
    const stem = new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(0, 0.5, 0),
        new Vector3(0.02, 0.8, 0),
        new Vector3(0.09, 1.05, 0.02),
      ]),
      12,
      0.035,
      8,
    )
    return { body: appleGeometry(), stem, leaf: leafGeometry() }
  }, [])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  return (
    <group>
      <mesh geometry={geo.body}>
        <meshPhysicalMaterial vertexColors roughness={0.42} clearcoat={0.55} clearcoatRoughness={0.4} />
      </mesh>
      <mesh geometry={geo.stem}>
        <meshStandardMaterial color="#5b3a1e" roughness={0.9} />
      </mesh>
      <mesh geometry={geo.leaf} position={[0.06, 0.92, 0.02]} rotation={[0.5, 0.3, -1.05]} scale={0.55}>
        <meshStandardMaterial color="#3f7a2a" roughness={0.6} side={DoubleSide} />
      </mesh>
    </group>
  )
}

/** A lumpy cluster of leaves: an icosphere pushed in and out by noise, coloured in several greens. */
function foliageGeometry(seed: number): BufferGeometry {
  // Welded, so the lumps shade smoothly instead of as facets.
  const ico = new IcosahedronGeometry(1, 4)
  ico.deleteAttribute('normal')
  ico.deleteAttribute('uv')
  const g = mergeVertices(ico)
  ico.dispose()
  const p = g.getAttribute('position')
  const colors = new Float32Array(p.count * 3)
  const dark = new Color('#1f4d1c')
  const light = new Color('#4f8f34')
  const c = new Color()
  const v = new Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    // Smooth lumps for the shape, fine speckle for the leaves' colour.
    const lump =
      0.5 + 0.25 * Math.sin(v.x * 5 + seed) * Math.sin(v.y * 6 + seed * 0.7) + 0.25 * Math.sin(v.z * 7 - seed)
    const speckle = hash(v.x * 50 + seed, v.y * 50, v.z * 50)
    v.multiplyScalar(0.84 + lump * 0.3)
    p.setXYZ(i, v.x, v.y, v.z)
    c.copy(dark).lerp(light, lump * 0.5 + speckle * 0.35 + Math.max(0, v.y) * 0.25)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

const CANOPY: [number, number, number, number][] = [
  [0, 0, 0, 0.2],
  [0.17, 0.04, 0.05, 0.16],
  [-0.16, 0.02, -0.04, 0.17],
  [0.05, 0.14, -0.06, 0.16],
  [0.3, -0.04, -0.02, 0.13],
  [-0.05, 0.05, 0.16, 0.14],
  [0.12, -0.06, -0.15, 0.13],
  [-0.24, -0.08, 0.1, 0.12],
  [0.38, 0.05, 0.08, 0.11],
]

/**
 * The tree: a tapering trunk, one branch reaching out to the apple's stem at
 * `tip` (relative to the trunk's foot), and a canopy above it.
 */
export function Tree({ height, tip }: { height: number; tip: [number, number] }) {
  const geo = useMemo(() => {
    const branch = new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(0, height * 0.82, 0),
        new Vector3(tip[0] * 0.45, tip[1] + 0.06, 0.02),
        new Vector3(tip[0] * 1.08, tip[1] - 0.005, 0),
      ]),
      32,
      0.016,
      8,
    )
    const foliage = CANOPY.map((_, i) => foliageGeometry(i * 13))
    return { branch, foliage }
  }, [height, tip])
  useEffect(
    () => () => {
      geo.branch.dispose()
      geo.foliage.forEach((g) => g.dispose())
    },
    [geo],
  )
  return (
    <group>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.035, 0.06, height, 14, 6]} />
        <meshStandardMaterial color="#4e3524" roughness={0.95} />
      </mesh>
      <mesh geometry={geo.branch}>
        <meshStandardMaterial color="#563a26" roughness={0.95} />
      </mesh>
      <group position={[tip[0] * 0.35, height + 0.1, 0]}>
        {CANOPY.map(([x, y, z, r], i) => (
          <mesh key={i} geometry={geo.foliage[i]} position={[x, y, z]} scale={r}>
            <meshStandardMaterial vertexColors roughness={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** A round patch of grass with a darker soil edge. */
export function Lawn({ radius }: { radius: number }) {
  const geo = useMemo(() => {
    // Many rings of vertices so the colour can vary across the patch.
    const g = new RingGeometry(0, radius, 96, 28)
    g.rotateX(-Math.PI / 2)
    const p = g.getAttribute('position')
    const colors = new Float32Array(p.count * 3)
    const grass = new Color('#3b6b2a')
    const bright = new Color('#5f8f3a')
    const soil = new Color('#3a2a1c')
    const c = new Color()
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = p.getZ(i)
      c.copy(grass).lerp(bright, hash(Math.round(x * 30), Math.round(z * 30)) * 0.6)
      if (Math.hypot(x, z) > radius * 0.98) c.lerp(soil, 0.7)
      colors.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new BufferAttribute(colors, 3))
    return g
  }, [radius])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  )
}
