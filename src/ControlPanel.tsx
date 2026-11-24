import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { readConfig, readRules, write, type Config } from './admin'
import { useFlagState } from './flags'
import { ServerStatus } from './ServerStatus'
import { FLAGS, PRESETS, presetFor, type FlagKey, type Preset, type Rule, type Write } from './allowlist'

const DESCRIPTIONS: Record<FlagKey, string> = {
  'dark-mode': 'Switches Book Logger to its dark theme.',
  'hide-non-fiction': 'Hides non-fiction from recommendations.',
}

export function ControlPanel() {
  const { sandbox, snapshot } = useFlagState()
  return (
    <aside className="cp" aria-labelledby="cp-title">
      <div className="cp__head">
        <h1 id="cp-title">Feature flag config</h1>
        <p className="small">Try it:</p>
        <ol className="cp__steps small">
          <li>Turn on <span className="mono">dark-mode</span>.</li>
          <li>Set Rollout to 30% and press Save. Only Ravi's device turns dark.</li>
          <li>Raise it to 100%, then tick a rule and watch who drops out.</li>
        </ol>
        <p className="muted small">
          These flags are your own copy{sandbox && <> (<span className="mono">{sandbox.environment}</span>)</>}. Only this
          browser sees your changes, and copies unused for a day are deleted.
        </p>
      </div>
      <ServerStatus className="server-status" />
      {sandbox && snapshot && FLAGS.map((f) => <FlagControls key={f} flagKey={f} />)}
    </aside>
  )
}

function FlagControls({ flagKey }: { flagKey: FlagKey }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [rollout, setRollout] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const storedRollout = useRef(0) // the rollout FlagMan had at the last read

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([readConfig(flagKey), readRules(flagKey)])
    setConfig(c)
    // Follow FlagMan's value only if the slider still shows the last stored one. A refresh that lands
    // while the visitor is moving the slider (on a hosted API that is ~0.3 s after any change) keeps their value.
    const previous = storedRollout.current
    storedRollout.current = c.rolloutPercentage
    setRollout((shown) => (shown === previous ? c.rolloutPercentage : shown))
    setRules(r)
  }, [flagKey])

  // Re-read whenever FlagMan announces a new revision, so changes made elsewhere (another tab,
  // the dashboard) show up here without a reload.
  const revision = useFlagState().snapshot?.revision
  useEffect(() => {
    load().catch((e: Error) => setError(e.message))
  }, [load, revision])

  // Runs the writes in order, then re-reads FlagMan so the panel shows what is stored.
  async function run(...ops: Write[]) {
    setBusy(true)
    setError(null)
    try {
      for (const op of ops) await write(op)
    } catch (e) {
      setError((e as Error).message)
    }
    await load().catch((e: Error) => setError(e.message))
    setBusy(false)
  }

  const others = rules.filter((r) => !presetFor(r)).length

  return (
    <section className="panel" aria-labelledby={`flag-${flagKey}`}>
      <div className="flag-head">
        <h2 id={`flag-${flagKey}`} className="mono">{flagKey}</h2>
        <span className={'status' + (config?.enabled ? ' status--on' : '')}>
          {config ? (config.enabled ? `On · ${config.rolloutPercentage}%` : 'Off') : '…'}
        </span>
      </div>
      <p className="muted small">{DESCRIPTIONS[flagKey]}</p>

      {config && (
        <div className="config">
          <div className="config__row">
            <span className="config__label" id={`enabled-${flagKey}`}>Enabled</span>
            <button
              type="button" role="switch" className="switch" aria-checked={config.enabled} aria-labelledby={`enabled-${flagKey}`}
              disabled={busy} onClick={() => run({ kind: 'config', flagKey, change: { enabled: !config.enabled } })}
            >
              <span className="switch__thumb" />
            </button>
          </div>

          <div className="config__row">
            <label className="config__label" htmlFor={`rollout-${flagKey}`}>Rollout</label>
            <div className="rollout">
              <input
                id={`rollout-${flagKey}`} type="range" min={0} max={100} value={rollout}
                onChange={(e) => setRollout(Number(e.target.value))}
                style={{ '--fill': `${rollout}%` } as CSSProperties}
              />
              <span className="rollout__value mono">{rollout}%</span>
              <button
                type="button" className="btn btn--primary btn--sm"
                disabled={busy || rollout === config.rolloutPercentage}
                onClick={() => run({ kind: 'config', flagKey, change: { rolloutPercentage: rollout } })}
              >
                Save
              </button>
            </div>
          </div>

          <fieldset className="presets" disabled={busy}>
            <legend className="config__label">Rules <span className="muted small">(all must match)</span></legend>
            {PRESETS.map((p) => (
              <PresetRow key={p.id} flagKey={flagKey} preset={p} rule={rules.find((r) => presetFor(r) === p)} run={run} />
            ))}
            {others > 0 && <p className="muted small">{others} other rule{others > 1 ? 's' : ''} on this config also {others > 1 ? 'apply' : 'applies'}.</p>}
          </fieldset>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}

function PresetRow({ flagKey, preset, rule, run }: {
  flagKey: FlagKey
  preset: Preset
  rule: Rule | undefined
  run: (...ops: Write[]) => void
}) {
  const [picked, setPicked] = useState<string>(preset.values[0])
  const value = rule?.value ?? picked
  const shape = (v: string) => ({ attribute: preset.attribute, operator: preset.operator, value: v })
  const id = `${flagKey}-${preset.id}`

  return (
    <div className="preset">
      <input
        id={id} type="checkbox" checked={rule !== undefined}
        onChange={(e) => e.target.checked
          ? run({ kind: 'createRule', flagKey, rule: shape(value) })
          : rule && run({ kind: 'deleteRule', flagKey, ruleId: rule.ruleId })}
      />
      <label htmlFor={id}>{preset.label}</label>
      <select
        aria-label={`${preset.label} (value)`} value={value}
        onChange={(e) => {
          setPicked(e.target.value)
          if (rule) run({ kind: 'deleteRule', flagKey, ruleId: rule.ruleId }, { kind: 'createRule', flagKey, rule: shape(e.target.value) })
        }}
      >
        {preset.values.map((v) => <option key={v} value={v}>{v.replace(',', ', ')}</option>)}
      </select>
    </div>
  )
}
