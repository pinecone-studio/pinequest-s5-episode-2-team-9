import { useMemo } from 'react'
import { play } from '../audio/sfx'
import { useLang, useT, type I18nKey } from '../i18n'
import { PanelHideButton } from '../lab/panels/PanelToggle'
import { DIAGRAM_C, DROP_HEIGHT, fallTime } from './apple'
import { CAPTURE_B, measuredPrecession, mercuryPrecessionArcsec, precessionPerOrbit } from './geodesic'
import {
  C,
  escapeSpeed,
  MASSES,
  schwarzschildRadius,
  secondsLostPerDay,
  surfaceCompactness,
  type MassId,
} from './gravity'
import { appleG, useSpacetime, type SpacetimeView } from './spacetimeStore'
import './spacetime.css'

const VIEWS: [SpacetimeView, I18nKey][] = [
  ['grid', 'spacetime.view.grid'],
  ['apple', 'spacetime.view.apple'],
  ['orbits', 'spacetime.view.orbits'],
]

const BODY_KEYS: Record<MassId, I18nKey> = {
  earth: 'spacetime.body.earth',
  sun: 'spacetime.body.sun',
  neutron: 'spacetime.body.neutron',
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

function useNumber() {
  const lang = useLang((s) => s.lang)
  const locale = lang === 'mn' ? 'mn-MN' : 'en-US'
  const fixed = (n: number, digits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n)
  /** 4.6 × 10⁷ style, for numbers too big or small to write out. */
  const sci = (n: number, digits = 1) => {
    const exp = Math.floor(Math.log10(Math.abs(n)))
    const power = String(Math.abs(exp))
      .split('')
      .map((d) => SUPERSCRIPT[Number(d)])
      .join('')
    return `${fixed(n / 10 ** exp, digits)} × 10${exp < 0 ? '⁻' : ''}${power}`
  }
  return { fixed, sci }
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="hud-button st-toggle"
      data-active={on}
      aria-pressed={on}
      onClick={() => {
        play('click')
        onChange(!on)
      }}
    >
      {label}
    </button>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="st-fact">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

/** A duration per day in the most readable unit. */
function usePerDay() {
  const t = useT()
  const { fixed } = useNumber()
  return (s: number) => {
    if (s < 1e-3) return `${fixed(s * 1e6, 1)} µs`
    if (s < 1) return `${fixed(s * 1e3, 1)} ms`
    if (s < 120) return `${fixed(s, 1)} s`
    if (s < 7200) return `${fixed(s / 60, 1)} ${t('spacetime.unit.min')}`
    return `${fixed(s / 3600, 1)} ${t('spacetime.unit.hours')}`
  }
}

function GridTab() {
  const t = useT()
  const { fixed, sci } = useNumber()
  const perDay = usePerDay()
  const { body, massScale, flow, clocks, sheet, set } = useSpacetime()
  const b = MASSES[body]
  const mass = b.massKg * massScale
  const rs = schwarzschildRadius(mass)
  const { real, visual } = surfaceCompactness(body, massScale)
  const escape = escapeSpeed(mass, b.radiusM)
  return (
    <>
      <div className="st-switch">
        <button
          type="button"
          className="hud-button"
          data-active={!sheet}
          onClick={() => (play('click'), set({ sheet: false }))}
        >
          {t('spacetime.grid.volume')}
        </button>
        <button
          type="button"
          className="hud-button"
          data-active={sheet}
          onClick={() => (play('click'), set({ sheet: true }))}
        >
          {t('spacetime.grid.sheet')}
        </button>
      </div>
      <div className="st-bodies">
        {(Object.keys(MASSES) as MassId[]).map((id) => (
          <button
            key={id}
            type="button"
            className="hud-button"
            data-active={body === id}
            style={{ '--c': MASSES[id].color } as React.CSSProperties}
            onClick={() => (play('click'), set({ body: id }))}
          >
            {t(BODY_KEYS[id])}
          </button>
        ))}
      </div>
      <label className="slider-row">
        <span>
          {t('spacetime.grid.mass')} ×{fixed(massScale, 2)}
        </span>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.05}
          value={massScale}
          onChange={(e) => set({ massScale: Number(e.target.value) })}
        />
      </label>
      {sheet ? (
        <>
          <p className="panel-hint">{t('spacetime.sheet.intro')}</p>
          <ol className="st-flaws">
            <li>{t('spacetime.sheet.flawOn')}</li>
            <li>{t('spacetime.sheet.flawPull')}</li>
            <li>{t('spacetime.sheet.flawTime')}</li>
          </ol>
          <button
            type="button"
            className="hud-button hud-button--wide"
            onClick={() => (play('click'), set({ sheet: false }))}
          >
            {t('spacetime.sheet.toReal')} →
          </button>
        </>
      ) : (
        <>
          <div className="st-facts">
            <Fact
              label={t('spacetime.fact.rs')}
              value={rs < 1 ? `${fixed(rs * 1000, 1)} mm` : `${fixed(rs / 1000, 2)} km`}
            />
            <Fact
              label={t('spacetime.fact.escape')}
              value={`${fixed(escape / 1000, escape > 1e6 ? 0 : 1)} km/s${escape > 1e6 ? ` (${fixed(escape / C, 2)} c)` : ''}`}
            />
            <Fact label={t('spacetime.fact.clockLag')} value={perDay(secondsLostPerDay(real))} />
            <Fact
              label={t('spacetime.fact.exaggeration')}
              value={visual / real < 1.001 ? t('spacetime.fact.true') : `×${sci(visual / real)}`}
            />
          </div>
          <div className="st-toggles">
            <Toggle on={flow} label={t('spacetime.show.flow')} onChange={(v) => set({ flow: v })} />
            <Toggle on={clocks} label={t('spacetime.show.clocks')} onChange={(v) => set({ clocks: v })} />
          </div>
          <div className="st-legend">
            <span style={{ '--c': '#5ee7ff' } as React.CSSProperties}>{t('spacetime.grid.legendFar')}</span>
            <span style={{ '--c': '#ffb347' } as React.CSSProperties}>{t('spacetime.grid.legendNear')}</span>
          </div>
          <p className="panel-hint">{t('spacetime.grid.river')}</p>
          <p className="panel-hint">{t('spacetime.grid.clocks')}</p>
          <p className="panel-hint">{t('spacetime.grid.controls')}</p>
        </>
      )}
    </>
  )
}

function AppleTab() {
  const t = useT()
  const { fixed, sci } = useNumber()
  const { apple, gScale, slowMo, set, drop, resetApple } = useSpacetime()
  const g = appleG(gScale)
  const impact = g * fallTime(DROP_HEIGHT, g)
  const deg = (rad: number) => (rad * 180) / Math.PI
  const falling = apple.t >= 0 && !apple.landed
  return (
    <>
      <div className="qn-row">
        <button
          type="button"
          className="hud-button"
          data-active={falling}
          disabled={apple.t >= 0}
          onClick={() => (play('click'), drop())}
        >
          {t('spacetime.apple.drop')}
        </button>
        <button type="button" className="hud-button" onClick={() => (play('click'), resetApple())}>
          {t('spacetime.apple.reset')}
        </button>
        <Toggle on={slowMo} label={t('spacetime.apple.slowMo')} onChange={(v) => set({ slowMo: v })} />
      </div>
      <label className="slider-row">
        <span>
          {t('spacetime.apple.gravity')} {fixed(g, 1)} m/s²
        </span>
        <input
          type="range"
          min={0.3}
          max={1.5}
          step={0.05}
          value={gScale}
          onChange={(e) => {
            set({ gScale: Number(e.target.value) })
            resetApple()
          }}
        />
      </label>
      <div className="st-facts">
        <Fact label={t('spacetime.apple.height')} value={`${fixed(Math.max(0, apple.height), 2)} m`} />
        <Fact label={t('spacetime.apple.angle')} value={`${fixed(deg(apple.angle), 1)}°`} />
        <Fact label={t('spacetime.apple.timeSpeed')} value={`${fixed(apple.timeSpeed, 2)} m/s`} />
        <Fact label={t('spacetime.apple.spaceSpeed')} value={`${fixed(apple.spaceSpeed, 2)} m/s`} />
      </div>
      <div className="st-legend">
        <span style={{ '--c': '#ffffff' } as React.CSSProperties}>{t('spacetime.apple.legendTotal')}</span>
        <span style={{ '--c': '#ffb347' } as React.CSSProperties}>{t('spacetime.apple.legendTime')}</span>
        <span style={{ '--c': '#5ee7ff' } as React.CSSProperties}>{t('spacetime.apple.legendSpace')}</span>
        <span style={{ '--c': '#ff6b5a' } as React.CSSProperties}>
          {t('spacetime.apple.legendWorldline')}
        </span>
      </div>
      <p className="panel-hint">
        {apple.t < 0
          ? t('spacetime.apple.hintRest')
          : apple.landed
            ? t('spacetime.apple.hintLanded')
            : t('spacetime.apple.hintFalling')}
      </p>
      <p className="panel-hint">
        {t('spacetime.apple.scaleNote').replace('{c}', String(DIAGRAM_C))}{' '}
        {t('spacetime.apple.realAngle').replace('{deg}', sci(deg(Math.asin(impact / C))))}
      </p>
    </>
  )
}

function OrbitsTab() {
  const t = useT()
  const { fixed } = useNumber()
  const { rays, orbit, newton, orbitSize, set } = useSpacetime()
  const measured = useMemo(() => measuredPrecession(1, orbitSize, 0.4), [orbitSize])
  const deg = (rad: number) => (rad * 180) / Math.PI
  return (
    <>
      <div className="st-toggles">
        <Toggle on={rays} label={t('spacetime.show.rays')} onChange={(v) => set({ rays: v })} />
        <Toggle on={orbit} label={t('spacetime.show.orbit')} onChange={(v) => set({ orbit: v })} />
        <Toggle on={newton} label={t('spacetime.show.newton')} onChange={(v) => set({ newton: v })} />
      </div>
      <label className="slider-row">
        <span>
          {t('spacetime.orbits.size')} {orbitSize} M
        </span>
        <input
          type="range"
          min={10}
          max={24}
          step={1}
          value={orbitSize}
          onChange={(e) => set({ orbitSize: Number(e.target.value) })}
        />
      </label>
      <div className="st-facts">
        <Fact label={t('spacetime.orbits.precession')} value={`${fixed(deg(measured), 1)}°`} />
        <Fact
          label={t('spacetime.orbits.estimate')}
          value={`${fixed(deg(precessionPerOrbit(1, orbitSize)), 1)}°`}
        />
        <Fact label={t('spacetime.orbits.mercury')} value={`${fixed(mercuryPrecessionArcsec(), 1)}″`} />
        <Fact label={t('spacetime.orbits.capture')} value={`b < ${fixed(CAPTURE_B, 2)} M`} />
        <Fact label={t('spacetime.orbits.isco')} value="6 M" />
      </div>
      <p className="panel-hint">{t('spacetime.orbits.hintOrbit')}</p>
      <p className="panel-hint">{t('spacetime.orbits.hintLight')}</p>
      <p className="panel-hint">{t('spacetime.orbits.units')}</p>
    </>
  )
}

export function SpacetimePanel() {
  const t = useT()
  const { view, set } = useSpacetime()
  return (
    <aside className="model-panel hud-panel st-panel" data-hud>
      <div className="hud-panel-head">
        <span className="hud-tag">{t('spacetime.title')}</span>
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
              set({ view: id })
            }}
          >
            {t(key)}
          </button>
        ))}
      </div>
      {view === 'grid' && <GridTab />}
      {view === 'apple' && <AppleTab />}
      {view === 'orbits' && <OrbitsTab />}
    </aside>
  )
}
