// Soft studio lighting for the realistic view: a key light and a cool rim light.
// Hologram materials ignore lights, so this is always on.
export function StudioLights() {
  return (
    <>
      <hemisphereLight args={['#dfe9ff', '#2a1d1a', 0.6]} />
      <directionalLight position={[2.5, 3, 3]} intensity={1.6} />
      <directionalLight position={[-3, 1.5, -2]} intensity={0.9} color="#9fd8ff" />
    </>
  )
}
