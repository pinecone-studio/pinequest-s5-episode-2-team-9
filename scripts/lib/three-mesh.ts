// Turns three.js geometries (built in Node) into MeshData for the GLB writer,
// so procedural models (engines, motors) use the same pipeline as scanned ones.
import { BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { mergeMeshData, type MeshData, type Vec3 } from './gltf'

export interface Place {
  position?: Vec3
  /** Euler angles in radians (XYZ). */
  rotation?: Vec3
  scale?: Vec3 | number
}

export function placed(geometry: BufferGeometry, place: Place = {}): MeshData {
  const g = geometry.index ? geometry : geometry
  const m = new Matrix4().compose(
    new Vector3(...(place.position ?? [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...(place.rotation ?? [0, 0, 0]))),
    typeof place.scale === 'number' ? new Vector3(place.scale, place.scale, place.scale) : new Vector3(...(place.scale ?? [1, 1, 1])),
  )
  const clone = g.clone().applyMatrix4(m)
  if (!clone.getAttribute('normal')) clone.computeVertexNormals()
  const pos = clone.getAttribute('position')
  const nor = clone.getAttribute('normal')
  const positions = new Float32Array(pos.count * 3)
  const normals = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    positions[i * 3] = pos.getX(i)
    positions[i * 3 + 1] = pos.getY(i)
    positions[i * 3 + 2] = pos.getZ(i)
    normals[i * 3] = nor.getX(i)
    normals[i * 3 + 1] = nor.getY(i)
    normals[i * 3 + 2] = nor.getZ(i)
  }
  const indices = clone.index
    ? new Uint32Array(clone.index.array)
    : Uint32Array.from({ length: pos.count }, (_, i) => i)
  clone.dispose()
  return { positions, normals, indices }
}

export const merge = (...parts: MeshData[]) => mergeMeshData(parts)
