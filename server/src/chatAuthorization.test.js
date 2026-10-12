import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizeDm, canonicalDmRoom, isDmParticipant } from './chatAuthorization.js'

test('command can DM a field officer within scope and field can DM command', () => {
  assert.equal(authorizeDm({
    senderId: 'm1',
    senderPortal: 'igp',
    targetId: 'f1',
    targetPortal: 'field',
    scope: { level: 'national' },
  }).allowed, true)
  assert.equal(authorizeDm({
    senderId: 'f1',
    senderPortal: 'field',
    targetId: 'm1',
    targetPortal: 'management',
  }).allowed, true)
})

test('field-to-field DMs and self-DMs are rejected', () => {
  assert.equal(authorizeDm({ senderId: 'f1', senderPortal: 'field', targetId: 'f2', targetPortal: 'field' }).allowed, false)
  assert.equal(authorizeDm({ senderId: 'f1', senderPortal: 'field', targetId: 'f1', targetPortal: 'field' }).allowed, false)
  assert.equal(authorizeDm({ senderId: 'f1', senderPortal: 'field', targetId: 'missing', targetPortal: null }).allowed, false)
})

test('state command cannot DM an officer outside its state', () => {
  const result = authorizeDm({
    senderId: 's1',
    senderPortal: 'management',
    targetId: 'f1',
    targetPortal: 'field',
    scope: { level: 'state', stateId: 10 },
    targetStateId: 11,
  })
  assert.equal(result.allowed, false)
  assert.equal(result.reason, 'Recipient is outside your jurisdiction')
})

test('DM rooms are canonical and participant checking is exact', () => {
  const room = canonicalDmRoom('b', 'a')
  assert.equal(room, 'dm_a_b')
  assert.equal(isDmParticipant(room, 'a'), true)
  assert.equal(isDmParticipant(room, 'c'), false)
  assert.equal(isDmParticipant('dm_a', 'a'), false)
})
