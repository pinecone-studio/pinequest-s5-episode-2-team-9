import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { InteractionController } from '../interaction/controller'
import { useLabServices } from '../lab/LabContext'
import { useLab } from '../lab/labStore'
import { assemblyStage, guideTarget, nextPart, useModel } from '../lab/modelStore'
import type { ModelDefinition } from '../models/ModelDefinition'
import { ConnectionGuide } from './connectionGuide'
import { ModelRig } from './modelRig'
import { createBrainMotion } from './motion/brainMotion'
import { createDogMotion } from './motion/dogMotion'
import { createHeartMotion } from './motion/heartMotion'
import { createMotorMotion } from './motion/motorMotion'
import { createRocketMotion } from './motion/rocketMotion'
import { PANEL_PX, guideAnchor, labelAnchor, portAnchors } from './sceneShared'

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
              : def.motion === 'brain'
                ? createBrainMotion(rig)
                : null
    rig.attachMotion(motion)
    return () => {
      rig.attachMotion(null)
      motion?.dispose()
    }
  }, [rig, def])
  // Assembly guidance for models that know where their parts attach.
  const guide = useRef<ConnectionGuide | null>(null)
  useEffect(() => {
    if (!def.connected) return
    const g = new ConnectionGuide(rig)
    guide.current = g
    return () => {
      guide.current = null
      g.dispose()
      guideAnchor.visible = false
    }
  }, [rig, def])
  /** Parts placed as of the last frame, to start a flow pulse on each newly connected vessel. */
  const lastPlaced = useRef(new Set<string>())
  const controller = useMemo(
    () => new InteractionController(rig, hub, camera, () => get().size),
    [rig, hub, camera, get],
  )
  const layoutKey = useRef('')
  const lastMode = useRef(useModel.getState().mode)
  const lastReset = useRef(useModel.getState().resetToken)
  const lastView = useRef(useModel.getState().viewToken)
  const tmp = useMemo(() => new Vector3(), [])

  useEffect(() => controller.attach(), [controller])

  // Realistic-only models keep PBR on while open, and the saved view style is left alone.
  useEffect(() => {
    if (!def.realisticOnly) return
    useLab.getState().set({ forcedRealistic: true })
    return () => useLab.getState().set({ forcedRealistic: false })
  }, [def])
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

    // Guided tour: turn to the step's part or view.
    if (s.viewToken !== lastView.current) {
      lastView.current = s.viewToken
      const view = s.viewTarget
      if (view && 'part' in view) rig.facePart(view.part, s.explode)
      else if (view) rig.setRotation(view.rotation)
      controller.stopMomentum()
    }

    // Mode transitions move parts between the model and the bench.
    if (s.mode !== lastMode.current) {
      lastPlaced.current = new Set(placed)
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
        } else if (!placed.has(id) && part.location === 'model') {
          // "Start again" (and a hot reload) clears placed parts without leaving assembly mode.
          rig.relocate(id, 'bench')
        }
      }
    }

    if (s.mode === 'assembly') {
      for (const id of placed) if (!lastPlaced.current.has(id)) guide.current?.pulse(id)
      lastPlaced.current = new Set(placed)
    }

    // Connected models are rebuilt one group at a time, so the bench only holds the current group.
    const stage = s.mode === 'assembly' && def.connected ? assemblyStage(def, s.placed) : null
    const unplaced =
      s.mode === 'assembly'
        ? benchOrder(
            def.parts.filter((p) => !placed.has(p.id) && (!stage || p.group === stage)).map((p) => p.id),
          )
        : []
    const lab = useLab.getState()
    const panelPx = lab.panelHidden ? 0 : PANEL_PX
    const key = `${size.width}x${size.height}:${panelPx}:${unplaced.join(',')}`
    if (key !== layoutKey.current) {
      layoutKey.current = key
      rig.layout(camera, size, panelPx, unplaced)
    }

    rig.setRealistic(lab.viewStyle === 'realistic' || lab.forcedRealistic)
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
        guidePart: s.mode === 'assembly' && def.connected && s.guide ? nextPart(def, s.placed) : null,
      },
      camera,
    )

    // Guide ring on the opening the current part attaches to.
    if (guide.current) {
      const target = guideTarget(s)
      const at = guide.current.update(dt, target, camera, size)
      guideAnchor.visible = !!at
      if (at) {
        guideAnchor.x = at.x
        guideAnchor.y = at.y
      }
    }

    // Study close-up: label every socket or opening on the studied part with what plugs in there.
    if (def.connected && s.mode === 'study' && s.studyPart) {
      const host = rig.parts.get(s.studyPart)
      const ids: string[] = []
      if (host && host.opacity > 0.9) {
        for (const [id, joint] of rig.joints) {
          if (joint.to !== s.studyPart) continue
          ids.push(id)
          const world = host.mesh.localToWorld(tmp.copy(joint.pos).sub(host.home))
          portAnchors.at.set(id, rig.toScreen(world, camera, size))
        }
      }
      if (ids.join() !== portAnchors.ids.join()) portAnchors.ids = ids
    } else if (portAnchors.ids.length) {
      portAnchors.ids = []
    }

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
