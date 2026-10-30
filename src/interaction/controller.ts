// Turns pointer events (hands + mouse) into model interactions:
//   one pointer: rotate (mouse flicks keep momentum), drag a part out, carry a part (assembly),
//                tap to select, double pinch a part = open Study
//   two hands:   pinch near the model and pull apart = explode; away from it = scale;
//                twist both hands like a wheel = roll;
//                hold a part + pull with the other hand = open Study;
//                push both open palms towards the camera = reset the view.
//   in study:    the shown part (or piece) splits into its pieces: pinch near it and pull apart =
//                spread them; hold a piece + pull with the other hand, tap or double click it =
//                go into that piece; fist = back up one level.
//   bloom:       five fingertips gathered then opened (or the reverse) = scale the model,
//                following the fingertip spread live. A blooming hand holds nothing (a bud is
//                not a pinch), so it scales what is on screen: the model, or the part in Study.
// Hands are stabilized: small jitter is ignored, and letting go restores the pose from just
// before the fingers opened, so the model stays exactly where it was left.

import { Plane, Quaternion, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three'
import { play } from '../audio/sfx'
import { tuning } from '../input/tuning'
import { PinchPair } from '../input/twoHands'
import { useLab } from '../lab/labStore'
import { useModel } from '../lab/modelStore'
import { piecesAt } from '../models/ModelDefinition'
import type { ModelRig } from '../scene/modelRig'
import { gestureHud } from './gestureHud'
import type { HubEvent, Pointer, PointerHub } from './pointerHub'

interface SingleGesture {
  kind: 'rotate' | 'partDrag' | 'carry'
  pointerId: string
  hand: boolean
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
  pair: PinchPair
  explode0: number
  scale0: number
  partId: string | null
}

interface Snapshot {
  time: number
  explode: number
  pieceSpread: number
  scale: number
  rotation: Quaternion
}

const STRETCH_TO_STUDY = 1.35
/** User zoom limits, shared by wheel, two-hand scale and bloom. */
const MIN_SCALE = 0.5
const MAX_SCALE = 2.5
/** In assembly the model sits above the bench, so it cannot grow as far. */
const MAX_ASSEMBLY_SCALE = 1.6

function clampScale(scale: number): number {
  const max = useModel.getState().mode === 'assembly' ? MAX_ASSEMBLY_SCALE : MAX_SCALE
  return clamp(scale, MIN_SCALE, max)
}
const TAP_PX = 10
const TAP_MS = 400
/** Two pinches on the same part within this time open it in Study. */
const DOUBLE_PINCH_MS = 450
/** Hand movement inside this band is ignored (tracking jitter). */
const HAND_BAND_PX = 3
/** On release, the pose is restored from this long before (opening the fingers moves the hand). */
const RELEASE_SETTLE_MS = 180

export class InteractionController {
  private singles = new Map<string, SingleGesture>()
  private two: TwoHandGesture | null = null
  /** Active blooms: pointer id → model scale when the bloom started. */
  private blooms = new Map<string, number>()
  private momentum = { yaw: 0, pitch: 0 }
  private raycaster = new Raycaster()
  private ndc = new Vector2()
  private plane = new Plane()
  private hit = new Vector3()
  private tmp = new Vector3()
  private lastHovered: string | null = null
  private lastHoveredPiece: string | null = null
  private lastTap: { part: string; time: number } | null = null
  /** Recent poses during a hand gesture, for restoring on release. */
  private history: Snapshot[] = []

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
      store.set({ scale: clampScale(store.scale * Math.exp(-e.deltaY * 0.0012)) })
      return
    }
    if (e.type === 'doubleclick') {
      if (store.mode === 'study' && store.studyPart) {
        const id = this.rig.pickPiece(this.ray(e.x, e.y), store.studyPart, store.studyPath)
        if (id) {
          store.openPiece(id)
          play('open')
        }
      } else if (store.mode === 'explore') {
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
    if (e.type === 'bloom') {
      if (e.phase === 'end') this.blooms.delete(e.pointer.id)
      else if (!this.two) this.blooms.set(e.pointer.id, store.scale)
      return
    }
    if (e.type === 'reset') {
      if (store.mode === 'assembly' || store.carried) return
      this.two = null
      this.blooms.clear()
      this.history = []
      this.stopMomentum()
      store.resetView()
      play('click')
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
    else if (store.mode === 'study') store.closePiece()
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
      const pair = new PinchPair(a, p)
      if (other.kind === 'partDrag' && other.partId) {
        this.two = { kind: 'stretch', a: other.pointerId, b: p.id, pair, explode0: 0, scale0: 0, partId: other.partId }
        return
      }
      // Study: holding a piece and pulling with the other hand goes into that piece.
      if (store.mode === 'study' && other.kind === 'rotate' && other.pressedPart) {
        this.singles.delete(other.pointerId)
        this.stopMomentum()
        this.two = { kind: 'stretch', a: other.pointerId, b: p.id, pair, explode0: 0, scale0: 0, partId: other.pressedPart }
        return
      }
      if (other.kind === 'carry') return
      this.singles.delete(other.pointerId)
      this.stopMomentum()
      const center = this.rig.screenCenter(this.camera, this.viewport())
      const radius = this.rig.screenRadius(this.camera, this.viewport().height) * tuning.get().explodeNearRadius
      const near = [a, p].every((q) => Math.hypot(q.x - center.x, q.y - center.y) < radius)
      const spreadable = store.mode === 'explore' || (store.mode === 'study' && hasPieces(store))
      const kind = near && spreadable ? 'explode' : 'scale'
      const explode0 = store.mode === 'study' ? store.pieceSpread : store.explode
      this.two = { kind, a: other.pointerId, b: p.id, pair, explode0, scale0: store.scale, partId: null }
      // Two-hand zoom takes over from any one-hand bloom.
      this.blooms.clear()
      this.history = []
      return
    }

    const gesture: SingleGesture = {
      kind: 'rotate',
      pointerId: p.id,
      hand: p.kind === 'hand',
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
    this.history = []

    if (store.mode === 'assembly') {
      const id = this.rig.pick(this.ray(p.x, p.y), ['bench'])
      if (id) {
        gesture.kind = 'carry'
        gesture.partId = id
        this.rig.relocate(id, 'carry')
        store.set({ carried: id, hovered: null })
        play('pick')
      }
    } else if (store.mode === 'study' && store.studyPart) {
      // pressedPart holds the piece under the pointer here.
      gesture.pressedPart = this.rig.pickPiece(this.ray(p.x, p.y), store.studyPart, store.studyPath)
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
      if (!cancelled && ended.kind !== 'stretch') this.settle(ended.kind)
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

    const now = performance.now()
    const tap = Math.hypot(g.lastX - g.startX, g.lastY - g.startY) < TAP_PX && now - g.startTime < TAP_MS
    if (tap && g.hand && g.pressedPart && store.mode === 'explore') {
      const last = this.lastTap
      this.lastTap = { part: g.pressedPart, time: now }
      if (last && last.part === g.pressedPart && now - last.time < DOUBLE_PINCH_MS) {
        this.lastTap = null
        if (g.partId) this.rig.relocate(g.partId, 'model')
        store.openStudy(g.pressedPart)
        play('open')
        return
      }
    }

    if (g.kind === 'rotate') {
      if (tap && store.mode === 'explore') {
        store.set({ selected: g.pressedPart && store.selected !== g.pressedPart ? g.pressedPart : null })
        if (g.pressedPart) play('click')
      } else if (tap && store.mode === 'study') {
        if (g.pressedPart) {
          store.openPiece(g.pressedPart)
          play('open')
        }
      } else if (cancelled) {
        // Tracking lost: nothing to restore or fling.
      } else if (g.hand) {
        this.settle('rotate')
      } else {
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

  /** A hand let go: restore the pose from just before its fingers started to open. */
  private settle(kind: 'explode' | 'scale' | 'rotate'): void {
    const cutoff = performance.now() - RELEASE_SETTLE_MS
    let snap: Snapshot | undefined
    for (const s of this.history) if (s.time <= cutoff) snap = s
    snap ??= this.history[0]
    this.history = []
    if (!snap) return
    this.rig.rotation.copy(snap.rotation)
    if (kind === 'explode') useModel.getState().set(useModel.getState().mode === 'study' ? { pieceSpread: snap.pieceSpread } : { explode: snap.explode })
    if (kind === 'scale') useModel.getState().set({ scale: snap.scale })
  }

  private record(): void {
    const now = performance.now()
    const store = useModel.getState()
    const old = this.history[0]
    const reuse = old && now - old.time > RELEASE_SETTLE_MS * 2 ? this.history.shift()! : null
    const snap = reuse ?? { time: 0, explode: 0, pieceSpread: 0, scale: 0, rotation: new Quaternion() }
    snap.time = now
    snap.explode = store.explode
    snap.pieceSpread = store.pieceSpread
    snap.scale = store.scale
    snap.rotation.copy(this.rig.rotation)
    this.history.push(snap)
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
        const { ratio, turn } = this.two.pair.update(a, b)
        // Twisting both hands like a wheel rolls the model about the view axis (screen y points down, so negate).
        if (this.two.kind !== 'stretch' && turn) this.rig.rotateBy(0, 0, -turn)
        if (this.two.kind === 'explode') {
          const amount = clamp(this.two.explode0 + (ratio - 1) * tuning.get().explodeGain, 0, 1)
          store.set(store.mode === 'study' ? { pieceSpread: amount } : { explode: amount })
        } else if (this.two.kind === 'scale') {
          store.set({ scale: clampScale(this.two.scale0 * ratio) })
        } else if (this.two.kind === 'stretch' && this.two.partId && ratio > STRETCH_TO_STUDY) {
          const id = this.two.partId
          this.singles.delete(this.two.a)
          this.two = null
          if (store.mode === 'study') store.openPiece(id)
          else {
            this.rig.relocate(id, 'model')
            store.openStudy(id)
          }
          play('open')
        }
      }
    }

    // One-hand bloom: the scale follows the fingertip spread live.
    if (!this.two) {
      for (const [id, base] of this.blooms) {
        const factor = this.hub.pointers.get(id)?.bloom
        if (factor == null) this.blooms.delete(id)
        else store.set({ scale: clampScale(base * factor) })
      }
    }
    gestureHud.two = this.two ? { kind: this.two.kind, a: this.two.a, b: this.two.b } : null

    // Single-pointer gestures.
    let rotating = false
    for (const g of this.singles.values()) {
      const p = this.hub.pointers.get(g.pointerId)
      if (!p) continue
      let dx = p.x - g.lastX
      let dy = p.y - g.lastY
      if (g.hand) {
        // Jitter band: the anchor only moves once the hand leaves it, then trails at its edge.
        const m = Math.hypot(dx, dy)
        const keep = m > HAND_BAND_PX ? (m - HAND_BAND_PX) / m : 0
        dx *= keep
        dy *= keep
      }
      g.lastX += dx
      g.lastY += dy
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

    const handGesture = this.two ? this.two.kind !== 'stretch' : [...this.singles.values()].some((g) => g.hand && g.kind === 'rotate')
    if (handGesture) this.record()

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

    // Study: the piece under any free pointer.
    let hoveredPiece: string | null = null
    if (store.mode === 'study' && store.studyPart) {
      for (const p of this.hub.scenePointers()) {
        if (p.pressed) continue
        hoveredPiece = this.rig.pickPiece(this.ray(p.x, p.y), store.studyPart, store.studyPath)
        if (hoveredPiece) break
      }
    }
    if (hoveredPiece !== this.lastHoveredPiece) {
      this.lastHoveredPiece = hoveredPiece
      store.set({ hoveredPiece })
      if (hoveredPiece) play('hover')
    }
  }
}

/** The part or piece shown in Study splits into pieces. */
function hasPieces(store: ReturnType<typeof useModel.getState>): boolean {
  const part = store.def?.parts.find((p) => p.id === store.studyPart)
  return !!part && piecesAt(part, store.studyPath).length > 0
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}
