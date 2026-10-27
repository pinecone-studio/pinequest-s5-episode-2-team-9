import { useModel } from '../lab/modelStore'
import { recordAssembly, recordOpened, recordStudied } from './progressStore'

/** Saves progress from the lab's model store, like trackLab does for analytics. Returns an unsubscribe. */
export function trackProgress(): () => void {
  let assemblyStartedAt: number | null = null
  return useModel.subscribe((s, prev) => {
    const model = s.def?.id
    if (!model) return
    if (s.loaded && !prev.loaded) recordOpened(model)
    if (s.mode === 'study' && s.studyPart && s.studyPart !== prev.studyPart) recordStudied(model, s.studyPart)
    if (s.mode === 'assembly' && prev.mode !== 'assembly') assemblyStartedAt = performance.now()
    if (s.mode !== 'assembly') assemblyStartedAt = null
    if (s.message?.kind === 'complete' && prev.message?.kind !== 'complete' && assemblyStartedAt !== null) {
      recordAssembly(model, performance.now() - assemblyStartedAt)
      assemblyStartedAt = null
    }
  })
}
