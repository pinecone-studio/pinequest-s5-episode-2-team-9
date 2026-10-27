import type { TourStep } from '../ModelDefinition'

// Guided tour, in order. Texts: brain.tour.<id>.title / .text in src/i18n.
export const brainTour: TourStep[] = [
  { id: 'overview' },
  { id: 'frontal', part: 'frontal_lobe_left' },
  { id: 'parietal', part: 'parietal_lobe_left' },
  { id: 'temporal', part: 'temporal_lobe_left' },
  { id: 'occipital', part: 'occipital_lobe_left' },
  { id: 'cerebellum', part: 'cerebellum' },
  { id: 'brainstem', part: 'brainstem' },
  { id: 'thalamus', part: 'thalamus', explode: 0.6 },
  { id: 'hippocampus', part: 'hippocampus', explode: 0.6 },
  { id: 'corpus_callosum', part: 'corpus_callosum', explode: 0.6 },
]
