import { getApiBaseUrl } from '../lib/config'
import { colors, radii, space } from '../lib/theme'
import {
  buildServerUrl,
  clearServerEndpoint,
  getStoredEndpoint,
  saveServerEndpoint,
} from '../lib/server-settings'
import { useQueryClient } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
  const [savedHint, setSavedHint] = useState<string | null>(null)
  const [testBusy, setTestBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const stored = await getStoredEndpoint()
    if (stored) {
      setHost(stored.host)
      setPort(stored.port)
      return
    }
    const d = defaultHostPort()
    setHost(d.host)
    setPort(d.port)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onSave() {
    setSavedHint(null)
    setTestMsg(null)
    try {
      buildServerUrl(host, port)
      await saveServerEndpoint(host, port)
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
      const base = getApiBaseUrl()
      const url = `${base}/api/health`
      const res = await fetch(url, { method: 'GET' })
      const text = await res.text()
      if (!res.ok) {
        setTestMsg(`Failed (${res.status}): ${text.slice(0, 120)}`)
        return
      }
      setTestMsg(`OK — ${text.slice(0, 200)}`)
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

          <Text style={styles.preview}>Effective URL: {getApiBaseUrl()}</Text>

          <Pressable onPress={onSave} style={styles.btnPrimary}>
            <Text style={styles.btnPrimaryText}>Save</Text>
          </Pressable>

          <Pressable onPress={onTest} disabled={testBusy} style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryText}>{testBusy ? 'Testing…' : 'Test connection'}</Text>
          </Pressable>

          {testMsg ? <Text style={styles.testOut}>{testMsg}</Text> : null}

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
  lead: { fontSize: 15, color: colors.muted, marginBottom: space.lg, lineHeight: 22 },
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
  testOut: { marginTop: space.md, fontSize: 14, color: colors.text, lineHeight: 20 },
  hint: { marginTop: space.md, fontSize: 13, color: colors.success },
})
