import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  ConeGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type ShaderMaterial,
} from 'three'
import { useT } from '../../i18n'
import { EM_COLORS } from '../colors'
import { useEm } from '../emStore'
import { conductor, fieldLines, probeField, probePoint, SCENE_M, type Source } from '../fields'
import { distance, normalize, scale, sub, type Vec3 } from '../vec'
import { Arrow, buildTube, createFlowMaterial, mergeTubes } from './geometry'
import { disposeMesh, mount, mulberry32, usePanelShift, type useEmControls } from './hooks'
import { Label } from './Label'

const WIRE_RADIUS = 0.022
const WIRE_HALF = 1.45
const MAX_AMPS = 20
const UP = new Vector3(0, 1, 0)
/** Heights of the four curled fingers, index to little finger. */
const FINGER_Y = [0.055, 0.005, -0.045, -0.09]

/** Visible conductor centreline in scene units (the wire is cut to the view). */
function visiblePath(source: Source): { points: Vec3[]; closed: boolean } {
  if (source === 'wire')
    return {
      points: [
        [0, -WIRE_HALF, 0],
        [0, WIRE_HALF, 0],
      ],
      closed: false,
    }
  const c = conductor(source)
  return { points: c.path.map((p) => scale(p, 1 / SCENE_M)), closed: c.closed }
}

/** Points along a polyline at a given arc length, with the local direction. */
class PathWalker {
  readonly length: number
  private pts: Vec3[]
  private cum: number[]
  constructor(points: Vec3[], closed: boolean) {
    this.pts = closed ? [...points, points[0]] : points
    this.cum = [0]
    for (let i = 1; i < this.pts.length; i++)
      this.cum.push(this.cum[i - 1] + distance(this.pts[i], this.pts[i - 1]))
    this.length = this.cum[this.cum.length - 1]
  }
  at(s: number, pos: Vector3, dir?: Vector3) {
    s = ((s % this.length) + this.length) % this.length
    let lo = 0
    let hi = this.cum.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.cum[mid] <= s) lo = mid
      else hi = mid
    }
    const a = this.pts[lo]
    const b = this.pts[hi]
    const f = (s - this.cum[lo]) / Math.max(1e-9, this.cum[hi] - this.cum[lo])
    pos.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f)
    dir?.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()
  }
}

interface FieldData {
  geometry: BufferGeometry
  /** Arrowhead positions along the lines and the field direction there. */
  heads: { p: Vec3; t: Vec3 }[]
}

// Field lines only depend on the conductor's shape (current just scales them), so trace once per shape.
const fieldCache = new Map<Source, FieldData>()

function fieldData(source: Source): FieldData {
  const hit = fieldCache.get(source)
  if (hit) return hit
  const lines = fieldLines(source)
  let lo = Infinity
  let hi = -Infinity
  for (const l of lines)
    for (const s of l.strength) {
      const v = Math.log10(Math.max(s, 1e-12))
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  const heads: FieldData['heads'] = []
  const tubes = lines.map((l, k) => {
    // Colour by field strength on a log scale: the field falls off fast.
    const strength = l.strength.map((s) => (Math.log10(Math.max(s, 1e-12)) - lo) / Math.max(1e-6, hi - lo))
    let next = 0.2 + (k % 3) * 0.13
    let arc = 0
    for (let i = 1; i < l.points.length - 1; i++) {
      arc += distance(l.points[i], l.points[i - 1])
      if (arc >= next) {
        heads.push({ p: l.points[i], t: normalize(sub(l.points[i + 1], l.points[i - 1])) })
        next += 0.55
      }
    }
    return buildTube(l.points, 0.0055, l.closed, strength, 6)
  })
  const data = { geometry: mergeTubes(tubes), heads }
  fieldCache.set(source, data)
  return data
}

function makeFieldLines(source: Source): Mesh {
  const m = new Mesh(
    fieldData(source).geometry,
    createFlowMaterial(EM_COLORS.fieldWeak, EM_COLORS.fieldStrong),
  )
  m.frustumCulled = false
  return m
}

function makeFieldHeads(source: Source): InstancedMesh {
  const m = new InstancedMesh(
    new ConeGeometry(0.018, 0.05, 10),
    new MeshBasicMaterial({ color: '#9fd8ff', transparent: true, toneMapped: false }),
    fieldData(source).heads.length,
  )
  m.frustumCulled = false
  return m
}

/** Field lines of the conductor: glowing tubes with pulses and arrowheads running along B. */
function FieldLines({ source }: { source: Source }) {
  const sign = useEm((s) => Math.sign(s.amps))
  const linesParent = useRef<Group>(null)
  const lines = useRef<Mesh | null>(null)
  const headsParent = useRef<Group>(null)
  const heads = useRef<InstancedMesh | null>(null)
  useEffect(
    () =>
      // The geometry is cached for the next visit; only the material goes.
      mount(linesParent.current, lines, makeFieldLines(source), (m) =>
        (m.material as ShaderMaterial).dispose(),
      ),
    [source],
  )
  useEffect(() => mount(headsParent.current, heads, makeFieldHeads(source), disposeMesh), [source])

  // Arrowheads point along B, which reverses with the current.
  useEffect(() => {
    const m = heads.current
    if (!m) return
    const o = new Object3D()
    const t = new Vector3()
    fieldData(source).heads.forEach((h, i) => {
      o.position.fromArray(h.p)
      t.fromArray(h.t).multiplyScalar(sign || 1)
      o.quaternion.setFromUnitVectors(UP, t)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [source, sign])

  useFrame((state) => {
    const amps = useEm.getState().amps
    const level = Math.abs(amps) / MAX_AMPS
    const l = lines.current
    if (l) {
      const mat = l.material as ShaderMaterial
      mat.uniforms.uTime.value = state.clock.elapsedTime
      mat.uniforms.uSpeed.value = Math.sign(amps) * (0.2 + level * 0.9)
      mat.uniforms.uIntensity.value = Math.pow(level, 0.6) * 1.25
    }
    const h = heads.current
    if (h) {
      ;(h.material as MeshBasicMaterial).opacity = Math.min(1, level * 3)
      h.visible = level > 0
    }
  })

  return (
    <>
      <group ref={linesParent} />
      <group ref={headsParent} />
    </>
  )
}

/** Electrons as instanced spheres, each with a position along the conductor and an offset across it. */
function makeCarriers(count: number, pathLength: number): InstancedMesh {
  const m = new InstancedMesh(
    new SphereGeometry(0.0075, 10, 8),
    new MeshBasicMaterial({ color: EM_COLORS.electron, toneMapped: false }),
    count,
  )
  m.frustumCulled = false
  const rand = mulberry32(count)
  const s = new Float32Array(count)
  const jitter = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    s[i] = rand() * pathLength
    const r = Math.sqrt(rand()) * WIRE_RADIUS * 0.7
    const a = rand() * Math.PI * 2
    jitter.set([Math.cos(a) * r, (rand() - 0.5) * WIRE_RADIUS, Math.sin(a) * r], i * 3)
  }
  m.userData = { s, jitter }
  return m
}

const scratch = new Object3D()
const scratchDir = new Vector3()

/** Free electrons drifting through the conductor, against the conventional current. */
function Carriers({ walker }: { walker: PathWalker }) {
  const count = Math.round(walker.length * 55)
  const parent = useRef<Group>(null)
  const carriers = useRef<InstancedMesh | null>(null)
  useEffect(
    () => mount(parent.current, carriers, makeCarriers(count, walker.length), disposeMesh),
    [count, walker],
  )
  useFrame((_, dt) => {
    const m = carriers.current
    if (!m) return
    const { s, jitter } = m.userData as { s: Float32Array; jitter: Float32Array }
    // Electrons carry negative charge: they move opposite to the current arrows.
    const step = Math.min(dt, 0.05) * (-useEm.getState().amps / MAX_AMPS) * 0.45
    const p = scratch.position
    for (let i = 0; i < count; i++) {
      s[i] += step
      walker.at(s[i], p)
      p.set(p.x + jitter[i * 3], p.y + jitter[i * 3 + 1], p.z + jitter[i * 3 + 2])
      scratch.updateMatrix()
      m.setMatrixAt(i, scratch.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return <group ref={parent} />
}

function makeCurrentArrows(count: number): InstancedMesh {
  const m = new InstancedMesh(
    new ConeGeometry(0.034, 0.09, 16),
    new MeshStandardMaterial({
      color: EM_COLORS.current,
      emissive: EM_COLORS.current,
      emissiveIntensity: 0.6,
      roughness: 0.35,
    }),
    count,
  )
  m.frustumCulled = false
  return m
}

/** Amber arrowheads threaded on the conductor, pointing along the conventional current. */
function CurrentArrows({ walker, count }: { walker: PathWalker; count: number }) {
  const amps = useEm((s) => s.amps)
  const parent = useRef<Group>(null)
  const arrows = useRef<InstancedMesh | null>(null)
  useEffect(() => mount(parent.current, arrows, makeCurrentArrows(count), disposeMesh), [count])
  useEffect(() => {
    const m = arrows.current
    if (!m) return
    const sign = amps < 0 ? -1 : 1
    for (let i = 0; i < count; i++) {
      walker.at(((i + 0.5) / count) * walker.length, scratch.position, scratchDir)
      scratch.quaternion.setFromUnitVectors(UP, scratchDir.multiplyScalar(sign))
      scratch.updateMatrix()
      m.setMatrixAt(i, scratch.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    m.visible = amps !== 0
  }, [walker, count, amps])
  return <group ref={parent} />
}

/**
 * Right-hand grip rule as a translucent hand: thumb along +y, fingers curling
 * right-handed about it. Turned upside down when the current reverses.
 */
function RightHand({ y, flip, source }: { y: number; flip: boolean; source: Source }) {
  const t = useT()
  const R = 0.12
  const skin = (
    <meshStandardMaterial
      color="#f1b38c"
      roughness={0.55}
      metalness={0}
      transparent
      opacity={0.62}
      side={DoubleSide}
    />
  )
  const wire = source === 'wire'
  return (
    <group position={[0, y, 0]}>
      <group rotation={[flip ? Math.PI : 0, 0, 0]}>
        {FINGER_Y.map((fy, i) => (
          // Torus arcs lie in xy sweeping +x → +y; turned onto xz they sweep right-handed about +y.
          <mesh key={i} position={[0, fy, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[R, 0.029 - i * 0.002, 12, 40, Math.PI * (1.5 - i * 0.04)]} />
            {skin}
          </mesh>
        ))}
        {/* Palm, flat against the side the fingers start from, and the forearm leaving it. */}
        <mesh position={[R + 0.045, -0.015, 0.075]} scale={[0.55, 1, 1]}>
          <capsuleGeometry args={[0.075, 0.09, 8, 16]} />
          {skin}
        </mesh>
        <mesh position={[R + 0.06, -0.03, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.06, 0.2, 6, 16]} />
          {skin}
        </mesh>
        <mesh position={[R + 0.005, 0.15, 0.03]} rotation={[0, 0, 0.12]}>
          <capsuleGeometry args={[0.031, 0.12, 6, 14]} />
          {skin}
        </mesh>
        <Label position={[R + 0.06, 0.26, 0]} color={wire ? EM_COLORS.current : EM_COLORS.fieldStrong}>
          {wire ? t('electromagnetism.hand.thumbI') : t('electromagnetism.hand.thumbB')}
        </Label>
        <Label position={[-R - 0.05, 0.07, 0]} color={wire ? EM_COLORS.fieldStrong : EM_COLORS.current}>
          {wire ? t('electromagnetism.hand.fingersB') : t('electromagnetism.hand.fingersI')}
        </Label>
      </group>
    </group>
  )
}

/** Field probe: an arrow showing B at one point, and the circle of field it sits on. */
function Probe({ source }: { source: Source }) {
  const { amps, probe } = useEm()
  const parent = useRef<Group>(null)
  const arrow = useRef<Arrow | null>(null)
  useEffect(() => mount(parent.current, arrow, new Arrow(EM_COLORS.probe, 0.011), (a) => a.dispose()), [])
  const p = probePoint(source, probe)
  const { b } = probeField(source, amps, probe)
  const dir = normalize(b)
  const len = amps === 0 ? 0 : 0.3
  useEffect(() => arrow.current?.aim(p, dir, len))
  const tip = scale(dir, len + 0.05)
  return (
    <>
      <mesh position={p}>
        <sphereGeometry args={[0.018, 16, 12]} />
        <meshStandardMaterial color={EM_COLORS.probe} emissive={EM_COLORS.probe} emissiveIntensity={0.5} />
      </mesh>
      {source === 'wire' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[probe, 0.003, 6, 96]} />
          <meshBasicMaterial color={EM_COLORS.probe} transparent opacity={0.45} toneMapped={false} />
        </mesh>
      )}
      <group ref={parent} />
      {len > 0 && (
        <Label position={[p[0] + tip[0], p[1] + tip[1], p[2] + tip[2]]} color={EM_COLORS.probe}>
          B
        </Label>
      )}
    </>
  )
}

/** Short leads where the coil joins the rest of the circuit (their own small field is left out). */
function SolenoidLeads() {
  const geometry = useMemo(() => {
    const { path } = conductor('solenoid')
    return [path[0], path[path.length - 1]].map((p) => {
      const end = scale(p, 1 / SCENE_M)
      return buildTube([end, [end[0] + 0.45, end[1], end[2]]], 0.016, false, undefined, 16)
    })
  }, [])
  useEffect(() => () => geometry.forEach((g) => g.dispose()), [geometry])
  return (
    <>
      {geometry.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#b9734c" metalness={0.9} roughness={0.35} />
        </mesh>
      ))}
    </>
  )
}

/** Current-carrying conductors and the magnetic field they wrap around themselves. */
export function CurrentScene({ controls }: { controls: ReturnType<typeof useEmControls> }) {
  const t = useT()
  const { source, amps, fieldLines: showLines, carriers, handRule } = useEm()
  const shift = usePanelShift()
  const view = useRef<Group>(null)
  const path = useMemo(() => visiblePath(source), [source])
  const walker = useMemo(() => new PathWalker(path.points, path.closed), [path])
  const conductorGeometry = useMemo(
    () => buildTube(path.points, source === 'solenoid' ? 0.016 : WIRE_RADIUS, path.closed, undefined, 20),
    [path, source],
  )
  useEffect(() => () => conductorGeometry.dispose(), [conductorGeometry])

  useEffect(() => {
    controls.configure(view.current)
  }, [controls])

  const handY = source === 'wire' ? 0.85 : source === 'loop' ? 0.62 : 1.12
  const labelAt: [number, number, number] =
    source === 'wire' ? [0.05, 1.25, 0] : source === 'loop' ? [0.62, 0.05, 0] : [0.4, 0.82, 0]

  return (
    <group position={[shift, 0, 0]}>
      <group ref={view} rotation={[0.32, -0.62, 0]}>
        <mesh geometry={conductorGeometry} renderOrder={1}>
          {/* See-through copper while the electrons are shown, so they can be seen inside. */}
          <meshPhysicalMaterial
            color="#d9875a"
            metalness={1}
            roughness={0.26}
            clearcoat={0.4}
            clearcoatRoughness={0.3}
            transparent
            opacity={carriers ? 0.42 : 1}
            depthWrite={!carriers}
          />
        </mesh>
        {source === 'solenoid' && <SolenoidLeads />}
        {carriers && <Carriers walker={walker} />}
        <CurrentArrows walker={walker} count={source === 'wire' ? 6 : source === 'loop' ? 8 : 20} />
        {showLines && <FieldLines source={source} />}
        <Probe source={source} />
        {handRule && amps !== 0 && <RightHand y={handY} flip={amps < 0} source={source} />}
        <Label position={labelAt} color={EM_COLORS.current}>
          I = {Math.abs(amps).toFixed(1)} A {amps === 0 ? '' : t('electromagnetism.current.conventional')}
        </Label>
        {carriers && (
          <Label
            position={source === 'wire' ? [0.05, -1.2, 0] : [labelAt[0], -labelAt[1] - 0.1, 0]}
            color={EM_COLORS.electron}
          >
            {t('electromagnetism.current.electrons')}
          </Label>
        )}
      </group>
    </group>
  )
}
