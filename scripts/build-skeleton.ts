// Builds public/models/skeleton.glb from BodyParts3D (CC BY 4.0):
// 34 student-level bone groups.
//
// Usage: npx tsx scripts/build-skeleton.ts   (needs scripts/.cache/bp3d, see CREDITS.md)
import { mkdir } from 'node:fs/promises'
import { buildGroups, listElements } from './lib/bp3d'
import { boundsOf, mergeMeshData, type Vec3 } from './lib/gltf'
import { writePartsGlb } from './lib/output'
import { SKELETON_RULES } from './lib/skeletonRules'

await mkdir('public/models', { recursive: true })
const elements = await listElements()
const groups = await buildGroups(SKELETON_RULES, elements)
for (const g of groups) console.log(g.id.padEnd(18), g.names.length, g.names.slice(0, 4).join(', '))
const b = boundsOf(mergeMeshData(groups.map((g) => g.data)).positions)
const origin: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
await writePartsGlb('public/models/skeleton.glb', 'skeleton', groups, origin)
