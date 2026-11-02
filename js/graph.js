// Pure logic of the widget: no DOM, no network, so it can be tested with
// `node --test`.

/** Skills in drawing order with their colours. */
export const SKILLS = [
  { key: 'stamina', label: 'Stamina', color: '#ef5350' },
  { key: 'tenacity', label: 'Tenacity', color: '#ff9800' },
  { key: 'agility', label: 'Agility', color: '#fdd835' },
  { key: 'precision', label: 'Precision', color: '#9ccc65' },
  { key: 'reading', label: 'Reading', color: '#26c6da' },
  { key: 'memory', label: 'Memory', color: '#7986cb', cumulative: true },
  { key: 'accuracy', label: 'Accuracy', color: '#ab47bc' },
  { key: 'reaction', label: 'Reaction', color: '#b0bec5' },
]

/** A gap longer than this (ms) in a curve is a break in the map: the line is cut. */
export const MIN_BREAK_MS = 3000

/** Opacity of a line that is far below its peak / of a cumulative line. */
export const ALPHA_MIN = 0.18
export const ALPHA_CUMULATIVE = 0.5

// Mods go-osu's parser knows (pkg/osu/mods).
const KNOWN_MODS = new Set(['NF', 'EZ', 'HD', 'HR', 'SD', 'DT', 'RL', 'HT', 'FL', 'AU', 'SO', 'AP'])
// tosu names some mods differently from go-osu: Nightcore is a DT, Perfect is a SD.
const MOD_ALIASES = { NC: 'DT', PF: 'SD' }

/**
 * Turns the mods string tosu reports ("HDDT", "NC", "NM", "HDCL") into the
 * string go-osu accepts: aliases resolved, mods go-osu does not know (they do
 * not change the difficulty) dropped, duplicates removed. "" means no mods.
 */
export function normalizeMods(name) {
  if (typeof name !== 'string') return ''

  const s = name.trim().toUpperCase()
  const out = []
  for (let i = 0; i + 1 < s.length; i += 2) {
    let code = s.slice(i, i + 2)
    code = MOD_ALIASES[code] ?? code
    if (KNOWN_MODS.has(code) && !out.includes(code)) out.push(code)
  }
  return out.join('')
}

/**
 * Prepares a /strains response for drawing: every skill's points on the
 * beatmap's own timeline (time × speed, which is the timeline tosu reports)
 * with the value normalised to the skill's own peak, so each line spans
 * 0..1 whatever the skill's scale. Skills without a curve (or with a curve of
 * zeros) are left out.
 */
export function prepareSkills(response) {
  const speed = response?.speed > 0 ? response.speed : 1
  const prepared = []

  for (const skill of SKILLS) {
    const raw = response?.[skill.key]
    if (!Array.isArray(raw) || raw.length === 0) continue

    let peak = 0
    for (const p of raw) peak = Math.max(peak, p.value)
    if (!(peak > 0)) continue

    prepared.push({
      ...skill,
      peak,
      points: raw.map((p) => ({ time: p.time * speed, value: p.value / peak })),
    })
  }
  return prepared
}

/** End of the drawn time axis: the last point of any curve. */
export function endTime(skills) {
  let end = 0
  for (const s of skills) end = Math.max(end, s.points[s.points.length - 1].time)
  return end
}

/** Cuts a curve into runs of points drawn as one line (see MIN_BREAK_MS). */
export function splitSegments(points, maxGap = MIN_BREAK_MS) {
  const segments = []
  let current = []
  for (const p of points) {
    const last = current[current.length - 1]
    if (last && p.time - last.time > maxGap) {
      segments.push(current)
      current = []
    }
    current.push(p)
  }
  if (current.length > 0) segments.push(current)
  return segments
}

/**
 * Value of a curve at `time`: that of the last point at or before it, unless
 * it is further than `maxGap` ms away (a break): then null. A time before the
 * first point is null too.
 */
export function valueAt(points, time, maxGap = MIN_BREAK_MS) {
  let lo = 0
  let hi = points.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].time <= time) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (found < 0 || time - points[found].time > maxGap) return null
  return points[found].value
}

/**
 * Opacity of a skill's line at the current time. The values are normalised, so
 * 1 is the skill's own peak: a line whose current value is below it fades with
 * the square of how far below, and a skill that is not playing at the moment
 * (a break, or before its first point) is the faintest. The lines that are
 * hard at this very moment stand out, the rest do not blur the graph.
 * A cumulative curve (memory) has no meaningful "below its peak", so it has a
 * constant, medium opacity.
 */
export function lineAlpha(skill, time) {
  if (skill.cumulative) return ALPHA_CUMULATIVE

  const v = valueAt(skill.points, time)
  if (v === null) return ALPHA_MIN
  const ratio = Math.min(1, Math.max(0, v))
  return ALPHA_MIN + (1 - ALPHA_MIN) * ratio * ratio
}
