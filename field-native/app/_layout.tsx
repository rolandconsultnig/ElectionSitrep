import { ErrorBoundary } from '../components/ErrorBoundary'
import { CallOverlay } from '../components/tactical/CallOverlay'
import { ApiBaseGate } from '../lib/api-base-gate'
import { AuthProvider, useAuth } from '../lib/auth-context'
import { SocketProvider } from '../lib/socket-context'
import { colors, tactical } from '../lib/theme'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Updates from 'expo-updates'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient()

function useOtaUpdates() {
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const update = await Updates.checkForUpdateAsync()
        if (cancelled) return
        if (update.isAvailable) {
          setStatus('downloading')
          await Updates.fetchUpdateAsync()
          if (cancelled) return
          setStatus('reload')
          await Updates.reloadAsync()
        }
      } catch {
        // OTA check failed (offline, server down, no update) — silently continue
      }
    }
    void check()
    return () => { cancelled = true }
  }, [])
  return status
}

function NavStack() {
  const { ready, token, user } = useAuth()
  const otaStatus = useOtaUpdates()
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])
  // Failsafe: never leave the splash up if startup stalls (offline, hung fetch,
  // module issue). After 8s the app must be usable regardless.
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 8000)
    return () => clearTimeout(t)
  }, [])

  return (
    <SocketProvider token={token} userId={user?.id ?? null} username={user?.username ?? null}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, contentStyle: { backgroundColor: tactical.bg } }} />
        <Stack.Screen
          name="login"
          options={{ headerShown: false, title: 'Sign in', contentStyle: { backgroundColor: tactical.bg } }}
        />
        <Stack.Screen name="onboarding" options={{ headerShown: false, title: 'Profile' }} />
        <Stack.Screen name="network-settings" options={{ title: 'Network settings', headerShown: true }} />
        <Stack.Screen name="messages" options={{ title: 'Messages from Command', headerShown: true }} />
        <Stack.Screen name="tally/[slug]" options={{ title: 'PU tally', headerShown: true }} />
        <Stack.Screen name="safety" options={{ title: 'Safety · SOS & check-in', headerShown: true }} />
        <Stack.Screen name="sitrep" options={{ title: 'Submit SitRep', headerShown: true }} />
        <Stack.Screen name="incident" options={{ title: 'Report incident', headerShown: true }} />
        <Stack.Screen name="violence" options={{ title: 'Violence & disturbance', headerShown: true }} />
        <Stack.Screen name="timeline" options={{ title: 'Operational timeline', headerShown: true }} />
        <Stack.Screen name="ec8a" options={{ title: 'EC8A evidence & tally', headerShown: true }} />
        <Stack.Screen name="materials" options={{ title: 'Sensitive materials log', headerShown: true }} />
        <Stack.Screen name="shifts" options={{ title: 'Relief & shift handover', headerShown: true }} />
        <Stack.Screen name="logistics" options={{ title: 'Logistics requests', headerShown: true }} />
        <Stack.Screen name="turnout" options={{ title: 'Voter turnout', headerShown: true }} />
        <Stack.Screen name="reference" options={{ title: 'Parties & candidates', headerShown: true }} />
        <Stack.Screen name="history" options={{ title: 'Submission history', headerShown: true }} />
      </Stack>
      {!ready && (
        <View
          style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: tactical.bg }]}
        >
          <ActivityIndicator size="large" color={tactical.cyan} />
        </View>
      )}
      {otaStatus ? (
        <View style={styles.otaBanner}>
          <ActivityIndicator size="small" color={tactical.cyan} />
          <Text style={styles.otaText}>
            {otaStatus === 'downloading' ? 'Downloading update…' : 'Applying update…'}
          </Text>
        </View>
      ) : null}
      <CallOverlay />
    </SocketProvider>
  )
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ApiBaseGate>
          <AuthProvider>
            <NavStack />
          </AuthProvider>
        </ApiBaseGate>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  otaBanner: {
    position: 'absolute',
    top: 50,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(10,20,36,0.96)',
    borderWidth: 1,
    borderColor: tactical.borderStrong,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  otaText: { fontSize: 13, fontWeight: '600', color: tactical.cyan, letterSpacing: 0.3 },
})
