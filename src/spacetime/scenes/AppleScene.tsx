import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Line as ThreeLine,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Group,
} from 'three'
import { useT } from '../../i18n'
import { appleAt, DIAGRAM_C, DROP_HEIGHT } from '../apple'
import { appleClock, appleG, appleTime, useSpacetime } from '../spacetimeStore'
import { Apple, Lawn, Tree } from './appleModels'
import { aimArrow, useViewControls } from './controls'
import { Arrow, Stage, Tag } from './shared'

/** Scene units per metre, the same on both diagram axes so angles stay true. */
const S = 0.2
const APPLE_R = 0.045
const GROUND_Y = -0.45
/** Height 0 for the apple's centre, in the scene and on the diagram. */
const Y0 = GROUND_Y + APPLE_R
const APPLE_X = -1.15
/** The diagram: its left edge, and where "now" sits (the past scrolls off to the left). */
const X_LEFT = -0.72
const X_NOW = 0.98
const TOP = Y0 + (DROP_HEIGHT + 0.45) * S
/** Arrow length per m/s, so the spacetime arrow (length c) is 0.24 units long. */
const K = 0.02
const RIBBON = 0.05
const MAX = 4096

const TIME_COLOR = '#ffb347'
const SPACE_COLOR = '#5ee7ff'

const v = new Vector3()
const o = new Vector3()

/**
 * The apple and its worldline. Left: the apple under its tree. Right: a
 * space–propertime diagram (height up, cτ across, on equal scales) drawn as a
 * thin slab, with the apple's spacetime arrow and its time and space parts.
 */
export function AppleScene() {
  const t = useT()
  const { gScale, slowMo, set } = useSpacetime()
  const turned = useSpacetime((s) => s.apple.angle > 0.02)
  const controls = useViewControls((c) => {
    c.pitch = 0.08
    c.yaw = -0.18
    c.minZoom = 0.6
    c.maxZoom = 3
  })
  /** Worldline history: (cτ, height) pairs, oldest first. */
  const history = useRef({ data: new Float32Array(MAX * 2), n: 0, ctau: 0, epoch: -1 })
  const live = useRef({ gScale, slowMo })
  useEffect(() => {
    live.current = { gScale, slowMo }
  }, [gScale, slowMo])

  const apple = useRef<Group>(null)
  const link = useRef<Group>(null)
  const total = useRef<Group>(null)
  const timePart = useRef<Group>(null)
  const spacePart = useRef<Group>(null)
  const fallArrow = useRef<Group>(null)
  const thetaTag = useRef<Group>(null)
  const mirror = useRef(0)

  // The worldline (a bright line), the slab it sweeps (a ribbon) and the scrolling cτ grid.
  const parts = useMemo(() => {
    const line = new BufferGeometry()
    line.setAttribute('position', new BufferAttribute(new Float32Array(MAX * 3), 3))
    const ribbon = new BufferGeometry()
    ribbon.setAttribute('position', new BufferAttribute(new Float32Array(MAX * 6), 3))
    const index = new Uint32Array(MAX * 6)
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2
      index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6)
    }
    ribbon.setIndex(new BufferAttribute(index, 1))
    const grid = new BufferGeometry()
    grid.setAttribute('position', new BufferAttribute(new Float32Array(64 * 6), 3))
    const arc = new BufferGeometry()
    arc.setAttribute('position', new BufferAttribute(new Float32Array(25 * 3), 3))
    const out = {
      line: new ThreeLine(line, new LineBasicMaterial({ color: '#ffffff', toneMapped: false })),
      ribbon: new Mesh(
        ribbon,
        new MeshBasicMaterial({
          color: '#ff6b5a',
          transparent: true,
          opacity: 0.32,
          side: DoubleSide,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
      grid: new LineSegments(
        grid,
        new LineBasicMaterial({ color: TIME_COLOR, transparent: true, opacity: 0.22, toneMapped: false }),
      ),
      arc: new ThreeLine(arc, new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })),
    }
    // Their bounds change every frame.
    for (const p of Object.values(out)) p.frustumCulled = false
    return out
  }, [])
  useEffect(
    () => () =>
      Object.values(parts).forEach((p) => {
        p.geometry.dispose()
        p.material.dispose()
      }),
    [parts],
  )
  const liveParts = useRef(parts)
  useEffect(() => {
    liveParts.current = parts
  }, [parts])

  // Tap the apple to drop it.
  useEffect(() => {
    const g = apple.current
    return g ? controls.onTap(g, () => useSpacetime.getState().drop()) : undefined
  }, [controls])

  useFrame((_, dt) => {
    const { gScale, slowMo } = live.current
    const step = Math.min(dt, 0.1) * (slowMo ? 0.25 : 1)
    appleClock.now += step
    const h = history.current
    const parts = liveParts.current
    if (h.epoch !== appleClock.epoch) {
      h.epoch = appleClock.epoch
      h.n = 0
      h.ctau = 0
    }
    const a = appleAt(appleTime(), DROP_HEIGHT, appleG(gScale), DIAGRAM_C)
    // Proper time runs at cos θ of lab time: the part of the arrow along the time axis.
    h.ctau += DIAGRAM_C * step * Math.cos(a.angle)
    if (h.n === MAX) {
      h.data.copyWithin(0, MAX, MAX * 2)
      h.n = MAX / 2
    }
    h.data[h.n * 2] = h.ctau
    h.data[h.n * 2 + 1] = a.height
    h.n++

    const y = Y0 + a.height * S
    apple.current?.position.set(APPLE_X, y, 0)
    link.current?.position.setY(y)

    // Worldline: x = now − (cτ_now − cτ)·S. Skip what has scrolled off the left edge.
    let first = 0
    while (first < h.n - 1 && X_NOW - (h.ctau - h.data[first * 2 + 2]) * S < X_LEFT) first++
    const count = h.n - first
    const lp = parts.line.geometry.getAttribute('position') as BufferAttribute
    const rp = parts.ribbon.geometry.getAttribute('position') as BufferAttribute
    for (let i = 0; i < count; i++) {
      const j = first + i
      const x = Math.max(X_LEFT, X_NOW - (h.ctau - h.data[j * 2]) * S)
      const yy = Y0 + h.data[j * 2 + 1] * S
      lp.setXYZ(i, x, yy, 0)
      rp.setXYZ(i * 2, x, yy, -RIBBON)
      rp.setXYZ(i * 2 + 1, x, yy, RIBBON)
    }
    lp.needsUpdate = rp.needsUpdate = true
    parts.line.geometry.setDrawRange(0, count)
    parts.ribbon.geometry.setDrawRange(0, Math.max(0, count - 1) * 6)

    // Vertical grid lines every metre of cτ, scrolling with time.
    const gp = parts.grid.geometry.getAttribute('position') as BufferAttribute
    let lines = 0
    for (let m = Math.ceil(h.ctau - (X_NOW - X_LEFT) / S); m <= h.ctau && lines < 64; m++) {
      const x = X_NOW - (h.ctau - m) * S
      gp.setXYZ(lines * 2, x, Y0 - 0.04, 0)
      gp.setXYZ(lines * 2 + 1, x, TOP, 0)
      lines++
    }
    gp.needsUpdate = true
    parts.grid.geometry.setDrawRange(0, lines * 2)

    // The spacetime arrow (length c) and its parts along time and along space.
    o.set(X_NOW, y, 0)
    aimArrow(total.current, o, v.set(a.timeSpeed * K, -a.spaceSpeed * K, 0), 0.006)
    aimArrow(timePart.current, o, v.set(a.timeSpeed * K, 0, 0), 0.0045)
    aimArrow(spacePart.current, o, v.set(0, -a.spaceSpeed * K, 0), 0.0045)
    aimArrow(fallArrow.current, o.set(APPLE_X, y - APPLE_R, 0), v.set(0, -a.spaceSpeed * K, 0), 0.0045)
    const ap = parts.arc.geometry.getAttribute('position') as BufferAttribute
    for (let i = 0; i <= 24; i++) {
      const th = (-a.angle * i) / 24
      ap.setXYZ(i, X_NOW + Math.cos(th) * 0.09, y + Math.sin(th) * 0.09, 0.001)
    }
    ap.needsUpdate = true
    parts.arc.visible = a.angle > 0.02
    thetaTag.current?.position.set(X_NOW + 0.1, y - 0.04, 0)

    mirror.current += dt
    if (mirror.current > 0.12) {
      mirror.current = 0
      set({ apple: a })
    }
  })

  const gridH = useMemo(
    () =>
      Array.from({ length: DROP_HEIGHT + 1 }, (_, m) => [
        [X_LEFT, Y0 + m * S, 0] as [number, number, number],
        [X_NOW + 0.3, Y0 + m * S, 0] as [number, number, number],
      ]),
    [],
  )

  return (
    <Stage controls={controls}>
      {/* The apple's world. */}
      <group position={[APPLE_X - 0.3, GROUND_Y, 0]}>
        <Tree height={0.75} tip={[0.3, Y0 + DROP_HEIGHT * S + APPLE_R * 1.05 - GROUND_Y]} />
      </group>
      <group position={[APPLE_X - 0.12, GROUND_Y, 0]}>
        <Lawn radius={0.42} />
      </group>
      <group ref={apple} position={[APPLE_X, Y0 + DROP_HEIGHT * S, 0]} scale={APPLE_R}>
        <Apple />
      </group>
      <Arrow ref={fallArrow} color={SPACE_COLOR} />
      {Array.from({ length: DROP_HEIGHT + 1 }, (_, m) => (
        <Tag key={m} position={[APPLE_X + 0.12, Y0 + m * S, 0]} color="#9fb3c8">
          {m} m
        </Tag>
      ))}
      <Line
        points={[
          [APPLE_X + 0.1, Y0, 0],
          [APPLE_X + 0.1, Y0 + DROP_HEIGHT * S, 0],
        ]}
        color="#9fb3c8"
        lineWidth={1}
        transparent
        opacity={0.5}
      />
      {/* Dashed link: the apple's height read across onto the diagram. */}
      <group ref={link}>
        <Line
          points={[
            [APPLE_X + 0.06, 0, 0],
            [X_NOW, 0, 0],
          ]}
          color="#ffffff"
          lineWidth={1}
          dashed
          dashSize={0.02}
          gapSize={0.02}
          transparent
          opacity={0.35}
        />
      </group>

      {/* The diagram, as a slab of glass. */}
      <mesh position={[(X_LEFT + X_NOW + 0.36) / 2, (Y0 - 0.14 + TOP + 0.04) / 2, -RIBBON - 0.03]}>
        <boxGeometry args={[X_NOW + 0.42 - X_LEFT, TOP - Y0 + 0.22, 0.02]} />
        <meshPhysicalMaterial
          color="#08182a"
          transparent
          opacity={0.55}
          roughness={0.15}
          metalness={0}
          clearcoat={1}
          depthWrite={false}
        />
      </mesh>
      {gridH.map((pts, m) => (
        <Line key={m} points={pts} color={SPACE_COLOR} lineWidth={1} transparent opacity={0.16} />
      ))}
      <primitive object={parts.grid} />
      <primitive object={parts.ribbon} />
      <primitive object={parts.line} />
      <primitive object={parts.arc} />
      <Line
        points={[
          [X_LEFT, Y0 - 0.06, 0],
          [X_NOW + 0.34, Y0 - 0.06, 0],
        ]}
        color={TIME_COLOR}
        lineWidth={1.5}
      />
      <Line
        points={[
          [X_LEFT, Y0 - 0.06, 0],
          [X_LEFT, TOP, 0],
        ]}
        color={SPACE_COLOR}
        lineWidth={1.5}
      />
      <Tag position={[X_LEFT + 0.55, Y0 - 0.075, 0]} color={TIME_COLOR}>
        {t('spacetime.apple.axisTime')} →
      </Tag>
      <Tag position={[X_LEFT + 0.02, TOP + 0.02, 0]} color={SPACE_COLOR}>
        ↑ {t('spacetime.apple.axisHeight')}
      </Tag>
      <Arrow ref={timePart} color={TIME_COLOR} opacity={0.9} />
      <Arrow ref={spacePart} color={SPACE_COLOR} opacity={0.9} />
      <Arrow ref={total} color="#ffffff" />
      <group ref={thetaTag}>{turned && <Tag color="#ffffff">θ</Tag>}</group>
    </Stage>
  )
}
