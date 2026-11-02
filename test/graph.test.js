import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ALPHA_CUMULATIVE,
  ALPHA_MIN,
  NORMALIZE_FLOOR,
  endTime,
  lineAlpha,
  normalizeMods,
  prepareSkills,
  toSteps,
  valueNear,
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

test('a skill that is hardly there is not stretched to the full height', () => {
  // Reading is 0-11 on most maps while the others are in the hundreds.
  const [stamina, reading] = prepareSkills({
    speed: 1,
    reading: pts([0, 2], [1000, 11]),
    stamina: pts([0, 150], [1000, NORMALIZE_FLOOR]),
  })

  assert.deepEqual(reading.points.map((p) => p.value), [2 / NORMALIZE_FLOOR, 11 / NORMALIZE_FLOOR])
  assert.ok(Math.max(...reading.points.map((p) => p.value)) < 0.2)
  // A skill above the floor still reaches 1.
  assert.equal(Math.max(...stamina.points.map((p) => p.value)), 1)
  // A skill exactly at the floor is divided by itself.
  const [edge] = prepareSkills({ speed: 1, agility: pts([0, NORMALIZE_FLOOR]) })
  assert.equal(edge.points[0].value, 1)
})

test('prepareSkills puts the time on the beatmap timeline', () => {
  const [stamina] = prepareSkills({ speed: 1.5, stamina: pts([1000, 1], [2000, 2]) })
  assert.deepEqual(stamina.points.map((p) => p.time), [1500, 3000])

  // A missing or bad speed does not break the times.
  const [bad] = prepareSkills({ speed: 0, stamina: pts([1000, 1]) })
  assert.equal(bad.points[0].time, 1000)
  assert.deepEqual(prepareSkills(null), [])
})

test('only tenacity is drawn as steps, one window wide', () => {
  const skills = prepareSkills({
    speed: 1,
    window: 5000,
    tenacity: pts([2500, 1]),
    stamina: pts([2500, 1]),
    memory: pts([2500, 1]),
  })
  const step = Object.fromEntries(skills.map((s) => [s.key, s.step]))
  assert.deepEqual(step, { stamina: 0, tenacity: 5000, memory: 0 })

  // No window (raw curves): nothing to step over.
  const [raw] = prepareSkills({ speed: 1, tenacity: pts([2500, 1]) })
  assert.equal(raw.step, 0)
})

test('endTime is the last point of any curve', () => {
  const skills = prepareSkills({ speed: 1, stamina: pts([0, 1], [5000, 2]), agility: pts([0, 1], [8000, 1]) })
  assert.equal(endTime(skills), 8000)
})

test('toSteps makes a plateau of every window', () => {
  assert.deepEqual(toSteps(pts([2500, 1], [7500, 0]), 5000), pts([0, 1], [5000, 1], [5000, 0], [10000, 0]))
  assert.deepEqual(toSteps([], 5000), [])
})

test('valueNear is the value of the nearest point', () => {
  const curve = pts([2500, 0.1], [7500, 0.8], [12500, 0.5])
  assert.equal(valueNear(curve, 0), 0.1) // before the first point
  assert.equal(valueNear(curve, 2500), 0.1)
  assert.equal(valueNear(curve, 4999), 0.1)
  assert.equal(valueNear(curve, 5000), 0.1) // halfway: the earlier one
  assert.equal(valueNear(curve, 5001), 0.8)
  assert.equal(valueNear(curve, 9999), 0.8)
  assert.equal(valueNear(curve, 10001), 0.5)
  assert.equal(valueNear(curve, 99999), 0.5) // after the last
  assert.equal(valueNear([], 0), null)
  assert.equal(valueNear(pts([100, 3]), 5), 3)
})

test('lineAlpha: the closer to its own peak, the brighter', () => {
  const skill = { points: pts([0, 1], [1000, 0.5], [2000, 0.1]) }

  assert.equal(lineAlpha(skill, 0), 1) // at its peak
  const half = lineAlpha(skill, 1000)
  const low = lineAlpha(skill, 2000)
  assert.ok(low < half && half < 1, `${low} < ${half} < 1`)
  assert.ok(low > ALPHA_MIN)
  // The fade is the square of the ratio: half the peak is a quarter of the way up.
  assert.ok(Math.abs(half - (ALPHA_MIN + (1 - ALPHA_MIN) * 0.25)) < 1e-12)
  assert.equal(lineAlpha({ points: pts([0, 0]) }, 0), ALPHA_MIN) // nothing there at all
  assert.equal(lineAlpha({ points: [] }, 0), ALPHA_MIN)
})

test('lineAlpha: a cumulative line has a constant opacity', () => {
  const memory = { cumulative: true, points: pts([0, 0.1], [1000, 1]) }
  assert.equal(lineAlpha(memory, 0), ALPHA_CUMULATIVE)
  assert.equal(lineAlpha(memory, 99999), ALPHA_CUMULATIVE)
})
