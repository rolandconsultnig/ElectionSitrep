import { Emblem } from '../components/tactical/Emblem'
import {
  Backdrop,
  GhostButton,
  GlowButton,
  Kicker,
  nativeDriver,
  Notice,
  StatusPill,
  TacticalInput,
} from '../components/tactical/primitives'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { mono, tactical as t } from '../lib/theme'
import { useLightStatusBar } from '../lib/use-light-status-bar'
import { Ionicons } from '@expo/vector-icons'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import Constants from 'expo-constants'
import { Redirect, router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const CONFIG_DIAL_CODE = '*2435*009#'

/** Staggered rise-in for the hero and the form. */
function useEntrance(count: number) {
  const vals = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current
  useEffect(() => {
    Animated.stagger(
      90,
      vals.map((v) =>
        Animated.timing(v, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }),
      ),
    ).start()
  }, [vals])
  return (i: number) => ({
    opacity: vals[i],
    transform: [{ translateY: vals[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  })
}

export default function LoginScreen() {
  const { token, user, ready, signIn, signOut } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deviceOffline, setDeviceOffline] = useState(false)
  const [bootstrapTimeout, setBootstrapTimeout] = useState(false)
  const enter = useEntrance(4)
  useLightStatusBar()

  // Force show login after 3 seconds even if auth context is still loading
  useEffect(() => {
    const timer = setTimeout(() => setBootstrapTimeout(true), 3000)
    return () => clearTimeout(timer)
  }, [])

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
    }
  }, [identifier])

  // Show loading state during bootstrap, with timeout fallback
  if (!ready && !bootstrapTimeout) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Backdrop />
        <ActivityIndicator size="large" color={t.cyan} />
        <Text style={styles.loadingText}>Establishing secure link…</Text>
      </View>
    )
  }
  if (token && user?.portalId === 'field') {
    if (!user.onboardingComplete || user.passwordMustChange) return <Redirect href="/onboarding" />
    return <Redirect href="/" />
  }
  if (token && user?.portalId !== 'field') {
    return (
      <View style={[styles.fill, styles.center, { padding: 24 }]}>
        <Backdrop />
        <View style={[styles.card, { alignSelf: 'stretch' }]}>
          <Notice tone="warning" icon="swap-horizontal-outline" title="Wrong portal">
            Use the Field officer account issued by Command.
          </Notice>
          <View style={{ height: 16 }} />
          <GhostButton title="Sign out" icon="log-out-outline" onPress={() => void signOut()} />
        </View>
      </View>
    )
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

  const version = Constants.expoConfig?.version ?? '1.0.0'

  return (
    <View style={styles.fill}>
      <Backdrop />
      <SafeAreaView style={styles.fill}>
        <View style={styles.topBar}>
          {deviceOffline ? (
            <StatusPill tone="danger" label="No network" icon="cloud-offline-outline" />
          ) : (
            <StatusPill tone="success" label="Secure link" pulse />
          )}
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[styles.hero, enter(0)]}>
              <Emblem size={150} badgeSource={require('../assets/images/police.png')} />
            </Animated.View>

            <Animated.View style={[{ alignItems: 'center' }, enter(1)]}>
              <Kicker>Nigeria Police Force</Kicker>
              <Text style={styles.title}>
                SitRep <Text style={{ color: t.gold }}>Field</Text>
              </Text>
              <View style={styles.flagBar} accessibilityLabel="Nigeria Police Force colours">
                <View style={[styles.flagSeg, { backgroundColor: '#003DA5' }]} />
                <View style={[styles.flagSeg, { backgroundColor: t.gold }]} />
                <View style={[styles.flagSeg, { backgroundColor: '#007A3D' }]} />
              </View>
              <Text style={styles.sub}>Election security operations — polling-unit intelligence, straight to Force HQ.</Text>
            </Animated.View>

            {deviceOffline ? (
              <Animated.View style={[{ marginBottom: 14 }, enter(2)]}>
                <Notice tone="danger" icon="cloud-offline-outline" title="You're offline">
                  Connect Wi‑Fi or mobile data to sign in.
                </Notice>
              </Animated.View>
            ) : null}

            <Animated.View style={[styles.card, enter(2)]}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Officer sign-in</Text>
                <View style={styles.encrypted}>
                  <Ionicons name="lock-closed" size={10} color={t.success} />
                  <Text style={styles.encryptedText}>TLS</Text>
                </View>
              </View>

              <TacticalInput
                label="Username or service number"
                icon="person-outline"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="e.g. field.rank.ab12cd"
                returnKeyType="next"
                error={!!error}
              />
              <View style={{ height: 16 }} />
              <TacticalInput
                label="Password"
                icon="key-outline"
                secure
                editable={!busy}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                returnKeyType="go"
                onSubmitEditing={() => void onSubmit()}
                error={!!error}
              />

              {error ? (
                <View style={{ marginTop: 16 }}>
                  <Notice tone="danger" icon="alert-circle-outline">
                    {error}
                  </Notice>
                </View>
              ) : null}

              <View style={{ height: 22 }} />
              <GlowButton
                title={busy ? 'Verifying…' : 'Sign in'}
                onPress={() => void onSubmit()}
                loading={busy}
                disabled={!identifier.trim() || !password}
              />

            </Animated.View>

            <Animated.View style={enter(3)}>
              <Text style={styles.foot}>Need help? Contact your system administrator.</Text>
              <Text style={styles.version}>v{version} · RESTRICTED · OFFICIAL USE ONLY</Text>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'transparent' },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 13, color: t.muted, fontFamily: mono, letterSpacing: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 40, justifyContent: 'center' },
  hero: { alignItems: 'center', marginTop: 12, marginBottom: 18 },
  title: { fontSize: 36, fontWeight: '800', color: t.text, letterSpacing: -1.2, marginTop: 8 },
  flagBar: {
    flexDirection: 'row',
    marginTop: 12,
    borderRadius: 3,
    overflow: 'hidden',
    shadowColor: t.gold,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  flagSeg: { width: 40, height: 4 },
  sub: { fontSize: 14.5, color: t.muted, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 28, maxWidth: 320 },
  card: {
    backgroundColor: 'rgba(11,21,36,0.82)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: t.border,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: t.text, letterSpacing: -0.3 },
  encrypted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: t.successSoft,
  },
  encryptedText: { fontFamily: mono, fontSize: 9.5, fontWeight: '700', color: t.success, letterSpacing: 1 },
  foot: { marginTop: 12, fontSize: 12, color: t.dim, textAlign: 'center', lineHeight: 18 },
  version: { marginTop: 18, fontFamily: mono, fontSize: 9.5, color: t.dim, textAlign: 'center', letterSpacing: 1.6, opacity: 0.7 },
})
