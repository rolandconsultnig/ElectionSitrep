import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { SECRET_SERVER_UNLOCK_SEQUENCE } from '@/constants/secrets'

import { ServerEndpointModal } from './ServerEndpointModal'

/**
 * Wrap a touch target (e.g. logo). Long-press to focus the hidden field, then type the unlock sequence.
 * Sequence: *2435*009#
 */
export function SecretServerUnlock({ children }: { children: ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [dial, setDial] = useState('')
  const inputRef = useRef<TextInput>(null)

  return (
    <View>
      <Pressable onLongPress={() => inputRef.current?.focus()} delayLongPress={600}>
        {children}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={dial}
        onChangeText={(t) => {
          const next = t.length > 48 ? t.slice(-48) : t
          setDial(next)
          if (next.endsWith(SECRET_SERVER_UNLOCK_SEQUENCE)) {
            setDial('')
            inputRef.current?.blur()
            setModalOpen(true)
          }
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        importantForAutofill="no"
        style={styles.hiddenDial}
        caretHidden
      />
      <ServerEndpointModal visible={modalOpen} onClose={() => setModalOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  hiddenDial: {
    position: 'absolute',
    opacity: 0,
    width: 2,
    height: 2,
    left: -40,
    top: -40,
  },
})
