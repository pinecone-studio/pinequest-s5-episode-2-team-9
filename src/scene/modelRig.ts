// Three.js side of a model: builds hologram parts from a GLB scene and animates
// them toward targets every frame (explode, study focus, assembly bench,
// carrying, snapping). Pure Three — React only creates it and calls update().

import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Euler,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  Plane,
  Quaternion,
  Raycaster,
  Sphere,
  Vector3,
  type Camera,
  type Object3D,
  type PerspectiveCamera,
  type Material,
  type MeshPhysicalMaterial,
  type ShaderMaterial,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import type { ModelDefinition, PartDef } from '../models/ModelDefinition'
import { lookFor, type ModelDefinition as Def } from '../models/ModelDefinition'
import { createHoloMaterial } from './HoloMaterial'
import { createRealisticMaterial, LOOKS, type LookId } from './realisticLooks'

Object.assign(BufferGeometry.prototype, { computeBoundsTree, disposeBoundsTree })
Mesh.prototype.raycast = acceleratedRaycast

export type PartLocation = 'model' | 'bench' | 'carry'

export interface RigMotion {
  /** Called every frame after the parts have their base pose. `active` is false outside explore mode. */
  update(dt: number, rig: ModelRig, active: boolean): void
  dispose(): void
}

export interface PartRig {
  def: PartDef
  mesh: Mesh<BufferGeometry, Material | Material[]>
  /** Hologram material. */
  holo: ShaderMaterial
  /** Realistic (physically based) material: the first of `reals`. */
  real: MeshPhysicalMaterial
  /** One realistic material per geometry group (parts built from several looks). */
  reals: MeshPhysicalMaterial[]
  edges: LineSegments | null
  ghost: Mesh<BufferGeometry, ShaderMaterial>
  /** Assembled position in model (inner) space. */
  home: Vector3
  /** Bounding radius in GLB units. */
  radius: number
  explodeOffset: Vector3
  location: PartLocation
  benchSlot: Vector3
  benchScale: number
  targetPos: Vector3
  targetScale: number
  opacity: number
  opacityTarget: number
  highlight: number
  highlightTarget: number
  flash: number
  /** Animated pose without motion (motion is layered on top of it each frame). */
  pose: Vector3
  poseScale: number
}

export interface RigState {
  mode: 'explore' | 'study' | 'assembly'
  explode: number
  scale: number
  hovered: string | null
  selected: string | null
  studyPart: string | null
  cutaway: number
  placed: ReadonlySet<string>
  carried: string | null
  hintPart: string | null
}

const tmpV = new Vector3()
const tmpV2 = new Vector3()
const tmpQ = new Quaternion()
const tmpColor = new Color()

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export class ModelRig {
  readonly def: ModelDefinition
  /** Added to the scene; never rotated. */
  readonly root = new Group()
  /** User rotation + zoom + layout offset. */
  readonly model = new Group()
  /** Normalizes GLB units so the model's bounding radius is 1. */
  readonly inner = new Group()
  readonly bench = new Group()
  readonly benchInner = new Group()
  readonly parts = new Map<string, PartRig>()
  /** User rotation, applied to `model`. */
  readonly rotation = new Quaternion()
  readonly center = new Vector3()
  /** Bounding radius in GLB units. */
  readonly rawRadius: number
  readonly normScale: number
  readonly clipPlane = new Plane(new Vector3(0, 0, -1), 100)

  private leaderLines: LineSegments
  private carryLine: Line
  private time = 0
  /** Horizontal shift so the model sits left of the side panel. */
  private layoutShift = 0
  private benchSlots = new Map<string, { pos: Vector3; scale: number }>()
  /** Realistic (PBR) look instead of the hologram. */
  realistic = false
  /** Extra data stored on the GLB root (e.g. the robot dog's joint positions). */
  extras: Record<string, unknown> = {}
  /** Optional animation layered on the parts (heartbeat, spinning rotor...). */
  private motion: RigMotion | null = null

  attachMotion(motion: RigMotion | null): void {
    this.motion = motion
  }

  setRealistic(on: boolean): void {
    if (this.realistic === on) return
    this.realistic = on
    for (const part of this.parts.values()) {
      part.mesh.material = on ? (part.reals.length > 1 ? part.reals : part.real) : part.holo
      part.mesh.renderOrder = on && part.reals.some((m) => (m.userData.baseOpacity as number) < 1) ? 1 : 0
    }
  }

  constructor(def: ModelDefinition, scene: Object3D) {
    this.def = def
    this.root.add(this.model, this.bench)
    this.model.add(this.inner)
    this.bench.add(this.benchInner)

    const box = new Box3()
    const sphere = new Sphere()
    for (const partDef of def.parts) {
      const src = scene.getObjectByName(partDef.id)
      // A node with several primitives loads as a group of meshes, one per material.
      const srcMeshes = (src instanceof Mesh ? [src] : (src?.children.filter((c) => c instanceof Mesh) ?? [])) as Mesh[]
      if (!srcMeshes.length) throw new Error(`Part "${partDef.id}" not found in ${def.url}`)
      const srcMesh = srcMeshes[0]
      const layered = new Set(srcMeshes.map((m) => (m.material as Material).name)).size > 1
      const geometry = layered ? mergeLayers(srcMeshes) : (srcMesh.geometry as BufferGeometry)
      if (!geometry.boundsTree) geometry.computeBoundsTree()
      geometry.computeBoundingSphere()
      src!.updateWorldMatrix(true, false)
      const home = new Vector3().setFromMatrixPosition(src!.matrixWorld)
      box.expandByObject(layered ? src! : srcMesh)

      const holo = createHoloMaterial({ color: partDef.color })
      const fallback = lookFor(def as Def, partDef)
      const reals = (layered ? srcMeshes : [srcMesh]).map((m) => {
        const name = (m.material as Material).name
        return createRealisticMaterial(layered && name in LOOKS ? (name as LookId) : fallback)
      })
      const real = reals[0]
      const mesh = new Mesh<BufferGeometry, Material | Material[]>(geometry, holo)
      mesh.name = partDef.id
      mesh.position.copy(home)
      mesh.userData.partId = partDef.id
      this.inner.add(mesh)

      let edges: LineSegments | null = null
      if (def.edges) {
        edges = new LineSegments(
          new EdgesGeometry(geometry, 35),
          new LineBasicMaterial({
            color: partDef.color,
            transparent: true,
            opacity: 0.55,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        )
        edges.raycast = () => {}
        mesh.add(edges)
      }

      const ghost = new Mesh(geometry, createHoloMaterial({ color: '#dff8ff', opacity: 0, fill: 0.05, fresnelPower: 1.5 }))
      ghost.position.copy(home)
      ghost.visible = false
      ghost.raycast = () => {}
      this.inner.add(ghost)

      this.parts.set(partDef.id, {
        def: partDef,
        mesh,
        holo,
        real,
        reals,
        edges,
        ghost: ghost as Mesh<BufferGeometry, ShaderMaterial>,
        home,
        radius: geometry.boundingSphere!.radius,
        explodeOffset: new Vector3(),
        location: 'model',
        benchSlot: new Vector3(),
        benchScale: 1,
        targetPos: home.clone(),
        targetScale: 1,
        opacity: 0,
        opacityTarget: 1,
        highlight: 0,
        highlightTarget: 0,
        flash: 0,
        pose: home.clone(),
        poseScale: 1,
      })
    }

    scene.traverse((o) => {
      if (Object.keys(o.userData ?? {}).length && !Object.keys(this.extras).length) this.extras = o.userData
    })
    box.getBoundingSphere(sphere)
    this.center.copy(box.getCenter(new Vector3()))
    this.rawRadius = sphere.radius
    this.normScale = 1 / sphere.radius
    this.inner.scale.setScalar(this.normScale)
    this.inner.position.copy(this.center).multiplyScalar(-this.normScale)
    this.benchInner.scale.setScalar(this.normScale)

    // Explode offsets: radial spread plus a push along each part's direction.
    for (const part of this.parts.values()) {
      const fromCenter = part.home.clone().sub(this.center)
      const dir = part.def.explodeDir ? new Vector3(...part.def.explodeDir).normalize() : fromCenter.clone().normalize()
      if (!Number.isFinite(dir.x) || dir.lengthSq() === 0) dir.set(0, 1, 0)
      part.explodeOffset
        .copy(fromCenter)
        .multiplyScalar(0.6)
        .addScaledVector(dir, this.rawRadius * 0.22)
        .multiplyScalar(part.def.explodeScale ?? 1)
    }

    const leaderGeometry = new BufferGeometry()
    leaderGeometry.setAttribute('position', new BufferAttribute(new Float32Array(this.parts.size * 6), 3))
    this.leaderLines = new LineSegments(
      leaderGeometry,
      new LineBasicMaterial({ color: '#8ff3ff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    )
    this.leaderLines.frustumCulled = false
    this.leaderLines.raycast = () => {}
    this.inner.add(this.leaderLines)

    const carryGeometry = new BufferGeometry()
    carryGeometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3))
    this.carryLine = new Line(
      carryGeometry,
      new LineDashedMaterial({ color: '#dff8ff', dashSize: 0.05, gapSize: 0.04, transparent: true, opacity: 0.8, depthWrite: false }),
    )
    this.carryLine.frustumCulled = false
    this.carryLine.visible = false
    this.carryLine.raycast = () => {}
    this.root.add(this.carryLine)

    this.resetRotation()
  }

  resetRotation(): void {
    const [x, y, z] = this.def.initialRotation
    this.rotation.setFromEuler(new Euler(x, y, z))
  }

  /** Rotates the model by screen-space drag angles (radians) around the camera axes. */
  rotateBy(yaw: number, pitch: number): void {
    tmpQ.setFromAxisAngle(tmpV.set(0, 1, 0), yaw)
    this.rotation.premultiply(tmpQ)
    tmpQ.setFromAxisAngle(tmpV.set(1, 0, 0), pitch)
    this.rotation.premultiply(tmpQ)
    this.rotation.normalize()
  }

  /** Recomputes bench slots and the side-panel shift for the current camera/viewport. */
  layout(camera: PerspectiveCamera, viewport: { width: number; height: number }, panelPx: number, unplaced: string[]): void {
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
    const halfW = halfH * camera.aspect
    this.layoutShift = viewport.width > 700 ? -(panelPx / viewport.width) * halfW : 0

    this.benchSlots.clear()
    const n = unplaced.length
    if (!n) return
    const usableW = (halfW * 2 - (viewport.width > 700 ? (panelPx / viewport.width) * halfW * 2 : 0)) * 0.86
    const rows = n > 8 ? 2 : 1
    const perRow = Math.ceil(n / rows)
    const spacing = usableW / perRow
    const slotRadius = Math.min(0.17, spacing * 0.4)
    unplaced.forEach((id, i) => {
      const row = Math.floor(i / perRow)
      const col = i % perRow
      const countInRow = row === rows - 1 ? n - row * perRow : perRow
      const x = this.layoutShift + (col - (countInRow - 1) / 2) * spacing
      const y = -halfH * (rows === 2 ? 0.42 : 0.6) - row * slotRadius * 2.5
      const part = this.parts.get(id)!
      const scale = slotRadius / (part.radius * this.normScale)
      // Bench space has normScale applied; convert world slot to bench-inner coords.
      this.benchSlots.set(id, { pos: new Vector3(x, y, 0.25).divideScalar(this.normScale), scale })
    })
  }

  /** Moves a part to another parent group, keeping its world transform. */
  relocate(id: string, location: PartLocation): void {
    const part = this.parts.get(id)
    if (!part || part.location === location) return
    const parent = location === 'model' ? this.inner : location === 'bench' ? this.benchInner : this.root
    parent.attach(part.mesh)
    part.location = location
    part.pose.copy(part.mesh.position)
    part.poseScale = part.mesh.scale.x
  }

  /** Sends every non-base part to the bench (assembly start). */
  scatterToBench(placed: ReadonlySet<string>): void {
    for (const [id, part] of this.parts) {
      if (placed.has(id)) this.relocate(id, 'model')
      else this.relocate(id, 'bench')
      part.flash = 0
    }
  }

  gatherToModel(): void {
    for (const id of this.parts.keys()) this.relocate(id, 'model')
  }

  /** Sets the world-space target of a carried part. */
  carryTo(id: string, world: Vector3): void {
    const part = this.parts.get(id)
    if (part?.location === 'carry') part.targetPos.copy(world)
  }

  /** World position of a part's assembled slot. */
  slotWorld(id: string, out = new Vector3()): Vector3 {
    const part = this.parts.get(id)!
    return this.inner.localToWorld(out.copy(part.home))
  }

  partWorld(id: string, out = new Vector3()): Vector3 {
    return this.parts.get(id)!.mesh.getWorldPosition(out)
  }

  /** Radius of the whole model on screen, in pixels. */
  screenRadius(camera: PerspectiveCamera, viewportHeight: number): number {
    const center = this.model.getWorldPosition(tmpV)
    const dist = camera.position.distanceTo(center)
    const worldR = this.model.scale.x
    return (worldR / (Math.tan((camera.fov * Math.PI) / 360) * dist)) * (viewportHeight / 2)
  }

  /** Model centre on screen, in pixels. */
  screenCenter(camera: Camera, viewport: { width: number; height: number }): { x: number; y: number } {
    tmpV.setFromMatrixPosition(this.model.matrixWorld).project(camera)
    return { x: ((tmpV.x + 1) / 2) * viewport.width, y: ((1 - tmpV.y) / 2) * viewport.height }
  }

  toScreen(world: Vector3, camera: Camera, viewport: { width: number; height: number }): { x: number; y: number } {
    tmpV2.copy(world).project(camera)
    return { x: ((tmpV2.x + 1) / 2) * viewport.width, y: ((1 - tmpV2.y) / 2) * viewport.height }
  }

  /** The visible part under a ray, optionally restricted to some locations. */
  pick(raycaster: Raycaster, locations: PartLocation[] = ['model', 'bench']): string | null {
    const candidates: Mesh[] = []
    for (const part of this.parts.values()) {
      if (part.mesh.visible && part.opacity > 0.3 && locations.includes(part.location)) candidates.push(part.mesh)
    }
    raycaster.firstHitOnly = true
    const hits = raycaster.intersectObjects(candidates, false)
    return hits.length ? (hits[0].object.userData.partId as string) : null
  }

  update(dt: number, s: RigState, camera: PerspectiveCamera): void {
    this.time += dt
    const k = 1 - Math.exp(-dt * 9)
    const kFast = 1 - Math.exp(-dt * 16)

    // Whole-model layout: assembly lifts and shrinks the model above the bench.
    const assembling = s.mode === 'assembly'
    const explodeShrink = 1 / (1 + 0.5 * Math.min(1, Math.max(0, s.explode)))
    const modelScale = assembling ? 0.56 : s.scale * (s.mode === 'explore' ? explodeShrink : 1)
    const modelY = assembling ? 0.5 : 0
    this.model.position.x += (this.layoutShift - this.model.position.x) * k
    this.model.position.y += (modelY - this.model.position.y) * k
    const sc = this.model.scale.x + (modelScale - this.model.scale.x) * k
    this.model.scale.setScalar(sc)
    this.model.quaternion.slerp(this.rotation, kFast)

    const explode = assembling ? 0 : easeOut(Math.min(1, Math.max(0, s.explode)))
    const focus = s.mode === 'study' ? s.studyPart : null
    const dimOthers = s.selected !== null || s.carried !== null

    for (const [id, part] of this.parts) {
      const { mesh } = part
      // Targets per location.
      if (part.location === 'model') {
        if (focus === id) {
          part.targetPos.copy(this.center)
          part.targetScale = Math.min(6, Math.max(1, (this.rawRadius * 0.72) / part.radius))
        } else {
          part.targetPos.copy(part.home).addScaledVector(part.explodeOffset, explode)
          part.targetScale = 1
        }
      } else if (part.location === 'bench') {
        const slot = this.benchSlots.get(id)
        if (slot) {
          part.targetPos.copy(slot.pos)
          part.targetScale = slot.scale
        }
      } else {
        // carry: world space at the size it will have once placed.
        part.targetScale = this.normScale * this.model.scale.x
      }

      part.opacityTarget = focus && focus !== id ? 0 : 1
      const hinted = s.hintPart === id
      // The part being studied is shown alone, so it needs no highlight tint.
      part.highlightTarget =
        focus === id
          ? 0
          : s.hovered === id || s.selected === id || s.carried === id
            ? 1
            : hinted
              ? 0.6 + 0.4 * Math.sin(this.time * 6)
              : 0

      part.pose.lerp(part.targetPos, part.location === 'carry' ? kFast : k)
      part.poseScale += (part.targetScale - part.poseScale) * k
      mesh.position.copy(part.pose)
      mesh.scale.setScalar(part.poseScale)
      mesh.quaternion.identity()
      part.opacity += (part.opacityTarget - part.opacity) * k
      part.highlight += (part.highlightTarget - part.highlight) * kFast
      part.flash = Math.max(0, part.flash - dt * 1.8)
      mesh.visible = part.opacity > 0.01

      const dimmed = dimOthers && s.selected !== id && s.carried !== id && part.highlight < 0.5
      if (this.realistic) {
        tmpColor.set(part.def.color).multiplyScalar(0.28 * (part.highlight + part.flash * 2))
        for (const m of part.reals) {
          const base = m.userData.baseOpacity as number
          m.opacity = base * part.opacity
          m.depthWrite = base >= 1 && part.opacity > 0.98
          m.color.copy(m.userData.baseColor as Color).multiplyScalar(dimmed ? 0.45 : 1)
          m.emissive.copy(m.userData.baseEmissive as Color).add(tmpColor)
        }
      }
      const u = part.holo.uniforms
      u.uTime.value = this.time
      u.uOpacity.value = part.opacity
      u.uHighlight.value = part.highlight + part.flash * 2
      u.uIntensity.value = this.def.glow * (dimmed ? 0.5 : 1)
      if (part.edges) {
        part.edges.visible = !this.realistic
        ;(part.edges.material as LineBasicMaterial).opacity = (dimmed ? 0.12 : 0.3) * part.opacity
      }

      // Ghost outline at the slot of every unplaced part during assembly.
      const showGhost = assembling && !s.placed.has(id)
      part.ghost.visible = showGhost
      if (showGhost) {
        const strong = s.carried === id || hinted
        part.ghost.material.uniforms.uOpacity.value = strong ? 0.45 + 0.2 * Math.sin(this.time * 5) : 0.07
        part.ghost.material.uniforms.uTime.value = this.time
      }
    }

    if (this.motion) this.motion.update(dt, this, s.mode === 'explore' && !s.carried)
    this.updateLeaderLines(s.mode === 'explore' ? explode : 0, assembling)
    this.updateCarryLine(s.carried)
    this.updateClipping(s, camera)
  }

  /** Flash a part (snap feedback). */
  flash(id: string): void {
    const part = this.parts.get(id)
    if (part) part.flash = 1
  }

  private updateLeaderLines(explode: number, assembling: boolean) {
    const material = this.leaderLines.material as LineBasicMaterial
    material.opacity = assembling ? 0 : explode * 0.35
    if (material.opacity < 0.01) return
    const attr = this.leaderLines.geometry.getAttribute('position') as BufferAttribute
    let i = 0
    for (const part of this.parts.values()) {
      const visible = part.location === 'model' && part.opacity > 0.5
      const end = visible ? part.mesh.position : part.home
      attr.setXYZ(i++, part.home.x, part.home.y, part.home.z)
      attr.setXYZ(i++, end.x, end.y, end.z)
    }
    attr.needsUpdate = true
  }

  private updateCarryLine(carried: string | null) {
    const part = carried ? this.parts.get(carried) : null
    this.carryLine.visible = !!part && part.location === 'carry'
    if (!part || !this.carryLine.visible) return
    const from = part.mesh.getWorldPosition(tmpV)
    const to = this.slotWorld(part.def.id, tmpV2)
    const attr = this.carryLine.geometry.getAttribute('position') as BufferAttribute
    attr.setXYZ(0, from.x, from.y, from.z)
    attr.setXYZ(1, to.x, to.y, to.z)
    attr.needsUpdate = true
    this.carryLine.computeLineDistances()
  }

  /** Cut-away: a camera-facing plane that slices off the front of whatever is in view. */
  private updateClipping(s: RigState, camera: PerspectiveCamera) {
    const active = this.def.cutaway && s.cutaway > 0.01 && s.mode !== 'assembly'
    const focus = s.mode === 'study' && s.studyPart ? this.parts.get(s.studyPart) : null
    const centerWorld = focus ? focus.mesh.getWorldPosition(tmpV) : this.model.getWorldPosition(tmpV)
    const radiusWorld = focus ? focus.radius * focus.mesh.scale.x * this.normScale * this.model.scale.x : this.model.scale.x
    const zCut = centerWorld.z + radiusWorld * (1 - 1.8 * s.cutaway)
    this.clipPlane.set(tmpV2.set(0, 0, -1), zCut)
    void camera
    for (const part of this.parts.values()) {
      const planes = active && part.location === 'model' ? [this.clipPlane] : []
      if (part.holo.clippingPlanes?.length !== planes.length) {
        for (const m of [part.holo, ...part.reals]) {
          m.clippingPlanes = planes
          m.needsUpdate = true
        }
        if (part.edges) {
          ;(part.edges.material as LineBasicMaterial).clippingPlanes = planes
          ;(part.edges.material as LineBasicMaterial).needsUpdate = true
        }
      }
    }
  }

  dispose(): void {
    for (const part of this.parts.values()) {
      part.holo.dispose()
      for (const m of part.reals) m.dispose()
      part.ghost.material.dispose()
      if (part.edges) {
        part.edges.geometry.dispose()
        ;(part.edges.material as LineBasicMaterial).dispose()
      }
    }
    this.leaderLines.geometry.dispose()
    ;(this.leaderLines.material as LineBasicMaterial).dispose()
    this.carryLine.geometry.dispose()
    ;(this.carryLine.material as LineDashedMaterial).dispose()
  }
}

/** Merges the meshes of a multi-material part into one geometry with a group per mesh. */
function mergeLayers(meshes: Mesh[]): BufferGeometry {
  const plain = meshes.map((m) => {
    // Rebuild with plain float attributes so quantized or interleaved data merges cleanly.
    const src = m.geometry as BufferGeometry
    const g = new BufferGeometry()
    for (const name of ['position', 'normal'] as const) {
      const a = src.getAttribute(name)
      const out = new Float32Array(a.count * 3)
      for (let i = 0; i < a.count; i++) out.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3)
      g.setAttribute(name, new BufferAttribute(out, 3))
    }
    if (src.index) g.setIndex(new BufferAttribute(Uint32Array.from(src.index.array), 1))
    g.applyMatrix4(m.matrix)
    return g
  })
  const merged = mergeGeometries(plain, true)
  plain.forEach((g) => g.dispose())
  return merged
}
