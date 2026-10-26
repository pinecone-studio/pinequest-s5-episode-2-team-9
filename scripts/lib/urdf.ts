// Minimal URDF reader: links (visual meshes + origins), joints, forward kinematics.
// Only the plain-URDF parts of a xacro file are used; xacro macros/conditions are ignored.
import { XMLParser } from 'fast-xml-parser'

export type Mat4 = number[] // column-major 4x4

export interface UrdfVisual {
  mesh: string
  origin: Mat4
}

export interface UrdfLink {
  name: string
  visuals: UrdfVisual[]
}

export interface UrdfJoint {
  name: string
  type: string
  parent: string
  child: string
  origin: Mat4
  axis: [number, number, number]
}

export interface Urdf {
  links: Map<string, UrdfLink>
  joints: UrdfJoint[]
}

export const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return out
}

/** URDF origin: translation xyz, rotation rpy applied as Rz(yaw)·Ry(pitch)·Rx(roll). */
export function fromXyzRpy(xyz: number[], rpy: number[]): Mat4 {
  const [r, p, y] = rpy
  const [cr, sr, cp, sp, cy, sy] = [Math.cos(r), Math.sin(r), Math.cos(p), Math.sin(p), Math.cos(y), Math.sin(y)]
  return [
    cy * cp, sy * cp, -sp, 0,
    cy * sp * sr - sy * cr, sy * sp * sr + cy * cr, cp * sr, 0,
    cy * sp * cr + sy * sr, sy * sp * cr - cy * sr, cp * cr, 0,
    xyz[0], xyz[1], xyz[2], 1,
  ]
}

/** Rotation by `angle` around a unit axis. */
export function axisAngle(axis: number[], angle: number): Mat4 {
  const [x, y, z] = axis
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  return [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ]
}

const nums = (s: string | undefined, fallback: number[]) => (s ? s.trim().split(/\s+/).map(Number) : fallback)
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

interface XmlOrigin {
  '@_xyz'?: string
  '@_rpy'?: string
}

const originOf = (o: XmlOrigin | undefined) => fromXyzRpy(nums(o?.['@_xyz'], [0, 0, 0]), nums(o?.['@_rpy'], [0, 0, 0]))

export function parseUrdf(xml: string): Urdf {
  const parser = new XMLParser({ ignoreAttributes: false })
  const robot = parser.parse(xml).robot
  const links = new Map<string, UrdfLink>()
  for (const link of asArray<Record<string, unknown>>(robot.link)) {
    const visuals: UrdfVisual[] = []
    for (const v of asArray<Record<string, unknown>>(link.visual as never)) {
      const mesh = (v.geometry as { mesh?: { '@_filename'?: string } } | undefined)?.mesh?.['@_filename']
      if (mesh) visuals.push({ mesh: mesh.split('/').pop()!, origin: originOf(v.origin as XmlOrigin) })
    }
    links.set(link['@_name'] as string, { name: link['@_name'] as string, visuals })
  }
  const joints: UrdfJoint[] = asArray<Record<string, unknown>>(robot.joint).map((j) => ({
    name: j['@_name'] as string,
    type: j['@_type'] as string,
    parent: (j.parent as { '@_link': string })['@_link'],
    child: (j.child as { '@_link': string })['@_link'],
    origin: originOf(j.origin as XmlOrigin),
    axis: nums((j.axis as { '@_xyz'?: string } | undefined)?.['@_xyz'], [1, 0, 0]) as [number, number, number],
  }))
  return { links, joints }
}

/** World transform of every link for the given joint angles (radians). */
export function forwardKinematics(urdf: Urdf, root: string, angles: Record<string, number>): Map<string, Mat4> {
  const world = new Map<string, Mat4>([[root, identity()]])
  const visit = (parent: string) => {
    for (const j of urdf.joints.filter((joint) => joint.parent === parent)) {
      const motion = j.type === 'revolute' || j.type === 'continuous' ? axisAngle(j.axis, angles[j.name] ?? 0) : identity()
      world.set(j.child, multiply(multiply(world.get(parent)!, j.origin), motion))
      visit(j.child)
    }
  }
  visit(root)
  return world
}

/** Parses a binary STL into a flat triangle soup. */
export function parseBinaryStl(buf: Buffer): { positions: Float32Array; normals: Float32Array } {
  const count = buf.readUInt32LE(80)
  const positions = new Float32Array(count * 9)
  const normals = new Float32Array(count * 9)
  for (let i = 0; i < count; i++) {
    const o = 84 + i * 50
    const n = [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)]
    for (let v = 0; v < 3; v++) {
      for (let k = 0; k < 3; k++) {
        positions[i * 9 + v * 3 + k] = buf.readFloatLE(o + 12 + v * 12 + k * 4)
        normals[i * 9 + v * 3 + k] = n[k]
      }
    }
  }
  return { positions, normals }
}
