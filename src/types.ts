export type BracketFormat =
  | 'single-elimination'
  | 'double-elimination'
  | 'round-robin'
  | 'swiss'
  | 'groups-playoff'

export type TournamentStatus = 'draft' | 'active' | 'complete'

export interface Participant {
  id: string
  name: string
  seed: number
}

export interface Match {
  id: string
  round: number
  label: string
  bracket: string
  group?: string
  participantAId?: string
  participantBId?: string
  scoreA?: number
  scoreB?: number
  winnerId?: string
  loserId?: string
  sourceA?: string
  sourceB?: string
  bye?: boolean
}

export interface Standing {
  participantId: string
  played: number
  wins: number
  losses: number
  draws: number
  pointsFor: number
  pointsAgainst: number
  score: number
  opponentsScore: number
}

export interface TournamentOptions {
  seeding: 'manual' | 'random' | 'seeded'
  swissRounds: number
  groupCount: number
  qualifiersPerGroup: number
  thirdPlace: boolean
  bestOfLabel: string
  scoreStyle: 'points' | 'games'
}

export interface TournamentPayload {
  id: string
  slug?: string
  editToken?: string
  title: string
  format: BracketFormat
  status: TournamentStatus
  participants: Participant[]
  options: TournamentOptions
  matches: Match[]
  createdAt: string
  updatedAt: string
}

export interface PublicTournament {
  slug: string
  title: string
  format: BracketFormat
  status: TournamentStatus
  payload: TournamentPayload
  updated_at?: string
}
