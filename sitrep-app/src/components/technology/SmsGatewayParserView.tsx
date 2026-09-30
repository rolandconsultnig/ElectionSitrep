import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface SmsInboundMessage {
  id: number
  sender_phone: string
  channel: 'SMS' | 'USSD' | 'RADIO_PACKET'
  raw_message: string
  parsed_command: string | null
  parsed_pu_code: string | null
  parsed_payload: Record<string, any>
  parsing_status: 'pending' | 'parsed' | 'malformed' | 'processed' | 'rejected'
  created_at: string
}

export const SmsGatewayParserView: React.FC<{ electionSlug?: string }> = ({
  electionSlug = 'presidential-2026',
}) => {
  const queryClient = useQueryClient()
  const [senderPhone, setSenderPhone] = useState('+2348035558899')
  const [channel, setChannel] = useState<'SMS' | 'USSD'>('SMS')
  const [rawMessage, setRawMessage] = useState('SITREP 14/02/01/005 PEACEFUL 350 ACCREDITED 310 VOTED')
  const [ingestSuccess, setIngestSuccess] = useState<string | null>(null)

  // 1. Fetch Inbound Queue
  const { data, isLoading } = useQuery({
    queryKey: ['sms-gateway-queue'],
    queryFn: async () => {
      return apiJson<{
        summary: {
          totalReceived: number
          smsCount: number
          ussdCount: number
          processed: number
          malformed: number
        }
        messages: SmsInboundMessage[]
      }>('/api/technology/sms-gateway/queue')
    },
    refetchInterval: 10000,
  })

  // 2. Ingest SMS Mutation
  const ingestMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      return apiJson('/api/technology/sms-gateway/ingest', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['sms-gateway-queue'] })
      setIngestSuccess(`Message parsed & routed! Command: ${res?.message?.parsed_command || 'PROCESSED'}`)
      setTimeout(() => setIngestSuccess(null), 4000)
    },
  })

  const messages: SmsInboundMessage[] = data?.messages || []
  const summary = data?.summary || {
    totalReceived: messages.length,
    smsCount: messages.filter((m) => m.channel === 'SMS').length,
    ussdCount: messages.filter((m) => m.channel === 'USSD').length,
    processed: messages.filter((m) => m.parsing_status === 'processed').length,
    malformed: messages.filter((m) => m.parsing_status === 'malformed').length,
  }

  const handleTemplateSelect = (template: string) => {
    setRawMessage(template)
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-sky-950/30 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/40 shadow-inner text-2xl font-bold">
              ✉
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Low-Bandwidth SMS & USSD Ingestion Bridge
                <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs font-semibold text-sky-300 border border-sky-500/30">
                  Phase 5
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Zero-internet offline fallback: automated parsing of encrypted SMS, USSD sessions, and emergency shortcodes
              </p>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800/80 pt-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span>✉</span>
              Total Fallback Ingested
            </span>
            <div className="mt-1 text-2xl font-bold text-white tracking-tight">
              {summary.totalReceived} Messages
            </div>
          </div>
          <div className="rounded-xl border border-sky-900/30 bg-sky-950/20 p-3.5">
            <span className="text-xs font-medium text-sky-300 flex items-center gap-1.5">
              <span>📱</span>
              SMS Cellular Transmissions
            </span>
            <div className="mt-1 text-2xl font-bold text-sky-200 tracking-tight">
              {summary.smsCount} SMS
            </div>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3.5">
            <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
              <span>✓</span>
              Parsed & Dispatched
            </span>
            <div className="mt-1 text-2xl font-bold text-emerald-200 tracking-tight">
              {summary.processed} Valid
            </div>
          </div>
          <div className="rounded-xl border border-purple-900/30 bg-purple-950/20 p-3.5">
            <span className="text-xs font-medium text-purple-300 flex items-center gap-1.5">
              <span>⚡</span>
              USSD Shortcode Sessions
            </span>
            <div className="mt-1 text-2xl font-bold text-purple-200 tracking-tight">
              {summary.ussdCount} Sessions
            </div>
          </div>
        </div>
      </div>

      {/* Ingestion Simulator */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <span>📡</span>
          SMS / USSD Ingestion Bridge Simulator (Zero-Internet Gateway)
        </h3>

        {ingestSuccess && (
          <div className="rounded-xl bg-emerald-500/20 border border-emerald-500/50 p-3.5 text-sm font-bold text-emerald-200 animate-fade-in flex items-center gap-2">
            <span>✓</span>
            {ingestSuccess}
          </div>
        )}

        {/* Quick Syntax Templates */}
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-400">Quick Syntax Presets:</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleTemplateSelect('SITREP 14/02/01/005 PEACEFUL 350 ACCREDITED 310 VOTED')}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-mono text-slate-300 hover:bg-slate-700 cursor-pointer"
            >
              [SITREP] Standard Hourly Polling Tally
            </button>
            <button
              type="button"
              onClick={() => handleTemplateSelect('SOS 14/02/01/005 THUGGERY_SNATCH 4 ARMED HOODLUMS RAC CENTER')}
              className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-1 text-xs font-mono text-rose-300 hover:bg-rose-900/40 cursor-pointer"
            >
              [SOS] Immediate Threat Emergency Alert
            </button>
            <button
              type="button"
              onClick={() => handleTemplateSelect('*999*PU*14/02/01/005*VOTES*APC=210*PDP=180*LP=95#')}
              className="rounded-lg border border-purple-900/50 bg-purple-950/30 px-3 py-1 text-xs font-mono text-purple-300 hover:bg-purple-900/40 cursor-pointer"
            >
              [USSD] Encrypted Result Tally Push
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!rawMessage) return
            ingestMutation.mutate({
              electionSlug,
              senderPhone,
              channel,
              rawMessage,
            })
          }}
          className="space-y-4 pt-2"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Sender Mobile MSISDN *</label>
              <input
                type="text"
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Ingestion Channel *</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as any)}
                aria-label="Ingestion Channel"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-500"
              >
                <option value="SMS">SMS Cellular Short Message</option>
                <option value="USSD">USSD Interactive Session (*999#)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={ingestMutation.isPending}
                className="w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 transition-all cursor-pointer shadow-md shadow-sky-600/30 disabled:opacity-50"
              >
                <span>⚡</span>
                {ingestMutation.isPending ? 'Parsing...' : 'Simulate Inbound Message'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Inbound Raw Message Body *</label>
            <textarea
              value={rawMessage}
              onChange={(e) => setRawMessage(e.target.value)}
              required
              rows={2}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </form>
      </div>

      {/* Inbound Queue Logs */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <span>📋</span>
          Ingested SMS & USSD Queue Log
        </h3>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading low-bandwidth inbound logs...</div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No inbound SMS or USSD messages in queue.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isSOS = msg.parsed_command === 'SOS'
              const isProcessed = msg.parsing_status === 'processed'

              return (
                <div
                  key={msg.id}
                  className={`rounded-xl border p-4 transition-all space-y-2 ${
                    isSOS
                      ? 'border-rose-500/50 bg-rose-950/20'
                      : 'border-slate-800 bg-slate-950/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-bold text-sky-400 font-mono">
                        {msg.channel}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-300">
                        {msg.sender_phone}
                      </span>
                      {msg.parsed_command && (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            isSOS
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          Command: {msg.parsed_command}
                        </span>
                      )}
                      {msg.parsed_pu_code && (
                        <span className="text-xs text-slate-400">
                          PU: <strong className="text-white font-mono">{msg.parsed_pu_code}</strong>
                        </span>
                      )}
                    </div>

                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5 font-mono text-xs text-slate-200">
                    {msg.raw_message}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>
                      Parsing Status:{' '}
                      <strong className={isProcessed ? 'text-emerald-400' : 'text-amber-400'}>
                        {msg.parsing_status.toUpperCase()}
                      </strong>
                    </span>
                    <span className="font-mono text-slate-500">
                      Payload: {JSON.stringify(msg.parsed_payload)}
                    </span>
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
