import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// Soft studio lighting for the realistic view: a generated room environment for
// reflections (no downloads) plus a key light and a cool rim light.
// Hologram materials ignore lights, so this is always on.
export function StudioLights() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.6
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return (
    <>
      <hemisphereLight args={['#dfe9ff', '#2a1d1a', 0.6]} />
      <directionalLight position={[2.5, 3, 3]} intensity={1.6} />
      <directionalLight position={[-3, 1.5, -2]} intensity={0.9} color="#9fd8ff" />
    </>
  )
}
