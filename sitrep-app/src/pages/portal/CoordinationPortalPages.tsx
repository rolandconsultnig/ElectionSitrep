import React from 'react'
import { InterAgencyTaskforceBoard } from '../../components/coordination/InterAgencyTaskforceBoard'
import { CommandDirectivesHub } from '../../components/coordination/CommandDirectivesHub'
import { GeofencedQrfTracker } from '../../components/coordination/GeofencedQrfTracker'
import { SituationRoomSyncController } from '../../components/coordination/SituationRoomSyncController'

export const InterAgencyTaskforcePage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <InterAgencyTaskforceBoard />
    </div>
  )
}

export const CommandDirectivesPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CommandDirectivesHub />
    </div>
  )
}

export const GeofencedQrfPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <GeofencedQrfTracker />
    </div>
  )
}

export const SituationRoomSyncPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SituationRoomSyncController />
    </div>
  )
}
