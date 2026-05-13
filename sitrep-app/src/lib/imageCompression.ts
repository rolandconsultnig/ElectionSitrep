/**
 * Client-side image compression utilities
 * Reduces upload size while maintaining acceptable quality
 */

export interface CompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number // 0-1, default 0.85
  maxSizeBytes?: number // Target max file size
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.85,
  maxSizeBytes: 2 * 1024 * 1024, // 2MB
}

/**
 * Compress an image file or data URL
 * Returns compressed JPEG as data URL
 */
export async function compressImage(
  source: File | string,
  options: CompressionOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Load image
  const img = await loadImage(source)

  // Calculate new dimensions maintaining aspect ratio
  let { width, height } = img
  const aspectRatio = width / height

  if (width > opts.maxWidth) {
    width = opts.maxWidth
    height = width / aspectRatio
  }
  if (height > opts.maxHeight) {
    height = opts.maxHeight
    width = height * aspectRatio
  }

  // Draw to canvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')

  ctx.drawImage(img, 0, 0, width, height)

  // Compress with quality adjustment if needed
  let quality = opts.quality
  let dataUrl = canvas.toDataURL('image/jpeg', quality)

  // If still too large, reduce quality further
  while (getDataUrlSize(dataUrl) > opts.maxSizeBytes && quality > 0.3) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }

  return dataUrl
}

/**
 * Load an image from File or data URL
 */
function loadImage(source: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))

    if (typeof source === 'string') {
      img.src = source
    } else {
      const reader = new FileReader()
      reader.onload = (e) => {
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(source)
    }
  })
}

/**
 * Get approximate size of data URL in bytes
 */
function getDataUrlSize(dataUrl: string): number {
  // Remove data URL prefix and calculate base64 size
  const base64 = dataUrl.split(',')[1] || ''
  return Math.ceil((base64.length * 3) / 4)
}

/**
 * Compress profile picture (smaller size for avatars)
 */
export async function compressProfilePicture(source: File | string): Promise<string> {
  return compressImage(source, {
    maxWidth: 640,
    maxHeight: 640,
    quality: 0.8,
    maxSizeBytes: 512 * 1024, // 512KB max for profile pics
  })
}

/**
 * Compress party logo
 */
export async function compressPartyLogo(source: File | string): Promise<string> {
  return compressImage(source, {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.9,
    maxSizeBytes: 256 * 1024, // 256KB for logos
  })
}

/**
 * Compress document/ID scan
 */
export async function compressDocument(source: File | string): Promise<string> {
  return compressImage(source, {
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.9,
    maxSizeBytes: 5 * 1024 * 1024, // 5MB for documents
  })
}
