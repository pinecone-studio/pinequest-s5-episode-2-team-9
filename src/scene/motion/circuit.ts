// A network of connected vessels (or pipes, or nerve fibres) that particles travel
// through: blood cells, propellant, electric charge, nerve signals.
//
// - Segments join end to start; a particle leaving a segment picks one of its `next`
//   segments (weighted), so loops, branches and merges are all possible.
// - A segment can sit behind a gate (a valve). While the gate is shut, particles
//   bunch up near the end of the segment before it, the way blood fills a chamber.
// - Particles spread across the vessel's radius, and their colour blends along each
//   segment (blue blood turning red in the lungs, kerosene turning to flame).
// - Particle 0 is the tracer: bigger and brighter, it follows a fixed route so the
//   panel can tell its story ("now in the right ventricle...").
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Points,
  ShaderMaterial,
  Vector3,
  type Object3D,
} from 'three'

export type V3 = readonly [number, number, number]

export interface SegmentDef {
  id: string
  /** Centre line, in the model's raw (GLB) units. */
  points: V3[]
  /** Lumen radius: one value, or one per point. */
  radius: number | number[]
  /** Colour at the start and end of the segment. */
  color: string | [string, string]
  /** Where particles go next; none = they leave the circuit and respawn at a source. */
  next?: { id: string; weight?: number }[]
  /** Name of the gate (valve) at this segment's entrance. */
  gate?: string
  /** Particles may enter the circuit here (open circuits: fuel from a tank). */
  source?: number
  /** Particles wait spread through this segment instead of stopping at its end (a chamber). */
  pool?: boolean
}

export interface CircuitOptions {
  count: number
  /** Particle size in world units (models are normalized to radius 1). */
  size: number
  /** Segment ids the tracer cycles through (it ignores weights). */
  tracerRoute?: string[]
  /** Fade particles in over the first part of a source segment and out at the end of a dead end. */
  fade?: number
}

/** Per-frame inputs: speed (raw units per second) and gate state by name. */
export interface CircuitFrame {
  speed: (segmentId: string) => number
  open?: (gate: string) => boolean
}

const LUT = 96

interface Segment {
  def: SegmentDef
  length: number
  pos: Float32Array
  rad: Float32Array
  c0: Color
  c1: Color
  next: { index: number; weight: number }[]
  total: number
}

const vs = /* glsl */ `
  attribute vec3 color;
  attribute float alpha;
  attribute float size;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vCore;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vCore = step(1.5, size);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.5, size * uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const fs = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vCore;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float body = smoothstep(0.5, 0.18, d);
    // The tracer gets a bright white ring so it is easy to follow.
    float ring = vCore * smoothstep(0.08, 0.0, abs(d - 0.36));
    vec3 c = vColor * body + vec3(1.0) * ring;
    float a = max(body, ring) * vAlpha * uOpacity;
    gl_FragColor = vec4(c * a, a);
  }
`

export class Circuit {
  readonly object: Points
  private segments: Segment[]
  private byId = new Map<string, number>()
  private sources: { index: number; weight: number }[]
  private sourceTotal: number
  private seg: Uint16Array
  private next: Int16Array
  private s: Float32Array
  private jitter: Float32Array
  private offset: Float32Array
  private sizes: Float32Array
  private fade: number
  private tracerRoute: number[]
  private tracerStep = 0
  private tmp = new Vector3()
  private col = new Color()
  /** Called when the tracer enters a segment. */
  onTracer: ((segmentId: string) => void) | null = null

  constructor(defs: SegmentDef[], options: CircuitOptions) {
    defs.forEach((d, i) => this.byId.set(d.id, i))
    this.segments = defs.map((def) => buildSegment(def))
    this.segments.forEach((seg) => {
      seg.next = (seg.def.next ?? []).map((n) => {
        const index = this.byId.get(n.id)
        if (index === undefined) throw new Error(`Circuit: unknown segment ${n.id}`)
        return { index, weight: n.weight ?? 1 }
      })
      seg.total = seg.next.reduce((t, n) => t + n.weight, 0)
    })
    this.sources = defs.flatMap((d, index) => (d.source ? [{ index, weight: d.source }] : []))
    this.sourceTotal = this.sources.reduce((t, s) => t + s.weight, 0)
    this.tracerRoute = (options.tracerRoute ?? []).map((id) => this.byId.get(id)!).filter((i) => i !== undefined)
    this.fade = options.fade ?? 0.12

    const n = options.count
    this.seg = new Uint16Array(n)
    this.next = new Int16Array(n)
    this.s = new Float32Array(n)
    this.jitter = new Float32Array(n)
    this.offset = new Float32Array(n * 3)
    this.sizes = new Float32Array(n)

    // Spread particles over the segments in proportion to their length.
    const lengths = this.segments.map((g) => g.length)
    const totalLength = lengths.reduce((a, b) => a + b, 0)
    for (let i = 0; i < n; i++) {
      let pick = Math.random() * totalLength
      let k = 0
      while (k < lengths.length - 1 && pick > lengths[k]) pick -= lengths[k++]
      this.seg[i] = k
      this.s[i] = Math.random()
      this.next[i] = this.chooseNext(k, i)
      this.jitter[i] = 0.8 + Math.random() * 0.4
      // Uniform point in the unit ball: fills the lumen, denser along the axis.
      const u = Math.cbrt(Math.random()) * 0.85
      const v = randomUnit(this.tmp)
      this.offset.set([v.x * u, v.y * u, v.z * u], i * 3)
      this.sizes[i] = options.size * (0.75 + Math.random() * 0.5)
    }
    if (this.tracerRoute.length) {
      this.seg[0] = this.tracerRoute[0]
      this.s[0] = 0
      this.next[0] = this.tracerRoute[1 % this.tracerRoute.length]
      this.jitter[0] = 1
      this.offset.fill(0, 0, 3)
      this.sizes[0] = options.size * 2.6
    }

    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('alpha', new BufferAttribute(new Float32Array(n).fill(1), 1))
    g.setAttribute('size', new BufferAttribute(this.sizes, 1))
    this.object = new Points(
      g,
      new ShaderMaterial({
        uniforms: { uScale: { value: 400 }, uOpacity: { value: 1 } },
        vertexShader: vs,
        fragmentShader: fs,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    )
    this.object.frustumCulled = false
    this.object.renderOrder = 2
  }

  /** The tracer's current segment and progress (0..1). */
  get tracer(): { id: string; s: number } | null {
    if (!this.tracerRoute.length) return null
    return { id: this.segments[this.seg[0]].def.id, s: this.s[0] }
  }

  setOpacity(opacity: number): void {
    ;(this.object.material as ShaderMaterial).uniforms.uOpacity.value = opacity
  }

  /** Scales every particle (e.g. bigger sparks at full throttle). */
  setSizeScale(k: number): void {
    const attr = this.object.geometry.getAttribute('size') as BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < arr.length; i++) arr[i] = this.sizes[i] * k
    attr.needsUpdate = true
  }

  /** Length of a segment in raw units. */
  lengthOf(segmentId: string): number {
    return this.segments[this.byId.get(segmentId)!].length
  }

  /** Position of a point on a segment (for labels and effects). */
  pointOn(segmentId: string, s: number, out: Vector3): Vector3 {
    const seg = this.segments[this.byId.get(segmentId)!]
    return sampleLut(seg.pos, s, out)
  }

  update(dt: number, frame: CircuitFrame, visible: boolean): void {
    this.object.visible = visible
    if (!visible) return
    const pos = this.object.geometry.getAttribute('position') as BufferAttribute
    const color = this.object.geometry.getAttribute('color') as BufferAttribute
    const alpha = this.object.geometry.getAttribute('alpha') as BufferAttribute
    const open = frame.open ?? (() => true)
    const speeds = this.segments.map((g) => frame.speed(g.def.id))
    const gates = this.segments.map((g) => (g.def.gate ? open(g.def.gate) : true))

    for (let i = 0; i < this.seg.length; i++) {
      let k = this.seg[i]
      let seg = this.segments[k]
      const nextIndex = this.next[i]
      const blocked = nextIndex >= 0 && !gates[nextIndex]
      let ds = (speeds[k] * this.jitter[i] * dt) / seg.length
      if (blocked) {
        // Valve shut: slow down and wait. Chambers keep particles spread through them.
        const cap = seg.def.pool ? 0.55 + 0.4 * ((i * 0.618) % 1) : 0.985
        ds *= Math.max(0, Math.min(1, (cap - this.s[i]) / 0.12))
        if (this.s[i] > cap) ds = Math.min(0, (cap - this.s[i]) * Math.min(1, dt * 2))
      }
      let s = this.s[i] + ds
      let a = 1
      if (s >= 1) {
        if (nextIndex < 0) {
          // Dead end (exhaust, a nerve ending): respawn at a source; the tracer restarts its route.
          k = i === 0 && this.tracerRoute.length ? this.tracerRoute[0] : this.pickSource()
          s = 0
        } else {
          const len = seg.length
          k = nextIndex
          s = ((s - 1) * len) / this.segments[k].length
        }
        this.seg[i] = k
        seg = this.segments[k]
        if (i === 0 && this.tracerRoute.length) {
          // Find our place on the route first, so the next pick follows it.
          const at = this.tracerRoute.indexOf(k, Math.max(0, this.tracerStep))
          this.tracerStep = at >= 0 ? at : Math.max(0, this.tracerRoute.indexOf(k))
          this.onTracer?.(seg.def.id)
        }
        this.next[i] = this.chooseNext(k, i)
      }
      this.s[i] = s
      if (seg.def.source && s < this.fade) a = s / this.fade
      if (!seg.next.length && s > 1 - this.fade) a = Math.min(a, (1 - s) / this.fade)

      sampleLut(seg.pos, s, this.tmp)
      const r = sampleScalar(seg.rad, s)
      const o = i * 3
      pos.setXYZ(i, this.tmp.x + this.offset[o] * r, this.tmp.y + this.offset[o + 1] * r, this.tmp.z + this.offset[o + 2] * r)
      this.col.copy(seg.c0).lerp(seg.c1, s)
      if (i === 0 && this.tracerRoute.length) this.col.lerp(WHITE, 0.25)
      color.setXYZ(i, this.col.r, this.col.g, this.col.b)
      alpha.setX(i, a)
    }
    pos.needsUpdate = true
    color.needsUpdate = true
    alpha.needsUpdate = true
  }

  attach(parent: Object3D): void {
    parent.add(this.object)
  }

  dispose(): void {
    this.object.removeFromParent()
    this.object.geometry.dispose()
    ;(this.object.material as ShaderMaterial).dispose()
  }

  private chooseNext(k: number, i: number): number {
    const seg = this.segments[k]
    if (!seg.next.length) return -1
    if (i === 0 && this.tracerRoute.length) {
      // The tracer walks its route (re-synced on every segment it enters).
      const step = this.tracerStep + 1 >= this.tracerRoute.length ? 0 : this.tracerStep + 1
      const want = this.tracerRoute[step]
      if (seg.next.some((n) => n.index === want)) {
        if (step === 0) this.tracerStep = -1
        return want
      }
    }
    let pick = Math.random() * seg.total
    for (const n of seg.next) {
      pick -= n.weight
      if (pick <= 0) return n.index
    }
    return seg.next[seg.next.length - 1].index
  }

  private pickSource(): number {
    let pick = Math.random() * this.sourceTotal
    for (const src of this.sources) {
      pick -= src.weight
      if (pick <= 0) return src.index
    }
    return this.sources[0]?.index ?? 0
  }
}

const WHITE = new Color(1, 1, 1)

function buildSegment(def: SegmentDef): Segment {
  const pts = def.points.map((p) => new Vector3(p[0], p[1], p[2]))
  if (pts.length === 1) pts.push(pts[0].clone())
  const curve = new CatmullRomCurve3(pts, false, 'centripetal')
  const pos = new Float32Array(LUT * 3)
  const rad = new Float32Array(LUT)
  const radii = Array.isArray(def.radius) ? def.radius : pts.map(() => def.radius as number)
  const v = new Vector3()
  for (let k = 0; k < LUT; k++) {
    const u = k / (LUT - 1)
    curve.getPointAt(u, v)
    pos.set([v.x, v.y, v.z], k * 3)
    // Radii are given per control point, which are uniform in curve parameter t.
    const t = curve.getUtoTmapping(u, 0) * (radii.length - 1)
    const j = Math.min(radii.length - 2, Math.floor(t))
    const f = t - j
    rad[k] = radii.length === 1 ? radii[0] : radii[j] * (1 - f) + radii[j + 1] * f
  }
  const [c0, c1] = typeof def.color === 'string' ? [def.color, def.color] : def.color
  return { def, length: Math.max(1e-6, curve.getLength()), pos, rad, c0: new Color(c0), c1: new Color(c1), next: [], total: 0 }
}

function sampleLut(lut: Float32Array, s: number, out: Vector3): Vector3 {
  const f = Math.min(1, Math.max(0, s)) * (LUT - 1)
  const k = Math.min(LUT - 2, Math.floor(f))
  const t = f - k
  const a = k * 3
  const b = a + 3
  return out.set(lut[a] + (lut[b] - lut[a]) * t, lut[a + 1] + (lut[b + 1] - lut[a + 1]) * t, lut[a + 2] + (lut[b + 2] - lut[a + 2]) * t)
}

function sampleScalar(lut: Float32Array, s: number): number {
  const f = Math.min(1, Math.max(0, s)) * (LUT - 1)
  const k = Math.min(LUT - 2, Math.floor(f))
  return lut[k] + (lut[k + 1] - lut[k]) * (f - k)
}

function randomUnit(out: Vector3): Vector3 {
  const z = Math.random() * 2 - 1
  const a = Math.random() * Math.PI * 2
  const r = Math.sqrt(1 - z * z)
  return out.set(r * Math.cos(a), r * Math.sin(a), z)
}

/** Builds the curve for a segment (for drawing vessel tubes along it). */
export function segmentCurve(def: SegmentDef): CatmullRomCurve3 {
  return new CatmullRomCurve3(
    def.points.map((p) => new Vector3(p[0], p[1], p[2])),
    false,
    'centripetal',
  )
}
