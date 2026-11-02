import { SKILLS, ALPHA_MIN, endTime, lineAlpha, normalizeMods, prepareSkills, splitSegments, valueAt } from './graph.js'

const cfg = resolveConfig()

const canvas = document.getElementById('graph')
const statusEl = document.getElementById('status')
const ctx = canvas.getContext('2d')

// What tosu says right now, and what is loaded.
const live = { id: 0, mods: '', time: 0 }
let skills = []
let loadedKey = ''
let controller = null
let retryTimer = null
let dirty = true

function resolveConfig() {
  const base = window.OSUSKILLSGRAPH_CONFIG ?? {}
  const q = new URLSearchParams(location.search)
  return {
    goosu: (q.get('goosu') ?? base.goosu ?? 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    window: Number(q.get('window') ?? base.window ?? 400),
    tosu: q.get('tosu') ?? base.tosu ?? '',
  }
}

// ── tosu ──────────────────────────────────────────────────────────────────

function connect() {
  const host = cfg.tosu || location.host || '127.0.0.1:24050'
  const ws = new WebSocket(`ws://${host}/websocket/v2`)

  ws.onmessage = (event) => {
    let data
    try {
      data = JSON.parse(event.data)
    } catch {
      return
    }
    if (!data || data.error) return

    live.time = data.beatmap?.time?.live ?? 0
    const id = Number(data.beatmap?.id) || 0
    const mods = normalizeMods(data.play?.mods?.name)

    if (id !== live.id || mods !== live.mods) {
      live.id = id
      live.mods = mods
      load()
    }
    dirty = true
  }
  ws.onclose = () => setTimeout(connect, 1000)
  ws.onerror = () => ws.close()
}

// ── go-osu ────────────────────────────────────────────────────────────────

async function load() {
  controller?.abort()
  clearTimeout(retryTimer)

  const key = `${live.id}:${live.mods}`
  if (key === loadedKey) return
  if (!live.id) {
    skills = []
    loadedKey = ''
    showStatus('')
    dirty = true
    return
  }

  const mine = new AbortController()
  controller = mine
  showStatus('Calculating…')

  try {
    const params = new URLSearchParams({ window: String(cfg.window) })
    if (live.mods) params.set('mods', live.mods)
    const res = await fetch(`${cfg.goosu}/api/osu/songs/${live.id}/strains?${params}`, { signal: mine.signal })

    if (res.status === 404) {
      skills = []
      loadedKey = key
      showStatus('This beatmap is not in the go-osu library')
    } else if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    } else {
      skills = prepareSkills(await res.json())
      loadedKey = key
      showStatus('')
    }
  } catch (e) {
    if (mine.signal.aborted) return
    skills = []
    showStatus('go-osu is not reachable. Is it running?')
    retryTimer = setTimeout(load, 3000)
  }
  dirty = true
}

function showStatus(text) {
  statusEl.textContent = text
  statusEl.hidden = text === ''
}

// ── drawing ───────────────────────────────────────────────────────────────

const PAD = { left: 8, right: 8, top: 22, bottom: 8 }

function resize() {
  const ratio = window.devicePixelRatio || 1
  const { width, height } = canvas.getBoundingClientRect()
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  dirty = true
}

function draw() {
  const { width, height } = canvas.getBoundingClientRect()
  ctx.clearRect(0, 0, width, height)
  if (skills.length === 0) return

  const end = Math.max(endTime(skills), 1)
  const x = (ms) => PAD.left + (ms / end) * (width - PAD.left - PAD.right)
  const y = (v) => height - PAD.bottom - v * (height - PAD.top - PAD.bottom)

  // The faintest lines first, so the ones that matter are on top.
  const ordered = skills
    .map((skill) => ({ skill, alpha: lineAlpha(skill, live.time) }))
    .sort((a, b) => a.alpha - b.alpha)

  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  for (const { skill, alpha } of ordered) {
    ctx.strokeStyle = skill.color
    ctx.globalAlpha = alpha
    ctx.setLineDash(skill.cumulative ? [4, 3] : [])

    for (const segment of skill.cumulative ? [skill.points] : splitSegments(skill.points)) {
      ctx.beginPath()
      segment.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.time), y(p.value)) : ctx.lineTo(x(p.time), y(p.value))))
      if (segment.length === 1) ctx.lineTo(x(segment[0].time) + 3, y(segment[0].value))
      ctx.stroke()
    }
  }
  ctx.setLineDash([])

  // The current moment.
  const now = Math.min(Math.max(live.time, 0), end)
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x(now), PAD.top - 4)
  ctx.lineTo(x(now), height - PAD.bottom)
  ctx.stroke()

  // A dot on every skill at the moment, as bright as its line.
  for (const { skill, alpha } of ordered) {
    const v = valueAt(skill.points, live.time, skill.cumulative ? Infinity : undefined)
    if (v === null) continue
    ctx.globalAlpha = Math.max(alpha, ALPHA_MIN)
    ctx.fillStyle = skill.color
    ctx.beginPath()
    ctx.arc(x(now), y(v), 2.6, 0, Math.PI * 2)
    ctx.fill()
  }

  drawLegend(ordered)
  ctx.globalAlpha = 1
}

function drawLegend(ordered) {
  const alphaOf = new Map(ordered.map(({ skill, alpha }) => [skill.key, alpha]))
  ctx.font = '600 10px "Segoe UI", system-ui, sans-serif'
  ctx.textBaseline = 'middle'

  let cursor = PAD.left
  for (const meta of SKILLS) {
    if (!alphaOf.has(meta.key)) continue
    ctx.globalAlpha = Math.max(alphaOf.get(meta.key), 0.35)
    ctx.fillStyle = meta.color
    ctx.fillRect(cursor, 7, 7, 7)
    ctx.fillText(meta.label, cursor + 10, 11)
    cursor += 10 + ctx.measureText(meta.label).width + 10
  }
}

function frame() {
  if (dirty) {
    dirty = false
    draw()
  }
  requestAnimationFrame(frame)
}

window.addEventListener('resize', resize)
resize()
connect()
requestAnimationFrame(frame)
