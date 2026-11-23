// The control panel's only way to change FlagMan. Every write goes through `write`, which runs
// checkWrite (allowlist.ts) first. Writes go to this browser's own sandbox with its token; FlagMan
// checks the same presets again on the server. There is no call here that creates or deletes flags.
import { ApiError, request } from './api'
import { checkWrite, FLAGS, type FlagKey, type Rule, type Write } from './allowlist'
import { getFlagState } from './flags'

export type Config = { environment: string; enabled: boolean; rolloutPercentage: number }

function sandbox() {
  const s = getFlagState().sandbox
  if (!s) throw new ApiError('FlagMan is still starting.')
  return s
}

const configPath = (flagKey: FlagKey) => {
  const s = sandbox()
  return `/projects/${s.projectId}/flags/${flagKey}/configs/${s.environment}`
}

export const readConfig = (flagKey: FlagKey) => request<Config>(configPath(flagKey))
export const readRules = (flagKey: FlagKey) => request<Rule[]>(configPath(flagKey) + '/rules')

export async function write(op: Write): Promise<void> {
  const stored = op?.kind === 'deleteRule' && FLAGS.includes(op.flagKey) ? await readRules(op.flagKey) : []
  const refusal = checkWrite(op, stored)
  if (refusal) throw new ApiError(refusal)

  const path = configPath(op.flagKey)
  const token = { 'X-Sandbox-Token': sandbox().token }
  if (op.kind === 'config') await request(path, 'PATCH', op.change, token)
  else if (op.kind === 'createRule') await request(path + '/rules', 'POST', op.rule, token)
  else await request(`${path}/rules/${op.ruleId}`, 'DELETE', undefined, token)
}
