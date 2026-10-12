const COMMAND_PORTALS = new Set(['management', 'igp', 'admin'])

export function canonicalDmRoom(a, b) {
  const [lo, hi] = [String(a), String(b)].sort()
  return `dm_${lo}_${hi}`
}

export function isDmParticipant(roomId, userId) {
  const match = typeof roomId === 'string' ? /^dm_([^_]+)_([^_]+)$/.exec(roomId) : null
  return Boolean(match && (match[1] === String(userId) || match[2] === String(userId)))
}

export function authorizeDm({ senderId, senderPortal, targetId, targetPortal, scope, targetStateId, targetLgaId }) {
  if (!senderId || !targetId || String(senderId) === String(targetId)) {
    return { allowed: false, reason: 'Self-DM is not allowed' }
  }
  if (!targetPortal) return { allowed: false, reason: 'Recipient not found' }

  const senderIsCommand = COMMAND_PORTALS.has(senderPortal)
  const targetIsCommand = COMMAND_PORTALS.has(targetPortal)
  if (!senderIsCommand && !targetIsCommand) return { allowed: false, reason: 'Direct messages are limited to field and command users' }

  if (senderIsCommand && targetPortal === 'field') {
    if (scope?.level === 'state' && String(targetStateId) !== String(scope.stateId)) {
      return { allowed: false, reason: 'Recipient is outside your jurisdiction' }
    }
    if (scope?.level === 'area' && String(targetLgaId) !== String(scope.lgaId)) {
      return { allowed: false, reason: 'Recipient is outside your jurisdiction' }
    }
    if (!scope || !['national', 'state', 'area'].includes(scope.level)) {
      return { allowed: false, reason: 'Recipient is outside your jurisdiction' }
    }
  }

  return { allowed: true }
}
