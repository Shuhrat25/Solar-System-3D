/**
 * Процедурная генерация текстур.
 *
 * Никаких внешних картинок: все поверхности планет, кольца, облака и блики
 * рисуются на <canvas> из шума значений (value noise) и градиентов.
 * Так проект остаётся автономным и одинаково выглядит без интернета.
 */
import * as THREE from 'three'
import { quality } from '../quality'

const cache = new Map()

export function getTexture(key) {
  return cache.get(key)
}

function canvasOf(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/* ------------------------------------------------------------------ */
/* Шум                                                                 */
/* ------------------------------------------------------------------ */

function rngFrom(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

/** Трилинейный value-noise на решётке 256³. */
function makeNoise3D(seed) {
  const perm = new Uint8Array(512)
  const base = new Uint8Array(256)
  for (let i = 0; i < 256; i++) base[i] = i
  const rnd = rngFrom(seed)
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0
    const t = base[i]
    base[i] = base[j]
    base[j] = t
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]

  const val = (x, y, z) => perm[(perm[(perm[x & 255] + y) & 255] + z) & 255] / 255

  return function noise(x, y, z) {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const xf = x - xi
    const yf = y - yi
    const zf = z - zi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const w = zf * zf * (3 - 2 * zf)

    const c000 = val(xi, yi, zi)
    const c100 = val(xi + 1, yi, zi)
    const c010 = val(xi, yi + 1, zi)
    const c110 = val(xi + 1, yi + 1, zi)
    const c001 = val(xi, yi, zi + 1)
    const c101 = val(xi + 1, yi, zi + 1)
    const c011 = val(xi, yi + 1, zi + 1)
    const c111 = val(xi + 1, yi + 1, zi + 1)

    const x00 = c000 + (c100 - c000) * u
    const x10 = c010 + (c110 - c010) * u
    const x01 = c001 + (c101 - c001) * u
    const x11 = c011 + (c111 - c011) * u
    const y0 = x00 + (x10 - x00) * v
    const y1 = x01 + (x11 - x01) * v
    return y0 + (y1 - y0) * w
  }
}

function fbm(noise, x, y, z, octaves, gain = 0.5, lac = 2.07) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq, z * freq)
    norm += amp
    amp *= gain
    freq *= lac
  }
  return sum / norm
}

/** Ridged noise — даёт «хребты», хорошо смотрится на каменистых мирах. */
function ridged(noise, x, y, z, octaves) {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * freq, y * freq, z * freq) * 2 - 1)
    sum += amp * n * n
    norm += amp
    amp *= 0.5
    freq *= 2.1
  }
  return sum / norm
}

/** Линейная интерполяция по цветовым стопам вида [[t, [r,g,b]], ...]. */
function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i]
    const [p1, c1] = stops[i + 1]
    if (t <= p1) {
      const k = p1 === p0 ? 0 : (t - p0) / (p1 - p0)
      return [
        c0[0] + (c1[0] - c0[0]) * k,
        c0[1] + (c1[1] - c0[1]) * k,
        c0[2] + (c1[2] - c0[2]) * k,
      ]
    }
  }
  return stops[stops.length - 1][1]
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/* ------------------------------------------------------------------ */
/* Поверхности планет                                                  */
/* ------------------------------------------------------------------ */

/**
 * Общий проход по пикселям равнопромежуточной проекции.
 * shade(u, v, cx, cy, cz) -> [r, g, b, height]
 * Координаты cx/cy/cz лежат на сфере, поэтому текстура бесшовна по долготе.
 */
function renderSphereMaps(width, height, freq, shade) {
  const colorCanvas = canvasOf(width, height)
  const bumpCanvas = canvasOf(width, height)
  const cctx = colorCanvas.getContext('2d')
  const bctx = bumpCanvas.getContext('2d')
  const cimg = cctx.createImageData(width, height)
  const bimg = bctx.createImageData(width, height)
  const cd = cimg.data
  const bd = bimg.data

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1)
    const lat = (v - 0.5) * Math.PI
    const cosLat = Math.cos(lat)
    const sy = Math.sin(lat) * freq
    for (let x = 0; x < width; x++) {
      const u = x / width
      const lon = u * Math.PI * 2
      const sx = Math.cos(lon) * cosLat * freq
      const sz = Math.sin(lon) * cosLat * freq

      const out = shade(u, v, sx, sy, sz)
      const i = (y * width + x) * 4
      cd[i] = out[0]
      cd[i + 1] = out[1]
      cd[i + 2] = out[2]
      cd[i + 3] = 255
      const h = clamp01(out[3]) * 255
      bd[i] = h
      bd[i + 1] = h
      bd[i + 2] = h
      bd[i + 3] = 255
    }
  }
  cctx.putImageData(cimg, 0, 0)
  bctx.putImageData(bimg, 0, 0)
  return { colorCanvas, bumpCanvas, cctx, bctx }
}

/** Кратеры рисуются поверх готовой карты, с «заворотом» по краям. */
function drawCraters(ctx, w, h, count, rnd) {
  for (let i = 0; i < count; i++) {
    const v = rnd()
    const cy = v * h
    const shrink = 0.35 + Math.cos((v - 0.5) * Math.PI) * 0.65
    const t = rnd()
    const r = (2 + t * t * 16) * shrink * (w / 512)
    const cx = rnd() * w
    for (const ox of [-w, 0, w]) {
      const g = ctx.createRadialGradient(cx + ox, cy, r * 0.05, cx + ox, cy, r)
      g.addColorStop(0, 'rgba(0,0,0,0.30)')
      g.addColorStop(0.55, 'rgba(0,0,0,0.16)')
      g.addColorStop(0.78, 'rgba(0,0,0,0.05)')
      g.addColorStop(0.88, 'rgba(255,255,255,0.18)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx + ox, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** Каменистая поверхность: Меркурий, Марс, Плутон, спутники. */
function makeRocky(cfg) {
  const { width, height, seed, palette, craters = 0, polarCaps = 0 } = cfg
  const n1 = makeNoise3D(seed)
  const n2 = makeNoise3D(seed + 4211)

  const maps = renderSphereMaps(width, height, 3.2, (u, v, x, y, z) => {
    const base = fbm(n1, x, y, z, 5)
    const detail = ridged(n2, x * 2.4, y * 2.4, z * 2.4, 4)
    let h = base * 0.72 + detail * 0.28
    let c = ramp(palette, h)

    if (polarCaps > 0) {
      const capNoise = fbm(n2, x * 1.6, y * 1.6, z * 1.6, 3)
      const edge = polarCaps + capNoise * 0.09
      const cap = smoothstep(edge, edge + 0.06, Math.abs(v - 0.5) * 2 - 0.02)
      if (cap > 0) {
        c = [
          c[0] + (244 - c[0]) * cap,
          c[1] + (248 - c[1]) * cap,
          c[2] + (255 - c[2]) * cap,
        ]
        h = h * (1 - cap) + 0.85 * cap
      }
    }
    return [c[0], c[1], c[2], h]
  })

  if (craters > 0) {
    const rnd = rngFrom(seed + 99)
    drawCraters(maps.cctx, width, height, craters, rnd)
    drawCraters(maps.bctx, width, height, craters, rngFrom(seed + 99))
  }
  return maps
}

/** Полосатые атмосферы: Юпитер, Сатурн, Венера, ледяные гиганты. */
function makeBanded(cfg) {
  const { width, height, seed, palette, bands = 8, bandAmp = 2.4, storm = null, contrast = 1 } = cfg
  const n1 = makeNoise3D(seed)
  const n2 = makeNoise3D(seed + 7703)

  const maps = renderSphereMaps(width, height, 2.6, (u, v, x, y, z) => {
    // Шум сильно сжат по широте и растянут по долготе — получаются
    // зональные завихрения, а не мраморные разводы.
    const swirl = fbm(n1, x * 0.22, y * 5.2, z * 0.22, 5) - 0.5
    const fine = fbm(n2, x * 0.9, y * 11.0, z * 0.9, 4) - 0.5
    const coord = v * bands + swirl * bandAmp + fine * (bandAmp * 0.3)
    let t = 0.5 + 0.5 * Math.sin(coord * Math.PI * 2)
    t = 0.5 + (t - 0.5) * contrast
    const shade = 0.93 + fine * 0.2
    let c = ramp(palette, clamp01(t))
    c = [c[0] * shade, c[1] * shade, c[2] * shade]

    if (storm) {
      // Эллиптическое пятно с учётом «заворота» текстуры по долготе.
      let du = u - storm.u
      if (du > 0.5) du -= 1
      if (du < -0.5) du += 1
      const dv = v - storm.v
      const d = Math.sqrt((du / storm.rx) ** 2 + (dv / storm.ry) ** 2)
      if (d < 1.35) {
        const swirlIn = fbm(n2, x * 3, y * 3, z * 3, 3)
        const k = (1 - smoothstep(0.55, 1.25, d)) * (0.75 + swirlIn * 0.4)
        c = [
          c[0] + (storm.color[0] - c[0]) * k,
          c[1] + (storm.color[1] - c[1]) * k,
          c[2] + (storm.color[2] - c[2]) * k,
        ]
      }
    }
    return [c[0], c[1], c[2], 0.45 + (t - 0.5) * 0.3 + fine * 0.2]
  })
  return maps
}

/** Земля: океаны, континенты по порогу шума, горы и полярные шапки. */
function makeEarth(cfg) {
  const { width, height, seed } = cfg
  const n1 = makeNoise3D(seed)
  const n2 = makeNoise3D(seed + 1337)

  const ocean = [
    [0.0, [4, 20, 62]],
    [0.55, [10, 46, 110]],
    [0.85, [22, 88, 158]],
    [1.0, [46, 132, 190]],
  ]
  const land = [
    [0.0, [188, 176, 132]],
    [0.12, [92, 128, 62]],
    [0.4, [56, 104, 46]],
    [0.62, [78, 112, 58]],
    [0.8, [124, 116, 92]],
    [1.0, [236, 240, 244]],
  ]

  return renderSphereMaps(width, height, 2.4, (u, v, x, y, z) => {
    const cont = fbm(n1, x, y, z, 6)
    const detail = ridged(n2, x * 3.1, y * 3.1, z * 3.1, 4)
    const h = cont * 0.8 + detail * 0.2
    const sea = 0.52
    let c
    let bump
    if (h < sea) {
      c = ramp(ocean, h / sea)
      bump = 0.18 + h * 0.1
    } else {
      const lh = (h - sea) / (1 - sea)
      c = ramp(land, lh)
      bump = 0.45 + lh * 0.55
    }
    // Шапки полюсов с рваной кромкой.
    const capNoise = fbm(n2, x * 2.2, y * 2.2, z * 2.2, 3)
    const edge = 0.78 + capNoise * 0.14
    const cap = smoothstep(edge, edge + 0.1, Math.abs(v - 0.5) * 2)
    if (cap > 0) {
      c = [c[0] + (246 - c[0]) * cap, c[1] + (250 - c[1]) * cap, c[2] + (255 - c[2]) * cap]
      bump = bump * (1 - cap) + 0.7 * cap
    }
    return [c[0], c[1], c[2], bump]
  })
}

/** Полупрозрачный слой облаков (отдельная сфера чуть большего радиуса). */
function makeClouds(seed, width = 1024, height = 512) {
  const n = makeNoise3D(seed)
  const c = canvasOf(width, height)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(width, height)
  const d = img.data
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1)
    const lat = (v - 0.5) * Math.PI
    const cosLat = Math.cos(lat)
    const sy = Math.sin(lat) * 3
    for (let x = 0; x < width; x++) {
      const lon = (x / width) * Math.PI * 2
      const sx = Math.cos(lon) * cosLat * 3
      const sz = Math.sin(lon) * cosLat * 3
      // Растянутый по долготе шум имитирует зональные полосы облаков.
      const f = fbm(n, sx * 0.8, sy * 1.7, sz * 0.8, 5)
      const a = smoothstep(0.5, 0.76, f) * (0.55 + 0.45 * Math.cos(lat) ** 0.5)
      const i = (y * width + x) * 4
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
      d[i + 3] = clamp01(a) * 235
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/* ------------------------------------------------------------------ */
/* Кольца, спрайты, фон                                                */
/* ------------------------------------------------------------------ */

/** Текстура колец: горизонтальная полоса, u = радиус. */
function makeRingTexture(seed, tone) {
  const width = 1024
  const height = 8
  const n = makeNoise3D(seed)
  const c = canvasOf(width, height)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(width, height)
  const d = img.data
  // Деление Кассини и прочие «щели».
  const gaps = [
    [0.09, 0.03],
    [0.42, 0.055],
    [0.63, 0.02],
    [0.86, 0.035],
  ]
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1)
    const fine = fbm(n, t * 90, 0, 0, 4)
    const coarse = fbm(n, t * 14, 5.5, 0, 3)
    let a = 0.42 + coarse * 0.5 + fine * 0.22
    a *= smoothstep(0, 0.06, t) * (1 - smoothstep(0.93, 1, t))
    for (const [pos, w] of gaps) {
      a *= 1 - (1 - smoothstep(w * 0.35, w, Math.abs(t - pos))) * 0.94
    }
    const bright = 0.72 + fine * 0.5
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4
      d[i] = Math.min(255, tone[0] * bright)
      d[i + 1] = Math.min(255, tone[1] * bright)
      d[i + 2] = Math.min(255, tone[2] * bright)
      d[i + 3] = clamp01(a) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Мягкое круглое пятно — для звёзд, короны, туманностей. */
function makeGlow(size, stops) {
  const c = canvasOf(size, size)
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [pos, color] of stops) g.addColorStop(pos, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return c
}

/** Клочковатая туманность: несколько наложенных пятен с шумом. */
function makeNebulaTexture(seed, hue) {
  const size = 512
  const n = makeNoise3D(seed)
  const c = canvasOf(size, size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const d = img.data
  const half = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half
      const dy = (y - half) / half
      const r = Math.sqrt(dx * dx + dy * dy)
      const f = fbm(n, dx * 3, dy * 3, 0, 5)
      const cloud = smoothstep(0.38, 0.72, f)
      const falloff = 1 - smoothstep(0.15, 1, r)
      const a = cloud * falloff
      const i = (y * size + x) * 4
      d[i] = hue[0]
      d[i + 1] = hue[1]
      d[i + 2] = hue[2]
      d[i + 3] = clamp01(a) * 170
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/* ------------------------------------------------------------------ */
/* Сборка в THREE-текстуры                                             */
/* ------------------------------------------------------------------ */

function toTexture(canvas, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.ClampToEdgeWrapping
  }
  t.anisotropy = aniso
  t.needsUpdate = true
  return t
}

const hashSeed = (str) => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Сторона текстуры с учётом профиля качества (всегда чётная). */
const texSize = (base) => Math.max(128, Math.round((base * quality.textureScale) / 2) * 2)

function buildPlanet(body) {
  const big = body.radius >= 2.4 || body.id === 'earth'
  const width = texSize(big ? 1024 : 512)
  const height = width / 2
  const seed = hashSeed(body.id)

  let maps
  if (body.surface === 'earth') {
    maps = makeEarth({ width, height, seed })
  } else if (body.surface === 'gas' || body.surface === 'ice' || body.surface === 'clouds') {
    maps = makeBanded({
      width,
      height,
      seed,
      palette: body.palette,
      bands: body.bands ?? 8,
      bandAmp: body.bandAmp ?? 2.4,
      storm: body.storm ?? null,
      contrast: body.surface === 'ice' ? 0.75 : 1,
    })
  } else {
    maps = makeRocky({
      width,
      height,
      seed,
      palette: body.palette,
      craters: body.craters ?? 0,
      polarCaps: body.polarCaps ?? 0,
    })
  }

  cache.set(`${body.id}:map`, toTexture(maps.colorCanvas))
  cache.set(`${body.id}:bump`, toTexture(maps.bumpCanvas, { srgb: false }))

  if (body.clouds) {
    cache.set(`${body.id}:clouds`, toTexture(makeClouds(seed + 555, width, height)))
  }
  if (body.ring) {
    const ringTex = toTexture(makeRingTexture(seed + 21, body.ring.tone), { repeat: false })
    cache.set(`${body.id}:ring`, ringTex)
  }
}

function buildShared() {
  cache.set(
    'star',
    toTexture(
      makeGlow(64, [
        [0, 'rgba(255,255,255,1)'],
        [0.25, 'rgba(255,255,255,0.75)'],
        [0.55, 'rgba(190,215,255,0.25)'],
        [1, 'rgba(160,190,255,0)'],
      ]),
      { repeat: false, aniso: 1 }
    )
  )
  cache.set(
    'glow',
    toTexture(
      makeGlow(256, [
        [0, 'rgba(255,246,214,1)'],
        [0.16, 'rgba(255,196,92,0.82)'],
        [0.36, 'rgba(255,132,32,0.34)'],
        [0.62, 'rgba(255,86,20,0.10)'],
        [1, 'rgba(255,60,0,0)'],
      ]),
      { repeat: false, aniso: 1 }
    )
  )
  cache.set(
    'flame',
    toTexture(
      makeGlow(128, [
        [0, 'rgba(255,255,255,1)'],
        [0.22, 'rgba(180,225,255,0.85)'],
        [0.5, 'rgba(90,160,255,0.35)'],
        [1, 'rgba(40,90,255,0)'],
      ]),
      { repeat: false, aniso: 1 }
    )
  )
  const nebulae = [
    ['nebula0', [86, 60, 200]],
    ['nebula1', [30, 110, 190]],
    ['nebula2', [180, 50, 120]],
  ]
  nebulae.forEach(([key, hue], i) => {
    cache.set(key, toTexture(makeNebulaTexture(9000 + i * 137, hue), { repeat: false, aniso: 1 }))
  })
}

let running = null
let progressCb = null

/**
 * Генерирует все текстуры один раз за сессию, отдавая управление браузеру
 * между телами, чтобы полоса загрузки успевала анимироваться.
 *
 * Повторные вызовы (например, из-за React StrictMode) подписываются на уже
 * идущую генерацию, а не запускают вторую.
 */
export function generateAllTextures(bodies, onProgress) {
  progressCb = onProgress ?? null
  if (!running) running = runGeneration(bodies, (p, label) => progressCb?.(p, label))
  return running
}

async function runGeneration(bodies, onProgress) {
  const yieldToBrowser = () => new Promise((r) => setTimeout(r, 0))
  const total = bodies.length + 1

  buildShared()
  onProgress?.(1 / total, 'звёздное поле')
  await yieldToBrowser()

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i]
    if (body.id !== 'sun') buildPlanet(body)
    if (body.moons) {
      for (const moon of body.moons) {
        const seed = hashSeed(body.id + moon.name)
        const c = new THREE.Color(moon.color)
        const base = [c.r * 255, c.g * 255, c.b * 255]
        const moonWidth = texSize(256)
        const maps = makeRocky({
          width: moonWidth,
          height: moonWidth / 2,
          seed,
          palette: [
            [0.0, [base[0] * 0.35, base[1] * 0.35, base[2] * 0.35]],
            [0.5, [base[0] * 0.75, base[1] * 0.75, base[2] * 0.75]],
            [1.0, [Math.min(255, base[0] * 1.15), Math.min(255, base[1] * 1.15), Math.min(255, base[2] * 1.15)]],
          ],
          craters: 45,
        })
        cache.set(`moon:${body.id}:${moon.name}:map`, toTexture(maps.colorCanvas))
        cache.set(`moon:${body.id}:${moon.name}:bump`, toTexture(maps.bumpCanvas, { srgb: false }))
      }
    }
    onProgress?.((i + 2) / total, body.name)
    await yieldToBrowser()
  }
}
