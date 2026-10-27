// Builds public/models/computer.glb: an original desktop PC (mid-tower, ATX
// motherboard, standard PSU, PCIe graphics card, DIMM memory, tower CPU cooler).
// Modelled in code from standard form-factor sizes, in metres. Y is up, X is the
// case depth (rear panel at -x, front bezel at +x), Z is the width (glass side
// panel at +z, so the viewer looks at the motherboard face).
//
// Usage: npx tsx scripts/build-computer.ts
import { mkdir } from 'node:fs/promises'
import {
  CatmullRomCurve3,
  Euler,
  LatheGeometry,
  Matrix3,
  Matrix4,
  Quaternion,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { boundsOf, boxMesh, cylinderMesh, mergeMeshData, type MeshData, type Vec3 } from './lib/gltf'
import { writePartsGlb, type OutputPart } from './lib/output'
import { placed } from './lib/three-mesh'

const FILE = 'public/models/computer.glb'

// ---- Case -----------------------------------------------------------------
const HALF_W = 0.105 // case width / 2 (z)
const HALF_D = 0.225 // case depth / 2 (x)
const TOP = 0.46 // case height (y)
const WALL = 0.002

// ---- Motherboard -----------------------------------------------------------
// ATX 305 x 244 mm, standing on standoffs just in front of the tray (-z).
const BOARD_X0 = -0.2
const BOARD_X1 = 0.105
const BOARD_Y0 = 0.19
const BOARD_Y1 = 0.434
const BOARD_T = 0.0016
const BOARD_Z = -0.0935
const BOARD_TOP = BOARD_Z + BOARD_T / 2 // components stand on this face (+z)

// Socket and DIMM positions on the board.
const SOCKET = { x: -0.03, y: 0.34 }
const DIMM_X = [0.0385, 0.05, 0.0615, 0.073] // four slots; the two middle ones are populated
const DIMM_Y = 0.33
const DIMM_LEN = 0.133
const PCIE_Y = 0.23

// ---- Helpers ---------------------------------------------------------------

/** Applies translation and XYZ Euler rotation to a MeshData (positions and normals). */
function xform(d: MeshData, position: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0]): MeshData {
  const m = new Matrix4().compose(
    new Vector3(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vector3(1, 1, 1),
  )
  const n = new Matrix3().getNormalMatrix(m)
  const positions = new Float32Array(d.positions.length)
  const normals = new Float32Array(d.normals.length)
  const p = new Vector3()
  const q = new Vector3()
  for (let i = 0; i < d.positions.length; i += 3) {
    p.fromArray(d.positions, i).applyMatrix4(m)
    positions.set([p.x, p.y, p.z], i)
    q.fromArray(d.normals, i).applyMatrix3(n).normalize()
    normals.set([q.x, q.y, q.z], i)
  }
  return { positions, normals, indices: d.indices }
}

const box = (c: Vec3, s: Vec3) => boxMesh(c, s)

/** A fan built around the local y axis, then turned to `axis` and placed at `c`. */
function fan(c: Vec3, axis: 0 | 1 | 2, radius: number, thickness: number, blades = 7): MeshData {
  // Frame: a hollow ring of the fan housing.
  const ring = placed(
    new LatheGeometry(
      [
        new Vector2(radius, -thickness / 2),
        new Vector2(radius, thickness / 2),
        new Vector2(radius - 0.008, thickness / 2),
        new Vector2(radius - 0.008, -thickness / 2),
        new Vector2(radius, -thickness / 2),
      ],
      48,
    ),
  )
  const hub = cylinderMesh([0, 0, 0], radius * 0.22, thickness * 1.1, 1, 24)
  const parts: MeshData[] = [ring, hub]
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2
    const r = radius * 0.5
    // A flat blade, long side radial, yawed by its angle.
    parts.push(
      xform(
        box([0, 0, 0], [radius * 0.56, thickness * 0.5, radius * 0.16]),
        [r * Math.cos(a), 0, r * Math.sin(a)],
        [0, -a, 0],
      ),
    )
  }
  // Local axis is y. Turn it onto the requested axis.
  const turn: Record<0 | 1 | 2, Vec3> = { 1: [0, 0, 0], 0: [0, 0, -Math.PI / 2], 2: [Math.PI / 2, 0, 0] }
  return xform(mergeMeshData(parts), c, turn[axis])
}

/** A smooth cable run through the given points. */
function cable(points: Vec3[], radius: number, segments = 96): MeshData {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)))
  return placed(new TubeGeometry(curve, segments, radius, 10, false))
}

/** A fin stack: thin plates with normal along `normal`, spaced along the same axis. */
function finStack(center: Vec3, count: number, spacing: number, plate: Vec3, normal: 0 | 1 | 2): MeshData {
  const plates: MeshData[] = []
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spacing
    const c: Vec3 = [...center]
    c[normal] += offset
    const size: Vec3 = [...plate]
    size[normal] = 0.0008
    plates.push(box(c, size))
  }
  return mergeMeshData(plates)
}

// ---- Parts -----------------------------------------------------------------

function caseFrame(): MeshData {
  const parts: MeshData[] = [
    box([0, WALL / 2, 0], [HALF_D * 2, WALL, HALF_W * 2]), // floor
    box([0, TOP - WALL / 2, 0], [HALF_D * 2, WALL, HALF_W * 2]), // roof
    box([-HALF_D + WALL / 2, TOP / 2, 0], [WALL, TOP, HALF_W * 2]), // rear panel
    box([0, TOP / 2, -HALF_W + WALL / 2], [HALF_D * 2, TOP, WALL]), // tray wall behind the board
    box([HALF_D - 0.0015, TOP / 2, 0], [0.003, TOP, HALF_W * 2]), // front bezel
  ]
  // Front bezel vent slats.
  for (let i = 0; i < 9; i++) parts.push(box([HALF_D + 0.0005, 0.06 + i * 0.042, 0], [0.004, 0.01, 0.19]))
  // Feet.
  for (const x of [-0.19, 0.19])
    for (const z of [-0.09, 0.09]) parts.push(box([x, -0.002, z], [0.05, 0.006, 0.03]))
  return mergeMeshData(parts)
}

function sidePanel(): MeshData {
  // Tempered glass, the view window onto the motherboard.
  return box([0, TOP / 2, HALF_W - 0.0008], [HALF_D * 2 - 0.01, TOP - 0.02, 0.002])
}

function psu(): MeshData {
  const body = box([-0.14, 0.045, 0], [0.15, 0.086, 0.14])
  const grille = fan([-0.14, 0.094, 0], 1, 0.058, 0.012)
  const rearPorts = box([-0.2165, 0.04, 0], [0.004, 0.02, 0.03])
  return mergeMeshData([body, grille, rearPorts])
}

function psuCables(): MeshData {
  return mergeMeshData([
    // 24-pin ATX to the board's right edge.
    cable(
      [
        [-0.09, 0.1, 0.03],
        [-0.02, 0.13, 0.0],
        [0.03, 0.16, -0.03],
        [0.07, 0.22, -0.06],
        [0.09, 0.26, -0.078],
        [0.092, 0.27, BOARD_TOP + 0.006],
      ],
      0.0055,
    ),
    // 8-pin CPU power.
    cable(
      [
        [-0.12, 0.1, -0.02],
        [-0.11, 0.2, -0.05],
        [-0.095, 0.3, -0.07],
        [-0.08, 0.4, -0.08],
        [-0.07, 0.42, BOARD_TOP + 0.006],
      ],
      0.0045,
    ),
  ])
}

function motherboard(): MeshData {
  const parts: MeshData[] = []
  // PCB.
  parts.push(
    box(
      [(BOARD_X0 + BOARD_X1) / 2, (BOARD_Y0 + BOARD_Y1) / 2, BOARD_Z],
      [BOARD_X1 - BOARD_X0, BOARD_Y1 - BOARD_Y0, BOARD_T],
    ),
  )

  // PCIe x16 and x1 slots (black, sit on the board face).
  parts.push(box([-0.135, PCIE_Y, BOARD_TOP + 0.004], [0.089, 0.005, 0.008]))
  parts.push(box([0.02, PCIE_Y, BOARD_TOP + 0.004], [0.025, 0.005, 0.008]))

  // Four DIMM slots (the populated ones are their own parts).
  for (const x of DIMM_X) parts.push(box([x, DIMM_Y, BOARD_TOP + 0.006], [0.0065, DIMM_LEN, 0.012]))

  // CPU socket frame.
  parts.push(box([SOCKET.x, SOCKET.y, BOARD_TOP + 0.0015], [0.0455, 0.0455, 0.003]))
  for (const dy of [-0.0226, 0.0226])
    parts.push(box([SOCKET.x, SOCKET.y + dy, BOARD_TOP + 0.0045], [0.0455, 0.004, 0.003]))
  for (const dx of [-0.0226, 0.0226])
    parts.push(box([SOCKET.x + dx, SOCKET.y, BOARD_TOP + 0.0045], [0.004, 0.0375, 0.003]))

  // CPU 8-pin power, ATX 24-pin and SATA ports on the right edge.
  parts.push(box([-0.07, 0.42, BOARD_TOP + 0.006], [0.02, 0.016, 0.012]))
  parts.push(box([0.092, 0.3, BOARD_TOP + 0.006], [0.008, 0.1, 0.012]))
  for (const y of [0.372, 0.384, 0.396, 0.408])
    parts.push(box([0.097, y, BOARD_TOP + 0.004], [0.012, 0.007, 0.008]))

  // Rear I/O stacks on the board edge: USB, LAN, audio, video.
  const io: [number, number, number][] = [
    [0.3, 0.02, 0.016],
    [0.325, 0.014, 0.016],
    [0.345, 0.016, 0.02],
    [0.37, 0.03, 0.028],
    [0.405, 0.012, 0.012],
  ]
  for (const [y, h, w] of io) parts.push(box([-0.211, y, BOARD_TOP + 0.007], [0.022, h, w]))

  // Electrolytic capacitors standing on the board around the socket.
  const caps: [number, number][] = [
    [-0.05, 0.27],
    [-0.035, 0.27],
    [-0.02, 0.27],
    [0, 0.27],
    [-0.05, 0.42],
    [-0.035, 0.42],
    [-0.02, 0.42],
    [0.02, 0.42],
  ]
  for (const [x, y] of caps) parts.push(cylinderMesh([x, y, BOARD_TOP + 0.0055], 0.0028, 0.011, 2, 14))

  // Chipset under its heatsink lives in the chipset part; small VRM chokes here.
  for (const [x, y] of [
    [-0.1, 0.31],
    [-0.075, 0.31],
  ] as [number, number][]) {
    parts.push(box([x, y, BOARD_TOP + 0.004], [0.012, 0.012, 0.008]))
  }
  return mergeMeshData(parts)
}

function ioShield(): MeshData {
  // Metal plate in the rear opening, just inside the rear panel.
  return box([-0.2215, 0.355, -0.07], [0.001, 0.15, 0.05])
}

function vrmHeatsink(): MeshData {
  const parts: MeshData[] = [box([-0.085, 0.36, BOARD_TOP + 0.001], [0.05, 0.07, 0.002])]
  for (let i = 0; i < 9; i++)
    parts.push(box([-0.085, 0.33 + i * 0.0075, BOARD_TOP + 0.008], [0.05, 0.0012, 0.012]))
  return mergeMeshData(parts)
}

function chipsetHeatsink(): MeshData {
  const parts: MeshData[] = [box([0.078, 0.2, BOARD_TOP + 0.002], [0.024, 0.024, 0.004])]
  for (let i = 0; i < 5; i++)
    parts.push(box([0.078 - 0.0096 + i * 0.0048, 0.2, BOARD_TOP + 0.009], [0.0012, 0.024, 0.012]))
  return mergeMeshData(parts)
}

function cpuSocket(): MeshData {
  // The socket frame is on the motherboard, so this part is the socket alone.
  return mergeMeshData([
    box([SOCKET.x, SOCKET.y, BOARD_TOP + 0.0015], [0.0455, 0.0455, 0.003]),
    ...[-0.0226, 0.0226].map((dy) =>
      box([SOCKET.x, SOCKET.y + dy, BOARD_TOP + 0.0045], [0.0455, 0.004, 0.003]),
    ),
    ...[-0.0226, 0.0226].map((dx) =>
      box([SOCKET.x + dx, SOCKET.y, BOARD_TOP + 0.0045], [0.004, 0.0375, 0.003]),
    ),
  ])
}

const IHS_Z = BOARD_TOP + 0.006 + 0.0014 // integrated heat spreader centre

function cpu(): MeshData {
  return box([SOCKET.x, SOCKET.y, IHS_Z], [0.0375, 0.0375, 0.0028])
}

const COOLER_X = SOCKET.x
const FIN_COUNT = 30
const FIN_SPACING = 0.0015
const FIN_Z_CENTER = IHS_Z + 0.0014 + 0.0025 + 0.0025 + 0.0575 // base sits on the IHS

function cpuCooler(): MeshData {
  const base = box([COOLER_X, SOCKET.y, IHS_Z + 0.0014 + 0.0025], [0.05, 0.05, 0.005])
  const fins = finStack([COOLER_X, SOCKET.y, FIN_Z_CENTER], FIN_COUNT, FIN_SPACING, [0, 0.085, 0.115], 0)
  // Four heat pipes run from the base up through the fins and poke out at the top.
  const pipes = [
    [-0.012, -0.012],
    [0.012, -0.012],
    [-0.012, 0.012],
    [0.012, 0.012],
  ].map(([dx, dy]) => cylinderMesh([COOLER_X + dx, SOCKET.y + dy, FIN_Z_CENTER + 0.005], 0.003, 0.125, 2, 16))
  return mergeMeshData([base, fins, ...pipes])
}

function cpuFan(): MeshData {
  // Blows across the fin stack, on the +x side, clear of the base plate.
  return fan(
    [COOLER_X + (FIN_COUNT * FIN_SPACING) / 2 + 0.0125 + 0.002, SOCKET.y, FIN_Z_CENTER],
    0,
    0.06,
    0.025,
  )
}

function dimm(x: number): MeshData {
  const spreader = box([x, DIMM_Y, BOARD_TOP + 0.012 + 0.0175], [0.0065, DIMM_LEN, 0.035])
  // Cooling ribs on the top edge of the heat spreader.
  const ribs = [-0.05, -0.02, 0.01, 0.04].map((dy) =>
    box([x, DIMM_Y + dy, BOARD_TOP + 0.012 + 0.035], [0.0075, 0.004, 0.003]),
  )
  return mergeMeshData([spreader, ...ribs])
}

function m2Ssd(): MeshData {
  return box([-0.13, 0.27, BOARD_TOP + 0.00175], [0.08, 0.022, 0.0035])
}

function gpu(): MeshData {
  const x0 = -0.2215
  const x1 = 0.0485
  const len = x1 - x0
  const xc = (x0 + x1) / 2
  const zc = -0.0307
  const parts: MeshData[] = [
    box([xc, 0.23, zc], [len, 0.0016, 0.106]), // PCB
    box([xc, 0.23, zc], [len, 0.036, 0.1]), // shroud
    box([-0.2215, 0.23, zc], [0.002, 0.04, 0.106]), // bracket, covers the rear edge of the card
    box([-0.02, 0.23, 0.028], [0.035, 0.014, 0.012]), // power connectors on the top edge
  ]
  for (const x of [-0.17, -0.09, -0.01]) parts.push(fan([x, 0.253, zc], 1, 0.038, 0.01))
  return mergeMeshData(parts)
}

function sataSsd(): MeshData {
  return box([0.1, 0.12, 0], [0.1, 0.007, 0.07])
}

function hdd(): MeshData {
  return box([0.1, 0.05, 0], [0.147, 0.026, 0.101])
}

function caseFan(x: number, y: number): MeshData {
  return fan([x, y, 0], 0, 0.06, 0.025)
}

// ---- Assemble ----------------------------------------------------------------

const SHAPES: { id: string; data: MeshData; maxTriangles: number }[] = [
  { id: 'case_frame', data: caseFrame(), maxTriangles: 60000 },
  { id: 'side_panel', data: sidePanel(), maxTriangles: 60000 },
  { id: 'psu', data: psu(), maxTriangles: 60000 },
  { id: 'psu_cables', data: psuCables(), maxTriangles: 60000 },
  { id: 'motherboard', data: motherboard(), maxTriangles: 60000 },
  { id: 'io_shield', data: ioShield(), maxTriangles: 60000 },
  { id: 'vrm_heatsink', data: vrmHeatsink(), maxTriangles: 60000 },
  { id: 'chipset_heatsink', data: chipsetHeatsink(), maxTriangles: 60000 },
  { id: 'cpu_socket', data: cpuSocket(), maxTriangles: 60000 },
  { id: 'cpu', data: cpu(), maxTriangles: 60000 },
  { id: 'cpu_cooler', data: cpuCooler(), maxTriangles: 60000 },
  { id: 'cpu_fan', data: cpuFan(), maxTriangles: 60000 },
  { id: 'ram_1', data: dimm(DIMM_X[1]), maxTriangles: 60000 },
  { id: 'ram_2', data: dimm(DIMM_X[2]), maxTriangles: 60000 },
  { id: 'm2_ssd', data: m2Ssd(), maxTriangles: 60000 },
  { id: 'gpu', data: gpu(), maxTriangles: 60000 },
  { id: 'sata_ssd', data: sataSsd(), maxTriangles: 60000 },
  { id: 'hdd', data: hdd(), maxTriangles: 60000 },
  { id: 'front_fan', data: caseFan(0.2, 0.25), maxTriangles: 60000 },
  { id: 'rear_fan', data: caseFan(-0.2315, 0.36), maxTriangles: 60000 },
]

async function main() {
  await mkdir('public/models', { recursive: true })
  const parts: OutputPart[] = SHAPES
  const all = mergeMeshData(parts.map((p) => p.data))
  const b = boundsOf(all.positions)
  const origin: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
  await writePartsGlb(FILE, 'computer', parts, origin)
}

await main()
