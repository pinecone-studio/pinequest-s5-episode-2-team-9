import { event } from '../analytics'
import { useLab } from './labStore'
import { useModel } from './modelStore'

/** Reports a handful of product events from the lab stores. Returns an unsubscribe. */
export function trackLab(): () => void {
  const exploded = new Set<string>()
  const offLab = useLab.subscribe((s, prev) => {
    if (s.camera.state !== prev.camera.state && s.camera.state !== 'requesting') {
      event('camera', { state: s.camera.state === 'mouse' ? `mouse:${s.camera.reason}` : 'live' })
    }
    if (s.tracking !== prev.tracking && (s.tracking === 'running' || s.tracking === 'error')) {
      event('hand_tracking', { status: s.tracking })
    }
    if (prev.calibrating && !s.calibrating) event('calibration_closed', { mode: prev.calibrating })
    if (s.headParallax !== prev.headParallax) event('head_parallax', { on: s.headParallax })
  })
  const offModel = useModel.subscribe((s, prev) => {
    const model = s.def?.id ?? 'none'
    if (s.loaded && !prev.loaded) event('lab_open', { model })
    if (s.mode === 'study' && s.studyPart && s.studyPart !== prev.studyPart) event('study_open', { model, part: s.studyPart })
    if (s.mode === 'assembly' && prev.mode !== 'assembly') event('assembly_start', { model })
    if (s.message?.kind === 'complete' && prev.message?.kind !== 'complete') event('assembly_complete', { model })
    if (s.explode > 0.5 && !exploded.has(model)) {
      exploded.add(model)
      event('explode', { model })
    }
  })
  return () => {
    offLab()
    offModel()
  }
}
