import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, LineSegments, Points, Vector3, type Group } from 'three'
import { useLang } from '../../i18n'
import { infallSpeed, surfaceCompactness, timeDilation } from '../gravity'
import { useSpacetime } from '../spacetimeStore'
import {
  createDustGeometry,
  createDustMaterial,
  createFlowUniforms,
  createLatticeGeometry,
  createLatticeMaterial,
} from './lattice'
import { MassBody } from './MassBody'
import { useViewControls } from './controls'
import { Stage, Tag } from './shared'

/** Radius the central body is drawn at, and how far out the lattice reaches (scene units). */
export const BODY_R = 0.24
const OUTER_R = 1.25
const SHELLS = 8
/** The speed of light in the picture, scene units per second: sets how fast the river runs. */
const C_SCENE = 1
const FAR = new Color('#5ee7ff')
const NEAR = new Color('#ffb347')

/** Clocks held still at these multiples of the body's radius. The last one stands in for "far away". */
const CLOCK_RADII = [1.18, 1.85, 2.7, 3.7, 4.9]
const CLOCK_DIR = new Vector3(1, -0.6, 0.15).normalize()

const ticks = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2)

/** A clock face whose hand turns at the rate a clock held at radius r really ticks. */
function Clock({ r, rs, rSurface }: { r: number; rs: number; rSurface: number }) {
  const lang = useLang((s) => s.lang)
  const rate = timeDilation(rs / r)
  const lag = (1 - rate) / Math.max(1e-6, 1 - timeDilation(rs / rSurface))
  const color = useMemo(() => `#${FAR.clone().lerp(NEAR, Math.min(1, lag)).getHexString()}`, [lag])
  const hand = useRef<Group>(null)
  const live = useRef(rate)
  useEffect(() => {
    live.current = rate
  }, [rate])
  // One turn every four seconds for a clock far away.
  useFrame((_, dt) => {
    if (hand.current) hand.current.rotation.z -= Math.min(dt, 0.1) * live.current * (Math.PI / 2)
  })
  const fmt = (n: number, d: number) =>
    new Intl.NumberFormat(lang === 'mn' ? 'mn-MN' : 'en-US', {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(n)
  const p = CLOCK_DIR.clone().multiplyScalar(r)
  return (
    <group position={p}>
      <Billboard>
        <mesh>
          <circleGeometry args={[0.05, 40]} />
          <meshBasicMaterial color="#04101c" transparent opacity={0.7} depthWrite={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.047, 0.054, 48]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        {ticks.map((a, i) => (
          <mesh key={i} position={[Math.sin(a) * 0.04, Math.cos(a) * 0.04, 0.001]} rotation={[0, 0, -a]}>
            <planeGeometry args={[i % 3 === 0 ? 0.005 : 0.0028, i % 3 === 0 ? 0.012 : 0.007]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        ))}
        <group ref={hand} position={[0, 0, 0.002]}>
          <mesh position={[0, 0.018, 0]}>
            <planeGeometry args={[0.004, 0.038]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        </group>
        <mesh position={[0, 0, 0.003]}>
          <circleGeometry args={[0.005, 16]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      </Billboard>
      <Tag position={[0.06, -0.02, 0]} color={color}>
        ×{fmt(rate, 3)}
        <small>↓ {fmt(infallSpeed(rs / r), 2)} c</small>
      </Tag>
    </group>
  )
}

/**
 * Space as a river flowing into the mass at the local escape speed. Nested
 * shells of a 3D lattice drift inward and speed up as they go; clocks held at
 * fixed heights tick slower the deeper they sit.
 */
export function GridScene() {
  const { body, massScale, flow, clocks } = useSpacetime()
  const controls = useViewControls((c) => {
    c.pitch = 0.32
    c.yaw = -0.45
    c.minZoom = 0.5
    c.maxZoom = 3.5
  })
  const rs = surfaceCompactness(body, massScale).visual * BODY_R

  const uniforms = useMemo(() => {
    const u = createFlowUniforms()
    u.uR0.value = BODY_R
    u.uRMax.value = OUTER_R
    // Shells start just inside the surface and reach past the edge, evenly spaced in r^{3/2}.
    u.uU0.value = Math.pow(BODY_R * 0.98, 1.5)
    u.uDu.value = (Math.pow(OUTER_R * 1.02, 1.5) - u.uU0.value) / SHELLS
    u.uFar.value.copy(FAR)
    u.uNear.value.copy(NEAR)
    u.uOpacity.value = 0.6
    return u
  }, [])
  const lattice = useMemo(() => {
    const g = createLatticeGeometry(SHELLS + 1)
    const l = new LineSegments(g, createLatticeMaterial(uniforms))
    l.frustumCulled = false
    return l
  }, [uniforms])
  const dust = useMemo(() => {
    const p = new Points(createDustGeometry(900), createDustMaterial(uniforms, SHELLS))
    p.frustumCulled = false
    return p
  }, [uniforms])
  useEffect(
    () => () => {
      for (const o of [lattice, dust]) {
        o.geometry.dispose()
        ;(o.material as { dispose: () => void }).dispose()
      }
    },
    [lattice, dust],
  )

  const live = useRef({ rs, flow, uniforms })
  useEffect(() => {
    live.current = { rs, flow, uniforms }
  }, [rs, flow, uniforms])
  useFrame((_, dt) => {
    const { rs, flow, uniforms } = live.current
    uniforms.uRs.value = rs
    // du/dt = −(3/2)·c·√rs, the same everywhere: one phase moves the whole lattice.
    if (flow) {
      const shellsPerSecond = (1.5 * Math.sqrt(rs) * C_SCENE) / uniforms.uDu.value
      uniforms.uPhase.value = (uniforms.uPhase.value + Math.min(dt, 0.1) * shellsPerSecond) % SHELLS
    }
  })

  return (
    <Stage controls={controls} scale={0.85}>
      <group scale={BODY_R}>
        <MassBody id={body} />
      </group>
      <primitive object={lattice} />
      <primitive object={dust} />
      {clocks &&
        CLOCK_RADII.map((k) => <Clock key={k} r={k * BODY_R} rs={rs} rSurface={CLOCK_RADII[0] * BODY_R} />)}
    </Stage>
  )
}
