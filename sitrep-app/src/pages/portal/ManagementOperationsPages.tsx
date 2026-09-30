import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'
import { OperationalTimelineSummaryView } from '../../components/operations/OperationalTimelineView'
import { Ec8aCollationMirrorView } from '../../components/operations/Ec8aCollationMirror'
import { SensitiveMaterialsTrackerView } from '../../components/operations/SensitiveMaterialsTracker'
import { DeploymentRosterManagerView } from '../../components/operations/DeploymentRosterManager'
import { LogisticsWorkflowManagerView } from '../../components/operations/LogisticsWorkflowManager'
import { QrfDispatchBoardView } from '../../components/operations/QrfDispatchBoard'


function useStates() {
  return useQuery({
    queryKey: ['geo-states-list'],
    queryFn: () => apiJson<{ states: { id: number; name: string; code: string }[] }>('/api/geo/states'),
  })
}

export function ManagementTimelinePage() {
  const [selectedState, setSelectedState] = useState<number | undefined>(undefined)
  const { data: statesData } = useStates()

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">
            National Operational Timeline
          </h1>
          <p className="text-xs text-[var(--portal-muted)]">
            Live polling unit opening, voting progress, and results declaration roll-up
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedState || ''}
            onChange={(e) => setSelectedState(e.target.value ? parseInt(e.target.value, 10) : undefined)}
            className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:outline-none"
          >
            <option value="">National (All States & FCT)</option>
            {(statesData?.states || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <OperationalTimelineSummaryView
        stateId={selectedState}
      />
    </div>
  )
}

export function ManagementEc8aMirrorPage() {
  const [selectedState, setSelectedState] = useState<number | undefined>(undefined)
  const { data: statesData } = useStates()

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">
            Results Collation Mirror & Tribunal Evidence
          </h1>
          <p className="text-xs text-[var(--portal-muted)]">
            Cryptographically hashed Form EC8A returns, over-voting anomaly detection & observer audit
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedState || ''}
            onChange={(e) => setSelectedState(e.target.value ? parseInt(e.target.value, 10) : undefined)}
            className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:outline-none"
          >
            <option value="">All States & FCT</option>
            {(statesData?.states || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Ec8aCollationMirrorView stateId={selectedState} />
    </div>
  )
}

export function ManagementMaterialsChainPage() {
  const [selectedState, setSelectedState] = useState<number | undefined>(undefined)
  const { data: statesData } = useStates()

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">
            Sensitive Materials Chain-of-Custody
          </h1>
          <p className="text-xs text-[var(--portal-muted)]">
            BVAS devices, ballot boxes, EC8A sheets, and security seal tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedState || ''}
            onChange={(e) => setSelectedState(e.target.value ? parseInt(e.target.value, 10) : undefined)}
            className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:outline-none"
          >
            <option value="">All States & FCT</option>
            {(statesData?.states || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SensitiveMaterialsTrackerView stateId={selectedState} />
    </div>
  )
}

export function ManagementRosterPage() {
  const [selectedState, setSelectedState] = useState<number | undefined>(undefined)
  const { data: statesData } = useStates()

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">
            Deployment Roster & Security Coverage Gaps
          </h1>
          <p className="text-xs text-[var(--portal-muted)]">
            Live officer assignment strength vs target quota per polling station
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedState || ''}
            onChange={(e) => setSelectedState(e.target.value ? parseInt(e.target.value, 10) : undefined)}
            className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:outline-none"
          >
            <option value="">All States & FCT</option>
            {(statesData?.states || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DeploymentRosterManagerView stateId={selectedState} />
    </div>
  )
}

export function ManagementLogisticsBoardPage() {
  return (
    <div className="space-y-6 pb-12">
      <LogisticsWorkflowManagerView isCommandView={true} />
    </div>
  )
}

export function ManagementQrfBoardPage() {
  return (
    <div className="space-y-6 pb-12">
      <QrfDispatchBoardView />
    </div>
  )
}
