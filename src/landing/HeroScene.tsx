import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { PerspectiveCamera } from 'three'
import type { ModelDefinition } from '../models/ModelDefinition'
import { HoloCanvas } from '../scene/HoloCanvas'
import { ModelRig } from '../scene/modelRig'

const EMPTY = new Set<string>()

/** Rotating hologram that assembles as `progress` goes from 0 (apart) to 1 (whole). */
function HeroModel({ def, progress }: { def: ModelDefinition; progress: () => number }) {
  const { scene } = useGLTF(def.url)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const rig = useMemo(() => new ModelRig(def, scene), [def, scene])

  useEffect(() => () => rig.dispose(), [rig])
  useEffect(() => {
    rig.layout(camera, size, 0, [])
  }, [rig, camera, size])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    rig.rotateBy(dt * 0.35, 0)
    rig.update(
      dt,
      {
        mode: 'explore',
        explode: 1 - progress(),
        scale: size.width < 700 ? 0.8 : 1,
        hovered: null,
        selected: null,
        studyPart: null,
        cutaway: 0,
        placed: EMPTY,
        carried: null,
        hintPart: null,
      },
      camera,
    )
  })

  return <primitive object={rig.root} />
}

export default function HeroScene({ def, progress }: { def: ModelDefinition; progress: () => number }) {
  return (
    <HoloCanvas>
      <HeroModel def={def} progress={progress} />
    </HoloCanvas>
  )
}
