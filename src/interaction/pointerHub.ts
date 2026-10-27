// One pointer abstraction for hands and the mouse.
// - Hand pointers follow the pinch point; "pressed" = pinched.
// - HUD elements (buttons, links, sliders) get first claim on a press, and can
//   be pressed by hovering a hand over them for `dwellMs` (dwell-click).
// - Everything else is delivered to the 3D scene as down/move/up events.

import type { HandInput } from '../input/handInput'
import { tuning } from '../input/tuning'

export interface Pointer {
  id: string
  kind: 'hand' | 'mouse'
  /** Smoothed screen position (px). */
  x: number
  y: number
  pressed: boolean
  /** Pinch ring fill 0..1 (hands). */
  progress: number
  /** 0..1 progress of a held fist (hands). */
  fist: number
  /** True when the pointer is over a HUD element. */
  overHud: boolean
  /** Press was taken by a HUD control and must not reach the scene. */
  captured: boolean
  /** Hand is temporarily not detected. */
  coasting: boolean
}

export type HubEvent =
  | { type: 'down' | 'up' | 'cancel'; pointer: Pointer }
  | { type: 'wheel'; deltaY: number; x: number; y: number }
  | { type: 'fist'; pointer: Pointer }
  | { type: 'doubleclick'; x: number; y: number }

type Listener = (event: HubEvent) => void

const HUD_SELECTOR = '[data-hud]'
const CONTROL_SELECTOR = 'button:not(:disabled), a[href], input[type="range"], [role="button"]'

interface HandTarget {
  x: number
  y: number
}

export class PointerHub {
  readonly pointers = new Map<string, Pointer>()
  private targets = new Map<string, HandTarget>()
  private listeners = new Set<Listener>()
  private raf: number | null = null
  private lastTick = 0
  private dwell = new Map<string, { el: Element; start: number; done: boolean }>()
  private sliders = new Map<string, HTMLInputElement>()

  constructor() {
    this.tick = this.tick.bind(this)
  }

  start(): void {
    if (this.raf === null) this.raf = requestAnimationFrame(this.tick)
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
    this.dwell.forEach(({ el }) => clearDwell(el))
    this.dwell.clear()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Pointers that the 3D scene should react to. */
  scenePointers(): Pointer[] {
    return [...this.pointers.values()].filter((p) => !p.captured && !(p.overHud && !p.pressed))
  }

  attachHands(input: HandInput): () => void {
    return input.subscribe((snapshot, events) => {
      const seen = new Set<string>()
      for (const hand of snapshot.hands) {
        const id = `hand-${hand.id}`
        seen.add(id)
        this.targets.set(id, hand.cursor)
        const existing = this.pointers.get(id)
        const pointer: Pointer = existing ?? {
          id,
          kind: 'hand',
          x: hand.cursor.x,
          y: hand.cursor.y,
          pressed: false,
          progress: 0,
          fist: 0,
          overHud: false,
          captured: false,
          coasting: false,
        }
        pointer.progress = hand.gesture.pinchProgress
        pointer.fist = hand.gesture.fistProgress
        pointer.coasting = hand.coasting
        this.pointers.set(id, pointer)
      }
      for (const event of events) {
        const pointer = this.pointers.get(`hand-${event.handId}`)
        if (!pointer) continue
        if (event.type === 'pinchStart') this.press(pointer)
        else if (event.type === 'pinchEnd') this.release(pointer, event.cancelled)
        else if (event.type === 'fistHold') this.emit({ type: 'fist', pointer })
      }
      for (const [id, pointer] of this.pointers) {
        if (pointer.kind === 'hand' && !seen.has(id)) {
          if (pointer.pressed) this.release(pointer, true)
          this.pointers.delete(id)
          this.targets.delete(id)
          const d = this.dwell.get(id)
          if (d) clearDwell(d.el)
          this.dwell.delete(id)
        }
      }
    })
  }

  attachMouse(root: HTMLElement): () => void {
    const ensure = (e: PointerEvent): Pointer => {
      let p = this.pointers.get('mouse')
      if (!p) {
        p = { id: 'mouse', kind: 'mouse', x: e.clientX, y: e.clientY, pressed: false, progress: 0, fist: 0, overHud: false, captured: false, coasting: false }
        this.pointers.set('mouse', p)
      }
      p.x = e.clientX
      p.y = e.clientY
      p.overHud = isHud(e.target)
      return p
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return
      const p = ensure(e)
      if (p.overHud) return
      root.setPointerCapture?.(e.pointerId)
      p.pressed = true
      p.captured = false
      this.emit({ type: 'down', pointer: p })
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') ensure(e)
    }
    const onUp = (e: PointerEvent) => {
      const p = this.pointers.get('mouse')
      if (!p || !p.pressed) return
      ensure(e)
      p.pressed = false
      this.emit({ type: 'up', pointer: p })
    }
    const onLeave = () => {
      const p = this.pointers.get('mouse')
      if (p && !p.pressed) this.pointers.delete('mouse')
    }
    const onWheel = (e: WheelEvent) => {
      if (isHud(e.target)) return
      e.preventDefault()
      this.emit({ type: 'wheel', deltaY: e.deltaY, x: e.clientX, y: e.clientY })
    }
    const onDouble = (e: MouseEvent) => {
      if (!isHud(e.target)) this.emit({ type: 'doubleclick', x: e.clientX, y: e.clientY })
    }
    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onUp)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('dblclick', onDouble)
    return () => {
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onUp)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('dblclick', onDouble)
      this.pointers.delete('mouse')
    }
  }

  private press(pointer: Pointer) {
    pointer.pressed = true
    const control = controlAt(pointer.x, pointer.y)
    if (control) {
      pointer.captured = true
      if (control instanceof HTMLInputElement && control.type === 'range') {
        this.sliders.set(pointer.id, control)
        setSliderFromX(control, pointer.x)
      } else {
        ;(control as HTMLElement).click()
        const d = this.dwell.get(pointer.id)
        if (d) d.done = true
      }
      return
    }
    pointer.captured = false
    this.emit({ type: 'down', pointer })
  }

  private release(pointer: Pointer, cancelled: boolean) {
    pointer.pressed = false
    this.sliders.delete(pointer.id)
    if (pointer.captured) {
      pointer.captured = false
      return
    }
    this.emit({ type: cancelled ? 'cancel' : 'up', pointer })
  }

  private emit(event: HubEvent) {
    this.listeners.forEach((l) => l(event))
  }

  private tick(now: number) {
    const dt = this.lastTick ? Math.min(now - this.lastTick, 100) : 16
    this.lastTick = now
    const t = tuning.get()
    // Frame-rate independent exponential smoothing toward the latest tracked point.
    const k = 1 - Math.pow(1 - t.cursorLerp, dt / 16.7)
    for (const [id, target] of this.targets) {
      const p = this.pointers.get(id)
      if (!p) continue
      p.x += (target.x - p.x) * k
      p.y += (target.y - p.y) * k
      p.overHud = isHud(document.elementFromPoint(p.x, p.y))
      const slider = this.sliders.get(id)
      if (slider && p.pressed) setSliderFromX(slider, p.x)
      this.updateDwell(p, now, t.dwellMs)
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  private updateDwell(p: Pointer, now: number, dwellMs: number) {
    const current = this.dwell.get(p.id)
    const control = p.pressed ? null : controlAt(p.x, p.y)
    const dwellable = control && !(control instanceof HTMLInputElement) ? control : null
    if (!dwellable) {
      if (current) clearDwell(current.el)
      this.dwell.delete(p.id)
      return
    }
    if (!current || current.el !== dwellable) {
      if (current) clearDwell(current.el)
      this.dwell.set(p.id, { el: dwellable, start: now, done: false })
      return
    }
    if (current.done) return
    const progress = Math.min(1, (now - current.start) / dwellMs)
    ;(dwellable as HTMLElement).style.setProperty('--dwell', progress.toFixed(3))
    dwellable.classList.add('is-dwelling')
    if (progress >= 1) {
      current.done = true
      clearDwell(dwellable)
      ;(dwellable as HTMLElement).click()
    }
  }
}

function isHud(target: EventTarget | Element | null): boolean {
  return target instanceof Element && target.closest(HUD_SELECTOR) !== null
}

function controlAt(x: number, y: number): Element | null {
  const el = document.elementFromPoint(x, y)
  if (!el || !isHud(el)) return null
  return el.closest(CONTROL_SELECTOR)
}

function clearDwell(el: Element) {
  ;(el as HTMLElement).style.removeProperty('--dwell')
  el.classList.remove('is-dwelling')
}

function setSliderFromX(input: HTMLInputElement, x: number) {
  const rect = input.getBoundingClientRect()
  const min = Number(input.min || 0)
  const max = Number(input.max || 100)
  const step = Number(input.step || 1)
  const f = Math.min(1, Math.max(0, (x - rect.left) / rect.width))
  const raw = min + f * (max - min)
  const value = Math.round(raw / step) * step
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
