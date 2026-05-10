import { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { captureOffline } from '@/lib/capture'

const SEVERITY = ['GREEN', 'AMBER', 'RED'] as const

export default function SitRepScreen() {
  const [severity, setSeverity] = useState<(typeof SEVERITY)[number]>('GREEN')
  const [accredited, setAccredited] = useState('')
  const [narrative, setNarrative] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await captureOffline('sitrep', {
        severity,
        accredited: accredited.trim() === '' ? undefined : Number(accredited),
        narrative: narrative.trim() || undefined,
      })
      Alert.alert('Saved', 'SitRep queued for sync.')
      setNarrative('')
      setAccredited('')
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
      <Text style={styles.title}>Submit SitRep</Text>
      <Text style={styles.label}>Severity</Text>
      <View style={styles.row}>
        {SEVERITY.map((s) => (
          <Pressable
            key={s}
            onPress={() => setSeverity(s)}
            style={[styles.chip, severity === s && styles.chipOn]}
          >
            <Text style={[styles.chipText, severity === s && styles.chipTextOn]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Accredited (optional)</Text>
      <TextInput
        keyboardType="number-pad"
        value={accredited}
        onChangeText={setAccredited}
        placeholder="Count"
        placeholderTextColor="#6b7a96"
        style={styles.input}
      />
      <Text style={styles.label}>Narrative</Text>
      <TextInput
        multiline
        numberOfLines={5}
        value={narrative}
        onChangeText={setNarrative}
        placeholder="Situation summary"
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
  row: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chipOn: { backgroundColor: 'rgba(13,204,176,0.2)', borderColor: '#0dccb0' },
  chipText: { color: '#8a9ab8', fontWeight: '600' },
  chipTextOn: { color: '#0dccb0' },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 12,
    color: '#e8edf5',
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  area: { minHeight: 120, textAlignVertical: 'top' },
  btn: { backgroundColor: '#0dccb0', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.6 },
  btnText: { color: '#0a1628', fontWeight: '700', fontSize: 16 },
})
