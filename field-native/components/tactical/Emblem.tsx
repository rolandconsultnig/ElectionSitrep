import { tactical as t } from '../../lib/theme'
import { nativeDriver } from './primitives'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef } from 'react'
import { Animated, Easing, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native'
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg'

/** Radar crest: concentric range rings, a slow rotating sweep and a badge at the centre.
 *  Pass `badgeSource` (e.g. the NPF crest) to replace the default shield glyph. */
export function Emblem({ size = 148, badgeSource }: { size?: number; badgeSource?: ImageSourcePropType }) {
  const spin = useRef(new Animated.Value(0)).current
  const ring = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4200, easing: Easing.linear, useNativeDriver: nativeDriver }))
    const b = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 40000, easing: Easing.linear, useNativeDriver: nativeDriver }))
    a.start()
    b.start()
    return () => {
      a.stop()
      b.stop()
    }
  }, [spin, ring])

  const c = size / 2
  const r = c - 2
  const sweep = `M${c} ${c} L${c} ${c - r} A${r} ${r} 0 0 1 ${c + r * Math.sin(Math.PI / 3)} ${c - r * Math.cos(Math.PI / 3)} Z`
  const rotate = (v: Animated.Value, dir = 1) => ({
    transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * dir}deg`] }) }],
  })
  const badge = size * 0.4

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="emCore" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={t.cyan} stopOpacity={0.18} />
            <Stop offset="1" stopColor={t.cyan} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={c} cy={c} r={r} fill="url(#emCore)" />
        {[1, 0.72, 0.46].map((k) => (
          <Circle key={k} cx={c} cy={c} r={r * k} fill="none" stroke={t.cyan} strokeOpacity={0.1 + (1 - k) * 0.12} strokeWidth={1} />
        ))}
        <Line x1={c} y1={2} x2={c} y2={size - 2} stroke={t.cyan} strokeOpacity={0.08} />
        <Line x1={2} y1={c} x2={size - 2} y2={c} stroke={t.cyan} strokeOpacity={0.08} />
      </Svg>

      <Animated.View style={[StyleSheet.absoluteFill, rotate(spin)]}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="emSweep" x1="0" y1="0" x2="1" y2="0.6">
              <Stop offset="0" stopColor={t.cyan} stopOpacity={0.42} />
              <Stop offset="1" stopColor={t.cyan} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={sweep} fill="url(#emSweep)" />
          <Line x1={c} y1={c} x2={c} y2={c - r} stroke={t.cyan} strokeOpacity={0.9} strokeWidth={1.5} />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, rotate(ring, -1)]}>
        <Svg width={size} height={size}>
          <G>
            <Circle
              cx={c}
              cy={c}
              r={r * 0.86}
              fill="none"
              stroke={t.cyan}
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="2 7"
            />
            <Circle cx={c} cy={c - r * 0.86} r={2.5} fill={t.cyan} />
          </G>
        </Svg>
      </Animated.View>

      <View style={[styles.badge, { width: badge, height: badge, borderRadius: badge * 0.5, left: c - badge / 2, top: c - badge / 2 }]}>
        {badgeSource ? (
          <Image source={badgeSource} style={{ width: badge * 0.88, height: badge * 0.88 }} resizeMode="contain" />
        ) : (
          <Ionicons name="shield-checkmark" size={badge * 0.5} color={t.cyan} />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1A2C',
    borderWidth: 1,
    borderColor: t.cyanLine,
    shadowColor: t.cyan,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
})
