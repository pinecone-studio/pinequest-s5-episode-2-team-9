import { createContext, useContext } from 'react'
import type { FaceTracker } from '../input/faceTracker'
import type { HandInput } from '../input/handInput'
import type { PointerHub } from '../interaction/pointerHub'

export interface LabServices {
  input: HandInput
  hub: PointerHub
  face: FaceTracker
}

export const LabContext = createContext<LabServices | null>(null)

export function useLabServices(): LabServices {
  const services = useContext(LabContext)
  if (!services) throw new Error('useLabServices must be used inside <LabContext.Provider>')
  return services
}
