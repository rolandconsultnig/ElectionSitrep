import { getApiBaseUrl } from '../lib/config'
import { pingApiHealth } from '../lib/ping-api'
import { colors, radii, space } from '../lib/theme'
import {
  buildServerUrl,
  clearServerEndpoint,
  getStoredEndpoint,
  saveServerEndpoint,
} from '../lib/server-settings'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { useQueryClient } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function defaultHostPort(): { host: string; port: string } {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined
  const raw = extra?.apiBaseUrl || 'http://localhost:5530'
  try {
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`)
    return {
      host: u.hostname || '',
      port: u.port || '5530',
    }
  } catch {
    return { host: '', port: '5530' }
  }
}

export default function NetworkSettingsScreen() {
  const queryClient = useQueryClient()
  const [host, setHost] = useState('')
  const [port, setPort] = useState('5530')
  const [useHttps, setUseHttps] = useState(false)
  const [savedHint, setSavedHint] = useState<string | null>(null)
  const [testBusy, setTestBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [lastPingOk, setLastPingOk] = useState<boolean | null>(null)
  const [netLabel, setNetLabel] = useState<string>('Checking device network…')

  const load = useCallback(async () => {
    const stored = await getStoredEndpoint()
    if (stored) {
      setHost(stored.host)
      setPort(stored.port)
      setUseHttps(stored.useHttps)
      return
    }
    const d = defaultHostPort()
    setHost(d.host)
    setPort(d.port)
    setUseHttps(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state: NetInfoState) => {
      if (!state.isConnected) {
        setNetLabel('Device has no internet connection. Wi‑Fi or mobile data is required.')
        return
      }
      const t = state.type === 'wifi' ? 'Wi‑Fi' : state.type === 'cellular' ? 'Mobile data' : state.type
      const details =
        state.type === 'wifi' && state.details && 'ssid' in state.details && state.details.ssid
          ? ` (${String(state.details.ssid)})`
          : ''
      setNetLabel(`Connected via ${t}${details}.`)
    })
    return () => unsub()
  }, [])

  async function onSave() {
    setSavedHint(null)
    setTestMsg(null)
    try {
      buildServerUrl(host, port, useHttps)
      await saveServerEndpoint(host, port, useHttps)
      await queryClient.invalidateQueries()
      setSavedHint('Saved. The app will use this server until you clear or change it.')
      Alert.alert('Network settings', 'Server address saved.')
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Invalid values.')
    }
  }

  async function onClear() {
    await clearServerEndpoint()
    await queryClient.invalidateQueries()
    await load()
    setSavedHint('Cleared. Using default from app configuration (.env / app.json).')
    Alert.alert('Network settings', 'Custom server cleared.')
  }

  async function onTest() {
    setTestBusy(true)
    setTestMsg(null)
    try {
      let base: string
      try {
        base = buildServerUrl(host, port, useHttps)
      } catch {
        base = getApiBaseUrl()
      }
      const result = await pingApiHealth(base)
      setLastPingOk(result.ok)
      if (result.ok && result.latencyMs != null) {
        setTestMsg(
          `Ping OK — ${result.latencyMs} ms to GET /api/health\n${result.bodyPreview ?? ''}`.trim(),
        )
      } else {
        setTestMsg(
          [result.message, result.bodyPreview ? `\n${result.bodyPreview}` : '', result.httpStatus ? ` (HTTP ${result.httpStatus})` : '']
            .filter(Boolean)
            .join(''),
        )
      }
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : 'Request failed.')
    } finally {
      setTestBusy(false)
    }
  }

  return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.lead}>
            Set the API server used by this device. Values are stored only on this phone.
          </Text>
          <View style={styles.netBanner}>
            <Text style={styles.netBannerText}>{netLabel}</Text>
          </View>

          <Text style={styles.label}>Server IP or hostname</Text>
          <TextInput
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. 192.168.1.10"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: space.md }]}>Server port</Text>
          <TextInput
            value={port}
            onChangeText={setPort}
            keyboardType="number-pad"
            placeholder="5530"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <View style={styles.tlsRow}>
            <Text style={styles.tlsLabel}>Use HTTPS (TLS)</Text>
            <Switch value={useHttps} onValueChange={setUseHttps} />
          </View>
          <Text style={styles.tlsHint}>
            Turn on only if the API is served over TLS (e.g. https://host:443). Default HTTP works for most installs.
          </Text>

          <Text style={styles.preview}>
            Effective URL (tap Save to apply):{' '}
            {(() => {
              try {
                return buildServerUrl(host, port, useHttps)
              } catch {
                return getApiBaseUrl()
              }
            })()}
          </Text>

          <Pressable onPress={onSave} style={styles.btnPrimary}>
            <Text style={styles.btnPrimaryText}>Save</Text>
          </Pressable>

          <Pressable onPress={onTest} disabled={testBusy} style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryText}>{testBusy ? 'Pinging…' : 'Ping API (GET /api/health)'}</Text>
          </Pressable>
          <Text style={styles.pingHint}>
            Ping measures round-trip time to the API. Use port <Text style={styles.mono}>5530</Text> for the Node server
            (not the web port <Text style={styles.mono}>5535</Text> unless the API is there).
          </Text>

          {testMsg ? (
            <Text style={[styles.testOut, lastPingOk ? styles.testOk : styles.testBad]}>{testMsg}</Text>
          ) : null}

          <Pressable onPress={onClear} style={styles.btnGhost}>
            <Text style={styles.btnGhostText}>Use default server (clear override)</Text>
          </Pressable>

          {savedHint ? <Text style={styles.hint}>{savedHint}</Text> : null}
        </ScrollView>
      </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: space.xl * 2 },
  lead: { fontSize: 15, color: colors.muted, marginBottom: space.md, lineHeight: 22 },
  netBanner: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.md,
    padding: space.md,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  netBannerText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  pingHint: { marginTop: space.sm, fontSize: 12, color: colors.muted, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: space.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  tlsRow: {
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  tlsLabel: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 },
  tlsHint: { marginTop: space.xs, fontSize: 12, color: colors.muted, lineHeight: 18 },
  preview: { marginTop: space.md, fontSize: 13, color: colors.muted },
  btnPrimary: {
    marginTop: space.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnSecondary: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
  },
  btnSecondaryText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  btnGhost: { marginTop: space.lg, paddingVertical: space.sm, alignItems: 'center' },
  btnGhostText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  testOut: { marginTop: space.md, fontSize: 14, lineHeight: 20 },
  testOk: { color: colors.success },
  testBad: { color: colors.danger },
  hint: { marginTop: space.md, fontSize: 13, color: colors.success },
})
