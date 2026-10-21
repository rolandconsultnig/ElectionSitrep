'use strict'
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const androidDir = path.join(root, 'android')
const isWin = process.platform === 'win32'
const gradlew = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew')

if (!fs.existsSync(gradlew)) {
  console.error('[run-release-build] Missing', gradlew, '- run npx expo prebuild --platform android first')
  process.exit(1)
}

// Re-apply pinned-cert network config after prebuild --clean wipes android/.
// Source of truth: android-config/ (cert + xml) — see network_security_config.xml comment.
const cfgDir = path.join(root, 'android-config')
const certSrc = path.join(cfgDir, 'election_sitrep.crt')
const xmlSrc = path.join(cfgDir, 'network_security_config.xml')
if (fs.existsSync(certSrc) && fs.existsSync(xmlSrc)) {
  const rawDir = path.join(androidDir, 'app/src/main/res/raw')
  const xmlDir = path.join(androidDir, 'app/src/main/res/xml')
  fs.mkdirSync(rawDir, { recursive: true })
  fs.mkdirSync(xmlDir, { recursive: true })
  fs.copyFileSync(certSrc, path.join(rawDir, 'election_sitrep.crt'))
  fs.copyFileSync(xmlSrc, path.join(xmlDir, 'network_security_config.xml'))
  const manifest = path.join(androidDir, 'app/src/main/AndroidManifest.xml')
  let xml = fs.readFileSync(manifest, 'utf8')
  if (!xml.includes('android:networkSecurityConfig')) {
    xml = xml.replace('<application ', '<application android:networkSecurityConfig="@xml/network_security_config" ')
    fs.writeFileSync(manifest, xml)
  }
  console.log('[run-release-build] Applied network security config (pinned server cert)')
}

process.env.NODE_ENV = process.env.NODE_ENV || 'production'

const child = isWin
  ? spawnSync('cmd', ['/c', 'gradlew.bat', 'assembleRelease'], {
      cwd: androidDir,
      env: process.env,
      stdio: 'inherit',
    })
  : spawnSync(gradlew, ['assembleRelease'], {
      cwd: androidDir,
      env: process.env,
      stdio: 'inherit',
    })

if (child.status !== 0) {
  process.exit(child.status ?? 1)
}

const { copyReleaseApk } = require('./copy-release-apk.cjs')
copyReleaseApk()
