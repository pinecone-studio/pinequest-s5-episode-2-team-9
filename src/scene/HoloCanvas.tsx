import { Canvas } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { PostFX } from './PostFX'

// Debug switch: ?fx=0 disables post effects.
const postFx = typeof location === 'undefined' || new URLSearchParams(location.search).get('fx') !== '0'

// Transparent WebGL layer drawn over the mirrored webcam video.
export function HoloCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      className="holo-canvas"
      camera={{ position: [0, 0, 3.2], fov: 45 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
        gl.localClippingEnabled = true
      }}
    >
      {children}
      {postFx && <PostFX />}
    </Canvas>
  )
}
