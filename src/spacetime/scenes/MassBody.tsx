import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import { Earth, Sun } from '../../solar/scenes/Bodies'
import { createGlowTexture, createSunLight } from '../../solar/scenes/materials'
import type { MassId } from '../gravity'

const sphere = new SphereGeometry(1, 96, 48)
/** Light comes from the upper right, a little in front, wherever the view is turned. */
const LIGHT = new Vector3(1, 0.55, 0.9).normalize()

/**
 * A neutron star: a white-hot surface with slowly churning hot spots, darker
 * towards the limb, with a thin blue rim of light bent round from behind.
 */
function createNeutronMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vLocal;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
          f.z);
      }
      void main() {
        float mu = clamp(dot(vNormal, vView), 0.0, 1.0);
        float spots = noise(vLocal * 6.0 + uTime * 0.15) * 0.6 + noise(vLocal * 15.0 - uTime * 0.3) * 0.4;
        vec3 hot = vec3(0.62, 0.72, 0.95);
        vec3 core = mix(hot * 0.55, vec3(0.92, 0.95, 1.0), spots * spots);
        vec3 rim = vec3(0.5, 0.65, 1.0) * pow(1.0 - mu, 3.0) * 0.9;
        // Limb darkening as on any star, with the lensed rim on top.
        gl_FragColor = vec4(core * (0.55 + 0.45 * mu) + rim, 1.0);
      }
    `,
    toneMapped: false,
  })
}

function NeutronStar() {
  const material = useMemo(() => createNeutronMaterial(), [])
  const glow = useMemo(() => createGlowTexture('rgba(200,215,255,0.55)', 'rgba(110,150,255,0.18)'), [])
  useEffect(() => () => (material.dispose(), glow.dispose()), [material, glow])
  const live = useRef(material)
  useEffect(() => {
    live.current = material
  }, [material])
  useFrame((state) => {
    live.current.uniforms.uTime.value = state.clock.elapsedTime
  })
  return (
    <group>
      <mesh geometry={sphere} material={material} />
      <sprite scale={2.6} renderOrder={2}>
        <spriteMaterial
          map={glow}
          blending={AdditiveBlending}
          depthWrite={false}
          transparent
          toneMapped={false}
        />
      </sprite>
    </group>
  )
}

function LitEarth() {
  const sun = useMemo(() => {
    const s = createSunLight()
    s.uDirectional.value = 1
    s.uSunDir.value.copy(LIGHT)
    return s
  }, [])
  return <Earth sun={sun} />
}

/** The central mass, as a unit sphere; the parent group sets its radius. */
export function MassBody({ id }: { id: MassId }) {
  if (id === 'earth') return <LitEarth />
  if (id === 'sun') return <Sun glow={2.4} />
  return <NeutronStar />
}
