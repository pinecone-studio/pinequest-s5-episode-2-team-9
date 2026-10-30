import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  LineBasicMaterial,
  LineSegments,
  PlaneGeometry,
  Vector3,
  type Group,
  type Mesh,
} from 'three'
import { useT } from '../../i18n'
import { useSpacetime } from '../spacetimeStore'
import { MassBody } from './MassBody'
import { aimArrow, useViewControls } from './controls'
import { Arrow, Stage, Tag } from './shared'

const HALF = 1.15
const BALL_R = 0.2
const LINES = 25
const STEPS = 90

/** Depth of the stretched sheet at distance r from the ball: a smooth well, flat at the edge. */
function depth(r: number, strength: number): number {
  const a = BALL_R * 1.1
  const edge = 1 / Math.hypot(HALF * 1.42, a)
  return -strength * a * (1 / Math.hypot(r, a) - edge)
}

function gridLines(strength: number): BufferGeometry {
  const pos: number[] = []
  for (let i = 0; i < LINES; i++) {
    const c = -HALF + (2 * HALF * i) / (LINES - 1)
    for (let s = 0; s < STEPS; s++) {
      const a = -HALF + (2 * HALF * s) / STEPS
      const b = -HALF + (2 * HALF * (s + 1)) / STEPS
      pos.push(a, depth(Math.hypot(a, c), strength), c, b, depth(Math.hypot(b, c), strength), c)
      pos.push(c, depth(Math.hypot(c, a), strength), a, c, depth(Math.hypot(c, b), strength), b)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  return g
}

function surface(strength: number): PlaneGeometry {
  const g = new PlaneGeometry(HALF * 2, HALF * 2, 120, 120)
  g.rotateX(-Math.PI / 2)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) p.setY(i, depth(Math.hypot(p.getX(i), p.getZ(i)), strength))
  g.computeVertexNormals()
  return g
}

const down = new Vector3(0, -0.34, 0)
const from = new Vector3()

/**
 * The famous analogy, drawn so its flaws can be pointed at: a heavy ball
 * sitting on a 2D sheet, a marble rolling round the dip, and nothing about time.
 */
export function SheetScene() {
  const t = useT()
  const { body, massScale } = useSpacetime()
  const controls = useViewControls((c) => {
    c.pitch = 0.5
    c.yaw = -0.35
    c.minZoom = 0.5
    c.maxZoom = 3
  })
  const strength = 0.55 + 0.25 * Math.log2(massScale * 2)
  const geometry = useMemo(() => ({ lines: gridLines(strength), sheet: surface(strength) }), [strength])
  const lines = useMemo(
    () =>
      new LineSegments(
        geometry.lines,
        new LineBasicMaterial({ color: '#c9a6ff', transparent: true, opacity: 0.55, toneMapped: false }),
      ),
    [geometry],
  )
  useEffect(
    () => () => {
      geometry.lines.dispose()
      geometry.sheet.dispose()
      ;(lines.material as LineBasicMaterial).dispose()
    },
    [geometry, lines],
  )

  const marble = useRef<Mesh>(null)
  const pull = useRef<Group>(null)
  const orbit = useRef({ angle: 0, r: 0.9 })
  const live = useRef(strength)
  useEffect(() => {
    live.current = strength
  }, [strength])
  const ballY = depth(0, strength) + BALL_R * 0.92

  useFrame((_, dt) => {
    const s = live.current
    const o = orbit.current
    const step = Math.min(dt, 0.1)
    // Rolling round the dip, losing a little to friction: a toy, not an orbit.
    o.angle += step * 0.9 * Math.pow(0.9 / o.r, 1.2)
    o.r -= step * 0.035
    if (o.r < BALL_R * 1.5) o.r = 0.95
    marble.current?.position.set(Math.cos(o.angle) * o.r, depth(o.r, s) + 0.035, Math.sin(o.angle) * o.r)
    aimArrow(pull.current, from.set(0, depth(0, s) - 0.02, 0), down, 0.01)
  })

  return (
    <Stage controls={controls} scale={0.8}>
      <group position={[0, -0.05, 0]}>
        <mesh geometry={geometry.sheet}>
          <meshStandardMaterial
            color="#6b4fa8"
            transparent
            opacity={0.2}
            roughness={0.85}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <primitive object={lines} />
        <group position={[0, ballY, 0]} scale={BALL_R}>
          <MassBody id={body} />
        </group>
        <mesh ref={marble}>
          <sphereGeometry args={[0.035, 32, 16]} />
          <meshStandardMaterial color="#d8dde6" metalness={0.6} roughness={0.25} />
        </mesh>
        <Arrow ref={pull} color="#ff5d6c" />
        <Tag position={[0.06, ballY + BALL_R * 1.1, 0]} color="#ffcf6b">
          <b>1</b> {t('spacetime.sheet.tagOn')}
        </Tag>
        <Tag position={[0.04, depth(0, strength) - 0.3, 0]} color="#ff5d6c">
          <b>2</b> {t('spacetime.sheet.tagPull')}
        </Tag>
        <Tag position={[HALF * 0.55, 0.04, -HALF]} color="#c9a6ff">
          <b>3</b> {t('spacetime.sheet.tagTime')}
        </Tag>
      </group>
    </Stage>
  )
}
