import { AuthProvider, useAuth } from '../lib/auth-context'
import { colors } from '../lib/theme'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient()

function NavStack() {
  const { ready } = useAuth()
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {})
  }, [ready])

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, title: 'Sign in' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, title: 'Profile' }} />
        <Stack.Screen name="tally/[slug]" options={{ title: 'PU tally', headerShown: true }} />
      </Stack>
      {!ready && (
        <View
          style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }]}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </>
  )
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NavStack />
      </AuthProvider>
    </QueryClientProvider>
  )
}
