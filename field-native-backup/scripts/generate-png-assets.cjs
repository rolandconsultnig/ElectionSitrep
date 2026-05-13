'use strict'
/**
 * Generates solid PNG placeholders (PNG only — no WEBP).
 */
const fs = require('fs')
const path = require('path')

let PNG
try {
  PNG = require('pngjs').PNG || require('pngjs/browser').PNG
} catch {
  console.warn('[generate-png-assets] pngjs missing — skip (run npm install)')
  process.exit(0)
}

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'assets', 'images')

function fill(png, hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2
      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
      png.data[i + 3] = 255
    }
  }
}

function accentBar(png, accent) {
  const mr = parseInt(accent.slice(1, 3), 16)
  const mg = parseInt(accent.slice(3, 5), 16)
  const mb = parseInt(accent.slice(5, 7), 16)
  const w = png.width
  const h = png.height
  const margin = Math.floor(Math.min(w, h) * 0.18)
  const x0 = margin
  const y0 = Math.floor(h * 0.35)
  const x1 = w - margin
  const y1 = Math.floor(h * 0.65)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (w * y + x) << 2
      png.data[i] = mr
      png.data[i + 1] = mg
      png.data[i + 2] = mb
      png.data[i + 3] = 255
    }
  }
}

function writePng(name, w, h, bg, withAccent) {
  return new Promise((resolve, reject) => {
    const png = new PNG({ width: w, height: h })
    fill(png, bg)
    if (withAccent) accentBar(png, '#1a4b8c')
    const target = path.join(OUT, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const out = fs.createWriteStream(target)
    out.on('finish', resolve)
    out.on('error', reject)
    png.pack().pipe(out)
  })
}

async function main() {
  const bg = '#f4f6f9'
  await writePng('icon.png', 1024, 1024, bg, true)
  await writePng('adaptive-icon.png', 1024, 1024, bg, true)
  await writePng('splash-icon.png', 512, 512, bg, true)
  await writePng('favicon.png', 48, 48, bg, false)
  console.log('[generate-png-assets] Wrote PNG assets under', OUT)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
