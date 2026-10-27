import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { InteractionController } from '../interaction/controller'
import { useLabServices } from '../lab/LabContext'
import { useLab } from '../lab/labStore'
import { useModel } from '../lab/modelStore'
import type { ModelDefinition } from '../models/ModelDefinition'
import { ModelRig } from './modelRig'
import { createDogMotion } from './motion/dogMotion'
import { createHeartMotion } from './motion/heartMotion'
import { createMotorMotion } from './motion/motorMotion'
import { createRocketMotion } from './motion/rocketMotion'
import { PANEL_PX, labelAnchor } from './sceneShared'


// Deterministic shuffle so the bench is not laid out in assembly order.
function benchOrder(ids: string[]): string[] {
  const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  return [...ids].sort((a, b) => (hash(a) % 997) - (hash(b) % 997))
}

export function ModelScene({ def }: { def: ModelDefinition }) {
  const { scene } = useGLTF(def.url)
  const { hub } = useLabServices()
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const get = useThree((s) => s.get)
  const rig = useMemo(() => new ModelRig(def, scene), [def, scene])

  // Motion objects (particles, flame) are created per mount so StrictMode's
  // mount → unmount → mount cycle can't leave them disposed.
  useEffect(() => {
    const motion =
      def.motion === 'heart'
        ? createHeartMotion(rig)
        : def.motion === 'motor'
          ? createMotorMotion(rig)
          : def.motion === 'rocket'
            ? createRocketMotion(rig)
            : def.motion === 'dog'
              ? createDogMotion(rig)
              : null
    rig.attachMotion(motion)
    return () => {
      rig.attachMotion(null)
      motion?.dispose()
    }
  }, [rig, def])
  const controller = useMemo(
    () => new InteractionController(rig, hub, camera, () => get().size),
    [rig, hub, camera, get],
  )
  const layoutKey = useRef('')
  const lastMode = useRef(useModel.getState().mode)
  const lastReset = useRef(useModel.getState().resetToken)
  const tmp = useMemo(() => new Vector3(), [])

  useEffect(() => controller.attach(), [controller])
  useEffect(() => useModel.getState().set({ loaded: true }), [rig])
  useEffect(() => () => rig.dispose(), [rig])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useModel.getState()
    const placed = new Set(s.placed)

    if (s.resetToken !== lastReset.current) {
      lastReset.current = s.resetToken
      rig.resetRotation()
      controller.stopMomentum()
    }

    // Mode transitions move parts between the model and the bench.
    if (s.mode !== lastMode.current) {
      if (s.mode === 'assembly') rig.scatterToBench(placed)
      else if (lastMode.current === 'assembly') rig.gatherToModel()
      lastMode.current = s.mode
      layoutKey.current = ''
    }

    // Keep part locations in sync with the store (e.g. hint auto-place).
    if (s.mode === 'assembly') {
      for (const [id, part] of rig.parts) {
        if (placed.has(id) && part.location === 'bench') {
          rig.relocate(id, 'model')
          rig.flash(id)
        }
      }
    }

    const unplaced = s.mode === 'assembly' ? benchOrder(def.parts.map((p) => p.id).filter((id) => !placed.has(id))) : []
    const key = `${size.width}x${size.height}:${unplaced.join(',')}`
    if (key !== layoutKey.current) {
      layoutKey.current = key
      rig.layout(camera, size, PANEL_PX, unplaced)
    }

    rig.setRealistic(useLab.getState().viewStyle === 'realistic')
    controller.update(dt)
    rig.update(
      dt,
      {
        mode: s.mode,
        explode: s.explode,
        scale: s.scale,
        hovered: s.hovered,
        selected: s.selected,
        studyPart: s.studyPart,
        cutaway: s.cutaway,
        placed,
        carried: s.carried,
        hintPart: s.hintPart,
      },
      camera,
    )

    // Label anchor: hovered part, else the selected one (not in study, which has its own card).
    const labelled = s.mode === 'study' ? null : (s.hovered ?? s.selected)
    if (labelled && rig.parts.get(labelled)?.mesh.visible) {
      const p = rig.toScreen(rig.partWorld(labelled, tmp), camera, size)
      labelAnchor.x = p.x
      labelAnchor.y = p.y
      labelAnchor.visible = true
    } else {
      labelAnchor.visible = false
    }
  })

  return <primitive object={rig.root} />
}
