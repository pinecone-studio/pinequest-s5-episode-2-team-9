import { Suspense, useEffect, useMemo, useRef } from 'react'
import { unlockAudio } from '../audio/sfx'
import { Link, useParams } from 'react-router'
import { CameraError, startCamera, stopCamera, type CameraErrorKind } from '../input/camera'
import { FaceTracker } from '../input/faceTracker'
import { HandInput } from '../input/handInput'
import { PointerHub } from '../interaction/pointerHub'
import { useT, type I18nKey } from '../i18n'
import { HeadParallax } from '../scene/HeadParallax'
import { HoloCanvas } from '../scene/HoloCanvas'
import { AtomPanel } from '../atoms/AtomPanel'
import { AtomScene } from '../atoms/scenes/AtomScene'
import { experienceBySlug, modelBySlug } from '../models/registry'
import { ModelScene } from '../scene/ModelScene'
import { CalibrationOverlay } from './CalibrationOverlay'
import { DebugPanel } from './DebugPanel'
import { DevPanel } from './DevPanel'
import { GestureTips } from './GestureTips'
import { HandLayer } from './HandLayer'
import { LabContext, type LabServices } from './LabContext'
import { CreditsPanel } from './CreditsPanel'
import { trackLab } from './labAnalytics'
import { useLab } from './labStore'
import { useModel } from './modelStore'
import { ModelPanel } from './panels/ModelPanel'
import { PartLabel } from './PartLabel'
import { SettingsPanel } from './SettingsPanel'

const reasonKeys: Record<CameraErrorKind, I18nKey> = {
  denied: 'lab.cameraDenied',
  notFound: 'lab.cameraNotFound',
  unsupported: 'lab.cameraUnsupported',
  unknown: 'lab.cameraUnknown',
}

export default function LabPage() {
  const t = useT()
  const { modelId = '' } = useParams()
  const rootRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const services = useMemo<LabServices>(
    () => ({ input: new HandInput(), hub: new PointerHub(), face: new FaceTracker() }),
    [],
  )
  const { camera, tracking, debug, devPanel, settingsOpen, creditsOpen, tipsOpen, headParallax, set } = useLab()
  const parallaxOn = headParallax && camera.state === 'live'

  // Head tracking runs only while head-coupled 3D is switched on.
  useEffect(() => {
    const video = videoRef.current
    if (!parallaxOn || !video) return
    const { face } = services
    void face.start(video)
    return () => face.stop()
  }, [parallaxOn, services])

  useEffect(() => () => services.face.close(), [services])
  useEffect(() => trackLab(), [])
  const def = modelBySlug(modelId)
  const experience = def ? undefined : experienceBySlug(modelId)
  const loaded = useModel((s) => s.loaded)

  useEffect(() => {
    if (def) useModel.getState().load(def)
  }, [def])

  // Sound needs one user gesture to unlock (the landing's Start click usually did it).
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio)
    return () => window.removeEventListener('pointerdown', unlockAudio)
  }, [])

  // Camera → hand tracking → (first visit) quick calibration.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const { input, hub } = services
    let stream: MediaStream | null = null
    let cancelled = false
    set({ camera: { state: 'requesting' }, tracking: 'idle', calibrating: null })

    const offStatus = input.onStatus((status) => set({ tracking: status }))
    const offHands = hub.attachHands(input)
    hub.start()

    startCamera(video)
      .then(async (s) => {
        if (cancelled) return stopCamera(s)
        stream = s
        set({ camera: { state: 'live' } })
        await input.start(video)
        if (!cancelled && input.status === 'running' && input.needsCalibration) {
          input.startCalibration('quick')
          set({ calibrating: 'quick' })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        set({ camera: { state: 'mouse', reason: err instanceof CameraError ? err.kind : 'unknown' } })
      })

    return () => {
      cancelled = true
      offStatus()
      offHands()
      hub.stop()
      input.stop()
      stopCamera(stream)
    }
  }, [services, set])

  // Mouse input + viewport size for cursor mapping.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const offMouse = services.hub.attachMouse(root)
    const resize = () => services.input.setViewport(window.innerWidth, window.innerHeight)
    resize()
    window.addEventListener('resize', resize)
    return () => {
      offMouse()
      window.removeEventListener('resize', resize)
    }
  }, [services])

  // Keyboard: D = debug overlay, ` = gesture tuning.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'd' || e.key === 'D') set({ debug: !useLab.getState().debug })
      if (e.key === '`') set({ devPanel: !useLab.getState().devPanel })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set])

  return (
    <LabContext.Provider value={services}>
      <main ref={rootRef} className="lab">
        <video ref={videoRef} className="lab-video" data-live={camera.state === 'live'} />
        {def || experience ? (
          <HoloCanvas>
            <Suspense fallback={null}>{def ? <ModelScene def={def} /> : <AtomScene />}</Suspense>
            {parallaxOn && <HeadParallax head={() => services.face.latest} />}
          </HoloCanvas>
        ) : (
          <p className="lab-message">{t('lab.unknownModel')}</p>
        )}
        {def && !loaded && <p className="lab-loading">{t('model.loading')}</p>}
        <PartLabel />
        <HandLayer />

        <header className="lab-bar" data-hud>
          <Link to="/" className="hud-button">
            ← {t('lab.back')}
          </Link>
          <div className="lab-bar-right">
            <button type="button" className="hud-button" onClick={() => set({ tipsOpen: !tipsOpen })}>
              {t('tips.open')}
            </button>
            <button type="button" className="hud-button" onClick={() => set({ settingsOpen: !settingsOpen })}>
              {t('settings.open')}
            </button>
          </div>
        </header>

        {camera.state === 'requesting' && (
          <div className="lab-notice" data-hud>
            <p>{t('lab.cameraRequesting')}</p>
            <p className="lab-privacy">{t('lab.privacy')}</p>
          </div>
        )}
        {camera.state === 'live' && tracking === 'loading' && (
          <div className="lab-notice lab-notice--bottom" data-hud>
            <p>{t('lab.trackingLoading')}</p>
          </div>
        )}
        {camera.state === 'live' && tracking === 'error' && (
          <div className="lab-notice lab-notice--bottom" data-hud>
            <span className="hud-tag">{t('lab.mouseMode')}</span>
            <p>{t('lab.trackingError')}</p>
          </div>
        )}
        {camera.state === 'mouse' && (
          <div className="lab-notice lab-notice--bottom lab-notice--fade" data-hud>
            <span className="hud-tag">{t('lab.mouseMode')}</span>
            <p>{t(reasonKeys[camera.reason])}</p>
          </div>
        )}

        {def && loaded && <ModelPanel />}
        {experience && <AtomPanel />}
        <CalibrationOverlay />
        {settingsOpen && <SettingsPanel />}
        {creditsOpen && <CreditsPanel />}
        {tipsOpen && <GestureTips />}
        {debug && <DebugPanel />}
        {devPanel && <DevPanel />}
      </main>
    </LabContext.Provider>
  )
}
