import { Bar, Doughnut, Radar } from 'react-chartjs-2'
import { chartColors, chartTooltipTheme } from '../../charts/register'
import { NigeriaMap } from '../../components/NigeriaMap'

const card = 'sr-card'

const mapPins = [
  { lat: 7.6195, lng: 5.2219, label: 'Kogi — critical', severity: 'red' as const },
  { lat: 4.8156, lng: 7.0498, label: 'Rivers — gunfire', severity: 'red' as const },
  { lat: 12.0022, lng: 8.592, label: 'Kano', severity: 'green' as const },
  { lat: 6.5244, lng: 3.3792, label: 'Lagos', severity: 'green' as const },
]

export function MgmtDashboard() {
  const tally = {
    labels: ['APC', 'LP', 'PDP', 'NNPP', 'Others'],
    datasets: [
      {
        label: 'Votes (millions)',
        data: [22.1, 19.4, 13.8, 3.1, 1.3],
        backgroundColor: [chartColors.red, chartColors.blue, chartColors.amber, chartColors.purple, chartColors.border],
        borderRadius: 6,
      },
    ],
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Command dashboard</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Jurisdiction-scoped aggregates — CP sees state · DIG sees zone · API-enforced
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="PUs reporting" value="80.4%" hint="National demo view" tone="green" />
        <Kpi label="Votes observed" value="58.2M" hint="Rolling aggregate" tone="blue" />
        <Kpi label="Active incidents" value="47" hint="Amber + Red" tone="amber" />
        <Kpi label="PUs under alert" value="89" hint="Awaiting clearance" tone="red" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`lg:col-span-2 ${card}`}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Live presidential tally</div>
          <Bar
            data={tally}
            options={{
              responsive: true,
              plugins: { legend: { display: false }, tooltip: chartTooltipTheme() },
              scales: {
                x: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
                y: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
              },
            }}
          />
        </div>
        <div className={card}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Red alerts</div>
          <ul className="space-y-3 text-[13px] text-[var(--portal-muted)]">
            <li className="rounded-lg border border-[#EF4444]/25 bg-[#EF4444]/10 px-3 py-2">
              <span className="text-[#EF4444]">Kogi</span> — ballot interference (demo)
            </li>
            <li className="rounded-lg border border-[#EF4444]/25 bg-[#EF4444]/10 px-3 py-2">
              <span className="text-[#EF4444]">Rivers</span> — shots near collation (demo)
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  const c =
    tone === 'green'
      ? 'text-[#00C896]'
      : tone === 'blue'
        ? 'text-[#3B82F6]'
        : tone === 'amber'
          ? 'text-[#F59E0B]'
          : 'text-[#EF4444]'
  return (
    <div className={card}>
      <div className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">{label}</div>
      <div className={`mt-2 font-(--font-syne) text-3xl font-bold ${c}`}>{value}</div>
      <div className="mt-1 text-xs text-[var(--portal-dim)]">{hint}</div>
    </div>
  )
}

export function MgmtMap() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Operations map</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Geo-tagged incidents · choropleth overlays in production (§M19)</p>
      </header>
      <NigeriaMap pins={mapPins} height="380px" hint="Leaflet + OSM tiles · pins severity-coded" />
    </div>
  )
}

export function MgmtSitRepFeed() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Live SitRep feed</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">WebSocket refresh ~30s · acknowledge / escalate / export</p>
      </header>
      <div className={`${card} space-y-4`}>
        {[
          ['14:38', 'PU-KN-00221', 'Kogi', 'red', 'Ballot interference reported'],
          ['14:31', 'PU-LA-00842', 'Lagos', 'green', 'EC8A submitted — orderly'],
        ].map(([t, pu, st, sev, msg]) => (
          <div key={String(pu)} className="flex gap-3 border-b border-[color:var(--portal-border)] pb-4 last:border-0">
            <span
              className="mt-1 size-2 shrink-0 rounded-full"
              style={{
                background:
                  sev === 'green' ? chartColors.green : sev === 'amber' ? chartColors.amber : chartColors.red,
              }}
            />
            <div className="flex-1">
              <div className="text-sm text-[var(--portal-fg)]">{msg}</div>
              <div className="font-(--font-mono) text-[11px] text-[var(--portal-dim)]">
                {t} WAT · {pu} · {st}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MgmtResults() {
  const doughnut = {
    labels: ['APC', 'LP', 'PDP', 'NNPP', 'Others'],
    datasets: [
      {
        data: [38, 33, 24, 5, 0],
        backgroundColor: [chartColors.red, chartColors.blue, chartColors.amber, chartColors.purple, chartColors.border],
        borderColor: '#0A1628',
        borderWidth: 3,
      },
    ],
  }

  const radar = {
    labels: ['SW', 'NW', 'SE', 'SS', 'NC', 'NE'],
    datasets: [
      {
        label: 'APC',
        data: [48, 61, 12, 22, 44, 55],
        borderColor: chartColors.red,
        backgroundColor: 'rgba(239,68,68,.12)',
      },
      {
        label: 'LP',
        data: [28, 8, 72, 58, 18, 14],
        borderColor: chartColors.blue,
        backgroundColor: 'rgba(59,130,246,.12)',
      },
    ],
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Live results tracker</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Aggregated roll-up · EC8 hierarchy oversight (§M21)</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <Doughnut
            data={doughnut}
            options={{
              plugins: { legend: { position: 'bottom', labels: { color: chartColors.muted } }, tooltip: chartTooltipTheme() },
            }}
          />
        </div>
        <div className={card}>
          <Radar
            data={radar}
            options={{
              scales: {
                r: {
                  grid: { color: chartColors.border },
                  pointLabels: { color: chartColors.muted },
                  ticks: { display: false },
                },
              },
              plugins: { legend: { labels: { color: chartColors.muted } }, tooltip: chartTooltipTheme() },
            }}
          />
        </div>
      </div>
    </div>
  )
}

export function MgmtIncidents() {
  const data = {
    labels: ['Violence', 'Card reader', 'Intimidation', 'Snatching', 'Exclusion', 'Stuffing'],
    datasets: [
      {
        label: 'Count',
        data: [12, 28, 18, 9, 6, 4],
        backgroundColor: [
          chartColors.red,
          chartColors.amber,
          chartColors.amber,
          chartColors.red,
          chartColors.amber,
          chartColors.red,
        ],
        borderRadius: 6,
      },
    ],
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Incident tracker</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Escalation audit trail · category breakdown</p>
      </header>
      <div className={card}>
        <Bar
          data={data}
          options={{
            responsive: true,
            plugins: { legend: { display: false }, tooltip: chartTooltipTheme() },
            scales: {
              x: { ticks: { color: chartColors.muted }, grid: { display: false } },
              y: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
            },
          }}
        />
      </div>
    </div>
  )
}

export function MgmtTurnout() {
  const data = {
    labels: ['SW', 'NW', 'SE', 'SS', 'NC', 'NE'],
    datasets: [
      {
        label: 'Turnout %',
        data: [72, 58, 84, 65, 49, 55],
        backgroundColor: [chartColors.green, chartColors.amber, chartColors.green, chartColors.green, chartColors.red, chartColors.amber],
        borderRadius: 6,
      },
    ],
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Turnout analysis</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Zone bars · ranked states · hourly accreditation curves</p>
      </header>
      <div className={card}>
        <Bar
          data={data}
          options={{
            responsive: true,
            plugins: { legend: { display: false }, tooltip: chartTooltipTheme() },
            scales: {
              x: { ticks: { color: chartColors.muted }, grid: { display: false } },
              y: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
            },
          }}
        />
      </div>
    </div>
  )
}

export function MgmtOrders() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Issue operational orders</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Priority · target by state/LGA/rank · in-app + SMS · delivery confirmation (§M24)
        </p>
      </header>
      <div className={card}>
        <label className="block text-[13px]">
          <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Message</span>
          <textarea rows={4} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]" />
        </label>
        <button type="button" className="mt-4 rounded-lg bg-[#00C896] px-4 py-2 text-sm font-semibold text-[#0A1628]">
          Broadcast order
        </button>
      </div>
    </div>
  )
}

export function MgmtUnits() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Field unit status</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Last report time · non-reporting flags · direct message</p>
      </header>
      <div className={`${card} text-sm text-[var(--portal-muted)]`}>Unit roster binds to officer JWT jurisdiction — demo list omitted.</div>
    </div>
  )
}
