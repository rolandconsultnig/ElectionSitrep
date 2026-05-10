import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { colors, radii, space } from '../lib/theme'
import Constants from 'expo-constants'
import { Redirect, router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const CONFIG_DIAL_CODE = '*2435*009#'

function defaultApiHint(): string {
  const raw = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl
  if (raw && String(raw).trim()) return String(raw).trim()
  return 'http://localhost:5530'
}

export default function LoginScreen() {
  const { token, user, ready, signIn } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const u = identifier.trim()
    if (u === CONFIG_DIAL_CODE) {
      setIdentifier('')
      setError(null)
      router.push('/network-settings')
    }
  }, [identifier])

  if (!ready) return null
  if (token && user?.portalId === 'field') {
    if (!user.onboardingComplete || user.passwordMustChange) return <Redirect href="/onboarding" />
    return <Redirect href="/" />
  }
  if (token && user?.portalId !== 'field') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <Text style={styles.title}>Wrong portal</Text>
          <Text style={styles.body}>Use the Field officer account issued by Command.</Text>
        </View>
      </SafeAreaView>
    )
  }

  async function onSubmit() {
    setError(null)
    if (identifier.trim() === CONFIG_DIAL_CODE) {
      router.push('/network-settings')
      setIdentifier('')
      return
    }
    setBusy(true)
    try {
      await signIn(identifier, password)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not sign in.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.wrap}>
          <Text style={styles.kicker}>NPF Election SitRep</Text>
          <Text style={styles.title}>Field officer sign-in</Text>
          <Text style={styles.sub}>Use your issued username or service number.</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Username or service number</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="e.g. field.rank.ab12cd"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={[styles.label, { marginTop: space.md }]}>Password</Text>
            <TextInput
              secureTextEntry
              editable={!busy}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            {error ? <Text style={styles.err}>{error}</Text> : null}

            <Pressable
              onPress={onSubmit}
              disabled={busy || !identifier.trim() || !password}
              style={({ pressed }) => [styles.btn, (pressed || busy) && { opacity: 0.85 }]}
            >
              <Text style={styles.btnText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
            </Pressable>
          </View>

          <Text style={styles.foot}>
            Wrong server? Enter <Text style={styles.footMono}>*2435*009#</Text> as username to open Network settings. App
            default API: <Text style={styles.footMono}>{defaultApiHint()}</Text>
          </Text>
          <Text style={[styles.foot, { marginTop: space.sm }]}>Need help? Contact your system administrator.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { flex: 1, padding: space.lg, justifyContent: 'center' },
  kicker: { fontSize: 13, color: colors.muted, marginBottom: space.xs, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: space.sm },
  body: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  sub: { fontSize: 15, color: colors.muted, marginBottom: space.xl, lineHeight: 22 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: space.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fafbfc',
  },
  err: { color: colors.danger, marginTop: space.md, fontSize: 14 },
  btn: {
    marginTop: space.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  foot: { marginTop: space.xl, fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18 },
  footMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
})
