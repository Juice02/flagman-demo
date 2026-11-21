// Flag evaluation in the browser: a copy of FlagMan's Evaluator.java. Both are tested against the same
// cases (scripts/evaluation-cases.json, copied from flagman/src/test/resources), so they give the same answer.
// No React and no import.meta here, so plain Node can run the tests.

export type RuleState = { attribute: string; operator: string; value: string }
export type FlagState = { flagKey: string; enabled: boolean; rolloutPercentage: number; rules: RuleState[] }
export type Snapshot = { projectId: number; environment: string; revision: number; flags: FlagState[] }
export type Reason = 'FLAG_DISABLED' | 'RULES_NOT_MATCHED' | 'IN_ROLLOUT' | 'OUT_OF_ROLLOUT'
export type FlagResult = { enabled: boolean; reason: Reason }

// Order: flag disabled -> rules (all must match) -> percentage rollout among the users who matched.
export function evaluate(flag: FlagState, userId: string, attributes: Record<string, string>): FlagResult {
  if (!flag.enabled) return { enabled: false, reason: 'FLAG_DISABLED' }
  for (const rule of flag.rules) {
    if (!matches(rule, attributes[rule.attribute])) return { enabled: false, reason: 'RULES_NOT_MATCHED' }
  }
  const enabled = bucket(flag.flagKey, userId) < flag.rolloutPercentage
  return { enabled, reason: enabled ? 'IN_ROLLOUT' : 'OUT_OF_ROLLOUT' }
}

// Fails closed: a missing attribute or an unknown operator never matches. Values are case-sensitive.
function matches(rule: RuleState, actual: string | undefined): boolean {
  if (actual == null || rule.value == null || rule.operator == null) return false
  switch (rule.operator.toUpperCase()) {
    case 'EQUALS': return actual === rule.value
    case 'NOT_EQUALS': return actual !== rule.value
    case 'IN': return rule.value.split(',').some((v) => v.trim() === actual)
    case 'CONTAINS': return actual.includes(rule.value)
    default: return false
  }
}

// CRC32 (IEEE) of the UTF-8 bytes, read unsigned like java.util.zip.CRC32, then % 100.
const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function bucket(flagKey: string, userId: string): number {
  let crc = 0xffffffff
  for (const byte of new TextEncoder().encode(flagKey + ':' + userId)) crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return ((crc ^ 0xffffffff) >>> 0) % 100
}

// Snapshots arrive from the network or from another window, so check the shape before trusting it.
export function isSnapshot(x: unknown): x is Snapshot {
  const o = x as Snapshot
  return typeof o === 'object' && o !== null && Number.isInteger(o.revision) && Array.isArray(o.flags)
    && o.flags.every((f) => typeof f === 'object' && f !== null && typeof f.flagKey === 'string'
      && typeof f.enabled === 'boolean' && Number.isInteger(f.rolloutPercentage) && Array.isArray(f.rules)
      && f.rules.every((r) => typeof r === 'object' && r !== null && typeof r.attribute === 'string'
        && typeof r.operator === 'string' && typeof r.value === 'string'))
}
