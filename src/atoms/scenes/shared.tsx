import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { AdditiveBlending, Color, ShaderMaterial, SphereGeometry, type PerspectiveCamera } from 'three'
import { useLabServices } from '../../lab/LabContext'
import { createHoloMaterial } from '../../scene/HoloMaterial'
import { PANEL_PX } from '../../scene/sceneShared'
import { AtomInteraction } from '../atomInteraction'

export const PARTICLE_COLORS = { proton: '#ff5d6c', neutron: '#b9c7d6', electron: '#5ee7ff' } as const

export const sphereGeometry = new SphereGeometry(1, 24, 16)

/** Hologram material for a solid-looking glowing ball. */
export function useBallMaterial(color: string, fill = 0.35) {
  const material = useMemo(
    () => createHoloMaterial({ color, fill, fresnelPower: 1.6, intensity: 1.2 }),
    [color, fill],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })
  return material
}

/** Horizontal shift that centres content in the area left of the side panel. */
export function usePanelShift(): number {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
  const halfW = halfH * camera.aspect
  return size.width > 700 ? -(PANEL_PX / size.width) * halfW : 0
}

export function useHalfExtents(): { halfW: number; halfH: number } {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
  return { halfW: halfH * camera.aspect, halfH }
}

/** One AtomInteraction per canvas, attached to the lab's pointer hub. */
export function useAtomInteraction(): AtomInteraction {
  const { hub } = useLabServices()
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const get = useThree((s) => s.get)
  const ix = useMemo(() => new AtomInteraction(hub, camera, () => get().size), [hub, camera, get])
  useEffect(() => ix.attach(), [ix])
  useFrame((_, dt) => ix.update(Math.min(dt, 0.05)))
  return ix
}

/** Additive point-sprite material with per-point colour and size. */
export function createGlowPointsMaterial(size = 0.05): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uSize: { value: size }, uScale: { value: 400 }, uTint: { value: new Color('#ffffff') } },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float alpha;
      uniform float uSize;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.5, uSize * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(vColor * uTint * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}
