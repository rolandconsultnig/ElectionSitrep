import { Dock, DOCK_SPACE, QuickReportSheet, type QuickAction } from '../components/tactical/Dock'
import { Avatar, OfficerMenu, type MenuItem, type Officer } from '../components/tactical/OfficerMenu'
import {
  Backdrop,
  GhostButton,
  GlowButton,
  IconChip,
  Kicker,
  Notice,
  PulseDot,
  SectionHeader,
  StatusPill,
  usePressScale,
  type IconName,
  type Tone,
} from '../components/tactical/primitives'
import { apiFetch, fieldContextRequest } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { getApiBaseUrl } from '../lib/config'
import { isLocalSessionToken } from '../lib/local-session'
import { listPending } from '../lib/pending-queue'
import { countQueuedRequests, autoFlushOnReconnect, flushQueuedRequests } from '../lib/offline-queue'
import { flushPendingVoteSync } from '../lib/sync-pending'
import { apiFetch as _apiFetch } from '../lib/api'
import { mono, tactical as t } from '../lib/theme'
import type { FieldContext } from '../lib/types'
import { useLightStatusBar } from '../lib/use-light-status-bar'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import Constants from 'expo-constants'
import { Redirect, router } from 'expo-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg'

const OPERATIONS: { route: string; icon: IconName; label: string; hint: string; tone: Tone }[] = [
  { route: '/timeline', icon: 'time-outline', label: 'Timeline', hint: 'Milestones', tone: 'cyan' },
  { route: '/turnout', icon: 'people-outline', label: 'Voter turnout', hint: 'Queue pulse', tone: 'violet' },
  { route: '/materials', icon: 'cube-outline', label: 'Materials log', hint: 'Chain of custody', tone: 'warning' },
  { route: '/shifts', icon: 'swap-horizontal-outline', label: 'Shift handover', hint: 'Relief roster', tone: 'cyan' },
  { route: '/logistics', icon: 'car-outline', label: 'Logistics', hint: 'Fuel · transport', tone: 'success' },
  { route: '/reference', icon: 'flag-outline', label: 'Parties ref.', hint: 'INEC register', tone: 'neutral' },
]

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'sitrep', icon: 'document-text-outline', label: 'SitRep', hint: 'GPS-verified status', tone: 'cyan', onPress: () => router.push('/sitrep') },
  { key: 'incident', icon: 'warning-outline', label: 'Incident', hint: 'FLASH alert', tone: 'warning', onPress: () => router.push('/incident') },
  { key: 'ec8a', icon: 'camera-outline', label: 'EC8A result', hint: 'Photo + tally', tone: 'success', onPress: () => router.push('/ec8a') },
  { key: 'turnout', icon: 'people-outline', label: 'Turnout', hint: 'Queue levels', tone: 'violet', onPress: () => router.push('/turnout') },
]

const URGENT: QuickAction = {
  key: 'violence',
  icon: 'flash',
  label: 'Violence · URGENT',
  hint: 'One-tap alert to Command with your GPS',
  tone: 'danger',
  onPress: () => router.push('/violence'),
}

const LIVE_STATUSES = new Set(['active', 'open', 'live', 'ongoing', 'in_progress'])

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function hostOf(url: string | null) {
  return url ? url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : 'not configured'
}

export default function HomeScreen() {
  const { token, user, ready, signOut } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncErrors, setSyncErrors] = useState<string[]>([])
  const [bootstrapTimeout, setBootstrapTimeout] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [online, setOnline] = useState(true)
  const localMode = isLocalSessionToken(token)
  useLightStatusBar()

  const refreshUnreadMessages = useCallback(async () => {
    if (!token || !user || localMode) return
    try {
      const [result, lastRead] = await Promise.all([
        apiFetch<{ messages: { sender_id: string; created_at: string }[] }>('/api/chat/dm/history?limit=500', { token }),
        AsyncStorage.getItem(`@command_dm_last_read_${user.id}`),
      ])
      const lastReadMs = lastRead ? new Date(lastRead).getTime() : 0
      setUnreadMessages(result.messages.filter((message) =>
        String(message.sender_id) !== String(user.id) && new Date(message.created_at).getTime() > lastReadMs).length)
    } catch {
      setUnreadMessages(0)
    }
  }, [token, user, localMode])

  useFocusEffect(useCallback(() => {
    void refreshUnreadMessages()
    const timer = setInterval(() => void refreshUnreadMessages(), 15_000)
    return () => clearInterval(timer)
  }, [refreshUnreadMessages]))

  async function refreshPendingCount() {
    const [batch, generic] = await Promise.all([listPending(), countQueuedRequests()])
    setPendingCount(batch.length + generic)
  }

  function updateSyncState(result: { flushed: number; errors: string[] }) {
    setSyncErrors(result.errors)
    if (result.errors.length > 0) {
      setSyncStatus(`${result.flushed} queued item(s) synced, ${result.errors.length} error(s).`)
    } else if (result.flushed > 0) {
      setSyncStatus(`${result.flushed} queued item(s) synced successfully.`)
    } else {
      setSyncStatus('No queued items to send.')
    }
  }

  async function trySyncPending() {
    if (!token || localMode) return
    setSyncStatus('Checking queued sync…')
    const [batchResult, genericResult] = await Promise.all([
      flushPendingVoteSync(token),
      flushQueuedRequests(token, _apiFetch),
    ])
    const flushed = batchResult.flushed + genericResult.flushed
    const errors = [...batchResult.errors, ...genericResult.errors]
    updateSyncState({ flushed, errors })
    await refreshPendingCount()
  }

  // Force show UI after 3 seconds even if auth context is still loading
  useEffect(() => {
    const timer = setTimeout(() => setBootstrapTimeout(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  const q = useQuery({
    queryKey: ['field-context', token],
    enabled: Boolean(token && user?.portalId === 'field' && !localMode),
    queryFn: async () => {
      if (!token) throw new Error('no token')
      return fieldContextRequest(token)
    },
  })

  useEffect(() => {
    refreshPendingCount()
  }, [q.dataUpdatedAt])

  useEffect(() => {
    const sub = NetInfo.addEventListener((s) => {
      setOnline(s.isConnected !== false)
      if (s.isConnected && token && !localMode) {
        void trySyncPending()
      }
    })
    return () => sub()
  }, [token, localMode])

  useEffect(() => {
    if (!token || localMode) return
    void NetInfo.fetch().then((s) => {
      if (s.isConnected) void trySyncPending()
      else void refreshPendingCount()
    })
  }, [token, localMode])

  // Show loading state during bootstrap, with timeout fallback
  if (!ready && !bootstrapTimeout) return <FullScreenLoader label="Loading…" />
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field') {
    return (
      <CenteredCard>
        <Notice tone="warning" icon="swap-horizontal-outline" title="Field app only">
          Sign in with a Field portal account.
        </Notice>
        <View style={{ height: 16 }} />
        <GhostButton title="Sign out" icon="log-out-outline" onPress={() => void signOut()} />
      </CenteredCard>
    )
  }
  if (!user.onboardingComplete || user.passwordMustChange) return <Redirect href="/onboarding" />

  if (!localMode && q.isLoading) return <FullScreenLoader label="Loading assignment…" />

  if (!localMode && q.isError) {
    return (
      <CenteredCard>
        <Notice tone="danger" icon="cloud-offline-outline" title="Could not load data">
          {q.error instanceof Error ? q.error.message : 'Network error'}
        </Notice>
        <View style={{ height: 18 }} />
        <GlowButton title="Retry" icon="refresh" onPress={() => void q.refetch()} />
        <View style={{ height: 10 }} />
        <GhostButton title="Sign out" icon="log-out-outline" onPress={() => void signOut()} />
      </CenteredCard>
    )
  }

  const ctx = localMode ? null : q.data!
  const officer: Officer = {
    name: ctx?.officer.displayName ?? user.profile?.name ?? user.username,
    username: ctx?.officer.username ?? user.username,
    serviceNumber: ctx?.officer.serviceNumber ?? user.profile?.serviceNumber,
    pictureDataUrl: user.profile?.pictureDataUrl,
    verified: user.profile?.livenessVerified,
  }

  return (
    <Dashboard
      ctx={ctx}
      localMode={localMode}
      officer={officer}
      online={online}
      pendingCount={pendingCount}
      syncStatus={syncStatus}
      syncErrors={syncErrors}
      unreadMessages={unreadMessages}
      refreshing={q.isRefetching}
      onRefresh={() => {
        void q.refetch()
        void refreshUnreadMessages()
      }}
      onRetrySync={() => void trySyncPending()}
      onSignOut={() => void signOut()}
    />
  )
}

function Dashboard({
  ctx,
  localMode,
  officer,
  online,
  pendingCount,
  syncStatus,
  syncErrors,
  unreadMessages,
  refreshing,
  onRefresh,
  onRetrySync,
  onSignOut,
}: {
  ctx: FieldContext | null
  localMode: boolean
  officer: Officer
  online: boolean
  pendingCount: number
  syncStatus: string | null
  syncErrors: string[]
  unreadMessages: number
  refreshing: boolean
  onRefresh: () => void
  onRetrySync: () => void
  onSignOut: () => void
}) {
  const insets = useSafeAreaInsets()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [headerBottom, setHeaderBottom] = useState(76)
  const trigger = usePressScale(0.97)
  const assignment = ctx?.assignment ?? null
  const elections = ctx?.activeElections ?? []
  const liveCount = elections.filter((e) => LIVE_STATUSES.has(e.status.toLowerCase())).length
  const host = hostOf(getApiBaseUrl())

  const menuGroups: MenuItem[][] = [
    [
      {
        key: 'messages',
        icon: 'chatbubbles-outline',
        label: 'Messages from Command',
        hint: unreadMessages ? `${unreadMessages} unread` : 'Direct line to HQ',
        badge: unreadMessages,
        onPress: () => router.push('/messages'),
      },
      {
        key: 'history',
        icon: 'albums-outline',
        label: 'Submission history',
        hint: pendingCount ? `${pendingCount} waiting to sync` : 'All submissions synced',
        tone: pendingCount ? 'warning' : 'success',
        onPress: () => router.push('/history'),
      },
      {
        key: 'safety',
        icon: 'shield-checkmark-outline',
        label: 'Safety check-in',
        hint: 'Check-in · duress PIN',
        tone: 'danger',
        onPress: () => router.push('/safety'),
      },
    ],
    [
      { key: 'reference', icon: 'flag-outline', label: 'Parties & candidates', tone: 'neutral', onPress: () => router.push('/reference') },
    ],
  ]

  return (
    <View style={styles.fill}>
      <Backdrop />
      <SafeAreaView style={styles.fill} edges={['top']}>
        <View
          style={styles.header}
          onLayout={(e) => setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
        >
          <Pressable
            onPress={() => setMenuOpen(true)}
            onPressIn={trigger.onPressIn}
            onPressOut={trigger.onPressOut}
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel="Open officer menu"
          >
            <Animated.View style={[styles.identity, { transform: [{ scale: trigger.scale }] }]}>
              <View>
                <Avatar officer={officer} size={46} ring={localMode ? t.warning : t.success} />
                <View style={styles.dutyDot}>
                  <PulseDot color={localMode ? t.warning : t.success} size={8} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.greet}>
                  {greeting()} · {localMode ? 'offline' : 'on duty'}
                </Text>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {officer.name}
                  </Text>
                  <View style={[styles.chev, menuOpen && { transform: [{ rotate: '180deg' }] }]}>
                    <Ionicons name="chevron-down" size={14} color={t.muted} />
                  </View>
                </View>
              </View>
            </Animated.View>
          </Pressable>
          <Pressable
            onPress={() => router.push('/messages')}
            style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: t.glassHi }]}
            accessibilityLabel={unreadMessages ? `Messages, ${unreadMessages} unread` : 'Messages'}
          >
            <Ionicons name="notifications-outline" size={21} color={t.text} />
            {unreadMessages > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: DOCK_SPACE + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            localMode ? undefined : (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.cyan} colors={[t.cyan]} progressBackgroundColor={t.card} />
            )
          }
        >
          <View style={styles.telemetry}>
            <Telemetry label="Network" value={online ? 'Online' : 'Offline'} color={online ? t.success : t.danger} live={online} />
            <Telemetry
              label="Sync queue"
              value={pendingCount ? String(pendingCount) : 'Clear'}
              color={pendingCount ? t.warning : t.success}
            />
            <Telemetry label="Elections" value={localMode ? '—' : liveCount ? `${liveCount} live` : String(elections.length)} color={t.cyan} />
          </View>

          {(pendingCount > 0 || syncErrors.length > 0) && !localMode ? (
            <View style={styles.syncCard}>
              <View style={styles.syncHead}>
                <Ionicons name="cloud-upload-outline" size={18} color={t.warning} />
                <Text style={styles.syncTitle}>
                  {pendingCount > 0 ? `${pendingCount} queued update${pendingCount === 1 ? '' : 's'}` : 'No queued updates'}
                </Text>
                <Pressable onPress={onRetrySync} style={styles.syncBtn} hitSlop={6}>
                  <Ionicons name="sync" size={13} color={t.cyanInk} />
                  <Text style={styles.syncBtnText}>Retry</Text>
                </Pressable>
              </View>
              {syncStatus ? <Text style={styles.syncBody}>{syncStatus}</Text> : null}
              {syncErrors.length > 0 ? (
                <Text style={[styles.syncBody, { color: t.danger }]} numberOfLines={2}>
                  {`Sync errors: ${syncErrors.length}. ${syncErrors[0] ?? 'Tap network settings to verify server connection.'}`}
                </Text>
              ) : null}
            </View>
          ) : null}

          <PostCard ctx={ctx} localMode={localMode} host={host} />

          {!localMode ? (
            <>
              <SectionHeader title="Active elections" />
              {elections.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="file-tray-outline" size={22} color={t.dim} />
                  <Text style={styles.emptyText}>No active elections right now.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }} style={styles.hScroll}>
                  {elections.map((e) => (
                    <ElectionCard key={e.slug} election={e} />
                  ))}
                </ScrollView>
              )}
            </>
          ) : null}

          <SectionHeader title="Operations" />
          <View style={styles.opsGrid}>
            {OPERATIONS.map((m) => (
              <OpTile key={m.route} {...m} />
            ))}
          </View>

          {ctx ? <PulseCard pulse={ctx.nationalPulse} geography={ctx.geography} /> : null}

          <Text style={styles.footer}>
            v{Constants.expoConfig?.version ?? '1.0.0'} · {host} · RESTRICTED
          </Text>
        </ScrollView>
      </SafeAreaView>

      <Dock
        active="home"
        onAction={() => setSheetOpen(true)}
        items={[
          { key: 'home', label: 'Home', icon: 'grid-outline', iconActive: 'grid', onPress: () => {} },
          { key: 'activity', label: 'Activity', icon: 'albums-outline', iconActive: 'albums', badge: pendingCount, onPress: () => router.push('/history') },
          { key: 'inbox', label: 'Inbox', icon: 'chatbubbles-outline', iconActive: 'chatbubbles', badge: unreadMessages, onPress: () => router.push('/messages') },
          { key: 'sos', label: 'SOS', icon: 'shield-half-outline', iconActive: 'shield-half', tone: 'danger', onPress: () => router.push('/safety') },
        ]}
      />

      <OfficerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        top={insets.top + headerBottom + 6}
        officer={officer}
        groups={menuGroups}
        onSignOut={onSignOut}
        footer={`v${Constants.expoConfig?.version ?? '1.0.0'} · ${host}`}
      />

      <QuickReportSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        subtitle={assignment ? `${assignment.pollingUnit.code} · ${assignment.pollingUnit.name}` : 'No polling unit assigned'}
        actions={QUICK_ACTIONS}
        urgent={URGENT}
      />
    </View>
  )
}

function Telemetry({ label, value, color, live }: { label: string; value: string; color: string; live?: boolean }) {
  return (
    <View style={styles.tele}>
      <Text style={styles.teleLabel}>{label}</Text>
      <View style={styles.teleRow}>
        <PulseDot color={color} size={6} pulse={!!live} />
        <Text style={[styles.teleValue, { color }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  )
}

/** Hero card: the officer's polling-unit post, with a radar-arc ornament. */
function PostCard({ ctx, localMode, host }: { ctx: FieldContext | null; localMode: boolean; host: string }) {
  const a = ctx?.assignment ?? null
  return (
    <View style={styles.post}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="postBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#0F2236" />
            <Stop offset="1" stopColor="#081321" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" rx={24} fill="url(#postBg)" />
      </Svg>
      <View pointerEvents="none" style={styles.postOrnament}>
        <Svg width={180} height={180}>
          {[84, 62, 40].map((r) => (
            <Circle key={r} cx={150} cy={30} r={r} fill="none" stroke={t.cyan} strokeOpacity={0.12} strokeWidth={1} />
          ))}
          <Circle cx={150} cy={30} r={4} fill={t.cyan} fillOpacity={0.8} />
        </Svg>
      </View>

      {localMode ? (
        <>
          <Kicker color={t.warning}>Local administrator</Kicker>
          <Text style={styles.postName}>Offline session</Text>
          <Text style={styles.postMeta}>
            Signed in without network. Reports you submit will be queued and sent to the Situation Room automatically when you reconnect.
          </Text>
          <View style={styles.postChip}>
            <Ionicons name="server-outline" size={12} color={t.muted} />
            <Text style={styles.postChipText}>{host}</Text>
          </View>
        </>
      ) : a ? (
        <>
          <View style={styles.postTop}>
            <Kicker>Your post · Polling unit</Kicker>
            <StatusPill tone="success" label="Assigned" pulse />
          </View>
          <Text style={styles.postName} numberOfLines={2}>
            {a.pollingUnit.name}
          </Text>
          <View style={styles.postChip}>
            <Ionicons name="barcode-outline" size={12} color={t.cyan} />
            <Text style={[styles.postChipText, { color: t.cyan }]}>{a.pollingUnit.code}</Text>
          </View>
          <View style={styles.geoRow}>
            <Geo label="Ward" value={a.ward.name} />
            <View style={styles.geoSep} />
            <Geo label="LGA" value={a.lga.name} />
            <View style={styles.geoSep} />
            <Geo label="State" value={a.state.name} />
          </View>
          {a.pollingUnit.lat != null && a.pollingUnit.lng != null ? (
            <View style={styles.coords}>
              <Ionicons name="navigate" size={12} color={t.dim} />
              <Text style={styles.coordsText}>
                {a.pollingUnit.lat.toFixed(5)}°, {a.pollingUnit.lng.toFixed(5)}°
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Kicker color={t.warning}>Your post</Kicker>
          <Text style={styles.postName}>Awaiting assignment</Text>
          <Text style={styles.postMeta}>No polling unit assigned yet. Ask Command to assign your PU in Admin.</Text>
        </>
      )}
    </View>
  )
}

function Geo({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.geoLabel}>{label}</Text>
      <Text style={styles.geoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function ElectionCard({ election: e }: { election: FieldContext['activeElections'][number] }) {
  const press = usePressScale()
  const live = LIVE_STATUSES.has(e.status.toLowerCase())
  return (
    <Pressable
      onPress={() => router.push(`/tally/${encodeURIComponent(e.slug)}`)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={[styles.election, live && { borderColor: t.cyanLine }, { transform: [{ scale: press.scale }] }]}>
        <View style={styles.electionTop}>
          <StatusPill tone={live ? 'cyan' : 'neutral'} label={e.status} pulse={live} />
          <Ionicons name="arrow-up-outline" size={16} color={t.dim} style={{ transform: [{ rotate: '45deg' }] }} />
        </View>
        <Text style={styles.electionName} numberOfLines={2}>
          {e.name}
        </Text>
        <View style={styles.electionFoot}>
          <Ionicons name="calendar-outline" size={12} color={t.muted} />
          <Text style={styles.electionDate}>{e.electionDate ?? 'Date TBC'}</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.electionCta}>Open tally</Text>
        </View>
      </Animated.View>
    </Pressable>
  )
}

function OpTile({ route, icon, label, hint, tone }: (typeof OPERATIONS)[number]) {
  const press = usePressScale(0.96)
  return (
    <Pressable
      onPress={() => router.push(route as never)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={styles.opCell}
    >
      <Animated.View style={[styles.op, { transform: [{ scale: press.scale }] }]}>
        <View style={styles.opTop}>
          <IconChip icon={icon} tone={tone} size={38} />
          <Ionicons name="chevron-forward" size={15} color={t.dim} />
        </View>
        <Text style={styles.opLabel}>{label}</Text>
        <Text style={styles.opHint}>{hint}</Text>
      </Animated.View>
    </Pressable>
  )
}

/** National pulse: submissions per slot as cyan bars, incidents as red ticks over them. */
function PulseCard({ pulse, geography }: { pulse: FieldContext['nationalPulse']; geography: FieldContext['geography'] }) {
  const n = Math.min(14, pulse.submissions.length)
  const subs = pulse.submissions.slice(-n)
  const inc = pulse.incidents.slice(-n)
  const labels = pulse.labels.slice(-n)
  const max = Math.max(1, ...subs, ...inc)
  const peak = Math.max(0, ...pulse.submissions)
  const H = 64
  return (
    <>
      <SectionHeader title="National pulse" />
      <View style={styles.pulse}>
        <View style={styles.pulseTop}>
          <View>
            <Text style={styles.pulseBig}>{peak.toLocaleString()}</Text>
            <Text style={styles.pulseSub}>peak submissions / slot</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Legend color={t.cyan} label="Submissions" />
            <Legend color={t.danger} label="Incidents" />
          </View>
        </View>
        {n > 0 ? (
          <Svg width="100%" height={H} viewBox={`0 0 ${n * 10} ${H}`} preserveAspectRatio="none" style={{ marginTop: 16 }}>
            <Defs>
              <LinearGradient id="pulseBar" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={t.cyan} stopOpacity={0.95} />
                <Stop offset="1" stopColor={t.cyan} stopOpacity={0.15} />
              </LinearGradient>
            </Defs>
            {subs.map((v, i) => {
              const h = Math.max(2, (v / max) * (H - 4))
              const ih = Math.max(0, ((inc[i] ?? 0) / max) * (H - 4))
              return (
                <G key={i}>
                  <Rect x={i * 10 + 1.5} y={H - h} width={7} height={h} rx={1.5} fill="url(#pulseBar)" />
                  {ih > 0 ? <Rect x={i * 10 + 4} y={H - ih} width={2} height={ih} fill={t.danger} /> : null}
                </G>
              )
            })}
          </Svg>
        ) : (
          <Text style={[styles.emptyText, { marginTop: 12 }]}>No submissions recorded yet.</Text>
        )}
        {n > 0 ? (
          <View style={styles.pulseAxis}>
            <Text style={styles.axisText}>{labels[0] ?? ''}</Text>
            <Text style={styles.axisText}>{labels[labels.length - 1] ?? ''}</Text>
          </View>
        ) : null}
        <View style={styles.geoStats}>
          <GeoStat value={geography.statesAndFct} label="States" />
          <GeoStat value={geography.lgas} label="LGAs" />
          <GeoStat value={geography.wards} label="Wards" />
          <GeoStat value={geography.pollingUnits} label="PUs" />
        </View>
      </View>
    </>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={styles.axisText}>{label}</Text>
    </View>
  )
}

function GeoStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.geoStatValue}>{value.toLocaleString()}</Text>
      <Text style={styles.geoLabel}>{label}</Text>
    </View>
  )
}

function FullScreenLoader({ label }: { label: string }) {
  useLightStatusBar()
  return (
    <View style={[styles.fill, styles.center]}>
      <Backdrop />
      <ActivityIndicator size="large" color={t.cyan} />
      <Text style={styles.loaderText}>{label}</Text>
    </View>
  )
}

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <View style={[styles.fill, styles.center, { padding: 22 }]}>
      <Backdrop />
      <View style={styles.centerCard}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'transparent' },
  center: { justifyContent: 'center', alignItems: 'center' },
  loaderText: { marginTop: 16, fontFamily: mono, fontSize: 12, color: t.muted, letterSpacing: 1 },
  centerCard: {
    alignSelf: 'stretch',
    padding: 20,
    borderRadius: 24,
    backgroundColor: 'rgba(11,21,36,0.9)',
    borderWidth: 1,
    borderColor: t.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dutyDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    padding: 3,
    borderRadius: 8,
    backgroundColor: t.bg,
  },
  greet: { fontFamily: mono, fontSize: 10, fontWeight: '700', color: t.muted, letterSpacing: 1.4, textTransform: 'uppercase' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  name: { fontSize: 19, fontWeight: '800', color: t.text, letterSpacing: -0.4, flexShrink: 1 },
  chev: {
    width: 22,
    height: 22,
    borderRadius: 8,
    backgroundColor: t.glass,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: t.glass,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: t.danger,
    borderWidth: 2,
    borderColor: '#0A1424',
  },
  scroll: { paddingHorizontal: 18, paddingTop: 4 },
  telemetry: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tele: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: t.glass,
    borderWidth: 1,
    borderColor: t.border,
  },
  teleLabel: { fontFamily: mono, fontSize: 9, fontWeight: '700', color: t.dim, letterSpacing: 1.3, textTransform: 'uppercase' },
  teleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  teleValue: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  syncCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: t.warningSoft,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    marginBottom: 14,
  },
  syncHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: t.text },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 10,
    backgroundColor: t.cyan,
  },
  syncBtnText: { fontSize: 12.5, fontWeight: '800', color: t.cyanInk },
  syncBody: { fontSize: 12.5, color: t.muted, marginTop: 6, lineHeight: 18 },
  post: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: t.cyanLine,
    shadowColor: t.cyan,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  postOrnament: { position: 'absolute', right: -10, top: -10 },
  postTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  postName: { fontSize: 24, fontWeight: '800', color: t.text, letterSpacing: -0.6, marginTop: 12, lineHeight: 29 },
  postMeta: { fontSize: 14, color: t.muted, lineHeight: 20, marginTop: 8 },
  postChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(5,11,20,0.6)',
    borderWidth: 1,
    borderColor: t.border,
  },
  postChipText: { fontFamily: mono, fontSize: 11.5, fontWeight: '700', color: t.muted, letterSpacing: 0.6 },
  geoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.borderStrong,
  },
  geoSep: { width: StyleSheet.hairlineWidth, height: 26, backgroundColor: t.borderStrong, marginHorizontal: 12 },
  geoLabel: { fontFamily: mono, fontSize: 9, fontWeight: '700', color: t.dim, letterSpacing: 1.3, textTransform: 'uppercase' },
  geoValue: { fontSize: 13.5, fontWeight: '700', color: t.text, marginTop: 3 },
  coords: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  coordsText: { fontFamily: mono, fontSize: 11, color: t.dim },
  hScroll: { marginHorizontal: -18, paddingHorizontal: 18 },
  election: {
    width: 248,
    padding: 16,
    borderRadius: 20,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
  },
  electionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  electionName: { fontSize: 16, fontWeight: '700', color: t.text, marginTop: 14, lineHeight: 21, minHeight: 42 },
  electionFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  electionDate: { fontFamily: mono, fontSize: 11, color: t.muted },
  electionCta: { fontSize: 12.5, fontWeight: '700', color: t.cyan },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.borderStrong,
  },
  emptyText: { fontSize: 13.5, color: t.muted },
  opsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  opCell: { width: '50%', padding: 5 },
  op: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.border,
  },
  opTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  opLabel: { fontSize: 15, fontWeight: '700', color: t.text, marginTop: 14 },
  opHint: { fontSize: 12, color: t.dim, marginTop: 2 },
  pulse: { padding: 18, borderRadius: 22, backgroundColor: t.card, borderWidth: 1, borderColor: t.border },
  pulseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pulseBig: { fontSize: 30, fontWeight: '800', color: t.text, letterSpacing: -1 },
  pulseSub: { fontFamily: mono, fontSize: 10, color: t.dim, letterSpacing: 0.8, marginTop: 2 },
  pulseAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  axisText: { fontFamily: mono, fontSize: 10, color: t.muted },
  geoStats: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.borderStrong,
  },
  geoStatValue: { fontSize: 15, fontWeight: '800', color: t.text, marginBottom: 2 },
  footer: { fontFamily: mono, fontSize: 9.5, color: t.dim, textAlign: 'center', letterSpacing: 1.4, marginTop: 28, opacity: 0.7 },
})
