// Builds public/models/robot-dog.glb from the open-source Mini Pupper 2 CAD
// (MangDang, Apache-2.0): URDF + STL meshes, posed standing, plus servo motors
// and a battery modelled by us (the CAD has no separate meshes for them).
//
// Usage: npx tsx scripts/build-dog.ts
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import {
  boundsOf,
  boxMesh,
  cylinderMesh,
  indexSoup,
  mergeMeshData,
  transformPoint,
  type MeshData,
  type Vec3,
} from './lib/gltf'
import { writePartsGlb, type OutputPart } from './lib/output'
import { forwardKinematics, multiply, parseBinaryStl, parseUrdf } from './lib/urdf'

const CACHE = 'scripts/.cache/pupper'
const REPO = 'https://raw.githubusercontent.com/mangdangroboticsclub/mini_pupper_ros/HEAD'
const URDF_URL = `${REPO}/mini_pupper_description/urdf/mini_pupper_2/mini_pupper_description.urdf.xacro`
const MESH_URL = `${REPO}/mini_pupper_description/meshes/mini_pupper_2`

const LEGS = ['lf', 'rf', 'lb', 'rb'] as const
type Leg = (typeof LEGS)[number]

// Standing pose: thigh tilted back, shin forward (knee points backward), feet under the hips.
const HIP_PITCH = 0.75
const KNEE = -1.5

interface PartSpec {
  id: string
  links?: string[]
  extra?: () => MeshData
  maxTriangles: number
}

// Hip joint positions in the URDF base frame (metres, x forward, y left, z up).
const HIP: Record<Leg, Vec3> = {
  lf: [0.05, 0.0235, 0],
  rf: [0.05, -0.0235, 0],
  lb: [-0.066, 0.0235, 0],
  rb: [-0.066, -0.0235, 0],
}

/** One servo: body box plus the round output shaft on one face. */
function servo(center: Vec3, size: Vec3, shaftAxis: 0 | 1 | 2, shaftSign: 1 | -1): MeshData {
  const shaftCenter: Vec3 = [...center]
  shaftCenter[shaftAxis] += shaftSign * (size[shaftAxis] / 2 + 0.0015)
  return mergeMeshData([boxMesh(center, size), cylinderMesh(shaftCenter, 0.0032, 0.003, shaftAxis, 14)])
}

/** The three servos of one leg: abduction (in the body) and the coaxial hip + knee pair. */
function legServos(leg: Leg): MeshData {
  const [hx, hy] = HIP[leg]
  const side = hy > 0 ? 1 : -1
  const front = hx > 0 ? 1 : -1
  const abduction = servo([hx - front * 0.016, side * 0.014, 0.002], [0.024, 0.012, 0.022], 0, front as 1 | -1)
  const hipPitch = servo([hx + 0.004, side * 0.034, 0.004], [0.022, 0.011, 0.024], 1, side as 1 | -1)
  const knee = servo([hx + 0.004, side * 0.022, 0.004], [0.022, 0.011, 0.024], 1, side as 1 | -1)
  return mergeMeshData([abduction, hipPitch, knee])
}

const PARTS: PartSpec[] = [
  { id: 'frame', links: ['base_link'], maxTriangles: 6000 },
  { id: 'battery', extra: () => boxMesh([-0.008, 0, -0.014], [0.07, 0.03, 0.017]), maxTriangles: 100 },
  { id: 'controller_board', links: ['Board_PCB', 'Board_connectors_1', 'Board_connectors_2'], maxTriangles: 9000 },
  ...LEGS.map((leg) => ({ id: `servos_${leg}`, extra: () => legServos(leg), maxTriangles: 1000 })),
  ...LEGS.map((leg) => ({ id: `hip_${leg}`, links: [`${leg}1`, `${leg[0]}p${leg[1]}1`], maxTriangles: 2500 })),
  ...LEGS.map((leg) => ({ id: `upper_leg_${leg}`, links: [`${leg}2`, `${leg[0]}p${leg[1]}2`], maxTriangles: 1500 })),
  ...LEGS.map((leg) => ({ id: `lower_leg_${leg}`, links: [`${leg}3`, `${leg}foot`], maxTriangles: 3500 })),
  { id: 'lidar', links: ['lidar_link'], maxTriangles: 2000 },
  { id: 'front_plate', links: ['Body_front'], maxTriangles: 3000 },
  { id: 'side_shells', links: ['Shell_Side'], maxTriangles: 2500 },
]

const exists = (p: string) => stat(p).then(() => true, () => false)

async function cached(url: string, file: string): Promise<Buffer> {
  if (!(await exists(file))) {
    console.log(`Downloading ${url}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
    await writeFile(file, Buffer.from(await res.arrayBuffer()))
  }
  return readFile(file)
}

/** URDF (z-up, y-left) → app space (y-up, z toward the viewer: the dog's right side faces the camera). */
const toApp = (p: Vec3): Vec3 => [p[0], p[2], -p[1]]

function convert(data: MeshData): MeshData {
  const positions = new Float32Array(data.positions.length)
  const normals = new Float32Array(data.normals.length)
  for (let i = 0; i < positions.length; i += 3) {
    positions.set(toApp([data.positions[i], data.positions[i + 1], data.positions[i + 2]]), i)
    normals.set(toApp([data.normals[i], data.normals[i + 1], data.normals[i + 2]]), i)
  }
  return { ...data, positions, normals }
}

await mkdir(CACHE, { recursive: true })
await mkdir('public/models', { recursive: true })
const urdf = parseUrdf((await cached(URDF_URL, `${CACHE}/mini_pupper_2.urdf.xacro`)).toString('utf8'))
await cached(`${REPO}/LICENSE`, `${CACHE}/LICENSE`)

const angles: Record<string, number> = {}
for (const leg of LEGS) {
  angles[`${leg}1_${leg}2`] = HIP_PITCH
  angles[`${leg}2_${leg}3`] = KNEE
}
const world = forwardKinematics(urdf, 'base_link', angles)

async function linkMesh(name: string): Promise<MeshData> {
  const link = urdf.links.get(name)
  if (!link) throw new Error(`Link not found: ${name}`)
  const meshes: MeshData[] = []
  for (const visual of link.visuals) {
    const file = visual.mesh.replace(/\.STL$/, '.stl')
    const stl = parseBinaryStl(await cached(`${MESH_URL}/${file}`, `${CACHE}/${file}`))
    const m = multiply(world.get(name)!, visual.origin)
    const soup = new Float32Array(stl.positions.length)
    for (let i = 0; i < soup.length; i += 3) {
      soup.set(transformPoint(m, stl.positions[i], stl.positions[i + 1], stl.positions[i + 2]), i)
    }
    meshes.push(indexSoup(soup))
  }
  return mergeMeshData(meshes)
}

const parts: OutputPart[] = []
for (const spec of PARTS) {
  const meshes = spec.links ? await Promise.all(spec.links.map(linkMesh)) : []
  if (spec.extra) meshes.push(spec.extra())
  parts.push({ id: spec.id, data: convert(mergeMeshData(meshes)), maxTriangles: spec.maxTriangles })
}

const b = boundsOf(mergeMeshData(parts.map((p) => p.data)).positions)
const origin: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
await writePartsGlb('public/models/robot-dog.glb', 'robotDog', parts, origin)
