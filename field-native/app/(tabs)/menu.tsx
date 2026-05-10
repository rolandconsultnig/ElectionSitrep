import { useCallback, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'

import { SecretServerUnlock } from '@/components/SecretServerUnlock'
import { useAuth } from '@/context/auth'
import { listQueue } from '@/lib/offline-queue'
import type { QueueRecord } from '@/lib/offline-queue'
import { flushOfflineQueue } from '@/lib/sync-engine'

export default function MenuScreen() {
  const router = useRouter()
  const { logout } = useAuth()
  const [items, setItems] = useState<QueueRecord[]>([])
  const [syncing, setSyncing] = useState(false)

  const reload = useCallback(() => {
    void listQueue().then(setItems)
  }, [])

  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload]),
  )

  async function syncNow() {
    setSyncing(true)
    try {
      const r = await flushOfflineQueue()
      reload()
      const lines = [
        r.uploaded ? `Uploaded ${r.uploaded} item(s).` : 'No items uploaded (offline or queue empty).',
        ...r.errors,
      ]
      Alert.alert('Sync', lines.join('\n'))
    } finally {
      setSyncing(false)
    }
  }

  const pending = items.filter((i) => !i.synced)

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
      <SecretServerUnlock>
        <Text style={styles.title}>More</Text>
      </SecretServerUnlock>

      <Pressable style={styles.link} onPress={() => router.push('/violence')}>
        <Text style={styles.linkText}>Violence / disturbance (urgent)</Text>
      </Pressable>

      <Pressable style={[styles.btn, syncing && styles.disabled]} disabled={syncing} onPress={syncNow}>
        <Text style={styles.btnText}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
      </Pressable>

      <Text style={styles.section}>Local queue ({pending.length} pending)</Text>
      {pending.length === 0 ? (
        <Text style={styles.muted}>No pending items.</Text>
      ) : (
        pending.slice(0, 20).map((r) => (
          <View key={r.id} style={styles.qrow}>
            <Text style={styles.qkind}>{r.kind}</Text>
            <Text style={styles.qtime}>{r.createdAt.slice(11, 19)}</Text>
          </View>
        ))
      )}

      <Pressable style={styles.out} onPress={() => void logout()}>
        <Text style={styles.outText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1628' },
  inner: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700', color: '#e8edf5', marginBottom: 16 },
  link: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    marginBottom: 16,
  },
  linkText: { color: '#f87171', fontWeight: '600', textAlign: 'center' },
  btn: {
    backgroundColor: '#0dccb0',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 24,
  },
  disabled: { opacity: 0.6 },
  btnText: { color: '#0a1628', fontWeight: '700' },
  section: { fontSize: 13, color: '#8a9ab8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  muted: { color: '#6b7a96', marginBottom: 12 },
  qrow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  qkind: { color: '#e8edf5', fontWeight: '600' },
  qtime: { color: '#6b7a96', fontVariant: ['tabular-nums'] },
  out: {
    marginTop: 32,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
  },
  outText: { color: '#e8edf5', fontWeight: '600' },
})
