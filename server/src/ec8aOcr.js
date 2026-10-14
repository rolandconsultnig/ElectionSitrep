/**
 * EC8A result-sheet OCR.
 *
 * Runs server-side (tesseract.js) so field devices only upload the photo —
 * no multi-megabyte OCR model download on weak networks (same lesson as the
 * liveness vision model).
 *
 * Pure helper `extractNumberRows` is exported for unit tests.
 */
import { Router } from 'express'

/**
 * Turn raw OCR text lines into a clean list of candidate figures from an
 * EC8A result sheet. Handles commas, stray letters glued to digits, and
 * drops implausible token noise (length > 6 digits → not a PU count).
 * Returns numbers in reading order (top-to-bottom, left-to-right as OCR
 * reports them).
 */
export function extractNumberRows(rawText) {
  const lines = String(rawText || '').split(/\r?\n/)
  const rows = []
  for (const line of lines) {
    const numbers = []
    // Split on whitespace and common separators, but keep digit-groups that
    // may contain embedded commas (e.g. "1,234") or OCR noise like "O"/"l".
    for (const token of line.split(/[\s|;:]+/)) {
      // Only apply OCR letter/digit confusion fixes to tokens that already
      // contain a digit — otherwise words like "Polling" turn into numbers.
      let cleaned = token
      if (/[0-9]/.test(cleaned)) {
        cleaned = cleaned
          .replace(/[OQ]/g, '0') // OCR confuses O with 0
          .replace(/[lI|]/g, '1') // …and l/I with 1
          .replace(/,/g, '')
      }
      cleaned = cleaned.replace(/[^0-9]/g, '')
      if (!cleaned) continue
      // Drop fragments longer than any plausible PU figure.
      if (cleaned.length > 6) continue
      const value = Number.parseInt(cleaned, 10)
      if (Number.isFinite(value)) numbers.push(value)
    }
    if (numbers.length) rows.push(numbers)
  }
  return rows
}

/** Flatten rows to a single reading-order list. */
export function flattenRows(rows) {
  return rows.reduce((acc, row) => acc.concat(row), [])
}

let workerPromise = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789,',
        preserve_interword_spaces: '1',
      })
      return worker
    })()
    workerPromise.catch(() => {
      workerPromise = null
    })
  }
  return workerPromise
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl || ''))
  if (!m) return null
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }
}

const OCR_TIMEOUT_MS = 45_000
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

export function createEc8aOcrRouter({ authMiddleware, requireAnyPortal }) {
  const r = Router()

  /**
   * POST /api/operations/results/ec8a/ocr
   * Body: { imageDataUrl } — JPEG/PNG data URL of the EC8A result sheet.
   * Returns: { rows, numbers, text } — figures found, in reading order.
   * The officer reviews/applies them client-side; OCR never writes results.
   */
  r.post('/ec8a/ocr', authMiddleware, requireAnyPortal('field', 'management', 'admin'), async (req, res) => {
    try {
      const parsed = parseDataUrl(req.body?.imageDataUrl)
      if (!parsed?.buffer?.length) {
        return res.status(400).json({ error: 'imageDataUrl (JPEG/PNG data URL) is required' })
      }
      if (!/^image\//.test(parsed.mime)) {
        return res.status(400).json({ error: 'imageDataUrl must be an image data URL' })
      }
      if (parsed.buffer.length > MAX_IMAGE_BYTES) {
        return res.status(400).json({ error: 'Image too large (max 12MB)' })
      }

      const worker = await getWorker()
      const result = await withTimeout(worker.recognize(parsed.buffer), OCR_TIMEOUT_MS, 'OCR timed out — try a smaller, sharper photo')
      const text = result?.data?.text ?? ''
      const rows = extractNumberRows(text)
      return res.json({
        rows,
        numbers: flattenRows(rows),
        text,
        hint: 'Figures are OCR suggestions in reading order — verify against the sheet before applying.',
      })
    } catch (e) {
      console.error('[ec8a/ocr]', e)
      return res.status(500).json({ error: e instanceof Error && e.message ? e.message : 'OCR failed' })
    }
  })

  return r
}
