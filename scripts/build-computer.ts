// Builds public/models/computer.glb: an original desktop PC (mid-tower, ATX
// motherboard, modular PSU, PCIe graphics card, DDR5 memory, tower CPU cooler).
// Modelled in code from standard form-factor sizes, in metres. Y is up, X is the
// case depth (rear panel at -x, front panel at +x), Z is the width (glass side
// panel at +z, so the viewer looks at the motherboard face; the cable chamber
// behind the motherboard tray is at -z).
//
// Every part is made of layers, one per realistic look (see realisticLooks.ts),
// so gold contacts, chips, labels and plastics each get their own material.
//
// Usage: npx tsx scripts/build-computer.ts
import { mkdir } from 'node:fs/promises'
import {
  CatmullRomCurve3,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix3,
  Matrix4,
  Path,
  Quaternion,
  RingGeometry,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { LookId } from '../src/scene/realisticLooks'
import { boundsOf, boxMesh, cylinderMesh, mergeMeshData, recomputeNormals, type MeshData, type Vec3 } from './lib/gltf'
import { partData, writePartsGlb, type OutputPart } from './lib/output'
import { placed } from './lib/three-mesh'

const FILE = 'public/models/computer.glb'

// ---- Case -------------------------------------------------------------------
const HALF_W = 0.105 // case width / 2 (z)
const HALF_D = 0.225 // case depth / 2 (x)
const TOP = 0.46 // case height (y)
const WALL = 0.002
const TRAY_Z = -0.078 // motherboard tray; cables run behind it
const TRAY_Y0 = 0.095 // the tray starts above the power supply

// ---- Motherboard (ATX 305 x 244 mm) ------------------------------------------
const BOARD_X0 = -0.218 // rear edge, by the I/O panel
const BOARD_X1 = 0.087
const BOARD_Y0 = 0.19
const BOARD_Y1 = 0.434
const BOARD_T = 0.0016
const BOARD_Z = -0.07
const BT = BOARD_Z + BOARD_T / 2 // components stand on this face (+z)

const SOCKET = { x: -0.048, y: 0.36 }
const DIMM_X = [0.0205, 0.032, 0.0435, 0.055] // A1, A2, B1, B2; A2 and B2 are populated
const DIMM_Y = 0.36
const PY = 0.282 // top PCIe x16 slot
const SLOT_PITCH = 0.02032
const MOUNT_HOLES: [number, number][] = [
  [BOARD_X0 + 0.0063, 0.2689],
  [BOARD_X0 + 0.0063, 0.1974],
  [-0.061, 0.4238],
  [-0.061, 0.2689],
  [-0.061, 0.1974],
  [0.07, 0.4238],
  [0.07, 0.2689],
  [0.07, 0.1974],
]

// ---- Layers ------------------------------------------------------------------

type Ls = [LookId, MeshData][]

function layered(ls: Ls): { look: string; data: MeshData }[] {
  const byLook = new Map<LookId, MeshData[]>()
  for (const [look, data] of ls) byLook.set(look, [...(byLook.get(look) ?? []), data])
  return [...byLook].map(([look, list]) => ({ look, data: mergeMeshData(list) }))
}

// ---- Geometry helpers --------------------------------------------------------

/** Applies a rotation (quaternion) then a translation to positions and normals. */
function xformQ(d: MeshData, position: Vec3, q: Quaternion): MeshData {
  const m = new Matrix4().compose(new Vector3(...position), q, new Vector3(1, 1, 1))
  return applyMatrix(d, m)
}

function applyMatrix(d: MeshData, m: Matrix4): MeshData {
  const n = new Matrix3().getNormalMatrix(m)
  const positions = new Float32Array(d.positions.length)
  const normals = new Float32Array(d.normals.length)
  const p = new Vector3()
  for (let i = 0; i < d.positions.length; i += 3) {
    p.fromArray(d.positions, i).applyMatrix4(m)
    positions.set([p.x, p.y, p.z], i)
    p.fromArray(d.normals, i).applyMatrix3(n).normalize()
    normals.set([p.x, p.y, p.z], i)
  }
  return { positions, normals, indices: d.indices }
}

const moveLs = (ls: Ls, position: Vec3, q = new Quaternion()): Ls => ls.map(([l, d]) => [l, xformQ(d, position, q)])

const box = (c: Vec3, s: Vec3) => boxMesh(c, s)

/** Box with rounded edges. */
function rbox(c: Vec3, s: Vec3, r: number, segments = 2): MeshData {
  const radius = Math.min(r, Math.min(...s) / 2 - 1e-5)
  return placed(new RoundedBoxGeometry(s[0], s[1], s[2], segments, radius), { position: c })
}

const cyl = (c: Vec3, r: number, len: number, axis: 0 | 1 | 2, seg = 16) => cylinderMesh(c, r, len, axis, seg)

/** Box whose local axes are the columns (a, b, c), centred at `c`. */
function orientedBox(c: Vector3, a: Vector3, b: Vector3, n: Vector3, size: Vec3): MeshData {
  const m = new Matrix4().makeBasis(a, b, n).setPosition(c)
  return applyMatrix(boxMesh([0, 0, 0], size), m)
}

/** A flat quad facing +/- along an axis (cheap pads and labels). */
function quad(c: Vec3, size: [number, number], axis: 0 | 1 | 2, sign: 1 | -1 = 1): MeshData {
  const s: Vec3 = [0, 0, 0]
  const others = [0, 1, 2].filter((k) => k !== axis)
  s[others[0]] = size[0]
  s[others[1]] = size[1]
  const b = boxMesh(c, [s[0] || 1e-6, s[1] || 1e-6, s[2] || 1e-6])
  // Keep only the face pointing along +/- axis (faces are 4 vertices each, see boxMesh order).
  const faceIndex = axis * 2 + (sign > 0 ? 0 : 1)
  const o = faceIndex * 4
  return {
    positions: b.positions.slice(o * 3, o * 3 + 12),
    normals: b.normals.slice(o * 3, o * 3 + 12),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  }
}

// 2D shapes, extruded into plates.
function rectPath<T extends Path>(p: T, x0: number, y0: number, x1: number, y1: number, r = 0): T {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)
  if (r <= 0) {
    p.moveTo(x0, y0)
    p.lineTo(x1, y0)
    p.lineTo(x1, y1)
    p.lineTo(x0, y1)
    p.closePath()
    return p
  }
  p.moveTo(x0 + r, y0)
  p.lineTo(x1 - r, y0)
  p.quadraticCurveTo(x1, y0, x1, y0 + r)
  p.lineTo(x1, y1 - r)
  p.quadraticCurveTo(x1, y1, x1 - r, y1)
  p.lineTo(x0 + r, y1)
  p.quadraticCurveTo(x0, y1, x0, y1 - r)
  p.lineTo(x0, y0 + r)
  p.quadraticCurveTo(x0, y0, x0 + r, y0)
  return p
}
const rectShape = (x0: number, y0: number, x1: number, y1: number, r = 0) => rectPath(new Shape(), x0, y0, x1, y1, r)
const rectHole = (x0: number, y0: number, x1: number, y1: number, r = 0) => rectPath(new Path(), x0, y0, x1, y1, r)
function circleHole(cx: number, cy: number, r: number): Path {
  const p = new Path()
  p.absarc(cx, cy, r, 0, Math.PI * 2, true)
  return p
}
function polyHole(cx: number, cy: number, r: number, sides: number, rot = 0): Path {
  const p = new Path()
  for (let i = 0; i <= sides; i++) {
    const a = rot - (i / sides) * Math.PI * 2
    if (i === 0) p.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    else p.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  return p
}

/**
 * Extrudes a 2D shape into a plate. Shape (u, v) and thickness w map to the
 * world as: 'xy' (u, v, w) / 'xz' (u, w, -v) / 'yz' (w, v, -u). `at` is the
 * plate's centre along its normal.
 */
function plate(shape: Shape, depth: number, plane: 'xy' | 'xz' | 'yz', at: number, curveSegments = 10): MeshData {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments })
  g.translate(0, 0, -depth / 2)
  const d = placed(g)
  g.dispose()
  const map: Record<typeof plane, Matrix4> = {
    xy: new Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, at, 0, 0, 0, 1),
    xz: new Matrix4().set(1, 0, 0, 0, 0, 0, 1, at, 0, -1, 0, 0, 0, 0, 0, 1),
    yz: new Matrix4().set(0, 0, 1, at, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1),
  }
  return applyMatrix(d, map[plane])
}

/** Deterministic random numbers, so every build gives the same model. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

// ---- Fans --------------------------------------------------------------------

/** Curved, twisted fan blades around the local y axis. */
function blades(hub: number, tip: number, depth: number, count: number, sweep = 0.55): MeshData {
  const nu = 8
  const nv = 6
  const parts: MeshData[] = []
  for (let k = 0; k < count; k++) {
    const base = (k / count) * Math.PI * 2
    const positions: number[] = []
    const indices: number[] = []
    for (let i = 0; i <= nu; i++) {
      const s = i / nu
      const r = hub + (tip - hub) * s
      const chord = ((Math.PI * 2) / count) * 0.78 * (0.7 + 0.3 * s)
      const pitch = depth * 0.75 * (1 - 0.35 * s)
      for (let j = 0; j <= nv; j++) {
        const v = j / nv
        const a = base + sweep * Math.pow(s, 1.4) + (v - 0.5) * chord
        positions.push(r * Math.cos(a), (v - 0.5) * pitch, r * Math.sin(a))
      }
    }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j
        const b = a + nv + 1
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    parts.push(
      recomputeNormals({
        positions: new Float32Array(positions),
        normals: new Float32Array(positions.length),
        indices: new Uint32Array(indices),
      }),
    )
  }
  return mergeMeshData(parts)
}

interface FanOptions {
  /** Square frame size; 0 for a frameless fan (graphics card). */
  size: number
  radius: number
  depth: number
  count: number
  frameLook?: LookId
  bladeLook?: LookId
  /** Rubber anti-vibration pads on the frame corners. */
  pads?: boolean
}

/** A fan around the local y axis; the hub sticker faces +y (intake side). */
function fanLocal(o: FanOptions): Ls {
  const ls: Ls = []
  const frameLook = o.frameLook ?? 'plasticBlack'
  const t = o.depth
  if (o.size > 0) {
    const h = o.size / 2
    const screw = h - 0.0075
    const flange = () => {
      const s = rectShape(-h, -h, h, h, 0.006)
      s.holes.push(circleHole(0, 0, o.radius + 0.0015))
      for (const [x, y] of [
        [screw, screw],
        [-screw, screw],
        [screw, -screw],
        [-screw, -screw],
      ])
        s.holes.push(circleHole(x, y, 0.0022))
      return s
    }
    // Front and back flanges, a round shroud between them, and corner posts.
    for (const y of [t / 2 - 0.0015, -t / 2 + 0.0015]) ls.push([frameLook, plate(flange(), 0.003, 'xz', y, 16)])
    ls.push([
      frameLook,
      placed(
        new LatheGeometry(
          [
            new Vector2(o.radius + 0.0015, -t / 2 + 0.003),
            new Vector2(o.radius + 0.003, -t / 2 + 0.003),
            new Vector2(o.radius + 0.003, t / 2 - 0.003),
            new Vector2(o.radius + 0.0015, t / 2 - 0.003),
            new Vector2(o.radius + 0.0015, -t / 2 + 0.003),
          ],
          64,
        ),
      ),
    ])
    for (const [x, z] of [
      [screw, screw],
      [-screw, screw],
      [screw, -screw],
      [-screw, -screw],
    ]) {
      ls.push([frameLook, cyl([x, 0, z], 0.0042, t - 0.006, 1, 12)])
      if (o.pads) for (const y of [t / 2, -t / 2]) ls.push(['rubber', rbox([x, y, z], [0.011, 0.0012, 0.011], 0.002)])
    }
    // Motor struts on the exhaust side.
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2
      const len = o.radius - 0.018
      ls.push([
        frameLook,
        xformQ(
          box([0, 0, 0], [len, 0.003, 0.0035]),
          [Math.cos(a) * (0.018 + len / 2), -t / 2 + 0.0015, Math.sin(a) * (0.018 + len / 2)],
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -a),
        ),
      ])
    }
  }
  const hub = Math.max(0.016, o.radius * 0.34)
  ls.push([o.bladeLook ?? 'plasticBlack', blades(hub - 0.0005, o.radius - 0.0012, t * 0.85, o.count)])
  ls.push([o.bladeLook ?? 'plasticBlack', cyl([0, 0.0005, 0], hub, t * 0.8, 1, 32)])
  ls.push(['label', cyl([0, t * 0.4 + 0.0006, 0], hub * 0.78, 0.0003, 1, 32)])
  return ls
}

/** Places a local-y fan so its intake faces `facing`. */
function fan(c: Vec3, facing: Vec3, o: FanOptions): Ls {
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...facing).normalize())
  return moveLs(fanLocal(o), c, q)
}

const caseFanOptions: FanOptions = { size: 0.12, radius: 0.0565, depth: 0.025, count: 9, pads: true }

// ---- Cables --------------------------------------------------------------------

interface Frame {
  p: Vector3
  t: Vector3
  side: Vector3
  layer: Vector3
}

/**
 * A flat bundle of `cols` x `rows` wires along a smooth path. The wire layout is
 * carried along the path by parallel transport, so the bundle does not twist.
 * `side` is the direction of the columns at the first point.
 */
function wireBundle(
  points: Vec3[],
  side: Vec3,
  cols: number,
  rows: number,
  pitch: number,
  radius: number,
): { mesh: MeshData; start: Frame; end: Frame } {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(...p)),
    false,
    'centripetal',
  )
  const N = 110
  const pts = curve.getSpacedPoints(N)
  const tangents = pts.map((_, i) => curve.getTangentAt(i / N))
  const sides: Vector3[] = []
  let s = new Vector3(...side)
  s.addScaledVector(tangents[0], -s.dot(tangents[0])).normalize()
  const q = new Quaternion()
  for (let i = 0; i <= N; i++) {
    if (i > 0) {
      q.setFromUnitVectors(tangents[i - 1], tangents[i])
      s = s.clone().applyQuaternion(q)
      s.addScaledVector(tangents[i], -s.dot(tangents[i])).normalize()
    }
    sides.push(s)
  }
  const layers = sides.map((sd, i) => new Vector3().crossVectors(tangents[i], sd))
  const wires: MeshData[] = []
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const a = (c - (cols - 1) / 2) * pitch
      const b = (r - (rows - 1) / 2) * pitch
      const path = pts.map((p, i) => p.clone().addScaledVector(sides[i], a).addScaledVector(layers[i], b))
      wires.push(placed(new TubeGeometry(new CatmullRomCurve3(path), N, radius, 6, false)))
    }
  const frame = (i: number): Frame => ({ p: pts[i], t: tangents[i], side: sides[i], layer: layers[i] })
  return { mesh: mergeMeshData(wires), start: frame(0), end: frame(N) }
}

/** A plug body at a bundle end, extending `len` beyond the end along the path. */
function plugAt(f: Frame, outward: 1 | -1, len: number, width: number, height: number): MeshData {
  const c = f.p.clone().addScaledVector(f.t, (outward * len) / 2)
  return orientedBox(c, f.t, f.side, f.layer, [len, width, height])
}

/** A cable comb clipped across the bundle at a fraction of its length. */
function combAt(points: Vec3[], side: Vec3, at: number, width: number, height: number): MeshData {
  const { start } = wireBundle(points.slice(Math.floor(at * (points.length - 1))), side, 1, 1, 0, 0.001)
  return orientedBox(start.p, start.t, start.side, start.layer, [0.004, width, height])
}

// ---- Parts -----------------------------------------------------------------------

function caseFrame(): Ls {
  const ls: Ls = []
  const steel = 'chassisSteel' as const

  // Floor and the opaque right side panel (behind the tray).
  ls.push([steel, box([0, WALL / 2, 0], [HALF_D * 2, WALL, HALF_W * 2])])
  ls.push([steel, box([0, TOP / 2, -HALF_W + 0.0005], [HALF_D * 2, TOP, 0.001])])

  // Roof with exhaust slots over the CPU area.
  const roof = rectShape(-HALF_D, -HALF_W, HALF_D, HALF_W)
  for (let i = 0; i < 24; i++) {
    const x = -0.17 + i * 0.0115
    roof.holes.push(rectHole(x, -0.07, x + 0.005, 0.07, 0.0025))
  }
  ls.push([steel, plate(roof, WALL, 'xz', TOP - WALL / 2)])

  // Rear panel: I/O window, hex fan grille, seven expansion slots, PSU opening.
  const rear = rectShape(-HALF_W, WALL, HALF_W, TOP - WALL)
  const yz = (z0: number, z1: number, y0: number, y1: number, r = 0) => rectHole(-z1, y0, -z0, y1, r)
  rear.holes.push(yz(BT - 0.004, BT + 0.0405, 0.292, 0.44))
  const fanC = { z: 0.038, y: 0.36 }
  for (let i = -6; i <= 6; i++)
    for (let j = -6; j <= 6; j++) {
      const z = fanC.z + i * 0.0092 + (j % 2 ? 0.0046 : 0)
      const y = fanC.y + j * 0.008
      if (Math.hypot(z - fanC.z, y - fanC.y) < 0.052) rear.holes.push(polyHole(-z, y, 0.0039, 6, Math.PI / 6))
    }
  for (let i = 0; i < 7; i++) {
    const y = PY - i * SLOT_PITCH
    rear.holes.push(yz(BT + 0.006, BT + 0.104, y - 0.0065, y + 0.0065))
  }
  rear.holes.push(yz(-0.068, 0.068, 0.006, 0.086, 0.004))
  ls.push([steel, plate(rear, WALL, 'yz', -HALF_D + WALL / 2)])

  // Vented covers on the unused expansion slots (the graphics card uses the top three).
  for (let i = 3; i < 7; i++) {
    const y = PY - i * SLOT_PITCH
    const cover = rectShape(-(BT + 0.11), y - 0.009, -(BT + 0.001), y + 0.009)
    for (let k = 0; k < 4; k++) {
      const z = BT + 0.025 + k * 0.018
      cover.holes.push(rectHole(-(z + 0.012), y - 0.0025, -z, y + 0.0025, 0.0012))
    }
    ls.push([steel, plate(cover, 0.0008, 'yz', -HALF_D + WALL + 0.0006)])
    ls.push(['nickel', cyl([-HALF_D - 0.0015, y, BT + 0.114], 0.0028, 0.003, 0, 12)])
  }

  // Motherboard tray with cable cut-outs, then rubber grommets in two of them.
  const tray = rectShape(-HALF_D + WALL, TRAY_Y0, HALF_D - 0.004, TOP - WALL)
  const cutRight = [0.097, 0.25, 0.125, 0.42] as const
  const cutTop = [-0.165, 0.438, -0.11, 0.454] as const
  tray.holes.push(rectHole(...cutRight, 0.006))
  tray.holes.push(rectHole(...cutTop, 0.004))
  tray.holes.push(rectHole(-0.092, 0.315, -0.004, 0.405, 0.006)) // CPU backplate window
  ls.push([steel, plate(tray, 0.0015, 'xy', TRAY_Z)])
  for (const [x0, y0, x1, y1] of [cutRight, cutTop]) {
    const g = rectShape(x0, y0, x1, y1, 0.006)
    g.holes.push(rectHole(x0 + 0.003, y0 + 0.003, x1 - 0.003, y1 - 0.003, 0.004))
    ls.push(['rubber', plate(g, 0.004, 'xy', TRAY_Z)])
  }

  // Brass-coloured standoffs under the board's mounting holes.
  for (const [x, y] of MOUNT_HOLES)
    ls.push(['gold', cyl([x, y, (TRAY_Z + BOARD_Z - BOARD_T / 2) / 2], 0.0028, BOARD_Z - BOARD_T / 2 - TRAY_Z, 2, 6)])

  // Front panel: a frame around a fine steel mesh, with the intake fan behind it.
  const front = rectShape(-HALF_W, 0, HALF_W, TOP)
  front.holes.push(rectHole(-0.092, 0.028, 0.092, 0.432, 0.01))
  ls.push(['plasticBlack', plate(front, 0.006, 'yz', HALF_D - 0.003)])
  for (let i = 0; i <= 26; i++) {
    const z = -0.092 + (i / 26) * 0.184
    ls.push(['darkMetal', box([HALF_D - 0.0045, 0.23, z], [0.0008, 0.404, 0.0012])])
  }
  for (let i = 0; i <= 58; i++) {
    const y = 0.028 + (i / 58) * 0.404
    ls.push(['darkMetal', box([HALF_D - 0.0038, y, 0], [0.0008, 0.0012, 0.184])])
  }

  // Front I/O on the roof: power button with a light ring, USB-A, USB-C, audio.
  const fy = TOP + 0.0002
  ls.push(['nickel', cyl([0.2, fy + 0.0012, 0.065], 0.0062, 0.0024, 1, 32)])
  ls.push(['ledWhite', placed(new RingGeometry(0.0064, 0.0074, 32), { position: [0.2, fy + 0.0001, 0.065], rotation: [-Math.PI / 2, 0, 0] })])
  for (const z of [0.038, 0.02]) {
    ls.push(['nickel', quad([0.2, fy, z], [0.0062, 0.0136], 1)])
    ls.push(['chip', quad([0.2, fy + 0.00005, z], [0.005, 0.0124], 1)])
    ls.push(['plasticBlue', quad([0.2 - 0.0012, fy + 0.0001, z], [0.0016, 0.011], 1)])
  }
  ls.push(['chip', rbox([0.2, fy - 0.0004, 0.004], [0.0034, 0.0012, 0.0092], 0.0016)])
  ls.push(['chip', cyl([0.2, fy - 0.0004, -0.012], 0.0018, 0.0012, 1, 16)])
  ls.push(['jackGreen', placed(new RingGeometry(0.0018, 0.0028, 20), { position: [0.2, fy + 0.0001, -0.012], rotation: [-Math.PI / 2, 0, 0] })])

  // Drive cage at the bottom front: side walls, a top shelf for the 2.5" SSD,
  // and rubber grommets where the hard disk is screwed in.
  for (const z of [-0.0535, 0.0535]) {
    const wall = rectShape(0.022, WALL, 0.178, 0.042)
    for (const x of [0.05, 0.1, 0.15]) wall.holes.push(rectHole(x - 0.012, 0.012, x + 0.012, 0.03, 0.006))
    ls.push([steel, plate(wall, 0.0012, 'xy', z)])
  }
  ls.push([steel, box([0.1, 0.041, 0], [0.156, 0.0012, 0.108])])
  for (const x of [0.0545, 0.1555]) for (const z of [-0.053, 0.053]) ls.push(['rubber', cyl([x, 0.0128, z], 0.0035, 0.003, 2, 14)])

  // Rubber feet and the side panel thumbscrews on the rear.
  for (const x of [-0.19, 0.19]) for (const z of [-0.085, 0.085]) ls.push(['rubber', rbox([x, -0.003, z], [0.05, 0.007, 0.024], 0.003)])
  for (const y of [0.03, 0.43]) for (const z of [-HALF_W + 0.006, HALF_W - 0.006]) ls.push(['nickel', cyl([-HALF_D - 0.0025, y, z], 0.004, 0.005, 0, 16)])
  return ls
}

function sidePanel(): Ls {
  const z = HALF_W - 0.0012
  const w = HALF_D * 2 - 0.012
  const h = TOP - 0.012
  const frit = rectShape(-w / 2, 0.006, w / 2, TOP - 0.006, 0.004)
  frit.holes.push(rectHole(-w / 2 + 0.012, 0.018, w / 2 - 0.012, TOP - 0.018, 0.002))
  const ls: Ls = [
    ['glass', rbox([0, TOP / 2, z], [w, h, 0.004], 0.0015)],
    ['plasticBlack', plate(frit, 0.0003, 'xy', z - 0.0022)],
  ]
  for (const x of [-w / 2 + 0.008, w / 2 - 0.008])
    for (const y of [0.014, TOP - 0.014]) ls.push(['nickel', cyl([x, y, z + 0.0035], 0.005, 0.003, 2, 24)])
  return ls
}

// Power supply: ATX 150 x 86 x 140 mm, fan facing up, modular sockets on the front.
const PSU = { x0: -0.2225, x1: -0.0725, y0: 0.003, y1: 0.089, z0: -0.07, z1: 0.07 }
const PSU_SOCKETS = {
  atx: { y: 0.06, z: -0.03 },
  eps: { y: 0.078, z: -0.055 },
  pcie: { y: 0.03, z: -0.02 },
  sata1: { y: 0.025, z: 0.035 },
  sata2: { y: 0.052, z: 0.035 },
}

function psu(): Ls {
  const ls: Ls = []
  const { x0, x1, y0, y1, z0, z1 } = PSU
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const t = 0.0012
  // Shell: bottom, sides, and a top plate with the fan opening.
  ls.push(['darkMetal', box([cx, y0 + t / 2, 0], [x1 - x0, t, z1 - z0])])
  for (const z of [z0 + t / 2, z1 - t / 2]) ls.push(['darkMetal', box([cx, cy, z], [x1 - x0, y1 - y0, t])])
  const top = rectShape(x0, -z1, x1, -z0)
  top.holes.push(circleHole(cx, 0, 0.061))
  ls.push(['darkMetal', plate(top, t, 'xz', y1 - t / 2, 24)])
  // Wire grille over the fan.
  for (const r of [0.016, 0.03, 0.044, 0.058])
    ls.push(['darkMetal', placed(new TorusGeometry(r, 0.0007, 6, 64), { position: [cx, y1 + 0.0012, 0], rotation: [Math.PI / 2, 0, 0] })])
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4
    ls.push([
      'darkMetal',
      xformQ(cyl([0, 0, 0], 0.0007, 0.12, 0, 6), [cx, y1 + 0.0012, 0], new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a)),
    ])
  }
  ls.push(...fan([cx, y1 - 0.016, 0], [0, 1, 0], { size: 0.12, radius: 0.057, depth: 0.025, count: 7, pads: false }))
  ls.push(['chip', box([cx, y0 + 0.02, 0], [x1 - x0 - 0.01, 0.002, z1 - z0 - 0.01])]) // dark interior

  // Rear: honeycomb vent, IEC C14 inlet and the rocker switch.
  const rear = rectShape(-z1, y0, -z0, y1)
  for (let i = -5; i <= 1; i++)
    for (let j = -3; j <= 3; j++) {
      const z = 0.012 + i * 0.0095 + (j % 2 ? 0.00475 : 0)
      const y = cy + j * 0.0082
      rear.holes.push(polyHole(-z, y, 0.0042, 6, Math.PI / 6))
    }
  rear.holes.push(rectHole(-0.062, 0.058, -0.035, 0.08, 0.002))
  rear.holes.push(rectHole(-0.062, 0.016, -0.046, 0.036, 0.001))
  ls.push(['darkMetal', plate(rear, t, 'yz', x0 + t / 2, 6)])
  ls.push(['plasticBlack', box([x0 + 0.004, 0.069, 0.0485], [0.006, 0.02, 0.025])])
  for (const [y, z] of [
    [0.073, 0.0485],
    [0.065, 0.042],
    [0.065, 0.055],
  ])
    ls.push(['nickel', box([x0 + 0.0, y, z], [0.004, 0.0035, 0.0012])])
  ls.push(['plasticBlack', rbox([x0 - 0.001, 0.026, 0.054], [0.004, 0.018, 0.014], 0.0015)])
  for (const [y, z] of [
    [y0 + 0.006, z0 + 0.006],
    [y0 + 0.006, z1 - 0.006],
    [y1 - 0.006, z0 + 0.006],
    [y1 - 0.006, z1 - 0.006],
  ])
    ls.push(['nickel', cyl([x0 - 0.0008, y, z], 0.0028, 0.0016, 0, 12)])

  // Front: the modular panel with keyed sockets for each cable.
  ls.push(['labelDark', box([x1 - t / 2, cy, 0], [t, y1 - y0, z1 - z0])])
  const sockets: [keyof typeof PSU_SOCKETS, number, number][] = [
    ['atx', 0.0094, 0.0516],
    ['eps', 0.0094, 0.0178],
    ['pcie', 0.0094, 0.0178],
    ['sata1', 0.0068, 0.0236],
    ['sata2', 0.0068, 0.0236],
  ]
  for (const [id, h, w] of sockets) {
    const s = PSU_SOCKETS[id]
    ls.push(['plasticBlack', box([x1 + 0.0015, s.y, s.z], [0.003, h + 0.002, w + 0.002])])
  }
  // Label on the glass side.
  ls.push(['label', quad([cx, cy, z1 + 0.0002], [0.09, 0.05], 2)])
  ls.push(['labelDark', quad([cx, cy + 0.017, z1 + 0.0003], [0.09, 0.012], 2)])
  return ls
}

/** Cable paths, shared by the cable part and the plug positions. */
const CABLES = {
  atx: {
    // 24-pin: right-angle plug on the board edge, back through the right grommet,
    // down behind the tray, forward under it and into the PSU.
    points: [
      [0.104, 0.365, BT + 0.005],
      [0.111, 0.365, BT + 0.004],
      [0.1135, 0.365, -0.07],
      [0.113, 0.365, -0.084],
      [0.105, 0.365, -0.091],
      [0.07, 0.36, -0.0915],
      [0.04, 0.33, -0.0915],
      [0.034, 0.25, -0.0915],
      [0.034, 0.11, -0.0915],
      [0.034, 0.074, -0.082],
      [0.03, 0.064, -0.055],
      [0.005, 0.061, -0.035],
      [-0.035, 0.06, -0.03],
      [PSU.x1 + 0.016, PSU_SOCKETS.atx.y, PSU_SOCKETS.atx.z],
    ] as Vec3[],
    side: [0, 1, 0] as Vec3,
    cols: 12,
    rows: 2,
  },
  eps: {
    // 8-pin CPU power: down onto the top-left corner of the board through the top grommet.
    points: [
      [-0.138, 0.425, BT + 0.026],
      [-0.138, 0.427, BT + 0.034],
      [-0.138, 0.44, BT + 0.038],
      [-0.138, 0.446, BT + 0.02],
      [-0.138, 0.446, -0.08],
      [-0.138, 0.44, -0.0905],
      [-0.13, 0.4, -0.0915],
      [-0.1, 0.25, -0.0915],
      [-0.05, 0.13, -0.0915],
      [-0.042, 0.095, -0.087],
      [-0.04, 0.082, -0.07],
      [-0.048, PSU_SOCKETS.eps.y, -0.058],
      [PSU.x1 + 0.016, PSU_SOCKETS.eps.y, PSU_SOCKETS.eps.z],
    ] as Vec3[],
    side: [1, 0, 0] as Vec3,
    cols: 4,
    rows: 2,
  },
  pcie: {
    // 8-pin graphics power: up off the card's top edge, then down to the PSU.
    points: [
      [-0.02, PY - 0.006, BT + 0.141],
      [-0.02, PY - 0.008, BT + 0.15],
      [-0.02, PY - 0.025, BT + 0.156],
      [-0.022, 0.2, 0.084],
      [-0.026, 0.13, 0.07],
      [-0.03, 0.07, 0.035],
      [-0.035, 0.04, 0.0],
      [-0.045, PSU_SOCKETS.pcie.y, -0.016],
      [PSU.x1 + 0.016, PSU_SOCKETS.pcie.y, PSU_SOCKETS.pcie.z],
    ] as Vec3[],
    side: [1, 0, 0] as Vec3,
    cols: 4,
    rows: 2,
  },
  sataHdd: {
    points: [
      [0.0265 - 0.017, 0.0105, 0.017],
      [0.0, 0.012, 0.02],
      [-0.03, 0.02, 0.032],
      [PSU.x1 + 0.016, PSU_SOCKETS.sata1.y, PSU_SOCKETS.sata1.z],
    ] as Vec3[],
    side: [0, 0, 1] as Vec3,
    cols: 5,
    rows: 1,
  },
  sataSsd: {
    points: [
      [0.05 - 0.016, 0.0445, 0.012],
      [0.025, 0.05, 0.018],
      [-0.01, 0.054, 0.03],
      [-0.035, 0.053, 0.035],
      [PSU.x1 + 0.016, PSU_SOCKETS.sata2.y, PSU_SOCKETS.sata2.z],
    ] as Vec3[],
    side: [0, 0, 1] as Vec3,
    cols: 5,
    rows: 1,
  },
}

function psuCables(): Ls {
  const ls: Ls = []
  const pitch = 0.0042
  const plugs: Record<keyof typeof CABLES, { board: number; psu: number; sata?: boolean }> = {
    atx: { board: 0.016, psu: 0.016 },
    eps: { board: 0.014, psu: 0.016 },
    pcie: { board: 0.014, psu: 0.016 },
    sataHdd: { board: 0.012, psu: 0.016, sata: true },
    sataSsd: { board: 0.011, psu: 0.016, sata: true },
  }
  for (const key of Object.keys(CABLES) as (keyof typeof CABLES)[]) {
    const c = CABLES[key]
    const p = plugs[key]
    const wirePitch = p.sata ? 0.0024 : pitch
    const r = p.sata ? 0.0009 : 0.0017
    const { mesh, start, end } = wireBundle(c.points, c.side, c.cols, c.rows, wirePitch, r)
    ls.push(['sleeve', mesh])
    const w = c.cols * wirePitch + 0.003
    const h = c.rows * wirePitch + (p.sata ? 0.003 : 0.002)
    ls.push(['plasticBlack', plugAt(start, -1, p.board, w, h)])
    ls.push(['plasticBlack', plugAt(end, 1, p.psu, w, h)])
    // Release latch on the board-end plug of the big connectors.
    if (!p.sata) {
      const latch = start.p
        .clone()
        .addScaledVector(start.t, -p.board / 2)
        .addScaledVector(start.layer, h / 2 + 0.0008)
      ls.push(['plasticBlack', orientedBox(latch, start.t, start.side, start.layer, [0.006, 0.004, 0.0016])])
    }
  }
  // Cable combs keep the visible runs neat.
  ls.push(['plasticBlack', combAt(CABLES.pcie.points, CABLES.pcie.side, 0.35, 4 * pitch + 0.004, 2 * pitch + 0.003)])
  return ls
}

function motherboard(): Ls {
  const ls: Ls = []
  const pcb = rectShape(BOARD_X0, BOARD_Y0, BOARD_X1, BOARD_Y1, 0.001)
  for (const [x, y] of MOUNT_HOLES) pcb.holes.push(circleHole(x, y, 0.002))
  ls.push(['pcbDark', plate(pcb, BOARD_T, 'xy', BOARD_Z, 16)])
  for (const [x, y] of MOUNT_HOLES) {
    ls.push(['nickel', placed(new RingGeometry(0.002, 0.0038, 20), { position: [x, y, BT + 0.00005] })])
    ls.push(['nickel', cyl([x, y, BT + 0.0012], 0.0032, 0.0024, 2, 6)]) // screw head
  }

  // PCIe slots: armoured x16, a second x16 (x4 electrical) and an x1.
  const pcieSlot = (y: number, x0: number, len: number, armour: boolean) => {
    const xc = x0 + len / 2
    ls.push([armour ? 'nickel' : 'plasticBlack', box([xc, y, BT + 0.0055], [len, 0.0078, 0.011])])
    ls.push(['chip', box([xc, y, BT + 0.011], [len - 0.003, 0.0018, 0.0003])])
    ls.push(['plasticGrey', box([x0 + len + 0.004, y, BT + 0.006], [0.008, 0.0078, 0.012])])
  }
  pcieSlot(PY, -0.18, 0.089, true)
  pcieSlot(PY - 2 * SLOT_PITCH, -0.18, 0.089, false)
  pcieSlot(PY - 4 * SLOT_PITCH + 0.0001, -0.18, 0.025, false)

  // DIMM slots with latches at both ends.
  for (const x of DIMM_X) {
    ls.push(['plasticBlack', box([x, DIMM_Y, BT + 0.0038], [0.0062, 0.1365, 0.0075])])
    ls.push(['chip', box([x, DIMM_Y, BT + 0.0076], [0.0016, 0.133, 0.0003])])
    for (const s of [-1, 1]) ls.push(['plasticGrey', box([x, DIMM_Y + s * 0.0708, BT + 0.006], [0.0064, 0.005, 0.012])])
  }

  // VRM: chokes and polymer capacitors along the left and top of the socket.
  for (let i = 0; i < 6; i++) {
    const y = 0.3335 + i * 0.0118
    ls.push(['darkMetal', rbox([-0.081, y, BT + 0.0035], [0.0085, 0.0085, 0.007], 0.0008)])
    ls.push(['aluminium', cyl([-0.0905, y, BT + 0.0045], 0.0025, 0.009, 2, 16)])
  }
  for (let i = 0; i < 5; i++) {
    const x = -0.066 + i * 0.0118
    ls.push(['darkMetal', rbox([x, 0.39, BT + 0.0035], [0.0085, 0.0085, 0.007], 0.0008)])
    ls.push(['aluminium', cyl([x, 0.3985, BT + 0.0045], 0.0025, 0.009, 2, 16)])
  }

  // Power connectors and headers. Pins are gold.
  ls.push(['plasticBlack', box([-0.138, 0.425, BT + 0.006], [0.0188, 0.0104, 0.012])]) // 8-pin EPS
  ls.push(['plasticBlack', box([0.082, 0.365, BT + 0.0048], [0.01, 0.0516, 0.0096])]) // 24-pin, right angle
  ls.push(['plasticBlack', box([0.081, 0.31, BT + 0.0045], [0.011, 0.02, 0.009])]) // USB 3 front header
  for (let i = 0; i < 4; i++) ls.push(['plasticBlack', box([0.081, 0.2155 + i * 0.0105, BT + 0.0035], [0.012, 0.0085, 0.007])]) // SATA
  for (let i = 0; i < 4; i++) ls.push(['chip', box([0.0871, 0.2155 + i * 0.0105, BT + 0.0035], [0.0003, 0.0068, 0.0028])])
  const header = (x: number, y: number, cols: number, rows: number, shroud: boolean) => {
    const p = 0.00254
    if (shroud) ls.push(['plasticBlack', box([x, y, BT + 0.004], [cols * p + 0.002, rows * p + 0.002, 0.008])])
    else ls.push(['plasticBlack', box([x, y, BT + 0.00125], [cols * p, rows * p, 0.0025])])
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++)
        ls.push(['gold', box([x + (i - (cols - 1) / 2) * p, y + (j - (rows - 1) / 2) * p, BT + 0.004], [0.0006, 0.0006, 0.006])])
  }
  header(0.03, 0.1945, 5, 2, false) // front panel
  header(-0.02, 0.1945, 5, 2, false) // USB 2
  header(-0.1, 0.1945, 5, 2, false) // front audio
  header(0.006, 0.425, 4, 1, true) // CPU fan
  header(0.078, 0.418, 4, 1, true) // system fan
  header(-0.045, 0.1945, 4, 1, true) // system fan 2

  // M.2 socket and its standoff.
  ls.push(['plasticBlack', box([-0.174, 0.311, BT + 0.002], [0.006, 0.022, 0.004])])
  ls.push(['gold', cyl([-0.0945, 0.311, BT + 0.0016], 0.0022, 0.0032, 2, 6)])

  // CMOS battery, BIOS flash, super I/O, LAN, audio codec under its shield, clock chips.
  ls.push(['plasticBlack', cyl([-0.04, 0.214, BT + 0.001], 0.0118, 0.002, 2, 32)])
  ls.push(['nickel', cyl([-0.04, 0.214, BT + 0.0035], 0.01, 0.0032, 2, 32)])
  ls.push(['chip', box([-0.006, 0.212, BT + 0.0008], [0.005, 0.005, 0.0016])])
  ls.push(['chip', box([-0.075, 0.225, BT + 0.0008], [0.012, 0.012, 0.0016])])
  ls.push(['chip', box([-0.165, 0.27, BT + 0.0006], [0.008, 0.008, 0.0012])])
  ls.push(['labelDark', rbox([-0.195, 0.262, BT + 0.0015], [0.02, 0.016, 0.003], 0.001)])
  ls.push(['aluminium', box([-0.195, 0.262, BT + 0.0031], [0.012, 0.003, 0.0002])])
  for (let i = 0; i < 4; i++) ls.push(['gold', cyl([-0.21 + i * 0.0065, 0.215, BT + 0.004], 0.0025, 0.008, 2, 14)])

  // Rear I/O cover over the port stacks.
  ls.push(['plasticBlack', rbox([-0.2005, 0.364, BT + 0.018], [0.031, 0.136, 0.036], 0.004, 3)])
  ls.push(['aluminium', box([-0.1855, 0.364, BT + 0.024], [0.0012, 0.11, 0.003])])

  // Rear ports: faces at x = PORT_X, stacked away from the board (z).
  const PORT_X = -0.2235
  const shell = (y: number, z: number, h: number, w: number, depth = 0.016) =>
    ls.push(['nickel', box([PORT_X + depth / 2, y, z], [depth, h, w])])
  const opening = (y: number, z: number, h: number, w: number) => ls.push(['chip', quad([PORT_X - 0.00005, y, z], [h, w], 0, -1)])
  const usbA = (y: number, z: number, look: LookId) => {
    shell(y, z, 0.0145, 0.0068)
    opening(y, z, 0.0128, 0.0052)
    ls.push([look, box([PORT_X + 0.004, y, z - 0.0012], [0.008, 0.011, 0.0018])])
  }
  // Two USB 2.0, two USB 3, video, LAN over USB, USB-C over USB-A, audio.
  usbA(0.421, BT + 0.006, 'plasticBlack')
  usbA(0.421, BT + 0.014, 'plasticBlack')
  usbA(0.4, BT + 0.006, 'plasticBlue')
  usbA(0.4, BT + 0.014, 'plasticBlue')
  shell(0.378, BT + 0.007, 0.017, 0.0055) // DisplayPort
  opening(0.378, BT + 0.007, 0.016, 0.0045)
  shell(0.378, BT + 0.016, 0.015, 0.0055) // HDMI
  opening(0.378, BT + 0.016, 0.014, 0.0045)
  usbA(0.352, BT + 0.006, 'plasticBlue')
  usbA(0.352, BT + 0.014, 'plasticBlue')
  shell(0.352, BT + 0.0255, 0.016, 0.0135) // RJ45
  opening(0.352, BT + 0.0255, 0.0118, 0.0095)
  ls.push(['ledWhite', quad([PORT_X - 0.0001, 0.3585, BT + 0.031], [0.002, 0.0016], 0, -1)])
  ls.push(['nickel', rbox([PORT_X + 0.008, 0.328, BT + 0.0045], [0.016, 0.0092, 0.0034], 0.0012)]) // USB-C
  ls.push(['chip', quad([PORT_X - 0.00005, 0.328, BT + 0.0045], [0.0084, 0.0026], 0, -1)])
  usbA(0.328, BT + 0.013, 'plasticBlack')
  const jacks: LookId[] = ['jackGreen', 'jackPink', 'plasticBlue']
  ls.push(['plasticBlack', box([PORT_X + 0.008, 0.306, BT + 0.0155], [0.016, 0.012, 0.028])])
  jacks.forEach((look, i) => {
    const z = BT + 0.006 + i * 0.0092
    ls.push([look, cyl([PORT_X - 0.0003, 0.306, z], 0.0036, 0.0008, 0, 20)])
    ls.push(['chip', cyl([PORT_X - 0.0008, 0.306, z], 0.0018, 0.0004, 0, 16)])
  })

  // Small surface-mount parts in the free areas of the board.
  const rand = rng(7)
  const fields: [number, number, number, number, number][] = [
    [-0.017, 0.335, -0.006, 0.378, 22], // between the socket and the memory
    [-0.15, 0.25, -0.1, 0.274, 20],
    [-0.026, 0.222, 0.025, 0.232, 12],
    [-0.14, 0.33, -0.12, 0.41, 16],
  ]
  for (const [x0, y0, x1, y1, n] of fields)
    for (let i = 0; i < n; i++) {
      const x = x0 + rand() * (x1 - x0)
      const y = y0 + rand() * (y1 - y0)
      const big = rand() > 0.75
      ls.push([
        rand() > 0.5 ? 'chip' : 'labelDark',
        box([x, y, BT + 0.0004], big ? [0.004, 0.004, 0.0009] : [0.0016, 0.0008, 0.0006]),
      ])
    }
  return ls
}

function ioShield(): Ls {
  // Pre-installed style: a black plate with a cut-out for every port.
  const plateShape = rectShape(-(BT + 0.0405), 0.294, -(BT - 0.0035), 0.438, 0.001)
  const yz = (z0: number, z1: number, y0: number, y1: number) => rectHole(-z1, y0, -z0, y1, 0.0005)
  plateShape.holes.push(yz(BT + 0.0022, BT + 0.0182, 0.4135, 0.4285))
  plateShape.holes.push(yz(BT + 0.0022, BT + 0.0182, 0.3925, 0.4075))
  plateShape.holes.push(yz(BT + 0.0038, BT + 0.0193, 0.369, 0.387))
  plateShape.holes.push(yz(BT + 0.0022, BT + 0.0333, 0.3435, 0.3605))
  plateShape.holes.push(yz(BT + 0.0022, BT + 0.0172, 0.3205, 0.3355))
  for (let i = 0; i < 3; i++) plateShape.holes.push(circleHole(-(BT + 0.006 + i * 0.0092), 0.306, 0.0039))
  const ls: Ls = [['labelDark', plate(plateShape, 0.0008, 'yz', -0.2243, 16)]]
  // A folded lip around the edge.
  ls.push(['labelDark', box([-0.2215, 0.366, BT - 0.0035], [0.005, 0.144, 0.0008])])
  ls.push(['labelDark', box([-0.2215, 0.366, BT + 0.0405], [0.005, 0.144, 0.0008])])
  return ls
}

function vrmHeatsink(): Ls {
  const ls: Ls = []
  const h = 0.022
  // Left block: a finned slab over the MOSFETs, the top block runs along the socket.
  const finned = (c: Vec3, s: Vec3, finsAlong: 0 | 1, count: number) => {
    ls.push(['darkMetal', rbox([c[0], c[1], BT + 0.004], [s[0], s[1], 0.008], 0.0015)])
    for (let i = 0; i < count; i++) {
      const o = (i - (count - 1) / 2) * ((finsAlong === 1 ? s[1] : s[0]) / count)
      const pos: Vec3 = finsAlong === 1 ? [c[0], c[1] + o, BT + 0.008 + (h - 0.008) / 2] : [c[0] + o, c[1], BT + 0.008 + (h - 0.008) / 2]
      const size: Vec3 = finsAlong === 1 ? [s[0], 0.0016, h - 0.008] : [0.0016, s[1], h - 0.008]
      ls.push(['darkMetal', box(pos, size)])
    }
    // Brushed accent cap.
    ls.push(['aluminium', box([c[0], c[1], BT + h + 0.0004], finsAlong === 1 ? [s[0] * 0.5, s[1], 0.0008] : [s[0], s[1] * 0.5, 0.0008])])
  }
  finned([-0.1045, 0.369, 0], [0.017, 0.082, 0], 1, 12)
  finned([-0.0455, 0.4105, 0], [0.065, 0.015, 0], 0, 12)
  // Heat pipe linking the two blocks.
  ls.push([
    'nickel',
    placed(
      new TubeGeometry(
        new CatmullRomCurve3([
          new Vector3(-0.1045, 0.395, BT + 0.006),
          new Vector3(-0.1035, 0.409, BT + 0.006),
          new Vector3(-0.09, 0.4105, BT + 0.006),
          new Vector3(-0.07, 0.4105, BT + 0.006),
        ]),
        24,
        0.0022,
        10,
      ),
    ),
  ])
  return ls
}

function chipsetHeatsink(): Ls {
  const c: Vec3 = [0.048, 0.216, 0]
  return [
    ['darkMetal', rbox([c[0], c[1], BT + 0.005], [0.034, 0.034, 0.01], 0.003, 3)],
    ['aluminium', rbox([c[0] - 0.003, c[1] + 0.003, BT + 0.0102], [0.022, 0.022, 0.0008], 0.002)],
    ['ledWhite', box([c[0] + 0.0172, c[1], BT + 0.006], [0.0004, 0.026, 0.0015])],
  ]
}

// Socket (LGA-style): the processor's long side runs along x.
const SUB = { w: 0.045, h: 0.0375 } // processor substrate
const SOCK = { w: 0.053, h: 0.046 }

function cpuSocket(): Ls {
  const ls: Ls = []
  const { x, y } = SOCKET
  // Plastic body around the contact field.
  ls.push(['plasticBlack', box([x, y, BT + 0.0005], [SOCK.w, SOCK.h, 0.001])])
  for (const s of [-1, 1]) {
    ls.push(['plasticBlack', box([x, y + s * (SOCK.h / 2 - 0.002), BT + 0.0018], [SOCK.w, 0.004, 0.0036])])
    ls.push(['plasticBlack', box([x + s * (SOCK.w / 2 - 0.002), y, BT + 0.0018], [0.004, SOCK.h - 0.008, 0.0036])])
  }
  // Spring contacts, shown as a fine gold field.
  for (let i = 0; i < 30; i++)
    for (let j = 0; j < 24; j++) {
      const px = x - 0.0195 + i * 0.00134
      const py = y - 0.0155 + j * 0.00134
      ls.push(['gold', quad([px, py, BT + 0.0011], [0.0005, 0.0005], 2)])
    }
  // Steel load plate with a window for the heat spreader, its hinge and the lever.
  const lp = rectShape(x - SOCK.w / 2 - 0.0015, y - SOCK.h / 2 - 0.0015, x + SOCK.w / 2 - 0.004, y + SOCK.h / 2 + 0.0015, 0.002)
  lp.holes.push(rectHole(x - 0.0175, y - 0.0205, x + 0.0175, y + 0.0205, 0.002))
  ls.push(['nickel', plate(lp, 0.0006, 'xy', BT + 0.0039, 8)])
  ls.push(['nickel', box([x - SOCK.w / 2 - 0.0015, y, BT + 0.0028], [0.003, SOCK.h * 0.8, 0.0022])])
  const lx = x + SOCK.w / 2 + 0.0015
  ls.push([
    'steel',
    placed(
      new TubeGeometry(
        new CatmullRomCurve3([
          new Vector3(lx, y + SOCK.h / 2 + 0.002, BT + 0.003),
          new Vector3(lx, y, BT + 0.003),
          new Vector3(lx, y - SOCK.h / 2 - 0.003, BT + 0.003),
          new Vector3(lx - 0.002, y - SOCK.h / 2 - 0.007, BT + 0.003),
          new Vector3(lx - 0.008, y - SOCK.h / 2 - 0.008, BT + 0.003),
        ]),
        40,
        0.0007,
        8,
      ),
    ),
  ])
  ls.push(['plasticBlack', cyl([lx - 0.009, y - SOCK.h / 2 - 0.008, BT + 0.003], 0.0016, 0.006, 0, 12)])
  for (const [dx, dy] of [
    [-SOCK.w / 2 - 0.004, SOCK.h / 2 + 0.003],
    [-SOCK.w / 2 - 0.004, -SOCK.h / 2 - 0.003],
    [SOCK.w / 2 - 0.004, SOCK.h / 2 + 0.003],
  ])
    ls.push(['nickel', cyl([x + dx, y + dy, BT + 0.001], 0.0022, 0.002, 2, 12)])
  return ls
}

const SUB_Z = BT + 0.0021 // substrate centre
const IHS_TOP = BT + 0.0057

function cpu(): Ls {
  const ls: Ls = []
  const { x, y } = SOCKET
  ls.push(['substrate', box([x, y, SUB_Z], [SUB.w, SUB.h, 0.0012])])
  // Integrated heat spreader: a wide flange and a raised top.
  ls.push(['nickel', rbox([x, y, BT + 0.0033], [0.034, 0.0345, 0.0012], 0.0006)])
  ls.push(['nickel', rbox([x, y, BT + 0.0047], [0.0295, 0.0315, 0.002], 0.0008)])
  // Capacitors on the substrate edges and the gold orientation triangle.
  const rand = rng(11)
  for (let i = 0; i < 14; i++)
    for (const s of [-1, 1]) {
      const px = x - 0.0195 + i * 0.003
      ls.push(['nickel', box([px, y + s * 0.0182, SUB_Z + 0.0008], [0.0008, 0.0012, 0.0005])])
      if (rand() > 0.5) ls.push(['chip', box([px + 0.0012, y + s * 0.0182, SUB_Z + 0.0008], [0.0006, 0.001, 0.0004])])
    }
  ls.push(['gold', quad([x - SUB.w / 2 + 0.002, y - SUB.h / 2 + 0.002, SUB_Z + 0.00062], [0.0022, 0.0022], 2)])
  // The land grid underneath: gold pads that meet the socket's springs.
  for (let i = 0; i < 30; i++)
    for (let j = 0; j < 24; j++) {
      const px = x - 0.0195 + i * 0.00134
      const py = y - 0.0155 + j * 0.00134
      ls.push(['gold', quad([px, py, SUB_Z - 0.00062], [0.0007, 0.0007], 2, -1)])
    }
  return ls
}

// Tower cooler: fins stacked away from the board, fan blowing toward the rear.
const COOLER = { x: SOCKET.x, y: SOCKET.y, finDepth: 0.05, finWidth: 0.12, fins: 48, finPitch: 0.0021, finZ0: BT + 0.04 }
const FIN_Z_TOP = COOLER.finZ0 + (COOLER.fins - 1) * COOLER.finPitch
const FIN_Z_MID = (COOLER.finZ0 + FIN_Z_TOP) / 2

function cpuCooler(): Ls {
  const ls: Ls = []
  const { x, y } = COOLER
  const baseTop = IHS_TOP + 0.0045
  // Copper base and the nickel mounting bar with its spring screws.
  ls.push(['copper', rbox([x, y, IHS_TOP + 0.00225], [0.04, 0.042, 0.0045], 0.0008)])
  ls.push(['darkMetal', box([x, y, baseTop + 0.0035], [0.012, 0.096, 0.003])])
  for (const s of [-1, 1]) {
    ls.push(['steel', cyl([x, y + s * 0.044, baseTop - 0.0025], 0.0026, 0.012, 2, 12)])
    ls.push(['nickel', cyl([x, y + s * 0.044, baseTop + 0.0056], 0.0034, 0.002, 2, 16)])
  }
  // Four U-shaped heat pipes through the base and up through the fins.
  const pipeZ = IHS_TOP + 0.003
  ;[-0.0135, -0.0045, 0.0045, 0.0135].forEach((dy, i) => {
    const half = i % 2 ? 0.0105 : 0.0185
    const yy = y + dy
    const pts = [
      [x - half, yy, FIN_Z_TOP + 0.003],
      [x - half, yy, pipeZ + 0.014],
      [x - half + 0.002, yy, pipeZ + 0.004],
      [x - half + 0.007, yy, pipeZ],
      [x + half - 0.007, yy, pipeZ],
      [x + half - 0.002, yy, pipeZ + 0.004],
      [x + half, yy, pipeZ + 0.014],
      [x + half, yy, FIN_Z_TOP + 0.003],
    ].map((p) => new Vector3(...p))
    ls.push(['nickel', placed(new TubeGeometry(new CatmullRomCurve3(pts, false, 'centripetal'), 80, 0.003, 12, false))])
  })
  // Fin stack: thin aluminium plates parallel to the board, with folded edges.
  for (let i = 0; i < COOLER.fins; i++) {
    const z = COOLER.finZ0 + i * COOLER.finPitch
    ls.push(['aluminium', box([x, y, z], [COOLER.finDepth, COOLER.finWidth, 0.0004])])
    for (const s of [-1, 1]) ls.push(['aluminium', box([x, y + s * (COOLER.finWidth / 2 - 0.0002), z + 0.0006], [COOLER.finDepth, 0.0004, 0.0012])])
  }
  // Top cover with pipe caps.
  ls.push(['darkMetal', rbox([x, y, FIN_Z_TOP + 0.0025], [COOLER.finDepth + 0.002, COOLER.finWidth + 0.002, 0.003], 0.0012)])
  ls.push(['brushedSteel', rbox([x, y, FIN_Z_TOP + 0.0042], [0.03, 0.08, 0.0005], 0.0002)])
  for (const dy of [-0.0135, -0.0045, 0.0045, 0.0135])
    for (const s of [-1, 1]) {
      const half = Math.abs(dy) < 0.01 ? 0.0105 : 0.0185
      ls.push(['nickel', cyl([x + s * half, y + dy, FIN_Z_TOP + 0.0045], 0.0031, 0.0012, 2, 16)])
    }
  return ls
}

function cpuFan(): Ls {
  const fx = COOLER.x + COOLER.finDepth / 2 + 0.0125 + 0.0005
  const ls = fan([fx, COOLER.y, FIN_Z_MID], [1, 0, 0], caseFanOptions)
  // Wire clips hooking the fan frame onto the fin stack.
  for (const s of [-1, 1]) {
    const y = COOLER.y + s * 0.054
    ls.push([
      'steel',
      placed(
        new TubeGeometry(
          new CatmullRomCurve3([
            new Vector3(fx + 0.004, y, FIN_Z_MID - 0.055),
            new Vector3(fx - 0.012, y, FIN_Z_MID - 0.058),
            new Vector3(fx - 0.024, y, FIN_Z_MID - 0.05),
            new Vector3(fx - 0.024, y, FIN_Z_MID + 0.05),
            new Vector3(fx - 0.012, y, FIN_Z_MID + 0.058),
            new Vector3(fx + 0.004, y, FIN_Z_MID + 0.055),
          ]),
          60,
          0.0006,
          6,
        ),
      ),
    ])
  }
  return ls
}

function dimm(x: number): Ls {
  const ls: Ls = []
  const len = 0.1333
  const z0 = BT + 0.0015 // bottom edge, down in the slot
  // PCB with the key notch, the gold edge contacts on both faces.
  ls.push(['pcbDark', box([x, DIMM_Y, z0 + 0.0158], [0.0012, len, 0.0316])])
  for (const s of [-1, 1])
    for (let i = 0; i < 72; i++) {
      const y = DIMM_Y - len / 2 + 0.004 + i * 0.00174
      if (Math.abs(y - (DIMM_Y - 0.0045)) < 0.0012) continue // key notch
      ls.push(['gold', quad([x + s * 0.00062, y, z0 + 0.0022], [0.0011, 0.0034], 0, s as 1 | -1)])
    }
  // Heat spreaders with a brushed band, and the diffuser light bar on top.
  for (const s of [-1, 1]) {
    ls.push(['dimmBlack', rbox([x + s * 0.0014, DIMM_Y, BT + 0.0245], [0.0014, 0.131, 0.032], 0.0006)])
    ls.push(['aluminium', box([x + s * 0.0022, DIMM_Y - 0.01, BT + 0.031], [0.0002, 0.08, 0.004])])
  }
  ls.push(['ledWhite', rbox([x, DIMM_Y, BT + 0.0425], [0.0052, 0.128, 0.004], 0.0012)])
  return ls
}

function m2Ssd(): Ls {
  const ls: Ls = []
  const z = BT + 0.0036
  const x0 = -0.172
  const x1 = -0.092
  const y = 0.311
  const xc = (x0 + x1) / 2
  const board = rectShape(x0, y - 0.011, x1, y + 0.011, 0.0005)
  board.holes.push(circleHole(x1 - 0.0025, y, 0.0016))
  ls.push(['pcbDark', plate(board, 0.0008, 'xy', z, 12)])
  // Edge contacts (M key), the controller, DRAM cache and two flash packages.
  for (let i = 0; i < 30; i++) {
    const py = y - 0.0095 + i * 0.00064
    if (Math.abs(py - (y + 0.0055)) < 0.0007) continue
    ls.push(['gold', quad([x0 + 0.002, py, z + 0.00042], [0.0035, 0.00038], 2)])
  }
  ls.push(['chip', rbox([x0 + 0.017, y, z + 0.001], [0.012, 0.012, 0.0012], 0.0003)])
  ls.push(['chip', rbox([x0 + 0.031, y, z + 0.001], [0.008, 0.01, 0.0012], 0.0003)])
  for (const dx of [0.047, 0.065]) ls.push(['chip', rbox([x0 + dx, y, z + 0.001], [0.014, 0.018, 0.0012], 0.0003)])
  ls.push(['label', quad([xc + 0.015, y, z + 0.0017], [0.034, 0.02], 2)])
  ls.push(['labelDark', quad([xc + 0.015, y + 0.006, z + 0.00175], [0.034, 0.005], 2)])
  ls.push(['nickel', cyl([x1 - 0.0025, y, z + 0.0012], 0.0026, 0.0016, 2, 16)])
  return ls
}

function gpu(): Ls {
  const ls: Ls = []
  const xb = -0.2215 // bracket
  const x0 = -0.2205
  const x1 = 0.0485
  const xc = (x0 + x1) / 2
  const len = x1 - x0
  const zTop = BT + 0.118
  const zMid = BT + 0.065

  // PCB with the stepped edge that drops into the slot, and its gold fingers.
  const fx0 = -0.1795
  const fx1 = -0.0915
  const pcbShape = new Shape()
  ;[
    [x0, BT + 0.0125],
    [fx0 - 0.002, BT + 0.0125],
    [fx0, BT + 0.0025],
    [fx1, BT + 0.0025],
    [fx1 + 0.002, BT + 0.0125],
    [x1, BT + 0.0125],
    [x1, zTop - 0.004],
    [x0, zTop - 0.004],
  ].forEach(([u, z], i) => (i ? pcbShape.lineTo(u, -z) : pcbShape.moveTo(u, -z)))
  ls.push(['pcbDark', plate(pcbShape, 0.0016, 'xz', PY)])
  for (const s of [-1, 1])
    for (let i = 0; i < 82; i++) {
      const x = fx0 + 0.0008 + i * 0.00106
      if (Math.abs(x - (fx0 + 0.0117)) < 0.0012) continue // key notch
      ls.push(['gold', quad([x, PY + s * 0.00082, BT + 0.0065], [0.0007, 0.007], 1, s as 1 | -1)])
    }

  // Backplate on the top side, with vents and screws around the GPU core.
  const bp = rectShape(x0 + 0.003, -(zTop - 0.002), x1 - 0.0005, -(BT + 0.014), 0.002)
  for (let i = 0; i < 6; i++) bp.holes.push(rectHole(0.004 + i * 0.006, -(zTop - 0.02), 0.0075 + i * 0.006, -(BT + 0.03), 0.0015))
  ls.push(['darkMetal', plate(bp, 0.0015, 'xz', PY + 0.0035, 6)])
  for (const [dx, dz] of [
    [-0.022, -0.022],
    [0.022, -0.022],
    [-0.022, 0.022],
    [0.022, 0.022],
  ])
    ls.push(['nickel', cyl([-0.105 + dx, PY + 0.0047, zMid + dz], 0.0022, 0.001, 1, 12)])
  ls.push(['aluminium', box([-0.16, PY + 0.0044, zTop - 0.012], [0.07, 0.0003, 0.003])])

  // Cooler: contact plate, heat pipes and a dense fin stack under the PCB.
  ls.push(['copper', box([-0.105, PY - 0.004, zMid], [0.036, 0.004, 0.036])])
  for (let i = 0; i < 5; i++) ls.push(['nickel', cyl([-0.085, PY - 0.0075, BT + 0.035 + i * 0.012], 0.003, 0.25, 0, 12)])
  for (let i = 0; i < 112; i++) {
    const x = -0.2125 + i * 0.0023
    ls.push(['aluminium', box([x, PY - 0.0175, (BT + 0.016 + zTop - 0.003) / 2], [0.0004, 0.021, zTop - 0.003 - BT - 0.016])])
  }

  // Shroud: a fan plate with three openings, side walls and an end cap.
  const sy = PY - 0.0445
  const shroud = new Shape()
  ;[
    [x0 + 0.002, BT + 0.016],
    [x1 - 0.008, BT + 0.016],
    [x1, BT + 0.024],
    [x1, zTop],
    [x0 + 0.002, zTop],
  ].forEach(([u, z], i) => (i ? shroud.lineTo(u, -z) : shroud.moveTo(u, -z)))
  const fanXs = [-0.172, -0.085, 0.002]
  for (const fx of fanXs) shroud.holes.push(circleHole(fx, -zMid, 0.0425))
  ls.push(['plasticBlack', plate(shroud, 0.003, 'xz', sy, 32)])
  ls.push(['plasticBlack', box([xc + 0.001, PY - 0.024, zTop - 0.0015], [len - 0.002, 0.04, 0.003])])
  ls.push(['plasticBlack', box([xc + 0.001, PY - 0.04, BT + 0.0175], [len - 0.002, 0.008, 0.003])])
  ls.push(['plasticBlack', box([x1 - 0.0015, PY - 0.024, zMid + 0.004], [0.003, 0.04, zTop - BT - 0.026])])
  // Angular trims between the fans and the light bar on the top edge.
  for (const fx of [-0.1285, -0.0415]) ls.push(['darkMetal', box([fx, sy - 0.0018, zMid], [0.004, 0.0008, 0.09])])
  ls.push(['ledWhite', box([-0.105, PY - 0.024, zTop + 0.0002], [0.12, 0.012, 0.0006])])
  for (const fx of fanXs) {
    ls.push(['darkMetal', placed(new RingGeometry(0.0425, 0.0445, 64), { position: [fx, sy - 0.0016, zMid], rotation: [Math.PI / 2, 0, 0] })])
    ls.push(...fan([fx, PY - 0.036, zMid], [0, -1, 0], { size: 0, radius: 0.0418, depth: 0.012, count: 11 }))
  }

  // Bracket with the display outputs and a vent grille.
  const br = rectShape(-(zTop + 0.002), PY - 0.0535, -(BT + 0.003), PY + 0.0065)
  const ports = [BT + 0.022, BT + 0.039, BT + 0.056, BT + 0.075]
  for (const z of ports) br.holes.push(rectHole(-(z + 0.0085), PY - 0.0105, -(z - 0.0085), PY - 0.0035, 0.0006))
  for (let i = 0; i < 9; i++) {
    const z = BT + 0.012 + i * 0.011
    br.holes.push(rectHole(-(z + 0.0075), PY - 0.048, -z, PY - 0.016, 0.0025))
  }
  ls.push(['nickel', plate(br, 0.0008, 'yz', xb)])
  for (const z of ports) {
    ls.push(['nickel', box([xb + 0.006, PY - 0.007, z], [0.011, 0.0065, 0.0165])])
    ls.push(['chip', quad([xb - 0.0005, PY - 0.007, z], [0.0055, 0.0155], 0, -1)])
  }
  // Power socket on the top edge, ready for the 8-pin cable.
  ls.push(['plasticBlack', box([-0.02, PY - 0.006, zTop + 0.0045], [0.0205, 0.0095, 0.009])])
  return ls
}

const SATA_SSD = { x: 0.1, y: 0.0455, len: 0.1, w: 0.07, t: 0.007 }

/** SATA data (7-pin) and power (15-pin) connectors on a drive's -x end. */
function sataConnectors(x: number, y: number, power: number, data: number): Ls {
  const ls: Ls = []
  for (const [z, w] of [
    [power, 0.021],
    [data, 0.0085],
  ]) {
    ls.push(['plasticBlack', box([x - 0.0025, y, z], [0.005, 0.0035, w + 0.002])])
    ls.push(['gold', quad([x - 0.0051, y + 0.0004, z], [0.0012, w - 0.001], 0, -1)])
  }
  return ls
}

function sataSsd(): Ls {
  const { x, y, len, w, t } = SATA_SSD
  const x0 = x - len / 2
  return [
    ['darkMetal', rbox([x, y - t / 4, 0], [len, t / 2, w], 0.0015)],
    ['aluminium', rbox([x, y + t / 4, 0], [len, t / 2, w], 0.0015)],
    ['labelDark', quad([x + 0.005, y + t / 2 + 0.0002, 0], [0.07, 0.05], 1)],
    ['label', quad([x + 0.005, y + t / 2 + 0.0003, 0.012], [0.05, 0.006], 1)],
    ...sataConnectors(x0, y - 0.001, 0.012, -0.016),
  ]
}

const HDD = { x: 0.1, y: 0.0196, len: 0.147, w: 0.1016, t: 0.0261 }

function hdd(): Ls {
  const ls: Ls = []
  const { x, y, len, w, t } = HDD
  const x0 = x - len / 2
  // Cast aluminium base, steel top cover with its label, and the screws that seal it.
  ls.push(['aluminium', rbox([x, y - 0.002, 0], [len, t - 0.004, w], 0.002, 3)])
  ls.push(['brushedSteel', rbox([x + 0.002, y + t / 2 - 0.0012, 0], [len - 0.008, 0.0024, w - 0.006], 0.001)])
  ls.push(['label', quad([x + 0.012, y + t / 2 + 0.00005, 0.004], [0.09, 0.07], 1)])
  ls.push(['labelDark', quad([x + 0.012, y + t / 2 + 0.0001, 0.031], [0.09, 0.012], 1)])
  for (const [dx, dz] of [
    [-0.066, -0.044],
    [-0.066, 0.044],
    [0.066, -0.044],
    [0.066, 0.044],
    [0.0, -0.046],
    [0.0, 0.046],
    [-0.035, 0.0],
  ])
    ls.push(['nickel', cyl([x + dx, y + t / 2 + 0.0002, dz], 0.0018, 0.0008, 1, 10)])
  // Circuit board underneath with its controller, cache and motor driver.
  ls.push(['pcb', box([x - 0.01, y - t / 2 - 0.0008, 0], [0.11, 0.0016, 0.085])])
  for (const [dx, dz, s] of [
    [-0.03, 0.01, 0.014],
    [0.0, -0.02, 0.01],
    [0.02, 0.02, 0.008],
  ] as [number, number, number][])
    ls.push(['chip', box([x + dx, y - t / 2 - 0.0021, dz], [s, 0.001, s])])
  // Side mounting holes.
  for (const dx of [-0.0455, 0.0555]) for (const s of [-1, 1]) ls.push(['chip', cyl([x + dx, y - 0.007, s * (w / 2 + 0.0001)], 0.0018, 0.0006, 2, 12)])
  ls.push(...sataConnectors(x0, y - t / 2 + 0.004, 0.017, -0.012))
  return ls
}

function caseFan(c: Vec3): Ls {
  return fan(c, [1, 0, 0], caseFanOptions)
}

// ---- Assemble -----------------------------------------------------------------

const SHAPES: { id: string; ls: Ls }[] = [
  { id: 'case_frame', ls: caseFrame() },
  { id: 'side_panel', ls: sidePanel() },
  { id: 'psu', ls: psu() },
  { id: 'psu_cables', ls: psuCables() },
  { id: 'motherboard', ls: motherboard() },
  { id: 'io_shield', ls: ioShield() },
  { id: 'vrm_heatsink', ls: vrmHeatsink() },
  { id: 'chipset_heatsink', ls: chipsetHeatsink() },
  { id: 'cpu_socket', ls: cpuSocket() },
  { id: 'cpu', ls: cpu() },
  { id: 'cpu_cooler', ls: cpuCooler() },
  { id: 'cpu_fan', ls: cpuFan() },
  { id: 'ram_1', ls: dimm(DIMM_X[1]) },
  { id: 'ram_2', ls: dimm(DIMM_X[3]) },
  { id: 'm2_ssd', ls: m2Ssd() },
  { id: 'gpu', ls: gpu() },
  { id: 'sata_ssd', ls: sataSsd() },
  { id: 'hdd', ls: hdd() },
  { id: 'front_fan', ls: caseFan([HALF_D - 0.006 - 0.0125 - 0.001, 0.28, 0.013]) },
  { id: 'rear_fan', ls: caseFan([-HALF_D + WALL + 0.0125 + 0.0005, 0.36, 0.038]) },
]

async function main() {
  await mkdir('public/models', { recursive: true })
  const parts: OutputPart[] = SHAPES.map(({ id, ls }) => {
    const layers = layered(ls)
    return { id, data: mergeMeshData(layers.map((l) => l.data)), layers, maxTriangles: 200000 }
  })
  const all = mergeMeshData(parts.map(partData))
  const b = boundsOf(all.positions)
  const origin: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
  await writePartsGlb(FILE, 'computer', parts, origin)
}

await main()
