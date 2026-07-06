// Pure color / analysis logic, ported from the single-file tool.
export const R = (n) => Math.round(n)

const CONTRAST_LIMITS = {
  title: 2,
  cardTop: 2,
  cardBottom: 1.5,
}
const CARD_HUE_MIN = 160
const CARD_HUE_MAX = 270
const DEFAULT_CARD_HUE = 206

export function calibrateCardHue(h) {
  if (!Number.isFinite(h)) return DEFAULT_CARD_HUE
  if (h < CARD_HUE_MIN) return CARD_HUE_MIN
  if (h > CARD_HUE_MAX) return CARD_HUE_MAX
  return h
}

export function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  let h, s, l = (mx + mn) / 2
  if (mx === mn) { h = s = 0 } else {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s * 100, l * 100]
}

export function rgb2hsb(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h, s = mx === 0 ? 0 : d / mx, v = mx
  if (d === 0) h = 0
  else {
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s * 100, v * 100]
}

export function hsb2rgb(h, s, v) {
  s /= 100; v /= 100
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c
  let r, g, b
  if (h < 60) { r = c; g = x; b = 0 } else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x } else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c } else { r = c; g = 0; b = x }
  return [R((r + m) * 255), R((g + m) * 255), R((b + m) * 255)]
}

export const hx = (r, g, b) => '#' + [r, g, b].map((x) => ('0' + x.toString(16)).slice(-2)).join('').toUpperCase()
export const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
export const rgbcss = (c) => `rgb(${c[0]},${c[1]},${c[2]})`

function relL(c) {
  const s = [c[0], c[1], c[2]].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
}
export function contrast(a, b) { const la = relL(a), lb = relL(b), hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05) }
const over = (t, b) => { const a = t[3]; return [R(t[0] * a + b[0] * (1 - a)), R(t[1] * a + b[1] * (1 - a)), R(t[2] * a + b[2] * (1 - a))] }

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function hash(data) { let h = 2166136261; for (let i = 0; i < data.length; i += 4) { h ^= data[i]; h = Math.imul(h, 16777619); h ^= data[i + 1]; h = Math.imul(h, 16777619); h ^= data[i + 2]; h = Math.imul(h, 16777619) } return h >>> 0 }

function kmeans(pts, k, rng) {
  const n = pts.length; if (!n) return []
  const cs = [pts[(rng() * n) | 0].slice()]
  while (cs.length < k) {
    const d2 = new Array(n); let sum = 0
    for (let i = 0; i < n; i++) { let m = Infinity; for (let c = 0; c < cs.length; c++) { const dd = (pts[i][0] - cs[c][0]) ** 2 + (pts[i][1] - cs[c][1]) ** 2 + (pts[i][2] - cs[c][2]) ** 2; if (dd < m) m = dd } d2[i] = m; sum += m }
    let r = rng() * sum, idx = 0; for (idx = 0; idx < n - 1; idx++) { r -= d2[idx]; if (r <= 0) break } cs.push(pts[idx].slice())
  }
  const assign = new Array(n).fill(0)
  for (let it = 0; it < 16; it++) {
    for (let i = 0; i < n; i++) { let mm = Infinity, mi = 0; for (let c = 0; c < k; c++) { const e = (pts[i][0] - cs[c][0]) ** 2 + (pts[i][1] - cs[c][1]) ** 2 + (pts[i][2] - cs[c][2]) ** 2; if (e < mm) { mm = e; mi = c } } assign[i] = mi }
    const sm = []; for (let s = 0; s < k; s++) sm.push([0, 0, 0, 0])
    for (let i = 0; i < n; i++) { const a = assign[i]; sm[a][0] += pts[i][0]; sm[a][1] += pts[i][1]; sm[a][2] += pts[i][2]; sm[a][3]++ }
    for (let c = 0; c < k; c++) if (sm[c][3]) cs[c] = [sm[c][0] / sm[c][3], sm[c][1] / sm[c][3], sm[c][2] / sm[c][3]]
  }
  const cnt = new Array(k).fill(0); for (let i = 0; i < n; i++) cnt[assign[i]]++
  return cs.map((c, i) => ({ rgb: [R(c[0]), R(c[1]), R(c[2])], count: cnt[i] })).filter((c) => c.count > 0)
}

// Dominant-color extraction (k clusters), returns clusters + palette rows.
export function extract(img, k) {
  const d = 160, w = img.naturalWidth, h = img.naturalHeight, sc = Math.min(1, d / Math.max(w, h)), cw = Math.max(1, R(w * sc)), ch = Math.max(1, R(h * sc))
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, cw, ch)
  let data; try { data = ctx.getImageData(0, 0, cw, ch).data } catch { return { clusters: [], total: 0, palette: [] } }
  const pts = []; for (let i = 0; i < data.length; i += 4) { if (data[i + 3] < 125) continue; pts.push([data[i], data[i + 1], data[i + 2]]) }
  const rng = mulberry32((hash(data) ^ (k * 2654435761)) >>> 0)
  const clusters = kmeans(pts, k, rng).sort((a, b) => b.count - a.count)
  const total = clusters.reduce((a, c) => a + c.count, 0)
  const palette = clusters.map((c) => {
    const [r, g, b] = c.rgb, p = c.count / total * 100, hsl = rgb2hsl(r, g, b), hsb = rgb2hsb(r, g, b), H = R(hsl[0])
    return { hex: hx(r, g, b), rgb: [r, g, b], hsb: [H, R(hsb[1]), R(hsb[2])], hsl: [H, R(hsl[1]), R(hsl[2])], ratio: +p.toFixed(1) }
  })
  return { clusters, total, palette }
}

export function coldRatio(clusters, total, lo, hi) {
  if (!total) return null
  let cold = 0
  clusters.forEach((c) => { const hsl = rgb2hsl(c.rgb[0], c.rgb[1], c.rgb[2]); if (hsl[0] >= lo && hsl[0] <= hi && hsl[1] > 12) cold += c.count / total * 100 })
  return cold
}

// 整体色彩感：各主色按占比加权的绝对彩度 chroma = max(R,G,B) − min(R,G,B)（满分 255）。
// chroma = 饱和度 × 明度，故同时挡住发灰（明度塌）与发白（饱和度塌）。达标线 ≥ 45。
export function chromaScore(clusters, total) {
  if (!total) return null
  let s = 0
  clusters.forEach((c) => { const [r, g, b] = c.rgb; s += (Math.max(r, g, b) - Math.min(r, g, b)) * c.count / total })
  return R(s)
}

// 内容区网格能量 → 连通块（4 邻接）；主体=最大块，其余=主体外显著前景(⑥)。
// 连续花背景会连成一整块（主体）→ 无次级块；贴上去的标题/图标/角标在平滑背景上独立成块 → 次级块。
function blobScan(cellE, gw, gh, totE) {
  let maxc = 0
  for (let i = 0; i < cellE.length; i++) if (cellE[i] > maxc) maxc = cellE[i]
  const T = maxc * 0.12, act = new Uint8Array(gw * gh)
  for (let i = 0; i < cellE.length; i++) act[i] = cellE[i] > T ? 1 : 0
  const lab = new Int32Array(gw * gh).fill(-1), blobs = [], st = []
  for (let s = 0; s < gw * gh; s++) {
    if (!act[s] || lab[s] >= 0) continue
    const id = blobs.length; let cells = 0, energy = 0, wx = 0, wy = 0
    st.push(s); lab[s] = id
    while (st.length) {
      const p = st.pop()
      const px = p % gw, py = (p / gw) | 0
      const e = cellE[p]
      cells++; energy += e; wx += (px + 0.5) * e; wy += (py + 0.5) * e
      if (px > 0 && act[p - 1] && lab[p - 1] < 0) { lab[p - 1] = id; st.push(p - 1) }
      if (px < gw - 1 && act[p + 1] && lab[p + 1] < 0) { lab[p + 1] = id; st.push(p + 1) }
      if (py > 0 && act[p - gw] && lab[p - gw] < 0) { lab[p - gw] = id; st.push(p - gw) }
      if (py < gh - 1 && act[p + gw] && lab[p + gw] < 0) { lab[p + gw] = id; st.push(p + gw) }
    }
    blobs.push({ cells, energy, cx: energy ? wx / energy : 0, cy: energy ? wy / energy : 0 })
  }
  const sig = blobs.filter((b) => b.cells >= 3).sort((a, b) => b.energy - a.energy)
  const others = sig.slice(1), secE = others.reduce((a, b) => a + b.energy, 0)
  const focus = others[0]
    ? { x: +(((others[0].cx * CELL) / 400) * 393).toFixed(1), y: +(((others[0].cy * CELL) / 648) * 636).toFixed(1) }
    : null
  return { secCount: others.length, secPct: totE ? +(secE / totE * 100).toFixed(1) : 0, blobs: sig.length, focus }
}

// Banner QC: V color + 4 checks + ⑥ 主体外显著前景 (cover-fit so any size renders/checks).
export function bannerCheck(img) {
  const cw = 400, ch = 648, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const iw = img.naturalWidth, ih = img.naturalHeight, sc = Math.max(cw / iw, ch / ih)
  ctx.drawImage(img, (cw - iw * sc) / 2, (ch - ih * sc) / 2, iw * sc, ih * sc)
  const data = ctx.getImageData(0, 0, cw, ch).data, fx = cw / 393, fy = ch / 636
  const px = (a, b, c, d) => [a * fx, b * fy, c * fx, d * fy]
  function avg(rx) {
    const x0 = Math.max(0, rx[0] | 0), y0 = Math.max(0, rx[1] | 0), x1 = Math.min(cw, rx[2] | 0), y1 = Math.min(ch, rx[3] | 0)
    let Rr = 0, G = 0, B = 0, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * cw + x) * 4; Rr += data[i]; G += data[i + 1]; B += data[i + 2]; n++ }
    return n ? [R(Rr / n), R(G / n), R(B / n)] : [128, 128, 128]
  }
  function dom(rx) {
    const x0 = Math.max(0, rx[0] | 0), y0 = Math.max(0, rx[1] | 0), x1 = Math.min(cw, rx[2] | 0), y1 = Math.min(ch, rx[3] | 0), pts = []
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * cw + x) * 4; if (data[i + 3] < 125) continue; pts.push([data[i], data[i + 1], data[i + 2]]) }
    const cl = kmeans(pts, 5, mulberry32(0x9e3779b9)).sort((a, b) => b.count - a.count)
    return cl.length ? cl[0].rgb : [128, 128, 128]
  }
  const domc = dom(px(0, 0, 393, 250)), rawHue = rgb2hsb(domc[0], domc[1], domc[2])[0], vh = calibrateCardHue(rawHue), V = hsb2rgb(vh, 25, 100)
  const Bt = avg(px(16, 189, 377, 245)), B2 = avg(px(16, 247, 377, 262)), B3 = avg(px(16, 348, 377, 363)), white = [255, 255, 255]
  const cardTop = over([255, 255, 255, 0.6], over([V[0], V[1], V[2], 0.8], B2)), cardBot = over([255, 255, 255, 0.6], over([255, 255, 255, 0.75], B3))
  const c1 = contrast(white, Bt), c2 = contrast(cardTop, B2), c3 = contrast(cardBot, B3)
  const contrastResult = (ratio, limit) => ({
    pass: ratio >= limit,
    val: ratio.toFixed(2) + ':1（需 ≥' + limit + '）',
  })
  const titleContrast = contrastResult(c1, CONTRAST_LIMITS.title)
  const cardTopContrast = contrastResult(c2, CONTRAST_LIMITS.cardTop)
  const cardBottomContrast = contrastResult(c3, CONTRAST_LIMITS.cardBottom)
  // 单遍梯度：求视觉重心(④) + 在内容区(顶 46%)累积网格能量做主体外显著块检测(⑥)
  const CY = R(ch * 0.46), CELL = 16, gw = Math.ceil(cw / CELL), gh = Math.ceil(CY / CELL)
  const cellE = new Float64Array(gw * gh); let totE = 0
  let sx = 0, sy = 0, sw = 0
  for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
    const i = (y * cw + x) * 4, ir = i + 4, id = i + cw * 4
    const w = Math.abs(data[i] - data[ir]) + Math.abs(data[i + 1] - data[ir + 1]) + Math.abs(data[i + 2] - data[ir + 2]) + Math.abs(data[i] - data[id]) + Math.abs(data[i + 1] - data[id + 1]) + Math.abs(data[i + 2] - data[id + 2])
    sx += x * w; sy += y * w; sw += w
    if (y < CY) { cellE[((y / CELL) | 0) * gw + ((x / CELL) | 0)] += w; totE += w }
  }
  const cxf = sw ? sx / sw / cw : 0.5, cyf = sw ? sy / sw / ch : 0.5
  const clutter = blobScan(cellE, gw, gh, totE)
  return {
    V, sizeOk: iw === 800 && ih === 1296, clutter,
    checks: [
      { key: 'title', name: '① 标题对比度', pass: titleContrast.pass, val: titleContrast.val, sw: [['白字', white], ['背景', Bt]] },
      { key: 'cardtop', name: '② 卡片上缘', pass: cardTopContrast.pass, val: cardTopContrast.val, sw: [['卡片顶', cardTop], ['背景', B2]] },
      { key: 'cardbot', name: '③ 卡片下缘', pass: cardBottomContrast.pass, val: cardBottomContrast.val, sw: [['卡片底', cardBot], ['背景', B3]] },
      { key: 'comp', name: '④ 主体居右', pass: cxf >= 0.5, val: '视觉重心 x = ' + R(cxf * 100) + '%（需 ≥50%）', sw: [] },
    ],
    cxf, cyf, V_rgb: V,
  }
}
