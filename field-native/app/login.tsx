import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Redirect } from 'expo-router'

import { useAuth } from '@/context/auth'

export default function LoginScreen() {
  const { bootstrapping, user, apiConfigured, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (bootstrapping) return null
  if (user?.onboardingComplete) return <Redirect href="/(tabs)" />
  if (user && !user.onboardingComplete) return <Redirect href="/needs-onboarding" />

  async function onSubmit() {
    setError(null)
    setBusy(true)
    const r = await login(username, password)
    setBusy(false)
    if (!r.ok) setError(r.error)
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.wrap}
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>NPF · Field agent</Text>
        <Text style={styles.title}>Sign in</Text>
        {!apiConfigured ? (
          <Text style={styles.warn}>
            Set EXPO_PUBLIC_API_BASE_URL before building (e.g. http://10.0.2.2:5530 for Android emulator pointing at your PC API).
          </Text>
        ) : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <Text style={styles.label}>Username</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          placeholder="Assigned username"
          placeholderTextColor="#6b7a96"
          style={styles.input}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#6b7a96"
          style={styles.input}
        />
        <Pressable style={[styles.btn, busy && styles.btnDisabled]} disabled={busy} onPress={onSubmit}>
          {busy ? <ActivityIndicator color="#0a1628" /> : <Text style={styles.btnText}>Continue</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0a1628',
    justifyContent: 'center',
    padding: 24,
  },
  card: { maxWidth: 420, width: '100%', alignSelf: 'center' },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#0dccb0',
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '700', color: '#e8edf5', marginBottom: 16 },
  label: { fontSize: 12, color: '#8a9ab8', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#e8edf5',
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  btn: {
    marginTop: 8,
    backgroundColor: '#0dccb0',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#0a1628', fontWeight: '700', fontSize: 16 },
  err: { color: '#f87171', marginBottom: 12, fontSize: 14 },
  warn: { color: '#fbbf24', marginBottom: 14, fontSize: 13, lineHeight: 18 },
})
