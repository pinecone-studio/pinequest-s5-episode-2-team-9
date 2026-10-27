import { useEffect, useRef } from 'react'
import { useTx } from '../i18n'
import { keys } from '../models/ModelDefinition'
import { labelAnchor } from '../scene/sceneShared'
import { useModel } from './modelStore'

// Floating name tag for the hovered (or selected) part. Position comes from the
// 3D scene every frame; text only re-renders when the part changes.
export function PartLabel() {
  const tx = useTx()
  const ref = useRef<HTMLDivElement>(null)
  const def = useModel((s) => s.def)
  const id = useModel((s) => (s.mode === 'study' ? null : (s.hovered ?? s.selected)))
  const part = def?.parts.find((p) => p.id === id)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = ref.current
      if (el) {
        el.style.opacity = labelAnchor.visible ? '1' : '0'
        el.style.transform = `translate(${labelAnchor.x}px, ${labelAnchor.y}px)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={ref} className="part-label" aria-live="polite">
      {def && part && (
        <span style={{ borderColor: part.color }}>
          <i style={{ background: part.color }} />
          {tx(keys.partName(def.id, part))}
        </span>
      )}
    </div>
  )
}
