import { mono, tactical as t } from '../../lib/theme'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import Svg, { Defs, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg'

export type IconName = ComponentProps<typeof Ionicons>['name']
export type Tone = 'cyan' | 'success' | 'warning' | 'danger' | 'violet' | 'neutral'

export const nativeDriver = Platform.OS !== 'web'

export const toneColor: Record<Tone, { fg: string; bg: string }> = {
  cyan: { fg: t.cyan, bg: t.cyanSoft },
  success: { fg: t.success, bg: t.successSoft },
  warning: { fg: t.warning, bg: t.warningSoft },
  danger: { fg: t.danger, bg: t.dangerSoft },
  violet: { fg: t.violet, bg: t.violetSoft },
  neutral: { fg: t.muted, bg: t.glass },
}

/** Full-screen obsidian canvas: faint tactical grid that fades out, plus two soft signal glows. */
export function Backdrop({ intensity = 1 }: { intensity?: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="tGrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <Path d="M32 0H0V32" fill="none" stroke="#94A3B8" strokeOpacity={0.07} strokeWidth={1} />
          </Pattern>
          <LinearGradient id="tFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.bg} stopOpacity={0.1} />
            <Stop offset="0.55" stopColor={t.bg} stopOpacity={0.85} />
            <Stop offset="1" stopColor={t.bg} stopOpacity={1} />
          </LinearGradient>
          <RadialGradient id="tGlowA" cx="88%" cy="-4%" r="70%">
            <Stop offset="0" stopColor={t.cyan} stopOpacity={0.2 * intensity} />
            <Stop offset="1" stopColor={t.cyan} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="tGlowB" cx="0%" cy="100%" r="65%">
            <Stop offset="0" stopColor="#3B82F6" stopOpacity={0.12 * intensity} />
            <Stop offset="1" stopColor="#3B82F6" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={t.bg} />
        <Rect width="100%" height="100%" fill="url(#tGrid)" />
        <Rect width="100%" height="100%" fill="url(#tFade)" />
        <Rect width="100%" height="100%" fill="url(#tGlowA)" />
        <Rect width="100%" height="100%" fill="url(#tGlowB)" />
      </Svg>
    </View>
  )
}

/** Live indicator: a solid dot with a ring that breathes outward. */
export function PulseDot({ color = t.success, size = 7, pulse = true }: { color?: string; size?: number; pulse?: boolean }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!pulse) return
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse, v])
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {pulse ? (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] }) }],
          }}
        />
      ) : null}
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  )
}

export function StatusPill({
  label,
  tone = 'cyan',
  pulse = false,
  icon,
  style,
}: {
  label: string
  tone?: Tone
  pulse?: boolean
  icon?: IconName
  style?: StyleProp<ViewStyle>
}) {
  const c = toneColor[tone]
  return (
    <View style={[s.pill, { backgroundColor: c.bg, borderColor: c.fg + '55' }, style]}>
      {icon ? <Ionicons name={icon} size={11} color={c.fg} /> : <PulseDot color={c.fg} size={6} pulse={pulse} />}
      <Text style={[s.pillText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export function Kicker({ children, color = t.cyan, style }: { children: ReactNode; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={[s.kicker, { color }]}>{children}</Text>
    </View>
  )
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionRow}>
      <View style={s.sectionTick} />
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={s.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/** Press feedback shared by every tappable surface: a quick spring squish. */
export function usePressScale(to = 0.97) {
  const v = useRef(new Animated.Value(1)).current
  const spring = (toValue: number) =>
    Animated.spring(v, { toValue, useNativeDriver: nativeDriver, damping: 26, stiffness: 320, mass: 0.6 }).start()
  return { scale: v, onPressIn: () => spring(to), onPressOut: () => spring(1) }
}

export function GlowButton({
  title,
  onPress,
  loading,
  disabled,
  icon = 'arrow-forward',
  tone = 'cyan',
}: {
  title: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  icon?: IconName
  tone?: 'cyan' | 'danger'
}) {
  const press = usePressScale()
  const [from, to, ink] = tone === 'danger' ? ['#FB7185', '#E11D48', '#ffffff'] : ['#67E8F9', t.cyanDeep, t.cyanInk]
  const inactive = disabled && !loading
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
    >
      <Animated.View
        style={[
          s.glowBtn,
          { shadowColor: from, opacity: inactive ? 0.45 : 1, transform: [{ scale: press.scale }] },
        ]}
      >
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id={`gb${tone}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
            <LinearGradient id={`gbSheen${tone}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.28} />
              <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" rx={16} fill={`url(#gb${tone})`} />
          <Rect width="100%" height="100%" rx={16} fill={`url(#gbSheen${tone})`} />
        </Svg>
        {loading ? <ActivityIndicator color={ink} /> : null}
        <Text style={[s.glowBtnText, { color: ink }]}>{title}</Text>
        {!loading && icon ? (
          <View style={[s.glowBtnIcon, { backgroundColor: ink + '1F' }]}>
            <Ionicons name={icon} size={16} color={ink} />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  )
}

export function GhostButton({
  title,
  onPress,
  icon,
  loading,
  disabled,
  trailing,
}: {
  title: string
  onPress: () => void
  icon?: IconName
  loading?: boolean
  disabled?: boolean
  trailing?: ReactNode
}) {
  const press = usePressScale()
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
      <Animated.View style={[s.ghostBtn, { opacity: disabled ? 0.5 : 1, transform: [{ scale: press.scale }] }]}>
        {loading ? <ActivityIndicator size="small" color={t.cyan} /> : icon ? <Ionicons name={icon} size={17} color={t.cyan} /> : null}
        <Text style={s.ghostBtnText}>{title}</Text>
        {trailing}
      </Animated.View>
    </Pressable>
  )
}

export function TacticalInput({
  label,
  icon,
  secure,
  error,
  ...rest
}: TextInputProps & { label: string; icon: IconName; secure?: boolean; error?: boolean }) {
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(true)
  const f = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(f, { toValue: focused ? 1 : 0, duration: 180, useNativeDriver: false }).start()
  }, [focused, f])
  const borderColor = error
    ? t.danger
    : f.interpolate({ inputRange: [0, 1], outputRange: [t.border, t.cyan] })
  return (
    <View>
      <Text style={[s.inputLabel, focused && { color: t.cyan }]}>{label}</Text>
      <Animated.View
        style={[
          s.inputWrap,
          {
            borderColor,
            backgroundColor: f.interpolate({ inputRange: [0, 1], outputRange: [t.glass, 'rgba(34,211,238,0.06)'] }),
          },
        ]}
      >
        <Ionicons name={icon} size={18} color={focused ? t.cyan : t.dim} />
        <TextInput
          {...rest}
          secureTextEntry={secure ? hidden : rest.secureTextEntry}
          placeholderTextColor={t.dim}
          selectionColor={t.cyan}
          cursorColor={t.cyan}
          onFocus={(e) => {
            setFocused(true)
            rest.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            rest.onBlur?.(e)
          }}
          style={s.input}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={12} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={19} color={t.muted} />
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  )
}

/** Inline notice row: icon chip + message. */
export function Notice({ tone, icon, title, children }: { tone: Tone; icon: IconName; title?: string; children: ReactNode }) {
  const c = toneColor[tone]
  return (
    <View style={[s.notice, { backgroundColor: c.bg, borderColor: c.fg + '40' }]}>
      <View style={[s.noticeIcon, { backgroundColor: c.fg + '22' }]}>
        <Ionicons name={icon} size={15} color={c.fg} />
      </View>
      <View style={{ flex: 1 }}>
        {title ? <Text style={[s.noticeTitle, { color: c.fg }]}>{title}</Text> : null}
        <Text style={s.noticeBody}>{children}</Text>
      </View>
    </View>
  )
}

/** Rounded square icon chip used in tiles, menus and lists. */
export function IconChip({ icon, tone = 'cyan', size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
  const c = toneColor[tone]
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: c.fg + '33',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={size * 0.48} color={c.fg} />
    </View>
  )
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '··'
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontFamily: mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  kicker: { fontFamily: mono, fontSize: 10.5, fontWeight: '700', letterSpacing: 2.6, textTransform: 'uppercase' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 12 },
  sectionTick: { width: 3, height: 12, borderRadius: 2, backgroundColor: t.cyan },
  sectionTitle: { fontFamily: mono, fontSize: 11, fontWeight: '700', color: t.muted, letterSpacing: 2.2, textTransform: 'uppercase' },
  sectionAction: { fontSize: 13, fontWeight: '600', color: t.cyan },
  glowBtn: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  glowBtnText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  glowBtnIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  ghostBtn: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.glass,
  },
  ghostBtnText: { color: t.text, fontSize: 14, fontWeight: '700' },
  inputLabel: {
    fontFamily: mono,
    fontSize: 10,
    fontWeight: '700',
    color: t.dim,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    height: '100%',
    color: t.text,
    fontSize: 16,
    fontWeight: '500',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  notice: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 14, borderWidth: 1 },
  noticeIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  noticeTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  noticeBody: { fontSize: 13, color: t.text, lineHeight: 19, opacity: 0.9 },
})
