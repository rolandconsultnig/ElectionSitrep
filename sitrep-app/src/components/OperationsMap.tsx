import { useCallback, useMemo, useState } from 'react'
import {
  CircleMarker,
  GeoJSON,
  LayersControl,
  MapContainer,
  Popup,
  TileLayer,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { chartColors } from '../charts/register'
import type { GeoFeatureCollection } from './operations-map-types'

type FieldPin = {
  userId: string
  username: string
  displayName: string
  serviceNumber: string | null
  lat: number
  lng: number
  stateHint: string
}

type FieldInactive = FieldPin & { reason: string }

type MapClickHandlerProps = {
  onAdd: (lat: number, lng: number) => void
}

function MapClickHandler({ onAdd }: MapClickHandlerProps) {
  useMapEvents({
    click(e) {
      onAdd(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

type EventPin = { id: string; lat: number; lng: number; at: number }

type Props = {
  statesGeo: GeoFeatureCollection | null
  lgasGeo: GeoFeatureCollection | null
  activeFieldOps: FieldPin[]
  inactiveFieldOps: FieldInactive[]
  height?: string
}

export function OperationsMap({
  statesGeo,
  lgasGeo,
  activeFieldOps,
  inactiveFieldOps,
  height = 'min(62vh, 560px)',
}: Props) {
  const [layerStates, setLayerStates] = useState(true)
  const [layerLgas, setLayerLgas] = useState(true)
  const [eventPins, setEventPins] = useState<EventPin[]>([])

  const onMapClick = useCallback((lat: number, lng: number) => {
    setEventPins((prev) => [
      ...prev,
      {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ev-${Date.now()}`,
        lat,
        lng,
        at: Date.now(),
      },
    ])
  }, [])

  const stateStyle = useMemo(
    () => ({
      color: '#0dccb0',
      weight: 2,
      fillOpacity: 0.06,
    }),
    [],
  )

  const lgaStyle = useMemo(
    () => ({
      color: '#f59e0b',
      weight: 1.5,
      fillOpacity: 0.08,
    }),
    [],
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(260px,320px)]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 font-(--font-mono) text-[10px] text-[var(--portal-muted)]">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={layerStates} onChange={(e) => setLayerStates(e.target.checked)} />
            State boundaries
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={layerLgas} onChange={(e) => setLayerLgas(e.target.checked)} />
            LGA boundaries
          </label>
          <span className="text-[var(--portal-dim)]">Click map to drop event pin</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)]">
          <MapContainer center={[9.082, 8.675]} zoom={6} style={{ height, width: '100%' }} scrollWheelZoom>
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Streets (Carto Voyager)">
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            <MapClickHandler onAdd={onMapClick} />

            {layerStates && statesGeo?.features?.length ? (
              <GeoJSON data={statesGeo as never} style={() => stateStyle} />
            ) : null}
            {layerLgas && lgasGeo?.features?.length ? (
              <GeoJSON data={lgasGeo as never} style={() => lgaStyle} />
            ) : null}

            {activeFieldOps.map((p) => (
              <CircleMarker
                key={p.userId}
                center={[p.lat, p.lng]}
                radius={11}
                pathOptions={{
                  color: chartColors.green,
                  fillColor: chartColors.green,
                  fillOpacity: 0.55,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold text-[#0dccb0]">Active field · {p.displayName}</div>
                    <div>{p.username}</div>
                    {p.serviceNumber ? <div className="font-(--font-mono)">{p.serviceNumber}</div> : null}
                    <div className="text-[var(--portal-dim)]">{p.stateHint}</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {eventPins.map((ev) => (
              <CircleMarker
                key={ev.id}
                center={[ev.lat, ev.lng]}
                radius={9}
                pathOptions={{
                  color: chartColors.red,
                  fillColor: chartColors.red,
                  fillOpacity: 0.5,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold">Event marker</div>
                    <div className="font-(--font-mono) text-[10px]">
                      {ev.lat.toFixed(5)}, {ev.lng.toFixed(5)}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
          <p className="border-t border-[color:var(--portal-border)] px-3 py-2 font-(--font-mono) text-[10px] text-[var(--portal-muted)]">
            Green pins = active field officers (approximate positions). Red = event pins you place. Toggle base map layers for
            street-level tiles vs standard OSM.
          </p>
        </div>

        {eventPins.length > 0 ? (
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] p-3">
            <div className="font-(--font-mono) text-[10px] font-semibold uppercase text-[var(--portal-dim)]">
              Event pins ({eventPins.length})
            </div>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[12px] text-[var(--portal-muted)]">
              {eventPins.map((ev) => (
                <li key={ev.id} className="flex justify-between gap-2 font-(--font-mono) text-[11px]">
                  <span>
                    {ev.lat.toFixed(4)}, {ev.lng.toFixed(4)}
                  </span>
                  <button
                    type="button"
                    className="text-[#fca5a5] hover:underline"
                    onClick={() => setEventPins((prev) => prev.filter((x) => x.id !== ev.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <aside className="rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] p-4">
        <h3 className="font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Inactive field officers</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--portal-dim)]">
          Officers provisioned for the Field portal who are not yet active (no completed onboarding in this demo).
        </p>
        <ul className="mt-4 max-h-[min(50vh,420px)] space-y-3 overflow-y-auto">
          {inactiveFieldOps.length === 0 ? (
            <li className="text-sm text-[var(--portal-dim)]">None — all provisioned field accounts are active.</li>
          ) : (
            inactiveFieldOps.map((u) => (
              <li
                key={u.userId}
                className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--theme-toggle-bg)] px-3 py-2"
              >
                <div className="font-medium text-[var(--portal-fg)]">{u.displayName}</div>
                <div className="font-(--font-mono) text-[11px] text-[#0dccb0]">{u.username}</div>
                {u.serviceNumber ? (
                  <div className="font-(--font-mono) text-[10px] text-[var(--portal-muted)]">{u.serviceNumber}</div>
                ) : null}
                <div className="mt-1 text-[10px] text-[var(--portal-dim)]">{u.reason}</div>
              </li>
            ))
          )}
        </ul>
      </aside>
    </div>
  )
}
