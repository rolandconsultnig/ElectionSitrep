/**
 * Force minSdkVersion 24 on all Android library subprojects so CMake/prefab resolves
 * //ReactAndroid/hermestooling (RN 0.81+) without CXX1214 (user minSdk 22 vs 24).
 */
const { withProjectBuildGradle } = require('@expo/config-plugins')

const MARKER = '// [expo] withAndroidLibraryMinSdk'

function withAndroidLibraryMinSdk(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg
    if (cfg.modResults.contents.includes(MARKER)) return cfg

    cfg.modResults.contents += `

${MARKER}
// Full side-by-side NDK (often 27.1.* is stub-only → CXX5101/CXX1214 CMake failures)
try {
  rootProject.ext.ndkVersion = '27.3.13750724'
} catch (Throwable ignored) { }

subprojects { sub ->
    sub.pluginManager.withPlugin('com.android.library') {
        sub.android.defaultConfig.minSdkVersion 24
    }
    sub.pluginManager.withPlugin('com.android.application') {
        sub.android.defaultConfig.minSdkVersion 24
    }
}
`
    return cfg
  })
}

module.exports = function (config) {
  return withAndroidLibraryMinSdk(config)
}
