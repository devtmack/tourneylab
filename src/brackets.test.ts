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

function byName(tournament: ReturnType<typeof make>, name: string) {
  const player = tournament.participants.find((participant) => participant.name === name)
  if (!player) throw new Error(`Missing player ${name}`)
  return player.id
}

function pairKey(ids: Array<string | undefined>) {
  return ids.filter(Boolean).sort().join(':')
}

describe('bracket generation', () => {
  it.each([4, 8, 16, 6])('builds single elimination for %i players', (count) => {
    const tournament = make('single-elimination', Array.from({ length: count }, (_, index) => `Player ${index + 1}`))
    expect(tournament.matches.some((match) => match.label === 'Final')).toBe(true)
    expect(tournament.matches.length).toBeGreaterThanOrEqual(count - 1)
  })

  it('auto-advances single elimination byes for non-power-of-two fields', () => {
    const tournament = make('single-elimination', names.slice(0, 6))
    const byeMatches = tournament.matches.filter((match) => match.bye)
    expect(byeMatches).toHaveLength(2)
    expect(byeMatches.every((match) => match.winnerId)).toBe(true)
    expect(tournament.matches.find((match) => match.id === 'se-r2-m1')?.participantAId).toBe(byeMatches[0].winnerId)
  })

  it('advances single elimination winners into later rounds', () => {
    let tournament = make('single-elimination', names.slice(0, 4))
    tournament = updateMatch(tournament, 'se-r1-m1', 3, 1)
    expect(tournament.matches.find((match) => match.id === 'se-r2-m1')?.participantAId).toBe(
      tournament.matches.find((match) => match.id === 'se-r1-m1')?.winnerId,
    )
  })

  it('feeds semifinal losers into a single elimination third-place match', () => {
    let tournament = createTournament('Test Cup', 'single-elimination', names.slice(0, 4), {
      ...defaultOptions,
      thirdPlace: true,
    })
    tournament = updateMatch(tournament, 'se-r1-m1', 3, 1)
    tournament = updateMatch(tournament, 'se-r1-m2', 3, 1)
    const thirdPlace = tournament.matches.find((match) => match.id === 'se-third-place')
    expect(thirdPlace?.participantAId).toBe(tournament.matches.find((match) => match.id === 'se-r1-m1')?.loserId)
    expect(thirdPlace?.participantBId).toBe(tournament.matches.find((match) => match.id === 'se-r1-m2')?.loserId)
  })

  it('creates double elimination winner, loser, and grand-final sections', () => {
    const tournament = make('double-elimination')
    expect(tournament.matches.some((match) => match.bracket === 'Winners')).toBe(true)
    expect(tournament.matches.some((match) => match.bracket === 'Losers')).toBe(true)
    expect(tournament.matches.some((match) => match.bracket === 'Grand final')).toBe(true)
  })

  it('routes double elimination losers through the losers bracket and into grand final', () => {
    let tournament = make('double-elimination', names.slice(0, 4))
    tournament = updateMatch(tournament, 'de-w-r1-m1', 3, 1)
    tournament = updateMatch(tournament, 'de-w-r1-m2', 3, 1)
    expect(tournament.matches.find((match) => match.id === 'de-l-r1-m1')?.participantAId).toBe(byName(tournament, 'Delta'))
    expect(tournament.matches.find((match) => match.id === 'de-l-r1-m1')?.participantBId).toBe(byName(tournament, 'Charlie'))

    tournament = updateMatch(tournament, 'de-w-r2-m1', 3, 1)
    expect(tournament.matches.find((match) => match.id === 'de-l-r2-m1')?.participantBId).toBe(byName(tournament, 'Bravo'))

    tournament = updateMatch(tournament, 'de-l-r1-m1', 2, 0)
    tournament = updateMatch(tournament, 'de-l-r2-m1', 2, 0)
    const grandFinal = tournament.matches.find((match) => match.id === 'de-grand-final')
    expect(grandFinal?.participantAId).toBe(byName(tournament, 'Alpha'))
    expect(grandFinal?.participantBId).toBe(byName(tournament, 'Delta'))
  })

  it('creates round robin standings and tie data', () => {
    let tournament = make('round-robin', names.slice(0, 4))
    tournament = updateMatch(tournament, tournament.matches[0].id, 2, 0)
    tournament = updateMatch(tournament, tournament.matches[1].id, 1, 1)
    const table = standings(tournament)
    expect(table[0].score).toBeGreaterThanOrEqual(table[1].score)
    expect(table.reduce((sum, row) => sum + row.played, 0)).toBe(4)
  })

  it('schedules each round robin pair exactly once', () => {
    const tournament = make('round-robin', names.slice(0, 5))
    const keys = tournament.matches.map((match) => pairKey([match.participantAId, match.participantBId]))
    expect(keys).toHaveLength(10)
    expect(new Set(keys).size).toBe(10)
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

  it('stops Swiss generation at the configured round count', () => {
    let tournament = createTournament('Test Cup', 'swiss', names.slice(0, 4), { ...defaultOptions, swissRounds: 2 })
    tournament = addSwissRound(tournament)
    tournament = addSwissRound(tournament)
    expect(Math.max(...tournament.matches.map((match) => match.round))).toBe(2)
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
