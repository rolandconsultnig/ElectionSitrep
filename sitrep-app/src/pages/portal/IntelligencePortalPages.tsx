import React from 'react'
import { PartyAttributionView } from '../../components/intelligence/PartyAttributionView'
import { StakeholderRegistryView } from '../../components/intelligence/StakeholderRegistryView'
import { ScenarioPlanningView } from '../../components/intelligence/ScenarioPlanningView'
import { TribunalEvidenceBundleView } from '../../components/intelligence/TribunalEvidenceBundleView'

export const PartyAttributionPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PartyAttributionView />
    </div>
  )
}

export const StakeholderRegistryPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <StakeholderRegistryView />
    </div>
  )
}

export const ScenarioPlanningPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ScenarioPlanningView />
    </div>
  )
}

export const TribunalEvidencePage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <TribunalEvidenceBundleView />
    </div>
  )
}
