import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type Group } from 'three'
import { useTx } from '../../i18n'
import { usePanelShift } from '../../atoms/scenes/shared'
import {
  daysSinceJ2000,
  length,
  moonPosition,
  normalize,
  orbitAt,
  orbitPoint,
  planetPosition,
  scale,
  type BodyId,
  type PlanetId,
  type Vec3,
} from '../astro'
import { BODIES, PLANETS } from '../bodies'
import { solarClock, useSolar } from '../solarStore'
import { Body, Earth, Sun } from './Bodies'
import { createSunLight } from './materials'
import { Label, Stars } from './shared'
import { toThree, useSolarControls, useSolarTextures } from './three'

// The real system is too big to show at once: distances are square-rooted and
// bodies enlarged. Directions, inclinations and orbit shapes stay true.
const SUN_RADIUS = 1.15
const distance = (au: number) => 4 * Math.sqrt(au)
const bodyRadius = (id: BodyId) => 0.16 * Math.sqrt(BODIES[id].radiusKm / BODIES.earth.radiusKm)
/** Fits Neptune's orbit (≈22 units) in the view. */
const FIT = 1.3 / 22.5

/** Compressed position: same direction, distance square-rooted. */
function systemPosition(p: Vec3): Vec3 {
  const r = length(p)
  return r === 0 ? p : scale(p, distance(r) / r)
}

function OrbitLine({ planet }: { planet: PlanetId }) {
  const points = useMemo(() => {
    const o = orbitAt(planet, daysSinceJ2000(solarClock.ms))
    return Array.from({ length: 361 }, (_, k) =>
      toThree(systemPosition(orbitPoint(o, (k / 360) * Math.PI * 2))),
    )
  }, [planet])
  return <Line points={points} color={BODIES[planet].color} lineWidth={1} transparent opacity={0.35} />
}

const tmp = new Vector3()

export function SystemScene() {
  const tx = useTx()
  const { orbits, focus } = useSolar()
  const shift = usePanelShift()
  const { stars } = useSolarTextures(['stars'] as const)
  const sun = useMemo(() => createSunLight(), [])
  const liveSun = useRef(sun)
  useEffect(() => {
    liveSun.current = sun
  }, [sun])
  const controls = useSolarControls((c) => {
    c.minZoom = 0.6
    c.maxZoom = 60
  })
  const view = useRef<Group>(null)
  const sky = useRef<Group>(null)
  const content = useRef<Group>(null)
  const sunGroup = useRef<Group>(null)
  const moonGroup = useRef<Group>(null)
  const groups = useRef<Partial<Record<BodyId, Group | null>>>({})
  const center = useRef(new Vector3())

  // Selecting a body zooms to it.
  useEffect(() => {
    controls.setZoom(focus === 'sun' ? 1 : Math.min(controls.maxZoom, 0.22 / (bodyRadius(focus) * FIT)))
  }, [focus, controls])

  useFrame((_, dt) => {
    const sun = liveSun.current
    const d = daysSinceJ2000(solarClock.ms)
    const v = view.current
    const c = content.current
    if (!v || !c) return
    for (const id of PLANETS) {
      const g = groups.current[id]
      if (!g) continue
      toThree(systemPosition(planetPosition(id, d)), g.position)
      g.scale.setScalar(bodyRadius(id))
    }
    // The Moon, pulled in close to Earth so it can be seen at all.
    const earth = groups.current.earth
    if (earth && moonGroup.current) {
      toThree(scale(normalize(moonPosition(d)), 0.42), moonGroup.current.position).add(earth.position)
      moonGroup.current.scale.setScalar(0.05)
    }
    sunGroup.current?.scale.setScalar(SUN_RADIUS)

    const k = 1 - Math.exp(-dt * 4)
    const target =
      groups.current[focus as PlanetId]?.position ?? (focus === 'moon' ? moonGroup.current?.position : null)
    center.current.lerp(target ?? tmp.set(0, 0, 0), k)
    const s = FIT * controls.zoom
    v.position.x += (shift - v.position.x) * k
    v.rotation.set(controls.pitch, controls.yaw, 0)
    sky.current?.rotation.copy(v.rotation)
    v.scale.setScalar(v.scale.x + (s - v.scale.x) * k)
    c.position.copy(center.current).negate()

    sunGroup.current?.getWorldPosition(sun.uSunPos.value)
    // Zooming deep into Earth opens the Earth & Sun view.
    if (focus === 'earth' && controls.zoom >= controls.maxZoom * 0.98) useSolar.getState().setView('earth')
  })

  const select = (id: BodyId) => () =>
    useSolar.getState().set({ focus: useSolar.getState().focus === id ? 'sun' : id })

  return (
    <>
      <group ref={sky}>
        <Stars map={stars} />
      </group>
      <group ref={view} scale={FIT}>
        <group ref={content}>
          <group ref={(g) => void (g && controls.onTap(g, select('sun')))}>
            <Sun ref={sunGroup} />
          </group>
          {orbits && PLANETS.map((p) => <OrbitLine key={p} planet={p} />)}
          {PLANETS.map((id) => (
            <group key={id} ref={(g) => void ((groups.current[id] = g), g && controls.onTap(g, select(id)))}>
              {id === 'earth' ? <Earth sun={sun} /> : <Body id={id} sun={sun} />}
              <Label position={[0, 1.4, 0]} color={BODIES[id].color}>
                {tx(`solar.body.${id}`)}
              </Label>
            </group>
          ))}
          <group ref={(g) => void ((moonGroup.current = g), g && controls.onTap(g, select('moon')))}>
            <Body id="moon" sun={sun} />
          </group>
        </group>
      </group>
    </>
  )
}
