import { colors, radii, space } from '../lib/theme'
import { useAuth } from '../lib/auth-context'
import { isLocalSessionToken } from '../lib/local-session'
import { Redirect, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

/** Shared session guard for field-module screens. */
export function useFieldSession() {
  const { token, user, ready } = useAuth()
  const localMode = isLocalSessionToken(token)
  return { token, user, ready, localMode }
}

export function LocalSessionBlocked({ feature }: { feature: string }) {
  const router = useRouter()
  return (
    <View style={{ padding: space.lg }}>
      <Text style={ui.blocked}>
        {feature} requires a connected officer account. Sign out and use your issued credentials.
      </Text>
      <Pressable onPress={() => router.back()} style={ui.btn}>
        <Text style={ui.btnText}>Go back</Text>
      </Pressable>
    </View>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[ui.card, style]}>{children}</View>
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={ui.section}>{children}</Text>
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={ui.fieldLabel}>{children}</Text>
}

export function FieldInput(props: {
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'number-pad' | 'phone-pad'
  multiline?: boolean
  secureTextEntry?: boolean
}) {
  return (
    <TextInput
      style={[ui.input, props.multiline && ui.inputMultiline]}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={colors.muted}
      keyboardType={props.keyboardType ?? 'default'}
      multiline={props.multiline}
      secureTextEntry={props.secureTextEntry}
    />
  )
}

export function ChipGroup<T extends string>(props: {
  options: ReadonlyArray<{ value: T; label: string; tone?: 'default' | 'danger' | 'warn' | 'success' }>
  selected: T
  onSelect: (v: T) => void
}) {
  return (
    <View style={ui.chipRow}>
      {props.options.map((o) => {
        const active = props.selected === o.value
        const toneColor =
          o.tone === 'danger'
            ? colors.danger
            : o.tone === 'warn'
              ? colors.warn
              : o.tone === 'success'
                ? colors.success
                : colors.primary
        return (
          <Pressable
            key={o.value}
            onPress={() => props.onSelect(o.value)}
            style={[
              ui.chip,
              active && { backgroundColor: toneColor, borderColor: toneColor },
            ]}
          >
            <Text style={[ui.chipText, active && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function PrimaryButton(props: {
  label: string
  onPress: () => void
  busy?: boolean
  disabled?: boolean
  tone?: 'primary' | 'danger' | 'success' | 'warn'
}) {
  const bg =
    props.tone === 'danger'
      ? colors.danger
      : props.tone === 'success'
        ? colors.success
        : props.tone === 'warn'
          ? colors.warn
          : colors.primary
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.busy || props.disabled}
      style={[ui.btn, { backgroundColor: bg }, (props.busy || props.disabled) && { opacity: 0.6 }]}
    >
      {props.busy ? <ActivityIndicator color="#fff" /> : <Text style={ui.btnText}>{props.label}</Text>}
    </Pressable>
  )
}

export function StatusNote({ text, tone }: { text: string; tone?: 'info' | 'error' | 'success' }) {
  const color = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.muted
  return <Text style={[ui.note, { color }]}>{text}</Text>
}

/** Convenience: formatted timestamp or em-dash. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export const ui = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.md,
  },
  section: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space.sm, marginTop: space.sm },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space.xs, marginTop: space.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fafbfc',
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  btn: {
    marginTop: space.md,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  note: { fontSize: 13, marginTop: space.sm, lineHeight: 18 },
  blocked: { fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: space.lg },
})
