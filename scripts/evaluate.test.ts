// Runs the cases shared with FlagMan (EvaluatorTest.java) against the browser evaluator: npm test
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluate, isSnapshot } from '../src/evaluate.ts'

const cases = JSON.parse(readFileSync(new URL('./evaluation-cases.json', import.meta.url), 'utf8'))
for (const c of cases) assert.deepEqual(evaluate(c.flag, c.userId, c.attributes), c.expected, c.name)

assert.ok(isSnapshot({ projectId: 1, environment: 'DEV', revision: 3, flags: [cases[0].flag] }))
assert.ok(!isSnapshot({ revision: 3, flags: [{ flagKey: 'x', enabled: 'yes', rolloutPercentage: 1, rules: [] }] }))
assert.ok(!isSnapshot({ revision: 3, flags: [{ flagKey: 'x', enabled: true, rolloutPercentage: 1, rules: [{ attribute: 1 }] }] }))
assert.ok(!isSnapshot('<script>'))

console.log(`${cases.length} shared evaluation cases passed`)
