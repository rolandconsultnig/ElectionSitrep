import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'

import { useAuth } from '@/context/auth'

export default function NeedsOnboardingScreen() {
  const { bootstrapping, user, logout } = useAuth()
  const router = useRouter()

  if (bootstrapping) return null
  if (!user) return <Redirect href="/login" />
  if (user.onboardingComplete) return <Redirect href="/(tabs)" />

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Welcome, {user.username}</Text>
      <Text style={styles.body}>
        Complete your profile setup to start submitting Situation Reports from the field.
        This includes your name, service number, live photo verification, and password creation.
      </Text>
      <Pressable style={styles.btnPrimary} onPress={() => router.push('/onboarding')}>
        <Text style={styles.btnPrimaryText}>Complete Profile Setup</Text>
      </Pressable>
      <Pressable style={styles.btn} onPress={() => void logout()}>
        <Text style={styles.btnText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0a1628',
    padding: 24,
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#e8edf5', marginBottom: 12 },
  body: { fontSize: 15, color: '#8a9ab8', lineHeight: 22, marginBottom: 24 },
  btnPrimary: {
    backgroundColor: '#0dccb0',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  btnPrimaryText: { color: '#0a1628', fontWeight: '700', fontSize: 16 },
  btn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: '#e8edf5', fontWeight: '600' },
})
