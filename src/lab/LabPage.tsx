import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CameraError, startCamera, stopCamera, type CameraErrorKind } from '../input/camera'
import { useT, type I18nKey } from '../i18n'
import { HoloCanvas } from '../scene/HoloCanvas'
import { HoloCube } from '../scene/HoloCube'
import { LangToggle } from '../ui/LangToggle'

type CameraStatus = { state: 'requesting' } | { state: 'live' } | { state: 'mouse'; reason: CameraErrorKind }

const reasonKeys: Record<CameraErrorKind, I18nKey> = {
  denied: 'lab.cameraDenied',
  notFound: 'lab.cameraNotFound',
  unsupported: 'lab.cameraUnsupported',
  unknown: 'lab.cameraUnknown',
}

// Only the Phase 0 test scene exists so far; real models arrive with the registry.
const knownModels = new Set(['test'])

export default function LabPage() {
  const t = useT()
  const { modelId = '' } = useParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState<CameraStatus>({ state: 'requesting' })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let stream: MediaStream | null = null
    let cancelled = false
    startCamera(video)
      .then((s) => {
        if (cancelled) return stopCamera(s)
        stream = s
        setCamera({ state: 'live' })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setCamera({ state: 'mouse', reason: err instanceof CameraError ? err.kind : 'unknown' })
      })
    return () => {
      cancelled = true
      stopCamera(stream)
    }
  }, [])

  return (
    <main className="lab">
      <video ref={videoRef} className="lab-video" data-live={camera.state === 'live'} />
      {knownModels.has(modelId) ? (
        <HoloCanvas>
          <HoloCube />
        </HoloCanvas>
      ) : (
        <p className="lab-message">{t('lab.unknownModel')}</p>
      )}

      <header className="lab-bar">
        <Link to="/" className="hud-button">
          ← {t('lab.back')}
        </Link>
        <LangToggle />
      </header>

      {camera.state === 'requesting' && (
        <div className="lab-notice">
          <p>{t('lab.cameraRequesting')}</p>
          <p className="lab-privacy">{t('lab.privacy')}</p>
        </div>
      )}
      {camera.state === 'mouse' && (
        <div className="lab-notice lab-notice--bottom">
          <span className="hud-tag">{t('lab.mouseMode')}</span>
          <p>{t(reasonKeys[camera.reason])}</p>
        </div>
      )}
    </main>
  )
}
