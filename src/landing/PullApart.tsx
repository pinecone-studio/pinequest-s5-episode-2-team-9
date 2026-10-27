import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from 'motion/react'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { library } from '../models/registry'

// The 3D heart loads only on laptops, after the rest of the page.
const HeroScene = lazy(() => import('./HeroScene'))

const heart = library[0]
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Past either end the grips follow less and less, like pulling against a spring. */
function rubberband(over: number, constant = 0.55): number {
  return ((over * constant) / (1 + constant * Math.abs(over))) * 0.45
}

/** Where a flick would come to rest (Apple's scroll-deceleration projection, d = 0.998). */
function project(velocityPerSecond: number, deceleration = 0.998): number {
  return ((velocityPerSecond / 1000) * deceleration) / (1 - deceleration)
}

interface Drag {
  pointer: number
  side: 1 | -1
  startX: number
  start: number
  half: number
  history: { t: number; v: number }[]
}

/**
 * Two grips that pull apart from the middle, like two pinching hands. Dragging
 * either one outward takes the heart to pieces; the distance between them is
 * the explode amount. Tracks the pointer 1:1, carries the release velocity into
 * a spring, and can be caught again mid-flight.
 */
export function PullApart({ live }: { live: boolean }) {
  const t = useT()
  const reduced = useReducedMotion()
  const value = useMotionValue(0.12)
  const [percent, setPercent] = useState(12)
  const [half, setHalf] = useState(200)
  const sectionRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const touched = useRef(false)
  const motionRef = useRef<AnimationPlaybackControls | null>(null)
  const inView = useInView(sectionRef, { once: true, amount: 0.45 })

  useMotionValueEvent(value, 'change', (v) => setPercent(Math.round(clamp01(v) * 100)))

  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHalf(el.getBoundingClientRect().width / 2))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Grips sit at the centre plus or minus the distance; the bar between them stretches.
  // Unclamped, so the rubber-band stretch past either end shows in the grips.
  const leftX = useTransform(value, (v) => -v * (half - 28))
  const rightX = useTransform(value, (v) => v * (half - 28))
  const barScale = useTransform(value, (v) => Math.max(0.02, clamp01(v)))
  const apartOpacity = useTransform(value, (v) => clamp01(v * 1.4))

  const settle = (target: number, velocity = 0) => {
    motionRef.current?.stop()
    motionRef.current = reduced
      ? animate(value, target, { duration: 0.2 })
      : animate(value, target, { type: 'spring', velocity, bounce: Math.abs(velocity) > 0.6 ? 0.2 : 0, duration: 0.5 })
  }

  // One gentle demonstration when the section first comes into view, unless the visitor got there first.
  useEffect(() => {
    if (!inView || touched.current || reduced) return
    motionRef.current = animate(value, [value.get(), 0.62, 0.34], { duration: 2.4, ease: 'easeInOut', times: [0, 0.5, 1] })
  }, [inView, reduced, value])

  const onPointerDown = (side: 1 | -1) => (e: React.PointerEvent<HTMLButtonElement>) => {
    // Catch it mid-flight: stop the spring and start from where it is on screen now.
    motionRef.current?.stop()
    touched.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      pointer: e.pointerId,
      side,
      startX: e.clientX,
      start: value.get(),
      half: Math.max(1, half - 28),
      history: [{ t: e.timeStamp, v: value.get() }],
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointer) return
    const raw = d.start + (d.side * (e.clientX - d.startX)) / d.half
    const v = raw < 0 ? -rubberband(-raw) : raw > 1 ? 1 + rubberband(raw - 1) : raw
    value.set(v)
    d.history.push({ t: e.timeStamp, v })
    if (d.history.length > 6) d.history.shift()
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointer) return
    drag.current = null
    const first = d.history[0]
    const last = d.history[d.history.length - 1]
    const velocity = last.t > first.t ? ((last.v - first.v) / (last.t - first.t)) * 1000 : 0
    settle(clamp01(value.get() + project(velocity)), velocity)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = { ArrowRight: 0.1, ArrowUp: 0.1, ArrowLeft: -0.1, ArrowDown: -0.1, PageUp: 0.25, PageDown: -0.25 }[e.key]
    let target: number | null = step === undefined ? null : clamp01(value.get() + step)
    if (e.key === 'Home') target = 0
    if (e.key === 'End') target = 1
    if (target === null) return
    e.preventDefault()
    touched.current = true
    settle(target)
  }

  const grip = (side: 1 | -1) => (
    <motion.button
      type="button"
      className="pull-grip"
      style={{ x: side === 1 ? rightX : leftX }}
      onPointerDown={onPointerDown(side)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      {...(side === 1
        ? {
            role: 'slider',
            'aria-label': t('landing.pullLabel'),
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': percent,
            'aria-valuetext': `${percent}%`,
          }
        : { 'aria-hidden': true, tabIndex: -1 })}
    >
      <i />
    </motion.button>
  )

  return (
    <section className="pull" ref={sectionRef} aria-labelledby="pull-title">
      <div className="pull-input">
        <p className="pull-text">{t('landing.pullText')}</p>
        <div className="pull-control">
          <div className="pull-track" ref={trackRef}>
            <motion.span className="pull-bar" style={{ scaleX: barScale }} aria-hidden="true" />
            {grip(-1)}
            {grip(1)}
          </div>
          <div className="pull-ends" aria-hidden="true">
            <span>{t('landing.pullWhole')}</span>
            <span>{percent}%</span>
            <span>{t('landing.pullApart')}</span>
          </div>
        </div>
        <h2 id="pull-title" className="pull-title pull-title--start">
          {t('landing.pullStart')}
          <span className="visually-hidden"> {t('landing.pullEnd')}</span>
        </h2>
      </div>

      <div className="pull-output">
        {live ? (
          <Suspense fallback={<Stills opacity={apartOpacity} />}>
            <div className="pull-canvas" aria-hidden="true">
              <HeroScene def={heart} progress={() => 1 - clamp01(value.get())} />
            </div>
          </Suspense>
        ) : (
          <Stills opacity={apartOpacity} />
        )}
        <p className="pull-title pull-title--end" aria-hidden="true">
          {t('landing.pullEnd')}
        </p>
      </div>
    </section>
  )
}

/** Without WebGL (phones), the two real stills crossfade with the grips. */
function Stills({ opacity }: { opacity: MotionValue<number> }) {
  const t = useT()
  return (
    <div className="pull-stills">
      <img src="/landing/heart.webp" alt={t('landing.pullAltWhole')} width={1200} height={1500} loading="lazy" />
      <motion.img
        src="/landing/heart-apart.webp"
        alt={t('landing.pullAltApart')}
        width={1200}
        height={1500}
        loading="lazy"
        style={{ opacity }}
      />
    </div>
  )
}
