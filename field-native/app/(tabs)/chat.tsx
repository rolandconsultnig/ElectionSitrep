import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'

import { useAuth } from '@/context/auth'
import { VoiceRecorder } from '@/components/VoiceRecorder'
import { VoiceCall } from '@/components/VoiceCall'

interface ChatMessage {
  id: string
  sender: 'field' | 'command'
  text: string
  timestamp: string
  type: 'text' | 'voice'
  voiceUrl?: string
}

export default function ChatScreen() {
  const { user } = useAuth()
  const insets = useSafeAreaInsets()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [showVoiceModal, setShowVoiceModal] = useState(false)
  const [showCallModal, setShowCallModal] = useState(false)
  const [callType, setCallType] = useState<'command' | 'emergency'>('command')
  const flatListRef = useRef<FlatList>(null)

  // Simulate loading initial messages
  useEffect(() => {
    setMessages([
      {
        id: '1',
        sender: 'command',
        text: 'Welcome to Command Center. Report any incidents or request assistance here.',
        timestamp: new Date().toISOString(),
        type: 'text',
      },
    ])
    setConnected(true)
  }, [user?.username])

  const sendMessage = async () => {
    if (!inputText.trim()) return

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'field',
      text: inputText.trim(),
      timestamp: new Date().toISOString(),
      type: 'text',
    }

    setMessages((prev) => [...prev, newMessage])
    setInputText('')
    
    // Scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true })
    }, 100)

    // Simulate command response
    setTimeout(() => {
      const response: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'command',
        text: `Message received from ${user?.username}. Command center will review and respond shortly.`,
        timestamp: new Date().toISOString(),
        type: 'text',
      }
      setMessages((prev) => [...prev, response])
    }, 2000)
  }

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isField = item.sender === 'field'
    return (
      <View style={[styles.messageBubble, isField ? styles.fieldBubble : styles.commandBubble]}>
        <Text style={[styles.messageText, isField ? styles.fieldText : styles.commandText]}>
          {item.text}
        </Text>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString('en-NG', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.connectionIndicator}>
          <View style={[styles.dot, connected && styles.dotConnected]} />
          <Text style={styles.connectionText}>
            {connected ? 'Connected to Command' : 'Reconnecting...'}
          </Text>
        </View>
        <Text style={styles.headerTitle}>SitRep Command Center</Text>
        
        {/* Call Buttons */}
        <View style={styles.callButtons}>
          <Pressable 
            style={styles.callButton} 
            onPress={() => { setCallType('command'); setShowCallModal(true) }}
          >
            <Ionicons name="call" size={20} color="#0dccb0" />
            <Text style={styles.callButtonText}>Voice Call</Text>
          </Pressable>
          <Pressable 
            style={[styles.callButton, styles.emergencyButton]} 
            onPress={() => { setCallType('emergency'); setShowCallModal(true) }}
          >
            <Ionicons name="alert-circle" size={20} color="#f05b4d" />
            <Text style={[styles.callButtonText, styles.emergencyText]}>Emergency</Text>
          </Pressable>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable style={styles.voiceButton} onPress={() => setShowVoiceModal(true)}>
          <Ionicons name="mic" size={24} color="#0dccb0" />
        </Pressable>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type message to Command..."
          placeholderTextColor="#6b7a96"
          multiline
          maxLength={500}
        />
        <Pressable
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>

      {/* Voice Recording Modal */}
      <Modal
        visible={showVoiceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVoiceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Voice Message to Command</Text>
            <VoiceRecorder
              onRecordingComplete={(uri, duration) => {
                const voiceMessage: ChatMessage = {
                  id: Date.now().toString(),
                  sender: 'field',
                  text: `Voice message (${Math.round(duration)}s)`,
                  timestamp: new Date().toISOString(),
                  type: 'voice',
                  voiceUrl: uri,
                }
                setMessages((prev) => [...prev, voiceMessage])
                setShowVoiceModal(false)
                setTimeout(() => {
                  flatListRef.current?.scrollToEnd({ animated: true })
                }, 100)
              }}
            />
            <Pressable
              style={styles.closeModalButton}
              onPress={() => setShowVoiceModal(false)}
            >
              <Text style={styles.closeModalText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Voice Call Modal */}
      <VoiceCall
        visible={showCallModal}
        onClose={() => setShowCallModal(false)}
        callType={callType}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0d1a2d',
  },
  connectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f87171',
    marginRight: 8,
  },
  dotConnected: {
    backgroundColor: '#0dccb0',
  },
  connectionText: {
    color: '#8a9ab8',
    fontSize: 12,
  },
  headerTitle: {
    color: '#e8edf5',
    fontSize: 18,
    fontWeight: '700',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  fieldBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#0dccb0',
  },
  commandBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  fieldText: {
    color: '#0a1628',
  },
  commandText: {
    color: '#e8edf5',
  },
  timestamp: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0d1a2d',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#e8edf5',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sendButton: {
    marginLeft: 12,
    backgroundColor: '#0dccb0',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#0a1628',
    fontWeight: '700',
  },
  voiceButton: {
    marginRight: 12,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#0d1a2d',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#e8edf5',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  closeModalButton: {
    marginTop: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeModalText: {
    color: '#8a9ab8',
    fontSize: 14,
  },
  callButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(13,204,176,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(13,204,176,0.3)',
  },
  emergencyButton: {
    backgroundColor: 'rgba(240,91,77,0.1)',
    borderColor: 'rgba(240,91,77,0.3)',
  },
  callButtonText: {
    color: '#0dccb0',
    fontSize: 13,
    fontWeight: '600',
  },
  emergencyText: {
    color: '#f05b4d',
  },
})
