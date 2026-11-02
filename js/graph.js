// Pure logic of the widget: no DOM, no network, so it can be tested with
// `node --test`.

/** Skills in drawing order with their colours. */
export const SKILLS = [
  { key: 'stamina', label: 'Stamina', color: '#ef5350' },
  { key: 'tenacity', label: 'Tenacity', color: '#ff9800', step: true },
  { key: 'agility', label: 'Agility', color: '#fdd835' },
  { key: 'precision', label: 'Precision', color: '#9ccc65' },
  { key: 'reading', label: 'Reading', color: '#26c6da' },
  { key: 'memory', label: 'Memory', color: '#7986cb', cumulative: true },
  { key: 'accuracy', label: 'Accuracy', color: '#ab47bc' },
  { key: 'reaction', label: 'Reaction', color: '#b0bec5' },
]

/**
 * A skill is stretched to the full height only if its peak is at least this
 * many points. Below that it is divided by this instead, so a skill that is
 * hardly there (reading is 0-11 on most maps, the others are in the hundreds)
 * stays a low line and does not look as hard as the rest.
 */
export const NORMALIZE_FLOOR = 100

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
 * normalised to the skill's own peak (but see NORMALIZE_FLOOR), so each line
 * spans 0..1 whatever the skill's scale. `step` is the width of a window in
 * ms for the skills that are on or off (tenacity: a stream, then none) and are
 * drawn as steps; 0 for the others. Skills without a curve (or with a curve of
 * zeros) are left out.
 */
export function prepareSkills(response) {
  const speed = response?.speed > 0 ? response.speed : 1
  const window = response?.window > 0 ? response.window : 0
  const prepared = []

  for (const skill of SKILLS) {
    const raw = response?.[skill.key]
    if (!Array.isArray(raw) || raw.length === 0) continue

    let peak = 0
    for (const p of raw) peak = Math.max(peak, p.value)
    if (!(peak > 0)) continue

    const divisor = Math.max(peak, NORMALIZE_FLOOR)
    prepared.push({
      ...skill,
      peak,
      step: skill.step ? window : 0,
      points: raw.map((p) => ({ time: p.time * speed, value: p.value / divisor })),
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

/**
 * Turns the points of windows (each in the middle of a window `width` ms wide)
 * into a step line: every window is a plateau of its value.
 */
export function toSteps(points, width) {
  const half = width / 2
  const out = []
  for (const p of points) {
    out.push({ time: p.time - half, value: p.value }, { time: p.time + half, value: p.value })
  }
  return out
}

/**
 * Value of a curve at `time`: that of the point nearest in time. The curves
 * are on a uniform grid with a point in the middle of every window, so this is
 * the value of the window the time is in. Null for an empty curve.
 */
export function valueNear(points, time) {
  if (points.length === 0) return null

  let lo = 0
  let hi = points.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].time < time) lo = mid + 1
    else hi = mid
  }
  // lo is the first point at or after the time; the one before it may be nearer.
  if (lo > 0 && time - points[lo - 1].time <= points[lo].time - time) lo--
  return points[lo].value
}

/**
 * Opacity of a skill's line at the current time. The values are normalised, so
 * 1 is the skill's own peak: a line whose current value is below it fades with
 * the square of how far below. The lines that are hard at this very moment
 * stand out, the rest do not blur the graph. A cumulative curve (memory) has no
 * meaningful "below its peak", so it has a constant, medium opacity.
 */
export function lineAlpha(skill, time) {
  if (skill.cumulative) return ALPHA_CUMULATIVE

  const v = valueNear(skill.points, time)
  if (v === null) return ALPHA_MIN
  const ratio = Math.min(1, Math.max(0, v))
  return ALPHA_MIN + (1 - ALPHA_MIN) * ratio * ratio
}
