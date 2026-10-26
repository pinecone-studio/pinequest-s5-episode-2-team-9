import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  type Group,
  type Mesh,
  type ShaderMaterial,
} from 'three'
import { createHoloMaterial } from './HoloMaterial'

// Phase 0 test object: a slowly rotating hologram cube with glowing edges.
export function HoloCube() {
  const group = useRef<Group>(null)
  const holoMesh = useRef<Mesh<BoxGeometry, ShaderMaterial>>(null)
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const edges = useMemo(() => new EdgesGeometry(geometry), [geometry])
  const material = useMemo(() => createHoloMaterial(), [])
  const lineMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color: '#8ff3ff',
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      edges.dispose()
      material.dispose()
      lineMaterial.dispose()
    },
    [geometry, edges, material, lineMaterial],
  )

  useFrame((state, delta) => {
    const cube = group.current
    const holo = holoMesh.current
    if (!cube || !holo) return
    holo.material.uniforms.uTime.value = state.clock.elapsedTime
    cube.rotation.y += delta * 0.5
    cube.rotation.x += delta * 0.2
  })

  return (
    <group ref={group}>
      <mesh ref={holoMesh} geometry={geometry} material={material} />
      <lineSegments geometry={edges} material={lineMaterial} />
    </group>
  )
}
