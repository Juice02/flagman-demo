// Everything the demo may show or change, in one file. The write guard (admin.ts) and the device
// URL parser (userFromParams) accept only what is listed here and refuse or replace anything else.
// No React and no import.meta here, so scripts/allowlist.test.ts can run it in plain Node.

export const FLAGS = ['dark-mode', 'hide-non-fiction'] as const
export type FlagKey = (typeof FLAGS)[number]

export const COUNTRIES = ['US', 'IN', 'GB'] as const
export const PLANS = ['pro', 'free'] as const

export type User = { id: string; attributes: { country: string; plan: string } }

// Buckets (CRC32(flagKey:userId) % 100): ravi 1 / 10, priya 58 / 52, noah 88 / 91 for dark-mode / hide-non-fiction.
export const USERS: readonly User[] = [
  { id: 'ravi', attributes: { country: 'IN', plan: 'pro' } },
  { id: 'priya', attributes: { country: 'GB', plan: 'free' } },
  { id: 'noah', attributes: { country: 'US', plan: 'pro' } },
]

export const PRESETS = [
  { id: 'country-not', label: 'Country is not', attribute: 'country', operator: 'NOT_EQUALS', values: ['US', 'IN', 'GB'] },
  { id: 'country-in', label: 'Country is one of', attribute: 'country', operator: 'IN', values: ['IN,GB', 'IN', 'GB', 'US'] },
  { id: 'plan', label: 'Plan equals', attribute: 'plan', operator: 'EQUALS', values: ['pro', 'free'] },
] as const
export type Preset = (typeof PRESETS)[number]

export type RuleShape = { attribute: string; operator: string; value: string }
export type Rule = RuleShape & { ruleId: number }

// The preset a rule belongs to, or undefined if the rule isn't in the allowlist.
export const presetFor = (rule: RuleShape): Preset | undefined =>
  PRESETS.find((p) => p.attribute === rule.attribute && p.operator === rule.operator && (p.values as readonly string[]).includes(rule.value))

export type Write =
  | { kind: 'config'; flagKey: FlagKey; change: { enabled?: boolean; rolloutPercentage?: number } }
  | { kind: 'createRule'; flagKey: FlagKey; rule: RuleShape }
  | { kind: 'deleteRule'; flagKey: FlagKey; ruleId: number }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const onlyKeys = (o: object, keys: string[]) => Object.keys(o).every((k) => keys.includes(k))

// Returns why a write is refused, or null if it is allowed. Checked at runtime, because types are gone
// in the browser and a bug or a console call can pass anything. `currentRules` are the rules on that
// config as FlagMan returns them, so a delete is judged by the stored rule, not by what the caller claims.
export function checkWrite(op: Write, currentRules: readonly Rule[] = []): string | null {
  if (!isObject(op) || !(FLAGS as readonly unknown[]).includes(op.flagKey)) return 'Only the two demo flags can be changed.'
  switch (op.kind) {
    case 'config': {
      const c: unknown = op.change
      const ok = isObject(c) && Object.keys(c).length > 0 && onlyKeys(c, ['enabled', 'rolloutPercentage'])
        && (c.enabled === undefined || typeof c.enabled === 'boolean')
        && (c.rolloutPercentage === undefined || (Number.isInteger(c.rolloutPercentage) && (c.rolloutPercentage as number) >= 0 && (c.rolloutPercentage as number) <= 100))
      return ok ? null : 'Only on/off and a whole-number rollout from 0 to 100 can be changed.'
    }
    case 'createRule': {
      const r: unknown = op.rule
      const ok = isObject(r) && onlyKeys(r, ['attribute', 'operator', 'value']) && presetFor(r as RuleShape) !== undefined
      return ok ? null : 'Only the preset rules can be added.'
    }
    case 'deleteRule': {
      const stored = currentRules.find((r) => r.ruleId === op.ruleId)
      return stored && presetFor(stored) ? null : 'Only preset rules can be removed.'
    }
    default:
      return 'Unknown change.'
  }
}

// Device URLs are untrusted: unknown users fall back to the first demo user, unknown values to that user's own.
export function userFromParams(params: URLSearchParams): User {
  const base = USERS.find((u) => u.id === params.get('user')) ?? USERS[0]
  const pick = (list: readonly string[], value: string | null, fallback: string) => (value !== null && list.includes(value) ? value : fallback)
  return {
    id: base.id,
    attributes: {
      country: pick(COUNTRIES, params.get('country'), base.attributes.country),
      plan: pick(PLANS, params.get('plan'), base.attributes.plan),
    },
  }
}
