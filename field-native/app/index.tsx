import { Redirect } from 'expo-router'

import { useAuth } from '@/context/auth'

export default function Index() {
  const { bootstrapping, user } = useAuth()

  if (bootstrapping) return null

  if (!user) return <Redirect href="/login" />
  if (!user.onboardingComplete) return <Redirect href="/needs-onboarding" />

  return <Redirect href="/(tabs)" />
}
