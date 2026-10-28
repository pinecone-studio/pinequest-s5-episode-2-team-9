import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import { BackSide, type Texture } from 'three'
import { solarClock, useSolar } from '../solarStore'

/** Advances the simulated clock; mirrors it to the store for the panel a few times a second. */
export function SolarClock() {
  const sinceMirror = useRef(0)
  useFrame((_, dt) => {
    if (solarClock.playing) solarClock.ms += Math.min(dt, 0.1) * 1000 * solarClock.rate
    sinceMirror.current += dt
    if (sinceMirror.current > 0.12 && useSolar.getState().ms !== solarClock.ms) {
      sinceMirror.current = 0
      useSolar.setState({ ms: solarClock.ms })
    }
  })
  return null
}

/** The Milky Way behind everything. It turns with the view but never moves or scales. */
export function Stars({ map }: { map: Texture }) {
  const on = useSolar((s) => s.stars)
  if (!on) return null
  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[400, 64, 32]} />
      <meshBasicMaterial map={map} side={BackSide} depthWrite={false} color="#8a8a8a" toneMapped={false} />
    </mesh>
  )
}

export function Label({
  children,
  position,
  color,
}: {
  children: ReactNode
  position?: [number, number, number]
  color?: string
}) {
  const on = useSolar((s) => s.labels)
  if (!on) return null
  return (
    <Html
      position={position}
      center={false}
      zIndexRange={[5, 0]}
      pointerEvents="none"
      className="solar-label-wrap"
    >
      <span className="solar-label" style={{ '--c': color } as React.CSSProperties}>
        {children}
      </span>
    </Html>
  )
}
