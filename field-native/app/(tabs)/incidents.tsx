import { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { captureOffline } from '@/lib/capture'

const CATS = ['Card reader failure', 'Result snatching', 'Violence / gunfire', 'Over-voting']

export default function IncidentsScreen() {
  const [category, setCategory] = useState(CATS[0])
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await captureOffline('incident', {
        category,
        detail: detail.trim() || undefined,
      })
      Alert.alert('Saved', 'Incident queued for sync.')
      setDetail('')
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
      <Text style={styles.title}>Report incident</Text>
      <Text style={styles.label}>Category</Text>
      {CATS.map((c) => (
        <Pressable key={c} onPress={() => setCategory(c)} style={[styles.opt, category === c && styles.optOn]}>
          <Text style={[styles.optTxt, category === c && styles.optTxtOn]}>{c}</Text>
        </Pressable>
      ))}
      <Text style={[styles.label, { marginTop: 16 }]}>Details</Text>
      <TextInput
        multiline
        numberOfLines={4}
        value={detail}
        onChangeText={setDetail}
        placeholder="What happened"
        placeholderTextColor="#6b7a96"
        style={[styles.input, styles.area]}
      />
      <Pressable style={[styles.btn, busy && styles.disabled]} disabled={busy} onPress={submit}>
        <Text style={styles.btnText}>Save & queue sync</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1628' },
  inner: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#e8edf5', marginBottom: 16 },
  label: { fontSize: 12, color: '#8a9ab8', marginBottom: 8 },
  opt: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 8,
  },
  optOn: { borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)' },
  optTxt: { color: '#e8edf5' },
  optTxtOn: { fontWeight: '600', color: '#fbbf24' },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 12,
    color: '#e8edf5',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  area: { minHeight: 100, textAlignVertical: 'top' },
  btn: { marginTop: 16, backgroundColor: '#ef4444', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
})
