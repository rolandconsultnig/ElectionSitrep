import { useEffect, useState } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { useAuth } from '@/context/auth'
import {
  getApiBaseUrl,
  getBundledApiBaseUrl,
  parseApiOrigin,
  persistApiBaseUrlOverride,
} from '@/lib/config'

type Props = {
  visible: boolean
  onClose: () => void
}

export function ServerEndpointModal({ visible, onClose }: Props) {
  const { refreshApiConfig } = useAuth()
  const [scheme, setScheme] = useState<'http' | 'https'>('http')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('5530')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible) return
    const base = getApiBaseUrl() || getBundledApiBaseUrl()
    const p = parseApiOrigin(base)
    setScheme(p.scheme)
    setHost(p.host)
    setPort(p.port === '80' && p.scheme === 'http' ? '80' : p.port === '443' && p.scheme === 'https' ? '443' : p.port)
  }, [visible])

  async function onSave() {
    const h = host.trim()
    if (!h) {
      Alert.alert('Server', 'Enter a host or IP address.')
      return
    }
    const pt = port.trim()
    if (!/^\d+$/.test(pt)) {
      Alert.alert('Server', 'Port must be a number.')
      return
    }
    const n = Number(pt)
    if (n < 1 || n > 65535) {
      Alert.alert('Server', 'Port must be between 1 and 65535.')
      return
    }
    const origin = `${scheme}://${h}:${pt}`
    setSaving(true)
    try {
      await persistApiBaseUrlOverride(origin)
      refreshApiConfig()
      Alert.alert(
        'Saved',
        'Server endpoint updated. Sign out and sign in again if you switched to a different server.',
        [{ text: 'OK', onPress: onClose }],
      )
    } finally {
      setSaving(false)
    }
  }

  async function onResetDefault() {
    Alert.alert('Reset server URL', 'Use the address bundled in this build (app.json)?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await persistApiBaseUrlOverride(null)
          refreshApiConfig()
          Alert.alert('Done', 'Bundled default restored.', [{ text: 'OK', onPress: onClose }])
        },
      },
    ])
  }

  const bundled = getBundledApiBaseUrl()
  const effective = getApiBaseUrl()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Server endpoint</Text>
          <Text style={styles.meta}>Effective URL{'\n'}{effective || '(none)'}</Text>
          {bundled ? <Text style={styles.bundled}>Bundled default{'\n'}{bundled}</Text> : null}

          <Text style={styles.label}>Protocol</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.chip, scheme === 'http' && styles.chipOn]}
              onPress={() => setScheme('http')}
            >
              <Text style={[styles.chipText, scheme === 'http' && styles.chipTextOn]}>HTTP</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, scheme === 'https' && styles.chipOn]}
              onPress={() => setScheme('https')}
            >
              <Text style={[styles.chipText, scheme === 'https' && styles.chipTextOn]}>HTTPS</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Host / IP</Text>
          <TextInput
            value={host}
            onChangeText={setHost}
            placeholder="e.g. 192.168.1.10"
            placeholderTextColor="#6b7a96"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            style={styles.input}
          />

          <Text style={styles.label}>Port</Text>
          <TextInput
            value={port}
            onChangeText={setPort}
            placeholder="5530"
            placeholderTextColor="#6b7a96"
            keyboardType="number-pad"
            style={styles.input}
          />

          <Pressable style={[styles.primary, saving && styles.disabled]} disabled={saving} onPress={() => void onSave()}>
            <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>

          <Pressable style={styles.secondary} onPress={() => void onResetDefault()}>
            <Text style={styles.secondaryText}>Reset to bundled default</Text>
          </Pressable>

          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: '#0f1f36',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#e8edf5', marginBottom: 12 },
  meta: {
    fontSize: 12,
    color: '#8a9ab8',
    marginBottom: 8,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  bundled: {
    fontSize: 11,
    color: '#6b7a96',
    marginBottom: 16,
    lineHeight: 16,
  },
  label: { fontSize: 12, color: '#8a9ab8', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#e8edf5',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  row: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipOn: {
    borderColor: '#0dccb0',
    backgroundColor: 'rgba(13,204,176,0.12)',
  },
  chipText: { color: '#8a9ab8', fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: '#0dccb0' },
  primary: {
    marginTop: 18,
    backgroundColor: '#0dccb0',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryText: { color: '#0a1628', fontWeight: '700', fontSize: 16 },
  secondary: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: '#f87171', fontWeight: '600', fontSize: 14 },
  close: { marginTop: 8, paddingVertical: 10, alignItems: 'center' },
  closeText: { color: '#8a9ab8', fontSize: 15 },
  disabled: { opacity: 0.55 },
})
