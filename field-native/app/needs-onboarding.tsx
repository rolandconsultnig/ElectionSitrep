import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Redirect } from 'expo-router'

import { useAuth } from '@/context/auth'

export default function NeedsOnboardingScreen() {
  const { bootstrapping, user, logout } = useAuth()

  if (bootstrapping) return null
  if (!user) return <Redirect href="/login" />
  if (user.onboardingComplete) return <Redirect href="/(tabs)" />

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Finish onboarding first</Text>
      <Text style={styles.body}>
        Your account needs one-time profile setup on the web portal (photo, service number, password). After that you can use this
        native app fully offline-capable.
      </Text>
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
  btn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: '#e8edf5', fontWeight: '600' },
})
