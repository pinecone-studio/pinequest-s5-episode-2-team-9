// Pointer handling for the electromagnetism lab: drag to turn the view (with
// momentum), wheel to zoom. Hands and the mouse both arrive through the lab's
// PointerHub. Turning is the whole point here: the fields sit at right angles
// to the currents and forces, and only turning shows it.
import type { Group } from 'three'
import type { HubEvent, PointerHub } from '../interaction/pointerHub'

interface Drag {
  id: string
  lastX: number
  lastY: number
  vx: number
  vy: number
}

export class EmControls {
  private drags = new Map<string, Drag>()
  private momentum = { yaw: 0, pitch: 0 }
  private zoom = 1
  private view: Group | null = null
  private hub: PointerHub
  private viewport: () => { width: number; height: number }

  constructor(hub: PointerHub, viewport: () => { width: number; height: number }) {
    this.hub = hub
    this.viewport = viewport
  }

  attach(): () => void {
    return this.hub.subscribe((e) => this.handle(e))
  }

  /** Sets the group that turns and zooms. */
  configure(view: Group | null): void {
    this.view = view
    this.momentum.yaw = this.momentum.pitch = 0
  }

  private handle(e: HubEvent) {
    if (e.type === 'wheel') {
      this.zoom = Math.min(2.4, Math.max(0.5, this.zoom * Math.exp(-e.deltaY * 0.0012)))
      return
    }
    if (e.type === 'reset') {
      this.zoom = 1
      return
    }
    if (e.type !== 'down' && e.type !== 'up' && e.type !== 'cancel') return
    const p = e.pointer
    if (e.type === 'down') {
      this.drags.set(p.id, { id: p.id, lastX: p.x, lastY: p.y, vx: 0, vy: 0 })
      this.momentum.yaw = this.momentum.pitch = 0
      return
    }
    const d = this.drags.get(p.id)
    if (!d) return
    this.drags.delete(p.id)
    if (e.type === 'up') {
      this.momentum.yaw = d.vx
      this.momentum.pitch = d.vy
    }
  }

  update(dt: number) {
    const view = this.view
    if (!view) return
    const k = 3.2 / this.viewport().height
    let turning = false
    for (const d of this.drags.values()) {
      const p = this.hub.pointers.get(d.id)
      if (!p) continue
      const dx = p.x - d.lastX
      const dy = p.y - d.lastY
      d.lastX = p.x
      d.lastY = p.y
      turning = true
      view.rotation.y += dx * k
      view.rotation.x += dy * k
      if (dt > 0) {
        d.vx += ((dx * k) / dt - d.vx) * 0.35
        d.vy += ((dy * k) / dt - d.vy) * 0.35
      }
    }
    if (!turning) {
      const decay = Math.exp(-dt * 3)
      this.momentum.yaw *= decay
      this.momentum.pitch *= decay
      view.rotation.y += this.momentum.yaw * dt
      view.rotation.x += this.momentum.pitch * dt
    }
    view.rotation.x = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, view.rotation.x))
    const s = view.scale.x + (this.zoom - view.scale.x) * (1 - Math.exp(-dt * 8))
    view.scale.setScalar(s)
  }
}
