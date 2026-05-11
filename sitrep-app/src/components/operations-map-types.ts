/** GeoJSON FeatureCollection from API (typed loosely for GeoJSON component). */
export type GeoFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<Record<string, unknown>>
}
