import { useEffect, useRef, useState } from 'react'
import { useTx } from '../i18n'
import { keys } from '../models/ModelDefinition'
import { portAnchors } from '../scene/sceneShared'
import { useModel } from './modelStore'

// Study close-up: a small tag on every socket or opening of the studied part, naming what plugs in
// there (the 24-pin ATX cable on the motherboard, the superior vena cava on the right atrium...).
// Positions come from the 3D scene every frame; the set of tags only changes with the part.
/** Height of one tag plus a little air, in pixels. */
const TAG_H = 20

export function PortLabels() {
  const tx = useTx()
  const def = useModel((s) => s.def)
  const [ids, setIds] = useState<string[]>([])
  const refs = useRef(new Map<string, HTMLSpanElement>())

  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (portAnchors.ids !== ids) setIds(portAnchors.ids)
      // Each tag sits at its socket; tags that would overlap are pushed down, top to bottom,
      // and a leader line keeps each one tied to its socket.
      const items = [...refs.current]
        .map(([id, el]) => ({
          el,
          at: portAnchors.at.get(id),
          // The span only marks the socket; the tag is its absolutely positioned last child.
          w: (el.lastElementChild as HTMLElement | null)?.offsetWidth ?? 0,
        }))
        .filter((i): i is { el: HTMLSpanElement; at: { x: number; y: number }; w: number } => !!i.at)
        .sort((a, b) => a.at.y - b.at.y)
      const placed: { x: number; y: number; w: number }[] = []
      for (const { el, at, w } of items) {
        let y = at.y
        // Tags start 8 px right of their socket, so they span [x + 8, x + 8 + w].
        while (placed.some((p) => Math.abs(p.y - y) < TAG_H && at.x < p.x + p.w && p.x < at.x + w)) y += TAG_H
        placed.push({ x: at.x, y, w })
        el.style.transform = `translate(${at.x}px, ${at.y}px)`
        el.style.setProperty('--drop', `${y - at.y}px`)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ids])

  if (!def || !ids.length) return null
  return (
    <div className="port-labels" aria-hidden="true">
      {ids.map((id) => {
        const part = def.parts.find((p) => p.id === id)
        if (!part) return null
        return (
          <span
            key={id}
            ref={(el) => {
              if (el) refs.current.set(id, el)
              else refs.current.delete(id)
            }}
          >
            <i style={{ background: part.color }} />
            <b>{tx(keys.partName(def.id, part))}</b>
          </span>
        )
      })}
    </div>
  )
}
