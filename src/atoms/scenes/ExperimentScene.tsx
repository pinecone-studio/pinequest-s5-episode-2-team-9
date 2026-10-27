import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry, Group, Points } from 'three'
import { useAtom, type SpinSetup } from '../atomStore'
import type { AtomInteraction } from '../atomInteraction'
import { mulberry32 } from '../orbitals'
import { runSpin, sampleLanding, type MagnetAxis } from '../quantumExperiments'
import { experimentStats } from '../experimentStats'
import { createGlowPointsMaterial, sphereGeometry, useBallMaterial, usePanelShift } from './shared'

const MAX_HITS = 5000
const FLIGHT = 120
const SCREEN_X = 1.7
const SOURCE_X = -2.1
const BARRIER_X = -0.4
const SCREEN_HALF = 1.15
/** Physical half-width of the screen (same units as the slit separation). */
const PHYS_HALF = 90

const SPIN_AXES: Record<SpinSetup, MagnetAxis[]> = {
  z: ['z'],
  zz: ['z', 'z'],
  zx: ['z', 'x'],
  zxz: ['z', 'x', 'z'],
}

interface Flyer {
  x0: number
  y0: number
  z0: number
  path: [number, number, number][]
  t: number
  /** Where it lands, or null if blocked. */
  land: [number, number, number] | null
}

export function ExperimentScene({ ix }: { ix: AtomInteraction }) {
  const { experiment, observed, slitSeparation, slitWavelength, rate, spinSetup, clearToken } = useAtom()
  const shift = usePanelShift()
  const view = useRef<Group>(null)
  const rand = useMemo(() => mulberry32(20261027), [])
  const flyers = useRef<Flyer[]>([])
  const spawnAcc = useRef(0)
  const hitCount = useRef(0)

  const hitMaterial = useMemo(() => createGlowPointsMaterial(0.03), [])
  const flyMaterial = useMemo(() => createGlowPointsMaterial(0.06), [])
  const wallMat = useBallMaterial('#5ee7ff', 0.08)
  const sourceMat = useBallMaterial('#ffd27a', 0.6)
  const northMat = useBallMaterial('#ff5d6c', 0.3)
  const southMat = useBallMaterial('#5aa8ff', 0.3)
  const detectorMat = useBallMaterial(observed ? '#ffd27a' : '#3f5266', 0.6)

  const hits = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(MAX_HITS * 3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(MAX_HITS * 3), 3))
    g.setAttribute('alpha', new BufferAttribute(new Float32Array(MAX_HITS), 1))
    g.setDrawRange(0, 0)
    const p = new Points(g, hitMaterial)
    p.frustumCulled = false
    return p
  }, [hitMaterial])

  const live = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(FLIGHT * 3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(FLIGHT * 3).fill(1), 3))
    g.setAttribute('alpha', new BufferAttribute(new Float32Array(FLIGHT).fill(1), 1))
    const p = new Points(g, flyMaterial)
    p.frustumCulled = false
    return p
  }, [flyMaterial])

  const boxes = useMemo(() => ({ slab: new BoxGeometry(1, 1, 1) }), [])
  useEffect(
    () => () => {
      hits.geometry.dispose()
      live.geometry.dispose()
      hitMaterial.dispose()
      flyMaterial.dispose()
      boxes.slab.dispose()
    },
    [hits, live, hitMaterial, flyMaterial, boxes],
  )

  // Reset results whenever the setup changes.
  useEffect(() => {
    hitCount.current = 0
    hits.geometry.setDrawRange(0, 0)
    flyers.current = []
    experimentStats.total = 0
    experimentStats.up = 0
    experimentStats.down = 0
  }, [experiment, observed, slitSeparation, slitWavelength, spinSetup, clearToken, hits])

  useEffect(() => {
    ix.configure(view.current, true)
  }, [ix])

  const axes = SPIN_AXES[spinSetup]
  const magnetX = (i: number) => -1.3 + (i + 0.5) * (2.3 / axes.length)

  const addHit = (x: number, y: number, z: number, color: [number, number, number]) => {
    const i = hitCount.current % MAX_HITS
    const g = hits.geometry
    ;(g.getAttribute('position') as BufferAttribute).setXYZ(i, x, y, z)
    ;(g.getAttribute('color') as BufferAttribute).setXYZ(i, ...color)
    ;(g.getAttribute('alpha') as BufferAttribute).setX(i, 0.9)
    g.getAttribute('position').needsUpdate = true
    g.getAttribute('color').needsUpdate = true
    g.getAttribute('alpha').needsUpdate = true
    hitCount.current++
    g.setDrawRange(0, Math.min(hitCount.current, MAX_HITS))
  }

  const spawn = () => {
    if (experiment === 'slit') {
      const setup = {
        wavelength: slitWavelength,
        separation: slitSeparation,
        width: 1.2,
        distance: 200,
        observed,
      }
      const xPhys = sampleLanding(setup, PHYS_HALF, rand)
      const y = (xPhys / PHYS_HALF) * SCREEN_HALF
      const slitY = 0.115 * (rand() < 0.5 ? 1 : -1)
      const z = (rand() - 0.5) * 0.5
      flyers.current.push({
        x0: SOURCE_X,
        y0: 0,
        z0: 0,
        path: [
          [BARRIER_X, observed ? slitY : 0, z * 0.3],
          [SCREEN_X, y, z],
        ],
        t: 0,
        land: [SCREEN_X, y, z],
      })
    } else {
      const run = runSpin(axes, rand)
      const path: [number, number, number][] = []
      let y = 0
      let z = 0
      run.outcomes.forEach((o, i) => {
        const after = magnetX(i) + 0.35
        if (axes[i] === 'z') y += o * 0.22
        else z += o * 0.22
        path.push([after, y, z])
      })
      const blocked = run.blockedAt !== null
      if (!blocked) path.push([SCREEN_X, y, z])
      flyers.current.push({ x0: SOURCE_X, y0: 0, z0: 0, path, t: 0, land: blocked ? null : [SCREEN_X, y, z] })
      experimentStats.total++
      if (!blocked) {
        if (run.outcomes[run.outcomes.length - 1] === 1) experimentStats.up++
        else experimentStats.down++
      }
    }
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    spawnAcc.current += dt * rate
    while (spawnAcc.current >= 1 && flyers.current.length < FLIGHT) {
      spawnAcc.current -= 1
      spawn()
    }
    const pos = live.geometry.getAttribute('position') as BufferAttribute
    const alpha = live.geometry.getAttribute('alpha') as BufferAttribute
    let i = 0
    flyers.current = flyers.current.filter((f) => {
      f.t += dt * 1.6
      const segs = f.path.length
      const total = Math.min(f.t, segs)
      const seg = Math.min(segs - 1, Math.floor(total))
      const u = total - seg
      const a = seg === 0 ? [f.x0, f.y0, f.z0] : f.path[seg - 1]
      const b = f.path[seg]
      const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
      if (f.t >= segs) {
        if (f.land)
          addHit(
            f.land[0],
            f.land[1],
            f.land[2],
            experiment === 'slit'
              ? [0.4, 0.95, 1]
              : f.land[1] + f.land[2] >= 0
                ? [1, 0.5, 0.55]
                : [0.4, 0.7, 1],
          )
        return false
      }
      if (i < FLIGHT) {
        pos.setXYZ(i, p[0], p[1], p[2])
        alpha.setX(i, 1)
        i++
      }
      return true
    })
    for (let k = i; k < FLIGHT; k++) alpha.setX(k, 0)
    pos.needsUpdate = true
    alpha.needsUpdate = true
  })

  return (
    <group ref={view} position={[shift, 0, 0]} rotation={[0.2, -0.62, 0]}>
      <group scale={0.58} position={[-0.15, 0, 0]}>
        <mesh geometry={sphereGeometry} material={sourceMat} position={[SOURCE_X, 0, 0]} scale={0.1} />
        {/* Screen */}
        <mesh
          geometry={boxes.slab}
          material={wallMat}
          position={[SCREEN_X + 0.02, 0, 0]}
          scale={[0.02, SCREEN_HALF * 2.2, 1.2]}
        />
        {experiment === 'slit' ? (
          <>
            {/* Barrier with two slits: three slabs. */}
            {[
              [0.62, 0.9],
              [0, 0.12],
              [-0.62, 0.9],
            ].map(([y, h], k) => (
              <mesh
                key={k}
                geometry={boxes.slab}
                material={wallMat}
                position={[BARRIER_X, y, 0]}
                scale={[0.04, h, 0.9]}
              />
            ))}
            <mesh
              geometry={sphereGeometry}
              material={detectorMat}
              position={[BARRIER_X - 0.25, 0.55, 0.3]}
              scale={0.06}
            />
          </>
        ) : (
          axes.map((axis, k) => (
            <group key={k} position={[magnetX(k), 0, 0]} rotation={[axis === 'x' ? Math.PI / 2 : 0, 0, 0]}>
              <mesh
                geometry={boxes.slab}
                material={northMat}
                position={[0, 0.32, 0]}
                scale={[0.5, 0.18, 0.3]}
              />
              <mesh
                geometry={boxes.slab}
                material={southMat}
                position={[0, -0.32, 0]}
                scale={[0.5, 0.12, 0.3]}
              />
            </group>
          ))
        )}
        <primitive object={hits} />
        <primitive object={live} />
      </group>
    </group>
  )
}
