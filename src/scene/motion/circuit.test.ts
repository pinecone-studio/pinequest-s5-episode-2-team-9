import { describe, expect, it } from 'vitest'
import { Circuit, type SegmentDef } from './circuit'
import { HEART_SEGMENTS, TRACER_ROUTE } from './heartCirculation'
import { ROCKET_SEGMENTS, ROCKET_TRACER } from './rocketFlow'

function checkNetwork(segments: SegmentDef[], route: string[], loop: boolean, gap: number) {
  const byId = new Map(segments.map((s) => [s.id, s]))
  expect(byId.size, 'unique ids').toBe(segments.length)
  for (const s of segments) {
    for (const n of s.next ?? []) {
      const next = byId.get(n.id)
      expect(next, `${s.id} → ${n.id} exists`).toBeDefined()
      // Particles hop from the end of one segment to the start of the next: no visible jumps.
      const a = s.points[s.points.length - 1]
      const b = next!.points[0]
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), `${s.id} → ${n.id} joins up`).toBeLessThan(gap)
    }
  }
  route.forEach((id, i) => {
    const next = route[i + 1] ?? (loop ? route[0] : null)
    if (!next) return
    expect(byId.get(id)?.next?.some((n) => n.id === next), `tracer route ${id} → ${next}`).toBe(true)
  })
}

describe('circulation network', () => {
  it('is connected, gap-free, and the tracer route is a real loop', () => {
    checkNetwork(HEART_SEGMENTS, TRACER_ROUTE, true, 1e-9)
  })

  it('passes through the lungs and the body on every lap', () => {
    const regions = TRACER_ROUTE.map((id) => HEART_SEGMENTS.find((s) => s.id === id)!.id)
    expect(regions.filter((id) => id.includes('cap')).length).toBe(2)
    expect(regions.filter((id) => id.startsWith('ub_') || id.startsWith('lb_')).length).toBe(2)
  })
})

describe('rocket propellant network', () => {
  it('is connected and the tracer goes from the tank to the plume', () => {
    checkNetwork(ROCKET_SEGMENTS, ROCKET_TRACER, false, 0.05)
    expect(ROCKET_SEGMENTS.find((s) => s.id === ROCKET_TRACER.at(-1))!.next).toBeUndefined()
  })
})

describe('Circuit', () => {
  const line = (id: string, x0: number, x1: number, extra: Partial<SegmentDef> = {}): SegmentDef => ({
    id,
    points: [
      [x0, 0, 0],
      [x1, 0, 0],
    ],
    radius: 0,
    color: '#fff',
    ...extra,
  })

  it('moves the tracer along its route and reports each segment', () => {
    const c = new Circuit([line('a', 0, 1, { next: [{ id: 'b' }, { id: 'c' }] }), line('b', 1, 2, { next: [{ id: 'a' }] }), line('c', 1, 2, { next: [{ id: 'a' }] })], {
      count: 1,
      size: 1,
      tracerRoute: ['a', 'c'],
    })
    const seen: string[] = []
    c.onTracer = (id) => seen.push(id)
    for (let i = 0; i < 60; i++) c.update(0.1, { speed: () => 1 }, true)
    expect(seen.slice(0, 4)).toEqual(['c', 'a', 'c', 'a'])
  })

  it('holds particles at a shut gate and releases them when it opens', () => {
    const c = new Circuit([line('a', 0, 1, { next: [{ id: 'b' }] }), line('b', 1, 2, { gate: 'valve', next: [{ id: 'a' }] })], {
      count: 1,
      size: 1,
      tracerRoute: ['a', 'b'],
    })
    for (let i = 0; i < 50; i++) c.update(0.1, { speed: () => 1, open: () => false }, true)
    expect(c.tracer).toMatchObject({ id: 'a' })
    expect(c.tracer!.s).toBeLessThan(1)
    for (let i = 0; i < 3; i++) c.update(0.1, { speed: () => 1, open: () => true }, true)
    expect(c.tracer!.id).toBe('b')
  })

  it('respawns particles that reach a dead end at a source', () => {
    const c = new Circuit([line('tank', 0, 1, { source: 1, next: [{ id: 'out' }] }), line('out', 1, 2)], { count: 20, size: 1 })
    for (let i = 0; i < 100; i++) c.update(0.05, { speed: () => 2 }, true)
    const pos = c.object.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getX(i)).toBeGreaterThanOrEqual(0)
      expect(pos.getX(i)).toBeLessThanOrEqual(2)
    }
  })
})
