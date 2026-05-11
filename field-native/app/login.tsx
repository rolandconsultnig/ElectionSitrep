import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { getApiBaseUrl } from '../lib/config'
import { pingApiHealth } from '../lib/ping-api'
import { colors, radii, space } from '../lib/theme'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import Constants from 'expo-constants'
import { Redirect, router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
  const [deviceOffline, setDeviceOffline] = useState(false)
  const [pingBusy, setPingBusy] = useState(false)
  const [pingLine, setPingLine] = useState<string | null>(null)
  const [pingOk, setPingOk] = useState<boolean | null>(null)

  useEffect(() => {
    const sub = NetInfo.addEventListener((s: NetInfoState) => {
      setDeviceOffline(s.isConnected === false)
    })
    void NetInfo.fetch().then((s: NetInfoState) => setDeviceOffline(s.isConnected === false))
    return () => sub()
  }, [])

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

  async function onPing() {
    setPingBusy(true)
    setPingLine(null)
    setPingOk(null)
    const base = getApiBaseUrl()
    const r = await pingApiHealth(base)
    setPingBusy(false)
    setPingOk(r.ok)
    if (r.ok && r.latencyMs != null) {
      setPingLine(`Ping OK — ${r.latencyMs} ms\n${base}`)
    } else {
      setPingLine(`${r.message}\n${base}`)
    }
  }

  async function onSubmit() {
    setError(null)
    if (identifier.trim() === CONFIG_DIAL_CODE) {
      router.push('/network-settings')
      setIdentifier('')
      return
    }
    if (deviceOffline) {
      setError('No internet on this device. Check Wi‑Fi or mobile data, then try again.')
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.kicker}>NPF Election SitRep</Text>
          <Text style={styles.title}>Field officer sign-in</Text>
          <Text style={styles.sub}>Use your issued username or service number.</Text>

          {deviceOffline ? (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineText}>No internet connection. Connect Wi‑Fi or mobile data.</Text>
            </View>
          ) : null}

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

            <Pressable
              onPress={onPing}
              disabled={pingBusy || busy}
              style={({ pressed }) => [styles.btnPing, (pressed || pingBusy) && { opacity: 0.88 }]}
            >
              <Text style={styles.btnPingText}>{pingBusy ? 'Pinging API…' : 'Ping API (test network)'}</Text>
            </Pressable>

            {pingLine ? (
              <Text style={[styles.pingOut, pingOk ? styles.pingOk : styles.pingBad]}>{pingLine}</Text>
            ) : null}
          </View>

          <Pressable onPress={() => router.push('/network-settings')} style={styles.linkNet}>
            <Text style={styles.linkNetText}>Network settings (server IP / port)</Text>
          </Pressable>

          <Text style={styles.foot}>
            Wrong server? Enter <Text style={styles.footMono}>*2435*009#</Text> as username to open Network settings. App
            default API: <Text style={styles.footMono}>{defaultApiHint()}</Text>
          </Text>
          <Text style={[styles.foot, { marginTop: space.sm }]}>Need help? Contact your system administrator.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: space.lg, paddingBottom: space.xl * 2, justifyContent: 'center' },
  offlineBanner: {
    backgroundColor: '#fde8e8',
    borderRadius: radii.md,
    padding: space.md,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  offlineText: { color: colors.danger, fontSize: 14, fontWeight: '600', lineHeight: 20 },
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
  btnPing: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
  },
  btnPingText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  pingOut: { marginTop: space.sm, fontSize: 12, lineHeight: 18 },
  pingOk: { color: colors.success },
  pingBad: { color: colors.danger },
  linkNet: { marginTop: space.md, alignItems: 'center', paddingVertical: space.sm },
  linkNetText: { color: colors.primary, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  foot: { marginTop: space.lg, fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18 },
  footMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
})
