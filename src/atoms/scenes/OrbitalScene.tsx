import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Points } from 'three'
import { useAtom } from '../atomStore'
import type { AtomInteraction } from '../atomInteraction'
import { sampleOrbital } from '../orbitals'
import { createGlowPointsMaterial, sphereGeometry, useBallMaterial, usePanelShift } from './shared'

const COUNT = 26000
const RADIUS = 1.1
const POSITIVE = [0.37, 0.91, 1]
const NEGATIVE = [0.75, 0.55, 1]

/** Probability cloud of the selected hydrogen orbital, coloured by the sign of ψ. */
export function OrbitalScene({ ix }: { ix: AtomInteraction }) {
  const orbital = useAtom((s) => s.orbital)
  const shift = usePanelShift()
  const view = useRef<Group>(null)
  const material = useMemo(() => createGlowPointsMaterial(0.035), [])
  const nucleus = useBallMaterial('#ff5d6c', 0.6)

  const points = useMemo(() => {
    const s = sampleOrbital(orbital, COUNT)
    const scale = RADIUS / Math.max(1, s.extent * 0.9)
    const pos = new Float32Array(COUNT * 3)
    const col = new Float32Array(COUNT * 3)
    const alpha = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      // Atomic units → scene; swap so the orbital's z axis points up on screen.
      pos[i * 3] = s.positions[i * 3] * scale
      pos[i * 3 + 1] = s.positions[i * 3 + 2] * scale
      pos[i * 3 + 2] = s.positions[i * 3 + 1] * scale
      const c = s.phase[i] > 0 ? POSITIVE : NEGATIVE
      col.set(c, i * 3)
      alpha[i] = 0.55
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('color', new BufferAttribute(col, 3))
    g.setAttribute('alpha', new BufferAttribute(alpha, 1))
    return new Points(g, material)
  }, [orbital, material])

  const axes = useMemo(() => {
    const g = new BufferGeometry()
    const L = RADIUS * 1.15
    g.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-L, 0, 0, L, 0, 0, 0, -L, 0, 0, L, 0, 0, 0, -L, 0, 0, L]), 3),
    )
    return new LineSegments(g, new LineBasicMaterial({ color: '#5ee7ff', transparent: true, opacity: 0.18 }))
  }, [])

  useEffect(() => () => points.geometry.dispose(), [points])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    ix.configure(view.current, true)
  }, [ix])

  return (
    <group ref={view} position={[shift, 0, 0]} rotation={[0.35, -0.5, 0]}>
      <primitive object={points} />
      <primitive object={axes} />
      <mesh geometry={sphereGeometry} material={nucleus} scale={0.03} />
    </group>
  )
}
