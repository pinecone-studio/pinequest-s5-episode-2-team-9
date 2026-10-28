import { play } from '../audio/sfx'
import { useLang, useT, useTx, type I18nKey } from '../i18n'
import { PanelHideButton } from '../lab/panels/PanelToggle'
import {
  AU_KM,
  daysSinceJ2000,
  length,
  MOON_INCLINATION,
  moonNodeLongitude,
  moonPhase,
  moonPosition,
  obliquity,
  planetPosition,
  scale,
  spin,
  surfacePointFacing,
  type BodyId,
} from './astro'
import { BODIES, PLANETS } from './bodies'
import { daylightHours, phaseName, season } from './readouts'
import { EVENTS, RATES, solarClock, useSolar, type Rate, type SolarView } from './solarStore'

const VIEWS: [SolarView, I18nKey][] = [
  ['system', 'solar.view.system'],
  ['earth', 'solar.view.earth'],
  ['moon', 'solar.view.moon'],
]

const RATE_KEYS: Record<Rate, I18nKey> = {
  1: 'solar.rate.real',
  3600: 'solar.rate.hour',
  21600: 'solar.rate.sixHours',
  86400: 'solar.rate.day',
  604800: 'solar.rate.week',
  2592000: 'solar.rate.month',
}

const ULAANBAATAR_LAT = 47.92

function useNumber() {
  const lang = useLang((s) => s.lang)
  return (n: number, digits = 0) =>
    new Intl.NumberFormat(lang === 'mn' ? 'mn-MN' : 'en-US', {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(n)
}

const hm = (hours: number) =>
  `${Math.floor(hours)}h ${String(Math.round((hours % 1) * 60)).padStart(2, '0')}m`

function TimeControls() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { ms, rate, playing, setRate, setPlaying, jumpTo } = useSolar()
  const date = new Intl.DateTimeFormat(lang === 'mn' ? 'mn-MN' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(ms)
  const step = (days: number) => {
    play('click')
    jumpTo(solarClock.ms + days * 86_400_000)
  }
  return (
    <div className="solar-time">
      <div className="solar-date">{date}</div>
      <div className="qn-row">
        <button type="button" className="hud-button" onClick={() => step(-1)} aria-label={t('solar.dayBack')}>
          −1d
        </button>
        <button
          type="button"
          className="hud-button"
          data-active={playing}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? t('solar.pause') : t('solar.play')}
        </button>
        <button
          type="button"
          className="hud-button"
          onClick={() => step(1)}
          aria-label={t('solar.dayForward')}
        >
          +1d
        </button>
        <button type="button" className="hud-button" onClick={() => jumpTo(Date.now())}>
          {t('solar.now')}
        </button>
      </div>
      <div className="solar-rates">
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            className="hud-button"
            data-active={r === rate}
            onClick={() => setRate(r)}
          >
            {t(RATE_KEYS[r])}
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="hud-button solar-toggle"
      data-active={on}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
      {label}
    </button>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="solar-fact">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

function SystemTab() {
  const t = useT()
  const tx = useTx()
  const num = useNumber()
  const { focus, ms, orbits, labels, stars, set, setView } = useSolar()
  const d = daysSinceJ2000(ms)
  const body = BODIES[focus]
  const fromSun =
    focus === 'sun' ? 0 : length(focus === 'moon' ? planetPosition('earth', d) : planetPosition(focus, d))
  const select = (id: BodyId) => () => {
    play('click')
    set({ focus: id })
  }
  return (
    <>
      <div className="solar-bodies">
        {(['sun', ...PLANETS] as BodyId[]).map((id) => (
          <button
            key={id}
            type="button"
            className="hud-button"
            data-active={focus === id}
            style={{ '--c': BODIES[id].color } as React.CSSProperties}
            onClick={select(id)}
          >
            {tx(`solar.body.${id}`)}
          </button>
        ))}
      </div>
      <h2 className="solar-title">{tx(`solar.body.${focus}`)}</h2>
      <p className="panel-hint">{tx(`solar.about.${focus}`)}</p>
      <div className="solar-facts">
        <Fact label={t('solar.fact.radius')} value={`${num(body.radiusKm)} km`} />
        <Fact label={t('solar.fact.tilt')} value={`${num(body.facts.tilt, 2)}°`} />
        <Fact
          label={t('solar.fact.day')}
          value={`${num(Math.abs(body.facts.dayHours), 1)} h${body.facts.dayHours < 0 ? ` (${t('solar.fact.retrograde')})` : ''}`}
        />
        {body.facts.yearDays && (
          <Fact label={t('solar.fact.year')} value={`${num(body.facts.yearDays, 1)} d`} />
        )}
        {focus !== 'sun' && focus !== 'moon' && (
          <Fact
            label={t('solar.fact.fromSun')}
            value={`${num(fromSun, 3)} AU · ${num((fromSun * AU_KM) / 1e6, 1)} M km`}
          />
        )}
        {body.facts.moons !== undefined && (
          <Fact label={t('solar.fact.moons')} value={String(body.facts.moons)} />
        )}
      </div>
      {(focus === 'earth' || focus === 'moon') && (
        <div className="qn-row">
          <button type="button" className="hud-button" onClick={() => setView('earth')}>
            {t('solar.view.earth')} →
          </button>
          <button type="button" className="hud-button" onClick={() => setView('moon')}>
            {t('solar.view.moon')} →
          </button>
        </div>
      )}
      <div className="solar-toggles">
        <Toggle on={orbits} label={t('solar.show.orbits')} onChange={(v) => set({ orbits: v })} />
        <Toggle on={labels} label={t('solar.show.labels')} onChange={(v) => set({ labels: v })} />
        <Toggle on={stars} label={t('solar.show.stars')} onChange={(v) => set({ stars: v })} />
      </div>
      <p className="panel-hint">{t('solar.system.scaleNote')}</p>
    </>
  )
}

function EarthTab() {
  const t = useT()
  const num = useNumber()
  const { ms, latitudes, sunLeft, labels, set } = useSolar()
  const d = daysSinceJ2000(ms)
  const earth = planetPosition('earth', d)
  const sub = surfacePointFacing(spin('earth', d), scale(earth, -1))
  const s = season(earth)
  const ns = (lat: number) => `${num(Math.abs(lat), 2)}° ${lat >= 0 ? t('solar.north') : t('solar.south')}`
  const ew = (lon: number) => `${num(Math.abs(lon), 1)}° ${lon >= 0 ? t('solar.east') : t('solar.west')}`
  return (
    <>
      <div className="solar-facts">
        <Fact label={t('solar.earth.obliquity')} value={`${num(obliquity(d), 3)}°`} />
        <Fact label={t('solar.earth.subsolar')} value={`${ns(sub.lat)}, ${ew(sub.lon)}`} />
        <Fact label={t('solar.earth.seasonNorth')} value={t(`solar.season.${s.north}` as I18nKey)} />
        <Fact label={t('solar.earth.seasonSouth')} value={t(`solar.season.${s.south}` as I18nKey)} />
        <Fact label={t('solar.earth.daylightUb')} value={hm(daylightHours(ULAANBAATAR_LAT, sub.lat))} />
        <Fact label={t('solar.earth.distance')} value={`${num((length(earth) * AU_KM) / 1e6, 2)} M km`} />
      </div>
      <p className="panel-hint">{t('solar.earth.hint')}</p>
      <div className="solar-legend">
        <span style={{ '--c': '#5ee7ff' } as React.CSSProperties}>{t('solar.earth.legendEquator')}</span>
        <span style={{ '--c': '#ffb347' } as React.CSSProperties}>{t('solar.earth.legendTropics')}</span>
        <span style={{ '--c': '#b8d8ff' } as React.CSSProperties}>{t('solar.earth.legendPolar')}</span>
        <span style={{ '--c': '#ffcf6b' } as React.CSSProperties}>{t('solar.earth.legendEcliptic')}</span>
      </div>
      <div className="solar-toggles">
        <Toggle on={latitudes} label={t('solar.show.latitudes')} onChange={(v) => set({ latitudes: v })} />
        <Toggle on={sunLeft} label={t('solar.show.sunLeft')} onChange={(v) => set({ sunLeft: v })} />
        <Toggle on={labels} label={t('solar.show.labels')} onChange={(v) => set({ labels: v })} />
      </div>
      <p className="panel-hint">{t('solar.earth.fact')}</p>
    </>
  )
}

function PhaseIcon({ illumination, waxing }: { illumination: number; waxing: boolean }) {
  const r = 26
  const rx = r * Math.abs(1 - 2 * illumination)
  const lit = waxing ? 1 : 0
  const term = waxing ? (illumination < 0.5 ? 0 : 1) : illumination < 0.5 ? 1 : 0
  return (
    <svg className="solar-phase" viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="30" r={r} fill="#1a1d24" stroke="rgba(255,255,255,0.15)" />
      <path
        d={`M30 ${30 - r} A${r} ${r} 0 0 ${lit} 30 ${30 + r} A${rx} ${r} 0 0 ${term} 30 ${30 - r}`}
        fill="#e9e6dc"
      />
    </svg>
  )
}

function MoonTab() {
  const t = useT()
  const num = useNumber()
  const { ms, trueScale, tides, labels, set } = useSolar()
  const d = daysSinceJ2000(ms)
  const phase = moonPhase(d)
  const distance = length(moonPosition(d))
  // Sun and Moon pull along the same line near new and full Moon: spring tides.
  const alignment = Math.abs(Math.cos((phase.elongation * Math.PI) / 180))
  const tide = alignment > 0.8 ? 'spring' : alignment < 0.35 ? 'neap' : 'between'
  return (
    <>
      <div className="solar-moon-head">
        <PhaseIcon illumination={phase.illumination} waxing={phase.waxing} />
        <div>
          <h2 className="solar-title">{t(`solar.phase.${phaseName(phase)}` as I18nKey)}</h2>
          <p className="panel-hint">
            {t('solar.moon.lit')} {num(phase.illumination * 100)}%
          </p>
        </div>
      </div>
      <div className="solar-facts">
        <Fact label={t('solar.moon.distance')} value={`${num(distance)} km`} />
        <Fact label={t('solar.moon.elongation')} value={`${num(phase.elongation, 1)}°`} />
        <Fact label={t('solar.moon.tide')} value={t(`solar.tide.${tide}` as I18nKey)} />
        <Fact label={t('solar.moon.inclination')} value={`${MOON_INCLINATION}°`} />
        <Fact label={t('solar.moon.node')} value={`${num(moonNodeLongitude(d), 1)}°`} />
      </div>
      <div className="solar-toggles">
        <Toggle on={trueScale} label={t('solar.show.trueScale')} onChange={(v) => set({ trueScale: v })} />
        <Toggle on={tides} label={t('solar.show.tides')} onChange={(v) => set({ tides: v })} />
        <Toggle on={labels} label={t('solar.show.labels')} onChange={(v) => set({ labels: v })} />
      </div>
      <p className="panel-hint">{t('solar.moon.hint')}</p>
      <p className="panel-hint">{t('solar.moon.fact')}</p>
    </>
  )
}

export function SolarPanel() {
  const t = useT()
  const { view, setView, jumpTo } = useSolar()
  return (
    <aside className="model-panel hud-panel solar-panel" data-hud>
      <div className="hud-panel-head">
        <span className="hud-tag">{t('solar.title')}</span>
        <PanelHideButton />
      </div>
      <div className="tabs">
        {VIEWS.map(([id, key]) => (
          <button
            key={id}
            type="button"
            className="hud-button"
            data-active={view === id}
            onClick={() => {
              play('click')
              setView(id)
            }}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <TimeControls />
      {view === 'system' && <SystemTab />}
      {view === 'earth' && <EarthTab />}
      {view === 'moon' && <MoonTab />}
      <details className="solar-events">
        <summary>{t('solar.events')}</summary>
        {EVENTS.map((e) => (
          <button
            key={e.id}
            type="button"
            className="hud-button hud-button--wide"
            onClick={() => {
              play('click')
              if (view !== e.view) setView(e.view)
              // Paused on the moment, so it can be looked at; Play continues from there.
              useSolar.getState().setPlaying(false)
              jumpTo(Date.parse(e.iso))
            }}
          >
            {t(`solar.event.${e.id}` as I18nKey)}
          </button>
        ))}
      </details>
    </aside>
  )
}
