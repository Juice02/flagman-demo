// Self-check for the write guard and the device URL parser: npm test (plain Node, no test library).
import assert from 'node:assert/strict'
import { checkWrite, userFromParams, type Write } from '../src/allowlist.ts'

const refused = (op: unknown, rules: { ruleId: number; attribute: string; operator: string; value: string }[] = []) =>
  checkWrite(op as Write, rules) !== null

// Allowed
assert.equal(checkWrite({ kind: 'config', flagKey: 'dark-mode', change: { enabled: true, rolloutPercentage: 60 } }), null)
assert.equal(checkWrite({ kind: 'createRule', flagKey: 'dark-mode', rule: { attribute: 'country', operator: 'NOT_EQUALS', value: 'US' } }), null)
assert.equal(checkWrite({ kind: 'createRule', flagKey: 'hide-non-fiction', rule: { attribute: 'country', operator: 'IN', value: 'IN,GB' } }), null)
assert.equal(checkWrite({ kind: 'deleteRule', flagKey: 'dark-mode', ruleId: 7 }, [{ ruleId: 7, attribute: 'plan', operator: 'EQUALS', value: 'pro' }]), null)

// Refused
assert.ok(refused({ kind: 'config', flagKey: 'other-flag', change: { enabled: true } }))
assert.ok(refused({ kind: 'config', flagKey: 'dark-mode', change: { rolloutPercentage: 101 } }))
assert.ok(refused({ kind: 'config', flagKey: 'dark-mode', change: { rolloutPercentage: 50.5 } }))
assert.ok(refused({ kind: 'config', flagKey: 'dark-mode', change: { enabled: 'yes' } }))
assert.ok(refused({ kind: 'config', flagKey: 'dark-mode', change: { enabled: true, environment: 'PROD' } }))
assert.ok(refused({ kind: 'config', flagKey: 'dark-mode', change: {} }))
assert.ok(refused({ kind: 'createRule', flagKey: 'dark-mode', rule: { attribute: 'email', operator: 'CONTAINS', value: '@x.com' } }))
assert.ok(refused({ kind: 'createRule', flagKey: 'dark-mode', rule: { attribute: 'country', operator: 'NOT_EQUALS', value: 'FR' } }))
assert.ok(refused({ kind: 'createRule', flagKey: 'dark-mode', rule: { attribute: 'country', operator: 'not_equals', value: 'US' } }))
assert.ok(refused({ kind: 'createRule', flagKey: 'dark-mode', rule: { attribute: 'country', operator: 'IN', value: 'IN,GB', extra: 1 } }))
assert.ok(refused({ kind: 'deleteRule', flagKey: 'dark-mode', ruleId: 9 }, [{ ruleId: 9, attribute: 'email', operator: 'CONTAINS', value: '@x.com' }]))
assert.ok(refused({ kind: 'deleteRule', flagKey: 'dark-mode', ruleId: 8 }, []))
assert.ok(refused({ kind: 'deleteRule', flagKey: 'dark-mode', ruleId: '7' }, [{ ruleId: 7, attribute: 'plan', operator: 'EQUALS', value: 'pro' }]))
assert.ok(refused({ kind: 'createProject', flagKey: 'dark-mode' }))
assert.ok(refused(null))

// Device URLs
assert.deepEqual(userFromParams(new URLSearchParams('user=noah&country=GB&plan=free')), { id: 'noah', attributes: { country: 'GB', plan: 'free' } })
assert.deepEqual(userFromParams(new URLSearchParams('user=mallory&country=<script>&plan=x')), { id: 'ravi', attributes: { country: 'IN', plan: 'pro' } })
assert.deepEqual(userFromParams(new URLSearchParams('user=priya&country=<script>')), { id: 'priya', attributes: { country: 'GB', plan: 'free' } })

console.log('allowlist checks passed')
