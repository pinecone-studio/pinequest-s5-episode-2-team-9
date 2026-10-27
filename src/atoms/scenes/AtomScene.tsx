import { useAtom } from '../atomStore'
import { BuildScene } from './BuildScene'
import { ExperimentScene } from './ExperimentScene'
import { LightScene } from './LightScene'
import { OrbitalScene } from './OrbitalScene'
import { useAtomInteraction } from './shared'

/** The 3D side of the atoms lab: one scene per tab, sharing one interaction layer. */
export function AtomScene() {
  const tab = useAtom((s) => s.tab)
  const ix = useAtomInteraction()
  if (tab === 'orbitals') return <OrbitalScene ix={ix} />
  if (tab === 'light') return <LightScene ix={ix} />
  if (tab === 'experiments') return <ExperimentScene ix={ix} />
  return <BuildScene ix={ix} />
}
