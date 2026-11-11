// Pure-function tests that do not need Electron or Docker (Node strips the TS types).
//   node scripts/test-lib.mjs
import assert from 'node:assert/strict'
import { isCpuHigh, cpuWarnThreshold } from '../src/renderer/src/lib/stats.ts'

assert.equal(cpuWarnThreshold(8), 640)
assert.equal(isCpuHigh(640, 8), false, 'exactly at the threshold is not above it')
assert.equal(isCpuHigh(640.01, 8), true)
assert.equal(isCpuHigh(81, 1), true)
assert.equal(isCpuHigh(79, 1), false)
assert.equal(cpuWarnThreshold(0), 80, 'unknown cpu count falls back to 1')
console.log('test-lib: ok')
