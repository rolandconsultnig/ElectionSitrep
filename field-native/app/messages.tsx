import { useAuth } from '../lib/auth-context'
import { useSocket } from '../lib/socket-context'
import { apiFetch } from '../lib/api'
import { tactical as t, mono } from '../lib/theme'
import { Backdrop, Kicker } from '../components/tactical/primitives'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

type HistoryMessage = {
  id: string | number
  sender_id: string
  sender_username: string
  room_id: string
  content: string
  created_at: string
}

const lastReadKey = (userId: string) => `@command_dm_last_read_${userId}`

export default function MessagesScreen() {
  const { token, user } = useAuth()
  const { socket, connected, messages, sendMessage, hqOnlineCount, startCall } = useSocket()
  const [history, setHistory] = useState<HistoryMessage[]>([])
  const [recipientId, setRecipientId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<{ id: string; content: string; roomId: string }[]>([])
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)

  const load = useCallback(async () => {
    if (!token || !user) return
    try {
      const result = await apiFetch<{ messages: HistoryMessage[] }>('/api/chat/dm/history?limit=500', { token })
      setHistory(result.messages)
      setError(null)
      await AsyncStorage.setItem(lastReadKey(String(user.id)), new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages')
    } finally {
      setLoading(false)
    }
  }, [token, user])

  useFocusEffect(useCallback(() => {
    void load()
    const timer = setInterval(() => void load(), 30_000)
    return () => clearInterval(timer)
  }, [load]))

  // Merge live socket messages with persisted history
  const allMessages = useMemo(() => {
    const seen = new Set<string>()
    const merged: HistoryMessage[] = []
    const live = messages.map((m) => ({
      id: m.id,
      sender_id: m.senderId,
      sender_username: m.senderUsername,
      room_id: m.roomId,
      content: m.content,
      created_at: m.createdAt,
    }))
    for (const m of [...history, ...live]) {
      const key = String(m.id)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(m)
    }
    return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [history, messages])

  const recipients = useMemo(() => {
    const latestById = new Map<string, HistoryMessage>()
    for (const message of [...allMessages].reverse()) {
      if (String(message.sender_id) === String(user?.id)) continue
      if (!latestById.has(String(message.sender_id))) latestById.set(String(message.sender_id), message)
    }
    return [...latestById.entries()].map(([id, message]) => ({ id, username: message.sender_username }))
  }, [allMessages, user?.id])

  const targetId = recipientId ?? recipients[0]?.id ?? null
  const thread = useMemo(() => allMessages
    .filter((message) => !targetId || String(message.sender_id) === targetId || String(message.room_id).split('_').includes(targetId))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [allMessages, targetId])

  // Flush pending messages when socket reconnects
  const connectedRef = useRef(connected)
  connectedRef.current = connected
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  useFocusEffect(useCallback(() => {
    if (!socket) return
    const onConnect = () => {
      const q = pendingRef.current
      if (!q.length) return
      setPending([])
      q.forEach((m) => void sendMessage(m.roomId, m.content))
    }
    socket.on('connect', onConnect)
    return () => { socket.off('connect', onConnect) }
  }, [socket, sendMessage]))

  const send = async () => {
    const content = draft.trim()
    if (!targetId || !content || sending) return
    setSending(true)
    setError(null)
    const roomId = `user_${targetId}`
    try {
      if (connected) {
        const ok = await sendMessage(roomId, content)
        if (!ok) throw new Error('Send failed')
      } else {
        // Offline — queue and POST when back online
        try {
          await apiFetch(`/api/chat/dm/${encodeURIComponent(targetId)}`, {
            method: 'POST',
            token,
            body: JSON.stringify({ content }),
          })
        } catch {
          setPending((prev) => [...prev, { id: `${Date.now()}`, content, roomId }])
        }
      }
      setDraft('')
      Haptics.selectionAsync().catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send message')
      setPending((prev) => [...prev, { id: `${Date.now()}`, content, roomId }])
    } finally {
      setSending(false)
    }
  }

  return (
    <View style={styles.fill}>
      <Backdrop />
      <SafeAreaView style={styles.fill} edges={['top']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Kicker>HQ Communications</Kicker>
            <Text style={styles.title}>Messages from Command</Text>
          </View>
          <View style={styles.callRow}>
            <View style={[styles.presence, hqOnlineCount > 0 ? styles.presenceOn : styles.presenceOff]}>
              <View style={[styles.presenceDot, hqOnlineCount > 0 ? styles.presenceDotOn : styles.presenceDotOff]} />
              <Text style={[styles.presenceText, hqOnlineCount > 0 ? styles.presenceTextOn : styles.presenceTextOff]}>
                {hqOnlineCount < 0 ? 'HQ: …' : hqOnlineCount > 0 ? `HQ (${hqOnlineCount})` : 'HQ offline'}
              </Text>
            </View>
            <Pressable
              onPress={() => startCall('audio')}
              disabled={!connected}
              style={({ pressed }) => [styles.callBtn, !connected && styles.disabled, pressed && { transform: [{ scale: 0.95 }] }]}
              accessibilityLabel="Voice call HQ"
            >
              <Ionicons name="call" size={18} color={t.text} />
            </Pressable>
            <Pressable
              onPress={() => startCall('video')}
              disabled={!connected}
              style={({ pressed }) => [styles.callBtn, styles.callBtnPrimary, !connected && styles.disabled, pressed && { transform: [{ scale: 0.95 }] }]}
              accessibilityLabel="Video call HQ"
            >
              <Ionicons name="videocam" size={18} color={t.cyanInk} />
            </Pressable>
          </View>
        </View>

        {!connected ? (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={14} color={t.warning} />
            <Text style={styles.offlineText}>Reconnecting to HQ… messages you send are queued and delivered automatically.</Text>
          </View>
        ) : null}

        {recipients.length > 1 ? (
          <ScrollView horizontal contentContainerStyle={styles.recipients} showsHorizontalScrollIndicator={false}>
            {recipients.map((recipient) => (
              <Pressable
                key={recipient.id}
                onPress={() => setRecipientId(recipient.id)}
                style={[styles.recipient, targetId === recipient.id && styles.recipientActive]}
              >
                <Text style={[styles.recipientText, targetId === recipient.id && styles.recipientTextActive]}>
                  {recipient.username}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {loading ? <ActivityIndicator color={t.cyan} style={{ marginTop: 20 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={[styles.threadContent, { paddingBottom: 80 + insets.bottom }]}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
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
          {pending.map((m) => (
            <View key={m.id} style={[styles.message, styles.mine, styles.queued]}>
              <Text style={styles.sender}>You · queued</Text>
              <Text style={styles.content}>{m.content}</Text>
              <Text style={styles.time}>Will send when back online</Text>
            </View>
          ))}
          {!loading && !thread.length && !pending.length ? (
            <Text style={styles.empty}>No messages from Command yet.</Text>
          ) : null}
        </ScrollView>

        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a reply…"
            placeholderTextColor={t.dim}
            multiline
            maxLength={4000}
            style={styles.input}
          />
          <Pressable
            disabled={!targetId || !draft.trim() || sending}
            onPress={() => void send()}
            style={[styles.send, (!targetId || !draft.trim() || sending) && styles.disabled]}
          >
            <Ionicons name="send" size={18} color={t.cyanInk} />
          </Pressable>
        </View>
        {!targetId ? <Text style={styles.noRecipient}>A command user must message you before you can reply.</Text> : null}
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: t.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderColor: t.border,
  },
  title: { fontSize: 18, fontWeight: '800', color: t.text, letterSpacing: -0.3, marginTop: 2 },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  presence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  presenceOn: { backgroundColor: t.successSoft },
  presenceOff: { backgroundColor: 'rgba(120,130,140,0.15)' },
  presenceDot: { width: 7, height: 7, borderRadius: 4 },
  presenceDotOn: { backgroundColor: t.success },
  presenceDotOff: { backgroundColor: t.dim },
  presenceText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  presenceTextOn: { color: t.success },
  presenceTextOff: { color: t.dim },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.glass,
    borderWidth: 1,
    borderColor: t.border,
  },
  callBtnPrimary: { backgroundColor: t.cyanSoft, borderColor: t.cyan },
  disabled: { opacity: 0.4 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: t.warningSoft,
    borderBottomWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  offlineText: { fontSize: 12, color: t.warning, flex: 1 },
  recipients: { padding: 12, gap: 8 },
  recipient: {
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: t.glass,
  },
  recipientActive: { borderColor: t.cyan, backgroundColor: t.cyanSoft },
  recipientText: { color: t.text, fontSize: 13, fontWeight: '600' },
  recipientTextActive: { color: t.cyan, fontWeight: '700' },
  thread: { flex: 1 },
  threadContent: { padding: 14, gap: 10 },
  message: { maxWidth: '88%', padding: 12, borderRadius: 16 },
  mine: { alignSelf: 'flex-end', backgroundColor: t.cyanSoft, borderWidth: 1, borderColor: 'rgba(34,211,238,0.25)' },
  theirs: { alignSelf: 'flex-start', backgroundColor: t.card, borderWidth: 1, borderColor: t.border },
  queued: { opacity: 0.7, borderColor: 'rgba(245,158,11,0.3)' },
  sender: { color: t.cyan, fontSize: 11, fontWeight: '700', marginBottom: 3, letterSpacing: 0.3 },
  content: { color: t.text, fontSize: 14, lineHeight: 19 },
  time: { color: t.dim, fontSize: 10, marginTop: 5 },
  empty: { color: t.dim, textAlign: 'center', marginTop: 40, fontSize: 14 },
  error: { color: t.danger, paddingHorizontal: 14, paddingTop: 8 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderColor: t.border,
    backgroundColor: t.card,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    color: t.text,
    backgroundColor: t.bg,
    borderColor: t.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: t.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noRecipient: { color: t.dim, paddingHorizontal: 14, paddingBottom: 10, fontSize: 12 },
})
