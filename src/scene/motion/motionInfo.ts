// Live state of the running motion, written by the scene every frame and read by the
// panel (polled with requestAnimationFrame, like the heart clock).

export const motionInfo = {
  /** Where the tracer is now (an i18n key suffix, e.g. 'rightVentricle'). */
  where: '',
  /** 0..1 progress of the tracer through its whole route. */
  progress: 0,
  /** Completed tracer laps (heart: full circulations). */
  laps: 0,
  /** Current stage of a sequence (rocket start-up, brain scenario step...). */
  stage: '',
  /** Live readouts (rocket gauges, motor current...). */
  values: {} as Record<string, number>,
}

export function resetMotionInfo(): void {
  motionInfo.where = ''
  motionInfo.progress = 0
  motionInfo.laps = 0
  motionInfo.stage = ''
  motionInfo.values = {}
}
