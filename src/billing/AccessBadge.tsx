import { useT } from '../i18n'
import { FREE_PICKS, modelAccess, picksLeft } from './access'
import { useAccess } from './accessStore'

/** A small tag on a library card: "Free pick" or "Locked". Nothing for subscribers or while loading. */
export function AccessBadge({ modelId }: { modelId: string }) {
  const t = useT()
  const { status, access } = useAccess()
  if (status !== 'ready' || access.unlimited) return null
  const state = modelAccess(access, modelId)
  if (state === 'canPick') return null
  return (
    <span className={`access-badge access-badge--${state}`}>
      {t(state === 'open' ? 'access.freePick' : 'access.locked')}
    </span>
  )
}

/** For the labs, which every account can open. */
export function FreeBadge() {
  const t = useT()
  const { access } = useAccess()
  if (access.unlimited) return null
  return <span className="access-badge access-badge--open">{t('access.free')}</span>
}

/** One line under the library heading explaining the free picks. Hidden for subscribers. */
export function PicksNote() {
  const t = useT()
  const { status, access } = useAccess()
  if (access.unlimited || status === 'loading' || status === 'error') return null
  const left = status === 'ready' ? picksLeft(access) : FREE_PICKS
  return (
    <p className="access-note">
      {left > 0 ? `${t('access.notePicks')} ${left}` : t('access.noteNoPicks')}
    </p>
  )
}
