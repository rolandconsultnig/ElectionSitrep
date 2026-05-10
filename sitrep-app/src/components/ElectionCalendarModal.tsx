import { useMemo, useState } from 'react'

export type CalendarElection = {
  name: string
  electionDate: string | null
  electionType: string
  status: string
}

type Props = {
  open: boolean
  onClose: () => void
  elections: CalendarElection[]
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function startOfCalendarMonth(d: Date) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const dow = first.getDay()
  const mondayBased = dow === 0 ? 6 : dow - 1
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - mondayBased)
  return gridStart
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function ElectionCalendarModal({ open, onClose, elections }: Props) {
  const [cursor, setCursor] = useState(() => new Date())

  const electionDays = useMemo(() => {
    const map = new Map<string, CalendarElection[]>()
    for (const e of elections) {
      if (!e.electionDate) continue
      const d = new Date(`${e.electionDate}T12:00:00`)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    return map
  }, [elections])

  const cells = useMemo(() => {
    const start = startOfCalendarMonth(cursor)
    const days: Date[] = []
    for (let i = 0; i < 42; i++) days.push(addDays(start, i))
    return days
  }, [cursor])

  if (!open) return null

  const title = cursor.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="sr-card relative max-h-[90vh] w-full max-w-lg overflow-y-auto border-[#0dccb0]/25 p-6 shadow-2xl"
        role="dialog"
        aria-modal
        aria-labelledby="election-cal-title"
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-lg px-2 py-1 font-(--font-mono) text-xs text-[var(--portal-muted)] hover:bg-[var(--portal-table-row-hover)] hover:text-[var(--portal-fg)]"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        <h2 id="election-cal-title" className="font-(--font-syne) text-lg font-bold text-[var(--portal-fg)]">
          Election dates
        </h2>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Scheduled elections from configuration (database). Navigate months to see highlights.
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="sr-btn-ghost px-3 py-1.5 text-xs"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            ← Prev
          </button>
          <span className="font-(--font-mono) text-sm font-semibold text-[#0dccb0]">{title}</span>
          <button
            type="button"
            className="sr-btn-ghost px-3 py-1.5 text-xs"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            Next →
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center font-(--font-mono) text-[10px] font-semibold uppercase text-[var(--portal-dim)]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day) => {
            const inMonth = day.getMonth() === cursor.getMonth()
            const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
            const onDay = electionDays.get(key)
            const isToday = sameDay(day, new Date())
            return (
              <div
                key={day.toISOString()}
                className={[
                  'flex min-h-[3rem] flex-col rounded-lg border p-1 text-left text-[11px]',
                  inMonth ? 'border-[color:var(--portal-border)] bg-[var(--portal-input-bg)]' : 'border-transparent opacity-40',
                  onDay?.length ? 'border-[#0dccb0]/50 bg-[#0dccb0]/10' : '',
                  isToday ? 'ring-1 ring-[#0dccb0]/80' : '',
                ].join(' ')}
              >
                <span className={`font-(--font-mono) tabular-nums ${inMonth ? 'text-[var(--portal-fg)]' : ''}`}>
                  {day.getDate()}
                </span>
                {onDay?.length ? (
                  <span className="mt-auto truncate font-(--font-mono) text-[9px] font-semibold leading-tight text-[#0dccb0]">
                    {onDay.map((e) => e.name).join(' · ')}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>

        <ul className="mt-6 space-y-2 border-t border-[color:var(--portal-border)] pt-4 text-sm text-[var(--portal-muted)]">
          {elections.filter((e) => e.electionDate).length === 0 ? (
            <li className="text-[var(--portal-dim)]">No dated elections in the register.</li>
          ) : (
            elections
              .filter((e) => e.electionDate)
              .map((e) => (
                <li key={e.name + e.electionDate} className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-[var(--portal-fg)]">{e.name}</span>
                  <span className="font-(--font-mono) text-xs text-[#0dccb0]">
                    {new Date(`${e.electionDate}T12:00:00`).toLocaleDateString('en-NG', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="w-full font-(--font-mono) text-[10px] text-[var(--portal-dim)]">
                    {e.electionType} · {e.status}
                  </span>
                </li>
              ))
          )}
        </ul>

        <button type="button" className="sr-btn-primary mt-6 w-full justify-center py-2.5" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
