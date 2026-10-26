import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import type { HeadPose } from '../input/faceTracker'

const HOME_Z = 3.2
const GAIN_X = 0.75
const GAIN_Y = 0.55
const DEAD_ZONE = 0.02

/**
 * Head-coupled perspective: the screen acts as a window. The camera follows the
 * viewer's head and uses an asymmetric (off-axis) frustum that keeps the screen
 * rectangle fixed, so moving your head lets you look around the hologram.
 * Picking keeps working because raycasts use the same camera.
 */
export function HeadParallax({ head }: { head: () => HeadPose | null }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const eye = useRef(new Vector3(0, 0, HOME_Z))

  useEffect(
    () => () => {
      camera.position.set(0, 0, HOME_Z)
      camera.rotation.set(0, 0, 0)
      camera.updateProjectionMatrix()
    },
    [camera],
  )

  useFrame((_, dt) => {
    const pose = head()
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * HOME_Z
    const halfW = halfH * camera.aspect
    const target = new Vector3(0, 0, HOME_Z)
    if (pose?.visible) {
      const dx = pose.x - 0.5
      const dy = pose.y - 0.5
      target.x = Math.abs(dx) < DEAD_ZONE ? 0 : dx * 2 * halfW * GAIN_X
      target.y = Math.abs(dy) < DEAD_ZONE ? 0 : -dy * 2 * halfH * GAIN_Y
    }
    eye.current.lerp(target, 1 - Math.exp(-dt * 6))

    const { x, y, z } = eye.current
    const near = camera.near
    camera.position.set(x, y, z)
    camera.rotation.set(0, 0, 0)
    camera.updateMatrixWorld()
    // Frustum through the fixed screen rectangle at z = 0.
    const k = near / z
    camera.projectionMatrix.makePerspective((-halfW - x) * k, (halfW - x) * k, (halfH - y) * k, (-halfH - y) * k, near, camera.far)
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  })

  return null
}
