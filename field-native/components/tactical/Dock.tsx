import { mono, tactical as t } from '../../lib/theme'
import { IconChip, nativeDriver, usePressScale, type IconName, type Tone } from './primitives'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

export type DockItem = {
  key: string
  label: string
  icon: IconName
  iconActive: IconName
  tone?: 'cyan' | 'danger'
  badge?: number
  onPress: () => void
}

/** Height the dock occupies above the safe-area inset; scroll content should pad by this much. */
export const DOCK_SPACE = 112

/**
 * Floating command dock: two tabs either side of a raised centre action. Active tab gets a cyan
 * filament on top, a filled icon and a tinted label; every press ticks a haptic.
 */
export function Dock({
  items,
  active,
  onAction,
  actionLabel = 'Report',
}: {
  items: [DockItem, DockItem, DockItem, DockItem]
  active: string
  onAction: () => void
  actionLabel?: string
}) {
  const insets = useSafeAreaInsets()
  const fab = usePressScale(0.9)
  const left = items.slice(0, 2)
  const right = items.slice(2)

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.dock}>
        {left.map((it) => (
          <DockTab key={it.key} item={it} active={it.key === active} />
        ))}
        <View style={styles.fabSlot}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
              onAction()
            }}
            onPressIn={fab.onPressIn}
            onPressOut={fab.onPressOut}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            hitSlop={6}
          >
            <Animated.View style={[styles.fab, { transform: [{ scale: fab.scale }] }]}>
              <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                <Defs>
                  <LinearGradient id="dockFab" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#FDE047" />
                    <Stop offset="1" stopColor={t.cyanDeep} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" rx={17} fill="url(#dockFab)" />
              </Svg>
              <Ionicons name="add" size={30} color={t.cyanInk} />
            </Animated.View>
          </Pressable>
          <Text style={[styles.label, { color: t.text, marginTop: 6 }]}>{actionLabel}</Text>
        </View>
        {right.map((it) => (
          <DockTab key={it.key} item={it} active={it.key === active} />
        ))}
      </View>
    </View>
  )
}

function DockTab({ item, active }: { item: DockItem; active: boolean }) {
  const press = usePressScale(0.88)
  const on = useRef(new Animated.Value(active ? 1 : 0)).current
  useEffect(() => {
    Animated.spring(on, { toValue: active ? 1 : 0, useNativeDriver: nativeDriver, damping: 22, stiffness: 240 }).start()
  }, [active, on])
  const color = item.tone === 'danger' ? t.danger : active ? t.cyan : t.muted
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {})
        item.onPress()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.badge ? `${item.label}, ${item.badge} new` : item.label}
    >
      <Animated.View
        style={[
          styles.filament,
          { opacity: on, transform: [{ scaleX: on.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] },
        ]}
      />
      <Animated.View style={{ alignItems: 'center', transform: [{ scale: press.scale }] }}>
        <View>
          <Ionicons name={active ? item.iconActive : item.icon} size={23} color={color} />
          {item.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.label, { color }]}>{item.label}</Text>
      </Animated.View>
    </Pressable>
  )
}

export type QuickAction = { key: string; icon: IconName; label: string; hint: string; tone: Tone; onPress: () => void }

/** Bottom sheet behind the dock's centre button: the four everyday reports plus an urgent violence row. */
export function QuickReportSheet({
  open,
  onClose,
  subtitle,
  actions,
  urgent,
}: {
  open: boolean
  onClose: () => void
  subtitle?: string
  actions: QuickAction[]
  urgent: QuickAction
}) {
  const insets = useSafeAreaInsets()
  const [mounted, setMounted] = useState(open)
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (open) {
      setMounted(true)
      Animated.spring(v, { toValue: 1, useNativeDriver: nativeDriver, damping: 28, stiffness: 220, mass: 0.9 }).start()
    } else {
      Animated.timing(v, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: nativeDriver }).start(
        ({ finished }) => finished && setMounted(false),
      )
    }
  }, [open, v])
  if (!mounted) return null

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: v }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + 18,
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }],
          },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>Quick report</Text>
            {subtitle ? <Text style={styles.sheetSub}>{subtitle}</Text> : null}
          </View>
          <Pressable onPress={onClose} style={styles.close} hitSlop={8} accessibilityLabel="Close">
            <Ionicons name="close" size={18} color={t.muted} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {actions.map((a) => (
            <Pressable
              key={a.key}
              onPress={run(a.onPress)}
              style={({ pressed }) => [styles.tile, pressed && { backgroundColor: t.glassHi, transform: [{ scale: 0.98 }] }]}
            >
              <IconChip icon={a.icon} tone={a.tone} size={42} />
              <Text style={styles.tileLabel}>{a.label}</Text>
              <Text style={styles.tileHint}>{a.hint}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={run(urgent.onPress)}
          style={({ pressed }) => [styles.urgent, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.urgentIcon}>
            <Ionicons name={urgent.icon} size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.urgentLabel}>{urgent.label}</Text>
            <Text style={styles.urgentHint}>{urgent.hint}</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={t.danger} />
        </Pressable>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  dock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 70,
    borderRadius: 26,
    backgroundColor: 'rgba(10,20,36,0.96)',
    borderWidth: 1,
    borderColor: t.borderStrong,
    paddingHorizontal: 6,
    paddingBottom: 9,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  filament: {
    position: 'absolute',
    top: -1,
    width: 26,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: t.cyan,
    shadowColor: t.cyan,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  label: { fontSize: 10.5, fontWeight: '700', marginTop: 4, letterSpacing: 0.2 },
  fabSlot: { flex: 1.1, alignItems: 'center', justifyContent: 'flex-end' },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.cyanDeep,
    marginTop: -30,
    borderWidth: 3,
    borderColor: t.bg,
    shadowColor: t.cyan,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: t.danger,
    borderWidth: 2,
    borderColor: '#0A1424',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 9.5, fontWeight: '800', color: '#fff' },
  scrim: { backgroundColor: 'rgba(2,6,12,0.7)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0B1626',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: t.borderStrong,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.borderStrong, marginBottom: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: t.text, letterSpacing: -0.4 },
  sheetSub: { fontFamily: mono, fontSize: 11, color: t.muted, marginTop: 3 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: t.glass,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48.5%',
    flexGrow: 1,
    padding: 14,
    borderRadius: 18,
    backgroundColor: t.glass,
    borderWidth: 1,
    borderColor: t.border,
  },
  tileLabel: { fontSize: 15, fontWeight: '700', color: t.text, marginTop: 12 },
  tileHint: { fontSize: 12, color: t.dim, marginTop: 2 },
  urgent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: t.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.4)',
  },
  urgentIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: t.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentLabel: { fontSize: 15, fontWeight: '800', color: t.text },
  urgentHint: { fontSize: 12, color: '#FDA4AF', marginTop: 2 },
})
