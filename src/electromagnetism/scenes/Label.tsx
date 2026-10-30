import { Html } from '@react-three/drei'
import type { ReactNode } from 'react'
import { useEm } from '../emStore'

/** A small tag pinned to a point in the scene (hidden when labels are off). */
export function Label({
  children,
  position,
  color,
}: {
  children: ReactNode
  position?: [number, number, number]
  color?: string
}) {
  const on = useEm((s) => s.labels)
  if (!on) return null
  return (
    <Html
      position={position}
      center={false}
      zIndexRange={[5, 0]}
      pointerEvents="none"
      className="em-label-wrap"
    >
      <span className="em-label" style={{ '--c': color } as React.CSSProperties}>
        {children}
      </span>
    </Html>
  )
}
