import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { SphereGeometry, type PerspectiveCamera } from 'three'
import { useLabServices } from '../../lab/LabContext'
import { useLab } from '../../lab/labStore'
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
  const ref = useRef(material)
  useEffect(() => {
    ref.current = material
    return () => material.dispose()
  }, [material])
  useFrame((state) => {
    ref.current.uniforms.uTime.value = state.clock.elapsedTime
  })
  return material
}

/** Horizontal shift that centres content in the area left of the side panel. */
export function usePanelShift(): number {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const panelHidden = useLab((s) => s.panelHidden)
  const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
  const halfW = halfH * camera.aspect
  return size.width > 700 && !panelHidden ? -(PANEL_PX / size.width) * halfW : 0
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

export { createGlowPointsMaterial } from '../../scene/glowPoints'
