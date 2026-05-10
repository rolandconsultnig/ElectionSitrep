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
subprojects { sub ->
    sub.pluginManager.withPlugin('com.android.library') {
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
