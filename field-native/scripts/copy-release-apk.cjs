'use strict'
const fs = require('fs')
const path = require('path')

function copyReleaseApk() {
  const root = path.join(__dirname, '..')
  const apk = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk')
  const outDir = path.join(root, 'releases')
  const outFile = path.join(outDir, 'npf-sitrep-field-release.apk')

  if (!fs.existsSync(apk)) {
    console.error('[copy-release-apk] Expected file missing (build release first):\n  ' + apk)
    process.exit(1)
  }
  fs.mkdirSync(outDir, { recursive: true })
  fs.copyFileSync(apk, outFile)
  console.log('[copy-release-apk] Wrote ' + outFile)
}

module.exports = { copyReleaseApk }

if (require.main === module) {
  copyReleaseApk()
}
