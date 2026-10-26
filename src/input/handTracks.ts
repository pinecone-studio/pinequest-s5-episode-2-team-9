// Turns raw tracker frames into stable, smoothed hand tracks: each physical
// hand keeps the same id across frames, survives short dropouts, and carries
// its pose measurements.

import { PointsFilter } from './filters'
import { classifyPose, toIsotropic, type HandPose } from './handGeometry'
import type { Tuning } from './tuning'
import { LM, type RawHandFrame, type Vec3 } from './types'

export interface HandTrack {
  id: number
  /** Smoothed landmarks in normalized video coordinates (not mirrored). */
  landmarks: Vec3[]
  pose: HandPose
  handedness: 'Left' | 'Right'
  score: number
  lastSeen: number
  /** True when this frame had no detection and the track is coasting on its last state. */
  coasting: boolean
}

interface InternalTrack extends HandTrack {
  filter: PointsFilter
}

export class HandTracks {
  private tracks: InternalTrack[] = []
  private nextId = 1

  update(frame: RawHandFrame, t: Tuning): HandTrack[] {
    const aspect = frame.videoWidth > 0 && frame.videoHeight > 0 ? frame.videoWidth / frame.videoHeight : 16 / 9
    const filterParams = { minCutoff: t.minCutoff, beta: t.beta, dCutoff: t.dCutoff }
    const detections = frame.hands.filter((h) => h.score >= t.minHandScore)

    // Greedy nearest-wrist matching (at most two hands, so greedy is optimal enough).
    const pairs: { d: number; ti: number; di: number }[] = []
    this.tracks.forEach((track, ti) =>
      detections.forEach((det, di) => {
        const a = track.landmarks[LM.WRIST]
        const b = det.landmarks[LM.WRIST]
        pairs.push({ d: Math.hypot((a.x - b.x) * aspect, a.y - b.y), ti, di })
      }),
    )
    pairs.sort((p, q) => p.d - q.d)
    const usedTracks = new Set<number>()
    const usedDetections = new Set<number>()
    const matched = new Map<number, number>()
    for (const p of pairs) {
      if (p.d > t.trackMatchDistance || usedTracks.has(p.ti) || usedDetections.has(p.di)) continue
      usedTracks.add(p.ti)
      usedDetections.add(p.di)
      matched.set(p.ti, p.di)
    }

    const next: InternalTrack[] = []
    this.tracks.forEach((track, ti) => {
      const di = matched.get(ti)
      if (di !== undefined) {
        track.filter.setParams(filterParams)
        next.push(this.refresh(track, detections[di], frame.timestamp, aspect, t))
      } else if (frame.timestamp - track.lastSeen <= t.lostGraceMs) {
        next.push({ ...track, coasting: true })
      }
    })
    detections.forEach((det, di) => {
      if (usedDetections.has(di)) return
      const filter = new PointsFilter(filterParams)
      const fresh = { id: this.nextId++, filter } as InternalTrack
      next.push(this.refresh(fresh, det, frame.timestamp, aspect, t))
    })

    this.tracks = next
    return next.map(({ filter: _filter, ...track }) => track)
  }

  reset(): void {
    this.tracks = []
  }

  private refresh(
    track: InternalTrack,
    det: RawHandFrame['hands'][number],
    timestamp: number,
    aspect: number,
    t: Tuning,
  ): InternalTrack {
    const landmarks = track.filter.filter(det.landmarks, timestamp)
    return {
      ...track,
      landmarks,
      pose: classifyPose(toIsotropic(landmarks, aspect), t),
      handedness: det.handedness,
      score: det.score,
      lastSeen: timestamp,
      coasting: false,
    }
  }
}
