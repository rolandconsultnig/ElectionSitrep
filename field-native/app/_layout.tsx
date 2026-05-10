import { DarkTheme, ThemeProvider } from '@react-navigation/native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

import { AuthProvider } from '@/context/auth'

const queryClient = new QueryClient()

const navDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#0dccb0',
    background: '#0a1628',
    card: '#0f1f36',
    text: '#e8edf5',
    border: 'rgba(255,255,255,0.08)',
    notification: '#f59e0b',
  },
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={navDark}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a1628' } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="needs-onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="violence"
              options={{
                headerShown: true,
                title: 'Violence report',
                presentation: 'modal',
                headerStyle: { backgroundColor: '#0f1f36' },
                headerTintColor: '#e8edf5',
              }}
            />
          </Stack>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
