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
}

export const useModel = create<ModelState>()((set, get) => ({
  def: null,
  loaded: false,
  ...initial,
  resetToken: 0,

  load: (def) => set({ def, loaded: false, ...initial, resetToken: get().resetToken + 1 }),
  set: (patch) => set(patch),

  openStudy: (partId) => set({ mode: 'study', studyPart: partId, selected: partId, hovered: null }),
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
}))
