import React from 'react'
import { OfflineSyncQueueManager } from '../../components/technology/OfflineSyncQueueManager'
import { DeviceTelemetryMonitor } from '../../components/technology/DeviceTelemetryMonitor'
import { SmsGatewayParserView } from '../../components/technology/SmsGatewayParserView'
import { TamperProofAuditLedgerView } from '../../components/technology/TamperProofAuditLedgerView'

export const OfflineSyncManagerPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <OfflineSyncQueueManager />
    </div>
  )
}

export const DeviceTelemetryPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <DeviceTelemetryMonitor />
    </div>
  )
}

export const SmsGatewayParserPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SmsGatewayParserView />
    </div>
  )
}

export const CryptographicAuditLedgerPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <TamperProofAuditLedgerView />
    </div>
  )
}
