import { describe, expect, it } from 'vitest'
import {
  addSwissRound,
  buildGroupPlayoff,
  createTournament,
  defaultOptions,
  groupStandings,
  standings,
  updateMatch,
} from './brackets'
import type { BracketFormat } from './types'

const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']

function make(format: BracketFormat, playerNames = names) {
  return createTournament('Test Cup', format, playerNames, defaultOptions)
}

describe('bracket generation', () => {
  it.each([4, 8, 16, 6])('builds single elimination for %i players', (count) => {
    const tournament = make('single-elimination', Array.from({ length: count }, (_, index) => `Player ${index + 1}`))
    expect(tournament.matches.some((match) => match.label === 'Final')).toBe(true)
    expect(tournament.matches.length).toBeGreaterThanOrEqual(count - 1)
  })

  it('advances single elimination winners into later rounds', () => {
    let tournament = make('single-elimination', names.slice(0, 4))
    tournament = updateMatch(tournament, 'se-r1-m1', 3, 1)
    expect(tournament.matches.find((match) => match.id === 'se-r2-m1')?.participantAId).toBe(
      tournament.matches.find((match) => match.id === 'se-r1-m1')?.winnerId,
    )
  })

  it('creates double elimination winner, loser, and grand-final sections', () => {
    const tournament = make('double-elimination')
    expect(tournament.matches.some((match) => match.bracket === 'Winners')).toBe(true)
    expect(tournament.matches.some((match) => match.bracket === 'Losers')).toBe(true)
    expect(tournament.matches.some((match) => match.bracket === 'Grand final')).toBe(true)
  })

  it('creates round robin standings and tie data', () => {
    let tournament = make('round-robin', names.slice(0, 4))
    tournament = updateMatch(tournament, tournament.matches[0].id, 2, 0)
    tournament = updateMatch(tournament, tournament.matches[1].id, 1, 1)
    const table = standings(tournament)
    expect(table[0].score).toBeGreaterThanOrEqual(table[1].score)
    expect(table.reduce((sum, row) => sum + row.played, 0)).toBe(4)
  })

  it('adds Swiss rounds without rematching when possible', () => {
    let tournament = make('swiss', names.slice(0, 6))
    tournament = updateMatch(tournament, 'sw-r1-m1', 1, 0)
    tournament = updateMatch(tournament, 'sw-r1-m2', 1, 0)
    tournament = updateMatch(tournament, 'sw-r1-m3', 1, 0)
    tournament = addSwissRound(tournament)
    const pairKeys = tournament.matches.map((match) => [match.participantAId, match.participantBId].sort().join(':'))
    expect(new Set(pairKeys).size).toBe(pairKeys.length)
  })

  it('creates a bye for odd-player Swiss events', () => {
    const tournament = make('swiss', names.slice(0, 5))
    expect(tournament.matches.some((match) => match.bye)).toBe(true)
  })

  it('feeds group qualifiers into a playoff bracket', () => {
    let tournament = make('groups-playoff', names)
    for (const match of tournament.matches) {
      tournament = updateMatch(tournament, match.id, 2, 0)
    }
    tournament = buildGroupPlayoff(tournament)
    expect(Object.keys(groupStandings(tournament))).toHaveLength(2)
    expect(tournament.matches.some((match) => match.bracket === 'Playoff')).toBe(true)
  })
})
