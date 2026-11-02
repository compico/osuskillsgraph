import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ALPHA_CUMULATIVE,
  ALPHA_MIN,
  endTime,
  lineAlpha,
  normalizeMods,
  prepareSkills,
  splitSegments,
  valueAt,
} from '../js/graph.js'

const pts = (...pairs) => pairs.map(([time, value]) => ({ time, value }))

test('normalizeMods resolves tosu names to what go-osu accepts', () => {
  assert.equal(normalizeMods('NM'), '')
  assert.equal(normalizeMods(''), '')
  assert.equal(normalizeMods(undefined), '')
  assert.equal(normalizeMods('hddt'), 'HDDT')
  assert.equal(normalizeMods('HDNC'), 'HDDT') // nightcore is a double time
  assert.equal(normalizeMods('PF'), 'SD')
  assert.equal(normalizeMods('HDCLTD'), 'HD') // mods go-osu does not know are dropped
  assert.equal(normalizeMods('DTNC'), 'DT') // no duplicates
  assert.equal(normalizeMods('HDHR'), 'HDHR')
})

test('prepareSkills normalises every skill to its own peak', () => {
  const skills = prepareSkills({
    speed: 1,
    stamina: pts([0, 100], [1000, 250], [2000, 50]),
    agility: pts([0, 1000], [1000, 500]),
    reading: [],
    reaction: pts([0, 0], [10, 0]), // all zeros: nothing to draw
  })

  assert.deepEqual(skills.map((s) => s.key), ['stamina', 'agility'])
  assert.deepEqual(skills[0].points.map((p) => p.value), [0.4, 1, 0.2])
  assert.deepEqual(skills[1].points.map((p) => p.value), [1, 0.5])
  assert.equal(skills[0].peak, 250)
  assert.equal(skills[1].peak, 1000)
})

test('prepareSkills puts the time on the beatmap timeline', () => {
  const [stamina] = prepareSkills({ speed: 1.5, stamina: pts([1000, 1], [2000, 2]) })
  assert.deepEqual(stamina.points.map((p) => p.time), [1500, 3000])

  // A missing or bad speed does not break the times.
  const [bad] = prepareSkills({ speed: 0, stamina: pts([1000, 1]) })
  assert.equal(bad.points[0].time, 1000)
  assert.deepEqual(prepareSkills(null), [])
})

test('endTime is the last point of any curve', () => {
  const skills = prepareSkills({ speed: 1, stamina: pts([0, 1], [5000, 2]), agility: pts([0, 1], [8000, 1]) })
  assert.equal(endTime(skills), 8000)
})

test('splitSegments cuts at breaks only', () => {
  const curve = pts([0, 1], [400, 1], [2000, 1], [9000, 1], [9400, 1])
  assert.deepEqual(splitSegments(curve).map((s) => s.length), [3, 2])
  assert.deepEqual(splitSegments(curve, 100).map((s) => s.length), [1, 1, 1, 1, 1])
  assert.deepEqual(splitSegments([]), [])
})

test('valueAt holds the last value and knows breaks', () => {
  const curve = pts([1000, 0.2], [1400, 0.8], [10000, 0.5])
  assert.equal(valueAt(curve, 500), null) // before the first point
  assert.equal(valueAt(curve, 1000), 0.2)
  assert.equal(valueAt(curve, 1399), 0.2)
  assert.equal(valueAt(curve, 1400), 0.8)
  assert.equal(valueAt(curve, 4400), 0.8) // exactly MIN_BREAK_MS after
  assert.equal(valueAt(curve, 4401), null) // in the break
  assert.equal(valueAt(curve, 10500), 0.5)
  assert.equal(valueAt([], 0), null)
})

test('lineAlpha: the closer to its own peak, the brighter', () => {
  const skill = { points: pts([0, 1], [1000, 0.5], [2000, 0.1]) }

  assert.equal(lineAlpha(skill, 0), 1) // at its peak
  const half = lineAlpha(skill, 1000)
  const low = lineAlpha(skill, 2000)
  assert.ok(low < half && half < 1, `${low} < ${half} < 1`)
  assert.ok(low > ALPHA_MIN)
  assert.equal(lineAlpha(skill, 20000), ALPHA_MIN) // a break: faintest
  assert.equal(lineAlpha(skill, -5), ALPHA_MIN) // before the first point
})

test('lineAlpha: a cumulative line has a constant opacity', () => {
  const memory = { cumulative: true, points: pts([0, 0.1], [1000, 1]) }
  assert.equal(lineAlpha(memory, 0), ALPHA_CUMULATIVE)
  assert.equal(lineAlpha(memory, 99999), ALPHA_CUMULATIVE)
})
