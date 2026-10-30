import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DataTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { useT } from '../../i18n'
import { useEm, type HopfMode } from '../emStore'
import { equatorTargets, hopfSpin, preimage, spinColor } from '../hopfion'
import type { Vec3 } from '../vec'
import { buildTube } from './geometry'
import { disposeMesh, mount, usePanelShift, type useEmControls } from './hooks'
import { Label } from './Label'

/** Scene units per core-ring radius. */
const S = 0.42
/** Half-width of the sampled cube, in core-ring radii. */
const EXTENT = 2.4
const UP = new Vector3(0, 1, 0)
/** Display colour of the core ring (spins straight down). */
const CORE_COLOR = '#4a5578'
/** Radians per second of the spin precession. */
const PRECESSION_RATE = 0.45

// The texture's z axis (its symmetry axis) points up on screen: (x, y, z) → (x, z, −y),
// a proper rotation, applied to positions and spins alike.
const toScene = (v: Vec3, k = 1): Vec3 => [v[0] * k, v[2] * k, -v[1] * k]

/** Shared precession angle, advanced by the scene each frame. */
const precession = { beta: 0 }

const scratch = { o: new Object3D(), d: new Vector3(), c: new Color() }

function makeSpins(count: number, mode: HopfMode): InstancedMesh {
  const size = mode === 'volume' ? 1 : 0.85
  const m = new InstancedMesh(
    new ConeGeometry(0.024 * size, 0.09 * size, 12),
    new MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 }),
    count,
  )
  m.frustumCulled = false
  // Not yet aimed for any precession angle.
  m.userData.beta = NaN
  return m
}

/** Grid points and the cones on them, re-aimed and re-coloured every frame as the spins precess. */
function Spins({ mode, slice, background }: { mode: HopfMode; slice: number; background: boolean }) {
  const points = useMemo(() => {
    const out: Vec3[] = []
    if (mode === 'volume') {
      const n = 17
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          for (let k = 0; k < n; k++) {
            const p: Vec3 = [
              -EXTENT + (2 * EXTENT * i) / (n - 1),
              -EXTENT + (2 * EXTENT * j) / (n - 1),
              -EXTENT + (2 * EXTENT * k) / (n - 1),
            ]
            // Precession turns spins about z, so which ones point (nearly) up never changes.
            if (background || hopfSpin(...p)[2] < 0.72) out.push(p)
          }
    } else {
      const n = 29
      for (let i = 0; i < n; i++)
        for (let k = 0; k < n; k++)
          out.push([-EXTENT + (2 * EXTENT * i) / (n - 1), slice, -EXTENT + (2 * EXTENT * k) / (n - 1)])
    }
    return out
  }, [mode, slice, background])

  const parent = useRef<Group>(null)
  const spins = useRef<InstancedMesh | null>(null)
  useEffect(() => mount(parent.current, spins, makeSpins(points.length, mode), disposeMesh), [points, mode])

  useFrame(() => {
    const m = spins.current
    if (!m || m.userData.beta === precession.beta) return
    m.userData.beta = precession.beta
    const { o, d, c } = scratch
    points.forEach((p, i) => {
      const n = hopfSpin(p[0], p[1], p[2], precession.beta)
      o.position.fromArray(toScene(p, S))
      o.quaternion.setFromUnitVectors(UP, d.fromArray(toScene(n)))
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      const rgb = spinColor(n)
      m.setColorAt(i, c.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return <group ref={parent} />
}

const TEX = 128

function makeSlicePlane(): Mesh {
  const texture = new DataTexture(new Uint8Array(TEX * TEX * 4), TEX, TEX, RGBAFormat)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  const m = new Mesh(
    new PlaneGeometry(2 * EXTENT * S, 2 * EXTENT * S),
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.78,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  m.renderOrder = -1
  m.userData = { beta: NaN, slice: NaN }
  return m
}

/** The slice plane painted with the spin colours (the picture a 2D figure would show). */
function SlicePlane({ slice }: { slice: number }) {
  const parent = useRef<Group>(null)
  const plane = useRef<Mesh | null>(null)
  useEffect(
    () =>
      mount(parent.current, plane, makeSlicePlane(), (m) => {
        ;(m.material as MeshBasicMaterial).map?.dispose()
        disposeMesh(m)
      }),
    [],
  )
  useFrame(() => {
    const m = plane.current
    if (!m || (m.userData.beta === precession.beta && m.userData.slice === slice)) return
    m.userData = { beta: precession.beta, slice }
    // Texture rows run along +z (up on screen); the plane sits at y = slice, i.e. scene z = −slice.
    m.position.z = -slice * S
    const texture = (m.material as MeshBasicMaterial).map!
    const data = (texture.image as { data: Uint8Array }).data
    for (let j = 0; j < TEX; j++)
      for (let i = 0; i < TEX; i++) {
        const x = -EXTENT + (2 * EXTENT * (i + 0.5)) / TEX
        const z = -EXTENT + (2 * EXTENT * (j + 0.5)) / TEX
        const rgb = spinColor(hopfSpin(x, slice, z, precession.beta))
        const k = (j * TEX + i) * 4
        data[k] = rgb[0] * 255
        data[k + 1] = rgb[1] * 255
        data[k + 2] = rgb[2] * 255
        data[k + 3] = 255
      }
    texture.needsUpdate = true
  })
  return <group ref={parent} />
}

/** Closed loops of constant spin direction. Any two of them link once: that is the Hopf charge. */
function Preimages({ torus }: { torus: boolean }) {
  const loops = useMemo(() => {
    const targets: Vec3[] = [...equatorTargets(6), [0, 0, -1]]
    return targets.map((m) => {
      const pts = preimage(m, 220).map((p) => toScene(p, S))
      const core = m[2] < -0.5
      const rgb = spinColor(m)
      return {
        geometry: buildTube(pts, core ? 0.02 : 0.015, true, undefined, 10),
        // The core ring's spins point down (near black in the colour code); lift it so it reads on screen.
        color: core ? new Color(CORE_COLOR) : new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace),
      }
    })
  }, [])
  useEffect(() => () => loops.forEach((l) => l.geometry.dispose()), [loops])

  // The torus where spins lie flat (nz = 0), woven from its fibres and coloured by their direction.
  const surface = useMemo(() => {
    const nPhi = 96
    const nAlpha = 160
    const pos = new Float32Array(nPhi * nAlpha * 3)
    const col = new Float32Array(nPhi * nAlpha * 3)
    const c = new Color()
    for (let i = 0; i < nPhi; i++) {
      const phi = (i / nPhi) * Math.PI * 2
      const m: Vec3 = [Math.cos(phi), Math.sin(phi), 0]
      const loop = preimage(m, nAlpha)
      const rgb = spinColor(m)
      c.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace)
      loop.forEach((p, j) => {
        pos.set(toScene(p, S), (i * nAlpha + j) * 3)
        col.set([c.r, c.g, c.b], (i * nAlpha + j) * 3)
      })
    }
    const index: number[] = []
    for (let i = 0; i < nPhi; i++)
      for (let j = 0; j < nAlpha; j++) {
        const a = i * nAlpha + j
        const b = ((i + 1) % nPhi) * nAlpha + j
        const a1 = i * nAlpha + ((j + 1) % nAlpha)
        const b1 = ((i + 1) % nPhi) * nAlpha + ((j + 1) % nAlpha)
        index.push(a, b, a1, a1, b, b1)
      }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('color', new BufferAttribute(col, 3))
    g.setIndex(index)
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(() => () => surface.dispose(), [surface])

  return (
    <>
      {loops.map((l, i) => (
        <mesh key={i} geometry={l.geometry}>
          <meshStandardMaterial
            color={l.color}
            emissive={l.color}
            emissiveIntensity={0.35}
            roughness={0.3}
            metalness={0.1}
          />
        </mesh>
      ))}
      {torus && (
        <mesh geometry={surface}>
          <meshStandardMaterial
            vertexColors
            transparent
            opacity={0.3}
            side={DoubleSide}
            depthWrite={false}
            roughness={0.5}
          />
        </mesh>
      )}
    </>
  )
}

/** A Hopfion: a knotted 3D spin texture, shown as spin arrows and its linked preimage loops. */
export function HopfionScene({ controls }: { controls: ReturnType<typeof useEmControls> }) {
  const t = useT()
  const { hopfMode, slice, preimages, torus, background } = useEm()
  const shift = usePanelShift()
  const view = useRef<Group>(null)
  const turning = useRef<Group>(null)
  useEffect(() => {
    controls.configure(view.current)
  }, [controls])

  useFrame((_, dt) => {
    if (useEm.getState().precess)
      precession.beta = (precession.beta + Math.min(dt, 0.05) * PRECESSION_RATE) % (Math.PI * 2)
    // A spin rotation by β about z is the same texture turned by β about its axis (checked in em.test.ts).
    if (turning.current) turning.current.rotation.y = precession.beta
  })

  return (
    <group position={[shift, 0, 0]}>
      <group ref={view} rotation={[0.45, -0.5, 0]}>
        <Spins mode={hopfMode} slice={slice} background={background} />
        {hopfMode === 'slice' && <SlicePlane slice={slice} />}
        <group ref={turning}>{preimages && <Preimages torus={torus} />}</group>
        {/* The symmetry axis: spins along it point straight up. */}
        <mesh>
          <cylinderGeometry args={[0.003, 0.003, 2 * EXTENT * S, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.25} toneMapped={false} />
        </mesh>
        {preimages && (
          <Label position={[S * 1.05, 0.02, 0]} color={CORE_COLOR}>
            {t('electromagnetism.hopf.coreLabel')}
          </Label>
        )}
        <Label position={[0, EXTENT * S + 0.06, 0]} color="#ffffff">
          {t('electromagnetism.hopf.upLabel')}
        </Label>
      </group>
    </group>
  )
}
