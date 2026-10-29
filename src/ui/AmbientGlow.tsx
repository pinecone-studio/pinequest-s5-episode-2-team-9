import { useEffect, useState } from 'react'

type MousePosition = {
  x: number
  y: number
}

export function AmbientGlow() {
  const [position, setPosition] = useState<MousePosition | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
    let frame: number | null = null
    let nextPosition: MousePosition | null = null

    function reset() {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = null
      nextPosition = null
      setPosition(null)
    }

    // A window listener receives the native DOM MouseEvent, not React.MouseEvent.
    function handleMouseMove(event: MouseEvent) {
      nextPosition = { x: event.clientX, y: event.clientY }
      if (frame !== null) return

      frame = window.requestAnimationFrame(() => {
        frame = null
        setPosition(nextPosition)
      })
    }

    function updateTracking() {
      window.removeEventListener('mousemove', handleMouseMove)
      reset()
      if (media.matches) window.addEventListener('mousemove', handleMouseMove, { passive: true })
    }

    updateTracking()
    media.addEventListener('change', updateTracking)
    window.addEventListener('blur', reset)
    document.documentElement.addEventListener('mouseleave', reset)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      media.removeEventListener('change', updateTracking)
      window.removeEventListener('blur', reset)
      document.documentElement.removeEventListener('mouseleave', reset)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [])

  if (!position) return null

  return (
    <div
      className="ambient-glow pointer-events-none"
      aria-hidden="true"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)` }}
    />
  )
}
