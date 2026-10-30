import { useEffect, useMemo, useState } from 'react'
import { play } from '../audio/sfx'
import { useLang, useT, type I18nKey } from '../i18n'
import { PanelHideButton } from '../lab/panels/PanelToggle'
import { lorentzLive, useEm, type EmView, type LorentzPreset } from './emStore'
import { PROBE_RANGE, probeField, SCENE_M, type Source } from './fields'
import { equatorTargets, linkingNumber, preimage } from './hopfion'
import { driftVelocity, gyroPeriod, gyroradius, startVelocity, vPerp } from './lorentz'
import { EM_COLORS } from './colors'
import { length } from './vec'
import './em.css'

const VIEWS: [EmView, I18nKey][] = [
  ['current', 'electromagnetism.view.current'],
  ['lorentz', 'electromagnetism.view.lorentz'],
  ['hopfion', 'electromagnetism.view.hopfion'],
]

const SOURCES: [Source, I18nKey][] = [
  ['wire', 'electromagnetism.source.wire'],
  ['loop', 'electromagnetism.source.loop'],
  ['solenoid', 'electromagnetism.source.solenoid'],
]

const FORMULAS: Record<Source, [I18nKey, string]> = {
  wire: ['electromagnetism.formula.wire', 'B = μ₀I / 2πr'],
  loop: ['electromagnetism.formula.loop', 'B = μ₀IR² / 2(R² + z²)^3/2'],
  solenoid: ['electromagnetism.formula.solenoid', 'B = ½μ₀nI (cos α₁ + cos α₂)'],
}

const PRESETS: [LorentzPreset, I18nKey][] = [
  ['circle', 'electromagnetism.preset.circle'],
  ['helix', 'electromagnetism.preset.helix'],
  ['drift', 'electromagnetism.preset.drift'],
  ['parallel', 'electromagnetism.preset.parallel'],
]

/** Earth's magnetic field at the surface, roughly (μT). */
const EARTH_UT = 50

function useNumber() {
  const lang = useLang((s) => s.lang)
  return (n: number, digits = 0) =>
    new Intl.NumberFormat(lang === 'mn' ? 'mn-MN' : 'en-US', {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(n)
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="hud-button em-toggle"
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
    <div className="em-fact">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="em-legend">
      {items.map(([color, label]) => (
        <span key={label} style={{ '--c': color } as React.CSSProperties}>
          {label}
        </span>
      ))}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function CurrentTab() {
  const t = useT()
  const num = useNumber()
  const { source, amps, probe, fieldLines, carriers, handRule, labels, set } = useEm()
  const { b, textbook } = useMemo(() => probeField(source, amps, probe), [source, amps, probe])
  const uT = (tesla: number) => {
    const v = tesla * 1e6
    return `${num(v, v < 10 ? 2 : 1)} ${t('electromagnetism.unit.uT')}`
  }
  const cm = `${num(probe * SCENE_M * 100, 1)} ${t('electromagnetism.unit.cm')}`
  const [range0, range1] = PROBE_RANGE[source]
  const [formulaKey, formulaText] = FORMULAS[source]
  return (
    <>
      <div className="qn-row em-row">
        {SOURCES.map(([id, key]) => (
          <button
            key={id}
            type="button"
            className="hud-button"
            data-active={source === id}
            onClick={() => {
              play('click')
              set({ source: id, probe: id === 'wire' ? 0.5 : 0 })
            }}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <Slider
        label={`${t('electromagnetism.current.amps')}: ${num(amps, 1)} A`}
        value={amps}
        min={-20}
        max={20}
        step={0.5}
        onChange={(v) => set({ amps: v })}
      />
      <div className="qn-row em-row">
        <button
          type="button"
          className="hud-button"
          onClick={() => {
            play('click')
            set({ amps: amps === 0 ? 10 : -amps })
          }}
        >
          ⇅ {t('electromagnetism.current.reverse')}
        </button>
        <button
          type="button"
          className="hud-button"
          disabled={amps === 0}
          onClick={() => {
            play('click')
            set({ amps: 0 })
          }}
        >
          {t('electromagnetism.current.off')}
        </button>
      </div>
      <Slider
        label={`${t(source === 'wire' ? 'electromagnetism.current.probeWire' : 'electromagnetism.current.probeAxis')}: ${cm}`}
        value={probe}
        min={range0}
        max={range1}
        step={0.02}
        onChange={(v) => set({ probe: v })}
      />
      <div className="em-formula">
        <span>{t(formulaKey)}</span>
        <code>{formulaText}</code>
      </div>
      <div className="em-facts">
        <Fact label={t('electromagnetism.current.numeric')} value={uT(length(b))} />
        <Fact label={t('electromagnetism.current.textbook')} value={uT(textbook)} />
        <Fact
          label={t('electromagnetism.current.earth')}
          value={`${num((length(b) * 1e6) / EARTH_UT, 2)} ×`}
        />
      </div>
      <div className="em-toggles">
        <Toggle
          on={fieldLines}
          label={t('electromagnetism.show.fieldLines')}
          onChange={(v) => set({ fieldLines: v })}
        />
        <Toggle
          on={carriers}
          label={t('electromagnetism.show.electrons')}
          onChange={(v) => set({ carriers: v })}
        />
        <Toggle
          on={handRule}
          label={t('electromagnetism.show.handRule')}
          onChange={(v) => set({ handRule: v })}
        />
        <Toggle on={labels} label={t('electromagnetism.show.labels')} onChange={(v) => set({ labels: v })} />
      </div>
      <Legend
        items={[
          [EM_COLORS.current, t('electromagnetism.legend.current')],
          [EM_COLORS.electron, t('electromagnetism.legend.electrons')],
          [EM_COLORS.fieldStrong, t('electromagnetism.legend.field')],
          [EM_COLORS.probe, t('electromagnetism.legend.probe')],
        ]}
      />
      <p className="panel-hint">{t('electromagnetism.current.hint')}</p>
      <p className="panel-hint">{t('electromagnetism.current.fact')}</p>
    </>
  )
}

function LorentzTab() {
  const t = useT()
  const num = useNumber()
  const s = useEm()
  const { charge, b, e, eDir, speed, pitch, preset, playing, vectors, vbPlane, labels, set, setLorentz } = s
  const [live, setLive] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setLive(lorentzLive.speed), 200)
    return () => window.clearInterval(id)
  }, [])
  const params = { charge, b, e, eDir, speed, pitch }
  const v0 = startVelocity(params)
  const drift = length(driftVelocity(params))
  const fmt = (x: number, d = 2) => (Number.isFinite(x) ? num(x, d) : '∞')
  return (
    <>
      <div className="qn-row em-row em-row--4">
        {PRESETS.map(([id, key]) => (
          <button
            key={id}
            type="button"
            className="hud-button"
            data-active={preset === id}
            onClick={() => {
              play('click')
              s.applyPreset(id)
            }}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div className="qn-row em-row">
        <span className="em-row-label">{t('electromagnetism.lorentz.charge')}</span>
        {([1, -1] as const).map((q) => (
          <button
            key={q}
            type="button"
            className="hud-button em-charge"
            data-active={charge === q}
            style={{ '--c': q > 0 ? EM_COLORS.positive : EM_COLORS.negative } as React.CSSProperties}
            onClick={() => {
              play('click')
              // Keep the preset label: flipping the charge is part of every preset's story.
              set({ charge: q, resetToken: s.resetToken + 1 })
            }}
          >
            {q > 0 ? '+q' : '−q'}
          </button>
        ))}
      </div>
      <Slider
        label={`${t('electromagnetism.lorentz.b')}: ${num(b, 2)}`}
        value={b}
        min={0}
        max={3}
        step={0.05}
        onChange={(v) => setLorentz({ b: v })}
      />
      <Slider
        label={`${t('electromagnetism.lorentz.e')}: ${num(e, 2)}`}
        value={e}
        min={0}
        max={1.2}
        step={0.05}
        onChange={(v) => setLorentz({ e: v })}
      />
      <div className="qn-row em-row">
        {(['perp', 'para'] as const).map((d) => (
          <button
            key={d}
            type="button"
            className="hud-button"
            data-active={eDir === d}
            onClick={() => {
              play('click')
              setLorentz({ eDir: d })
            }}
          >
            {d === 'perp' ? 'E ⊥ B' : 'E ∥ B'}
          </button>
        ))}
      </div>
      <Slider
        label={`${t('electromagnetism.lorentz.speed')}: ${num(speed, 2)}`}
        value={speed}
        min={0}
        max={1.5}
        step={0.05}
        onChange={(v) => setLorentz({ speed: v })}
      />
      <Slider
        label={`${t('electromagnetism.lorentz.pitch')}: ${num(pitch)}°`}
        value={pitch}
        min={0}
        max={90}
        step={5}
        onChange={(v) => setLorentz({ pitch: v })}
      />
      <div className="qn-row em-row">
        <button
          type="button"
          className="hud-button"
          data-active={playing}
          onClick={() => {
            play('click')
            set({ playing: !playing })
          }}
        >
          {playing ? t('electromagnetism.lorentz.pause') : t('electromagnetism.lorentz.play')}
        </button>
        <button
          type="button"
          className="hud-button"
          onClick={() => {
            play('click')
            s.restart()
          }}
        >
          ↺ {t('electromagnetism.lorentz.restart')}
        </button>
      </div>
      <div className="em-formula">
        <span>{t('electromagnetism.lorentz.law')}</span>
        <code>F = q(E + v × B)</code>
      </div>
      <div className="em-facts">
        <Fact label={t('electromagnetism.lorentz.liveSpeed')} value={num(live, 3)} />
        <Fact label={t('electromagnetism.lorentz.radius')} value={fmt(gyroradius(vPerp(v0), b))} />
        <Fact label={t('electromagnetism.lorentz.period')} value={fmt(gyroPeriod(b))} />
        {eDir === 'perp' && e > 0 && b > 0 && (
          <Fact label={t('electromagnetism.lorentz.drift')} value={fmt(drift, 3)} />
        )}
      </div>
      <div className="em-toggles">
        <Toggle
          on={vectors}
          label={t('electromagnetism.show.vectors')}
          onChange={(v) => set({ vectors: v })}
        />
        <Toggle
          on={vbPlane}
          label={t('electromagnetism.show.vbPlane')}
          onChange={(v) => set({ vbPlane: v })}
        />
        <Toggle on={labels} label={t('electromagnetism.show.labels')} onChange={(v) => set({ labels: v })} />
      </div>
      <Legend
        items={[
          [EM_COLORS.velocity, t('electromagnetism.legend.velocity')],
          [EM_COLORS.magnetic, t('electromagnetism.legend.bField')],
          [EM_COLORS.force, t('electromagnetism.legend.force')],
          [EM_COLORS.electric, t('electromagnetism.legend.qE')],
          [EM_COLORS.magneticForce, t('electromagnetism.legend.qvB')],
        ]}
      />
      <p className="panel-hint">{t(`electromagnetism.lorentz.explain.${preset ?? 'custom'}` as I18nKey)}</p>
      <p className="panel-hint">{t('electromagnetism.lorentz.fact')}</p>
      <p className="panel-hint em-note">{t('electromagnetism.lorentz.units')}</p>
    </>
  )
}

function HopfionTab() {
  const t = useT()
  const num = useNumber()
  const { hopfMode, slice, preimages, torus, background, precess, labels, set } = useEm()
  // Measured, not assumed: the Gauss linking integral of two of the drawn loops.
  const linking = useMemo(() => {
    const [a, b] = equatorTargets(6)
    return linkingNumber(preimage(a, 160), preimage(b, 160))
  }, [])
  return (
    <>
      <div className="qn-row em-row">
        {(['volume', 'slice'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className="hud-button"
            data-active={hopfMode === m}
            onClick={() => {
              play('click')
              set({ hopfMode: m })
            }}
          >
            {t(m === 'volume' ? 'electromagnetism.hopf.volume' : 'electromagnetism.hopf.slice')}
          </button>
        ))}
      </div>
      {hopfMode === 'slice' && (
        <Slider
          label={`${t('electromagnetism.hopf.slicePos')}: ${num(slice, 2)}`}
          value={slice}
          min={-2}
          max={2}
          step={0.05}
          onChange={(v) => set({ slice: v })}
        />
      )}
      <div className="em-facts">
        <Fact label={t('electromagnetism.hopf.charge')} value="1" />
        <Fact label={t('electromagnetism.hopf.linking')} value={num(linking, 3)} />
      </div>
      <div className="em-toggles">
        <Toggle
          on={preimages}
          label={t('electromagnetism.show.preimages')}
          onChange={(v) => set({ preimages: v })}
        />
        <Toggle on={torus} label={t('electromagnetism.show.torus')} onChange={(v) => set({ torus: v })} />
        {hopfMode === 'volume' && (
          <Toggle
            on={background}
            label={t('electromagnetism.show.background')}
            onChange={(v) => set({ background: v })}
          />
        )}
        <Toggle
          on={precess}
          label={t('electromagnetism.show.precess')}
          onChange={(v) => set({ precess: v })}
        />
        <Toggle on={labels} label={t('electromagnetism.show.labels')} onChange={(v) => set({ labels: v })} />
      </div>
      <div className="em-spin-key">
        <i className="em-wheel" aria-hidden="true" />
        <div>
          <span>{t('electromagnetism.hopf.legendHue')}</span>
          <span>{t('electromagnetism.hopf.legendUp')}</span>
          <span>{t('electromagnetism.hopf.legendDown')}</span>
        </div>
      </div>
      <p className="panel-hint">{t('electromagnetism.hopf.hint')}</p>
      <p className="panel-hint">{t('electromagnetism.hopf.fact')}</p>
    </>
  )
}

export function EmPanel() {
  const t = useT()
  const view = useEm((s) => s.view)
  const set = useEm((s) => s.set)
  return (
    <aside className="model-panel hud-panel em-panel" data-hud>
      <div className="hud-panel-head">
        <span className="hud-tag">{t('electromagnetism.title')}</span>
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
      {view === 'current' && <CurrentTab />}
      {view === 'lorentz' && <LorentzTab />}
      {view === 'hopfion' && <HopfionTab />}
    </aside>
  )
}
