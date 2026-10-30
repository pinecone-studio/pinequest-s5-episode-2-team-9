// Geometry and materials shared by the electromagnetism scenes.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import type { Vec3 } from '../vec'

/**
 * A tube along a polyline, with per-point attributes `arc` (distance along the
 * line) and `strength` (0..1). Frames are parallel-transported, so the tube
 * never twists, and closed lines join without a seam.
 */
export function buildTube(
  points: Vec3[],
  radius: number,
  closed: boolean,
  strength?: number[],
  radial = 8,
): BufferGeometry {
  const pts = closed ? [...points, points[0]] : points
  const str = strength ? (closed ? [...strength, strength[0]] : strength) : null
  const n = pts.length
  const pos = new Float32Array(n * radial * 3)
  const nor = new Float32Array(n * radial * 3)
  const arc = new Float32Array(n * radial)
  const stre = new Float32Array(n * radial)
  const tangent = new Vector3()
  const normal = new Vector3()
  const binormal = new Vector3()
  const p = new Vector3()
  const a = new Vector3()
  const b = new Vector3()
  let s = 0
  for (let i = 0; i < n; i++) {
    const prev = pts[closed ? (i - 1 + n - 1) % (n - 1) : Math.max(0, i - 1)]
    const next = pts[closed ? (i + 1) % (n - 1) : Math.min(n - 1, i + 1)]
    a.fromArray(prev)
    b.fromArray(next)
    tangent.subVectors(b, a).normalize()
    if (i === 0) {
      // Any direction perpendicular to the first tangent starts the frame.
      normal.set(0, 1, 0)
      if (Math.abs(tangent.y) > 0.9) normal.set(1, 0, 0)
    }
    normal.addScaledVector(tangent, -normal.dot(tangent)).normalize()
    binormal.crossVectors(tangent, normal)
    p.fromArray(pts[i])
    if (i > 0) s += p.distanceTo(a.fromArray(pts[i - 1]))
    for (let j = 0; j < radial; j++) {
      const t = (j / radial) * Math.PI * 2
      const cx = Math.cos(t)
      const sy = Math.sin(t)
      const k = (i * radial + j) * 3
      const nx = normal.x * cx + binormal.x * sy
      const ny = normal.y * cx + binormal.y * sy
      const nz = normal.z * cx + binormal.z * sy
      nor[k] = nx
      nor[k + 1] = ny
      nor[k + 2] = nz
      pos[k] = p.x + nx * radius
      pos[k + 1] = p.y + ny * radius
      pos[k + 2] = p.z + nz * radius
      arc[i * radial + j] = s
      stre[i * radial + j] = str ? str[i] : 1
    }
  }
  const index: number[] = []
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a0 = i * radial + j
      const a1 = i * radial + ((j + 1) % radial)
      const b0 = a0 + radial
      const b1 = a1 + radial
      index.push(a0, b0, a1, a1, b0, b1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('normal', new BufferAttribute(nor, 3))
  g.setAttribute('arc', new BufferAttribute(arc, 1))
  g.setAttribute('strength', new BufferAttribute(stre, 1))
  g.setIndex(index)
  return g
}

/** Joins tubes into one geometry (same attributes), so a whole field draws in one call. */
export function mergeTubes(parts: BufferGeometry[]): BufferGeometry {
  const names = ['position', 'normal', 'arc', 'strength'] as const
  const total = parts.reduce((n, g) => n + g.getAttribute('position').count, 0)
  const merged = new BufferGeometry()
  for (const name of names) {
    const size = parts[0].getAttribute(name).itemSize
    const out = new Float32Array(total * size)
    let o = 0
    for (const g of parts) {
      const arr = g.getAttribute(name).array as Float32Array
      out.set(arr, o)
      o += arr.length
    }
    merged.setAttribute(name, new BufferAttribute(out, size))
  }
  const index: number[] = []
  let base = 0
  for (const g of parts) {
    const idx = g.getIndex()!.array
    for (let i = 0; i < idx.length; i++) index.push(idx[i] + base)
    base += g.getAttribute('position').count
  }
  merged.setIndex(index)
  for (const g of parts) g.dispose()
  return merged
}

/**
 * Glowing field-line material: brighter where the field is strong, with
 * pulses that travel along the field direction (uSpeed < 0 runs them backwards).
 */
export function createFlowMaterial(weak: string, strong: string): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 1 },
      uIntensity: { value: 1 },
      uOpacity: { value: 1 },
      uWeak: { value: new Color(weak) },
      uStrong: { value: new Color(strong) },
    },
    vertexShader: /* glsl */ `
      attribute float arc;
      attribute float strength;
      varying float vArc;
      varying float vStrength;
      varying float vRim;
      void main() {
        vArc = arc;
        vStrength = strength;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vRim = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSpeed;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform vec3 uWeak;
      uniform vec3 uStrong;
      varying float vArc;
      varying float vStrength;
      varying float vRim;
      void main() {
        float phase = fract(vArc * 3.0 - uTime * uSpeed);
        float pulse = pow(phase, 5.0);
        vec3 col = mix(uWeak, uStrong, vStrength);
        float core = 0.35 + 0.65 * vRim;
        float a = (0.28 + 0.55 * vStrength + pulse * 0.9) * core * uIntensity * uOpacity;
        gl_FragColor = vec4(col * a * (1.0 + pulse), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

const UP = new Vector3(0, 1, 0)
const shaftGeometry = new CylinderGeometry(1, 1, 1, 14).translate(0, 0.5, 0)
const headGeometry = new ConeGeometry(1, 1, 18).translate(0, 0.5, 0)

/** A 3D arrow (shaft + cone) that can be re-aimed every frame without allocating. */
export class Arrow extends Group {
  readonly shaft: Mesh
  readonly head: Mesh
  readonly material: MeshStandardMaterial
  private q = new Quaternion()
  private dir = new Vector3()
  private thickness: number

  constructor(color: string, thickness = 0.014) {
    super()
    this.thickness = thickness
    this.material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      metalness: 0.1,
      roughness: 0.35,
    })
    this.shaft = new Mesh(shaftGeometry, this.material)
    this.head = new Mesh(headGeometry, this.material)
    this.add(this.shaft, this.head)
  }

  /** Points the arrow from `origin` along `vec` with the given length (0 hides it). */
  aim(origin: Vector3 | Vec3, vec: Vector3 | Vec3, len: number) {
    if (Array.isArray(origin)) this.position.fromArray(origin)
    else this.position.copy(origin)
    if (Array.isArray(vec)) this.dir.fromArray(vec)
    else this.dir.copy(vec)
    const l = this.dir.length()
    this.visible = len > 1e-4 && l > 1e-9
    if (!this.visible) return
    this.dir.divideScalar(l)
    this.quaternion.copy(this.q.setFromUnitVectors(UP, this.dir))
    const head = Math.min(len * 0.45, this.thickness * 7)
    const r = this.thickness
    this.shaft.scale.set(r, Math.max(0, len - head), r)
    this.head.position.y = len - head
    this.head.scale.set(r * 2.6, head, r * 2.6)
  }

  dispose() {
    this.material.dispose()
  }
}
