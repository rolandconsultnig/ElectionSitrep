import { useAuth } from '../lib/auth-context'
import { apiFetch } from '../lib/api'
import { colors, radii, space } from '../lib/theme'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Message = { id: string | number; sender_id: string; sender_username: string; room_id: string; content: string; created_at: string }
const lastReadKey = (userId: string) => `@command_dm_last_read_${userId}`

export default function MessagesScreen() {
  const { token, user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [recipientId, setRecipientId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    if (!token || !user) return
    try {
      const result = await apiFetch<{ messages: Message[] }>('/api/chat/dm/history?limit=500', { token })
      setMessages(result.messages)
      setError(null)
      await AsyncStorage.setItem(lastReadKey(user.id), new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages')
    } finally {
      setLoading(false)
    }
  }, [token, user])

  useFocusEffect(useCallback(() => {
    void load()
    const timer = setInterval(() => void load(), 15_000)
    return () => clearInterval(timer)
  }, [load]))

  const recipients = useMemo(() => {
    const latestById = new Map<string, Message>()
    for (const message of [...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())) {
      if (String(message.sender_id) === String(user?.id)) continue
      if (!latestById.has(String(message.sender_id))) latestById.set(String(message.sender_id), message)
    }
    return [...latestById.entries()].map(([id, message]) => ({ id, username: message.sender_username }))
  }, [messages, user?.id])

  const targetId = recipientId ?? recipients[0]?.id ?? null
  const thread = useMemo(() => messages
    .filter((message) => !targetId || String(message.sender_id) === targetId || String(message.room_id).split('_').includes(targetId))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [messages, targetId])

  const send = async () => {
    const content = draft.trim()
    if (!token || !targetId || !content || sending) return
    setSending(true)
    setError(null)
    try {
      await apiFetch(`/api/chat/dm/${encodeURIComponent(targetId)}`, {
        method: 'POST',
        token,
        body: JSON.stringify({ content }),
      })
      setDraft('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Text style={styles.title}>Messages from Command</Text><Text style={styles.subtitle}>Direct messages and replies</Text></View>
      {recipients.length > 1 ? (
        <ScrollView horizontal contentContainerStyle={styles.recipients}>
          {recipients.map((recipient) => (
            <Pressable key={recipient.id} onPress={() => setRecipientId(recipient.id)} style={[styles.recipient, targetId === recipient.id && styles.recipientActive]}>
              <Text style={[styles.recipientText, targetId === recipient.id && styles.recipientTextActive]}>{recipient.username}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: space.md }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ScrollView style={styles.thread} contentContainerStyle={styles.threadContent}>
        {thread.map((message) => {
          const mine = String(message.sender_id) === String(user?.id)
          return (
            <View key={message.id} style={[styles.message, mine ? styles.mine : styles.theirs]}>
              <Text style={styles.sender}>{mine ? 'You' : message.sender_username}</Text>
              <Text style={styles.content}>{message.content}</Text>
              <Text style={styles.time}>{new Date(message.created_at).toLocaleString()}</Text>
            </View>
          )
        })}
        {!loading && !thread.length ? <Text style={styles.empty}>No messages from Command yet.</Text> : null}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput value={draft} onChangeText={setDraft} placeholder="Write a reply…" placeholderTextColor={colors.muted} multiline maxLength={4000} style={styles.input} />
        <Pressable disabled={!targetId || !draft.trim() || sending} onPress={() => void send()} style={[styles.send, (!targetId || !draft.trim() || sending) && styles.disabled]}>
          <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
        </Pressable>
      </View>
      {!targetId ? <Text style={styles.noRecipient}>A command user must message you before you can reply.</Text> : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: space.md, borderBottomWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  subtitle: { color: colors.muted, marginTop: 3 },
  recipients: { padding: space.sm, gap: space.sm },
  recipient: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  recipientActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  recipientText: { color: colors.text },
  recipientTextActive: { color: colors.primary, fontWeight: '700' },
  thread: { flex: 1 },
  threadContent: { padding: space.md, gap: space.sm },
  message: { maxWidth: '88%', padding: space.md, borderRadius: radii.md },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primaryMuted },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sender: { color: colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  content: { color: colors.text, fontSize: 15 },
  time: { color: colors.muted, fontSize: 10, marginTop: 6 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: space.xl },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.md, borderTopWidth: 1, borderColor: colors.border },
  input: { flex: 1, minHeight: 44, maxHeight: 110, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: space.sm },
  send: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: space.md, paddingHorizontal: space.md },
  sendText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.45 },
  error: { color: colors.danger, paddingHorizontal: space.md, paddingTop: space.sm },
  noRecipient: { color: colors.muted, paddingHorizontal: space.md, paddingBottom: space.md },
})
