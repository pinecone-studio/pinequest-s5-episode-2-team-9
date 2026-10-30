// A small synthetic model for ModelRig tests: five parts in a cross, one of which
// ("lobe") has no surface of its own and splits into pieces, two levels deep.
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, type Object3D } from 'three'
import type { ModelDefinition, PartDef } from '../../models/ModelDefinition'
import { ModelRig, type RigState } from '../modelRig'

export const PARTS: PartDef[] = [
  { id: 'core', group: 'body', color: '#ff0000', dependsOn: [] },
  { id: 'top', group: 'body', color: '#00ff00', dependsOn: ['core'], explodeDir: [0, 1, 0] },
  { id: 'left', group: 'body', color: '#0000ff', dependsOn: ['core'] },
  { id: 'right', group: 'body', color: '#ffff00', dependsOn: ['core'], explodeScale: 2 },
  {
    id: 'lobe',
    group: 'body',
    color: '#ff00ff',
    dependsOn: ['core'],
    pieces: [{ id: 'a' }, { id: 'b', pieces: [{ id: 'b1' }, { id: 'b2' }] }],
  },
]

/** Where each part sits in the scene. */
export const HOMES: Record<string, [number, number, number]> = {
  core: [0, 0, 0],
  top: [0, 0.6, 0],
  left: [-0.6, 0, 0],
  right: [0.6, 0, 0],
  lobe: [0, -0.6, 0],
}

/** Where "top" plugs into "core" (the build script measures these for connected models). */
export const TOP_JOINT = { to: 'core', pos: [0, 0.3, 0] as [number, number, number], normal: [0, 2, 0] as [number, number, number] }

export function testModel(overrides: Partial<ModelDefinition> = {}): ModelDefinition {
  return {
    id: 'heart',
    slug: 'test',
    url: '/models/test.glb',
    groups: ['body'],
    parts: PARTS,
    baseParts: ['core'],
    cutaway: true,
    edges: true,
    glow: 1,
    initialRotation: [0, 0, 0],
    accent: '#ffffff',
    sources: [],
    looks: { default: 'steel' },
    ...overrides,
  }
}

const box = (name: string, size: number, at: [number, number, number] = [0, 0, 0]) => {
  const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial())
  mesh.name = name
  mesh.position.set(...at)
  return mesh
}

/** The scene a GLB with this model would load as. */
export function testScene(): Object3D {
  const scene = new Group()
  for (const id of ['core', 'top', 'left', 'right']) scene.add(box(id, id === 'core' ? 0.4 : 0.2, HOMES[id]))
  // "lobe" is just a node holding its pieces: piece "a" is a mesh, piece "b" splits again.
  const lobe = new Group()
  lobe.name = 'lobe'
  lobe.position.set(...HOMES.lobe)
  const b = new Group()
  b.name = 'lobe__b'
  b.position.set(0.05, 0, 0)
  b.add(box('lobe__b__b1', 0.04, [0, 0.03, 0]), box('lobe__b__b2', 0.04, [0, -0.03, 0]))
  lobe.add(box('lobe__a', 0.06, [-0.05, 0, 0]), b)
  scene.add(lobe)
  scene.userData = { connections: { top: TOP_JOINT } }
  return scene
}

export function testRig(overrides: Partial<ModelDefinition> = {}): ModelRig {
  return new ModelRig(testModel(overrides), testScene())
}

export function testCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 100)
  camera.position.set(0, 0, 4)
  camera.updateMatrixWorld()
  return camera
}

export function rigState(overrides: Partial<RigState> = {}): RigState {
  return {
    mode: 'explore',
    explode: 0,
    scale: 1,
    hovered: null,
    selected: null,
    studyPart: null,
    cutaway: 0,
    placed: new Set(),
    carried: null,
    hintPart: null,
    guidePart: null,
    studyPath: [],
    hoveredPiece: null,
    pieceSpread: 0,
    ...overrides,
  }
}

/** Runs the rig long enough for every eased value to settle. */
export function settle(rig: ModelRig, state: RigState, camera = testCamera(), seconds = 3): void {
  for (let t = 0; t < seconds; t += 1 / 60) {
    rig.update(1 / 60, state, camera)
    rig.root.updateMatrixWorld(true)
  }
}
