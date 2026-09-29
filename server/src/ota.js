import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

/**
 * Self-hosted Expo Updates (protocol v1) for the field app.
 * Layout: <OTA_DIR>/<runtimeVersion>/<updateId>/ — output of `expo export`
 * plus expoConfig.json. The newest directory (by name) is served.
 */
export function createOtaRouter(otaDir) {
  const router = express.Router()

  function latestUpdateDir(runtimeVersion) {
    const base = path.join(otaDir, runtimeVersion)
    if (!/^[\w.-]+$/.test(runtimeVersion) || !fs.existsSync(base)) return null
    const dirs = fs
      .readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(base, d.name, 'metadata.json')))
      .map((d) => d.name)
      .sort()
    return dirs.length ? dirs[dirs.length - 1] : null
  }

  function hashFile(file, algo, encoding) {
    return createHash(algo).update(fs.readFileSync(file)).digest(encoding)
  }

  function uuidFromHash(hex) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  }

  function assetEntry(req, runtimeVersion, updateId, dir, relPath, ext, isLaunch) {
    const file = path.join(dir, relPath)
    const origin = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`
    const q = new URLSearchParams({ runtime: runtimeVersion, update: updateId, path: relPath })
    return {
      hash: hashFile(file, 'sha256', 'base64url'),
      key: hashFile(file, 'md5', 'hex'),
      fileExtension: `.${ext}`,
      contentType: isLaunch ? 'application/javascript' : express.static.mime.lookup(ext),
      url: `${origin}/api/ota/assets?${q.toString()}`,
    }
  }

  router.get('/manifest', (req, res) => {
    const platform = req.get('expo-platform') || req.query.platform
    const runtimeVersion = req.get('expo-runtime-version') || req.query['runtime-version']
    if (platform !== 'android' || !runtimeVersion) {
      return res.status(400).json({ error: 'Unsupported platform or missing runtime version' })
    }
    const updateId = latestUpdateDir(String(runtimeVersion))
    if (!updateId) return res.status(404).json({ error: 'No update for this runtime version' })

    const dir = path.join(otaDir, String(runtimeVersion), updateId)
    const metadataRaw = fs.readFileSync(path.join(dir, 'metadata.json'))
    const meta = JSON.parse(metadataRaw.toString()).fileMetadata.android
    const expoConfigFile = path.join(dir, 'expoConfig.json')
    const expoConfig = fs.existsSync(expoConfigFile) ? JSON.parse(fs.readFileSync(expoConfigFile, 'utf8')) : {}

    const manifest = {
      id: uuidFromHash(createHash('sha256').update(metadataRaw).digest('hex')),
      createdAt: fs.statSync(path.join(dir, 'metadata.json')).mtime.toISOString(),
      runtimeVersion: String(runtimeVersion),
      launchAsset: assetEntry(req, runtimeVersion, updateId, dir, meta.bundle, 'bundle', true),
      assets: meta.assets.map((a) => assetEntry(req, runtimeVersion, updateId, dir, a.path, a.ext, false)),
      metadata: {},
      extra: { expoClient: expoConfig },
    }

    const boundary = `ota-${Date.now().toString(16)}`
    const body =
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="manifest"\r\n' +
      'Content-Type: application/json; charset=utf-8\r\n\r\n' +
      `${JSON.stringify(manifest)}\r\n` +
      `--${boundary}--\r\n`
    res.set({
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',
      'cache-control': 'private, max-age=0',
      'content-type': `multipart/mixed; boundary=${boundary}`,
    })
    res.send(Buffer.from(body, "utf8"))
  })

  router.get('/assets', (req, res) => {
    const { runtime, update, path: relPath } = req.query
    if (![runtime, update, relPath].every((v) => typeof v === 'string' && v)) {
      return res.status(400).json({ error: 'Missing parameters' })
    }
    if (!/^[\w.-]+$/.test(runtime) || !/^[\w.-]+$/.test(update)) {
      return res.status(400).json({ error: 'Invalid parameters' })
    }
    const dir = path.join(otaDir, runtime, update)
    const file = path.resolve(dir, relPath)
    if (!file.startsWith(dir + path.sep) || !fs.existsSync(file)) {
      return res.status(404).json({ error: 'Asset not found' })
    }
    res.set('cache-control', 'public, max-age=31536000, immutable')
    res.sendFile(file)
  })

  return router
}
