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
