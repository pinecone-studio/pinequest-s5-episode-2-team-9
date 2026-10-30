import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type { Group } from 'three'
import { usePanelShift } from '../../atoms/scenes/shared'
import type { SolarControls } from '../../solar/solarControls'
import { arrowHead, arrowShaft } from './controls'

/**
 * The turning, zooming stage every view sits on, centred left of the side panel.
 * `scale` is the view's base size; the controls multiply it.
 */
export function Stage({
  controls,
  scale = 1,
  children,
}: {
  controls: SolarControls
  scale?: number
  children: ReactNode
}) {
  const shift = usePanelShift()
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const k = 1 - Math.exp(-dt * 6)
    g.position.x += (shift - g.position.x) * k
    g.rotation.set(controls.pitch, controls.yaw, 0)
    const s = scale * controls.zoom
    g.scale.setScalar(g.scale.x + (s - g.scale.x) * k)
  })
  return (
    <group ref={ref} scale={scale}>
      {children}
    </group>
  )
}

/** A small text tag pinned to a point in the scene. */
export function Tag({
  children,
  position,
  color,
  align = 'right',
}: {
  children: ReactNode
  position?: [number, number, number]
  color?: string
  align?: 'right' | 'left' | 'center'
}) {
  return (
    <Html position={position} center={false} zIndexRange={[5, 0]} pointerEvents="none">
      <span className="st-tag" data-align={align} style={{ '--c': color } as React.CSSProperties}>
        {children}
      </span>
    </Html>
  )
}

/** A solid arrow along +y; aim it with aimArrow. */
export function Arrow({
  ref,
  color,
  opacity = 1,
}: {
  ref?: React.Ref<Group>
  color: string
  opacity?: number
}) {
  return (
    <group ref={ref}>
      <mesh geometry={arrowShaft}>
        <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} toneMapped={false} />
      </mesh>
      <mesh geometry={arrowHead}>
        <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} toneMapped={false} />
      </mesh>
    </group>
  )
}
