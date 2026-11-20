// The control panel's only way to change FlagMan. Every write goes through `write`, which runs
// checkWrite (allowlist.ts) first. Project and environment come from .env, never from the caller,
// and there is no call here that creates or deletes projects or flags.
import { ApiError, ENVIRONMENT, PROJECT_ID, request } from './api'
import { checkWrite, FLAGS, type FlagKey, type Rule, type Write } from './allowlist'

export type Config = { environment: string; enabled: boolean; rolloutPercentage: number }

const configPath = (flagKey: FlagKey) => `/projects/${PROJECT_ID}/flags/${flagKey}/configs/${ENVIRONMENT}`

export const readConfig = (flagKey: FlagKey) => request<Config>(configPath(flagKey))
export const readRules = (flagKey: FlagKey) => request<Rule[]>(configPath(flagKey) + '/rules')

export async function write(op: Write): Promise<void> {
  if (PROJECT_ID === null) throw new ApiError('Set VITE_FLAGMAN_PROJECT_ID in .env first.')
  const stored = op?.kind === 'deleteRule' && FLAGS.includes(op.flagKey) ? await readRules(op.flagKey) : []
  const refusal = checkWrite(op, stored)
  if (refusal) throw new ApiError(refusal)

  const path = configPath(op.flagKey)
  if (op.kind === 'config') await request(path, 'PATCH', op.change)
  else if (op.kind === 'createRule') await request(path + '/rules', 'POST', op.rule)
  else await request(`${path}/rules/${op.ruleId}`, 'DELETE')
}
