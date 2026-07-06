import type {
  BracketFormat,
  Match,
  Participant,
  Standing,
  TournamentOptions,
  TournamentPayload,
} from './types'

export const formatLabels: Record<BracketFormat, string> = {
  'single-elimination': 'Single elimination',
  'double-elimination': 'Double elimination',
  'round-robin': 'Round robin',
  swiss: 'Swiss',
  'groups-playoff': 'Groups + playoff',
}

export const defaultOptions: TournamentOptions = {
  seeding: 'manual',
  swissRounds: 4,
  groupCount: 2,
  qualifiersPerGroup: 2,
  thirdPlace: false,
  bestOfLabel: 'Best of 1',
  scoreStyle: 'points',
}

const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)

export function createParticipants(names: string[], seeding: TournamentOptions['seeding']) {
  let clean = names.map((name) => name.trim()).filter(Boolean)
  if (seeding === 'random') clean = shuffle(clean)

  return clean.map((name, index) => ({
    id: uid(),
    name,
    seed: index + 1,
  }))
}

export function createTournament(
  title: string,
  format: BracketFormat,
  names: string[],
  options: TournamentOptions,
): TournamentPayload {
  const participants = createParticipants(names, options.seeding)
  const now = new Date().toISOString()
  const base: TournamentPayload = {
    id: uid(),
    title: title.trim() || 'Untitled tournament',
    format,
    status: 'draft',
    participants,
    options,
    matches: [],
    createdAt: now,
    updatedAt: now,
  }

  return generateTournament(base)
}

export function generateTournament(payload: TournamentPayload): TournamentPayload {
  const matches = buildMatches(payload.format, payload.participants, payload.options)
  const advanced = advanceMatches({ ...payload, matches, status: 'active' })
  return touch(advanced)
}

export function updateMatch(payload: TournamentPayload, matchId: string, scoreA?: number, scoreB?: number) {
  const matches = payload.matches.map((match) => {
    if (match.id !== matchId) return match
    const participantAId = match.participantAId
    const participantBId = match.participantBId
    const winnerId =
      participantAId && participantBId && scoreA !== undefined && scoreB !== undefined && scoreA !== scoreB
        ? scoreA > scoreB
          ? participantAId
          : participantBId
        : undefined
    const loserId =
      winnerId && participantAId && participantBId ? (winnerId === participantAId ? participantBId : participantAId) : undefined

    return { ...match, scoreA, scoreB, winnerId, loserId }
  })

  return touch(advanceMatches({ ...payload, matches, status: 'active' }))
}

export function addSwissRound(payload: TournamentPayload) {
  if (payload.format !== 'swiss') return payload
  const rounds = Math.max(0, ...payload.matches.map((match) => match.round))
  if (rounds >= payload.options.swissRounds) return payload
  const next = buildSwissRound(payload.participants, payload.matches, rounds + 1)
  return touch({ ...payload, matches: [...payload.matches, ...next] })
}

export function buildGroupPlayoff(payload: TournamentPayload) {
  if (payload.format !== 'groups-playoff') return payload
  const existing = payload.matches.some((match) => match.bracket === 'Playoff')
  if (existing) return payload

  const qualified = Object.entries(groupStandings(payload))
    .flatMap(([group, standings]) =>
      standings
        .slice(0, payload.options.qualifiersPerGroup)
        .map((standing, index) => ({ participantId: standing.participantId, seed: index + 1, group })),
    )
    .sort((a, b) => a.seed - b.seed || a.group.localeCompare(b.group))
    .map((item) => payload.participants.find((player) => player.id === item.participantId))
    .filter(Boolean) as Participant[]

  const playoff = buildSingleElimination(qualified, 'Playoff', 'po')
  return touch({ ...payload, matches: [...payload.matches, ...playoff] })
}

export function standings(payload: TournamentPayload) {
  return calculateStandings(payload.participants, payload.matches)
}

export function groupStandings(payload: TournamentPayload) {
  const groups = new Map<string, Match[]>()
  payload.matches
    .filter((match) => match.group && match.bracket === 'Group')
    .forEach((match) => groups.set(match.group!, [...(groups.get(match.group!) ?? []), match]))

  const result: Record<string, Standing[]> = {}
  groups.forEach((matches, group) => {
    const participantIds = new Set(matches.flatMap((match) => [match.participantAId, match.participantBId]).filter(Boolean))
    result[group] = calculateStandings(
      payload.participants.filter((player) => participantIds.has(player.id)),
      matches,
    )
  })
  return result
}

export function playerName(players: Participant[], id?: string) {
  if (!id) return 'TBD'
  return players.find((player) => player.id === id)?.name ?? 'TBD'
}

function buildMatches(format: BracketFormat, participants: Participant[], options: TournamentOptions) {
  if (format === 'single-elimination') return buildSingleElimination(participants, 'Winners', 'se', options.thirdPlace)
  if (format === 'double-elimination') return buildDoubleElimination(participants)
  if (format === 'round-robin') return buildRoundRobin(participants, 'Round robin', 'rr')
  if (format === 'swiss') return buildSwissRound(participants, [], 1)
  return buildGroups(participants, options)
}

function buildSingleElimination(participants: Participant[], bracket: string, prefix: string, thirdPlace = false) {
  const size = nextPowerOfTwo(Math.max(2, participants.length))
  const slots = [...participants, ...Array<undefined>(size - participants.length).fill(undefined)]
  const rounds = Math.log2(size)
  const matches: Match[] = []

  for (let i = 0; i < size / 2; i += 1) {
    const a = slots[i]
    const b = slots[size - 1 - i]
    matches.push({
      id: `${prefix}-r1-m${i + 1}`,
      round: 1,
      label: `Round 1.${i + 1}`,
      bracket,
      participantAId: a?.id,
      participantBId: b?.id,
      winnerId: a && !b ? a.id : !a && b ? b.id : undefined,
      bye: !a || !b,
    })
  }

  for (let round = 2; round <= rounds; round += 1) {
    const count = size / 2 ** round
    for (let i = 0; i < count; i += 1) {
      matches.push({
        id: `${prefix}-r${round}-m${i + 1}`,
        round,
        label: round === rounds ? 'Final' : `Round ${round}.${i + 1}`,
        bracket,
        sourceA: `${prefix}-r${round - 1}-m${i * 2 + 1}`,
        sourceB: `${prefix}-r${round - 1}-m${i * 2 + 2}`,
      })
    }
  }

  if (thirdPlace && size >= 4) {
    matches.push({
      id: `${prefix}-third-place`,
      round: rounds,
      label: 'Third place',
      bracket,
      sourceA: `${prefix}-r${rounds - 1}-m1`,
      sourceB: `${prefix}-r${rounds - 1}-m2`,
    })
  }

  return matches
}

function buildDoubleElimination(participants: Participant[]) {
  const winners = buildSingleElimination(participants, 'Winners', 'de-w')
  const size = nextPowerOfTwo(Math.max(2, participants.length))
  const winnerRounds = Math.log2(size)
  const losers: Match[] = []
  let previousLoserRound = ''
  let previousLoserCount = 0

  if (winnerRounds === 1) {
    previousLoserRound = 'de-w-r1'
    previousLoserCount = 1
  } else {
    const firstLoserCount = size / 4
    for (let i = 0; i < firstLoserCount; i += 1) {
      losers.push({
        id: `de-l-r1-m${i + 1}`,
        round: 1,
        label: `Losers 1.${i + 1}`,
        bracket: 'Losers',
        sourceA: `de-w-r1-m${i * 2 + 1}`,
        sourceAType: 'loser',
        sourceB: `de-w-r1-m${i * 2 + 2}`,
        sourceBType: 'loser',
      })
    }
    previousLoserRound = 'de-l-r1'
    previousLoserCount = firstLoserCount
  }

  let loserRound = 2
  for (let winnerRound = 2; winnerRound <= winnerRounds; winnerRound += 1) {
    const incomingLosers = size / 2 ** winnerRound
    for (let i = 0; i < incomingLosers; i += 1) {
      losers.push({
        id: `de-l-r${loserRound}-m${i + 1}`,
        round: loserRound,
        label: `Losers ${loserRound}.${i + 1}`,
        bracket: 'Losers',
        sourceA: `${previousLoserRound}-m${Math.min(i + 1, previousLoserCount)}`,
        sourceB: `de-w-r${winnerRound}-m${i + 1}`,
        sourceBType: 'loser',
      })
    }
    previousLoserRound = `de-l-r${loserRound}`
    previousLoserCount = incomingLosers
    loserRound += 1

    if (incomingLosers > 1) {
      const pairedCount = incomingLosers / 2
      for (let i = 0; i < pairedCount; i += 1) {
        losers.push({
          id: `de-l-r${loserRound}-m${i + 1}`,
          round: loserRound,
          label: `Losers ${loserRound}.${i + 1}`,
          bracket: 'Losers',
          sourceA: `${previousLoserRound}-m${i * 2 + 1}`,
          sourceB: `${previousLoserRound}-m${i * 2 + 2}`,
        })
      }
      previousLoserRound = `de-l-r${loserRound}`
      previousLoserCount = pairedCount
      loserRound += 1
    }
  }

  return [
    ...winners,
    ...losers,
    {
      id: 'de-grand-final',
      round: Math.log2(size) + 1,
      label: 'Grand final',
      bracket: 'Grand final',
      sourceA: `de-w-r${winnerRounds}-m1`,
      sourceB: previousLoserRound ? `${previousLoserRound}-m1` : `de-w-r${winnerRounds}-m1`,
      sourceBType: winnerRounds === 1 ? ('loser' as const) : undefined,
    },
  ]
}

function buildRoundRobin(participants: Participant[], bracket: string, prefix: string, group?: string) {
  const players = participants.length % 2 === 0 ? participants : [...participants, undefined]
  const rounds = players.length - 1
  const half = players.length / 2
  const rotation = [...players]
  const matches: Match[] = []

  for (let round = 1; round <= rounds; round += 1) {
    for (let i = 0; i < half; i += 1) {
      const a = rotation[i]
      const b = rotation[rotation.length - 1 - i]
      if (a && b) {
        matches.push({
          id: `${prefix}-r${round}-m${i + 1}`,
          round,
          label: `Round ${round}.${i + 1}`,
          bracket,
          group,
          participantAId: a.id,
          participantBId: b.id,
        })
      }
    }
    rotation.splice(1, 0, rotation.pop())
  }

  return matches
}

function buildSwissRound(participants: Participant[], existing: Match[], round: number) {
  const table = calculateStandings(participants, existing)
  const seen = new Set(existing.map((match) => [match.participantAId, match.participantBId].sort().join(':')))
  const ordered = [...table].sort((a, b) => b.score - a.score || b.opponentsScore - a.opponentsScore)
  const unpaired = ordered.map((item) => item.participantId)
  const matches: Match[] = []
  let matchIndex = 1

  while (unpaired.length > 1) {
    const a = unpaired.shift()!
    let opponentIndex = unpaired.findIndex((b) => !seen.has([a, b].sort().join(':')))
    if (opponentIndex < 0) opponentIndex = 0
    const b = unpaired.splice(opponentIndex, 1)[0]
    matches.push({
      id: `sw-r${round}-m${matchIndex}`,
      round,
      label: `Swiss ${round}.${matchIndex}`,
      bracket: 'Swiss',
      participantAId: a,
      participantBId: b,
    })
    matchIndex += 1
  }

  if (unpaired.length === 1) {
    matches.push({
      id: `sw-r${round}-bye`,
      round,
      label: `Swiss ${round} bye`,
      bracket: 'Swiss',
      participantAId: unpaired[0],
      winnerId: unpaired[0],
      scoreA: 1,
      scoreB: 0,
      bye: true,
    })
  }

  return matches
}

function buildGroups(participants: Participant[], options: TournamentOptions) {
  const groups = Array.from({ length: Math.max(2, options.groupCount) }, (_, index) => ({
    name: `Group ${String.fromCharCode(65 + index)}`,
    players: [] as Participant[],
  }))

  participants.forEach((player, index) => groups[index % groups.length].players.push(player))
  return groups.flatMap((group, index) => buildRoundRobin(group.players, 'Group', `g${index + 1}`, group.name))
}

function advanceMatches(payload: TournamentPayload) {
  const matches = payload.matches.map((match) => ({ ...match }))
  const byId = new Map(matches.map((match) => [match.id, match]))

  matches.forEach((match) => {
    if (match.sourceA) {
      const source = byId.get(match.sourceA)
      match.participantAId =
        match.id.endsWith('third-place') || match.sourceAType === 'loser' ? source?.loserId : source?.winnerId
    }
    if (match.sourceB) {
      const source = byId.get(match.sourceB)
      match.participantBId =
        match.id.endsWith('third-place') || match.sourceBType === 'loser' ? source?.loserId : source?.winnerId
    }
    if (match.participantAId && !match.participantBId && match.bye) match.winnerId = match.participantAId
    if (!match.participantAId && match.participantBId && match.bye) match.winnerId = match.participantBId
  })

  return { ...payload, matches }
}

function calculateStandings(participants: Participant[], matches: Match[]) {
  const standings = new Map<string, Standing>()
  participants.forEach((participant) =>
    standings.set(participant.id, {
      participantId: participant.id,
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      score: 0,
      opponentsScore: 0,
    }),
  )

  matches.forEach((match) => {
    if (!match.participantAId || !match.participantBId) return
    if (match.scoreA === undefined || match.scoreB === undefined) return
    const a = standings.get(match.participantAId)
    const b = standings.get(match.participantBId)
    if (!a || !b) return

    a.played += 1
    b.played += 1
    a.pointsFor += match.scoreA
    a.pointsAgainst += match.scoreB
    b.pointsFor += match.scoreB
    b.pointsAgainst += match.scoreA

    if (match.scoreA === match.scoreB) {
      a.draws += 1
      b.draws += 1
      a.score += 0.5
      b.score += 0.5
    } else if (match.scoreA > match.scoreB) {
      a.wins += 1
      b.losses += 1
      a.score += 1
    } else {
      b.wins += 1
      a.losses += 1
      b.score += 1
    }
  })

  matches.forEach((match) => {
    if (!match.participantAId || !match.participantBId) return
    const a = standings.get(match.participantAId)
    const b = standings.get(match.participantBId)
    if (a && b) {
      a.opponentsScore += b.score
      b.opponentsScore += a.score
    }
  })

  return [...standings.values()].sort(
    (a, b) =>
      b.score - a.score ||
      b.opponentsScore - a.opponentsScore ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst),
  )
}

function nextPowerOfTwo(value: number) {
  return 2 ** Math.ceil(Math.log2(value))
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5)
}

function touch(payload: TournamentPayload) {
  return { ...payload, updatedAt: new Date().toISOString() }
}
