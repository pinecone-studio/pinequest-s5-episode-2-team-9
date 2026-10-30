import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  type ShaderMaterial,
} from 'three'
import { EM_COLORS } from '../colors'
import { lorentzLive, lorentzParams, useEm } from '../emStore'
import {
  borisStep,
  bVector,
  eVector,
  lorentzForce,
  outOfBounds,
  startPosition,
  startVelocity,
  type EDirection,
} from '../lorentz'
import { length, normalize, type Vec3 } from '../vec'
import { Arrow, buildTube, createFlowMaterial, mergeTubes } from './geometry'
import { disposeMesh, mount, usePanelShift, type useEmControls } from './hooks'
import { Label } from './Label'

const TRAIL = 1600
/** Integration step (scaled time units); several per frame keep the orbit accurate. */
const DT = 0.004
const HALF = 1.25
const UP = new Vector3(0, 1, 0)

const B_DIR: Vec3 = [0, 1, 0]
const B_OFFSETS: Vec3[] = [-1, -0.5, 0, 0.5, 1].flatMap((x) =>
  [-1, -0.5, 0, 0.5, 1].map((z): Vec3 => [x, 0, z]),
)
const E_DIR: Record<EDirection, Vec3> = { perp: [1, 0, 0], para: [0, 1, 0] }
const E_OFFSETS: Record<EDirection, Vec3[]> = {
  perp: [-0.75, -0.25, 0.25, 0.75].flatMap((y) =>
    [-0.75, 0.25].map((z): Vec3 => [0, y, z + (y > 0 ? 0.25 : 0)]),
  ),
  para: [-0.75, -0.25, 0.25, 0.75].flatMap((x) =>
    [-0.75, 0.25].map((z): Vec3 => [x, 0, z + (x > 0 ? 0.25 : 0)]),
  ),
}

function makeFieldLines(dir: Vec3, offsets: Vec3[], weak: string, strong: string): Mesh {
  const tubes = offsets.map((o) =>
    buildTube(
      [
        [o[0] - dir[0] * HALF, o[1] - dir[1] * HALF, o[2] - dir[2] * HALF],
        [o[0] + dir[0] * HALF, o[1] + dir[1] * HALF, o[2] + dir[2] * HALF],
      ],
      0.005,
      false,
      undefined,
      6,
    ),
  )
  const m = new Mesh(mergeTubes(tubes), createFlowMaterial(weak, strong))
  m.frustumCulled = false
  return m
}

/** Three arrowheads along each line. */
function makeFieldHeads(dir: Vec3, offsets: Vec3[], color: string): InstancedMesh {
  const m = new InstancedMesh(
    new ConeGeometry(0.02, 0.06, 10),
    new MeshBasicMaterial({ color, transparent: true, toneMapped: false }),
    offsets.length * 3,
  )
  const o = new Object3D()
  o.quaternion.setFromUnitVectors(UP, new Vector3(...dir))
  offsets.forEach((p, i) => {
    for (let k = 0; k < 3; k++) {
      const f = (k - 1) * HALF * 0.6
      o.position.set(p[0] + dir[0] * f, p[1] + dir[1] * f, p[2] + dir[2] * f)
      o.updateMatrix()
      m.setMatrixAt(i * 3 + k, o.matrix)
    }
  })
  return m
}

/** A uniform field drawn as parallel glowing lines with arrowheads, brightness following its strength. */
function UniformField({
  dir,
  offsets,
  level,
  weak,
  strong,
}: {
  dir: Vec3
  offsets: Vec3[]
  level: number
  weak: string
  strong: string
}) {
  const linesParent = useRef<Group>(null)
  const lines = useRef<Mesh | null>(null)
  const headsParent = useRef<Group>(null)
  const heads = useRef<InstancedMesh | null>(null)
  useEffect(
    () => mount(linesParent.current, lines, makeFieldLines(dir, offsets, weak, strong), disposeMesh),
    [dir, offsets, weak, strong],
  )
  useEffect(
    () => mount(headsParent.current, heads, makeFieldHeads(dir, offsets, strong), disposeMesh),
    [dir, offsets, strong],
  )
  useFrame((state) => {
    const l = lines.current
    if (l) {
      const mat = l.material as ShaderMaterial
      mat.uniforms.uTime.value = state.clock.elapsedTime
      mat.uniforms.uSpeed.value = 0.15 + level * 0.35
      mat.uniforms.uIntensity.value = Math.min(1, level) * 0.75
      l.visible = level > 0
    }
    const h = heads.current
    if (h) {
      ;(h.material as MeshBasicMaterial).opacity = Math.min(1, level * 1.5) * 0.8
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

function makeTrail(): Line {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(TRAIL * 3), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(TRAIL * 3), 3))
  g.setDrawRange(0, 0)
  const line = new Line(
    g,
    new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  )
  line.frustumCulled = false
  return line
}

/** The parallelogram spanned by v and B: F always stands straight out of it. */
function makePlane(): Mesh {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(12), 3))
  g.setIndex([0, 1, 2, 0, 2, 3])
  const m = new Mesh(
    g,
    new MeshBasicMaterial({
      color: '#9fd0ff',
      transparent: true,
      opacity: 0.16,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  m.frustumCulled = false
  return m
}

function makeArrows() {
  const g = new Group()
  const arrows = {
    v: new Arrow(EM_COLORS.velocity, 0.012),
    b: new Arrow(EM_COLORS.magnetic, 0.012),
    f: new Arrow(EM_COLORS.force, 0.014),
    fe: new Arrow(EM_COLORS.electric, 0.008),
    fm: new Arrow(EM_COLORS.magneticForce, 0.008),
  }
  g.add(...Object.values(arrows))
  g.userData = arrows
  return g
}

type Arrows = Record<'v' | 'b' | 'f' | 'fe' | 'fm', Arrow>

/** A charged particle in uniform E and B fields, pushed by F = q(E + v × B). */
export function LorentzScene({ controls }: { controls: ReturnType<typeof useEmControls> }) {
  const { b, e, eDir, charge, vectors, resetToken } = useEm()
  const shift = usePanelShift()
  const view = useRef<Group>(null)
  useEffect(() => {
    controls.configure(view.current)
  }, [controls])

  const sim = useRef({ x: [0, 0, 0] as Vec3, v: [0, 0, 0] as Vec3, count: 0 })
  const particle = useRef<Mesh>(null)
  const vTip = useRef<Group>(null)
  const bTip = useRef<Group>(null)
  const fTip = useRef<Group>(null)
  const qTip = useRef<Group>(null)
  const color = useRef(new Color())
  const particleColor = charge > 0 ? EM_COLORS.positive : EM_COLORS.negative

  const trailParent = useRef<Group>(null)
  const trail = useRef<Line | null>(null)
  const planeParent = useRef<Group>(null)
  const plane = useRef<Mesh | null>(null)
  const arrowsParent = useRef<Group>(null)
  const arrows = useRef<Group | null>(null)
  useEffect(() => mount(trailParent.current, trail, makeTrail(), disposeMesh), [])
  useEffect(() => mount(planeParent.current, plane, makePlane(), disposeMesh), [])
  useEffect(
    () =>
      mount(arrowsParent.current, arrows, makeArrows(), (g) =>
        Object.values(g.userData as Arrows).forEach((a) => a.dispose()),
      ),
    [],
  )

  // Restart whenever a parameter changes (the store bumps resetToken).
  useEffect(() => {
    const p = lorentzParams(useEm.getState())
    sim.current = { x: startPosition(p), v: startVelocity(p), count: 0 }
    lorentzLive.time = 0
  }, [resetToken])

  useFrame((_, frameDt) => {
    const st = useEm.getState()
    const p = lorentzParams(st)
    const s = sim.current
    const E = eVector(p)
    const B = bVector(p)
    const dt = Math.min(frameDt, 0.05)
    if (st.playing) {
      for (let remain = dt; remain > 1e-6; remain -= DT)
        borisStep(s.x, s.v, p.charge, E, B, Math.min(DT, remain))
      lorentzLive.time += dt
      if (outOfBounds(s.x)) {
        s.x = startPosition(p)
        s.v = startVelocity(p)
        s.count = 0
        lorentzLive.time = 0
      }
    }
    lorentzLive.speed = length(s.v)

    const line = trail.current
    if (line) {
      // Append to the trail; once full, shift everything back one point.
      const pos = line.geometry.getAttribute('position') as BufferAttribute
      const arr = pos.array as Float32Array
      if (st.playing) {
        if (s.count < TRAIL) s.count++
        else arr.copyWithin(0, 3)
        arr.set(s.x, (s.count - 1) * 3)
        pos.needsUpdate = true
      }
      const col = line.geometry.getAttribute('color') as BufferAttribute
      const carr = col.array as Float32Array
      const c = color.current.set(p.charge > 0 ? EM_COLORS.positive : EM_COLORS.negative)
      for (let i = 0; i < s.count; i++) {
        // Fades from the newest point back to nothing.
        const k = Math.pow(i / Math.max(1, s.count - 1), 1.6) * 1.4
        carr[i * 3] = c.r * k
        carr[i * 3 + 1] = c.g * k
        carr[i * 3 + 2] = c.b * k
      }
      col.needsUpdate = true
      line.geometry.setDrawRange(0, s.count)
    }

    particle.current?.position.fromArray(s.x)
    qTip.current?.position.set(s.x[0] + 0.05, s.x[1] + 0.05, s.x[2])

    // Vectors at the particle.
    const show = st.vectors
    const force = lorentzForce(p, s.v)
    const vLen = show ? Math.min(0.7, length(s.v) * 0.4) : 0
    const bLen = show ? Math.min(0.6, p.b * 0.2) : 0
    const fLen = show ? Math.min(0.75, length(force.total) * 0.3) : 0
    const a = arrows.current?.userData as Arrows | undefined
    if (a) {
      a.v.aim(s.x, s.v, vLen)
      a.b.aim(s.x, B, bLen)
      a.f.aim(s.x, force.total, fLen)
      // With both fields on, also show the two parts that add up to F.
      const parts = show && p.e > 0 && p.b > 0
      a.fe.aim(s.x, force.electric, parts ? Math.min(0.6, length(force.electric) * 0.3) : 0)
      a.fm.aim(s.x, force.magnetic, parts ? Math.min(0.6, length(force.magnetic) * 0.3) : 0)
    }
    const place = (g: Group | null, dir: Vec3, len: number) => {
      if (!g) return
      g.visible = len > 0.02
      const d = normalize(dir)
      g.position.set(s.x[0] + d[0] * (len + 0.04), s.x[1] + d[1] * (len + 0.04), s.x[2] + d[2] * (len + 0.04))
    }
    place(vTip.current, s.v, vLen)
    place(bTip.current, B, bLen)
    place(fTip.current, force.total, fLen)

    // v–B parallelogram.
    const quad = plane.current
    if (quad) {
      quad.visible = show && st.vbPlane && vLen > 0.02 && bLen > 0.02
      if (quad.visible) {
        const vd = normalize(s.v)
        const bd = normalize(B)
        const L = 0.32
        const pos = quad.geometry.getAttribute('position') as BufferAttribute
        pos.setXYZ(0, s.x[0], s.x[1], s.x[2])
        pos.setXYZ(1, s.x[0] + vd[0] * L, s.x[1] + vd[1] * L, s.x[2] + vd[2] * L)
        pos.setXYZ(
          2,
          s.x[0] + (vd[0] + bd[0]) * L,
          s.x[1] + (vd[1] + bd[1]) * L,
          s.x[2] + (vd[2] + bd[2]) * L,
        )
        pos.setXYZ(3, s.x[0] + bd[0] * L, s.x[1] + bd[1] * L, s.x[2] + bd[2] * L)
        pos.needsUpdate = true
      }
    }
  })

  return (
    <group position={[shift, 0, 0]}>
      <group ref={view} rotation={[0.3, -0.75, 0]}>
        <UniformField
          dir={B_DIR}
          offsets={B_OFFSETS}
          level={b / 3}
          weak={EM_COLORS.fieldWeak}
          strong={EM_COLORS.fieldStrong}
        />
        <UniformField
          dir={E_DIR[eDir]}
          offsets={E_OFFSETS[eDir]}
          level={e / 1.2}
          weak="#7a3d00"
          strong={EM_COLORS.electric}
        />
        <group ref={trailParent} />
        <mesh ref={particle}>
          <sphereGeometry args={[0.045, 24, 16]} />
          <meshStandardMaterial
            color={particleColor}
            emissive={particleColor}
            emissiveIntensity={1.1}
            roughness={0.3}
            toneMapped={false}
          />
        </mesh>
        <group ref={arrowsParent} />
        <group ref={planeParent} />
        <group ref={qTip}>
          <Label color={particleColor}>{charge > 0 ? '+q' : '−q'}</Label>
        </group>
        <group ref={vTip}>{vectors && <Label color={EM_COLORS.velocity}>v</Label>}</group>
        <group ref={bTip}>{vectors && <Label color={EM_COLORS.magnetic}>B</Label>}</group>
        <group ref={fTip}>{vectors && <Label color={EM_COLORS.force}>F</Label>}</group>
        {b > 0 && (
          <Label position={[1.02, 1.3, 1]} color={EM_COLORS.fieldStrong}>
            B
          </Label>
        )}
        {e > 0 && (
          <Label
            position={eDir === 'perp' ? [1.3, 0.75, 0.25] : [0.75, 1.3, 0.25]}
            color={EM_COLORS.electric}
          >
            E
          </Label>
        )}
      </group>
    </group>
  )
}
