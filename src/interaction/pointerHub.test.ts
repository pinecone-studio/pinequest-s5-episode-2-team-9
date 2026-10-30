// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandInput, HandState, HandsSnapshot, InputEvent } from '../input/handInput'
import { tuning } from '../input/tuning'
import { PointerHub, type HubEvent } from './pointerHub'

// jsdom does no layout, so the HUD is laid out by hand: a strip along the top of the screen.
//   button 0–100 · slider 100–300 · link 300–400 · disabled button 400–500 · bare panel 500–600
document.body.innerHTML = `
  <div id="hud" data-hud>
    <button id="button">Go</button>
    <input id="slider" type="range" min="0" max="10" step="2" value="0" />
    <a id="link" href="#more">More</a>
    <button id="disabled" disabled>Off</button>
  </div>
  <div id="scene"></div>
`
const el = (id: string) => document.getElementById(id)!
const button = el('button') as HTMLButtonElement
const slider = el('slider') as HTMLInputElement
const STRIP = [
  { id: 'button', from: 0, to: 100 },
  { id: 'slider', from: 100, to: 300 },
  { id: 'link', from: 300, to: 400 },
  { id: 'disabled', from: 400, to: 500 },
  { id: 'hud', from: 500, to: 600 },
]
Object.defineProperty(document, 'elementFromPoint', {
  configurable: true,
  value: (x: number, y: number) => {
    if (y < 0 || y >= 50) return el('scene')
    const hit = STRIP.find((s) => x >= s.from && x < s.to)
    return hit ? el(hit.id) : el('scene')
  },
})
slider.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 50 }) as DOMRect

/** Animation frames, stepped by the test. */
let frame: FrameRequestCallback | null = null
const cancelled = vi.fn()
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  frame = cb
  return 1
})
vi.stubGlobal('cancelAnimationFrame', () => {
  frame = null
  cancelled()
})
let now = 1000
const tick = (ms = 16) => {
  now += ms
  const cb = frame!
  frame = null
  cb(now)
}

/** A stand-in hand tracker. */
function fakeInput() {
  let listener: ((s: HandsSnapshot, e: InputEvent[]) => void) | null = null
  return {
    input: { subscribe: (l: typeof listener) => ((listener = l), () => (listener = null)) } as unknown as HandInput,
    send: (hands: HandState[], events: InputEvent[] = []) =>
      listener?.({ hands, time: now, trackingFps: 30, palmPush: 0 }, events),
  }
}

interface HandOptions {
  pinch?: number
  fist?: number
  bloom?: number | null
  coasting?: boolean
}
const hand = (id: number, x: number, y: number, o: HandOptions = {}) =>
  ({
    id,
    cursor: { x, y },
    coasting: o.coasting ?? false,
    gesture: { pinchProgress: o.pinch ?? 0, fistProgress: o.fist ?? 0 },
    bloom: o.bloom != null ? { phase: 'active', factor: o.bloom } : { phase: 'idle', factor: 1 },
  }) as unknown as HandState

let hub: PointerHub
let events: HubEvent[]
let tracker: ReturnType<typeof fakeInput>
const types = () => events.map((e) => e.type)

beforeEach(() => {
  hub = new PointerHub()
  events = []
  hub.subscribe((e) => events.push(e))
  tracker = fakeInput()
  hub.attachHands(tracker.input)
  hub.start()
})

afterEach(() => {
  hub.stop()
  slider.value = '0'
})

describe('hand pointers', () => {
  it('follows each tracked hand', () => {
    tracker.send([hand(0, 700, 300, { pinch: 0.4, fist: 0.2, coasting: true }), hand(1, 200, 600, { bloom: 1.3 })])
    expect([...hub.pointers.keys()]).toEqual(['hand-0', 'hand-1'])
    expect(hub.pointers.get('hand-0')).toMatchObject({ kind: 'hand', x: 700, y: 300, progress: 0.4, fist: 0.2, coasting: true, bloom: null, pressed: false })
    // The bloom factor is passed on only while a bloom is active.
    expect(hub.pointers.get('hand-1')!.bloom).toBe(1.3)
    tracker.send([hand(0, 700, 300), hand(1, 200, 600)])
    expect(hub.pointers.get('hand-1')!.bloom).toBeNull()
  })

  it('glides toward the tracked point, at the same pace whatever the frame rate', () => {
    const k = (ms: number) => 1 - Math.pow(1 - tuning.get().cursorLerp, ms / 16.7)
    tracker.send([hand(0, 700, 300)])
    tracker.send([hand(0, 800, 300)])
    expect(hub.pointers.get('hand-0')!.x).toBe(700)
    tick(16)
    const x1 = 700 + 100 * k(16)
    expect(hub.pointers.get('hand-0')!.x).toBeCloseTo(x1, 9)
    // Two half frames cover the same ground as one full one.
    tick(8)
    tick(8)
    expect(hub.pointers.get('hand-0')!.x).toBeCloseTo(x1 + (800 - x1) * k(16), 9)
    // A long stall counts as at most 100 ms.
    const x2 = hub.pointers.get('hand-0')!.x
    tick(1000)
    expect(hub.pointers.get('hand-0')!.x).toBeCloseTo(x2 + (800 - x2) * k(100), 9)
  })

  it('turns pinches into presses on the scene', () => {
    tracker.send([hand(0, 700, 300)])
    tracker.send([hand(0, 700, 300)], [{ type: 'pinchStart', handId: 0, time: now }])
    expect(hub.pointers.get('hand-0')).toMatchObject({ pressed: true, captured: false })
    tracker.send([hand(0, 700, 300)], [{ type: 'pinchEnd', handId: 0, time: now, cancelled: false }])
    tracker.send([hand(0, 700, 300)], [{ type: 'pinchStart', handId: 0, time: now }])
    tracker.send([hand(0, 700, 300)], [{ type: 'pinchEnd', handId: 0, time: now, cancelled: true }])
    expect(types()).toEqual(['down', 'up', 'down', 'cancel'])
    expect(events.every((e) => 'pointer' in e && e.pointer.id === 'hand-0')).toBe(true)
  })

  it('passes fists, blooms and palm pushes on as their own events', () => {
    tracker.send([hand(0, 700, 300)])
    tracker.send(
      [hand(0, 700, 300)],
      [
        { type: 'fistHold', handId: 0, time: now },
        { type: 'bloomStart', handId: 0, time: now, mode: 'grow' },
        { type: 'bloomEnd', handId: 0, time: now },
        { type: 'palmPush', time: now },
        // Events for a hand that is not tracked are dropped.
        { type: 'fistHold', handId: 7, time: now },
      ],
    )
    expect(events).toEqual([
      { type: 'fist', pointer: hub.pointers.get('hand-0') },
      { type: 'bloom', phase: 'start', pointer: hub.pointers.get('hand-0') },
      { type: 'bloom', phase: 'end', pointer: hub.pointers.get('hand-0') },
      { type: 'reset' },
    ])
  })

  it('cancels the press of a hand that leaves the camera', () => {
    tracker.send([hand(0, 700, 300), hand(1, 200, 600)], [{ type: 'pinchStart', handId: 0, time: now }])
    tracker.send([hand(1, 200, 600)])
    expect(types()).toEqual(['down', 'cancel'])
    expect([...hub.pointers.keys()]).toEqual(['hand-1'])
    // It stops being steered too.
    tick()
    expect(hub.pointers.has('hand-0')).toBe(false)
  })
})

describe('HUD controls', () => {
  it('clicks a button with a pinch, without the scene seeing it', () => {
    const click = vi.fn()
    button.addEventListener('click', click)
    tracker.send([hand(0, 50, 20)])
    tick()
    expect(hub.pointers.get('hand-0')!.overHud).toBe(true)
    tracker.send([hand(0, 50, 20)], [{ type: 'pinchStart', handId: 0, time: now }])
    expect(click).toHaveBeenCalledTimes(1)
    expect(hub.pointers.get('hand-0')!.captured).toBe(true)
    expect(hub.scenePointers()).toEqual([])
    tracker.send([hand(0, 50, 20)], [{ type: 'pinchEnd', handId: 0, time: now, cancelled: false }])
    expect(events).toEqual([])
    expect(hub.pointers.get('hand-0')!.captured).toBe(false)
    button.removeEventListener('click', click)
  })

  it('follows links with a pinch', () => {
    const click = vi.fn((e: Event) => e.preventDefault())
    el('link').addEventListener('click', click)
    tracker.send([hand(0, 350, 20)], [{ type: 'pinchStart', handId: 0, time: now }])
    expect(click).toHaveBeenCalledTimes(1)
    el('link').removeEventListener('click', click)
  })

  it('drags a slider while pinched, snapping to its steps', () => {
    const input = vi.fn()
    slider.addEventListener('input', input)
    // 30% along a 0–10 slider in steps of 2: 3 rounds to 4.
    tracker.send([hand(0, 160, 20)], [{ type: 'pinchStart', handId: 0, time: now }])
    expect(slider.value).toBe('4')
    expect(input).toHaveBeenCalledTimes(1)
    expect(types()).toEqual([])
    // Moving the hand moves the thumb, clamped to the ends.
    tracker.send([hand(0, 400, 20)])
    for (let i = 0; i < 30; i++) tick()
    expect(slider.value).toBe('10')
    tracker.send([hand(0, 400, 20)], [{ type: 'pinchEnd', handId: 0, time: now, cancelled: false }])
    tracker.send([hand(0, 100, 20)])
    for (let i = 0; i < 30; i++) tick()
    expect(slider.value).toBe('10')
    expect(types()).toEqual([])
    slider.removeEventListener('input', input)
  })

  it('keeps a pinch on the bare panel or a disabled button away from the scene, like the mouse', () => {
    for (const x of [550, 450]) {
      tracker.send([hand(0, x, 20)])
      tick()
      tracker.send([hand(0, x, 20)], [{ type: 'pinchStart', handId: 0, time: now }])
      expect(hub.pointers.get('hand-0')).toMatchObject({ pressed: true, captured: true })
      expect(hub.scenePointers()).toEqual([])
      // Dragging the pinch out over the scene does not start a scene gesture either.
      tracker.send([hand(0, x, 400)])
      for (let i = 0; i < 20; i++) tick()
      expect(hub.scenePointers()).toEqual([])
      tracker.send([hand(0, x, 400)], [{ type: 'pinchEnd', handId: 0, time: now, cancelled: false }])
      expect(hub.pointers.get('hand-0')).toMatchObject({ pressed: false, captured: false })
      tracker.send([])
    }
    expect(events).toEqual([])
  })

  it('treats a disabled button as part of the panel, not a control', () => {
    const click = vi.fn()
    el('disabled').addEventListener('click', click)
    tracker.send([hand(0, 450, 20)])
    tick()
    expect(hub.pointers.get('hand-0')!.overHud).toBe(true)
    expect(hub.scenePointers()).toEqual([])
    tick(tuning.get().dwellMs / 2)
    expect(el('disabled').classList.contains('is-dwelling')).toBe(false)
    for (let i = 0; i < 200; i++) tick()
    expect(click).not.toHaveBeenCalled()
    expect(el('disabled').classList.contains('is-dwelling')).toBe(false)
  })
})

describe('dwell-click', () => {
  const dwellMs = () => tuning.get().dwellMs

  it('clicks a control after a hand hovers over it for a while, once', () => {
    const click = vi.fn()
    button.addEventListener('click', click)
    tracker.send([hand(0, 50, 20)])
    tick()
    tick(dwellMs() / 2)
    expect(button.classList.contains('is-dwelling')).toBe(true)
    expect(Number(button.style.getPropertyValue('--dwell'))).toBeCloseTo(0.5, 2)
    expect(click).not.toHaveBeenCalled()
    tick(dwellMs() / 2)
    expect(click).toHaveBeenCalledTimes(1)
    expect(button.classList.contains('is-dwelling')).toBe(false)
    expect(button.style.getPropertyValue('--dwell')).toBe('')
    for (let i = 0; i < 10; i++) tick(dwellMs())
    expect(click).toHaveBeenCalledTimes(1)
    button.removeEventListener('click', click)
  })

  it('starts over when the hand moves off', () => {
    const click = vi.fn()
    button.addEventListener('click', click)
    tracker.send([hand(0, 50, 20)])
    tick()
    tick(dwellMs() * 0.8)
    // Off the button (the cursor glides, so give it a few frames).
    tracker.send([hand(0, 50, 400)])
    for (let i = 0; i < 20; i++) tick()
    expect(button.classList.contains('is-dwelling')).toBe(false)
    tracker.send([hand(0, 50, 20)])
    for (let i = 0; i < 20; i++) tick()
    tick(dwellMs() * 0.5)
    expect(click).not.toHaveBeenCalled()

    button.removeEventListener('click', click)
  })

  it('never dwells on sliders', () => {
    const input = vi.fn()
    slider.addEventListener('input', input)
    tracker.send([hand(0, 200, 20)])
    tick()
    tick(dwellMs() / 2)
    expect(slider.classList.contains('is-dwelling')).toBe(false)
    tick(dwellMs())
    tick(dwellMs())
    expect(slider.classList.contains('is-dwelling')).toBe(false)
    expect(input).not.toHaveBeenCalled()
    slider.removeEventListener('input', input)
  })

  it('does not dwell while the hand is pinched', () => {
    const click = vi.fn()
    button.addEventListener('click', click)
    // Pinch on the scene, then drag over the button and hold there.
    tracker.send([hand(0, 50, 400)], [{ type: 'pinchStart', handId: 0, time: now }])
    tracker.send([hand(0, 50, 20)])
    for (let i = 0; i < 20; i++) tick()
    tick(dwellMs() / 2)
    expect(button.classList.contains('is-dwelling')).toBe(false)
    tick(dwellMs() * 2)
    expect(click).not.toHaveBeenCalled()
    button.removeEventListener('click', click)
  })

  it('does not click twice when a pinch beats the dwell', () => {
    const click = vi.fn()
    button.addEventListener('click', click)
    tracker.send([hand(0, 50, 20)])
    tick()
    tick(dwellMs() / 2)
    tracker.send([hand(0, 50, 20)], [{ type: 'pinchStart', handId: 0, time: now }])
    tracker.send([hand(0, 50, 20)], [{ type: 'pinchEnd', handId: 0, time: now, cancelled: false }])
    tick(dwellMs())
    tick(dwellMs())
    expect(click).toHaveBeenCalledTimes(1)
    button.removeEventListener('click', click)
  })

  it('clears the dwell ring when the hand is lost or the hub stops', () => {
    tracker.send([hand(0, 50, 20)])
    tick()
    tick(dwellMs() / 2)
    tracker.send([])
    expect(button.classList.contains('is-dwelling')).toBe(false)

    tracker.send([hand(0, 50, 20)])
    tick()
    tick(dwellMs() / 2)
    expect(button.classList.contains('is-dwelling')).toBe(true)
    hub.stop()
    expect(cancelled).toHaveBeenCalled()
    expect(button.classList.contains('is-dwelling')).toBe(false)
  })
})

describe('mouse', () => {
  let detach: () => void
  beforeEach(() => {
    detach = hub.attachMouse(document.body)
  })
  afterEach(() => detach())

  const pointer = (type: string, target: Element, x: number, y: number, init: PointerEventInit = {}) =>
    target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerType: 'mouse', bubbles: true, ...init }))

  it('presses, moves and releases on the scene', () => {
    pointer('pointermove', el('scene'), 400, 300)
    expect(hub.pointers.get('mouse')).toMatchObject({ kind: 'mouse', x: 400, y: 300, pressed: false, overHud: false })
    pointer('pointerdown', el('scene'), 400, 300)
    pointer('pointermove', el('scene'), 450, 320)
    pointer('pointerup', el('scene'), 460, 330)
    expect(types()).toEqual(['down', 'up'])
    expect(hub.pointers.get('mouse')).toMatchObject({ x: 460, y: 330, pressed: false })
  })

  it('does not track touches as the mouse', () => {
    pointer('pointermove', el('scene'), 400, 300, { pointerType: 'touch' })
    expect(hub.pointers.has('mouse')).toBe(false)
  })

  it('leaves presses on the HUD, right clicks and touches alone', () => {
    pointer('pointerdown', button, 50, 20)
    pointer('pointerdown', el('scene'), 400, 300, { button: 2 })
    pointer('pointerdown', el('scene'), 400, 300, { pointerType: 'touch' })
    expect(events).toEqual([])
    // A release with nothing pressed is ignored.
    pointer('pointerup', el('scene'), 400, 300)
    expect(events).toEqual([])
  })

  it('treats a cancelled press as a release', () => {
    pointer('pointerdown', el('scene'), 400, 300)
    pointer('pointercancel', el('scene'), 400, 300)
    expect(types()).toEqual(['down', 'up'])
  })

  it('forgets the mouse when it leaves, unless a button is held', () => {
    pointer('pointermove', el('scene'), 400, 300)
    pointer('pointerleave', document.body, 400, 300)
    expect(hub.pointers.has('mouse')).toBe(false)
    pointer('pointerdown', el('scene'), 400, 300)
    pointer('pointerleave', document.body, 400, 300)
    expect(hub.pointers.get('mouse')!.pressed).toBe(true)
  })

  it('zooms with the wheel and opens with a double click, except over the HUD', () => {
    const wheel = new WheelEvent('wheel', { deltaY: -120, clientX: 400, clientY: 300, bubbles: true, cancelable: true })
    el('scene').dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)
    el('scene').dispatchEvent(new MouseEvent('dblclick', { clientX: 410, clientY: 310, bubbles: true }))
    const overHud = new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true })
    button.dispatchEvent(overHud)
    button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(overHud.defaultPrevented).toBe(false)
    expect(events).toEqual([
      { type: 'wheel', deltaY: -120, x: 400, y: 300 },
      { type: 'doubleclick', x: 410, y: 310 },
    ])
  })

  it('stops listening when detached', () => {
    pointer('pointermove', el('scene'), 400, 300)
    detach()
    expect(hub.pointers.has('mouse')).toBe(false)
    pointer('pointerdown', el('scene'), 400, 300)
    expect(events).toEqual([])
    detach = () => {}
  })
})

describe('scene pointers', () => {
  it('leaves out pointers resting on the HUD or captured by a control', () => {
    tracker.send([hand(0, 700, 300), hand(1, 50, 20), hand(2, 550, 20)])
    tick()
    // Over the bare panel: not a control, but still the HUD.
    expect(hub.scenePointers().map((p) => p.id)).toEqual(['hand-0'])
    tracker.send([hand(0, 700, 300), hand(1, 50, 20), hand(2, 550, 20)], [{ type: 'pinchStart', handId: 1, time: now }])
    expect(hub.scenePointers().map((p) => p.id)).toEqual(['hand-0'])
  })

  it('stops sending events to a listener that unsubscribed', () => {
    const late: HubEvent[] = []
    const off = hub.subscribe((e) => late.push(e))
    off()
    tracker.send([hand(0, 700, 300)], [{ type: 'palmPush', time: now }])
    expect(late).toEqual([])
    expect(types()).toEqual(['reset'])
  })
})
