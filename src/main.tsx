import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './stage.css'
import { USERS, FLAGS, type User } from './allowlist'
import { ControlPanel } from './ControlPanel'
import { useFlag } from './flags'

const DEVICES: { kind: 'laptop' | 'phone'; user: User }[] = [
  { kind: 'laptop', user: USERS[0] },
  { kind: 'phone', user: USERS[1] },
  { kind: 'phone', user: USERS[2] },
]

function Stage() {
  return (
    <>
      <header className="topbar">
        <span className="brand"><span className="brand__mark" aria-hidden="true" />FlagMan</span>
        <p className="topbar__note">Change a flag in the feature flag config. FlagMan pushes the change and each device updates straight away.</p>
      </header>
      <main className="stage">
        <ControlPanel />
        <section className="devices" aria-label="Devices">
          {DEVICES.map((d) => <Device key={d.user.id} {...d} />)}
        </section>
      </main>
    </>
  )
}

function Device({ kind, user }: { kind: 'laptop' | 'phone'; user: User }) {
  // Only this app's own page is ever embedded, built from the fixed demo users.
  const src = '/app.html?' + new URLSearchParams({ user: user.id, ...user.attributes })
  return (
    <figure className={`device device--${kind}`}>
      <div className="device__frame">
        <div className="device__screen">
          <iframe src={src} title={`Book Logger as ${user.id} on a ${kind}`} />
        </div>
      </div>
      <figcaption className="device__info">
        <p><span className="mono">{user.id}</span> <span className="muted small">country {user.attributes.country} · plan {user.attributes.plan}</span></p>
        <ul>{FLAGS.map((f) => <FlagLine key={f} flagKey={f} user={user} />)}</ul>
      </figcaption>
    </figure>
  )
}

function FlagLine({ flagKey, user }: { flagKey: string; user: User }) {
  const { enabled, reason, error } = useFlag(flagKey, user)
  return (
    <li className="flag-line">
      <span className={'status' + (enabled ? ' status--on' : '')}>{flagKey}</span>
      <span className="mono small muted">{reason ?? '…'}</span>
      {error && <span className="error small">{error}</span>}
    </li>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Stage /></StrictMode>)
