import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

export type LogisticsRequest = {
  id: number
  category: 'fuel' | 'vehicle' | 'reinforcement' | 'feeding' | 'comms_battery' | 'medical' | 'other'
  priority: 'low' | 'medium' | 'urgent' | 'critical'
  quantity_description: string
  state_name?: string | null
  lga_name?: string | null
  ward_name?: string | null
  pu_code?: string | null
  pu_name?: string | null
  status: 'pending' | 'approved' | 'dispatched' | 'delivered' | 'rejected' | 'closed'
  requester_name: string
  requester_username: string
  approver_username?: string | null
  assigned_dispatch_unit?: string | null
  command_notes?: string | null
  dispatched_at?: string | null
  delivered_at?: string | null
  created_at: string
}

const CATEGORY_MAP: Record<string, { label: string; icon: string }> = {
  fuel: { label: 'Fuel / Patrol Petrol', icon: '⛽' },
  vehicle: { label: 'Vehicle / Transport Assist', icon: '🚙' },
  reinforcement: { label: 'Manpower Reinforcement', icon: '👮' },
  feeding: { label: 'Officer Feeding & Water Ration', icon: '🍱' },
  comms_battery: { label: 'Power Bank / Comms Battery', icon: '🔋' },
  medical: { label: 'First Aid / Medical Emergency', icon: '🩹' },
  other: { label: 'Other Operational Logistics', icon: '📦' },
}

const PRIORITY_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'CRITICAL', color: '#EF4444', bg: '#EF444425' },
  urgent: { label: 'URGENT', color: '#F97316', bg: '#F9731625' },
  medium: { label: 'MEDIUM', color: '#F59E0B', bg: '#F59E0B25' },
  low: { label: 'LOW', color: '#3B82F6', bg: '#3B82F625' },
}

const STATUS_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'PENDING APPROVAL', color: '#F59E0B', bg: '#F59E0B20' },
  approved: { label: 'APPROVED', color: '#3B82F6', bg: '#3B82F620' },
  dispatched: { label: 'DISPATCHED / EN ROUTE', color: '#8B5CF6', bg: '#8B5CF620' },
  delivered: { label: 'DELIVERED', color: '#10B981', bg: '#10B98120' },
  closed: { label: 'CLOSED', color: '#00c46a', bg: '#00c46a20' },
  rejected: { label: 'REJECTED', color: '#EF4444', bg: '#EF444420' },
}

export function LogisticsWorkflowManagerView({
  electionSlug,
  stateId,
  lgaId,
  pollingUnitId,
}: {
  isCommandView?: boolean
  electionSlug?: string
  stateId?: number
  lgaId?: number
  pollingUnitId?: number
}) {
  const queryClient = useQueryClient()
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<LogisticsRequest | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Command dispatch state
  const [assignedUnit, setAssignedUnit] = useState('')
  const [commandNotes, setCommandNotes] = useState('')
  const [actionStatus, setActionStatus] = useState<string>('approved')

  const { data, refetch } = useQuery<{ requests: LogisticsRequest[] }>({
    queryKey: ['logistics-requests', stateId, lgaId, filterCategory, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams()
      if (stateId) params.set('stateId', String(stateId))
      if (lgaId) params.set('lgaId', String(lgaId))
      if (filterCategory) params.set('category', filterCategory)
      if (filterStatus) params.set('status', filterStatus)
      return apiJson<{ requests: LogisticsRequest[] }>(`/api/operations/logistics?${params.toString()}`)
    },
    refetchInterval: 10_000,
  })

  const updateStatusMutation = useMutation({
    mutationFn: async (vars: { id: number; status: string; assignedDispatchUnit?: string; commandNotes?: string }) => {
      return apiJson(`/api/operations/logistics/${vars.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: vars.status,
          assignedDispatchUnit: vars.assignedDispatchUnit,
          commandNotes: vars.commandNotes,
        }),
      })
    },
    onSuccess: () => {
      setSelectedRequest(null)
      queryClient.invalidateQueries({ queryKey: ['logistics-requests'] })
    },
  })

  const requests = data?.requests || []
  const pendingCount = requests.filter((r) => r.status === 'pending').length
  const criticalCount = requests.filter((r) => r.priority === 'critical' && r.status !== 'closed').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#00c46a] tracking-wider">
            LOGISTICS LIFELINE · FIELD DISPATCH & RESUPPLY
          </span>
          <h2 className="font-(--font-syne) text-xl font-bold text-[var(--portal-fg)]">
            Logistics Request & Tasking Board
          </h2>
          <p className="text-xs text-[var(--portal-muted)]">
            Emergency fuel, transport, feeding, reinforcements, and equipment support
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowRequestModal(true)}
          className="sr-btn-primary px-4 py-2 text-xs text-white flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span>🚨</span> Request Logistics Support
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Total Requests
          </div>
          <div className="text-2xl font-bold text-[var(--portal-fg)] mt-1">
            {requests.length.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">All operational tiers</div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="flex items-center justify-between text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            <span>Pending Command Action</span>
            {pendingCount > 0 && <span className="size-2 rounded-full bg-[#F59E0B] animate-pulse" />}
          </div>
          <div className={`text-2xl font-bold mt-1 ${pendingCount > 0 ? 'text-[#F59E0B]' : 'text-[var(--portal-fg)]'}`}>
            {pendingCount}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">Awaiting approval</div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Critical High Priority
          </div>
          <div className={`text-2xl font-bold mt-1 ${criticalCount > 0 ? 'text-[#EF4444]' : 'text-[var(--portal-fg)]'}`}>
            {criticalCount}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">Active emergency</div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Dispatched / Delivered
          </div>
          <div className="text-2xl font-bold text-[#00c46a] mt-1">
            {requests.filter((r) => r.status === 'dispatched' || r.status === 'delivered' || r.status === 'closed').length}
          </div>
          <div className="text-[11px] text-[#00c46a]">Tasks fulfilled</div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="sr-card border-[color:var(--portal-border)] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:outline-none"
            >
              <option value="">All Logistics Categories</option>
              <option value="fuel">Fuel / Petrol</option>
              <option value="vehicle">Vehicles / Transport</option>
              <option value="reinforcement">Reinforcements</option>
              <option value="feeding">Feeding & Rations</option>
              <option value="comms_battery">Comms / Batteries</option>
              <option value="medical">Medical Aid</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="dispatched">Dispatched</option>
              <option value="delivered">Delivered</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--portal-muted)]">
            No logistics requests currently in queue.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--portal-fg)]">
              <thead className="border-b border-[color:var(--portal-border)] font-(--font-mono) text-[11px] uppercase text-[var(--portal-dim)] bg-[color:var(--portal-table-header-bg)]">
                <tr>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Request Details</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Requester</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Assigned Unit</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--portal-border)]">
                {requests.map((r) => {
                  const prioCfg = PRIORITY_BADGES[r.priority] || { label: r.priority, color: '#3B82F6', bg: '#3B82F620' }
                  const catCfg = CATEGORY_MAP[r.category] || { label: r.category, icon: '📦' }
                  const statCfg = STATUS_BADGES[r.status] || { label: r.status, color: '#00c46a', bg: '#00c46a20' }

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-[color:var(--portal-table-row-hover)] transition cursor-pointer"
                      onClick={() => {
                        setSelectedRequest(r)
                        setAssignedUnit(r.assigned_dispatch_unit || '')
                        setCommandNotes(r.command_notes || '')
                        setActionStatus(r.status === 'pending' ? 'approved' : r.status)
                      }}
                    >
                      <td className="py-3 px-3">
                        <span
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-(--font-mono) font-bold"
                          style={{ backgroundColor: prioCfg.bg, color: prioCfg.color }}
                        >
                          {r.priority === 'critical' && '🚨'} {prioCfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span>{catCfg.icon}</span>
                          <span>{catCfg.label}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 max-w-[200px]">
                        <div className="text-xs text-[var(--portal-fg)] line-clamp-2">
                          {r.quantity_description}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-[var(--portal-muted)]">
                        <div>{r.pu_code || r.ward_name || r.lga_name || 'Field Post'}</div>
                        <div className="text-[10px] text-[var(--portal-dim)]">{r.state_name}</div>
                      </td>
                      <td className="py-3 px-3 text-[11px]">
                        <div className="font-medium text-[var(--portal-fg)]">{r.requester_name}</div>
                        <div className="font-(--font-mono) text-[10px] text-[var(--portal-dim)]">
                          {new Date(r.created_at).toLocaleTimeString('en-NG')}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: statCfg.bg, color: statCfg.color }}
                        >
                          {statCfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-[var(--portal-muted)]">
                        {r.assigned_dispatch_unit || '—'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedRequest(r)
                            setAssignedUnit(r.assigned_dispatch_unit || '')
                            setCommandNotes(r.command_notes || '')
                            setActionStatus(r.status === 'pending' ? 'approved' : r.status)
                          }}
                          className="sr-btn-ghost px-2.5 py-1 text-[11px]"
                        >
                          Task / View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: New Logistics Request */}
      {showRequestModal && (
        <CreateLogisticsModal
          electionSlug={electionSlug}
          pollingUnitId={pollingUnitId}
          onClose={() => setShowRequestModal(false)}
          onSuccess={() => {
            setShowRequestModal(false)
            refetch()
          }}
        />
      )}

      {/* Modal: Command Tasking / Status Update */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="sr-card max-w-md w-full border-[color:var(--portal-border)] p-6 space-y-4 bg-[#141414]">
            <div className="flex items-start justify-between border-b border-[color:var(--portal-border)] pb-3">
              <div>
                <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#00c46a]">
                  LOGISTICS DISPATCH TASKING
                </span>
                <h3 className="font-(--font-syne) text-base font-bold text-[var(--portal-fg)]">
                  {CATEGORY_MAP[selectedRequest.category]?.label || selectedRequest.category}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-2xl text-[var(--portal-muted)] hover:text-white leading-none"
              >
                &times;
              </button>
            </div>

            <div className="rounded-lg bg-black/30 p-3 border border-[color:var(--portal-border)] space-y-1 text-xs">
              <div className="text-[var(--portal-dim)]">Request:</div>
              <div className="text-[var(--portal-fg)] font-medium">{selectedRequest.quantity_description}</div>
              <div className="text-[11px] text-[var(--portal-muted)] mt-1">
                Requested by <strong>{selectedRequest.requester_name}</strong> · {selectedRequest.lga_name || 'Area'}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                  Workflow Action Status
                </label>
                <select
                  value={actionStatus}
                  onChange={(e) => setActionStatus(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
                >
                  <option value="approved">Approve Request</option>
                  <option value="dispatched">Dispatch Logistics / Carrier</option>
                  <option value="delivered">Mark as Delivered & Confirmed</option>
                  <option value="closed">Close Ticket (Resolved)</option>
                  <option value="rejected">Reject Request</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                  Assigned Dispatch Unit / Vehicle / Escort
                </label>
                <input
                  type="text"
                  value={assignedUnit}
                  onChange={(e) => setAssignedUnit(e.target.value)}
                  placeholder="e.g. Area Command Patrol Team 2 / Supply Hilux 04"
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                  Command Tasking Directive / Notes
                </label>
                <textarea
                  rows={2}
                  value={commandNotes}
                  onChange={(e) => setCommandNotes(e.target.value)}
                  placeholder="e.g. 50L petrol dispatched via Sector 3 patrol vehicle. ETA 20 mins."
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="sr-btn-ghost px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updateStatusMutation.isPending}
                onClick={() =>
                  updateStatusMutation.mutate({
                    id: selectedRequest.id,
                    status: actionStatus,
                    assignedDispatchUnit: assignedUnit,
                    commandNotes,
                  })
                }
                className="sr-btn-primary px-4 py-2 text-xs text-white"
              >
                {updateStatusMutation.isPending ? 'Updating…' : 'Update Task Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CreateLogisticsModal({
  electionSlug,
  pollingUnitId,
  onClose,
  onSuccess,
}: {
  electionSlug?: string
  pollingUnitId?: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [category, setCategory] = useState<string>('fuel')
  const [priority, setPriority] = useState<string>('urgent')
  const [quantityDescription, setQuantityDescription] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)
      return apiJson('/api/operations/logistics', {
        method: 'POST',
        body: JSON.stringify({
          electionSlug,
          pollingUnitId,
          category,
          priority,
          quantityDescription,
        }),
      })
    },
    onSuccess: () => {
      onSuccess()
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to submit request.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="sr-card max-w-md w-full border-[color:var(--portal-border)] p-6 space-y-4 bg-[#141414]">
        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
          <h3 className="font-(--font-syne) text-base font-bold text-[var(--portal-fg)]">
            Submit Emergency Logistics Request
          </h3>
          <button onClick={onClose} className="text-2xl text-[var(--portal-muted)] hover:text-white leading-none">
            &times;
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 text-xs bg-[#EF4444]/20 border border-[#EF4444]/40 text-[#EF4444] rounded-lg">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Logistics Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            >
              <option value="fuel">Fuel / Petrol for Generator/Patrol</option>
              <option value="vehicle">Patrol Vehicle / Escort Transport</option>
              <option value="reinforcement">Personnel Reinforcement (MOPOL/NSCDC)</option>
              <option value="feeding">Feeding & Water Rations</option>
              <option value="comms_battery">Power Bank / Radio Battery</option>
              <option value="medical">Medical First Aid Kits</option>
              <option value="other">Other Operational Equipment</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Urgency / Priority Level *
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            >
              <option value="critical">CRITICAL — Operations halted without resupply</option>
              <option value="urgent">URGENT — Needed within 30-45 minutes</option>
              <option value="medium">MEDIUM — Standard operational replenishment</option>
              <option value="low">LOW — Non-urgent planning request</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Specific Quantity & Need Description *
            </label>
            <textarea
              required
              rows={3}
              value={quantityDescription}
              onChange={(e) => setQuantityDescription(e.target.value)}
              placeholder="e.g. Need 40 liters of petrol immediately for station generator and patrol Hilux to sustain night collation."
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4">
          <button type="button" onClick={onClose} className="sr-btn-ghost px-4 py-2 text-xs">
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || !quantityDescription}
            onClick={() => mutation.mutate()}
            className="sr-btn-primary px-4 py-2 text-xs text-white"
          >
            {mutation.isPending ? 'Submitting…' : 'Submit Request to Command'}
          </button>
        </div>
      </div>
    </div>
  )
}
