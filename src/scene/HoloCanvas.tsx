import { Canvas } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { AutoQuality } from './AutoQuality'
import { PostFX } from './PostFX'
import { StudioLights } from './StudioLights'
import { applyStudioEnvironment } from './studioEnvironment'

// Debug switch: ?fx=0 disables post effects.
const postFx = typeof location === 'undefined' || new URLSearchParams(location.search).get('fx') !== '0'

// Transparent WebGL layer drawn over the mirrored webcam video.
export function HoloCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      className="holo-canvas"
      camera={{ position: [0, 0, 3.2], fov: 45 }}
      dpr={[1, 2]}
      // antialias only covers direct rendering (lowest quality level, ?fx=0);
      // with post effects on, PostFX's multisampling does the job.
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(0x000000, 0)
        gl.localClippingEnabled = true
        applyStudioEnvironment(gl, scene)
      }}
    >
      <StudioLights />
      {children}
      {postFx && <PostFX />}
      <AutoQuality />
    </Canvas>
  )
}
