import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type Ref } from 'react'
import {
  AdditiveBlending,
  Matrix4,
  SphereGeometry,
  Vector3,
  type Group,
  type Mesh,
  type Object3D,
} from 'three'
import { daysSinceJ2000, spin, type BodyId } from '../astro'
import { BODIES, SATURN_RINGS } from '../bodies'
import { solarClock } from '../solarStore'
import {
  createAtmosphereMaterial,
  createBodyMaterial,
  createCloudMaterial,
  createEarthLocal,
  createEarthMaterial,
  createGlowTexture,
  createRingMaterial,
  createSunMaterial,
  type SunLight,
} from './materials'
import { orient, useSolarTextures } from './three'

const sphere = new SphereGeometry(1, 96, 48)
const fineSphere = new SphereGeometry(1, 192, 96)

const now = () => daysSinceJ2000(solarClock.ms)

/** Something that can cast a shadow on a body: its world position and true radius in world units. */
export interface Occluder {
  object: () => Object3D | null
  radius: () => number
}

const tmp = new Vector3()
const scaleTmp = new Vector3()

export function Sun({ ref, glow = 3.2 }: { ref?: Ref<Group>; glow?: number }) {
  const { sun } = useSolarTextures(['sun'] as const)
  const material = useMemo(() => createSunMaterial(sun), [sun])
  const corona = useMemo(() => createGlowTexture('rgba(255,236,190,0.9)', 'rgba(255,170,80,0.22)'), [])
  const mesh = useRef<Mesh>(null)
  useEffect(() => () => (material.dispose(), corona.dispose()), [material, corona])
  useFrame(() => mesh.current && orient(mesh.current, spin('sun', now())))
  return (
    <group ref={ref}>
      <mesh ref={mesh} geometry={sphere} material={material} />
      <sprite scale={glow} renderOrder={2}>
        <spriteMaterial
          map={corona}
          blending={AdditiveBlending}
          depthWrite={false}
          transparent
          toneMapped={false}
        />
      </sprite>
    </group>
  )
}

/** A planet or the Moon: unit sphere oriented to its real spin axis, scaled by the parent group. */
export function Body({
  id,
  sun,
  ref,
  occluder,
}: {
  id: Exclude<BodyId, 'sun' | 'earth'>
  sun: SunLight
  ref?: Ref<Group>
  occluder?: Occluder
}) {
  const info = BODIES[id]
  const maps = useSolarTextures([info.texture] as const)
  const material = useMemo(
    () =>
      createBodyMaterial(maps[info.texture], sun, { atmosphere: info.atmosphere, regolith: info.regolith }),
    [maps, info, sun],
  )
  const mesh = useRef<Mesh>(null)
  useEffect(() => () => material.dispose(), [material])
  const live = useRef(material)
  useEffect(() => {
    live.current = material
  }, [material])
  useFrame(() => {
    const m = mesh.current
    const material = live.current
    if (!m) return
    orient(m, spin(id, now()))
    const o = occluder?.object()
    material.uniforms.uOccOn.value = o ? 1 : 0
    if (o) {
      o.getWorldPosition(material.uniforms.uOccPos.value)
      material.uniforms.uOccR.value = occluder!.radius()
    }
  })
  return (
    <group ref={ref}>
      <mesh ref={mesh} geometry={id === 'moon' ? fineSphere : sphere} material={material} />
      {id === 'saturn' && <SaturnRings sun={sun} />}
    </group>
  )
}

function SaturnRings({ sun }: { sun: SunLight }) {
  const maps = useSolarTextures(['saturn-ring'] as const)
  const material = useMemo(
    () => createRingMaterial(maps['saturn-ring'], sun, SATURN_RINGS.inner, SATURN_RINGS.outer),
    [maps, sun],
  )
  const mesh = useRef<Mesh>(null)
  useEffect(() => () => material.dispose(), [material])
  const live = useRef(material)
  useEffect(() => {
    live.current = material
  }, [material])
  useFrame(() => {
    const m = mesh.current
    const material = live.current
    if (!m?.parent) return
    // The rings lie in Saturn's equator plane.
    orient(m, spin('saturn', now()))
    m.rotateX(-Math.PI / 2)
    m.parent.getWorldPosition(material.uniforms.uPlanet.value)
    material.uniforms.uPlanetR.value = m.parent.getWorldScale(scaleTmp).x
  })
  return (
    <mesh ref={mesh} material={material} renderOrder={1}>
      <ringGeometry args={[SATURN_RINGS.inner, SATURN_RINGS.outer, 256, 1]} />
    </mesh>
  )
}

const inverse = new Matrix4()
const EARTH_MAPS = ['earth-day', 'earth-night', 'earth-normal', 'earth-ocean', 'earth-clouds'] as const

/**
 * The Earth: day and night maps, relief, oceans, clouds and atmosphere, all
 * lit in the planet's own frame. The parent group positions and scales it.
 */
export function Earth({
  sun,
  ref,
  occluder,
  children,
}: {
  sun: SunLight
  ref?: Ref<Group>
  occluder?: Occluder
  children?: React.ReactNode
}) {
  const t = useSolarTextures(EARTH_MAPS)
  const local = useMemo(() => createEarthLocal(), [])
  const materials = useMemo(
    () => ({
      surface: createEarthMaterial(
        {
          day: t['earth-day'],
          night: t['earth-night'],
          normal: t['earth-normal'],
          ocean: t['earth-ocean'],
          clouds: t['earth-clouds'],
        },
        local,
      ),
      clouds: createCloudMaterial(t['earth-clouds'], local),
      atmosphere: createAtmosphereMaterial(local, 1.03),
    }),
    [t, local],
  )
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])
  const spinner = useRef<Group>(null)
  const live = useRef(local)
  useEffect(() => {
    live.current = local
  }, [local])

  useFrame(({ camera }, dt) => {
    const s = spinner.current
    const local = live.current
    if (!s) return
    orient(s, spin('earth', now()))
    s.updateWorldMatrix(true, false)
    inverse.copy(s.matrixWorld).invert()
    // Sun direction in the Earth's frame.
    if (sun.uDirectional.value > 0.5) tmp.copy(sun.uSunDir.value)
    else tmp.copy(sun.uSunPos.value).sub(s.getWorldPosition(scaleTmp))
    local.uSunLocal.value.copy(tmp).transformDirection(inverse)
    local.uCamLocal.value.copy(camera.position).applyMatrix4(inverse)
    // Clouds drift slowly east relative to the ground (not real weather).
    local.uCloudShift.value =
      (local.uCloudShift.value +
        dt * 0.0006 * Math.min(solarClock.rate / 3600, 4) * (solarClock.playing ? 1 : 0)) %
      1
    const o = occluder?.object()
    local.uOccOn.value = o ? 1 : 0
    if (o) {
      o.getWorldPosition(local.uOccPos.value).applyMatrix4(inverse)
      local.uOccR.value = occluder!.radius() / s.getWorldScale(scaleTmp).x
    }
  })

  return (
    <group ref={ref}>
      <group ref={spinner}>
        <mesh geometry={fineSphere} material={materials.surface} />
        <mesh geometry={sphere} material={materials.clouds} scale={1.006} renderOrder={1} />
        <mesh geometry={sphere} material={materials.atmosphere} scale={1.03} renderOrder={2} />
        {children}
      </group>
    </group>
  )
}
