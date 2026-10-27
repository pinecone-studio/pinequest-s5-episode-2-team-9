import { create } from 'zustand'
import { assemblyOrder, placeable, type ModelDefinition } from '../models/ModelDefinition'

export type ViewMode = 'explore' | 'study' | 'assembly'

export type AssemblyMessage =
  | { kind: 'wrong'; partId: string; id: number }
  | { kind: 'placed'; partId: string; id: number }
  | { kind: 'complete'; id: number }

interface ModelState {
  def: ModelDefinition | null
  /** True once the model's GLB is loaded and in the scene. */
  loaded: boolean
  mode: ViewMode
  /** 0 = assembled, 1 = fully taken apart. */
  explode: number
  /** User zoom. */
  scale: number
  hovered: string | null
  selected: string | null
  studyPart: string | null
  /** 0 = off … 1 = sliced deep. */
  cutaway: number
  placed: string[]
  carried: string | null
  hintPart: string | null
  message: AssemblyMessage | null
  /** Incremented to ask the scene to reset the view rotation. */
  resetToken: number
  /** Motion playing (heartbeat, spinning rotor, firing engine). */
  running: boolean
  /** Heart: beats per minute. Machines: speed in %. */
  tempo: number
  /** Robot dog gait. */
  gait: 'walk' | 'trot'
  /** Guided tour: current step index, or null when no tour is running. */
  tourStep: number | null
  /** The tour turned the motion on, so ending the tour turns it off again. */
  tourMotion: boolean
  /** Incremented when a tour finishes (for analytics). */
  toursCompleted: number
  /** Where the scene should turn the model; applied when viewToken changes. */
  viewTarget: { part: string } | { rotation: [number, number, number] } | null
  viewToken: number

  load: (def: ModelDefinition) => void
  set: (patch: Partial<ModelState>) => void
  openStudy: (partId: string) => void
  closeStudy: () => void
  stepStudy: (delta: 1 | -1) => void
  startAssembly: () => void
  exitAssembly: () => void
  /** Returns 'placed' or the reason it was refused. */
  tryPlace: (partId: string) => 'placed' | 'wrong'
  hint: () => void
  resetView: () => void
  startTour: () => void
  /** Next / previous step; stepping past the last step finishes the tour. */
  stepTour: (delta: 1 | -1) => void
  endTour: () => void
}

let messageId = 0

const initial = {
  mode: 'explore' as ViewMode,
  explode: 0,
  scale: 1,
  hovered: null,
  selected: null,
  studyPart: null,
  cutaway: 0,
  placed: [],
  carried: null,
  hintPart: null,
  message: null,
  running: false,
  tempo: 72,
  gait: 'trot' as const,
  tourStep: null,
  tourMotion: false,
  viewTarget: null,
}

/** Leaving a tour (for any reason) stops the motion it started. */
function leaveTour(s: ModelState): Partial<ModelState> {
  if (s.tourStep === null) return {}
  return { tourStep: null, tourMotion: false, ...(s.tourMotion && { running: false }) }
}

/** Store patch that shows tour step `i`: highlight, explode, cut-away, motion and view. */
function tourPatch(s: ModelState, i: number): Partial<ModelState> {
  const def = s.def!
  const step = def.tour![i]
  const motion = !!step.motion && !!def.motion
  return {
    tourStep: i,
    selected: step.part ?? null,
    hovered: null,
    explode: step.explode ?? 0,
    cutaway: def.cutaway ? (step.cutaway ?? 0) : 0,
    ...(motion
      ? { running: true, tourMotion: s.tourMotion || !s.running }
      : s.tourMotion
        ? { running: false, tourMotion: false }
        : {}),
    viewTarget: step.view
      ? { rotation: step.view }
      : step.part
        ? { part: step.part }
        : { rotation: def.initialRotation },
    viewToken: s.viewToken + 1,
  }
}

export const useModel = create<ModelState>()((set, get) => ({
  def: null,
  loaded: false,
  ...initial,
  resetToken: 0,
  toursCompleted: 0,
  viewToken: 0,

  load: (def) => set({ def, loaded: false, ...initial, resetToken: get().resetToken + 1 }),
  set: (patch) => set(patch),

  openStudy: (partId) =>
    set({ ...leaveTour(get()), mode: 'study', studyPart: partId, selected: partId, hovered: null }),
  closeStudy: () => set({ mode: 'explore', studyPart: null }),
  stepStudy: (delta) => {
    const { def, studyPart } = get()
    if (!def || !studyPart) return
    const ids = def.parts.map((p) => p.id)
    const next = ids[(ids.indexOf(studyPart) + delta + ids.length) % ids.length]
    set({ studyPart: next, selected: next })
  },

  startAssembly: () => {
    const { def } = get()
    if (!def) return
    set({
      ...leaveTour(get()),
      mode: 'assembly',
      placed: [...def.baseParts],
      explode: 0,
      cutaway: 0,
      studyPart: null,
      selected: null,
      carried: null,
      hintPart: null,
      message: null,
    })
  },
  exitAssembly: () => set({ mode: 'explore', carried: null, hintPart: null, message: null, placed: [] }),

  tryPlace: (partId) => {
    const { def, placed } = get()
    if (!def) return 'wrong'
    if (!placeable(def, new Set(placed)).includes(partId)) {
      set({ message: { kind: 'wrong', partId, id: ++messageId } })
      return 'wrong'
    }
    const nowPlaced = [...placed, partId]
    const complete = nowPlaced.length === def.parts.length
    set({
      placed: nowPlaced,
      hintPart: get().hintPart === partId ? null : get().hintPart,
      message: complete ? { kind: 'complete', id: ++messageId } : { kind: 'placed', partId, id: ++messageId },
    })
    return 'placed'
  },

  hint: () => {
    const { def, placed, hintPart } = get()
    if (!def) return
    const placedSet = new Set(placed)
    const next = assemblyOrder(def).find((id) => !placedSet.has(id))
    if (!next) return
    if (hintPart === next) {
      // Second press: place it automatically.
      get().tryPlace(next)
      set({ hintPart: null })
    } else {
      set({ hintPart: next })
    }
  },

  resetView: () => set({ resetToken: get().resetToken + 1, scale: 1, explode: 0, cutaway: 0 }),

  startTour: () => {
    const s = get()
    if (!s.def?.tour?.length || s.mode !== 'explore') return
    set(tourPatch(s, 0))
  },
  stepTour: (delta) => {
    const s = get()
    if (s.tourStep === null || !s.def?.tour) return
    const next = s.tourStep + delta
    if (next < 0) return
    if (next >= s.def.tour.length) {
      set({ ...leaveTour(s), selected: null, toursCompleted: s.toursCompleted + 1 })
      return
    }
    set(tourPatch(s, next))
  },
  endTour: () => {
    const s = get()
    if (s.tourStep === null) return
    set({ ...leaveTour(s), selected: null })
  },
}))
