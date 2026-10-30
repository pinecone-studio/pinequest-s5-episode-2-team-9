// View controls and per-frame helpers shared by the spacetime scenes (no components here).
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { ConeGeometry, CylinderGeometry, Vector3, type Group, type PerspectiveCamera } from 'three'
import { useLabServices } from '../../lab/LabContext'
import { SolarControls } from '../../solar/solarControls'

/**
 * Drag to turn, wheel or two-hand zoom, tap to act: the solar lab's controls,
 * one per view, attached to the lab's pointer hub.
 */
export function useViewControls(setup?: (c: SolarControls) => void): SolarControls {
  const { hub } = useLabServices()
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const get = useThree((s) => s.get)
  const controls = useMemo(() => {
    const c = new SolarControls(hub, camera, () => get().size)
    setup?.(c)
    return c
    // Setup runs once per view; it only seeds starting values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, camera, get])
  useEffect(() => controls.attach(), [controls])
  const live = useRef(controls)
  useEffect(() => {
    live.current = controls
  }, [controls])
  useFrame((_, dt) => live.current.update(Math.min(dt, 0.05)))
  return controls
}

export const arrowShaft = new CylinderGeometry(1, 1, 1, 12)
arrowShaft.translate(0, 0.5, 0)
export const arrowHead = new ConeGeometry(1, 1, 16)
arrowHead.translate(0, 0.5, 0)
const up = new Vector3(0, 1, 0)
const dir = new Vector3()

/**
 * Updates an arrow group (made by <Arrow>) to run from `from` along `v`.
 * Called every frame, so it touches only the transforms.
 */
export function aimArrow(g: Group | null, from: Vector3, v: Vector3, width = 0.012): void {
  if (!g) return
  const len = v.length()
  g.visible = len > 1e-4
  if (!g.visible) return
  g.position.copy(from)
  g.quaternion.setFromUnitVectors(up, dir.copy(v).divideScalar(len))
  const headLen = Math.min(len * 0.45, width * 5)
  const [body, tip] = g.children
  body.scale.set(width, len - headLen, width)
  tip.position.y = len - headLen
  tip.scale.set(width * 2.6, headLen, width * 2.6)
}
