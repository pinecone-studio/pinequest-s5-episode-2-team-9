import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Mesh, TorusGeometry, Vector3 } from 'three'
import { play } from '../../audio/sfx'
import { useAtom, type Particle } from '../atomStore'
import { shellFilling } from '../elements'
import type { AtomInteraction } from '../atomInteraction'
import { PARTICLE_COLORS, sphereGeometry, useBallMaterial, useHalfExtents, usePanelShift } from './shared'

const NUCLEON_R = 0.075
const SHELL_R = [0.5, 0.75, 1.0, 1.25]
const SHELL_TILT: [number, number][] = [
  [1.2, 0.2],
  [0.6, -0.5],
  [1.5, 0.9],
  [0.9, 1.6],
]
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/** Packs nucleons in a ball: positions for A nucleons (deterministic). */
function nucleonPositions(a: number): Vector3[] {
  const out: Vector3[] = []
  const radius = NUCLEON_R * 1.15 * Math.cbrt(a)
  for (let i = 0; i < a; i++) {
    const r = a === 1 ? 0 : radius * Math.cbrt((i + 0.5) / a)
    const y = 1 - (2 * (i + 0.5)) / a
    const ring = Math.sqrt(1 - y * y)
    const theta = GOLDEN * i
    out.push(new Vector3(Math.cos(theta) * ring * r, y * r, Math.sin(theta) * ring * r))
  }
  return out
}

/** Interleaves protons and neutrons so both are spread through the nucleus. */
function nucleonKinds(p: number, n: number): ('proton' | 'neutron')[] {
  const kinds: ('proton' | 'neutron')[] = []
  let ip = 0
  let inn = 0
  while (ip < p || inn < n) {
    if (ip < p && (inn >= n || ip / Math.max(1, p) <= inn / Math.max(1, n))) {
      kinds.push('proton')
      ip++
    } else {
      kinds.push('neutron')
      inn++
    }
  }
  return kinds
}

export function BuildScene({ ix }: { ix: AtomInteraction }) {
  const { protons, neutrons, electrons, add } = useAtom()
  const shift = usePanelShift()
  const { halfH } = useHalfExtents()
  const view = useRef<Group>(null)
  const nucleus = useRef<Group>(null)
  const shells = useRef<Group>(null)
  const carried = useRef<Mesh>(null)
  const carriedKind = useRef<Particle | null>(null)
  const atomCenter = useMemo(() => new Vector3(), [])

  const mats = {
    proton: useBallMaterial(PARTICLE_COLORS.proton),
    neutron: useBallMaterial(PARTICLE_COLORS.neutron),
    electron: useBallMaterial(PARTICLE_COLORS.electron, 0.5),
  }
  const ringMaterial = useBallMaterial('#5ee7ff', 0.05)
  const ringGeometries = useMemo(() => SHELL_R.map((r) => new TorusGeometry(r, 0.006, 6, 120)), [])
  useEffect(() => () => ringGeometries.forEach((g) => g.dispose()), [ringGeometries])

  const positions = useMemo(() => nucleonPositions(protons + neutrons), [protons, neutrons])
  const kinds = useMemo(() => nucleonKinds(protons, neutrons), [protons, neutrons])
  const filling = shellFilling(electrons)

  useEffect(() => {
    ix.configure(view.current, true)
  }, [ix])

  // Bins: tap to add one; drag out of a bin and drop on the atom to add.
  const binY = -halfH * 0.76
  const bins = (['proton', 'neutron', 'electron'] as const).map((kind, i) => ({
    kind,
    x: shift + 0.35 + (i - 1) * 0.6,
  }))
  const binRefs = useRef<(Mesh | null)[]>([])

  useEffect(() => {
    const offs: (() => void)[] = []
    const startCarry = (kind: Particle, at: Vector3) => {
      carriedKind.current = kind
      const m = carried.current
      if (m) {
        m.material = mats[kind]
        m.scale.setScalar(kind === 'electron' ? 0.05 : NUCLEON_R)
        m.position.copy(at)
        m.visible = true
      }
      play('pick')
    }
    const endCarry = (at: Vector3) => {
      const kind = carriedKind.current
      carriedKind.current = null
      if (carried.current) carried.current.visible = false
      view.current?.getWorldPosition(atomCenter)
      if (kind && at.distanceTo(atomCenter) < 1.5 * (view.current?.scale.x ?? 1)) {
        add(kind, 1)
        play('snap')
      }
    }
    bins.forEach(({ kind }, i) => {
      const object = binRefs.current[i]
      if (!object) return
      offs.push(
        ix.register({
          object,
          grab: (w) => startCarry(kind, w),
          move: (w) => carried.current?.position.copy(w),
          release: (w) => endCarry(w),
          // A tap on a bin (no drag) adds one particle directly.
          tap: () => {
            add(kind, 1)
            play('snap')
          },
        }),
      )
    })
    // Pull particles out of the atom to remove them.
    for (const [object, kind] of [
      [nucleus.current, 'nucleon'],
      [shells.current, 'electron'],
    ] as const) {
      if (!object) continue
      offs.push(
        ix.register({
          object,
          grab: (w) => {
            const s = useAtom.getState()
            const type: Particle =
              kind === 'electron'
                ? 'electron'
                : s.neutrons > 0 && s.neutrons >= s.protons
                  ? 'neutron'
                  : 'proton'
            if ((type === 'electron' ? s.electrons : type === 'proton' ? s.protons : s.neutrons) === 0)
              return false
            add(type, -1)
            startCarry(type, w)
          },
          move: (w) => carried.current?.position.copy(w),
          release: (w) => endCarry(w),
        }),
      )
    }
    return () => offs.forEach((off) => off())
    // Positions of bins depend on layout; re-register on change.
  }, [ix, add, shift, binY]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (nucleus.current) nucleus.current.rotation.y = t * 0.3
    if (shells.current) {
      shells.current.children.forEach((shell, s) => {
        shell.rotation.z = t * (0.9 - s * 0.15)
      })
    }
  })

  return (
    <>
      <group ref={view} position={[shift, 0.2, 0]}>
        <group ref={nucleus}>
          {positions.map((p, i) => (
            <mesh
              key={i}
              geometry={sphereGeometry}
              material={mats[kinds[i]]}
              position={p}
              scale={NUCLEON_R}
            />
          ))}
        </group>
        <group ref={shells}>
          {SHELL_R.map((r, s) => (
            <group key={s} rotation={[SHELL_TILT[s][0], SHELL_TILT[s][1], 0]}>
              <group>
                {s < filling.length &&
                  Array.from({ length: filling[s] }, (_, k) => {
                    const a = (k / filling[s]) * Math.PI * 2
                    return (
                      <mesh
                        key={k}
                        geometry={sphereGeometry}
                        material={mats.electron}
                        position={[Math.cos(a) * r, Math.sin(a) * r, 0]}
                        scale={0.045}
                      />
                    )
                  })}
              </group>
              <mesh
                geometry={ringGeometries[s]}
                material={ringMaterial}
                visible={s < Math.max(1, filling.length)}
              />
            </group>
          ))}
        </group>
      </group>

      {bins.map(({ kind, x }, i) => (
        <group key={kind} position={[x, binY, 0.3]}>
          <mesh
            ref={(m) => {
              binRefs.current[i] = m
            }}
            geometry={sphereGeometry}
            material={mats[kind]}
            scale={kind === 'electron' ? 0.06 : 0.085}
          />
          <mesh
            geometry={ringGeometries[0]}
            material={ringMaterial}
            scale={0.36}
            rotation={[Math.PI / 2.4, 0, 0]}
          />
        </group>
      ))}

      <mesh ref={carried} geometry={sphereGeometry} material={mats.proton} visible={false} />
    </>
  )
}
