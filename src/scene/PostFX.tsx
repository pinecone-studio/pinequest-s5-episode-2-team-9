import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Vector2 } from 'three'

const aberrationOffset = new Vector2(0.0006, 0.0004)

// Debug: ?fx=bloom,ca,vig picks effects (default all); ?fx=0 disables (see HoloCanvas).
const enabled = (() => {
  const list = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('fx')
  const set = new Set(list ? list.split(',') : ['bloom', 'ca', 'vig'])
  return { bloom: set.has('bloom'), ca: set.has('ca'), vig: set.has('vig') }
})()

// No film-grain pass: over a transparent canvas it paints grey noise wherever
// bloom spreads alpha. Scanlines and flicker live in HoloMaterial instead.
export function PostFX() {
  return (
    <EffectComposer multisampling={0}>
      <>{enabled.bloom && <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.15} luminanceSmoothing={0.3} radius={0.7} />}</>
      <>{enabled.ca && <ChromaticAberration offset={aberrationOffset} radialModulation={false} modulationOffset={0} />}</>
      <>{enabled.vig && <Vignette offset={0.3} darkness={0.55} />}</>
    </EffectComposer>
  )
}
