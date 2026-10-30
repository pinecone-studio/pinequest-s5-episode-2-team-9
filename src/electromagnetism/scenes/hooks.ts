import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { Group, Mesh, Object3D, PerspectiveCamera } from 'three'
import { useLabServices } from '../../lab/LabContext'
import { useLab } from '../../lab/labStore'
import { PANEL_PX } from '../../scene/sceneShared'
import { EmControls } from '../emControls'

/** Horizontal shift that centres content in the area left of the side panel. */
export function usePanelShift(): number {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const panelHidden = useLab((s) => s.panelHidden)
  const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
  const halfW = halfH * camera.aspect
  return size.width > 700 && !panelHidden ? -(PANEL_PX / size.width) * halfW : 0
}

/** One EmControls per canvas, attached to the lab's pointer hub. */
export function useEmControls(): EmControls {
  const { hub } = useLabServices()
  const get = useThree((s) => s.get)
  const controls = useMemo(() => new EmControls(hub, () => get().size), [hub, get])
  useEffect(() => controls.attach(), [controls])
  useFrame((_, dt) => controls.update(Math.min(dt, 0.05)))
  return controls
}

/**
 * Hangs an imperatively built three.js object under `parent` and records it in
 * `slot`, so the scene can mutate it every frame. Call from an effect and
 * return the result: the cleanup removes and disposes it.
 */
export function mount<T extends Object3D>(
  parent: Group | null,
  slot: { current: T | null },
  object: T,
  dispose: (o: T) => void,
): (() => void) | undefined {
  if (!parent) {
    dispose(object)
    return
  }
  parent.add(object)
  slot.current = object
  return () => {
    parent.remove(object)
    if (slot.current === object) slot.current = null
    dispose(object)
  }
}

/** Disposes a mesh's own geometry and material(s). */
export function disposeMesh(o: Object3D) {
  const m = o as Mesh
  m.geometry?.dispose()
  const mat = m.material
  if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
  else mat?.dispose()
}

/** Small seeded PRNG, so scattered things look the same on every mount. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
