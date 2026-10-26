import { Canvas } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { PostFX } from './PostFX'

// Transparent WebGL layer drawn over the mirrored webcam video.
export function HoloCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      className="holo-canvas"
      camera={{ position: [0, 0, 3.2], fov: 45 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      {children}
      <PostFX />
    </Canvas>
  )
}
