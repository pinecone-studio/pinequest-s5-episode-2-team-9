import { useEffect, useState } from 'react'
import { play } from '../audio/sfx'
import { useT, useTx, type I18nKey } from '../i18n'
import { useAtom, type AtomTab, type Particle, type SpinSetup } from './atomStore'
import { describeAtom, ELEMENTS } from './elements'
import { energyEv, orbitalName } from './orbitals'
import { experimentStats } from './experimentStats'
import { band, rgbCss, SERIES, wavelengthToRgb } from './spectrum'

const TABS: [AtomTab, I18nKey][] = [
  ['build', 'atoms.tab.build'],
  ['orbitals', 'atoms.tab.orbitals'],
  ['light', 'atoms.tab.light'],
  ['experiments', 'atoms.tab.experiments'],
]

function Counter({ kind, value, label }: { kind: Particle; value: number; label: string }) {
  const add = useAtom((s) => s.add)
  return (
    <div className={`counter counter--${kind}`}>
      <span>{label}</span>
      <button
        type="button"
        className="hud-button"
        onClick={() => (add(kind, -1), play('click'))}
        aria-label={`− ${label}`}
      >
        −
      </button>
      <b>{value}</b>
      <button
        type="button"
        className="hud-button"
        onClick={() => (add(kind, 1), play('click'))}
        aria-label={`+ ${label}`}
      >
        +
      </button>
    </div>
  )
}

function BuildTab() {
  const t = useT()
  const tx = useTx()
  const { protons, neutrons, electrons } = useAtom()
  const atom = describeAtom(protons, neutrons, electrons)
  const name = atom.element ? tx(`atoms.element.${atom.element.symbol}`) : t('atoms.noElement')
  const charge =
    atom.charge === 0
      ? t('atoms.neutral')
      : `${t('atoms.ion')} ${Math.abs(atom.charge)}${atom.charge > 0 ? '+' : '−'}`
  return (
    <>
      <div className="element-card">
        <div className="element-symbol">
          <small>{protons}</small>
          <strong>{atom.element?.symbol ?? '–'}</strong>
          <small>{atom.massNumber}</small>
        </div>
        <div>
          <h2>{atom.element ? `${name}-${atom.massNumber}` : name}</h2>
          <p>{charge}</p>
          <span className={`badge badge--${atom.stability}`}>
            {atom.stability === 'stable'
              ? t('atoms.stable')
              : atom.stability === 'unstable'
                ? t('atoms.unstable')
                : '—'}
          </span>
        </div>
      </div>
      <Counter kind="proton" value={protons} label={t('atoms.protons')} />
      <Counter kind="neutron" value={neutrons} label={t('atoms.neutrons')} />
      <Counter kind="electron" value={electrons} label={t('atoms.electrons')} />
      <div className="mini-table" aria-hidden="true">
        {ELEMENTS.map((e) => (
          <span key={e.z} style={{ gridColumn: e.group, gridRow: e.period }} data-active={e.z === protons}>
            {e.symbol}
          </span>
        ))}
      </div>
      <p className="panel-hint">{t('atoms.buildHint')}</p>
      <p className="panel-hint">{t('atoms.buildFact')}</p>
    </>
  )
}

function OrbitalsTab() {
  const t = useT()
  const { orbital, setOrbital } = useAtom()
  const { n, l, m } = orbital
  return (
    <>
      <h2 className="orbital-name">{orbitalName(orbital)}</h2>
      <p className="panel-hint">
        {t('atoms.energy')}: {energyEv(n).toFixed(2)} eV · {t('atoms.radialNodes')}: {n - l - 1} ·{' '}
        {t('atoms.angularNodes')}: {l}
      </p>
      <div className="qn-row">
        <span>n</span>
        {[1, 2, 3, 4].map((v) => (
          <button
            key={v}
            type="button"
            className="hud-button"
            data-active={v === n}
            onClick={() => setOrbital({ n: v })}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="qn-row">
        <span>l</span>
        {['s', 'p', 'd', 'f'].map((label, v) => (
          <button
            key={label}
            type="button"
            className="hud-button"
            data-active={v === l}
            disabled={v >= n}
            onClick={() => setOrbital({ l: v, m: 0 })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="qn-row">
        <span>m</span>
        {Array.from({ length: 2 * l + 1 }, (_, i) => i - l).map((v) => (
          <button
            key={v}
            type="button"
            className="hud-button"
            data-active={v === m}
            onClick={() => setOrbital({ m: v })}
          >
            {v}
          </button>
        ))}
      </div>
      <p className="panel-hint">{t('atoms.orbitalHint')}</p>
      <p className="panel-hint">{t('atoms.orbitalFact')}</p>
    </>
  )
}

function Spectrum() {
  const all = useAtom((s) => s.photons)
  const photons = all.filter((p) => p.kind === 'emitted')
  return (
    <div className="spectrum">
      <div className="spectrum-band" />
      {photons.map((p) => {
        const b = band(p.nm)
        const left = b === 'ultraviolet' ? 0 : b === 'infrared' ? 100 : ((p.nm - 380) / (750 - 380)) * 100
        return (
          <i
            key={p.id}
            style={{ left: `${left}%`, background: rgbCss(wavelengthToRgb(p.nm)) }}
            data-band={b}
          />
        )
      })}
      <span className="spectrum-label spectrum-label--left">UV</span>
      <span className="spectrum-label spectrum-label--right">IR</span>
    </div>
  )
}

function LightTab() {
  const t = useT()
  const { level, target, photons, excite } = useAtom()
  const last = photons[photons.length - 1]
  return (
    <>
      <p className="panel-hint">
        {t('atoms.level')}: n = {target ?? level} · {energyEv(target ?? level).toFixed(2)} eV
      </p>
      <div className="qn-row">
        <span>↑</span>
        {[2, 3, 4, 5, 6].map((v) => (
          <button
            key={v}
            type="button"
            className="hud-button"
            disabled={v <= level || target !== null}
            onClick={() => excite(v)}
          >
            n={v}
          </button>
        ))}
      </div>
      <Spectrum />
      {last && (
        <div className="photon-card">
          <i style={{ background: rgbCss(wavelengthToRgb(last.nm)) }} />
          <span>
            {last.kind === 'emitted' ? t('atoms.emitted') : t('atoms.absorbed')} · {last.from}→{last.to} ·{' '}
            {last.nm.toFixed(0)} nm · {t(`atoms.band.${band(last.nm)}` as I18nKey)}
            {last.kind === 'emitted' && SERIES[last.to] ? ` · ${SERIES[last.to]}` : ''}
          </span>
        </div>
      )}
      <p className="panel-hint">{t('atoms.lightHint')}</p>
      <p className="panel-hint">{t('atoms.lightFact')}</p>
    </>
  )
}

const SETUPS: [SpinSetup, string][] = [
  ['z', 'Z'],
  ['zz', 'Z → Z'],
  ['zx', 'Z → X'],
  ['zxz', 'Z → X → Z'],
]

function ExperimentsTab() {
  const t = useT()
  const { experiment, observed, slitWavelength, slitSeparation, rate, spinSetup, set, clearToken } = useAtom()
  const [stats, setStats] = useState({ ...experimentStats })
  useEffect(() => {
    const id = window.setInterval(() => setStats({ ...experimentStats }), 300)
    return () => window.clearInterval(id)
  }, [])
  return (
    <>
      <div className="qn-row">
        <button
          type="button"
          className="hud-button"
          data-active={experiment === 'slit'}
          onClick={() => set({ experiment: 'slit' })}
        >
          {t('atoms.slit')}
        </button>
        <button
          type="button"
          className="hud-button"
          data-active={experiment === 'spin'}
          onClick={() => set({ experiment: 'spin' })}
        >
          {t('atoms.spin')}
        </button>
      </div>
      {experiment === 'slit' ? (
        <>
          <button
            type="button"
            className="settings-row"
            aria-pressed={observed}
            onClick={() => set({ observed: !observed })}
          >
            <strong>
              {t('atoms.observe')} <em className="switch" data-on={observed} />
            </strong>
            <span>{t('atoms.observeHint')}</span>
          </button>
          <label className="slider-row">
            <span>{t('atoms.wavelength')}</span>
            <input
              type="range"
              min={0.6}
              max={2}
              step={0.05}
              value={slitWavelength}
              onChange={(e) => set({ slitWavelength: Number(e.target.value) })}
            />
          </label>
          <label className="slider-row">
            <span>{t('atoms.separation')}</span>
            <input
              type="range"
              min={3}
              max={10}
              step={0.5}
              value={slitSeparation}
              onChange={(e) => set({ slitSeparation: Number(e.target.value) })}
            />
          </label>
          <p className="panel-hint">{observed ? t('atoms.slitObservedHint') : t('atoms.slitHint')}</p>
        </>
      ) : (
        <>
          <div className="qn-row">
            {SETUPS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="hud-button"
                data-active={spinSetup === id}
                onClick={() => set({ spinSetup: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="spin-stats">
            <span>↑ {stats.up}</span>
            <span>↓ {stats.down}</span>
            <span>
              {t('atoms.blocked')} {stats.total - stats.up - stats.down}
            </span>
          </div>
          <p className="panel-hint">{t(`atoms.spinHint.${spinSetup}` as I18nKey)}</p>
        </>
      )}
      <label className="slider-row">
        <span>{t('atoms.rate')}</span>
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={rate}
          onChange={(e) => set({ rate: Number(e.target.value) })}
        />
      </label>
      <button
        type="button"
        className="hud-button hud-button--wide"
        onClick={() => set({ clearToken: clearToken + 1 })}
      >
        {t('atoms.clear')}
      </button>
    </>
  )
}

export function AtomPanel() {
  const t = useT()
  const tab = useAtom((s) => s.tab)
  const set = useAtom((s) => s.set)
  return (
    <aside className="model-panel hud-panel" data-hud>
      <div className="hud-panel-head">
        <span className="hud-tag">{t('atoms.title')}</span>
      </div>
      <div className="tabs">
        {TABS.map(([id, key]) => (
          <button
            key={id}
            type="button"
            className="hud-button"
            data-active={tab === id}
            onClick={() => {
              play('click')
              set({ tab: id })
            }}
          >
            {t(key)}
          </button>
        ))}
      </div>
      {tab === 'build' && <BuildTab />}
      {tab === 'orbitals' && <OrbitalsTab />}
      {tab === 'light' && <LightTab />}
      {tab === 'experiments' && <ExperimentsTab />}
    </aside>
  )
}
