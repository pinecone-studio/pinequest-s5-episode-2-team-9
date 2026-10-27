// Glowing particles streaming along curves (blood, propellant).
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, Points, Vector3, type Object3D } from 'three'
import { createGlowPointsMaterial } from '../glowPoints'

export interface FlowPath {
  points: Vector3[]
  color: string
  count: number
}

export class Flow {
  readonly object: Points
  private curves: CatmullRomCurve3[]
  private offsets: Float32Array
  private pathOf: Uint16Array
  private tmp = new Vector3()

  /** `size` is the point size in world units (the model is normalized to radius 1). */
  constructor(paths: FlowPath[], size: number) {
    this.curves = paths.map((p) => new CatmullRomCurve3(p.points))
    const total = paths.reduce((n, p) => n + p.count, 0)
    this.offsets = new Float32Array(total)
    this.pathOf = new Uint16Array(total)
    const color = new Float32Array(total * 3)
    let i = 0
    paths.forEach((p, k) => {
      const c = new Color(p.color)
      for (let j = 0; j < p.count; j++, i++) {
        this.offsets[i] = j / p.count + Math.random() * (0.6 / p.count)
        this.pathOf[i] = k
        color.set([c.r, c.g, c.b], i * 3)
      }
    })
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(total * 3), 3))
    g.setAttribute('color', new BufferAttribute(color, 3))
    g.setAttribute('alpha', new BufferAttribute(new Float32Array(total).fill(0.9), 1))
    this.object = new Points(g, createGlowPointsMaterial(size))
    this.object.frustumCulled = false
    this.object.renderOrder = 2
  }

  /** Advances every particle by `advance` (fraction of its path). */
  update(advance: number, visible: boolean): void {
    this.object.visible = visible
    if (!visible) return
    const pos = this.object.geometry.getAttribute('position') as BufferAttribute
    for (let i = 0; i < this.offsets.length; i++) {
      this.offsets[i] = (this.offsets[i] + advance) % 1
      this.curves[this.pathOf[i]].getPoint(this.offsets[i], this.tmp)
      pos.setXYZ(i, this.tmp.x, this.tmp.y, this.tmp.z)
    }
    pos.needsUpdate = true
  }

  attach(parent: Object3D): void {
    parent.add(this.object)
  }

  dispose(): void {
    this.object.removeFromParent()
    this.object.geometry.dispose()
    ;(this.object.material as { dispose(): void }).dispose()
  }
}
