import { mono, tactical as t } from '../../lib/theme'
import { IconChip, initials, nativeDriver, type IconName, type Tone } from './primitives'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

export type MenuItem = {
  key: string
  icon: IconName
  label: string
  hint?: string
  tone?: Tone
  badge?: number
  onPress: () => void
}

export type Officer = {
  name: string
  username: string
  serviceNumber?: string | null
  pictureDataUrl?: string | null
  verified?: boolean
}

export function Avatar({ officer, size = 44, ring = t.success }: { officer: Officer; size?: number; ring?: string }) {
  const inner = size - 6
  return (
    <View style={[styles.avatarRing, { width: size, height: size, borderRadius: size * 0.36, borderColor: ring }]}>
      {officer.pictureDataUrl ? (
        <Image source={{ uri: officer.pictureDataUrl }} style={{ width: inner, height: inner, borderRadius: inner * 0.34 }} />
      ) : (
        <View style={[styles.avatarFallback, { width: inner, height: inner, borderRadius: inner * 0.34 }]}>
          <Text style={[styles.avatarText, { fontSize: inner * 0.36 }]}>{initials(officer.name)}</Text>
        </View>
      )}
    </View>
  )
}

/**
 * Dropdown anchored under the dashboard header: officer identity card, grouped shortcuts and sign-out.
 * Springs open from the top-right corner (where the avatar trigger sits) over a dimmed scrim.
 */
export function OfficerMenu({
  open,
  onClose,
  top,
  officer,
  groups,
  onSignOut,
  footer,
}: {
  open: boolean
  onClose: () => void
  top: number
  officer: Officer
  groups: MenuItem[][]
  onSignOut: () => void
  footer?: string
}) {
  const [mounted, setMounted] = useState(open)
  const v = useRef(new Animated.Value(0)).current
  const { width } = useWindowDimensions()

  useEffect(() => {
    if (open) {
      setMounted(true)
      Haptics.selectionAsync().catch(() => {})
      Animated.spring(v, { toValue: 1, useNativeDriver: nativeDriver, damping: 24, stiffness: 260, mass: 0.8 }).start()
    } else {
      Animated.timing(v, { toValue: 0, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: nativeDriver }).start(
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
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          {
            top,
            width: Math.min(380, width - 28),
            opacity: v,
            transform: [
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
              { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.caret} />

        <View style={styles.identity}>
          <Avatar officer={officer} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {officer.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {officer.serviceNumber ? `SVC ${officer.serviceNumber}` : officer.username}
            </Text>
            <View style={[styles.verify, { backgroundColor: officer.verified ? t.successSoft : t.warningSoft }]}>
              <Ionicons
                name={officer.verified ? 'finger-print' : 'alert-circle-outline'}
                size={11}
                color={officer.verified ? t.success : t.warning}
              />
              <Text style={[styles.verifyText, { color: officer.verified ? t.success : t.warning }]}>
                {officer.verified ? 'Identity verified' : 'Liveness pending'}
              </Text>
            </View>
          </View>
        </View>

        {groups.map((group, gi) => (
          <View key={gi} style={styles.group}>
            {group.map((item) => (
              <Pressable
                key={item.key}
                onPress={run(item.onPress)}
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: t.glassHi }]}
              >
                <IconChip icon={item.icon} tone={item.tone ?? 'cyan'} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  {item.hint ? <Text style={styles.itemHint}>{item.hint}</Text> : null}
                </View>
                {item.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={t.dim} />
                )}
              </Pressable>
            ))}
          </View>
        ))}

        <Pressable
          onPress={run(onSignOut)}
          style={({ pressed }) => [styles.signOut, pressed && { backgroundColor: 'rgba(244,63,94,0.2)' }]}
        >
          <Ionicons name="log-out-outline" size={18} color={t.danger} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(2,6,12,0.66)' },
  panel: {
    position: 'absolute',
    right: 14,
    backgroundColor: '#0C1828',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.borderStrong,
    padding: 8,
    transformOrigin: 'top right',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 24 },
    elevation: 24,
  },
  caret: {
    position: 'absolute',
    top: -7,
    right: 26,
    width: 14,
    height: 14,
    backgroundColor: '#0C1828',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: t.borderStrong,
    transform: [{ rotate: '45deg' }],
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: t.glass,
    borderWidth: 1,
    borderColor: t.border,
  },
  name: { fontSize: 16, fontWeight: '700', color: t.text, letterSpacing: -0.2 },
  meta: { fontFamily: mono, fontSize: 11, color: t.muted, marginTop: 2 },
  verify: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    marginTop: 7,
  },
  verifyText: { fontFamily: mono, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  group: { paddingTop: 6, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 14 },
  itemLabel: { fontSize: 14.5, fontWeight: '600', color: t.text },
  itemHint: { fontSize: 12, color: t.dim, marginTop: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: t.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: t.cyanInk },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: t.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.3)',
  },
  signOutText: { fontSize: 14.5, fontWeight: '700', color: t.danger },
  footer: { fontFamily: mono, fontSize: 9.5, color: t.dim, textAlign: 'center', letterSpacing: 1.2, marginTop: 10, marginBottom: 4 },
  avatarRing: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarFallback: { backgroundColor: '#123049', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800', color: t.cyan, letterSpacing: 0.5 },
})
