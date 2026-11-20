import { useEffect, useState } from 'react'
import { ENVIRONMENT, PROJECT_ID, request } from './api'
import type { User } from './allowlist'

export type FlagResult = { enabled: boolean; reason: string }

export const evaluate = (flagKey: string, user: User) =>
  request<FlagResult>('/evaluate', 'POST', {
    projectId: PROJECT_ID, flagKey, environment: ENVIRONMENT, userId: user.id, attributes: user.attributes,
  })

export const isEnabled = async (flagKey: string, user: User) => (await evaluate(flagKey, user)).enabled

// Polls every 2 s while the tab is visible. A failed call keeps the last result and sets `error`.
// shortcut: polling, one request per flag per device; switch to streaming or a shared batch call for a public demo.
export function useFlag(flagKey: string, user: User) {
  const [state, setState] = useState<{ enabled: boolean; reason: string | null; error: string | null }>({
    enabled: false, reason: null, error: null,
  })
  const { id, attributes: { country, plan } } = user

  useEffect(() => {
    let alive = true
    const poll = () => {
      if (document.hidden) return
      evaluate(flagKey, { id, attributes: { country, plan } }).then(
        (r) => alive && setState({ enabled: r.enabled === true, reason: r.reason, error: null }),
        (e: Error) => alive && setState((s) => ({ ...s, error: e.message })),
      )
    }
    poll()
    const timer = setInterval(poll, 2000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [flagKey, id, country, plan])

  return state
}
