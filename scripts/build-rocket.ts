// Builds public/models/rocket-engine.glb: an original liquid-fuel rocket
// engine (gas-generator cycle, kerosene + liquid oxygen), modelled in code.
// Units are metres; +y is up, the nozzle points down.
//
// Usage: npx tsx scripts/build-rocket.ts
import { mkdir } from 'node:fs/promises'
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  LatheGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { boundsOf, mergeMeshData, type MeshData, type Vec3 } from './lib/gltf'
import { writePartsGlb, type OutputPart } from './lib/output'
import { merge, placed } from './lib/three-mesh'

const SEG = 72

// ---- Thrust chamber contour (inner radius as a function of height) ----
const Y_INJECTOR = 1.0
const Y_CHAMBER_END = 0.62
const Y_THROAT = 0.36
const Y_EXIT = -1.35
const R_CHAMBER = 0.24
const R_THROAT = 0.105
const R_EXIT = 0.56

function contourRadius(y: number): number {
  if (y >= Y_CHAMBER_END) return R_CHAMBER
  if (y >= Y_THROAT) {
    const t = (Y_CHAMBER_END - y) / (Y_CHAMBER_END - Y_THROAT)
    return R_THROAT + (R_CHAMBER - R_THROAT) * (0.5 + 0.5 * Math.cos(t * Math.PI))
  }
  const t = (Y_THROAT - y) / (Y_THROAT - Y_EXIT)
  return R_THROAT + (R_EXIT - R_THROAT) * (1 - Math.pow(1 - t, 1.9))
}

/** A revolved shell between yTop and yBottom with the given wall thickness. */
function shell(yTop: number, yBottom: number, thickness: number, steps = 60): MeshData {
  const outer: Vector2[] = []
  const inner: Vector2[] = []
  for (let i = 0; i <= steps; i++) {
    const y = yTop + (yBottom - yTop) * (i / steps)
    const r = contourRadius(y)
    outer.push(new Vector2(r + thickness, y))
    inner.push(new Vector2(r, y))
  }
  const profile = [...outer, ...inner.reverse(), outer[0]]
  return placed(new LatheGeometry(profile, SEG))
}

const cyl = (r: number, h: number, position: Vec3, rotation: Vec3 = [0, 0, 0], rBottom = r, seg = 32) =>
  placed(new CylinderGeometry(r, rBottom, h, seg), { position, rotation })

const torus = (R: number, r: number, position: Vec3, rotation: Vec3 = [Math.PI / 2, 0, 0], seg = 48) =>
  placed(new TorusGeometry(R, r, 12, seg), { position, rotation })

const box = (size: Vec3, position: Vec3, rotation: Vec3 = [0, 0, 0]) =>
  placed(new BoxGeometry(...size), { position, rotation })

const tube = (points: Vec3[], radius: number, segments = 64) =>
  placed(new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), segments, radius, 14, false))

/** Cylinder spanning two points. */
function segmentCylinder(a: Vec3, b: Vec3, radius: number, seg = 20): MeshData {
  const va = new Vector3(...a)
  const vb = new Vector3(...b)
  const dir = vb.clone().sub(va)
  const geo = new CylinderGeometry(radius, radius, dir.length(), seg)
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize())
  geo.applyQuaternion(quat)
  const mid = va.add(vb).multiplyScalar(0.5)
  geo.translate(mid.x, mid.y, mid.z)
  return placed(geo)
}

// ---- Parts ----
const PUMP_X = -0.62

function injector(): MeshData {
  const dome = placed(
    new LatheGeometry(
      Array.from({ length: 24 }, (_, i) => {
        const a = (i / 23) * (Math.PI / 2)
        return new Vector2(Math.max(0.0001, Math.cos(a) * (R_CHAMBER + 0.03)), Y_INJECTOR + Math.sin(a) * 0.2)
      }),
      SEG,
    ),
  )
  const plate = cyl(R_CHAMBER + 0.03, 0.03, [0, Y_INJECTOR, 0], [0, 0, 0], R_CHAMBER + 0.03, SEG)
  // Injector elements: three rings of small coaxial injector posts on the face.
  const elements: MeshData[] = []
  for (const [ring, count] of [
    [0.06, 8],
    [0.12, 16],
    [0.19, 24],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      elements.push(cyl(0.008, 0.04, [Math.cos(a) * ring, Y_INJECTOR - 0.03, Math.sin(a) * ring], [0, 0, 0], 0.008, 10))
    }
  }
  const flange = torus(R_CHAMBER + 0.035, 0.015, [0, Y_INJECTOR - 0.015, 0])
  return merge(dome, plate, flange, ...elements)
}

function combustionChamber(): MeshData {
  const wall = shell(Y_INJECTOR - 0.015, 0.28, 0.022)
  const collar = torus(R_CHAMBER + 0.03, 0.018, [0, 0.8, 0])
  return merge(wall, collar)
}

function nozzle(): MeshData {
  const bell = shell(0.28, Y_EXIT, 0.009, 80)
  const lip = torus(R_EXIT + 0.012, 0.012, [0, Y_EXIT, 0], [Math.PI / 2, 0, 0], 96)
  const stiffeners = [-0.2, -0.65, -1.05].map((y) => torus(contourRadius(y) + 0.014, 0.008, [0, y, 0], [Math.PI / 2, 0, 0], 96))
  return merge(bell, lip, ...stiffeners)
}

function coolingJacket(): MeshData {
  // Regenerative cooling: fuel runs through channels along the hot wall before injection.
  const channels: MeshData[] = []
  const count = 40
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const pts: Vec3[] = []
    for (let k = 0; k <= 24; k++) {
      const y = 0.95 + (-0.3 - 0.95) * (k / 24)
      const r = contourRadius(y) + 0.03
      pts.push([Math.cos(a) * r, y, Math.sin(a) * r])
    }
    channels.push(tube(pts, 0.0065, 40))
  }
  const inletManifold = torus(contourRadius(-0.32) + 0.035, 0.03, [0, -0.32, 0])
  const outletManifold = torus(R_CHAMBER + 0.06, 0.025, [0, 0.95, 0])
  return merge(inletManifold, outletManifold, ...channels)
}

function pump(y: number, volute: number): MeshData {
  return merge(
    torus(volute, volute * 0.45, [PUMP_X, y, 0]),
    cyl(volute * 0.85, volute * 0.9, [PUMP_X, y, 0], [0, 0, 0], volute * 0.85, 40),
    cyl(volute * 0.4, 0.08, [PUMP_X, y + volute * 0.7, 0], [0, 0, 0], volute * 0.5, 24),
    // Discharge outlet tangent to the volute.
    cyl(volute * 0.35, volute * 1.2, [PUMP_X + volute * 1.1, y, volute * 0.5], [0, 0, Math.PI / 2], volute * 0.35, 20),
  )
}

function turbine(): MeshData {
  const y = 0.7
  const housing = cyl(0.15, 0.1, [PUMP_X, y, 0], [0, 0, 0], 0.15, 48)
  const blades: MeshData[] = []
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2
    blades.push(box([0.05, 0.06, 0.006], [PUMP_X + Math.cos(a) * 0.12, y, Math.sin(a) * 0.12], [0, -a, 0.5]))
  }
  const disc = cyl(0.09, 0.03, [PUMP_X, y, 0], [0, 0, 0], 0.09, 40)
  const shaft = cyl(0.025, 0.8, [PUMP_X, 1.0, 0], [0, 0, 0], 0.025, 20)
  return merge(housing, disc, shaft, ...blades)
}

function gasGenerator(): MeshData {
  const x = PUMP_X + 0.02
  const z = 0.24
  return merge(
    cyl(0.055, 0.18, [x, 0.46, z], [0, 0, 0], 0.055, 32),
    placed(new SphereGeometry(0.055, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), { position: [x, 0.55, z] }),
    cyl(0.02, 0.08, [x, 0.6, z], [0, 0, 0], 0.035, 16),
    tube([[x, 0.37, z], [x, 0.33, z - 0.08], [PUMP_X, 0.6, 0.1]], 0.022),
  )
}

function turbineExhaust(): MeshData {
  const path: Vec3[] = [
    [PUMP_X, 0.66, 0],
    [PUMP_X - 0.08, 0.4, 0],
    [PUMP_X - 0.16, 0.0, 0],
    [PUMP_X - 0.24, -0.45, 0],
    [PUMP_X - 0.3, -0.75, 0],
  ]
  return merge(tube(path, 0.065, 80), cyl(0.065, 0.12, [PUMP_X - 0.31, -0.84, 0], [0, 0, 0.12], 0.1, 32))
}

const LOX_PUMP_Y = 1.26
const FUEL_PUMP_Y = 0.98

function oxidizerLines(): MeshData {
  const inlet = tube([[PUMP_X, 2.0, 0], [PUMP_X, 1.7, 0], [PUMP_X, 1.36, 0]], 0.055)
  const discharge = tube(
    [
      [PUMP_X + 0.2, LOX_PUMP_Y, 0.06],
      [-0.38, 1.32, 0.05],
      [-0.2, 1.3, 0.02],
      [-0.06, 1.24, 0],
    ],
    0.045,
  )
  return merge(inlet, discharge)
}

function fuelLines(): MeshData {
  const inlet = tube([[PUMP_X + 0.05, 2.0, -0.22], [PUMP_X + 0.05, 1.5, -0.2], [PUMP_X, 1.05, -0.06]], 0.045)
  const discharge = tube(
    [
      [PUMP_X + 0.17, FUEL_PUMP_Y, 0.05],
      [-0.38, 0.6, 0.12],
      [-0.36, 0.1, 0.14],
      [-0.3, -0.25, 0.1],
      [-contourRadius(-0.32) - 0.03, -0.32, 0.02],
    ],
    0.04,
    90,
  )
  return merge(inlet, discharge)
}

const valve = (position: Vec3) =>
  merge(
    box([0.11, 0.08, 0.11], position),
    cyl(0.03, 0.08, [position[0], position[1] + 0.08, position[2]], [0, 0, 0], 0.03, 16),
    box([0.05, 0.03, 0.09], [position[0], position[1] + 0.13, position[2]]),
  )

function gimbal(): MeshData {
  const y = 1.32
  return merge(
    box([0.16, 0.1, 0.16], [0, y, 0]),
    cyl(0.03, 0.26, [0, y, 0], [0, 0, Math.PI / 2], 0.03, 20),
    cyl(0.03, 0.26, [0, y, 0], [Math.PI / 2, 0, 0], 0.03, 20),
  )
}

const RING_Y = 1.95
const RING_R = 0.46

function thrustFrame(): MeshData {
  const ring = torus(RING_R, 0.03, [0, RING_Y, 0])
  const struts = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    return segmentCylinder([Math.cos(a) * 0.06, 1.38, Math.sin(a) * 0.06], [Math.cos(a) * RING_R, RING_Y, Math.sin(a) * RING_R], 0.02)
  })
  return merge(ring, ...struts)
}

function actuators(): MeshData {
  const make = (a: number) => {
    const top: Vec3 = [Math.cos(a) * RING_R, RING_Y - 0.02, Math.sin(a) * RING_R]
    const bottom: Vec3 = [Math.cos(a) * (R_CHAMBER + 0.05), 0.82, Math.sin(a) * (R_CHAMBER + 0.05)]
    const mid: Vec3 = [(top[0] + bottom[0]) / 2, (top[1] + bottom[1]) / 2, (top[2] + bottom[2]) / 2]
    return merge(segmentCylinder(top, mid, 0.04), segmentCylinder(mid, bottom, 0.018))
  }
  return merge(make(0), make(Math.PI / 2))
}

function controller(): MeshData {
  const base: Vec3 = [0.28, 1.72, -0.3]
  const fins = Array.from({ length: 7 }, (_, i) => box([0.2, 0.01, 0.14], [base[0], base[1] + 0.07, base[2] - 0.06 + i * 0.02]))
  return merge(box([0.22, 0.12, 0.16], base), ...fins)
}

const igniter = () =>
  merge(cyl(0.025, 0.12, [0, 1.26, 0.16], [0.3, 0, 0], 0.025, 16), tube([[0, 1.32, 0.18], [0.1, 1.5, 0.12], [0.25, 1.68, -0.25]], 0.008))

const PARTS: { id: string; build: () => MeshData; maxTriangles: number }[] = [
  { id: 'combustion_chamber', build: combustionChamber, maxTriangles: 12000 },
  { id: 'injector', build: injector, maxTriangles: 12000 },
  { id: 'nozzle', build: nozzle, maxTriangles: 16000 },
  { id: 'cooling_jacket', build: coolingJacket, maxTriangles: 30000 },
  { id: 'igniter', build: igniter, maxTriangles: 2000 },
  { id: 'gimbal', build: gimbal, maxTriangles: 2000 },
  { id: 'thrust_frame', build: thrustFrame, maxTriangles: 6000 },
  { id: 'actuators', build: actuators, maxTriangles: 3000 },
  { id: 'turbine', build: turbine, maxTriangles: 8000 },
  { id: 'fuel_pump', build: () => pump(FUEL_PUMP_Y, 0.1), maxTriangles: 5000 },
  { id: 'lox_pump', build: () => pump(LOX_PUMP_Y, 0.12), maxTriangles: 5000 },
  { id: 'gas_generator', build: gasGenerator, maxTriangles: 4000 },
  { id: 'turbine_exhaust', build: turbineExhaust, maxTriangles: 5000 },
  { id: 'oxidizer_lines', build: oxidizerLines, maxTriangles: 6000 },
  { id: 'fuel_lines', build: fuelLines, maxTriangles: 6000 },
  { id: 'main_oxidizer_valve', build: () => valve([-0.3, 1.32, 0.04]), maxTriangles: 1000 },
  { id: 'main_fuel_valve', build: () => valve([-0.39, 0.42, 0.13]), maxTriangles: 1000 },
  { id: 'controller', build: controller, maxTriangles: 1500 },
]

await mkdir('public/models', { recursive: true })
const parts: OutputPart[] = PARTS.map((p) => ({ id: p.id, data: p.build(), maxTriangles: p.maxTriangles }))
const b = boundsOf(mergeMeshData(parts.map((p) => p.data)).positions)
const origin: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
await writePartsGlb('public/models/rocket-engine.glb', 'rocketEngine', parts, origin)
