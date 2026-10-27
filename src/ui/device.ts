/** Phones and tablets: touch-first devices without a laptop webcam setup. */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const noHover = window.matchMedia?.('(hover: none)').matches ?? false
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  return (coarse && noHover) || mobileUa
}
