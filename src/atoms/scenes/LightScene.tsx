import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  TorusGeometry,
  Vector3,
} from 'three'
import { play } from '../../audio/sfx'
import { useAtom } from '../atomStore'
import type { AtomInteraction } from '../atomInteraction'
import { wavelengthToRgb } from '../spectrum'
import { sphereGeometry, useBallMaterial, usePanelShift } from './shared'

const LEVELS = 6
const levelRadius = (n: number) => 0.17 * Math.pow(n, 1.12)
const JUMP_S = 0.7
const HOLD_S = 1.4
const WAVE_POINTS = 90

interface Wave {
  line: Line
  born: number
  dir: Vector3
  start: Vector3
  inward: boolean
}

/** Bohr picture of hydrogen: level rings, the electron jumping, photons in and out. */
export function LightScene({ ix }: { ix: AtomInteraction }) {
  const shift = usePanelShift()
  const view = useRef<Group>(null)
  const electron = useRef<Mesh>(null)
  const waves = useRef<Wave[]>([])
  const lastPhoton = useRef(0)
  const anim = useRef({ angle: 0, jumpT: 0, from: 1, hold: 0 })
  const dragging = useRef(false)
  const ringMat = useBallMaterial('#5ee7ff', 0.04)
  const eMat = useBallMaterial('#5ee7ff', 0.7)
  const nMat = useBallMaterial('#ff5d6c', 0.6)
  const rings = useMemo(
    () => Array.from({ length: LEVELS }, (_, i) => new TorusGeometry(levelRadius(i + 1), 0.006, 6, 160)),
    [],
  )
  useEffect(() => () => rings.forEach((r) => r.dispose()), [rings])

  useEffect(() => {
    ix.configure(view.current, false)
    const object = electron.current
    if (!object) return
    return ix.register({
      object,
      grab: () => {
        if (useAtom.getState().target !== null) return false
        dragging.current = true
      },
      move: (w) => {
        const local = view.current!.worldToLocal(w.clone())
        object.position.copy(local)
      },
      release: () => {
        dragging.current = false
        const r = object.position.length()
        let best = 1
        for (let n = 1; n <= LEVELS; n++)
          if (Math.abs(levelRadius(n) - r) < Math.abs(levelRadius(best) - r)) best = n
        useAtom.getState().excite(best)
      },
    })
  }, [ix])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const now = state.clock.elapsedTime
    const s = useAtom.getState()
    const a = anim.current

    // New photons → spawn a wave packet.
    const fresh = s.photons.filter((p) => p.id > lastPhoton.current)
    for (const p of fresh) {
      lastPhoton.current = p.id
      const [r, g, b] = wavelengthToRgb(p.nm)
      const geo = new BufferGeometry()
      geo.setAttribute('position', new BufferAttribute(new Float32Array(WAVE_POINTS * 3), 3))
      const line = new Line(
        geo,
        new LineBasicMaterial({
          color: new Color(r, g, b),
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      )
      line.frustumCulled = false
      view.current?.add(line)
      const angle = Math.random() * Math.PI * 2
      const dir = new Vector3(Math.cos(angle), Math.sin(angle), 0)
      const start = electron.current ? electron.current.position.clone() : new Vector3()
      waves.current.push({ line, born: now, dir, start, inward: p.kind === 'absorbed' })
      play(p.kind === 'absorbed' ? 'pick' : 'snap')
    }

    // Electron motion: circle the current level; animate jumps between levels.
    if (!dragging.current && electron.current) {
      a.angle += dt * (1.6 / Math.pow(s.target ?? s.level, 1.2))
      let radius = levelRadius(s.level)
      if (s.target !== null) {
        a.jumpT += dt / JUMP_S
        const t = Math.min(1, a.jumpT)
        const e = t * t * (3 - 2 * t)
        radius = levelRadius(s.level) + (levelRadius(s.target) - levelRadius(s.level)) * e
        if (t >= 1) {
          a.jumpT = 0
          a.hold = 0
          s.settle()
        }
      } else if (s.level > 1) {
        a.hold += dt
        if (a.hold > HOLD_S) {
          a.hold = 0
          s.settle()
        }
      }
      electron.current.position.set(Math.cos(a.angle) * radius, Math.sin(a.angle) * radius, 0)
    }

    // Waves: a sine packet travelling out (emitted) or in (absorbed).
    waves.current = waves.current.filter((w) => {
      const age = now - w.born
      if (age > 1.6) {
        view.current?.remove(w.line)
        w.line.geometry.dispose()
        ;(w.line.material as LineBasicMaterial).dispose()
        return false
      }
      const attr = w.line.geometry.getAttribute('position') as BufferAttribute
      const travel = w.inward ? 2.6 * (1 - age / 0.7) : 0.2 + age * 2.2
      const perp = new Vector3(-w.dir.y, w.dir.x, 0)
      for (let i = 0; i < WAVE_POINTS; i++) {
        const u = i / (WAVE_POINTS - 1)
        const along = Math.max(0, travel - 0.6 + u * 0.6)
        const amp = 0.06 * Math.sin(u * Math.PI)
        const p = w.start
          .clone()
          .addScaledVector(w.dir, along)
          .addScaledVector(perp, Math.sin(u * 26 - age * 30) * amp)
        attr.setXYZ(i, p.x, p.y, p.z)
      }
      attr.needsUpdate = true
      ;(w.line.material as LineBasicMaterial).opacity = Math.min(1, 1.6 - age)
      return true
    })
  })

  return (
    <group ref={view} position={[shift, 0.1, 0]} rotation={[-0.35, 0, 0]}>
      <mesh geometry={sphereGeometry} material={nMat} scale={0.06} />
      {rings.map((g, i) => (
        <mesh key={i} geometry={g} material={ringMat} />
      ))}
      <mesh ref={electron} geometry={sphereGeometry} material={eMat} scale={0.055} />
    </group>
  )
}
