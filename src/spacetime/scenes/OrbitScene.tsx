import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Line as ThreeLine,
  ShaderMaterial,
  type Group,
  type Mesh,
} from 'three'
import { useT } from '../../i18n'
import { boundOrbit, incomingRay, trace, type Trace } from '../geodesic'
import { useSpacetime } from '../spacetimeStore'
import { useViewControls } from './controls'
import { Stage, Tag } from './shared'

const M = 1
/** Scene units per M. */
const SC = 1.25 / 40
const ECC = 0.4
const RAY_X0 = 46
const IMPACT = [1.5, 3.5, 5, 5.4, 6.5, 9, 13, 19, 27, 36]
/** Light advances this many M per second; the planet's proper time this many M per second. */
const LIGHT_RATE = 26
const ORBIT_RATE = 90
const ORBITS = 6

/**
 * A line that lights up behind a moving head: the whole path faint, the
 * recent part bright, fading with distance (or time) behind the head.
 */
function createTrailMaterial(color: string, base: number, tail: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uHead: { value: 0 },
      uTail: { value: tail },
      uBase: { value: base },
      uColor: { value: new Color(color) },
    },
    vertexShader: /* glsl */ `
      attribute float aDist;
      varying float vDist;
      void main() {
        vDist = aDist;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uHead;
      uniform float uTail;
      uniform float uBase;
      uniform vec3 uColor;
      varying float vDist;
      void main() {
        float behind = uHead - vDist;
        float a = behind >= 0.0 ? uBase + (1.0 - uBase) * exp(-behind / uTail) : uBase * 0.5;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

/** A traced path in the orbital plane (x, −y → three's x, z), with its length or time along it. */
function pathLine(t: Trace, material: ShaderMaterial, byLength: boolean, step = 0): ThreeLine {
  const pos = new Float32Array(t.count * 3)
  const dist = new Float32Array(t.count)
  let d = 0
  for (let i = 0; i < t.count; i++) {
    const x = t.points[i * 2]
    const y = t.points[i * 2 + 1]
    pos.set([x * SC, 0, -y * SC], i * 3)
    if (i > 0) d += byLength ? Math.hypot(x - t.points[i * 2 - 2], y - t.points[i * 2 - 1]) : step
    dist[i] = d
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aDist', new BufferAttribute(dist, 1))
  const line = new ThreeLine(g, material)
  line.frustumCulled = false
  line.userData.length = d
  return line
}

function ring(r: number, n = 160): [number, number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [Math.cos(a) * r * SC, 0, Math.sin(a) * r * SC]
  })
}

/** Periapsis passages along a traced orbit: local minima of r, as indices. */
function periapses(t: Trace): number[] {
  const out: number[] = []
  const r = (i: number) => Math.hypot(t.points[i * 2], t.points[i * 2 + 1])
  for (let i = 1; i < t.count - 1; i++) if (r(i) < r(i - 1) && r(i) <= r(i + 1)) out.push(i)
  return out
}

/**
 * Geodesics around a black hole, computed from the exact Schwarzschild
 * equations: light rays bending (and the closest ones captured), and a
 * planet whose orbit does not close, so its ellipse turns a little each time.
 */
export function OrbitScene() {
  const t = useT()
  const { rays, orbit, newton, orbitSize } = useSpacetime()
  const controls = useViewControls((c) => {
    c.pitch = 0.62
    c.yaw = 0
    c.minZoom = 0.5
    c.maxZoom = 6
  })

  const light = useMemo(() => {
    const material = createTrailMaterial('#ffe7a8', 0.38, 20)
    const lines = IMPACT.flatMap((b) =>
      [b, -b].map((bb) => {
        const { start, L } = incomingRay(M, bb, RAY_X0)
        const tr = trace(start, { M, L, kappa: 0 }, { maxSteps: 8000, stepFrac: 0.01, rMax: RAY_X0 + 4 })
        return pathLine(tr, material, true)
      }),
    )
    const longest = Math.max(...lines.map((l) => l.userData.length as number))
    return { material, lines, longest }
  }, [])

  const paths = useMemo(() => {
    const H = 1
    const { start, L } = boundOrbit(M, orbitSize, ECC)
    const a = orbitSize / (1 - ECC * ECC)
    const period = 2 * Math.PI * Math.pow(a, 1.5)
    const steps = Math.ceil((ORBITS * period) / H)
    const gr = trace(start, { M, L, kappa: 1 }, { maxSteps: steps, fixedStep: H })
    // Newton's ellipse of the same size and shape (L² = Mp), for comparison.
    const nt = trace(
      start,
      { M, L: Math.sqrt(M * orbitSize), kappa: 1, relativistic: false },
      { maxSteps: steps, fixedStep: H },
    )
    return {
      gr,
      nt,
      grLine: pathLine(gr, createTrailMaterial('#5ee7ff', 0.3, period * 0.7), false, H),
      ntLine: pathLine(nt, createTrailMaterial('#c9a6ff', 0.35, period), false, H),
      peri: periapses(gr),
      duration: steps * H,
      step: H,
    }
  }, [orbitSize])

  useEffect(
    () => () => {
      light.material.dispose()
      light.lines.forEach((l) => l.geometry.dispose())
    },
    [light],
  )
  useEffect(
    () => () => {
      for (const l of [paths.grLine, paths.ntLine]) {
        l.geometry.dispose()
        ;(l.material as ShaderMaterial).dispose()
      }
    },
    [paths],
  )

  const clock = useRef({ light: 0, orbit: 0 })
  const planet = useRef<Mesh>(null)
  const ghost = useRef<Mesh>(null)
  const markers = useRef<(Group | null)[]>([])
  const live = useRef(paths)
  const liveLight = useRef(light)
  useEffect(() => {
    live.current = paths
    clock.current.orbit = 0
  }, [paths])
  useEffect(() => {
    liveLight.current = light
  }, [light])

  useFrame((_, dt) => {
    const c = clock.current
    const p = live.current
    const light = liveLight.current
    const step = Math.min(dt, 0.1)
    c.light = (c.light + step * LIGHT_RATE) % (light.longest + 30)
    light.material.uniforms.uHead.value = c.light
    c.orbit = (c.orbit + step * ORBIT_RATE) % p.duration
    for (const l of [p.grLine, p.ntLine]) (l.material as ShaderMaterial).uniforms.uHead.value = c.orbit
    const place = (m: Mesh | null, tr: Trace) => {
      if (!m) return
      const f = Math.min(tr.count - 1.001, c.orbit / p.step)
      const i = Math.floor(f)
      const k = f - i
      const x = tr.points[i * 2] * (1 - k) + tr.points[i * 2 + 2] * k
      const y = tr.points[i * 2 + 1] * (1 - k) + tr.points[i * 2 + 3] * k
      m.position.set(x * SC, 0, -y * SC)
    }
    place(planet.current, p.gr)
    place(ghost.current, p.nt)
    p.peri.forEach((idx, i) => {
      const g = markers.current[i]
      if (g) g.visible = idx * p.step <= c.orbit
    })
  })

  return (
    <Stage controls={controls}>
      {/* The hole: horizon at 2M, light's circular orbit at 3M, innermost stable orbit at 6M. */}
      <mesh>
        <sphereGeometry args={[2 * M * SC, 48, 24]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <Line points={ring(3)} color="#ffcf6b" lineWidth={1} dashed dashSize={0.008} gapSize={0.008} />
      <Line
        points={ring(6)}
        color="#5ee7ff"
        lineWidth={1}
        transparent
        opacity={0.35}
        dashed
        dashSize={0.01}
        gapSize={0.012}
      />
      {[10, 20, 30, 40].map((r) => (
        <Line key={r} points={ring(r)} color="#9fb3c8" lineWidth={1} transparent opacity={0.12} />
      ))}
      <Tag position={[3 * M * SC * 0.71, 0, 3 * M * SC * 0.71]} color="#ffcf6b">
        {t('spacetime.orbits.photonSphere')}
      </Tag>
      {rays && light.lines.map((l, i) => <primitive key={i} object={l} />)}
      {orbit && (
        <>
          <primitive object={paths.grLine} />
          <mesh ref={planet}>
            <sphereGeometry args={[0.022, 32, 16]} />
            <meshStandardMaterial color="#8fd3ff" emissive="#2a6f99" roughness={0.5} />
          </mesh>
          {paths.peri.map((idx, i) => (
            <group key={`${orbitSize}-${i}`} ref={(g) => void (markers.current[i] = g)} visible={false}>
              <Line
                points={[
                  [0, 0, 0],
                  [paths.gr.points[idx * 2] * SC * 1.35, 0, -paths.gr.points[idx * 2 + 1] * SC * 1.35],
                ]}
                color="#5ee7ff"
                lineWidth={1}
                transparent
                opacity={0.45}
              />
            </group>
          ))}
        </>
      )}
      {orbit && newton && (
        <>
          <primitive object={paths.ntLine} />
          <mesh ref={ghost}>
            <sphereGeometry args={[0.016, 24, 12]} />
            <meshBasicMaterial color="#c9a6ff" transparent opacity={0.8} />
          </mesh>
        </>
      )}
    </Stage>
  )
}
