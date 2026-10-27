// Builds public/models/muscles.glb from BodyParts3D (CC BY 4.0): the major
// muscle groups on a faint skeleton base. BodyParts3D 4.0 has no meshes for
// latissimus dorsi, rectus abdominis, the internal oblique, the jaw or the face
// muscles, so those are not in this model.
//
// Usage: npx tsx scripts/build-muscles.ts
import { mkdir } from 'node:fs/promises'
import { buildGroups, listElements, type GroupRule } from './lib/bp3d'
import { boundsOf, mergeMeshData, type Vec3 } from './lib/gltf'
import { writePartsGlb } from './lib/output'
import { SKELETON_RULES } from './lib/skeletonRules'

const NOT_MUSCLE = /(artery|vein|nerve|ligament|membrane|tendon|fascia|bursa|raphe|retinac|aponeurosis|tract|sheath|branch|ring|disk)/

const combined = (id: string, match: RegExp, maxTriangles: number): GroupRule => ({ id, match, exclude: NOT_MUSCLE, maxTriangles })

const perSide = (side: 'left' | 'right'): GroupRule[] => {
  const r = (id: string, match: RegExp, maxTriangles: number): GroupRule => ({
    id: `${id}_${side}`,
    match,
    side,
    exclude: NOT_MUSCLE,
    maxTriangles,
  })
  return [
    r('deltoid', /deltoid/, 2500),
    r('pectoral', /(pectoralis|subclavius|serratus anterior)/, 4000),
    r('rotator_cuff', /(supraspinatus|infraspinatus|teres minor|teres major|subscapularis)/, 3500),
    r('biceps_brachii', /(biceps brachii|brachialis$|coracobrachialis)/, 3000),
    r('triceps', /(triceps|anconeus)/, 2500),
    r('forearm_flexors', /(flexor carpi|palmaris longus|flexor digitorum superficialis|flexor digitorum profundus|flexor pollicis longus|pronator)/, 4000),
    r('forearm_extensors', /(brachioradialis|extensor carpi|extensor digitorum$|extensor digiti minimi|extensor indicis|extensor pollicis|abductor pollicis longus|supinator)/, 4000),
    r('gluteals', /(gluteus|tensor fasciae latae|piriformis|gemellus|obturator|quadratus femoris)/, 4500),
    r('hip_flexors', /(iliacus|psoas)/, 2000),
    r('quadriceps', /(rectus femoris|vastus|sartorius|articularis genus)/, 5000),
    r('adductors', /(adductor longus|adductor brevis|adductor magnus|gracilis|pectineus)/, 3500),
    r('hamstrings', /(biceps femoris|semitendinosus|semimembranosus)/, 3500),
    r('calf', /(gastrocnemius|soleus|plantaris|popliteus|tibialis posterior|flexor digitorum longus|flexor hallucis longus)/, 4500),
    r('shin', /(tibialis anterior|extensor digitorum longus|extensor hallucis longus|fibularis|peroneus)/, 3500),
  ]
}

const RULES: GroupRule[] = [
  combined('hand_muscles', /(lumbricals? of .*hand|inteross.* of .*hand|opponens pollicis|of .*hand$|flexor pollicis brevis|abductor pollicis brevis|adductor pollicis|palmaris brevis)/, 4000),
  combined('foot_muscles', /(of .*foot$|abductor hallucis|adductor hallucis|flexor hallucis brevis|extensor hallucis brevis|flexor digitorum brevis|extensor digitorum brevis|flexor accessorius|quadratus plantae)/, 4000),
  combined(
    'neck_muscles',
    /(sternocleidomastoid|scalenus|splenius|digastric|mylohyoid|geniohyoid|stylohyoid|sternohyoid|omohyoid|thyrohyoid|longus colli|longus capitis|rectus capitis|obliquus capitis|platysma|levator scapulae|semispinalis capitis|longissimus capitis)/,
    6000,
  ),
  combined('trapezius', /trapezius/, 3500),
  combined('rhomboids', /rhomboid/, 1500),
  combined(
    'back_muscles',
    /(iliocostalis|longissimus|spinalis|multifidus|rotator$|interspinal|intertransversari|levatores costarum|serratus posterior|quadratus lumborum)/,
    8000,
  ),
  combined('intercostals', /(intercostal muscle|transversus thoracis|subcostal)/, 5000),
  combined('diaphragm', /^diaphragm$/, 3000),
  combined('abdominal_wall', /(external oblique|internal oblique|transversus abdominis|rectus abdominis|pyramidalis)/, 3500),
  combined('pelvic_floor', /(iliococcygeus|pubococcygeus|puborectalis|coccygeus|levator ani)/, 2000),
  ...perSide('left'),
  ...perSide('right'),
]

await mkdir('public/models', { recursive: true })
const elements = await listElements()
const muscles = await buildGroups(RULES, elements)
for (const g of muscles) console.log(g.id.padEnd(22), String(g.names.length).padStart(3), g.names.slice(0, 3).join(', '))
const bones = await buildGroups(SKELETON_RULES, elements)
const skeleton = { id: 'skeleton_base', data: mergeMeshData(bones.map((b) => b.data)), maxTriangles: 30000, names: [] }
const all = [skeleton, ...muscles]
const b = boundsOf(mergeMeshData(all.map((g) => g.data)).positions)
const origin: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
await writePartsGlb('public/models/muscles.glb', 'muscles', all, origin)
