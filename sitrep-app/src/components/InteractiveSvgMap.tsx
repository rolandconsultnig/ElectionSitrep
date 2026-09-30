import { useMemo } from 'react'
import Nigeria from '@react-map/nigeria'

type Severity = 'green' | 'amber' | 'red'

export type StateIncident = {
  state: string
  severity: Severity
}

type Props = {
  incidents: StateIncident[]
  selectedState?: string | null
  onStateSelect?: (stateName: string | null) => void
}

export function InteractiveSvgMap({ incidents, selectedState, onStateSelect }: Props) {
  const cityColors = useMemo(() => {
    const colors: Record<string, string> = {}
    
    // First apply base color for all 36 states + FCT to ensure consistent styling
    // Map colors to tactical incident colors
    incidents.forEach((inc) => {
      // The SVG map might expect specific formatting for state names, typically title case.
      const stateKey = inc.state
      if (inc.severity === 'red') {
        colors[stateKey] = '#f43f5e' // Tactical crimson
      } else if (inc.severity === 'amber') {
        colors[stateKey] = '#f59e0b' // Warning amber
      } else if (inc.severity === 'green') {
        colors[stateKey] = '#10b981' // Secure emerald
      }
    })
    
    // If a state is isolated, dim all others
    if (selectedState) {
      Object.keys(colors).forEach((k) => {
        if (k !== selectedState) {
          colors[k] = '#0f172a' // Very dark slate for unselected
        }
      })
      // Ensure selected state is highlighted if it had no incident
      if (!colors[selectedState]) {
        colors[selectedState] = '#0ea5e9' // Electric blue highlight
      }
    }
    
    return colors
  }, [incidents, selectedState])

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <Nigeria
        type="select-single"
        size={500}
        mapColor={selectedState ? '#0f172a' : '#1e293b'} // Darker if isolated
        strokeColor="#06b6d4" // Cyan borders
        strokeWidth={1.5}
        hoverColor="#22d3ee" // Brighter cyan on hover
        selectColor="#0ea5e9" // Highlight on click
        hints={true}
        hintTextColor="#ffffff"
        hintBackgroundColor="#030906"
        hintPadding="8px 12px"
        hintBorderRadius={4}
        cityColors={cityColors}
        onSelect={(state) => {
          if (onStateSelect) {
            onStateSelect(state)
          }
        }}
      />
    </div>
  )
}
