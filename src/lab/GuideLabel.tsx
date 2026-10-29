import { useEffect, useRef } from 'react'
import { useT, useTx } from '../i18n'
import { keys } from '../models/ModelDefinition'
import { guideAnchor } from '../scene/sceneShared'
import { guideTarget, useModel } from './modelStore'

// Floating tag on the opening the guided part attaches to ("attaches here · Right atrium").
// Position comes from the 3D scene every frame; text only re-renders when the target changes.
export function GuideLabel() {
  const t = useT()
  const tx = useTx()
  const ref = useRef<HTMLDivElement>(null)
  const def = useModel((s) => s.def)
  const target = useModel(guideTarget)
  const part = def?.parts.find((p) => p.id === target)
  const parent = part && def?.parts.find((p) => p.id === part.dependsOn[0])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = ref.current
      if (el) {
        el.style.opacity = guideAnchor.visible ? '1' : '0'
        el.style.transform = `translate(${guideAnchor.x}px, ${guideAnchor.y}px)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={ref} className="guide-label" aria-hidden="true">
      {def && parent && (
        <span>
          <em>{t('assembly.attachHere')}</em>
          {tx(keys.partName(def.id, parent))}
        </span>
      )}
    </div>
  )
}
