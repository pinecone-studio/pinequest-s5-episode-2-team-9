// Synthesized UI sounds (WebAudio, no audio files). Sound is always on; the
// browser's tab mute is the off switch. The context is unlocked by the first
// user gesture (the Start button or any click).

type SoundName = 'click' | 'hover' | 'pick' | 'snap' | 'wrong' | 'success' | 'open'

let ctx: AudioContext | null = null
let master: GainNode | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.32
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Call from a user gesture to allow audio. */
export function unlockAudio(): void {
  context()
}

function tone(
  freq: number,
  start: number,
  duration: number,
  opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number } = {},
) {
  const c = ctx!
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, start)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, start + duration)
  const peak = opts.gain ?? 0.5
  const attack = opts.attack ?? 0.006
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(master!)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

let lastHover = 0

export function play(name: SoundName): void {
  const c = context()
  if (!c || c.state !== 'running') return
  const t = c.currentTime
  switch (name) {
    case 'click':
      tone(1400, t, 0.05, { type: 'triangle', gain: 0.25 })
      break
    case 'hover':
      if (t - lastHover < 0.08) return
      lastHover = t
      tone(2200, t, 0.03, { gain: 0.06 })
      break
    case 'pick':
      tone(520, t, 0.12, { type: 'triangle', gain: 0.3, to: 880 })
      break
    case 'snap':
      tone(880, t, 0.09, { type: 'triangle', gain: 0.35 })
      tone(1320, t + 0.06, 0.18, { gain: 0.3 })
      break
    case 'wrong':
      tone(240, t, 0.16, { type: 'sawtooth', gain: 0.12, to: 170 })
      tone(200, t + 0.12, 0.2, { type: 'sawtooth', gain: 0.1, to: 140 })
      break
    case 'success':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.35, { type: 'triangle', gain: 0.28 }))
      break
    case 'open':
      tone(400, t, 0.22, { gain: 0.22, to: 1100, attack: 0.03 })
      break
  }
}
