import test from 'node:test'
import assert from 'node:assert/strict'
import {
  severityWeight,
  recencyWeight,
  riskScore,
  riskBand,
  trendLabel,
  weightedMovingAverage,
  forecastSeries,
  staffingRecommendation,
  accelerationRatio,
} from './analytics.js'

test('severity weights rank correctly and flash amplifies', () => {
  assert.ok(severityWeight('critical') > severityWeight('high'))
  assert.ok(severityWeight('high') > severityWeight('medium'))
  assert.ok(severityWeight('medium') > severityWeight('low'))
  assert.equal(severityWeight('unknown'), 1)
  assert.equal(severityWeight('high', true), 9)
})

test('recency decays exponentially and rejects nonsense ages', () => {
  assert.equal(recencyWeight(0), 1)
  assert.equal(recencyWeight(12), 0.5) // one half-life
  assert.ok(recencyWeight(24) < 0.26 && recencyWeight(24) > 0.24)
  assert.ok(recencyWeight(60) < 0.04)
  assert.equal(recencyWeight(-5), 0)
  assert.equal(recencyWeight('NaN'), 0)
})

test('risk score saturates at 100, is monotonic, and zero-safe', () => {
  assert.equal(riskScore(0), 0)
  assert.equal(riskScore(-3), 0)
  assert.equal(riskScore('x'), 0)
  assert.equal(riskScore(25), 50) // raw = K → half scale
  const s1 = riskScore(10)
  const s2 = riskScore(100)
  const s3 = riskScore(100000)
  assert.ok(s1 < s2 && s2 < s3)
  assert.ok(s3 <= 100)
})

test('risk bands threshold correctly', () => {
  assert.equal(riskBand(0), 'low')
  assert.equal(riskBand(24), 'low')
  assert.equal(riskBand(25), 'medium')
  assert.equal(riskBand(50), 'high')
  assert.equal(riskBand(75), 'critical')
  assert.equal(riskBand(100), 'critical')
})

test('trend labels react to ratios', () => {
  assert.equal(trendLabel(5, 0), 'rising')
  assert.equal(trendLabel(0, 0), 'stable')
  assert.equal(trendLabel(10, 9), 'stable') // 1.11 < 1.25
  assert.equal(trendLabel(10, 5), 'rising') // 2.0 >= 1.25
  assert.equal(trendLabel(2, 10), 'falling') // 0.2 <= 0.75
})

test('WMA weights recent points heavier', () => {
  assert.equal(weightedMovingAverage([]), null)
  // [1,2,3] with window 6: (1*1 + 2*2 + 3*3) / 6 = 14/6
  assert.ok(Math.abs(weightedMovingAverage([1, 2, 3]) - 14 / 6) < 1e-9)
  assert.ok(weightedMovingAverage([0, 0, 0, 10]) >= 4) // (0+0+0+4*10)/10 = 4, newest heaviest
  assert.ok(weightedMovingAverage([10, 10, 10, 10, 10, 10, 10, 10, 10, 2]) < 10) // old 10s dropped by window
})

test('forecast is non-negative, length-correct, and mean-reverting', () => {
  const out = forecastSeries([0, 0, 0, 0, 2, 4], 6)
  assert.equal(out.length, 6)
  assert.ok(out.every((v) => v >= 0))
  // Recent uptick should forecast above zero, then settle toward the WMA
  assert.ok(out[0] > 0)
  const flat = forecastSeries([3, 3, 3, 3], 3)
  assert.ok(flat.every((v) => Math.abs(v - 3) < 0.15))
  const empty = forecastSeries([], 4)
  assert.equal(empty.length, 4)
})

test('staffing scales with predicted load and risk band', () => {
  assert.equal(staffingRecommendation(0, 'low'), 0)
  assert.equal(staffingRecommendation(2, 'low'), 4)
  assert.ok(staffingRecommendation(2, 'high') > staffingRecommendation(2, 'medium'))
  assert.ok(staffingRecommendation(2, 'critical') > staffingRecommendation(2, 'high'))
  assert.equal(staffingRecommendation(-5, 'critical'), 6) // negative input clamped
})

test('acceleration ratio compares recent rate to baseline expectation', () => {
  // Same rate as baseline → ~1
  assert.ok(Math.abs(accelerationRatio(6, 24, 24, 6) - 1) < 0.01)
  // Double the baseline rate → ~2
  assert.ok(Math.abs(accelerationRatio(12, 24, 24, 6) - 2) < 0.01)
  // No recent incidents → 0 regardless of baseline
  assert.equal(accelerationRatio(0, 100, 24, 6), 0)
  // Baseline silence but activity now → strong acceleration (floor 0.5 expected)
  assert.ok(accelerationRatio(3, 0, 24, 6) >= 1)
})
