import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'
import type { FieldPortalContext } from './field-portal-types'
import { FieldMilestoneChecklist } from '../../components/operations/OperationalTimelineView'
import { FieldEc8aEvidenceCapture } from '../../components/operations/Ec8aCollationMirror'
import { SensitiveMaterialsTrackerView } from '../../components/operations/SensitiveMaterialsTracker'
import { ShiftHandoverManagerView } from '../../components/operations/ShiftHandoverManager'
import { LogisticsWorkflowManagerView } from '../../components/operations/LogisticsWorkflowManager'
import { FieldOfflineBanner } from './FieldPortalPages'

function useFieldContext() {
  return useQuery({
    queryKey: ['field-context'],
    queryFn: () => apiJson<FieldPortalContext>('/api/field/context'),
  })
}

function useParties() {
  return useQuery({
    queryKey: ['parties'],
    queryFn: () => apiJson<{ parties: { id: string; inecRegisterCode: string; name: string; abbreviation: string }[] }>('/api/parties'),
  })
}

export function FieldTimelinePage() {
  const { data: ctx } = useFieldContext()
  const puId = ctx?.assignment?.pollingUnit?.id
  const puCode = ctx?.assignment?.pollingUnit?.code
  const puName = ctx?.assignment?.pollingUnit?.name
  const activeElectionSlug = ctx?.activeElections?.[0]?.slug

  return (
    <div className="space-y-6 pb-12">
      <FieldOfflineBanner />
      <FieldMilestoneChecklist
        pollingUnitId={puId}
        pollingUnitCode={puCode}
        pollingUnitName={puName}
        electionSlug={activeElectionSlug}
      />
    </div>
  )
}

export function FieldEc8aPage() {
  const { data: ctx } = useFieldContext()
  const { data: partiesData } = useParties()
  const puId = ctx?.assignment?.pollingUnit?.id
  const puCode = ctx?.assignment?.pollingUnit?.code
  const activeElectionSlug = ctx?.activeElections?.[0]?.slug

  return (
    <div className="space-y-6 pb-12">
      <FieldOfflineBanner />
      <FieldEc8aEvidenceCapture
        pollingUnitId={puId}
        pollingUnitCode={puCode}
        electionSlug={activeElectionSlug}
        parties={partiesData?.parties || []}
      />
    </div>
  )
}

export function FieldMaterialsPage() {
  const { data: ctx } = useFieldContext()
  const activeElectionSlug = ctx?.activeElections?.[0]?.slug

  return (
    <div className="space-y-6 pb-12">
      <FieldOfflineBanner />
      <SensitiveMaterialsTrackerView electionSlug={activeElectionSlug} />
    </div>
  )
}

export function FieldShiftsPage() {
  const { data: ctx } = useFieldContext()
  const puId = ctx?.assignment?.pollingUnit?.id
  const puCode = ctx?.assignment?.pollingUnit?.code
  const activeElectionSlug = ctx?.activeElections?.[0]?.slug

  return (
    <div className="space-y-6 pb-12">
      <FieldOfflineBanner />
      <ShiftHandoverManagerView
        pollingUnitId={puId}
        pollingUnitCode={puCode}
        electionSlug={activeElectionSlug}
      />
    </div>
  )
}

export function FieldLogisticsPage() {
  const { data: ctx } = useFieldContext()
  const puId = ctx?.assignment?.pollingUnit?.id
  const activeElectionSlug = ctx?.activeElections?.[0]?.slug

  return (
    <div className="space-y-6 pb-12">
      <FieldOfflineBanner />
      <LogisticsWorkflowManagerView
        isCommandView={false}
        electionSlug={activeElectionSlug}
        pollingUnitId={puId}
      />
    </div>
  )
}
