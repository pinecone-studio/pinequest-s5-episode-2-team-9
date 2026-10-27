// Webcam access. Frames never leave the browser: the stream only feeds a
// local <video> element and, later, the on-device hand tracker.

export type CameraErrorKind = 'denied' | 'notFound' | 'unsupported' | 'unknown'

export class CameraError extends Error {
  readonly kind: CameraErrorKind

  constructor(kind: CameraErrorKind, message: string) {
    super(message)
    this.name = 'CameraError'
    this.kind = kind
  }
}

export function classifyCameraError(err: unknown): CameraErrorKind {
  const name = err instanceof Error || err instanceof DOMException ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'notFound'
    case 'NotSupportedError':
    case 'TypeError':
      return 'unsupported'
    default:
      return 'unknown'
  }
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'getUserMedia is not available')
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' },
    })
  } catch (err) {
    throw new CameraError(classifyCameraError(err), String(err))
  }
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()
  return stream
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}
