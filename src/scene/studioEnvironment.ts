import type { Scene, WebGLRenderer } from 'three'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Generated room environment for reflections in the realistic view (no downloads). */
export function applyStudioEnvironment(gl: WebGLRenderer, scene: Scene): void {
  const pmrem = new PMREMGenerator(gl)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.6
  pmrem.dispose()
}
