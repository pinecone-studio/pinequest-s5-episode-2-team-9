// Turns pointer events (hands + mouse) into model interactions:
//   one pointer: rotate (with momentum), drag a part out, carry a part (assembly), tap to select
//   two hands:   pinch near the model and pull apart = explode; away from it = scale;
//                hold a part + pull with the other hand = open Study.

import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three'
import { play } from '../audio/sfx'
import { tuning } from '../input/tuning'
import { useLab } from '../lab/labStore'
import { useModel } from '../lab/modelStore'
import type { ModelRig } from '../scene/modelRig'
import type { HubEvent, Pointer, PointerHub } from './pointerHub'

interface SingleGesture {
  kind: 'rotate' | 'partDrag' | 'carry'
  pointerId: string
  partId: string | null
  /** Part under the pointer at press time (for tap-to-select). */
  pressedPart: string | null
  lastX: number
  lastY: number
  startX: number
  startY: number
  startTime: number
  vx: number
  vy: number
}

interface TwoHandGesture {
  kind: 'explode' | 'scale' | 'stretch'
  a: string
  b: string
  d0: number
  explode0: number
  scale0: number
  partId: string | null
}

const STRETCH_TO_STUDY = 1.35
const TAP_PX = 10
const TAP_MS = 400

export class InteractionController {
  private singles = new Map<string, SingleGesture>()
  private two: TwoHandGesture | null = null
  private momentum = { yaw: 0, pitch: 0 }
  private raycaster = new Raycaster()
  private ndc = new Vector2()
  private plane = new Plane()
  private hit = new Vector3()
  private tmp = new Vector3()
  private lastHovered: string | null = null

  private rig: ModelRig
  private hub: PointerHub
  private camera: PerspectiveCamera
  private viewport: () => { width: number; height: number }

  constructor(
    rig: ModelRig,
    hub: PointerHub,
    camera: PerspectiveCamera,
    viewport: () => { width: number; height: number },
  ) {
    this.rig = rig
    this.hub = hub
    this.camera = camera
    this.viewport = viewport
  }

  /** Starts listening to pointer events; returns the detach function. */
  attach(): () => void {
    return this.hub.subscribe((e) => this.handle(e))
  }

  stopMomentum(): void {
    this.momentum.yaw = 0
    this.momentum.pitch = 0
  }

  private ray(x: number, y: number): Raycaster {
    const { width, height } = this.viewport()
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    return this.raycaster
  }

  private handle(e: HubEvent): void {
    const store = useModel.getState()
    if (e.type === 'wheel') {
      if (store.mode !== 'assembly') store.set({ scale: clamp(store.scale * Math.exp(-e.deltaY * 0.0012), 0.5, 2.5) })
      return
    }
    if (e.type === 'doubleclick') {
      if (store.mode === 'explore') {
        const id = this.rig.pick(this.ray(e.x, e.y), ['model'])
        if (id) {
          store.openStudy(id)
          play('open')
        }
      }
      return
    }
    if (e.type === 'fist') {
      this.back()
      return
    }
    if (e.type === 'down') this.onDown(e.pointer)
    else this.onUp(e.pointer, e.type === 'cancel')
  }

  /** Fist-hold "back": closes the innermost thing that is open. */
  private back(): void {
    const lab = useLab.getState()
    const store = useModel.getState()
    if (lab.settingsOpen || lab.creditsOpen || lab.tipsOpen) lab.set({ settingsOpen: false, creditsOpen: false, tipsOpen: false })
    else if (store.tourStep !== null) store.endTour()
    else if (store.mode === 'study') store.closeStudy()
    else if (store.selected) store.set({ selected: null })
    else if (store.mode === 'explore' && store.explode > 0) store.set({ explode: 0 })
    else return
    play('click')
  }

  private onDown(p: Pointer): void {
    const store = useModel.getState()
    if (this.two) return

    // A second hand joins: start a two-hand gesture.
    const other = [...this.singles.values()].find((g) => g.pointerId !== p.id && g.pointerId.startsWith('hand'))
    if (other && p.kind === 'hand') {
      const a = this.hub.pointers.get(other.pointerId)
      if (!a) return
      const d0 = Math.max(20, Math.hypot(p.x - a.x, p.y - a.y))
      if (other.kind === 'partDrag' && other.partId) {
        this.two = { kind: 'stretch', a: other.pointerId, b: p.id, d0, explode0: 0, scale0: 0, partId: other.partId }
        return
      }
      if (other.kind === 'carry') return
      this.singles.delete(other.pointerId)
      this.stopMomentum()
      if (store.mode === 'assembly') return
      const center = this.rig.screenCenter(this.camera, this.viewport())
      const radius = this.rig.screenRadius(this.camera, this.viewport().height) * tuning.get().explodeNearRadius
      const near = [a, p].every((q) => Math.hypot(q.x - center.x, q.y - center.y) < radius)
      const kind = near && store.mode === 'explore' ? 'explode' : 'scale'
      this.two = { kind, a: other.pointerId, b: p.id, d0, explode0: store.explode, scale0: store.scale, partId: null }
      return
    }

    const gesture: SingleGesture = {
      kind: 'rotate',
      pointerId: p.id,
      partId: null,
      pressedPart: null,
      lastX: p.x,
      lastY: p.y,
      startX: p.x,
      startY: p.y,
      startTime: performance.now(),
      vx: 0,
      vy: 0,
    }
    this.stopMomentum()

    if (store.mode === 'assembly') {
      const id = this.rig.pick(this.ray(p.x, p.y), ['bench'])
      if (id) {
        gesture.kind = 'carry'
        gesture.partId = id
        this.rig.relocate(id, 'carry')
        store.set({ carried: id, hovered: null })
        play('pick')
      }
    } else if (store.mode === 'explore') {
      const id = this.rig.pick(this.ray(p.x, p.y), ['model'])
      gesture.pressedPart = id
      if (id && store.explode > 0.15) {
        gesture.kind = 'partDrag'
        gesture.partId = id
        this.rig.relocate(id, 'carry')
        store.set({ selected: id })
        play('pick')
      }
    }
    this.singles.set(p.id, gesture)
  }

  private onUp(p: Pointer, cancelled: boolean): void {
    const store = useModel.getState()
    if (this.two && (this.two.a === p.id || this.two.b === p.id)) {
      const ended = this.two
      this.two = null
      if (ended.kind === 'stretch') {
        // The holding hand keeps its part drag only if it is the one still pressed.
        if (ended.a === p.id) this.endSingle(p.id, store, cancelled)
        return
      }
      return
    }
    this.endSingle(p.id, store, cancelled)
  }

  private endSingle(pointerId: string, store: ReturnType<typeof useModel.getState>, cancelled: boolean): void {
    const g = this.singles.get(pointerId)
    if (!g) return
    this.singles.delete(pointerId)

    if (g.kind === 'rotate') {
      const tap = Math.hypot(g.lastX - g.startX, g.lastY - g.startY) < TAP_PX && performance.now() - g.startTime < TAP_MS
      if (tap && store.mode === 'explore') {
        store.set({ selected: g.pressedPart && store.selected !== g.pressedPart ? g.pressedPart : null })
        if (g.pressedPart) play('click')
      } else if (!cancelled) {
        this.momentum.yaw = clamp(g.vx, -6, 6)
        this.momentum.pitch = clamp(g.vy, -6, 6)
      }
      return
    }

    if (g.kind === 'partDrag' && g.partId) {
      this.rig.relocate(g.partId, 'model')
      return
    }

    if (g.kind === 'carry' && g.partId) {
      const id = g.partId
      store.set({ carried: null })
      if (cancelled) {
        this.rig.relocate(id, 'bench')
        return
      }
      const vp = this.viewport()
      const at = this.rig.toScreen(this.rig.partWorld(id, this.tmp), this.camera, vp)
      const slot = this.rig.toScreen(this.rig.slotWorld(id, this.hit), this.camera, vp)
      const tolerance = Math.max(56, this.rig.screenRadius(this.camera, vp.height) * 0.3)
      if (Math.hypot(at.x - slot.x, at.y - slot.y) > tolerance) {
        this.rig.relocate(id, 'bench')
        return
      }
      if (store.tryPlace(id) === 'placed') {
        this.rig.relocate(id, 'model')
        this.rig.flash(id)
        const done = useModel.getState().message?.kind === 'complete'
        play(done ? 'success' : 'snap')
      } else {
        this.rig.relocate(id, 'bench')
        play('wrong')
      }
    }
  }

  update(dt: number): void {
    const store = useModel.getState()
    const vp = this.viewport()

    // Two-hand gestures.
    if (this.two) {
      const a = this.hub.pointers.get(this.two.a)
      const b = this.hub.pointers.get(this.two.b)
      if (!a || !b) {
        this.two = null
      } else {
        const ratio = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)) / this.two.d0
        if (this.two.kind === 'explode') {
          store.set({ explode: clamp(this.two.explode0 + (ratio - 1) * tuning.get().explodeGain, 0, 1) })
        } else if (this.two.kind === 'scale') {
          store.set({ scale: clamp(this.two.scale0 * ratio, 0.5, 2.5) })
        } else if (this.two.kind === 'stretch' && this.two.partId && ratio > STRETCH_TO_STUDY) {
          const id = this.two.partId
          this.singles.delete(this.two.a)
          this.two = null
          this.rig.relocate(id, 'model')
          store.openStudy(id)
          play('open')
        }
      }
    }

    // Single-pointer gestures.
    let rotating = false
    for (const g of this.singles.values()) {
      const p = this.hub.pointers.get(g.pointerId)
      if (!p) continue
      const dx = p.x - g.lastX
      const dy = p.y - g.lastY
      g.lastX = p.x
      g.lastY = p.y
      if (g.kind === 'rotate') {
        rotating = true
        const k = 3.2 / vp.height
        this.rig.rotateBy(dx * k, dy * k)
        if (dt > 0) {
          g.vx += ((dx * k) / dt - g.vx) * 0.35
          g.vy += ((dy * k) / dt - g.vy) * 0.35
        }
      } else if (g.partId) {
        // Drag the part on a camera-facing plane through its slot (2.5D).
        const slot = this.rig.slotWorld(g.partId, this.tmp)
        this.plane.set(new Vector3(0, 0, 1), -slot.z)
        if (this.ray(p.x, p.y).ray.intersectPlane(this.plane, this.hit)) this.rig.carryTo(g.partId, this.hit)
      }
    }

    // Momentum after a rotation is released.
    if (!rotating && !this.two) {
      const decay = Math.exp(-dt * 3.2)
      this.momentum.yaw *= decay
      this.momentum.pitch *= decay
      if (Math.abs(this.momentum.yaw) + Math.abs(this.momentum.pitch) > 0.002) {
        this.rig.rotateBy(this.momentum.yaw * dt, this.momentum.pitch * dt)
      }
    }

    // Hover: the part under any free pointer.
    let hovered: string | null = null
    if (!store.carried && store.mode !== 'study') {
      for (const p of this.hub.scenePointers()) {
        if (p.pressed) continue
        hovered = this.rig.pick(this.ray(p.x, p.y), store.mode === 'assembly' ? ['bench'] : ['model'])
        if (hovered) break
      }
    }
    if (hovered !== this.lastHovered) {
      this.lastHovered = hovered
      store.set({ hovered })
      if (hovered) play('hover')
    }
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}
