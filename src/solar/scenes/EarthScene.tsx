import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { DoubleSide, Vector3, type Group } from 'three'
import { useT } from '../../i18n'
import { usePanelShift } from '../../atoms/scenes/shared'
import { daysSinceJ2000, normalize, obliquity, planetPosition, scale, spin } from '../astro'
import { solarClock, useSolar } from '../solarStore'
import { Earth, Sun } from './Bodies'
import { createSunLight } from './materials'
import { Label, Stars } from './shared'
import { toThree, useSolarControls, useSolarTextures } from './three'

const EARTH_R = 0.46
const SUN_DISTANCE = 2.1
const ECLIPTIC = '#ffcf6b'
const EQUATOR = '#5ee7ff'

/** A circle of latitude on the unit Earth (local frame, y = pole). */
function circle(lat: number, r = 1.004, n = 128): Vector3[] {
  const phi = (lat * Math.PI) / 180
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = (k / n) * Math.PI * 2
    return new Vector3(Math.cos(a) * Math.cos(phi) * r, Math.sin(phi) * r, Math.sin(a) * Math.cos(phi) * r)
  })
}

/** Earth lit by the real Sun direction, with its tilted axis, equator and the ecliptic plane. */
export function EarthScene() {
  const t = useT()
  const { latitudes, sunLeft } = useSolar()
  const shift = usePanelShift()
  const { stars } = useSolarTextures(['stars'] as const)
  const sun = useMemo(() => createSunLight(), [])
  const liveSun = useRef(sun)
  useEffect(() => {
    liveSun.current = sun
  }, [sun])
  const controls = useSolarControls((c) => {
    c.pitch = 0.16
    c.minZoom = 0.55
    c.maxZoom = 4.5
  })
  const view = useRef<Group>(null)
  const sky = useRef<Group>(null)
  const sunGroup = useRef<Group>(null)
  const yaw = useRef<number | null>(null)
  const sunDir = useMemo(() => new Vector3(), [])

  const lines = useMemo(
    () => ({
      equator: circle(0),
      tropics: [circle(23.44), circle(-23.44)],
      polar: [circle(66.56), circle(-66.56)],
      ecliptic: circle(0, 1.5 / EARTH_R),
      equatorPlane: circle(0, 2.4),
    }),
    [],
  )

  // The angle between Earth's axis and the ecliptic pole: the obliquity.
  const arc = useMemo(() => {
    const d = daysSinceJ2000(solarClock.ms)
    const pole = toThree(spin('earth', d).pole)
    const up = new Vector3(0, 1, 0)
    const points = Array.from({ length: 33 }, (_, k) =>
      up
        .clone()
        .lerp(pole, k / 32)
        .normalize()
        .multiplyScalar(1.05),
    )
    return { points, mid: points[16].clone().multiplyScalar(1.08), angle: obliquity(d), pole }
  }, [])

  useFrame((_, dt) => {
    const sun = liveSun.current
    const d = daysSinceJ2000(solarClock.ms)
    const v = view.current
    if (!v) return
    // Sun seen from Earth: the opposite of Earth's heliocentric position.
    toThree(normalize(scale(planetPosition('earth', d), -1)), sunDir)
    sunGroup.current?.position.copy(sunDir).multiplyScalar(SUN_DISTANCE)
    const k = 1 - Math.exp(-dt * 4)
    // Keep the Sun on the left so the seasons read the same all year.
    const target = controls.yaw + (sunLeft ? Math.PI - Math.atan2(-sunDir.z, sunDir.x) : 0)
    yaw.current = yaw.current === null ? target : yaw.current + wrap(target - yaw.current) * k
    v.rotation.set(controls.pitch, yaw.current, 0)
    sky.current?.rotation.copy(v.rotation)
    v.position.x += (shift - v.position.x) * k
    v.scale.setScalar(v.scale.x + (controls.zoom - v.scale.x) * k)
    v.updateMatrixWorld()
    sun.uDirectional.value = 1
    sun.uSunDir.value.copy(sunDir).transformDirection(v.matrixWorld)
  })

  return (
    <>
      <group ref={sky}>
        <Stars map={stars} />
      </group>
      <group ref={view}>
        <group ref={sunGroup} scale={0.13}>
          <Sun glow={4} />
          <Label position={[0, 1.6, 0]} color={ECLIPTIC}>
            {t('solar.earth.sun')}
          </Label>
        </group>

        {/* Ecliptic: the plane of Earth's orbit, and its pole. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
          <circleGeometry args={[1.5, 96]} />
          <meshBasicMaterial
            color={ECLIPTIC}
            transparent
            opacity={0.07}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <Line
          points={lines.ecliptic.map((p) => p.clone().multiplyScalar(EARTH_R))}
          color={ECLIPTIC}
          lineWidth={1}
          transparent
          opacity={0.6}
        />
        <Line
          points={[
            [0, -1.15, 0],
            [0, 1.15, 0],
          ]}
          color={ECLIPTIC}
          lineWidth={1}
          dashed
          dashSize={0.05}
          gapSize={0.04}
        />
        <Label position={[1.5, 0.02, 0]} color={ECLIPTIC}>
          {t('solar.earth.eclipticPlane')}
        </Label>
        <Line points={arc.points} color="#ffffff" lineWidth={1.5} />
        <Label position={arc.mid.toArray()} color="#ffffff">
          {arc.angle.toFixed(2)}°
        </Label>

        <group scale={EARTH_R}>
          <Earth sun={sun}>
            <Line
              points={[
                [0, -2.5, 0],
                [0, 2.5, 0],
              ]}
              color={EQUATOR}
              lineWidth={2}
            />
            <Line
              points={lines.equatorPlane}
              color={EQUATOR}
              lineWidth={1}
              transparent
              opacity={0.45}
              dashed
              dashSize={0.06}
              gapSize={0.05}
            />
            {latitudes && (
              <>
                <Line points={lines.equator} color={EQUATOR} lineWidth={1.2} transparent opacity={0.9} />
                {lines.tropics.map((p, i) => (
                  <Line key={i} points={p} color="#ffb347" lineWidth={1} transparent opacity={0.8} />
                ))}
                {lines.polar.map((p, i) => (
                  <Line key={i} points={p} color="#b8d8ff" lineWidth={1} transparent opacity={0.8} />
                ))}
              </>
            )}
            <Label position={[0, 2.55, 0]} color={EQUATOR}>
              {t('solar.earth.axis')}
            </Label>
          </Earth>
        </group>
      </group>
    </>
  )
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
