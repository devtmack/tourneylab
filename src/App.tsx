import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownUp,
  CalendarClock,
  Check,
  Clipboard,
  Cloud,
  Database,
  Eye,
  FlaskConical,
  Info,
  Link,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Share2,
  Shield,
  Swords,
  Trophy,
  Users,
} from 'lucide-react'
import './App.css'
import {
  addSwissRound,
  buildGroupPlayoff,
  createTournament,
  defaultOptions,
  formatLabels,
  generateTournament,
  groupStandings,
  playerName,
  standings,
  updateMatch,
} from './brackets'
import {
  fetchEditableTournament,
  fetchPublicTournament,
  listDrafts,
  publishTournament,
  saveDraft,
  shareUrls,
  sharingEnabled,
  storageLabel,
  updatePublishedTournament,
} from './storage'
import type { BracketFormat, Match, Standing, TournamentOptions, TournamentPayload } from './types'

const starterNames = ['Northside FC', 'Summit Crew', 'River City', 'Iron Wolves', 'Metro United', 'Peak State', 'Harbor Club', 'Apex Academy']

const formatIcons: Record<BracketFormat, typeof Trophy> = {
  'single-elimination': Trophy,
  'double-elimination': Swords,
  'round-robin': RefreshCw,
  swiss: ArrowDownUp,
  'groups-playoff': Users,
}

const formatHelp: Record<BracketFormat, string> = {
  'single-elimination': 'One loss and a team is out. Fast, familiar, and best for simple playoffs.',
  'double-elimination': 'Teams drop into a losers side after one loss. A second loss eliminates them.',
  'round-robin': 'Everyone plays everyone. Best when standings matter more than a knockout bracket.',
  swiss: 'Players with similar records are paired each round. Great for bigger events with fixed rounds.',
  'groups-playoff': 'Round-robin groups qualify top teams into a final playoff bracket.',
}

const setupTips = [
  { label: 'Names', text: 'Paste one player or team per line. You can reorder the list to control manual seeding.' },
  { label: 'Seeding', text: 'Manual keeps your list order, random shuffles everyone, seeded treats the list as seed order.' },
  { label: 'Sharing', text: 'Publish creates a spectator link and a private edit link. Spectators auto-refresh while matches are scored.' },
]

function App() {
  const [payload, setPayload] = useState<TournamentPayload>()
  const [readOnly, setReadOnly] = useState(false)
  const [routeError, setRouteError] = useState('')

  useEffect(() => {
    const loadRoute = async () => {
      const hash = window.location.hash
      const publicMatch = hash.match(/^#\/t\/([^?]+)/)
      const editMatch = hash.match(/^#\/edit\/([^?]+)/)
      const params = new URLSearchParams(hash.split('?')[1] ?? '')
      setRouteError('')

      try {
        if (publicMatch) {
          setReadOnly(true)
          const result = await fetchPublicTournament(publicMatch[1])
          setPayload({ ...result.payload, slug: result.slug })
        } else if (editMatch) {
          setReadOnly(false)
          const token = params.get('token') ?? ''
          const result = await fetchEditableTournament(editMatch[1], token)
          setPayload(result)
        }
      } catch (error) {
        setRouteError(error instanceof Error ? error.message : 'Unable to load tournament.')
      }
    }

    void loadRoute()
    window.addEventListener('hashchange', loadRoute)
    return () => window.removeEventListener('hashchange', loadRoute)
  }, [])

  const handleLocalSave = (next: TournamentPayload) => {
    setPayload(next)
    saveDraft(next)
  }

  return (
    <main className="app-shell">
      <Header payload={payload} readOnly={readOnly} />
      {routeError ? <div className="notice danger">{routeError}</div> : null}
      {payload ? (
        <TournamentWorkspace payload={payload} readOnly={readOnly} onChange={handleLocalSave} />
      ) : (
        <CreateWorkspace onCreate={handleLocalSave} />
      )}
    </main>
  )
}

function Header({ payload, readOnly }: { payload?: TournamentPayload; readOnly: boolean }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Trophy size={20} />
        </div>
        <div>
          <div className="brand-name">TourneyLab</div>
          <div className="brand-subtitle">Bracket maker and shareable tournament command center</div>
        </div>
      </div>
      <div className="topbar-meta">
        <span className="pill">
          <Cloud size={14} />
          {sharingEnabled ? `${storageLabel} ready` : 'Local mode'}
        </span>
        {payload ? (
          <span className="pill">
            {readOnly ? <Eye size={14} /> : <Lock size={14} />}
            {readOnly ? 'Public view' : payload.status}
          </span>
        ) : null}
      </div>
    </header>
  )
}

function CreateWorkspace({ onCreate }: { onCreate: (payload: TournamentPayload) => void }) {
  const [title, setTitle] = useState('Summer Showdown')
  const [format, setFormat] = useState<BracketFormat>('single-elimination')
  const [names, setNames] = useState(starterNames.join('\n'))
  const [options, setOptions] = useState<TournamentOptions>(defaultOptions)
  const drafts = listDrafts()

  const parsedNames = names
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean)

  const create = () => onCreate(createTournament(title, format, parsedNames, options))

  return (
    <section className="home-grid">
      <div className="panel create-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Create</p>
            <h1>Make a tournament people can actually follow.</h1>
          </div>
          <button className="primary-button" onClick={create} disabled={parsedNames.length < 2}>
            <Plus size={18} />
            Create bracket
          </button>
        </div>

        <label className="field">
          Tournament name
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <div className="format-grid">
          {(Object.keys(formatLabels) as BracketFormat[]).map((item) => {
            const Icon = formatIcons[item]
            return (
              <button
                key={item}
                className={item === format ? 'format-card selected' : 'format-card'}
                onClick={() => setFormat(item)}
              >
                <Icon size={20} />
                <span>{formatLabels[item]}</span>
                <small>{formatHelp[item]}</small>
              </button>
            )
          })}
        </div>

        <div className="tip-row">
          {setupTips.map((tip) => (
            <HelpChip key={tip.label} label={tip.label} text={tip.text} />
          ))}
        </div>

        <div className="config-grid">
          <label className="field">
            <span className="field-title">
              Seeding
              <HelpChip compact label="?" text="Use manual order for hand-made seeds, random for casual events, or seeded order for ranked players." />
            </span>
            <select
              value={options.seeding}
              onChange={(event) => setOptions({ ...options, seeding: event.target.value as TournamentOptions['seeding'] })}
            >
              <option value="manual">Manual order</option>
              <option value="seeded">Seeded order</option>
              <option value="random">Random shuffle</option>
            </select>
          </label>
          <label className="field">
            <span className="field-title">
              Match label
              <HelpChip compact label="?" text="This appears on the event card so players know if each match is best of 1, 3, 5, or another rule." />
            </span>
            <input
              value={options.bestOfLabel}
              onChange={(event) => setOptions({ ...options, bestOfLabel: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-title">
              Swiss rounds
              <HelpChip compact label="?" text="Swiss events use a fixed number of rounds. Four rounds works well for 8-16 players." />
            </span>
            <input
              type="number"
              min={1}
              max={12}
              value={options.swissRounds}
              onChange={(event) => setOptions({ ...options, swissRounds: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span className="field-title">
              Groups
              <HelpChip compact label="?" text="Group-stage tournaments split players into pools before building the playoff bracket." />
            </span>
            <input
              type="number"
              min={2}
              max={8}
              value={options.groupCount}
              onChange={(event) => setOptions({ ...options, groupCount: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span className="field-title">
              Qualifiers/group
              <HelpChip compact label="?" text="This many top players from each group advance when you press Build playoff." />
            </span>
            <input
              type="number"
              min={1}
              max={4}
              value={options.qualifiersPerGroup}
              onChange={(event) => setOptions({ ...options, qualifiersPerGroup: Number(event.target.value) })}
            />
          </label>
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={options.thirdPlace}
              onChange={(event) => setOptions({ ...options, thirdPlace: event.target.checked })}
            />
            Third-place match
          </label>
        </div>

        <label className="field">
          <span className="field-title">
            Participants
            <HelpChip compact label="?" text="Paste or type one name per line. The bracket will be generated from this list." />
          </span>
          <textarea value={names} onChange={(event) => setNames(event.target.value)} rows={10} />
        </label>
        <p className="muted">{parsedNames.length} participants ready.</p>
      </div>

      <aside className="panel side-panel">
        <p className="eyebrow">Drafts</p>
        <h2>Recent local tournaments</h2>
        <div className="draft-list">
          {drafts.length ? (
            drafts.map((draft) => (
              <button key={draft.id} className="draft-row" onClick={() => onCreate(draft)}>
                <span>{draft.title}</span>
                <small>{formatLabels[draft.format]}</small>
              </button>
            ))
          ) : (
            <div className="empty-state">
              <FlaskConical size={28} />
              <p>Your saved drafts will appear here.</p>
            </div>
          )}
        </div>
      </aside>
    </section>
  )
}

function HelpChip({ label, text, compact = false }: { label: string; text: string; compact?: boolean }) {
  return (
    <span className={compact ? 'help-chip compact' : 'help-chip'} tabIndex={0}>
      {compact ? <Info size={12} /> : label}
      <span className="help-popover">{text}</span>
    </span>
  )
}

function TournamentWorkspace({
  payload,
  readOnly,
  onChange,
}: {
  payload: TournamentPayload
  readOnly: boolean
  onChange: (payload: TournamentPayload) => void
}) {
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState('')
  const urls = payload.slug ? shareUrls(payload) : undefined
  const groupedMatches = useMemo(() => groupBy(payload.matches, (match) => match.bracket), [payload.matches])

  useEffect(() => {
    if (!readOnly || !payload.slug || !sharingEnabled) return undefined
    let cancelled = false
    const refresh = async () => {
      try {
        const result = await fetchPublicTournament(payload.slug!)
        if (!cancelled) {
          onChange({ ...result.payload, slug: result.slug })
          setLastSync(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }))
        }
      } catch {
        if (!cancelled) setMessage('Live refresh paused. Reopen the public link if the event does not update.')
      }
    }
    const timer = window.setInterval(refresh, 10000)
    void refresh()
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [onChange, payload.slug, readOnly])

  const persist = async (next: TournamentPayload) => {
    onChange(next)
    if (next.slug && next.editToken) {
      try {
        await updatePublishedTournament(next)
        setMessage('Published tournament updated.')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to update public tournament.')
      }
    }
  }

  const publish = async () => {
    try {
      const next = await publishTournament(payload)
      onChange(next)
      setMessage('Share links created. Keep the edit link private.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to publish tournament.')
    }
  }

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setMessage('Copied to clipboard.')
  }

  return (
    <section className="workspace">
      <aside className="panel control-rail">
        <p className="eyebrow">Tournament</p>
        <h1>{payload.title}</h1>
        <div className="stats-grid">
          <Metric icon={Users} label="Players" value={payload.participants.length} />
          <Metric icon={CalendarClock} label="Matches" value={payload.matches.length} />
          <Metric icon={Shield} label="Format" value={formatLabels[payload.format]} />
        </div>

        <div className={sharingEnabled ? 'database-card ready' : 'database-card'}>
          <Database size={18} />
          <div>
            <strong>{sharingEnabled ? `${storageLabel} sharing ready` : 'Database not connected'}</strong>
            <p>
              {sharingEnabled
                ? `Publish this tournament to store it in ${storageLabel}. Viewers can watch the public link update while scores are saved.`
                : 'Real public sharing needs a Google Apps Script URL. Local drafts only save on this device.'}
            </p>
          </div>
        </div>

        {!readOnly ? (
          <div className="action-stack">
            <button className="secondary-button" onClick={() => persist(generateTournament(payload))}>
              <RefreshCw size={16} />
              Regenerate schedule
            </button>
            {payload.format === 'swiss' ? (
              <button className="secondary-button" onClick={() => persist(addSwissRound(payload))}>
                <Plus size={16} />
                Add Swiss round
              </button>
            ) : null}
            {payload.format === 'groups-playoff' ? (
              <button className="secondary-button" onClick={() => persist(buildGroupPlayoff(payload))}>
                <Trophy size={16} />
                Build playoff
              </button>
            ) : null}
            <button className="primary-button" onClick={publish} disabled={!sharingEnabled}>
              <Share2 size={16} />
              {payload.slug ? 'Update database links' : 'Publish to database'}
            </button>
            {!sharingEnabled ? <p className="muted">Add a Google Apps Script URL to enable public share links.</p> : null}
          </div>
        ) : null}

        {urls?.publicUrl ? (
          <div className="share-box">
            <label>
              Public link
              <button onClick={() => copy(urls.publicUrl)}>
                <Clipboard size={14} />
              </button>
            </label>
            <code>{urls.publicUrl}</code>
            {urls.editUrl ? (
              <>
                <label>
                  Private edit link
                  <button onClick={() => copy(urls.editUrl)}>
                    <Clipboard size={14} />
                  </button>
                </label>
                <code>{urls.editUrl}</code>
              </>
            ) : null}
          </div>
        ) : null}

        {readOnly ? (
          <div className="spectator-card">
            <Eye size={18} />
            <div>
              <strong>Live spectator mode</strong>
              <p>{lastSync ? `Auto-refreshing every 10 seconds. Last checked ${lastSync}.` : 'Waiting for the latest scores.'}</p>
            </div>
          </div>
        ) : null}

        {message ? <div className="notice">{message}</div> : null}
        <StandingsTable payload={payload} />
      </aside>

      <div className="bracket-stage">
        <div className="stage-toolbar">
          <div>
            <p className="eyebrow">Live board</p>
            <h2>{readOnly ? 'Shared tournament view' : 'Score editor'}</h2>
          </div>
          <div className="stage-actions">
            <span className="pill">
              <Eye size={14} />
              {payload.slug ? 'Share link ready' : 'Publish for spectators'}
            </span>
          </div>
          <a className="ghost-link" href="./">
            <Link size={16} />
            New tournament
          </a>
        </div>

        <div className={isTrueBracket(payload.format) ? 'bracket-board bracket-visual' : 'bracket-board'}>
          {Object.entries(groupedMatches).map(([bracket, matches]) => (
            <BracketColumn
              key={bracket}
              title={bracket}
              matches={matches}
              payload={payload}
              readOnly={readOnly}
              onScore={(matchId, scoreA, scoreB) => persist(updateMatch(payload, matchId, scoreA, scoreB))}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string | number }) {
  return (
    <div className="metric">
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function BracketColumn({
  title,
  matches,
  payload,
  readOnly,
  onScore,
}: {
  title: string
  matches: Match[]
  payload: TournamentPayload
  readOnly: boolean
  onScore: (matchId: string, scoreA?: number, scoreB?: number) => void
}) {
  const rounds = groupBy(matches, (match) => String(match.round))

  return (
    <section className="bracket-column">
      <h3>{title}</h3>
      <div className="round-strip">
        {Object.entries(rounds).map(([round, roundMatches]) => (
          <div key={round} className={`round-column round-depth-${Math.min(Number(round), 5)}`} data-round={round}>
            <div className="round-label">Round {round}</div>
            {roundMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                payload={payload}
                readOnly={readOnly}
                onScore={(scoreA, scoreB) => onScore(match.id, scoreA, scoreB)}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function MatchCard({
  match,
  payload,
  readOnly,
  onScore,
}: {
  match: Match
  payload: TournamentPayload
  readOnly: boolean
  onScore: (scoreA?: number, scoreB?: number) => void
}) {
  const [scoreA, setScoreA] = useState(match.scoreA?.toString() ?? '')
  const [scoreB, setScoreB] = useState(match.scoreB?.toString() ?? '')

  useEffect(() => {
    setScoreA(match.scoreA?.toString() ?? '')
    setScoreB(match.scoreB?.toString() ?? '')
  }, [match.scoreA, match.scoreB])

  const submit = () => {
    const a = scoreA === '' ? undefined : Number(scoreA)
    const b = scoreB === '' ? undefined : Number(scoreB)
    onScore(a, b)
  }

  return (
    <article className={match.winnerId ? 'match-card decided' : 'match-card'}>
      <div className="match-meta">
        <span>{match.label}</span>
        {match.bye ? <span className="mini-pill">Bye</span> : null}
      </div>
      <ScoreRow
        name={playerName(payload.participants, match.participantAId)}
        winner={match.winnerId === match.participantAId}
        score={scoreA}
        readOnly={readOnly}
        onChange={setScoreA}
      />
      <ScoreRow
        name={playerName(payload.participants, match.participantBId)}
        winner={match.winnerId === match.participantBId}
        score={scoreB}
        readOnly={readOnly}
        onChange={setScoreB}
      />
      {!readOnly ? (
        <button className="score-button" onClick={submit} disabled={!match.participantAId || !match.participantBId}>
          <Save size={14} />
          Save and update viewers
        </button>
      ) : null}
    </article>
  )
}

function ScoreRow({
  name,
  winner,
  score,
  readOnly,
  onChange,
}: {
  name: string
  winner: boolean
  score: string
  readOnly: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className={winner ? 'score-row winner' : 'score-row'}>
      <span>{winner ? <Check size={14} /> : null}{name}</span>
      <input
        aria-label={`${name} score`}
        value={score}
        readOnly={readOnly}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function StandingsTable({ payload }: { payload: TournamentPayload }) {
  const groups = payload.format === 'groups-playoff' ? groupStandings(payload) : undefined
  const rows = standings(payload)

  return (
    <div className="standings">
      <h2>Standings</h2>
      {groups
        ? Object.entries(groups).map(([group, groupRows]) => <StandingRows key={group} title={group} rows={groupRows} payload={payload} />)
        : <StandingRows title="Overall" rows={rows} payload={payload} />}
    </div>
  )
}

function StandingRows({ title, rows, payload }: { title: string; rows: Standing[]; payload: TournamentPayload }) {
  return (
    <div className="standing-group">
      <h3>{title}</h3>
      {rows.slice(0, 12).map((row, index) => (
        <div key={row.participantId} className="standing-row">
          <span>{index + 1}</span>
          <strong>{playerName(payload.participants, row.participantId)}</strong>
          <small>{row.score} pts</small>
        </div>
      ))}
    </div>
  )
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = getKey(item)
    groups[key] = groups[key] ? [...groups[key], item] : [item]
    return groups
  }, {})
}

function isTrueBracket(format: BracketFormat) {
  return format === 'single-elimination' || format === 'double-elimination' || format === 'groups-playoff'
}

export default App
