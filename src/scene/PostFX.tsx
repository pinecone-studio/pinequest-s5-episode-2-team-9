import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Vector2 } from 'three'
import { useLab } from '../lab/labStore'
import { useQuality } from './quality'

const aberrationOffset = new Vector2(0.0006, 0.0004)
const MSAA_SAMPLES = 4

// Debug: ?fx=bloom,ca,vig picks effects (default all); ?fx=0 disables (see HoloCanvas).
const enabled = (() => {
  const list = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('fx')
  const set = new Set(list ? list.split(',') : ['bloom', 'ca', 'vig'])
  return { bloom: set.has('bloom'), ca: set.has('ca'), vig: set.has('vig') }
})()

// No film-grain pass: over a transparent canvas it paints grey noise wherever
// bloom spreads alpha. Scanlines and flicker live in HoloMaterial instead.
export function PostFX() {
  const level = useQuality((s) => s.level)
  const realistic = useLab((s) => s.viewStyle === 'realistic' || s.forcedRealistic)
  if (level === 0) return null
  if (realistic) {
    // Real objects: only a faint bloom on highlights, no hologram fringing.
    return (
      <EffectComposer multisampling={MSAA_SAMPLES}>
        <Bloom mipmapBlur intensity={0.3} luminanceThreshold={0.95} luminanceSmoothing={0.1} radius={0.5} />
        <Vignette offset={0.35} darkness={0.35} />
      </EffectComposer>
    )
  }
  return (
    <EffectComposer multisampling={MSAA_SAMPLES}>
      <>{enabled.bloom && <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.15} luminanceSmoothing={0.3} radius={0.7} />}</>
      <>
        {enabled.ca && level === 2 && (
          <ChromaticAberration offset={aberrationOffset} radialModulation={false} modulationOffset={0} />
        )}
      </>
      <>{enabled.vig && <Vignette offset={0.3} darkness={0.55} />}</>
    </EffectComposer>
  )
}
