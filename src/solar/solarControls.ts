// Pointer handling for the solar system: drag to turn the view, wheel (or the
// two-hand zoom) to zoom, tap a body to select it. Hands and the mouse both
// arrive through the lab's PointerHub.
import { Raycaster, Vector2, type Object3D, type PerspectiveCamera } from 'three'
import type { HubEvent, PointerHub } from '../interaction/pointerHub'

interface Drag {
  id: string
  lastX: number
  lastY: number
  startX: number
  startY: number
  vx: number
  vy: number
}

export class SolarControls {
  /** View angles (radians): yaw about the ecliptic pole, pitch above the ecliptic. */
  yaw = 0
  pitch = 0.42
  /** Multiplies the view's base scale; stays within [minZoom, maxZoom]. */
  zoom = 1
  minZoom = 0.6
  maxZoom = 40
  /** True while someone is turning the view (so auto-framing waits). */
  dragging = false
  private drags = new Map<string, Drag>()
  private momentum = { yaw: 0, pitch: 0 }
  private targets = new Map<Object3D, () => void>()
  private raycaster = new Raycaster()
  private ndc = new Vector2()
  private hub: PointerHub
  private camera: PerspectiveCamera
  private viewport: () => { width: number; height: number }

  constructor(hub: PointerHub, camera: PerspectiveCamera, viewport: () => { width: number; height: number }) {
    this.hub = hub
    this.camera = camera
    this.viewport = viewport
  }

  attach(): () => void {
    return this.hub.subscribe((e) => this.handle(e))
  }

  /** Makes an object tappable. */
  onTap(object: Object3D, tap: () => void): () => void {
    this.targets.set(object, tap)
    return () => this.targets.delete(object)
  }

  setZoom(z: number) {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, z))
  }

  private handle(e: HubEvent) {
    if (e.type === 'wheel') {
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0015))
      return
    }
    if (e.type !== 'down' && e.type !== 'up' && e.type !== 'cancel') return
    const p = e.pointer
    if (e.type === 'down') {
      this.drags.set(p.id, { id: p.id, lastX: p.x, lastY: p.y, startX: p.x, startY: p.y, vx: 0, vy: 0 })
      this.momentum.yaw = this.momentum.pitch = 0
      return
    }
    const d = this.drags.get(p.id)
    if (!d) return
    this.drags.delete(p.id)
    if (e.type === 'cancel') return
    if (Math.hypot(p.x - d.startX, p.y - d.startY) < 8) this.tap(p.x, p.y)
    else {
      this.momentum.yaw = d.vx
      this.momentum.pitch = d.vy
    }
  }

  private tap(x: number, y: number) {
    const { width, height } = this.viewport()
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const objects = [...this.targets.keys()].filter((o) => o.visible)
    const hit = this.raycaster.intersectObjects(objects, true)[0]
    let o: Object3D | null = hit?.object ?? null
    while (o && !this.targets.has(o)) o = o.parent
    if (o) this.targets.get(o)!()
  }

  update(dt: number) {
    const { height } = this.viewport()
    const k = 3.2 / height
    this.dragging = false
    for (const d of this.drags.values()) {
      const p = this.hub.pointers.get(d.id)
      if (!p) continue
      const dx = p.x - d.lastX
      const dy = p.y - d.lastY
      d.lastX = p.x
      d.lastY = p.y
      if (Math.hypot(p.x - d.startX, p.y - d.startY) < 8) continue
      this.dragging = true
      this.yaw += dx * k
      this.pitch += dy * k
      if (dt > 0) {
        d.vx += ((dx * k) / dt - d.vx) * 0.35
        d.vy += ((dy * k) / dt - d.vy) * 0.35
      }
    }
    if (!this.dragging) {
      const decay = Math.exp(-dt * 3)
      this.momentum.yaw *= decay
      this.momentum.pitch *= decay
      this.yaw += this.momentum.yaw * dt
      this.pitch += this.momentum.pitch * dt
    }
    this.pitch = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, this.pitch))
  }
}
