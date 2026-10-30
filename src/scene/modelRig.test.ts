import { Box3, Color, Group, LineBasicMaterial, LineSegments, Quaternion, Vector3, type BufferAttribute } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { HOMES, PARTS, rigState, settle, testCamera, testModel, testRig, testScene, TOP_JOINT } from './__fixtures__/rig'
import { forEachPiece, ModelRig, type RigMotion } from './modelRig'
import { MAX_PITCH } from './tourView'

const home = (id: string) => new Vector3(...HOMES[id])
const leaderLines = (rig: ModelRig) => rig.inner.children.find((c): c is LineSegments => c instanceof LineSegments)!
/** A part's extent on screen (world units), as the exploded view has to fit it. */
const extent = (rig: ModelRig, id: string) => {
  const part = rig.parts.get(id)!
  const r = part.radius * rig.normScale * rig.model.scale.x
  const p = part.mesh.getWorldPosition(new Vector3())
  return { x: Math.abs(p.x - rig.model.position.x) + r, y: Math.abs(p.y - rig.model.position.y) + r }
}

describe('building a rig', () => {
  it('makes one mesh per part, where the part sits in the scene', () => {
    const rig = testRig()
    expect([...rig.parts.keys()]).toEqual(PARTS.map((p) => p.id))
    for (const [id, part] of rig.parts) {
      expect(part.mesh.name).toBe(id)
      expect(part.mesh.userData.partId).toBe(id)
      expect(part.mesh.parent).toBe(rig.inner)
      expect(part.home.toArray()).toEqual(HOMES[id])
      expect(part.location).toBe('model')
      expect(part.ghost.visible).toBe(false)
      expect(part.edges?.parent).toBe(part.mesh)
    }
    expect(rig.parts.get('core')!.radius).toBeCloseTo(Math.sqrt(3) * 0.2, 6)
  })

  it('scales the model so it fits a unit sphere around the origin', () => {
    const rig = testRig()
    const box = new Box3().setFromObject(testScene())
    expect(rig.center.distanceTo(box.getCenter(new Vector3()))).toBeCloseTo(0, 6)
    expect(rig.rawRadius).toBeCloseTo(box.getSize(new Vector3()).length() / 2, 6)
    expect(rig.normScale).toBeCloseTo(1 / rig.rawRadius, 9)
    rig.root.updateMatrixWorld(true)
    expect(rig.inner.localToWorld(rig.center.clone()).length()).toBeCloseTo(0, 6)
    const corner = rig.inner.localToWorld(box.max.clone())
    expect(corner.length()).toBeCloseTo(1, 6)
  })

  it('shows a part with no surface of its own as its pieces merged, and keeps the pieces for Study', () => {
    const lobe = testRig().parts.get('lobe')!
    // One group (and realistic material) per leaf surface: a, b1 and b2.
    expect(lobe.mesh.geometry.groups).toHaveLength(3)
    expect(lobe.reals).toHaveLength(3)
    expect(lobe.mesh.geometry.getAttribute('position').count).toBe(3 * 24)
    expect(lobe.pieces.map((p) => p.def.id)).toEqual(['a', 'b'])
    const [a, b] = lobe.pieces
    expect(b.pieces.map((p) => p.def.id)).toEqual(['b1', 'b2'])
    expect(a.mesh.parent).toBe(lobe.mesh)
    expect(b.pieces[0].mesh.parent).toBe(b.mesh)
    expect(a.mesh.name).toBe('lobe__a')
    expect(a.mesh.userData.pieceId).toBe('a')
    expect(a.home.toArray()).toEqual([-0.05, 0, 0])
    forEachPiece(lobe, (p) => expect(p.mesh.visible, p.def.id).toBe(false))
    // Siblings get distinct tints.
    expect(a.color.equals(b.color)).toBe(false)
  })

  it('names what is missing from the scene', () => {
    const missingPart = testModel({ parts: [...PARTS, { id: 'tail', group: 'body', color: '#fff', dependsOn: [] }] })
    expect(() => new ModelRig(missingPart, testScene())).toThrow('Part "tail" not found in /models/test.glb')

    const missingPiece = testModel({ parts: PARTS.map((p) => (p.id === 'core' ? { ...p, pieces: [{ id: 'valve' }] } : p)) })
    expect(() => new ModelRig(missingPiece, testScene())).toThrow('Piece "core__valve" not found')

    const scene = testScene()
    const empty = new Group()
    empty.name = 'tail'
    scene.add(empty)
    expect(() => new ModelRig(missingPart, scene)).toThrow('Part "tail" has no mesh')
  })

  it('reads where parts attach from the scene extras', () => {
    const rig = testRig()
    expect(rig.extras).toEqual({ connections: { top: TOP_JOINT } })
    expect([...rig.joints.keys()]).toEqual(['top'])
    const joint = rig.joints.get('top')!
    expect(joint.to).toBe('core')
    expect(joint.pos.toArray()).toEqual(TOP_JOINT.pos)
    expect(joint.local.toArray()).toEqual([0, 0.3 - 0.6, 0].map((v) => expect.closeTo(v, 9)))
    expect(joint.normal.toArray()).toEqual([0, 1, 0])
    expect(joint.path).toBeNull()
  })

  it('explodes each part away from the centre, or along its own direction, scaled per part', () => {
    const rig = testRig()
    const raw = rig.rawRadius
    const left = rig.parts.get('left')!
    const fromCenter = home('left').sub(rig.center)
    expect(left.explodeOffset.clone().normalize().dot(fromCenter.clone().normalize())).toBeCloseTo(1, 9)
    expect(left.explodeOffset.length()).toBeCloseTo(fromCenter.length() * 1.3 + raw * 0.35, 9)
    // "top" has its own direction: straight up.
    expect(rig.parts.get('top')!.explodeOffset.clone().normalize().toArray()).toEqual([0, 1, 0].map((v) => expect.closeTo(v, 9)))
    // "right" mirrors "left" but flies twice as far.
    expect(rig.parts.get('right')!.explodeOffset.length()).toBeCloseTo(2 * left.explodeOffset.length(), 9)
    // The compact spread (landing hero) is shorter.
    expect(left.compactOffset.length()).toBeLessThan(left.explodeOffset.length())
  })
})

describe('explode', () => {
  it('spreads the parts out and back home', () => {
    const rig = testRig()
    settle(rig, rigState({ explode: 1 }))
    for (const [id, part] of rig.parts) {
      // Spread in view space: full width, a little less height, flatter in depth.
      const expected = home(id).add(part.explodeOffset.clone().multiply(new Vector3(1, 0.85, 0.6)))
      expect(part.mesh.position.distanceTo(expected), id).toBeCloseTo(0, 6)
    }
    settle(rig, rigState({ explode: 0 }))
    for (const [id, part] of rig.parts) expect(part.mesh.position.distanceTo(home(id)), id).toBeCloseTo(0, 6)
    expect(rig.model.scale.x).toBeCloseTo(1, 6)
  })

  it('shrinks the model so the exploded parts just fit the free area', () => {
    const rig = testRig()
    settle(rig, rigState({ explode: 1 }))
    expect(rig.model.scale.x).toBeLessThan(1)
    const extents = [...rig.parts.keys()].map((id) => extent(rig, id))
    // The free area is 1 × 1 until layout() has measured the screen.
    const widest = Math.max(...extents.map((e) => e.x))
    const tallest = Math.max(...extents.map((e) => e.y))
    expect(Math.max(widest, tallest)).toBeCloseTo(1, 6)
  })

  it('keeps the original compact spread when wide explode is off', () => {
    const rig = testRig()
    rig.wideExplode = false
    settle(rig, rigState({ explode: 1 }))
    for (const [id, part] of rig.parts) expect(part.mesh.position.distanceTo(home(id).add(part.compactOffset)), id).toBeCloseTo(0, 6)
    expect(rig.model.scale.x).toBeCloseTo(1 / 1.5, 6)
  })

  it('draws leader lines from each slot to its exploded part', () => {
    const rig = testRig()
    settle(rig, rigState({ explode: 1 }))
    const lines = leaderLines(rig)
    expect((lines.material as LineBasicMaterial).opacity).toBeCloseTo(0.35, 6)
    const pos = lines.geometry.getAttribute('position') as BufferAttribute
    ;[...rig.parts.values()].forEach((part, i) => {
      expect(new Vector3().fromBufferAttribute(pos, 2 * i).distanceTo(part.home)).toBeCloseTo(0, 6)
      expect(new Vector3().fromBufferAttribute(pos, 2 * i + 1).distanceTo(part.mesh.position)).toBeCloseTo(0, 6)
    })
    settle(rig, rigState({ explode: 0 }))
    expect((lines.material as LineBasicMaterial).opacity).toBe(0)
    settle(rig, rigState({ explode: 1, mode: 'assembly' }))
    expect((lines.material as LineBasicMaterial).opacity).toBe(0)
  })

  it('moves the model clear of the side panel and widens the spread to the free space', () => {
    const rig = testRig()
    const camera = testCamera()
    const halfH = Math.tan((20 * Math.PI) / 180) * 4
    const halfW = halfH * camera.aspect
    rig.layout(camera, { width: 1600, height: 900 }, 400, [])
    settle(rig, rigState({ explode: 1 }), camera)
    expect(rig.model.position.x).toBeCloseTo(-0.25 * halfW, 6)
    const free = { w: halfW * 0.75 * 0.92, h: halfH * 0.8 }
    const stretch = Math.min(1.8, free.w / free.h)
    const left = rig.parts.get('left')!
    expect(left.mesh.position.x - left.home.x).toBeCloseTo(left.explodeOffset.x * stretch, 6)
    // Still fits the free area beside the panel.
    const extents = [...rig.parts.keys()].map((id) => extent(rig, id))
    expect(Math.max(...extents.map((e) => e.x / free.w), ...extents.map((e) => e.y / free.h))).toBeCloseTo(1, 6)

    // On a phone the panel covers the model instead, so there is no shift.
    rig.layout(camera, { width: 600, height: 900 }, 400, [])
    settle(rig, rigState(), camera)
    expect(rig.model.position.x).toBeCloseTo(0, 6)
  })
})

describe('view', () => {
  it('eases toward the target rotation and back to the initial one', () => {
    const rig = testRig({ initialRotation: [0.2, 0.4, 0] })
    settle(rig, rigState())
    expect(rig.model.quaternion.angleTo(rig.rotation)).toBeCloseTo(0, 6)
    rig.setRotation([0, Math.PI / 2, 0])
    rig.update(1 / 60, rigState(), testCamera())
    // Partway there after one frame.
    expect(rig.model.quaternion.angleTo(rig.rotation)).toBeGreaterThan(0.1)
    settle(rig, rigState())
    expect(rig.model.quaternion.angleTo(rig.rotation)).toBeCloseTo(0, 6)
    rig.resetRotation()
    settle(rig, rigState())
    expect(rig.model.quaternion.angleTo(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.2).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4)))).toBeCloseTo(0, 6)
  })

  it('rotates by screen-space drags about the camera axes', () => {
    const rig = testRig()
    rig.rotateBy(Math.PI / 2, 0)
    expect(new Vector3(1, 0, 0).applyQuaternion(rig.rotation).toArray()).toEqual([0, 0, -1].map((v) => expect.closeTo(v, 9)))
    rig.rotateBy(0, Math.PI / 2)
    // Pitch is about the screen's x axis, whatever the model's yaw.
    expect(new Vector3(1, 0, 0).applyQuaternion(rig.rotation).toArray()).toEqual([0, 1, 0].map((v) => expect.closeTo(v, 9)))
    rig.resetRotation()
    rig.rotateBy(0, 0, Math.PI / 2)
    expect(new Vector3(1, 0, 0).applyQuaternion(rig.rotation).toArray()).toEqual([0, 1, 0].map((v) => expect.closeTo(v, 9)))
  })

  it('turns a part to face the viewer', () => {
    const rig = testRig()
    const facing = (id: string) => {
      rig.facePart(id, 1)
      const part = rig.parts.get(id)!
      return part.home.clone().add(part.explodeOffset).sub(rig.center).applyQuaternion(rig.rotation).normalize()
    }
    for (const id of ['right', 'left']) expect(facing(id).z, id).toBeGreaterThan(0.95)
    // A part straight above can only be tilted so far, so the model never turns upside down.
    const top = facing('top')
    expect(top.z).toBeCloseTo(Math.sin(MAX_PITCH), 9)
    expect(top.y).toBeGreaterThan(0)
    // A part at the centre has no side to show: back to the initial view...
    rig.facePart('core', 0)
    expect(rig.rotation.angleTo(new Quaternion())).toBeCloseTo(0, 9)
    // ...but exploded it drops below the others, so the view tilts down to it, as far as allowed.
    rig.facePart('core', 1)
    expect(rig.rotation.angleTo(new Quaternion())).toBeCloseTo(MAX_PITCH, 9)
    expect(new Vector3(0, -1, 0).applyQuaternion(rig.rotation).z).toBeGreaterThan(0)
    rig.facePart('core', 0)
    // Unknown parts are ignored.
    rig.setRotation([0, 1, 0])
    rig.facePart('tail', 1)
    expect(rig.rotation.angleTo(new Quaternion())).toBeCloseTo(1, 9)
  })

  it('measures the model on screen', () => {
    const rig = testRig()
    const camera = testCamera()
    settle(rig, rigState(), camera)
    const viewport = { width: 1600, height: 900 }
    expect(rig.screenCenter(camera, viewport)).toEqual({ x: expect.closeTo(800, 6), y: expect.closeTo(450, 6) })
    expect(rig.screenRadius(camera, 900)).toBeCloseTo(450 / (Math.tan((20 * Math.PI) / 180) * 4), 6)
    // A point one unit up is that many pixels above the centre.
    expect(rig.toScreen(new Vector3(0, 1, 0), camera, viewport).y).toBeCloseTo(450 - rig.screenRadius(camera, 900), 6)
  })
})

describe('study', () => {
  it('brings the studied part to the centre, enlarged, and hides the rest', () => {
    const rig = testRig()
    settle(rig, rigState({ mode: 'study', studyPart: 'top', hovered: 'top' }))
    const top = rig.parts.get('top')!
    expect(top.mesh.position.distanceTo(rig.center)).toBeCloseTo(0, 6)
    expect(top.mesh.scale.x).toBeCloseTo((rig.rawRadius * 0.72) / top.radius, 6)
    // Shown alone, so no highlight tint even while hovered.
    expect(top.holo.uniforms.uHighlight.value).toBeCloseTo(0, 6)
    for (const [id, part] of rig.parts) if (id !== 'top') expect(part.mesh.visible, id).toBe(false)

    settle(rig, rigState())
    for (const [id, part] of rig.parts) {
      expect(part.mesh.visible, id).toBe(true)
      expect(part.mesh.position.distanceTo(home(id)), id).toBeCloseTo(0, 6)
      expect(part.mesh.scale.x, id).toBeCloseTo(1, 6)
    }
  })

  it('never enlarges a studied part more than six times', () => {
    const rig = testRig()
    settle(rig, rigState({ mode: 'study', studyPart: 'lobe' }))
    expect(rig.parts.get('lobe')!.mesh.scale.x).toBeCloseTo(6, 6)
  })

  it('opens a part into its pieces and spreads them apart', () => {
    const rig = testRig()
    const lobe = rig.parts.get('lobe')!
    settle(rig, rigState({ mode: 'study', studyPart: 'lobe', pieceSpread: 1 }))
    expect(lobe.expanded).toBe(true)
    // Its own surface hides; the pieces show instead.
    expect(lobe.holo.visible).toBe(false)
    expect(lobe.reals.every((m) => !m.visible)).toBe(true)
    for (const p of lobe.pieces) {
      expect(p.mesh.visible, p.def.id).toBe(true)
      expect(p.mesh.position.distanceTo(p.home.clone().add(p.explodeOffset)), p.def.id).toBeCloseTo(0, 6)
    }
    // b's own pieces stay inside it until b is opened.
    for (const p of lobe.pieces[1].pieces) expect(p.mesh.visible, p.def.id).toBe(false)
  })

  it('highlights the hovered piece and dims its siblings', () => {
    const rig = testRig()
    const [a, b] = rig.parts.get('lobe')!.pieces
    settle(rig, rigState({ mode: 'study', studyPart: 'lobe', pieceSpread: 1, hoveredPiece: 'a' }))
    expect(a.holo.uniforms.uHighlight.value).toBeCloseTo(1, 6)
    expect(a.holo.uniforms.uIntensity.value).toBe(1)
    expect(b.holo.uniforms.uHighlight.value).toBeCloseTo(0, 6)
    expect(b.holo.uniforms.uIntensity.value).toBeCloseTo(0.45, 9)
  })

  it('isolates a piece on the study path and opens it in turn', () => {
    const rig = testRig()
    const lobe = rig.parts.get('lobe')!
    const [a, b] = lobe.pieces
    settle(rig, rigState({ mode: 'study', studyPart: 'lobe', studyPath: ['b'], pieceSpread: 1 }))
    // b moves to the middle of the lobe, enlarged to fill it.
    expect(b.mesh.position.length()).toBeCloseTo(0, 6)
    expect(b.mesh.scale.x).toBeCloseTo(Math.min(14, (lobe.radius * 0.95) / b.radius), 6)
    expect(a.mesh.visible).toBe(false)
    // At the end of the path, b shows its own pieces, spread apart.
    expect(b.expanded).toBe(true)
    expect(b.holo.visible).toBe(false)
    for (const p of b.pieces) {
      expect(p.mesh.visible, p.def.id).toBe(true)
      expect(p.mesh.position.distanceTo(p.home.clone().add(p.explodeOffset)), p.def.id).toBeCloseTo(0, 6)
    }
  })

  it('closes the pieces back up when study ends', () => {
    const rig = testRig()
    const lobe = rig.parts.get('lobe')!
    settle(rig, rigState({ mode: 'study', studyPart: 'lobe', studyPath: ['b'], pieceSpread: 1 }))
    // Right after leaving, the pieces are still drifting home.
    rig.update(1 / 60, rigState(), testCamera())
    expect(lobe.expanded).toBe(true)
    settle(rig, rigState())
    expect(lobe.expanded).toBe(false)
    expect(lobe.pieces[1].expanded).toBe(false)
    expect(lobe.holo.visible).toBe(true)
    forEachPiece(lobe, (p) => {
      expect(p.mesh.visible, p.def.id).toBe(false)
      expect(p.mesh.position.distanceTo(p.home), p.def.id).toBeLessThan(lobe.radius * 0.002)
    })
  })

  it('finds pieces only while their part is open', () => {
    const rig = testRig()
    const camera = testCamera()
    expect(rig.pieceWorld('lobe', [], 'a')).toBeNull()
    settle(rig, rigState({ mode: 'study', studyPart: 'lobe', pieceSpread: 1 }), camera)
    const a = rig.pieceWorld('lobe', [], 'a')!
    expect(a.distanceTo(rig.parts.get('lobe')!.pieces[0].mesh.getWorldPosition(new Vector3()))).toBeCloseTo(0, 9)
    expect(rig.pieceWorld('lobe', [], 'zzz')).toBeNull()
    expect(rig.pieceWorld('lobe', ['b'], 'b1')).toBeNull()
  })
})

describe('highlight and look', () => {
  it('lights the hovered part and dims everything else while one is selected', () => {
    const rig = testRig()
    settle(rig, rigState({ hovered: 'left', selected: 'top' }))
    const u = (id: string) => rig.parts.get(id)!.holo.uniforms
    const edges = (id: string) => (rig.parts.get(id)!.edges!.material as LineBasicMaterial).opacity
    expect(u('left').uHighlight.value).toBeCloseTo(1, 6)
    expect(u('top').uHighlight.value).toBeCloseTo(1, 6)
    expect(u('core').uHighlight.value).toBeCloseTo(0, 6)
    // The hovered part is bright enough not to be dimmed; the others are.
    expect(u('top').uIntensity.value).toBe(1)
    expect(u('left').uIntensity.value).toBe(1)
    expect(u('core').uIntensity.value).toBe(0.5)
    expect(edges('core')).toBeCloseTo(0.12, 6)
    expect(edges('top')).toBeCloseTo(0.3, 6)
  })

  it('pulses a hinted part strongly and a guided part gently', () => {
    const rig = testRig()
    const camera = testCamera()
    settle(rig, rigState({ hintPart: 'left', guidePart: 'right' }), camera)
    const seen = { left: [] as number[], right: [] as number[] }
    for (let i = 0; i < 120; i++) {
      rig.update(1 / 60, rigState({ hintPart: 'left', guidePart: 'right' }), camera)
      seen.left.push(rig.parts.get('left')!.holo.uniforms.uHighlight.value)
      seen.right.push(rig.parts.get('right')!.holo.uniforms.uHighlight.value)
    }
    expect(Math.max(...seen.left)).toBeGreaterThan(0.8)
    expect(Math.min(...seen.left)).toBeLessThan(0.4)
    expect(Math.max(...seen.right)).toBeLessThan(0.5 + 1e-9)
    expect(Math.min(...seen.right)).toBeGreaterThan(0.1 - 1e-9)
    expect(Math.max(...seen.right) - Math.min(...seen.right)).toBeGreaterThan(0.2)
  })

  it('flashes a part briefly', () => {
    const rig = testRig()
    const camera = testCamera()
    rig.flash('left')
    rig.flash('tail')
    rig.update(1 / 60, rigState(), camera)
    expect(rig.parts.get('left')!.holo.uniforms.uHighlight.value).toBeCloseTo(2 * (1 - 1.8 / 60), 2)
    settle(rig, rigState(), camera, 0.6)
    expect(rig.parts.get('left')!.holo.uniforms.uHighlight.value).toBeCloseTo(0, 6)
  })

  it('switches between the hologram and the realistic look', () => {
    const rig = testRig()
    rig.setRealistic(true)
    settle(rig, rigState())
    const core = rig.parts.get('core')!
    const lobe = rig.parts.get('lobe')!
    expect(core.mesh.material).toBe(core.real)
    // The merged lobe has a material per surface.
    expect(lobe.mesh.material).toEqual(lobe.reals)
    expect(lobe.pieces[0].mesh.material).toBe(lobe.pieces[0].reals[0])
    expect(core.edges!.visible).toBe(false)

    rig.setRealistic(false)
    settle(rig, rigState())
    expect(core.mesh.material).toBe(core.holo)
    expect(lobe.pieces[0].mesh.material).toBe(lobe.pieces[0].holo)
    expect(core.edges!.visible).toBe(true)
  })

  it('dims and lights the realistic materials too', () => {
    const rig = testRig()
    rig.setRealistic(true)
    settle(rig, rigState({ selected: 'top' }))
    const core = rig.parts.get('core')!.real
    const top = rig.parts.get('top')!.real
    expect(core.color.equals((core.userData.baseColor as Color).clone().multiplyScalar(0.45))).toBe(true)
    expect(top.color.equals(top.userData.baseColor as Color)).toBe(true)
    // The selected part glows in its own colour.
    expect(top.emissive.equals(top.userData.baseEmissive as Color)).toBe(false)
    expect(core.opacity).toBeCloseTo(core.userData.baseOpacity as number, 6)
  })

  it('cuts away the front of the model when asked, except in assembly', () => {
    const rig = testRig()
    const planes = (id: string) => rig.parts.get(id)!.holo.clippingPlanes ?? []
    settle(rig, rigState({ cutaway: 0.5 }))
    for (const id of rig.parts.keys()) expect(planes(id), id).toEqual([rig.clipPlane])
    expect(rig.parts.get('lobe')!.pieces[1].pieces[0].holo.clippingPlanes).toEqual([rig.clipPlane])
    expect((rig.parts.get('core')!.edges!.material as LineBasicMaterial).clippingPlanes).toEqual([rig.clipPlane])
    // The plane faces the camera and sits partway through the unit-sized model.
    expect(rig.clipPlane.normal.toArray()).toEqual([0, 0, -1])
    expect(rig.clipPlane.constant).toBeCloseTo(1 - 1.8 * 0.5, 6)

    settle(rig, rigState({ cutaway: 0.5, mode: 'assembly' }))
    for (const id of rig.parts.keys()) expect(planes(id), id).toEqual([])

    const solid = testRig({ cutaway: false })
    settle(solid, rigState({ cutaway: 0.5 }))
    for (const part of solid.parts.values()) expect(part.holo.clippingPlanes ?? []).toEqual([])
  })

  it('runs an attached motion only while exploring', () => {
    const rig = testRig()
    const update = vi.fn<RigMotion['update']>()
    rig.attachMotion({ update, dispose: () => {} })
    const camera = testCamera()
    rig.update(0.1, rigState(), camera)
    rig.update(0.1, rigState({ mode: 'study', studyPart: 'top' }), camera)
    rig.update(0.1, rigState({ carried: 'top' }), camera)
    rig.update(0.1, rigState({ mode: 'assembly' }), camera)
    expect(update.mock.calls.map(([dt, r, active]) => [dt, r === rig, active])).toEqual([
      [0.1, true, true],
      [0.1, true, false],
      [0.1, true, false],
      [0.1, true, false],
    ])
    rig.attachMotion(null)
    rig.update(0.1, rigState(), camera)
    expect(update).toHaveBeenCalledTimes(4)
  })

  it('disposes its materials', () => {
    const rig = testRig()
    const spy = vi.spyOn(rig.parts.get('core')!.holo, 'dispose')
    rig.dispose()
    expect(spy).toHaveBeenCalled()
  })
})
