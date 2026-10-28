import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { DoubleSide, ShaderMaterial, Vector3, type Group } from 'three'
import { useT } from '../../i18n'
import { usePanelShift } from '../../atoms/scenes/shared'
import {
  daysSinceJ2000,
  EARTH_MOON_MASS_RATIO,
  EARTH_RADIUS_KM,
  moonNodeLongitude,
  moonPosition,
  MOON_RADIUS_KM,
  normalize,
  planetPosition,
  scale,
} from '../astro'
import { solarClock, useSolar } from '../solarStore'
import { Body, Earth, type Occluder } from './Bodies'
import { createSunLight } from './materials'
import { Label, Stars } from './shared'
import { toThree, useSolarControls, useSolarTextures } from './three'

/** View units per km: the Moon's mean distance fills about 1.15 units. */
const K = 1.15 / 384_400
/** Enlarges Earth and Moon so they can be seen; distances stay true. */
const ENLARGE = 5
const MOON_FRACTION = 1 / (EARTH_MOON_MASS_RATIO + 1)
const ORBIT = '#cfd6e6'
const ECLIPTIC = '#ffcf6b'
/** Earth's umbra: a cone about 1.38 million km long (Sun–Earth size ratio × 1 AU). */
const UMBRA_KM = 1_384_000

/**
 * Ocean tides, exaggerated: a shell stretched towards and away from the Moon,
 * plus the Sun's smaller (46%) stretch. Aligned they add up to spring tides.
 */
function createTideMaterial() {
  return new ShaderMaterial({
    uniforms: { uMoon: { value: new Vector3(1, 0, 0) }, uSun: { value: new Vector3(1, 0, 0) } },
    vertexShader: /* glsl */ `
      uniform vec3 uMoon;
      uniform vec3 uSun;
      varying float vH;
      void main() {
        vec3 n = normalize(position);
        float cm = dot(n, normalize(uMoon));
        float cs = dot(n, normalize(uSun));
        // Tide-raising potential: second Legendre polynomial of the angle to each body.
        float h = (1.5 * cm * cm - 0.5) + 0.46 * (1.5 * cs * cs - 0.5);
        vH = h;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(n * (1.08 + 0.16 * h), 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vH;
      void main() {
        float a = 0.12 + 0.3 * smoothstep(-0.5, 1.4, vH);
        gl_FragColor = vec4(vec3(0.35, 0.65, 1.0), a);
      }
    `,
    transparent: true,
    depthWrite: false,
  })
}

/** Earth and Moon at true distances around their barycentre, lit by the Sun. */
export function MoonScene() {
  const t = useT()
  const { trueScale, tides } = useSolar()
  const shift = usePanelShift()
  const { stars } = useSolarTextures(['stars'] as const)
  const sun = useMemo(() => createSunLight(), [])
  const liveSun = useRef(sun)
  useEffect(() => {
    liveSun.current = sun
  }, [sun])
  const tide = useMemo(() => createTideMaterial(), [])
  const liveTide = useRef(tide)
  useEffect(() => {
    liveTide.current = tide
  }, [tide])
  const controls = useSolarControls((c) => {
    c.pitch = 0.5
    c.minZoom = 0.5
    c.maxZoom = 12
  })
  const view = useRef<Group>(null)
  const sky = useRef<Group>(null)
  const earth = useRef<Group>(null)
  const moon = useRef<Group>(null)
  const tideMesh = useRef<Group>(null)
  const orbitLine = useRef<{ geometry: { setPositions: (p: number[]) => void } }>(null)
  const umbra = useRef<Group>(null)
  const nodeLine = useRef<Group>(null)
  const sunArrow = useRef<Group>(null)
  const sunDir = useMemo(() => new Vector3(), [])
  const v3 = useMemo(() => new Vector3(), [])
  const enlarge = trueScale ? 1 : ENLARGE

  // Shadows use the true radii whatever the drawing size, so eclipses happen at the right moments.
  const earthShadow = useMemo<Occluder>(
    () => ({ object: () => earth.current, radius: () => EARTH_RADIUS_KM * K * (view.current?.scale.x ?? 1) }),
    [],
  )
  const moonShadow = useMemo<Occluder>(
    () => ({ object: () => moon.current, radius: () => MOON_RADIUS_KM * K * (view.current?.scale.x ?? 1) }),
    [],
  )
  const orbitPoints = useMemo(() => Array.from({ length: 241 }, () => new Vector3()), [])

  useFrame((_, dt) => {
    const sun = liveSun.current
    const tide = liveTide.current
    const d = daysSinceJ2000(solarClock.ms)
    const v = view.current
    if (!v || !earth.current || !moon.current) return
    const m = moonPosition(d)
    // Both bodies circle the barycentre (the origin), 4,670 km from Earth's centre.
    toThree(scale(m, K * (1 - MOON_FRACTION)), moon.current.position)
    toThree(scale(m, -K * MOON_FRACTION), earth.current.position)
    earth.current.scale.setScalar(EARTH_RADIUS_KM * K * enlarge)
    moon.current.scale.setScalar(MOON_RADIUS_KM * K * enlarge)

    // The Moon's path over one month around now.
    for (let i = 0; i < orbitPoints.length; i++) {
      toThree(scale(moonPosition(d + ((i - 120) / 120) * 13.66), K), orbitPoints[i])
    }
    orbitLine.current?.geometry.setPositions(orbitPoints.flatMap((p) => [p.x, p.y, p.z]))

    toThree(normalize(scale(planetPosition('earth', d), -1)), sunDir)
    sunArrow.current?.position.copy(sunDir).multiplyScalar(1.45)
    sunArrow.current?.lookAt(v3.set(0, 0, 0))
    // Umbra points away from the Sun, starting at Earth.
    if (umbra.current) {
      umbra.current.position.copy(earth.current.position)
      umbra.current.lookAt(v3.copy(earth.current.position).sub(sunDir))
    }
    // Line of nodes: where the Moon's orbit crosses the ecliptic.
    nodeLine.current?.rotation.set(0, (moonNodeLongitude(d) * Math.PI) / 180, 0)
    if (tideMesh.current) {
      tideMesh.current.position.copy(earth.current.position)
      tideMesh.current.scale.setScalar(EARTH_RADIUS_KM * K * enlarge)
      tide.uniforms.uMoon.value.copy(moon.current.position).sub(earth.current.position)
      tide.uniforms.uSun.value.copy(sunDir)
    }

    const k = 1 - Math.exp(-dt * 4)
    v.rotation.set(controls.pitch, controls.yaw, 0)
    sky.current?.rotation.copy(v.rotation)
    v.position.x += (shift - v.position.x) * k
    v.scale.setScalar(v.scale.x + (controls.zoom - v.scale.x) * k)
    v.updateMatrixWorld()
    sun.uDirectional.value = 1
    sun.uSunDir.value.copy(sunDir).transformDirection(v.matrixWorld)
  })

  const umbraLength = UMBRA_KM * K

  return (
    <>
      <group ref={sky}>
        <Stars map={stars} />
      </group>
      <group ref={view}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
          <circleGeometry args={[1.4, 96]} />
          <meshBasicMaterial
            color={ECLIPTIC}
            transparent
            opacity={0.03}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <Label position={[1.4, 0.02, 0]} color={ECLIPTIC}>
          {t('solar.earth.eclipticPlane')}
        </Label>
        <Line
          ref={orbitLine as never}
          points={orbitPoints}
          color={ORBIT}
          lineWidth={1.2}
          transparent
          opacity={0.7}
        />

        {/* The node line rotates with the 18.6-year regression of the nodes. */}
        <group ref={nodeLine}>
          <Line
            points={[
              [-1.3, 0, 0],
              [1.3, 0, 0],
            ]}
            color="#ff8fb1"
            lineWidth={1}
            dashed
            dashSize={0.04}
            gapSize={0.03}
          />
          <Label position={[1.3, 0, 0]} color="#ff8fb1">
            ☊ {t('solar.moon.ascendingNode')}
          </Label>
          <Label position={[-1.3, 0, 0]} color="#ff8fb1">
            ☋ {t('solar.moon.descendingNode')}
          </Label>
        </group>

        <group ref={sunArrow}>
          <Line
            points={[
              [0, 0, 0],
              [0, 0, 0.35],
            ]}
            color={ECLIPTIC}
            lineWidth={2}
          />
          <Label color={ECLIPTIC}>{t('solar.moon.sunlight')} →</Label>
        </group>

        <group ref={umbra} visible={trueScale}>
          <mesh position={[0, 0, umbraLength / 2]} rotation={[Math.PI / 2, 0, 0]} renderOrder={-1}>
            <coneGeometry args={[EARTH_RADIUS_KM * K, umbraLength, 48, 1, true]} />
            <meshBasicMaterial
              color="#000000"
              transparent
              opacity={0.35}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>

        <group ref={earth}>
          <Earth sun={sun} occluder={moonShadow} />
        </group>
        {tides && (
          <group ref={tideMesh}>
            <mesh material={tide} renderOrder={3}>
              <sphereGeometry args={[1, 96, 48]} />
            </mesh>
          </group>
        )}
        <group ref={moon}>
          <Body id="moon" sun={sun} occluder={earthShadow} />
          <Label position={[0, 1.6, 0]} color={ORBIT}>
            {t('solar.body.moon')}
          </Label>
        </group>
        {/* Barycentre: the point both bodies actually orbit. */}
        <mesh renderOrder={5}>
          <sphereGeometry args={[0.006, 12, 8]} />
          <meshBasicMaterial color="#ff5d6c" depthTest={false} />
        </mesh>
      </group>
    </>
  )
}
