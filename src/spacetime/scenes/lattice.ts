// The inflowing lattice of space (three.js helpers, no components here).
//
// In the river model space flows radially inward with dr/dt = −c√(rs/r), so
// u = r^{3/2} drops at the same rate everywhere. A lattice made of nested
// shells spaced evenly in u is therefore carried into itself by the flow: one
// number (the phase) slides every shell inward, and when it wraps each shell
// sits exactly where the next one was. The flow never jumps.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  EdgesGeometry,
  IcosahedronGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'

/** Shell arcs are split this many times so they read as curved. */
const ARC_STEPS = 6

/** Unit directions and edges of a geodesic sphere (icosahedron, detail 1: 42 points, 120 edges). */
function geodesicSphere(): { dirs: Vector3[]; edges: [number, number][] } {
  const edges = new EdgesGeometry(new IcosahedronGeometry(1, 1), 1)
  const pos = edges.getAttribute('position')
  const dirs: Vector3[] = []
  const index = (v: Vector3) => {
    let i = dirs.findIndex((d) => d.distanceToSquared(v) < 1e-6)
    if (i < 0) i = dirs.push(v.clone().normalize()) - 1
    return i
  }
  const list: [number, number][] = []
  const a = new Vector3()
  const b = new Vector3()
  for (let i = 0; i < pos.count; i += 2) {
    list.push([index(a.fromBufferAttribute(pos, i)), index(b.fromBufferAttribute(pos, i + 1))])
  }
  edges.dispose()
  return { dirs, edges: list }
}

/**
 * Line segments for `shells` nested geodesic spheres joined by radial spokes.
 * Each vertex carries its direction and shell number; the shader places it.
 */
export function createLatticeGeometry(shells: number): BufferGeometry {
  const { dirs, edges } = geodesicSphere()
  const dir: number[] = []
  const shell: number[] = []
  const tmp = new Vector3()
  const push = (v: Vector3, k: number) => {
    dir.push(v.x, v.y, v.z)
    shell.push(k)
  }
  for (let k = 0; k < shells; k++) {
    for (const [i, j] of edges) {
      for (let s = 0; s < ARC_STEPS; s++) {
        push(tmp.lerpVectors(dirs[i], dirs[j], s / ARC_STEPS).normalize(), k)
        push(tmp.lerpVectors(dirs[i], dirs[j], (s + 1) / ARC_STEPS).normalize(), k)
      }
    }
    if (k + 1 < shells) {
      for (const d of dirs) {
        push(d, k)
        push(d, k + 1)
      }
    }
  }
  const g = new BufferGeometry()
  // Real positions come from the shader; this attribute only keeps three.js happy.
  g.setAttribute('position', new BufferAttribute(new Float32Array(dir), 3))
  g.setAttribute('aDir', new BufferAttribute(new Float32Array(dir), 3))
  g.setAttribute('aShell', new BufferAttribute(new Float32Array(shell), 1))
  return g
}

/** Random directions and starting depths for the dust that drifts in with the flow. */
export function createDustGeometry(count: number): BufferGeometry {
  const dir = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const z = Math.random() * 2 - 1
    const a = Math.random() * Math.PI * 2
    const s = Math.sqrt(1 - z * z)
    dir.set([s * Math.cos(a), z, s * Math.sin(a)], i * 3)
    seed[i] = Math.random()
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(dir.slice(), 3))
  g.setAttribute('aDir', new BufferAttribute(dir, 3))
  g.setAttribute('aShell', new BufferAttribute(seed, 1))
  return g
}

export interface FlowUniforms {
  /** How many shell spacings the flow has moved, kept in [0, shells). */
  uPhase: { value: number }
  /** u = r^{3/2} at the innermost shell, and the spacing between shells. */
  uU0: { value: number }
  uDu: { value: number }
  /** Body radius, outer radius and Schwarzschild radius, scene units. */
  uR0: { value: number }
  uRMax: { value: number }
  uRs: { value: number }
  uOpacity: { value: number }
  uFar: { value: Color }
  uNear: { value: Color }
}

export const createFlowUniforms = (): FlowUniforms => ({
  uPhase: { value: 0 },
  uU0: { value: 0.1 },
  uDu: { value: 0.16 },
  uR0: { value: 0.24 },
  uRMax: { value: 1.2 },
  uRs: { value: 0.02 },
  uOpacity: { value: 1 },
  uFar: { value: new Color('#5ee7ff') },
  uNear: { value: new Color('#ffb347') },
})

const placement = /* glsl */ `
  attribute vec3 aDir;
  attribute float aShell;
  uniform float uPhase;
  uniform float uU0;
  uniform float uDu;
  uniform float uR0;
  uniform float uRMax;
  uniform float uRs;
  uniform float uOpacity;
  uniform vec3 uFar;
  uniform vec3 uNear;
  varying vec3 vColor;
  varying float vAlpha;
  // Colour by how slowly a clock held here ticks (1 = as slow as at the surface).
  void shade(float r) {
    float lag = 1.0 - sqrt(max(0.0, 1.0 - uRs / max(r, 1e-4)));
    float lagSurface = 1.0 - sqrt(max(0.0, 1.0 - uRs / uR0));
    vColor = mix(uFar, uNear, clamp(lag / max(lagSurface, 1e-6), 0.0, 1.0));
    vAlpha = uOpacity * smoothstep(uR0 * 1.01, uR0 * 1.3, r) * (1.0 - smoothstep(uRMax * 0.5, uRMax, r));
  }
`

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor * vAlpha, vAlpha);
  }
`

export function createLatticeMaterial(u: FlowUniforms): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...u },
    vertexShader: /* glsl */ `
      ${placement}
      void main() {
        float u = uU0 + (aShell + 1.0 - fract(uPhase)) * uDu;
        float r = pow(max(u, 0.0), 2.0 / 3.0);
        shade(r);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(aDir * r, 1.0);
      }
    `,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

/** Dust grains: each rides the flow at its own depth and loops round when it reaches the surface. */
export function createDustMaterial(u: FlowUniforms, shells: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...u, uShells: { value: shells }, uSize: { value: 0.022 }, uScale: { value: 400 } },
    vertexShader: /* glsl */ `
      ${placement}
      uniform float uShells;
      uniform float uSize;
      uniform float uScale;
      void main() {
        float u = uU0 + fract(aShell - uPhase / uShells) * uShells * uDu;
        float r = pow(max(u, 0.0), 2.0 / 3.0);
        shade(r);
        vec4 mv = modelViewMatrix * vec4(aDir * r, 1.0);
        gl_PointSize = max(1.5, uSize * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vAlpha;
        gl_FragColor = vec4(vColor * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}
