/** One ballot / contest type; an election may include several (e.g. presidential + senatorial + HoR). */
export type ContestCode =
  | 'presidential'
  | 'governorship'
  | 'senatorial'
  | 'house_of_reps'
  | 'state_assembly'
  | 'lg_chairmanship'
  | 'councillorship'
  | 'other'
