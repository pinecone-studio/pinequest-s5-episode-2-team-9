import type { ModelDefinition, PartDef } from '../ModelDefinition'

const FRONTAL = '#5ec8ff'
const PARIETAL = '#a78bff'
const TEMPORAL = '#4dffc3'
const OCCIPITAL = '#ffb44d'

const lobes: PartDef[] = (['left', 'right'] as const).flatMap((side) => [
  {
    id: `frontal_lobe_${side}`,
    group: 'cortex',
    color: FRONTAL,
    dependsOn: ['corpus_callosum', 'insula'],
    info: 'frontal_lobe',
    hint: 'frontal_lobe',
  },
  {
    id: `parietal_lobe_${side}`,
    group: 'cortex',
    color: PARIETAL,
    dependsOn: [`frontal_lobe_${side}`],
    info: 'parietal_lobe',
    hint: 'parietal_lobe',
  },
  {
    id: `temporal_lobe_${side}`,
    group: 'cortex',
    color: TEMPORAL,
    dependsOn: ['insula', 'hippocampus', 'amygdala'],
    info: 'temporal_lobe',
    hint: 'temporal_lobe',
  },
  {
    id: `occipital_lobe_${side}`,
    group: 'cortex',
    color: OCCIPITAL,
    dependsOn: [`parietal_lobe_${side}`],
    info: 'occipital_lobe',
    hint: 'occipital_lobe',
  },
])

export const brain: ModelDefinition = {
  id: 'brain',
  slug: 'brain',
  url: '/models/brain.glb',
  groups: ['cortex', 'deep', 'hindbrain', 'pathways'],
  baseParts: ['brainstem'],
  cutaway: true,
  edges: false,
  glow: 0.42,
  initialRotation: [0.15, -0.6, 0],
  accent: '#a78bff',
  sources: [
    {
      text: 'Browne, K. & Schlehlein, H. (2023). 3D Reference Organ for Brain, Male, v1.3. HuBMAP.',
      url: 'https://doi.org/10.48539/HBM929.XKCL.339',
    },
  ],
  parts: [
    { id: 'brainstem', group: 'hindbrain', color: '#fcd34d', dependsOn: [], explodeScale: 0.4 },
    { id: 'cerebellum', group: 'hindbrain', color: '#86efac', dependsOn: ['brainstem'] },
    { id: 'thalamus', group: 'deep', color: '#c4b5fd', dependsOn: ['brainstem'], explodeScale: 0.6 },
    { id: 'hypothalamus', group: 'deep', color: '#fda4af', dependsOn: ['thalamus'] },
    { id: 'pineal_gland', group: 'deep', color: '#fb923c', dependsOn: ['thalamus'] },
    { id: 'basal_ganglia', group: 'deep', color: '#7dd3fc', dependsOn: ['thalamus'] },
    { id: 'hippocampus', group: 'deep', color: '#ffd27a', dependsOn: ['thalamus'] },
    { id: 'amygdala', group: 'deep', color: '#ff5d6c', dependsOn: ['hippocampus'] },
    { id: 'ventricles', group: 'pathways', color: '#38bdf8', dependsOn: ['thalamus'] },
    { id: 'visual_pathway', group: 'pathways', color: '#facc15', dependsOn: ['thalamus'] },
    { id: 'corpus_callosum', group: 'deep', color: '#e8f6ff', dependsOn: ['ventricles'] },
    { id: 'limbic_cortex', group: 'cortex', color: '#ff6b9a', dependsOn: ['corpus_callosum'] },
    { id: 'olfactory_pathway', group: 'pathways', color: '#f0abfc', dependsOn: ['limbic_cortex'] },
    { id: 'insula', group: 'cortex', color: '#ff8fd1', dependsOn: ['basal_ganglia'] },
    ...lobes,
  ],
}
