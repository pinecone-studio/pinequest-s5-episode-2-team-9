import { BoxGeometry, Line, LineSegments, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferAttribute } from 'three'
import { describe, expect, it } from 'vitest'
import { HOMES, PARTS, rigState, settle, testCamera, testModel, testRig, testScene } from './__fixtures__/rig'
import { ModelRig } from './modelRig'

const VIEWPORT = { width: 1600, height: 900 }
const PANEL = 400
const camera = testCamera()
const halfH = Math.tan((20 * Math.PI) / 180) * 4
const halfW = halfH * camera.aspect

const world = (rig: ModelRig, id: string) => rig.parts.get(id)!.mesh.getWorldPosition(new Vector3())
/** A part's radius in world units, wherever it is. */
const worldRadius = (rig: ModelRig, id: string) => {
  const part = rig.parts.get(id)!
  return part.radius * part.mesh.getWorldScale(new Vector3()).x
}
const carryLine = (rig: ModelRig) => rig.root.children.find((c): c is Line => c instanceof Line && !(c instanceof LineSegments))!
const carryEnds = (rig: ModelRig) => {
  const pos = carryLine(rig).geometry.getAttribute('position') as BufferAttribute
  return [new Vector3().fromBufferAttribute(pos, 0), new Vector3().fromBufferAttribute(pos, 1)]
}

/** Starts assembly with only the core placed, as the lab does. */
function startAssembly(rig = testRig()) {
  const placed = new Set(['core'])
  const unplaced = [...rig.parts.keys()].filter((id) => !placed.has(id))
  rig.scatterToBench(placed)
  rig.layout(camera, VIEWPORT, PANEL, unplaced)
  const state = rigState({ mode: 'assembly', placed })
  settle(rig, state, camera)
  return { rig, placed, unplaced, state }
}

describe('assembly layout', () => {
  it('lifts and shrinks the model above the bench, and ignores explode', () => {
    const { rig } = startAssembly()
    settle(rig, rigState({ mode: 'assembly', placed: new Set(['core']), scale: 1.5, explode: 1 }), camera)
    expect(rig.model.position.y).toBeCloseTo(0.5, 6)
    expect(rig.model.scale.x).toBeCloseTo(0.56 * 1.5, 6)
    expect(rig.parts.get('core')!.mesh.position.distanceTo(new Vector3(...HOMES.core))).toBeCloseTo(0, 6)
  })

  it('lines the loose parts up on the bench, evenly spaced and the same size', () => {
    const { rig, unplaced } = startAssembly()
    const panelFrac = PANEL / VIEWPORT.width
    const spacing = ((halfW * 2 - panelFrac * halfW * 2) * 0.86) / unplaced.length
    const slotRadius = Math.min(0.17, spacing * 0.4)
    const shift = -panelFrac * halfW
    unplaced.forEach((id, i) => {
      expect(rig.parts.get(id)!.location).toBe('bench')
      const at = world(rig, id)
      expect(at.x, id).toBeCloseTo(shift + (i - (unplaced.length - 1) / 2) * spacing, 6)
      expect(at.y, id).toBeCloseTo(-halfH * 0.6, 6)
      expect(at.z, id).toBeCloseTo(0.25, 6)
      // Big and small parts all fill a slot of the same size.
      expect(worldRadius(rig, id), id).toBeCloseTo(slotRadius, 6)
    })
    expect(rig.parts.get('core')!.location).toBe('model')
  })

  /** A rig with `count` extra small parts, all loose at the start of assembly. */
  const withExtras = (count: number) => {
    const extra = Array.from({ length: count }, (_, i) => `extra${i}`)
    const scene = testScene()
    extra.forEach((id, i) => {
      const mesh = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial())
      mesh.name = id
      mesh.position.set(-0.5 + 0.2 * i, 0.3, 0)
      scene.add(mesh)
    })
    const parts = [...PARTS, ...extra.map((id) => ({ id, group: 'body', color: '#fff', dependsOn: ['core'] }))]
    const { rig, unplaced } = startAssembly(new ModelRig(testModel({ parts }), scene))
    const rows = [...new Set(unplaced.map((id) => world(rig, id).y.toFixed(6)))].map(Number).sort((a, b) => b - a)
    return { rig, unplaced, rows }
  }

  it('keeps up to eight loose parts in one row', () => {
    const { unplaced, rows } = withExtras(4)
    expect(unplaced).toHaveLength(8)
    expect(rows).toEqual([expect.closeTo(-halfH * 0.6, 6)])
  })

  it('uses two rows when more than eight parts are loose', () => {
    const { rig, unplaced, rows } = withExtras(6)
    expect(unplaced).toHaveLength(10)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toBeCloseTo(-halfH * 0.42, 6)
    expect(unplaced.slice(0, 5).every((id) => world(rig, id).y.toFixed(6) === rows[0].toFixed(6))).toBe(true)
  })

  it('hides bench parts that belong to a later stage', () => {
    const rig = testRig()
    rig.scatterToBench(new Set(['core']))
    rig.layout(camera, VIEWPORT, PANEL, ['top'])
    settle(rig, rigState({ mode: 'assembly', placed: new Set(['core']) }), camera)
    expect(rig.parts.get('top')!.mesh.visible).toBe(true)
    for (const id of ['left', 'right', 'lobe']) expect(rig.parts.get(id)!.mesh.visible, id).toBe(false)
  })

  it('shows a ghost at the slot of every part still to place', () => {
    const { rig, state } = startAssembly()
    const ghost = (id: string) => rig.parts.get(id)!.ghost
    expect(ghost('core').visible).toBe(false)
    for (const id of ['top', 'left', 'right', 'lobe']) {
      expect(ghost(id).visible, id).toBe(true)
      expect(ghost(id).position.toArray(), id).toEqual(HOMES[id])
      expect(ghost(id).material.uniforms.uOpacity.value, id).toBeCloseTo(0.07, 9)
    }
    // Stronger for the part in hand and the hinted one, softer for the guide's suggestion.
    const sample = (id: string, s: typeof state) => {
      const seen: number[] = []
      for (let i = 0; i < 90; i++) {
        rig.update(1 / 60, s, camera)
        seen.push(ghost(id).material.uniforms.uOpacity.value)
      }
      return { min: Math.min(...seen), max: Math.max(...seen) }
    }
    for (const s of [{ ...state, carried: 'top' }, { ...state, hintPart: 'top' }]) {
      const { min, max } = sample('top', s)
      expect(min).toBeGreaterThanOrEqual(0.25 - 1e-9)
      expect(max).toBeLessThanOrEqual(0.65 + 1e-9)
      expect(max).toBeGreaterThan(0.6)
    }
    const guided = sample('top', { ...state, guidePart: 'top' })
    expect(guided.min).toBeGreaterThanOrEqual(0.12 - 1e-9)
    expect(guided.max).toBeLessThanOrEqual(0.28 + 1e-9)

    settle(rig, rigState(), camera)
    for (const id of rig.parts.keys()) expect(ghost(id).visible, id).toBe(false)
  })
})

describe('moving parts', () => {
  it('keeps a part where it is on screen when it changes group', () => {
    const rig = testRig()
    settle(rig, rigState({ explode: 0.5 }), camera)
    const before = world(rig, 'top')
    const scaleBefore = worldRadius(rig, 'top')
    rig.relocate('top', 'bench')
    rig.root.updateMatrixWorld(true)
    const top = rig.parts.get('top')!
    expect(top.mesh.parent).toBe(rig.benchInner)
    expect(world(rig, 'top').distanceTo(before)).toBeCloseTo(0, 9)
    expect(worldRadius(rig, 'top')).toBeCloseTo(scaleBefore, 9)
    // Its pose now describes the same spot in the new group.
    expect(top.pose.equals(top.mesh.position)).toBe(true)
    expect(top.poseScale).toBe(top.mesh.scale.x)

    rig.relocate('top', 'carry')
    expect(top.mesh.parent).toBe(rig.root)
    // Same place again, or an unknown part: nothing happens.
    rig.relocate('top', 'carry')
    rig.relocate('tail', 'bench')
    expect(top.location).toBe('carry')
  })

  it('clears any snap flash when scattering', () => {
    const rig = testRig()
    rig.flash('top')
    rig.scatterToBench(new Set())
    expect([...rig.parts.values()].every((p) => p.flash === 0 && p.location === 'bench')).toBe(true)
  })

  it('carries a part to the pointer at the size it will have once placed', () => {
    const { rig, state } = startAssembly()
    rig.relocate('top', 'carry')
    const target = new Vector3(0.4, -0.2, 0.3)
    rig.carryTo('top', target)
    settle(rig, { ...state, carried: 'top' }, camera)
    expect(world(rig, 'top').distanceTo(target)).toBeCloseTo(0, 6)
    expect(worldRadius(rig, 'top')).toBeCloseTo(rig.parts.get('top')!.radius * rig.normScale * rig.model.scale.x, 6)
    // Only a carried part follows the pointer.
    rig.carryTo('left', target)
    expect(rig.parts.get('left')!.targetPos.distanceTo(target)).toBeGreaterThan(0.1)
  })

  it('places a carried part into its slot', () => {
    const { rig, state } = startAssembly()
    rig.relocate('top', 'carry')
    rig.carryTo('top', new Vector3(1, 1, 0))
    settle(rig, { ...state, carried: 'top' }, camera, 1)
    rig.relocate('top', 'model')
    rig.flash('top')
    const placed = new Set(['core', 'top'])
    settle(rig, { ...state, placed }, camera)
    expect(world(rig, 'top').distanceTo(rig.slotWorld('top'))).toBeCloseTo(0, 6)
    expect(rig.parts.get('top')!.ghost.visible).toBe(false)
    expect(rig.parts.get('top')!.flash).toBe(0)
  })

  it('brings every part home when assembly ends', () => {
    const { rig } = startAssembly()
    rig.gatherToModel()
    settle(rig, rigState(), camera)
    for (const [id, part] of rig.parts) {
      expect(part.location, id).toBe('model')
      expect(part.mesh.position.distanceTo(new Vector3(...HOMES[id])), id).toBeCloseTo(0, 6)
      expect(part.mesh.visible, id).toBe(true)
    }
  })
})

describe('where parts attach', () => {
  it('measures openings and connecting ends from the joints, and slots for the rest', () => {
    const { rig } = startAssembly()
    // "top" has a measured joint: the opening on the core, and the matching end of the top part.
    expect(rig.openingWorld('top').distanceTo(rig.inner.localToWorld(new Vector3(0, 0.3, 0)))).toBeCloseTo(0, 9)
    const top = rig.parts.get('top')!
    expect(rig.attachWorld('top').distanceTo(top.mesh.localToWorld(new Vector3(0, -0.3, 0)))).toBeCloseTo(0, 9)
    // "left" has none: its slot and its centre.
    expect(rig.openingWorld('left').distanceTo(rig.slotWorld('left'))).toBeCloseTo(0, 9)
    expect(rig.attachWorld('left').distanceTo(world(rig, 'left'))).toBeCloseTo(0, 9)
    expect(rig.slotWorld('left').distanceTo(rig.inner.localToWorld(new Vector3(...HOMES.left)))).toBeCloseTo(0, 9)
    expect(rig.partWorld('left').distanceTo(world(rig, 'left'))).toBeCloseTo(0, 9)
  })

  it('draws a dashed line from the carried part to where it goes', () => {
    const { rig, state } = startAssembly()
    expect(carryLine(rig).visible).toBe(false)
    for (const id of ['top', 'left']) {
      rig.relocate(id, 'carry')
      rig.carryTo(id, new Vector3(0.6, -0.4, 0.2))
      settle(rig, { ...state, carried: id }, camera, 1)
      expect(carryLine(rig).visible, id).toBe(true)
      const [from, to] = carryEnds(rig)
      expect(from.distanceTo(rig.attachWorld(id)), id).toBeCloseTo(0, 6)
      expect(to.distanceTo(rig.openingWorld(id)), id).toBeCloseTo(0, 6)
      rig.relocate(id, 'bench')
    }
    // Hidden once the part is back on the bench, even if still named as carried.
    settle(rig, { ...state, carried: 'left' }, camera, 0.1)
    expect(carryLine(rig).visible).toBe(false)
  })
})

describe('picking', () => {
  const rayAt = (target: Vector3) => {
    const ray = new Raycaster()
    ray.set(camera.position, target.clone().sub(camera.position).normalize())
    return ray
  }

  it('finds the visible part under the pointer', () => {
    const rig = testRig()
    settle(rig, rigState({ explode: 1 }), camera)
    // The lobe's surface is its pieces, with a gap in the middle: aim at piece "a".
    const aim = (id: string) => (id === 'lobe' ? rig.parts.get('lobe')!.mesh.localToWorld(new Vector3(-0.05, 0, 0)) : world(rig, id))
    for (const id of rig.parts.keys()) expect(rig.pick(rayAt(aim(id))), id).toBe(id)
    expect(rig.pick(rayAt(world(rig, 'lobe')))).toBeNull()
    expect(rig.pick(rayAt(new Vector3(0, 3, 0)))).toBeNull()
    // Only where asked to look.
    expect(rig.pick(rayAt(world(rig, 'left')), ['bench'])).toBeNull()
  })

  it('ignores parts faded out by Study', () => {
    const rig = testRig()
    const left = () => world(rig, 'left')
    settle(rig, rigState({ explode: 1 }), camera)
    const at = left()
    // Halfway through fading out it is still drawn, but no longer pickable.
    const study = rigState({ explode: 1, mode: 'study', studyPart: 'top' })
    const part = rig.parts.get('left')!
    while (part.opacity > 0.25) {
      rig.update(1 / 60, study, camera)
      rig.root.updateMatrixWorld(true)
    }
    expect(part.mesh.visible).toBe(true)
    expect(rig.pick(rayAt(left()))).toBeNull()
    settle(rig, study, camera)
    expect(rig.pick(rayAt(at))).toBeNull()
  })

  it('finds parts on the bench', () => {
    const { rig } = startAssembly()
    expect(rig.pick(rayAt(world(rig, 'right')))).toBe('right')
    expect(rig.pick(rayAt(world(rig, 'right')), ['model'])).toBeNull()
  })

  it('finds pieces of the studied part only while it is open', () => {
    const rig = testRig()
    const [a] = rig.parts.get('lobe')!.pieces
    expect(rig.pickPiece(rayAt(world(rig, 'lobe')), 'lobe', [])).toBeNull()
    settle(rig, rigState({ mode: 'study', studyPart: 'lobe', pieceSpread: 1 }), camera)
    expect(rig.pickPiece(rayAt(a.mesh.getWorldPosition(new Vector3())), 'lobe', [])).toBe('a')
    expect(rig.pickPiece(rayAt(new Vector3(0, 3, 0)), 'lobe', [])).toBeNull()
    expect(rig.pickPiece(rayAt(a.mesh.getWorldPosition(new Vector3())), 'top', [])).toBeNull()
  })
})
