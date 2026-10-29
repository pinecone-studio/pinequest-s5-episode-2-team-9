import { useEffect, useRef } from 'react'
import { useTx } from '../i18n'
import { keys, piecesAt } from '../models/ModelDefinition'
import { pieceColorAt } from '../scene/pieceColors'
import { labelAnchor } from '../scene/sceneShared'
import { pieceLabel } from './pieceLabel'
import { useModel } from './modelStore'

// Floating name tag for the hovered (or selected) part. Position comes from the
// 3D scene every frame; text only re-renders when the part changes.
export function PartLabel() {
  const tx = useTx()
  const ref = useRef<HTMLDivElement>(null)
  const def = useModel((s) => s.def)
  const id = useModel((s) => (s.mode === 'study' ? null : (s.hovered ?? s.selected)))
  const part = def?.parts.find((p) => p.id === id)
  // In Study the tag names the hovered piece of what is shown.
  const studyPart = useModel((s) => (s.mode === 'study' ? s.def?.parts.find((p) => p.id === s.studyPart) : undefined))
  const studyPath = useModel((s) => s.studyPath)
  const hoveredPiece = useModel((s) => (s.mode === 'study' ? s.hoveredPiece : null))
  const piece = studyPart && hoveredPiece ? piecesAt(studyPart, studyPath).find((p) => p.id === hoveredPiece) : undefined
  const pieceColor = studyPart && piece ? pieceColorAt(studyPart.color, studyPart.pieces, [...studyPath, piece.id]) : ''

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
      {def && piece && (
        <span style={{ borderColor: pieceColor }}>
          <i style={{ background: pieceColor }} />
          {pieceLabel(tx, def, piece)}
        </span>
      )}
      {def && part && (
        <span style={{ borderColor: part.color }}>
          <i style={{ background: part.color }} />
          {tx(keys.partName(def.id, part))}
        </span>
      )}
    </div>
  )
}
