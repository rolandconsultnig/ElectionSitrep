import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { chartColors } from '../charts/register'

type Pin = { lat: number; lng: number; label: string; severity: 'green' | 'amber' | 'red' }

const COLORS = {
  green: chartColors.green,
  amber: chartColors.amber,
  red: chartColors.red,
}

type Props = {
  pins: Pin[]
  height?: string
  hint?: string
}

/** Leaflet map centered on Nigeria — OSM tiles (§M19 / §M29). */
export function NigeriaMap({ pins, height = '320px', hint }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)]">
      <MapContainer
        center={[9.082, 8.675]}
        zoom={6}
        style={{ height, width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pins.map((p) => (
          <CircleMarker
            key={`${p.label}-${p.lat}-${p.lng}`}
            center={[p.lat, p.lng]}
            radius={10}
            pathOptions={{ color: COLORS[p.severity], fillColor: COLORS[p.severity], fillOpacity: 0.45 }}
          >
            <Popup>
              <span className="text-xs">{p.label}</span>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {hint ? (
        <p className="border-t border-[color:var(--portal-border)] px-3 py-2 font-(--font-mono) text-[10px] text-[var(--portal-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
