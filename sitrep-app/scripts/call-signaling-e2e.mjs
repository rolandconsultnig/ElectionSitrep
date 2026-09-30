/**
 * Live two-client end-to-end test of the HQ call/chat signaling protocol
 * against the running API (server/src/websockets.js).
 *
 * One socket acts as the field officer, a second as HQ (management),
 * exchanging exactly the event sequence the real UI components use.
 *
 * Run: node scripts/call-signaling-e2e.mjs
 */
import { io } from 'socket.io-client'

const API = process.env.API_URL || 'http://127.0.0.1:5530'
const PASSWORD = 'e2e-test-pass'

let passed = 0
let failed = 0
const results = []

function check(name, cond, detail = '') {
  const ok = !!cond
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  ok ? passed++ : failed++
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const waitFor = (socket, event, predicate = () => true, ms = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`timeout waiting for "${event}"`))
    }, ms)
    const handler = (data) => {
      if (!predicate(data)) return
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(data)
    }
    socket.on(event, handler)
  })

async function login(username) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`login failed for ${username}: ${data.error}`)
  return data
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(API, { auth: { token }, transports: ['websocket'] })
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', (e) => reject(e))
    setTimeout(() => reject(new Error('socket connect timeout')), 5000)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- main ----------
const fieldAuth = await login('field.officer1')
const hqAuth = await login('management.ops')
const fieldId = String(fieldAuth.user.id)
const hqId = String(hqAuth.user.id)
const dmRoom = `dm_${[fieldId, hqId].sort().join('_')}`
console.log(`field=${fieldAuth.user.username} (${fieldId})\nhq=${hqAuth.user.username} (${hqId})\ndmRoom=${dmRoom}\n`)

// HQ connects first, then the field officer
const hq = await connect(hqAuth.token)
const hqOfficers = waitFor(hq, 'initial_active_officers')
const officerOnline = waitFor(hq, 'field_officer_online', (d) => d.userId === fieldId)
const field = await connect(fieldAuth.token)
await hqOfficers

// 1. HQ presence delivered to the field officer
const presence = await waitFor(field, 'hq_presence', (d) => d.count >= 1)
check('hq_presence reaches field officer', presence.count >= 1, `count=${presence.count}`)

// 2. Field officer online list reaches HQ
const officers = await officerOnline
check('field_officer_online reaches HQ', officers.username === 'field.officer1', `username=${officers.username}`)

// 3. Field officer places a video call to HQ
const incoming = waitFor(hq, 'incoming_call', (d) => d.callId === 'e2e-call-1')
field.emit('initiate_call', { callType: 'video', callId: 'e2e-call-1' })
const call = await incoming
check(
  'HQ receives incoming_call with correct payload',
  call.callerId === fieldId && call.callerUsername === 'field.officer1' && call.callType === 'video',
  JSON.stringify(call)
)

// 4. HQ answers -> field gets call_response, other HQ screens get call_taken
const accepted = waitFor(field, 'call_response', (d) => d.callId === 'e2e-call-1')
const taken = waitFor(hq, 'call_taken', (d) => d.callId === 'e2e-call-1')
hq.emit('call_response', { callId: 'e2e-call-1', callerId: fieldId, accepted: true })
const acc = await accepted
await taken
check(
  'field gets call_response(accepted) with responder identity',
  acc.accepted === true && acc.responderId === hqId && acc.responderUsername === 'management.ops',
  JSON.stringify(acc)
)
check('accepting HQ screen receives call_taken', true)

// 5. WebRTC SDP exchange in both directions (offer from acceptor, answer back)
const offer = waitFor(field, 'webrtc_signal', (d) => d.signal?.type === 'offer')
hq.emit('webrtc_signal', { targetId: fieldId, signal: { type: 'offer', sdp: 'e2e-fake-offer' } })
const gotOffer = await offer
check('offer signal delivered to caller with sender identity', gotOffer.senderId === hqId && gotOffer.senderUsername === 'management.ops')

const answer = waitFor(hq, 'webrtc_signal', (d) => d.signal?.type === 'answer')
field.emit('webrtc_signal', { targetId: hqId, signal: { type: 'answer', sdp: 'e2e-fake-answer' } })
const gotAnswer = await answer
check('answer signal delivered back to acceptor', gotAnswer.senderId === fieldId)

// 6. HQ hangs up -> field notified
const ended = waitFor(field, 'call_ended')
hq.emit('end_call', { targetUserId: fieldId })
const endData = await ended
check('end_call notifies the remote party', endData.byUsername === 'management.ops', JSON.stringify(endData))

// 7. Decline path
const declined = waitFor(field, 'call_response', (d) => d.callId === 'e2e-call-2')
field.emit('initiate_call', { callType: 'audio', callId: 'e2e-call-2' })
await waitFor(hq, 'incoming_call', (d) => d.callId === 'e2e-call-2')
hq.emit('call_response', { callId: 'e2e-call-2', callerId: fieldId, accepted: false })
const dec = await declined
check('decline path: caller gets accepted=false', dec.accepted === false && dec.callId === 'e2e-call-2')

// 8. Cancel path (caller hangs up while ringing)
const cancelled = waitFor(hq, 'call_cancelled', (d) => d.callId === 'e2e-call-3')
field.emit('initiate_call', { callType: 'video', callId: 'e2e-call-3' })
await sleep(200)
field.emit('cancel_call', { callId: 'e2e-call-3' })
await cancelled
check('cancel path: ringing HQ gets call_cancelled', true)

// 9. DM persistence: field -> HQ stored under canonical dm room, both can read it
const hqDm = waitFor(hq, 'chat_message', (d) => d.content === 'e2e-test-ping')
field.emit('send_chat_message', { roomId: `user_${hqId}`, content: 'e2e-test-ping' })
const dmMsg = await hqDm
check('DM delivered live with canonical room id', dmMsg.roomId === dmRoom && dmMsg.senderUsername === 'field.officer1', `room=${dmMsg.roomId}`)

const fieldHistory = await (await fetch(`${API}/api/chat/dm/history`, { headers: { Authorization: `Bearer ${fieldAuth.token}` } })).json()
const hqRoomHistory = await (await fetch(`${API}/api/chat/${dmRoom}`, { headers: { Authorization: `Bearer ${hqAuth.token}` } })).json()
const inFieldHist = fieldHistory.messages.some((m) => m.content === 'e2e-test-ping' && m.room_id === dmRoom)
const inHqHist = hqRoomHistory.messages.some((m) => m.content === 'e2e-test-ping')
check('DM readable from GET /api/chat/dm/history (field side)', inFieldHist)
check('DM readable from GET /api/chat/:room (HQ side, same thread)', inHqHist)

// 10. HQ offline -> field is told the call is unavailable
const presence0 = waitFor(field, 'hq_presence', (d) => d.count === 0)
hq.disconnect()
const p0 = await presence0
check('hq_presence drops to 0 when HQ disconnects', p0.count === 0)
await sleep(300)
const unavailable = waitFor(field, 'call_unavailable', () => true, 5000)
field.emit('initiate_call', { callType: 'video', callId: 'e2e-call-4' })
await unavailable
check('call_unavailable returned when no HQ staff online', true)

field.disconnect()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
