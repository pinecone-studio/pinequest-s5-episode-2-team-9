// three.js helpers for the solar scenes (no components here).
import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Matrix4,
  NoColorSpace,
  SRGBColorSpace,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
} from 'three'
import { useLabServices } from '../../lab/LabContext'
import type { Spin, Vec3 } from '../astro'
import { textureUrl } from '../bodies'
import { SolarControls } from '../solarControls'

/** Ecliptic (x → equinox, z → north) to three.js (y up). */
export function toThree([x, y, z]: Vec3, out = new Vector3()): Vector3 {
  return out.set(x, z, -y)
}

const basis = new Matrix4()
const ax = new Vector3()
const ay = new Vector3()
const az = new Vector3()

/**
 * Turns a unit sphere so its texture lines up with the body's real axes:
 * the sphere's +y is the north pole and +x is longitude 0 (three.js sphere UVs
 * put longitude 0 at +x and east at −z).
 */
export function orient(object: Object3D, s: Spin): void {
  toThree(s.meridian, ax)
  toThree(s.pole, ay)
  toThree(s.east, az).negate()
  basis.makeBasis(ax, ay, az)
  object.quaternion.setFromRotationMatrix(basis)
}

const COLOR_MAPS = new Set([
  'sun',
  'mercury',
  'venus',
  'earth-day',
  'earth-night',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'saturn-ring',
  'uranus',
  'neptune',
  'stars',
])

/** Loads maps from /public/solar with the right colour space and sharp filtering at grazing angles. */
export function useSolarTextures<K extends string>(names: readonly K[]): Record<K, Texture> {
  const gl = useThree((s) => s.gl)
  const list = useTexture(names.map(textureUrl)) as Texture[]
  const key = names.join(',')
  return useMemo(() => {
    const out = {} as Record<K, Texture>
    names.forEach((name, i) => {
      const t = list[i]
      t.colorSpace = COLOR_MAPS.has(name) ? SRGBColorSpace : NoColorSpace
      t.anisotropy = gl.capabilities.getMaxAnisotropy()
      t.needsUpdate = true
      out[name] = t
    })
    return out
    // Keyed by the joined names: callers pass a fresh array literal each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, key, gl])
}

/** One SolarControls per canvas, attached to the lab's pointer hub. */
export function useSolarControls(setup?: (c: SolarControls) => void): SolarControls {
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
