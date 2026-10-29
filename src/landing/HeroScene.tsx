import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useSpring } from 'motion/react'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { MathUtils, Vector3, type Group, type PerspectiveCamera } from 'three'
import type { ModelDefinition } from '../models/ModelDefinition'
import { HoloCanvas } from '../scene/HoloCanvas'
import { ModelRig } from '../scene/modelRig'
import { glowPart } from '../scene/motion/glow'

const EMPTY = new Set<string>()
const POINTER_SPRING = { mass: 1, stiffness: 100, damping: 10 }

/** Rotating hologram that assembles as `progress` goes from 0 (apart) to 1 (whole). */
function HeroModel({
  def,
  progress,
  glow,
}: {
  def: ModelDefinition
  progress: () => number
  glow: RefObject<HTMLDivElement | null>
}) {
  const { scene } = useGLTF(def.url)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const canvas = useThree((s) => s.gl.domElement)
  const parallax = useRef<Group>(null)
  const projected = useMemo(() => new Vector3(), [])
  const pointerX = useSpring(0, POINTER_SPRING)
  const pointerY = useSpring(0, POINTER_SPRING)
  const proximity = useSpring(0, POINTER_SPRING)
  const preferences = useMemo(
    () => ({
      motion: window.matchMedia('(prefers-reduced-motion: reduce)'),
      pointer: window.matchMedia('(min-width: 760px) and (hover: hover) and (pointer: fine)'),
    }),
    [],
  )
  const reduced = useRef(preferences.motion.matches)
  const rig = useMemo(() => {
    const r = new ModelRig(def, scene)
    r.wideExplode = false
    return r
  }, [def, scene])

  useEffect(() => () => rig.dispose(), [rig])
  useEffect(() => {
    rig.layout(camera, size, 0, [])
  }, [rig, camera, size])

  useEffect(() => {
    // Listen on the whole hero so text and links can keep their normal pointer behavior.
    const hero = canvas.closest<HTMLElement>('.hero')
    if (!hero) return
    let bounds = canvas.getBoundingClientRect()
    const reset = () => {
      pointerX.set(0)
      pointerY.set(0)
      proximity.set(0)
    }
    const refreshBounds = () => {
      bounds = canvas.getBoundingClientRect()
      reset()
    }
    const syncPreferences = () => {
      reduced.current = preferences.motion.matches
      if (!preferences.pointer.matches || reduced.current) {
        pointerX.jump(0)
        pointerY.jump(0)
        proximity.jump(0)
      }
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || reduced.current || !preferences.pointer.matches) return
      if (!bounds.width || !bounds.height) return
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      const y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2
      pointerX.set(MathUtils.clamp(x, -1, 1))
      pointerY.set(MathUtils.clamp(y, -1, 1))
      const distance = Math.hypot(x * (bounds.width / bounds.height), y)
      proximity.set(1 - MathUtils.smoothstep(distance, 0.35, 1.45))
    }
    const resize = new ResizeObserver(refreshBounds)
    resize.observe(canvas)
    syncPreferences()
    hero.addEventListener('pointermove', move, { passive: true })
    hero.addEventListener('pointerleave', reset)
    window.addEventListener('blur', reset)
    window.addEventListener('scroll', refreshBounds, { passive: true })
    document.addEventListener('visibilitychange', reset)
    preferences.motion.addEventListener('change', syncPreferences)
    preferences.pointer.addEventListener('change', syncPreferences)
    return () => {
      resize.disconnect()
      hero.removeEventListener('pointermove', move)
      hero.removeEventListener('pointerleave', reset)
      window.removeEventListener('blur', reset)
      window.removeEventListener('scroll', refreshBounds)
      document.removeEventListener('visibilitychange', reset)
      preferences.motion.removeEventListener('change', syncPreferences)
      preferences.pointer.removeEventListener('change', syncPreferences)
      pointerX.stop()
      pointerY.stop()
      proximity.stop()
    }
  }, [canvas, pointerX, pointerY, proximity, preferences])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const x = reduced.current ? 0 : pointerX.get()
    const y = reduced.current ? 0 : pointerY.get()
    const light = reduced.current ? 0 : MathUtils.clamp(proximity.get(), 0, 1)
    if (!reduced.current) rig.rotateBy(dt * 0.35 * (1 - light * 0.75), 0)
    const group = parallax.current
    if (group) {
      group.rotation.set(-y * 0.12, x * 0.18, -x * 0.025)
      group.position.set(x * 0.11, y * 0.08, light * 0.06)
    }
    rig.update(
      dt,
      {
        mode: 'explore',
        explode: reduced.current ? 0 : 1 - progress(),
        scale: size.width < 700 ? 0.8 : 1,
        hovered: null,
        selected: null,
        studyPart: null,
        cutaway: 0,
        placed: EMPTY,
        carried: null,
        hintPart: null,
        studyPath: [],
        hoveredPiece: null,
        pieceSpread: 0,
      },
      camera,
    )
    if (light > 0.001 && group) {
      // The rig resets material highlights each frame. Layer the cursor glow on afterward.
      group.updateWorldMatrix(true, true)
      for (const part of rig.parts.values()) {
        if (!part.mesh.visible) continue
        projected.setFromMatrixPosition(part.mesh.matrixWorld).project(camera)
        const dx = (projected.x - x) * (size.width / size.height)
        const dy = projected.y - y
        const localLight = Math.exp(-(dx * dx + dy * dy) * 2.5)
        glowPart(part, light * (0.12 + localLight * 0.48))
      }
    }
    if (reduced.current) {
      for (const part of rig.parts.values()) part.holo.uniforms.uTime.value = 0
    }
    if (glow.current) {
      glow.current.style.transform = `translate3d(${x * 40}px, ${-y * 32}px, 0) scale(${1 + light * 0.08})`
      glow.current.style.opacity = String(light)
    }
  })

  return (
    <group ref={parallax}>
      <primitive object={rig.root} />
    </group>
  )
}

export default function HeroScene({ def, progress }: { def: ModelDefinition; progress: () => number }) {
  const glow = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={glow} className="hero-cursor-glow" />
      <HoloCanvas>
        <HeroModel def={def} progress={progress} glow={glow} />
      </HoloCanvas>
    </>
  )
}
