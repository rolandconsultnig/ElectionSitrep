import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

export type ShiftHandover = {
  id: number
  polling_unit_id: number
  pu_code: string
  pu_name: string
  ward_name: string
  lga_name: string
  shift_name: 'morning' | 'afternoon' | 'night' | 'collation'
  outgoing_username: string
  outgoing_name: string
  incoming_username?: string | null
  incoming_name?: string | null
  running_situation_log: string
  materials_status: string
  crowd_assessment: 'calm' | 'tense' | 'rowdy' | 'volatile' | 'dispersed'
  handover_signed_at: string
  incoming_acknowledged_at?: string | null
  notes?: string | null
}

const SHIFT_NAMES: Record<string, { label: string; icon: string }> = {
  morning: { label: 'Morning Shift (06:00 - 12:00)', icon: '🌅' },
  afternoon: { label: 'Afternoon Shift (12:00 - 18:00)', icon: '☀️' },
  night: { label: 'Night / Collation Shift (18:00+)', icon: '🌙' },
  collation: { label: 'Collation Escort Shift', icon: '🏛' },
}

const CROWD_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  calm: { label: 'Calm & Orderly', color: '#00c46a', bg: '#00c46a20' },
  tense: { label: 'Tense / Restless', color: '#F59E0B', bg: '#F59E0B20' },
  rowdy: { label: 'Rowdy / Agitated', color: '#F97316', bg: '#F9731620' },
  volatile: { label: 'Volatile / Threat Imminent', color: '#EF4444', bg: '#EF444420' },
  dispersed: { label: 'Dispersed / Cleared', color: '#3B82F6', bg: '#3B82F620' },
}

export function ShiftHandoverManagerView({
  pollingUnitId,
  electionSlug,
}: {
  pollingUnitId?: number
  pollingUnitCode?: string
  electionSlug?: string
}) {
  const queryClient = useQueryClient()
  const [showHandoverForm, setShowHandoverForm] = useState(false)
  const [shiftName, setShiftName] = useState<'morning' | 'afternoon' | 'night' | 'collation'>('morning')
  const [incomingOfficerName, setIncomingOfficerName] = useState('')
  const [runningSituationLog, setRunningSituationLog] = useState('')
  const [materialsStatus, setMaterialsStatus] = useState('All BVAS devices, ballot boxes, and stamp seals accounted for.')
  const [crowdAssessment, setCrowdAssessment] = useState<'calm' | 'tense' | 'rowdy' | 'volatile' | 'dispersed'>('calm')
  const [notes, setNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data } = useQuery<{ shifts: ShiftHandover[] }>({
    queryKey: ['shift-handovers', pollingUnitId, electionSlug],
    queryFn: () => {
      const params = new URLSearchParams()
      if (pollingUnitId) params.set('puId', String(pollingUnitId))
      if (electionSlug) params.set('electionSlug', electionSlug)
      return apiJson<{ shifts: ShiftHandover[] }>(`/api/operations/shifts?${params.toString()}`)
    },
    refetchInterval: 12_000,
  })

  const handoverMutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)
      return apiJson('/api/operations/shifts/handover', {
        method: 'POST',
        body: JSON.stringify({
          electionSlug,
          pollingUnitId,
          shiftName,
          incomingOfficerName,
          runningSituationLog,
          materialsStatus,
          crowdAssessment,
          notes,
        }),
      })
    },
    onSuccess: () => {
      setShowHandoverForm(false)
      setRunningSituationLog('')
      setNotes('')
      queryClient.invalidateQueries({ queryKey: ['shift-handovers'] })
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to submit shift handover.')
    },
  })

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiJson(`/api/operations/shifts/${id}/acknowledge`, { method: 'POST' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-handovers'] })
    },
  })

  const shifts = data?.shifts || []

  return (
    <div className="space-y-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#00c46a] tracking-wider">
            CONTINUITY OF OPERATIONS · FIELD RELIEF MANAGEMENT
          </span>
          <h2 className="font-(--font-syne) text-xl font-bold text-[var(--portal-fg)]">
            Relief & Shift Handover Running Log
          </h2>
          <p className="text-xs text-[var(--portal-muted)]">
            Seamless operational handovers so incoming officers inherit live post situation awareness
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowHandoverForm(true)}
          className="sr-btn-primary px-4 py-2 text-xs text-white flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span>📋</span> Record Shift Handover
        </button>
      </div>

      {/* Handover Form Drawer / Card */}
      {showHandoverForm && (
        <div className="sr-card border-[#00c46a]/30 bg-[#00c46a]/[0.02] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
            <h3 className="font-(--font-syne) text-sm font-bold text-[var(--portal-fg)]">
              New Shift Handover Sign-Off
            </h3>
            <button
              onClick={() => setShowHandoverForm(false)}
              className="text-xl text-[var(--portal-muted)] hover:text-white leading-none"
            >
              &times;
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 text-xs bg-[#EF4444]/20 border border-[#EF4444]/40 text-[#EF4444] rounded-lg">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                Shift Designation
              </label>
              <select
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value as any)}
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
              >
                <option value="morning">Morning Shift (06:00 - 12:00)</option>
                <option value="afternoon">Afternoon Shift (12:00 - 18:00)</option>
                <option value="night">Night Shift (18:00 - 00:00)</option>
                <option value="collation">Collation Escort Shift</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                Relieving (Incoming) Officer Name / Service No.
              </label>
              <input
                type="text"
                value={incomingOfficerName}
                onChange={(e) => setIncomingOfficerName(e.target.value)}
                placeholder="e.g. Sgt. Musa Ibrahim / AP-39281"
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Running Post Situation Summary (Key events, disturbances, queue status) *
            </label>
            <textarea
              required
              rows={3}
              value={runningSituationLog}
              onChange={(e) => setRunningSituationLog(e.target.value)}
              placeholder="Detailed summary of what happened during your shift, crowd demeanor, party agent temperament, voter queue length…"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                Current Crowd Demeanor
              </label>
              <select
                value={crowdAssessment}
                onChange={(e) => setCrowdAssessment(e.target.value as any)}
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
              >
                <option value="calm">Calm & Orderly</option>
                <option value="tense">Tense / Restless</option>
                <option value="rowdy">Rowdy / Agitated</option>
                <option value="volatile">Volatile / Threat Imminent</option>
                <option value="dispersed">Dispersed / Cleared</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                Sensitive Materials Custody Status
              </label>
              <input
                type="text"
                value={materialsStatus}
                onChange={(e) => setMaterialsStatus(e.target.value)}
                placeholder="BVAS and ballot boxes intact…"
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowHandoverForm(false)}
              className="sr-btn-ghost px-4 py-2 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={handoverMutation.isPending || !runningSituationLog}
              onClick={() => handoverMutation.mutate()}
              className="sr-btn-primary px-5 py-2 text-xs text-white"
            >
              {handoverMutation.isPending ? 'Signing Off…' : 'Sign & Complete Handover'}
            </button>
          </div>
        </div>
      )}

      {/* Shift Handovers Timeline Feed */}
      <div className="sr-card border-[color:var(--portal-border)] p-6 space-y-4">
        <h3 className="font-(--font-syne) text-sm font-bold text-[var(--portal-fg)]">
          Historical Shift Handovers & Post Journals
        </h3>

        {shifts.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--portal-muted)]">
            No shift handovers recorded yet. Officers should complete a handover report upon shift relief.
          </div>
        ) : (
          <div className="space-y-4">
            {shifts.map((s) => {
              const shiftCfg = SHIFT_NAMES[s.shift_name] || { label: s.shift_name, icon: '⏱' }
              const crowdCfg = CROWD_COLORS[s.crowd_assessment] || { label: s.crowd_assessment, color: '#00c46a', bg: '#00c46a20' }
              const isAcknowledged = Boolean(s.incoming_acknowledged_at)

              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)]/40 p-5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[color:var(--portal-border)] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{shiftCfg.icon}</span>
                      <span className="font-(--font-syne) font-bold text-sm text-[var(--portal-fg)]">
                        {shiftCfg.label}
                      </span>
                      {s.pu_code && (
                        <span className="font-(--font-mono) text-xs text-[#00c46a]">
                          · {s.pu_code}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="rounded px-2 py-0.5 text-[10px] font-bold"
                        style={{ backgroundColor: crowdCfg.bg, color: crowdCfg.color }}
                      >
                        {crowdCfg.label}
                      </span>
                      <span className="font-(--font-mono) text-[11px] text-[var(--portal-dim)]">
                        {new Date(s.handover_signed_at).toLocaleString('en-NG')}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-[var(--portal-fg)] leading-relaxed bg-black/20 p-3 rounded-lg border border-[color:var(--portal-border)]">
                    <strong className="block text-[11px] text-[var(--portal-dim)] uppercase mb-1">
                      Running Situation Log:
                    </strong>
                    {s.running_situation_log}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[var(--portal-muted)]">
                    <div>
                      <span className="text-[var(--portal-dim)]">Outgoing Officer:</span>{' '}
                      <strong className="text-[var(--portal-fg)]">{s.outgoing_name}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--portal-dim)]">Relieved By:</span>{' '}
                      <strong className="text-[var(--portal-fg)]">
                        {s.incoming_name || s.incoming_username || 'Incoming Officer'}
                      </strong>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3 text-[11px]">
                    <div className="text-[var(--portal-dim)]">
                      Materials Check: <span className="text-[var(--portal-muted)]">{s.materials_status}</span>
                    </div>

                    <div>
                      {isAcknowledged ? (
                        <span className="inline-flex items-center gap-1 text-[#00c46a] font-(--font-mono) font-bold">
                          ✓ Relieving Officer Acknowledged ({new Date(s.incoming_acknowledged_at!).toLocaleTimeString('en-NG')})
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={acknowledgeMutation.isPending}
                          onClick={() => acknowledgeMutation.mutate(s.id)}
                          className="sr-btn-primary px-3 py-1 text-[11px] text-white"
                        >
                          {acknowledgeMutation.isPending ? 'Acknowledging…' : '✓ Acknowledge & Take Over Post'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
