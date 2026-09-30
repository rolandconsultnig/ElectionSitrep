import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet'
import type { FeatureCollection, Feature } from 'geojson'
import type { GeoFeatureCollection } from './operations-map-types'
import 'leaflet/dist/leaflet.css'

type Pin = { lat: number; lng: number; label: string; severity: 'green' | 'amber' | 'red' }

type MapPoint = { lat: number; lng: number; name?: string; code?: string; officer?: string; displayName?: string }

type FieldOpsOfficer = { userId: string; username?: string; displayName?: string; lat: number; lng: number; stateHint?: string }

type Props = {
  pins: Pin[]
  statesGeo?: GeoFeatureCollection
  selectedStates?: string[]
  pollingUnits?: Array<{ lat: number, lng: number, code: string, name: string }> | null
  fieldOfficers?: { active: FieldOpsOfficer[] } | null
  height?: string
  hint?: string
  onStateClick?: (stateName: string) => void
}

function FitBounds({ statesGeo }: { statesGeo?: GeoFeatureCollection }) {
  const map = useMap()

  useEffect(() => {
    if (!statesGeo?.features?.length) return
    const layer = L.geoJSON(statesGeo as unknown as FeatureCollection)
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 7, animate: true })
    }
  }, [map, statesGeo])

  return null
}

function FastPointsLayer({ points, color, radius, popupTitle, interactive = true }: { points?: MapPoint[] | null, color: string, radius: number, popupTitle: string, interactive?: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (!points || points.length === 0) return

    // Create a feature group to hold all the markers
    const layerGroup = L.featureGroup()
    
    // Use a custom renderer for these points to ensure canvas mode
    const renderer = L.canvas({ padding: 0.5 })

    for (let i = 0; i < points.length; i++) {
      const pt = points[i]
      if (typeof pt.lat !== 'number' || typeof pt.lng !== 'number') continue

      const marker = L.circleMarker([pt.lat, pt.lng], {
        renderer,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 1,
        radius,
        interactive,
      })

      if (interactive) {
        const name = pt.name || pt.officer || pt.displayName || ''
        const code = pt.code ? `PU: ${pt.code}` : ''
        
        marker.bindPopup(`
          <div style="font-family: monospace; font-size: 11px;">
            <strong style="color: ${color};">${popupTitle} ${code}</strong><br/>
            ${name}
          </div>
        `)
      }
      
      layerGroup.addLayer(marker)
    }

    layerGroup.addTo(map)

    return () => {
      layerGroup.remove()
    }
  }, [map, points, color, radius, popupTitle, interactive])

  return null
}

const createRadarIcon = (severity: 'green' | 'amber' | 'red') => {
  const colorMap = {
    green: 'bg-[#d9b64a]',
    amber: 'bg-[#f59e0b]',
    red: 'bg-[#ef4444]',
  }
  const color = colorMap[severity]

  return L.divIcon({
    className: 'custom-radar-icon',
    html: `
      <span class="relative flex h-4 w-4">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75"></span>
        <span class="relative inline-flex rounded-full h-4 w-4 ${color}"></span>
      </span>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  })
}

/** Leaflet map centered on Nigeria — OSM tiles (§M19 / §M29). */
export function NigeriaMap({ pins, statesGeo, selectedStates = [], pollingUnits, fieldOfficers, height = '320px', hint, onStateClick }: Props) {
  const stateStyle = useCallback<L.StyleFunction>((feature) => {
    const isSelected = selectedStates.includes((feature?.properties as { name?: string } | null)?.name ?? '')
    return {
      color: isSelected ? '#0ea5e9' : '#06b6d4',
      weight: isSelected ? 3 : 2,
      opacity: isSelected ? 1 : 0.9,
      fillColor: isSelected ? '#0ea5e9' : '#06b6d4',
      fillOpacity: isSelected ? 0.3 : 0.1,
    }
  }, [selectedStates])

  const onEachState = (_feature: Feature | undefined, layer: L.Layer) => {
    (layer as L.Path).on({
      mouseover: (e: L.LeafletMouseEvent) => {
        const target = e.target as L.Path
        target.setStyle({
          weight: 3,
          color: '#22d3ee',
          fillOpacity: 0.25,
        })
        target.bringToFront()
      },
      mouseout: (e: L.LeafletMouseEvent) => {
        const target = e.target as L.Path & { feature?: Feature }
        target.setStyle(stateStyle(target.feature) ?? {})
      },
      click: (e: L.LeafletMouseEvent) => {
        const feature = (e.target as { feature?: Feature }).feature
        const name = (feature?.properties as { name?: string } | null)?.name
        if (onStateClick && name) {
          onStateClick(name)
        }
      },
    })
  }

  const geoJsonRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.setStyle(stateStyle)
    }
  }, [selectedStates, statesGeo, stateStyle])

  return (
    <div 
      className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)]"
      style={{ height, width: '100%' }}
    >
      <MapContainer
        center={[9.082, 8.675]}
        zoom={6}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        preferCanvas={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {statesGeo?.features?.length ? (
          <>
            <GeoJSON 
              ref={geoJsonRef}
              data={statesGeo as unknown as FeatureCollection} 
              style={stateStyle} 
              onEachFeature={onEachState}
            />
            {/* Only auto-fit if we don't have multiple selected states to avoid jumping around */}
            {selectedStates.length <= 1 && <FitBounds statesGeo={statesGeo} />}
          </>
        ) : null}
        {pins.map((p) => (
          <Marker
            key={`${p.label}-${p.lat}-${p.lng}`}
            position={[p.lat, p.lng]}
            icon={createRadarIcon(p.severity)}
          >
            <Popup>
              <div className="font-(--font-mono) text-[11px] font-medium tracking-wide text-white">
                {p.label}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Polling Units Layer (Yellow) - High Performance Native Canvas Layer */}
        <FastPointsLayer 
          points={pollingUnits} 
          color="#facc15" 
          radius={3} 
          popupTitle="POLLING UNIT" 
          interactive={false}
        />

        {/* Field Officers Layer (Light Blue) - High Performance Native Canvas Layer */}
        <FastPointsLayer 
          points={fieldOfficers?.active} 
          color="#38bdf8" 
          radius={4} 
          popupTitle="OFFICER ACTIVE" 
          interactive={false}
        />
      </MapContainer>
      {hint ? (
        <p className="border-t border-[color:var(--portal-border)] px-3 py-2 font-(--font-mono) text-[10px] text-[var(--portal-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
