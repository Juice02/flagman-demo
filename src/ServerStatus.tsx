import { useEffect, useState } from 'react'
import { isUnreachable, startedAt, useFlagState } from './flags'

// Shown until the first snapshot arrives. A free server sleeps when idle and takes a while to wake, so
// count the seconds up (a countdown would hit zero before the server is ready).
export function ServerStatus({ className }: { className: string }) {
  const { snapshot, error } = useFlagState()
  const waiting = snapshot === null
  const [now, setNow] = useState(startedAt)

  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [waiting])

  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (!waiting || seconds < 2) return null
  if (error && !isUnreachable(error)) return <p className={className} role="alert">{error}</p>
  if (seconds > 120) return <p className={className} role="alert">FlagMan isn't responding. Try reloading in a minute.</p>
  return (
    <p className={className} role="status">
      <strong>Starting the FlagMan server… {seconds} s</strong>
      <span>The free server sleeps when nobody is using it. Waking it usually takes 30–60 seconds.</span>
    </p>
  )
}
