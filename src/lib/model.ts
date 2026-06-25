// Internal data model. The Netlify function (and the vite dev middleware)
// normalize ESPN into this shape; everything client-side reasons over it.

export type MatchState = 'upcoming' | 'live' | 'completed'
export type Stage = 'group' | 'ko'

export interface Team {
  id: string
  name: string
  short?: string
  group?: string // 'A'..'L' for group-stage teams
}

export interface GroupRow {
  teamId: string
  name: string
  pts: number
  gd: number
  gdLabel: string // '+5' | '0' | '–3' (en-dash minus, matching the design)
  played: number
  rank: number
  advanced: boolean // ESPN's clinched flag
  statusNote: string // ESPN note: 'Advance to Round of 32' | 'Best 8 advance' | 'Eliminated' | ''
}

export interface Group {
  id: string // 'A'
  name: string // 'Group A'
  table: GroupRow[] // sorted by rank
}

// Normalized 3-way win probabilities (percent, integers summing to 100).
export interface Odds {
  home: number
  draw: number
  away: number
  source: string
}

export interface Match {
  id: string
  stage: Stage
  group?: string // group letter for group games
  roundName?: string // e.g. 'Round of 32' for knockout games
  state: MatchState
  dateISO: string // kickoff, UTC ISO
  homeId: string
  awayId: string
  home: string
  away: string
  score?: { home: number; away: number }
  minute?: string // e.g. "62'" while live
  venue?: string // e.g. "Lincoln Financial Field · Philadelphia"
  odds?: Odds
}

// A line of explanatory copy that may contain one hover-glossed term.
export interface Gloss {
  text?: string
  pre?: string
  term?: string
  post?: string
  tip?: string
}

export interface ScoresPayload {
  generatedAt: string
  source: 'espn' | 'openfootball' | 'cache'
  stale?: boolean
  teams: Record<string, Team>
  groups: Group[]
  matches: Match[]
}
