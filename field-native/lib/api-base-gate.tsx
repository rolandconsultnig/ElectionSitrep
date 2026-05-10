import { hydrateApiBaseFromStorage } from './server-settings'
import { colors } from './theme'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

/** Loads persisted server IP/port before auth or API calls run. */
export function ApiBaseGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await hydrateApiBaseFromStorage()
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])
  if (!ready) {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }
  return <>{children}</>
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
})
