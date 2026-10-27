// Pointer handling for the atoms lab: grab-and-drop for registered draggables
// (particle bins, particles, the hydrogen electron), and rotate/zoom the view
// otherwise. Works for hands and the mouse through the shared PointerHub.

import { Plane, Raycaster, Vector2, Vector3, type Group, type Object3D, type PerspectiveCamera } from 'three'
import type { HubEvent, PointerHub } from '../interaction/pointerHub'

export interface Draggable {
  object: Object3D
  /** Called on press; return false to refuse the grab. */
  grab: (world: Vector3) => boolean | void
  move: (world: Vector3) => void
  release: (world: Vector3) => void
  /** Simple click (press + release without moving). */
  tap?: () => void
}

interface Active {
  pointerId: string
  target: Draggable | null
  lastX: number
  lastY: number
  startX: number
  startY: number
  vx: number
  vy: number
}

export class AtomInteraction {
  private draggables = new Set<Draggable>()
  private active = new Map<string, Active>()
  private raycaster = new Raycaster()
  private ndc = new Vector2()
  private plane = new Plane(new Vector3(0, 0, 1), 0)
  private hit = new Vector3()
  private momentum = { yaw: 0, pitch: 0 }
  private hub: PointerHub
  private camera: PerspectiveCamera
  private viewport: () => { width: number; height: number }
  /** The group that rotates when nothing is grabbed. */
  private view: Group | null = null
  private rotateEnabled = true
  private scale = 1

  /** Sets the group that rotates/zooms, and whether dragging empty space rotates it. */
  configure(view: Group | null, rotate: boolean): void {
    this.view = view
    this.rotateEnabled = rotate
  }

  constructor(hub: PointerHub, camera: PerspectiveCamera, viewport: () => { width: number; height: number }) {
    this.hub = hub
    this.camera = camera
    this.viewport = viewport
  }

  attach(): () => void {
    return this.hub.subscribe((e) => this.handle(e))
  }

  register(d: Draggable): () => void {
    this.draggables.add(d)
    return () => this.draggables.delete(d)
  }

  private worldAt(x: number, y: number, out: Vector3): Vector3 {
    const { width, height } = this.viewport()
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    this.raycaster.ray.intersectPlane(this.plane, out)
    return out
  }

  private pick(x: number, y: number): Draggable | null {
    const { width, height } = this.viewport()
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const objects = [...this.draggables].map((d) => d.object).filter((o) => o.visible)
    const hits = this.raycaster.intersectObjects(objects, true)
    if (!hits.length) return null
    let obj: Object3D | null = hits[0].object
    while (obj) {
      const found = [...this.draggables].find((d) => d.object === obj)
      if (found) return found
      obj = obj.parent
    }
    return null
  }

  private handle(e: HubEvent) {
    if (e.type === 'wheel') {
      this.scale = Math.min(2.2, Math.max(0.5, this.scale * Math.exp(-e.deltaY * 0.0012)))
      return
    }
    if (e.type !== 'down' && e.type !== 'up' && e.type !== 'cancel') return
    const p = e.pointer
    if (e.type === 'down') {
      const target = this.pick(p.x, p.y)
      const a: Active = {
        pointerId: p.id,
        target: null,
        lastX: p.x,
        lastY: p.y,
        startX: p.x,
        startY: p.y,
        vx: 0,
        vy: 0,
      }
      if (target && target.grab(this.worldAt(p.x, p.y, this.hit)) !== false) a.target = target
      this.momentum.yaw = 0
      this.momentum.pitch = 0
      this.active.set(p.id, a)
      return
    }
    const a = this.active.get(p.id)
    if (!a) return
    this.active.delete(p.id)
    const moved = Math.hypot(p.x - a.startX, p.y - a.startY)
    if (a.target) {
      if (moved < 8 && a.target.tap) a.target.tap()
      a.target.release(this.worldAt(p.x, p.y, this.hit))
    } else if (e.type === 'up') {
      this.momentum.yaw = a.vx
      this.momentum.pitch = a.vy
    }
  }

  update(dt: number) {
    const { height } = this.viewport()
    let rotating = false
    for (const a of this.active.values()) {
      const p = this.hub.pointers.get(a.pointerId)
      if (!p) continue
      const dx = p.x - a.lastX
      const dy = p.y - a.lastY
      a.lastX = p.x
      a.lastY = p.y
      if (a.target) {
        a.target.move(this.worldAt(p.x, p.y, this.hit))
      } else if (this.view && this.rotateEnabled) {
        rotating = true
        const k = 3.2 / height
        this.view.rotation.y += dx * k
        this.view.rotation.x += dy * k
        if (dt > 0) {
          a.vx += ((dx * k) / dt - a.vx) * 0.35
          a.vy += ((dy * k) / dt - a.vy) * 0.35
        }
      }
    }
    if (!rotating && this.view && this.rotateEnabled) {
      const decay = Math.exp(-dt * 3)
      this.momentum.yaw *= decay
      this.momentum.pitch *= decay
      this.view.rotation.y += this.momentum.yaw * dt
      this.view.rotation.x += this.momentum.pitch * dt
    }
    if (this.view) {
      const s = this.view.scale.x + (this.scale - this.view.scale.x) * (1 - Math.exp(-dt * 8))
      this.view.scale.setScalar(s)
    }
  }
}
