const MAX_INPUT_BYTES = 2 * 1024 * 1024
const MAX_OUTPUT_CHARS = 550_000

/**
 * Raster: resize to fit max side, encode PNG then JPEG if still large.
 * SVG: store as UTF-8 data URL (no rasterisation).
 */
export async function imageFileToDataUrl(file: File): Promise<string> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image is too large (maximum 2 MB before processing).')
  }

  if (file.type === 'image/svg+xml') {
    const text = await file.text()
    if (text.length > 400_000) throw new Error('SVG file is too large.')
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPEG, WebP, or SVG).')
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      try {
        const maxSide = 320
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.round(img.naturalWidth * scale)
        const h = Math.round(img.naturalHeight * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not process image.'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)

        let dataUrl = canvas.toDataURL('image/png')
        if (dataUrl.length > MAX_OUTPUT_CHARS) {
          let q = 0.85
          while (dataUrl.length > MAX_OUTPUT_CHARS && q > 0.45) {
            dataUrl = canvas.toDataURL('image/jpeg', q)
            q -= 0.08
          }
        }
        if (dataUrl.length > MAX_OUTPUT_CHARS + 100_000) {
          reject(new Error('Image is still too large after resizing. Try a smaller file.'))
          return
        }
        resolve(dataUrl)
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Could not process image.'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read this image.'))
    }
    img.src = objectUrl
  })
}
