import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Vector2 } from 'three'

const aberrationOffset = new Vector2(0.0006, 0.0004)

// No film-grain pass: over a transparent canvas it paints grey noise wherever
// bloom spreads alpha. Scanlines and flicker live in HoloMaterial instead.
export function PostFX() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.15} luminanceSmoothing={0.3} radius={0.7} />
      <ChromaticAberration offset={aberrationOffset} radialModulation={false} modulationOffset={0} />
      <Vignette offset={0.3} darkness={0.55} />
    </EffectComposer>
  )
}
