import { useEffect, useMemo, useRef, useState } from 'react'
import type { ScoresPayload } from './lib/model'
import { useScores } from './lib/useScores'
import { buildCard } from './lib/buildCard'
import { buildContext, groupSummary, teamStatusLine, type QualContext } from './lib/qualification'
import { dateKey, dayOffset, fullLabel, offsetForKey, relName } from './lib/dates'
import { slugify, teamMatchesQuery } from './lib/search'
import { MatchCard } from './components/MatchCard'
import { StandingsTable } from './components/StandingsTable'

type View = 'day' | 'search' | 'group' | 'team' | 'match'

interface Nav {
  openTeam: (id: string) => void
  openGroup: (id: string) => void
  openMatch: (id: string) => void
  goBack: () => void
  goToday: () => void
  goSearch: () => void
  prevDay: () => void
  nextDay: () => void
}

const STATE_ORDER: Record<string, number> = { live: 0, upcoming: 1, completed: 2 }
const LBL = {
  font: "500 11px 'Instrument Sans',sans-serif",
  letterSpacing: '.12em',
  textTransform: 'uppercase' as const,
  color: '#8a857d',
}

// completed games a team has played, most recent first → just the result line
function teamPast(teamId: string, p: ScoresPayload): string[] {
  return p.matches
    .filter((m) => m.state === 'completed' && (m.homeId === teamId || m.awayId === teamId) && m.score)
    .map((m) => {
      const isHome = m.homeId === teamId
      const mine = isHome ? m.score!.home : m.score!.away
      const opp = isHome ? m.score!.away : m.score!.home
      const oppName = isHome ? m.away : m.home
      const verb = mine > opp ? 'Beat' : mine < opp ? 'Lost to' : 'Drew with'
      return `${verb} ${oppName} ${mine}–${opp}`
    })
}

// ---------- shared bits ----------

function BackLink({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <span
      onClick={onBack}
      className="lk"
      style={{ cursor: 'pointer', display: 'inline-block', font: "500 13px 'Instrument Sans',sans-serif", letterSpacing: '.04em', color: '#8a857d', marginBottom: 24 }}
    >
      ← {label}
    </span>
  )
}

// ---------- masthead ----------

function Masthead({ showStepper, off, searchActive, nav }: { showStepper: boolean; off: number; searchActive: boolean; nav: Nav }) {
  const stepLink = {
    cursor: 'pointer',
    font: "500 13px 'Instrument Sans',sans-serif",
    letterSpacing: '.03em',
    color: '#6b6660',
    whiteSpace: 'nowrap' as const,
  }
  return (
    <header style={{ padding: '42px 0 0' }}>
      <div onClick={nav.goToday} style={{ cursor: 'pointer', display: 'inline-block' }}>
        <h1 style={{ margin: 0, font: "500 33px/1.04 'Newsreader',serif", letterSpacing: '-.015em', color: '#1c1a17' }}>
          World Cup{' '}
          <span style={{ fontStyle: 'italic', fontWeight: 400, color: '#6b6660' }}>
            for Non-
            <span style={{ textDecoration: 'line-through', textDecorationColor: '#8a2b22', textDecorationThickness: 2, textUnderlineOffset: 2 }}>Soccer</span>{' '}
            <span style={{ display: 'inline-block', transform: 'rotate(-5deg)', fontStyle: 'italic', fontWeight: 600, color: '#8a2b22' }}>Football</span>{' '}
            Fans
          </span>
        </h1>
      </div>
      <p style={{ margin: '9px 0 0', font: "400 17px 'Newsreader',serif", color: '#6b6660' }}>Every game, translated.</p>
      <div style={{ height: 1, background: '#ddd7ca', margin: '22px 0 0' }} />

      <nav style={{ display: 'flex', justifyContent: showStepper ? 'space-between' : 'flex-end', alignItems: 'center', gap: 20, padding: '10px 0' }}>
        {showStepper && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <span onClick={nav.prevDay} className="lk" style={stepLink}>‹ {relName(off - 1)}</span>
            <div onClick={nav.goToday} style={{ cursor: 'pointer', textAlign: 'center', minWidth: 148, height: 38, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
              <div style={{ font: "500 15px 'Newsreader',serif", color: '#1c1a17', lineHeight: 1.05 }}>{fullLabel(off)}</div>
              <div style={{ font: "600 9px 'Instrument Sans',sans-serif", letterSpacing: '.2em', textTransform: 'uppercase', color: '#8a2b22', lineHeight: 1, minHeight: 9 }}>
                {Math.abs(off) <= 1 ? relName(off) : ''}
              </div>
            </div>
            <span onClick={nav.nextDay} className="lk" style={stepLink}>{relName(off + 1)} ›</span>
          </div>
        )}
        <span
          onClick={nav.goSearch}
          style={{ cursor: 'pointer', font: "500 13px 'Instrument Sans',sans-serif", letterSpacing: '.04em', paddingBottom: 2, color: searchActive ? '#1c1a17' : '#9a948a', borderBottom: `2px solid ${searchActive ? '#8a2b22' : 'transparent'}`, whiteSpace: 'nowrap' }}
        >
          Search by team
        </span>
      </nav>
      <div style={{ height: 1, background: '#ddd7ca' }} />
    </header>
  )
}

// ---------- day ----------

export function DayView({ off, ctx, nav }: { off: number; ctx: QualContext; nav: Nav }) {
  const cards = ctx.payload.matches
    .filter((m) => dayOffset(m.dateISO) === off)
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.dateISO.localeCompare(b.dateISO))
    .map((m) => buildCard(m, ctx, nav))
  return (
    <section style={{ paddingTop: 30 }}>
      <div className="wc-cards">
        {cards.map((c) => (
          <MatchCard key={c.id} card={c} />
        ))}
      </div>
      {cards.length === 0 && (
        <p style={{ font: "400 18px 'Newsreader',serif", color: '#9a948a', paddingTop: 8 }}>No games scheduled this day.</p>
      )}
    </section>
  )
}

// ---------- search (standings view) ----------

export function SearchView({ ctx, query, onQuery, nav }: { ctx: QualContext; query: string; onQuery: (s: string) => void; nav: Nav }) {
  const groups = ctx.payload.groups
    .map((g) => ({ g, teams: g.table.filter((r) => teamMatchesQuery(r.name, ctx.payload.teams[r.teamId]?.short, query)) }))
    .filter((x) => x.teams.length > 0)

  return (
    <section style={{ paddingTop: 34 }}>
      <h2 style={{ margin: '0 0 4px', font: "500 24px 'Newsreader',serif", color: '#1c1a17', letterSpacing: '-.01em' }}>Search by team</h2>
      <p style={{ margin: '0 0 18px', font: "400 15px 'Newsreader',serif", color: '#8a857d' }}>Pick a country to see where it stands and what its next game means.</p>
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Type a country — France, USA, Argentina, Japan…"
        style={{ width: '100%', maxWidth: 620, display: 'block', font: "400 18px 'Newsreader',serif", color: '#1c1a17', background: '#f8f6f0', border: '1px solid #ddd7ca', padding: '14px 16px', outline: 'none' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '36px 48px', marginTop: 36 }}>
        {groups.map(({ g, teams }) => (
          <div key={g.id}>
            <h3
              onClick={() => nav.openGroup(g.id)}
              className="lk"
              style={{ cursor: 'pointer', margin: 0, paddingBottom: 11, borderBottom: '1px solid #d3ccbf', font: "500 12px 'Instrument Sans',sans-serif", letterSpacing: '.14em', textTransform: 'uppercase', color: '#8a857d' }}
            >
              {g.name}
            </h3>
            {teams.map((r) => {
              const st = ctx.status.get(r.teamId)
              return (
                <div
                  key={r.teamId}
                  className="wc-row"
                  onClick={() => nav.openTeam(r.teamId)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 8px', borderBottom: '1px solid #e6e1d6' }}
                >
                  <div style={{ font: "500 21px 'Newsreader',serif", color: '#1c1a17' }}>{r.name}</div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ font: "500 15px 'Newsreader',serif", color: '#1c1a17' }}>
                      {r.pts} <span style={{ fontSize: 11, color: '#9a948a' }}>pts</span>
                    </div>
                    <div style={{ font: "500 11px 'Instrument Sans',sans-serif", letterSpacing: '.04em', color: st?.tone, marginTop: 2 }}>{st?.note}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {query.trim().length > 0 && groups.length === 0 && (
        <p style={{ font: "400 16px 'Newsreader',serif", color: '#9a948a', padding: '24px 2px' }}>No team by that name in this tournament.</p>
      )}
    </section>
  )
}

// ---------- group ----------

export function GroupView({ groupId, ctx, backLabel, nav }: { groupId: string; ctx: QualContext; backLabel: string; nav: Nav }) {
  const g = ctx.groupById.get(groupId)
  if (!g) return null
  const cards = ctx.payload.matches
    .filter((m) => m.group === groupId)
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.dateISO.localeCompare(b.dateISO))
    .map((m) => buildCard(m, ctx, nav))
  return (
    <section style={{ paddingTop: 34 }}>
      <BackLink label={backLabel} onBack={nav.goBack} />
      <h2 style={{ margin: 0, font: "500 30px 'Newsreader',serif", color: '#1c1a17', letterSpacing: '-.015em' }}>{g.name}</h2>
      <p style={{ margin: '12px 0 0', font: "400 18px/1.5 'Newsreader',serif", color: '#3a3631', maxWidth: 660 }}>{groupSummary(g, ctx)}</p>

      <div style={{ height: 1, background: '#ddd7ca', margin: '28px 0 0' }} />
      <StandingsTable group={g} ctx={ctx} onOpenTeam={nav.openTeam} />

      <h3 style={{ margin: '34px 0 18px', font: "500 13px 'Instrument Sans',sans-serif", letterSpacing: '.14em', textTransform: 'uppercase', color: '#8a857d' }}>Matches</h3>
      <div className="wc-cards">
        {cards.map((c) => (
          <MatchCard key={c.id} card={c} />
        ))}
      </div>
    </section>
  )
}

// ---------- team ----------

export function TeamView({ teamId, ctx, backLabel, nav }: { teamId: string; ctx: QualContext; backLabel: string; nav: Nav }) {
  const team = ctx.payload.teams[teamId]
  if (!team) return null
  const next = ctx.payload.matches.find((m) => (m.state === 'upcoming' || m.state === 'live') && (m.homeId === teamId || m.awayId === teamId))
  const past = teamPast(teamId, ctx.payload)
  return (
    <section style={{ paddingTop: 34 }}>
      <BackLink label={backLabel} onBack={nav.goBack} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <h2 style={{ margin: 0, font: "500 40px 'Newsreader',serif", color: '#1c1a17', letterSpacing: '-.02em' }}>{team.name}</h2>
        {team.group && (
          <span onClick={() => nav.openGroup(team.group!)} className="lkb" style={{ cursor: 'pointer', font: "500 11px 'Instrument Sans',sans-serif", letterSpacing: '.08em', textTransform: 'uppercase', color: '#9a948a', borderBottom: '1px solid #d3ccbf' }}>
            Group {team.group}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 48, marginTop: 32, alignItems: 'start' }}>
        <div>
          <div style={{ ...LBL, marginBottom: 7 }}>Current status</div>
          <p style={{ margin: '0 0 30px', font: "400 21px/1.45 'Newsreader',serif", color: '#1c1a17' }}>{teamStatusLine(teamId, ctx)}</p>

          <div style={{ ...LBL, marginBottom: 4 }}>Past matches</div>
          <div>
            {past.map((line, i) => (
              <div key={i} style={{ padding: '12px 0', borderTop: '1px solid #e6e1d6', font: "500 17px 'Newsreader',serif", color: '#1c1a17' }}>
                {line}
              </div>
            ))}
            {past.length === 0 && <p style={{ font: "400 15px 'Newsreader',serif", color: '#9a948a' }}>No games played yet.</p>}
          </div>
        </div>

        <div>
          <div style={{ ...LBL, marginBottom: 12 }}>Next match</div>
          {next ? (
            <MatchCard card={buildCard(next, ctx, nav)} />
          ) : (
            <p style={{ margin: 0, font: "400 17px 'Newsreader',serif", color: '#9a948a' }}>No upcoming games — this team’s tournament is over for now.</p>
          )}
        </div>
      </div>
    </section>
  )
}

// ---------- match ----------

export function MatchView({ matchId, ctx, backLabel, nav }: { matchId: string; ctx: QualContext; backLabel: string; nav: Nav }) {
  const match = ctx.payload.matches.find((m) => m.id === matchId)
  if (!match) return null
  const card = buildCard(match, ctx, nav)
  const group = match.group ? ctx.groupById.get(match.group) : undefined
  return (
    <section style={{ paddingTop: 34 }}>
      <BackLink label={backLabel} onBack={nav.goBack} />
      {group ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,440px) 1fr', gap: 48, alignItems: 'start' }}>
          <MatchCard card={card} linkToMatch={false} />
          <div>
            <h3 onClick={() => nav.openGroup(group.id)} className="lk" style={{ cursor: 'pointer', margin: '0 0 6px', font: "500 13px 'Instrument Sans',sans-serif", letterSpacing: '.14em', textTransform: 'uppercase', color: '#8a857d' }}>
              {group.name}
            </h3>
            <p style={{ margin: '0 0 18px', font: "400 16px/1.5 'Newsreader',serif", color: '#3a3631' }}>{groupSummary(group, ctx)}</p>
            <StandingsTable group={group} ctx={ctx} onOpenTeam={nav.openTeam} />
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 440 }}>
          <MatchCard card={card} linkToMatch={false} />
        </div>
      )}
    </section>
  )
}

// ---------- app shell ----------

export function App() {
  const { data, error, loading } = useScores()
  const [view, setView] = useState<View>('day')
  const [dayOff, setDayOff] = useState(0)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const prevPath = useRef<string | undefined>(undefined)
  const inited = useRef(false)

  const ctx = useMemo(() => (data ? buildContext(data) : null), [data])

  function applyPath(path: string) {
    const [a, b] = path.split('/').filter(Boolean)
    if (a === 'search') return setView('search')
    if (a === 'group' && b) {
      setGroupId(b.toUpperCase())
      return setView('group')
    }
    if (a === 'match' && b) {
      setMatchId(b)
      return setView('match')
    }
    if (a === 'team' && b && data) {
      const t = Object.values(data.teams).find((x) => slugify(x.name) === b)
      if (t) {
        setTeamId(t.id)
        return setView('team')
      }
    }
    if (a === 'day' && b) {
      setDayOff(offsetForKey(b))
      return setView('day')
    }
    setView('day')
    setDayOff(0)
  }

  // resolve the initial URL once data is ready (handles deep links + refresh)
  useEffect(() => {
    if (!data || inited.current) return
    inited.current = true
    applyPath(window.location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // browser back/forward
  useEffect(() => {
    const onPop = () => applyPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const push = (p: string) => window.history.pushState({}, '', p)
  const navTo = (updater: () => void, path: string) => {
    prevPath.current = window.location.pathname
    updater()
    push(path)
  }
  const parentPath = (): string => {
    if (view === 'team' && teamId) {
      const g = data?.teams[teamId]?.group
      return g ? `/group/${g.toLowerCase()}` : '/'
    }
    if (view === 'match' && matchId) {
      const g = data?.matches.find((m) => m.id === matchId)?.group
      return g ? `/group/${g.toLowerCase()}` : '/'
    }
    return '/'
  }

  const nav: Nav = {
    openTeam: (id) => navTo(() => { setTeamId(id); setView('team') }, `/team/${slugify(data?.teams[id]?.name ?? id)}`),
    openGroup: (id) => navTo(() => { setGroupId(id); setView('group') }, `/group/${id.toLowerCase()}`),
    openMatch: (id) => navTo(() => { setMatchId(id); setView('match') }, `/match/${id}`),
    goToday: () => navTo(() => { setView('day'); setDayOff(0) }, '/'),
    goSearch: () => navTo(() => setView('search'), '/search'),
    prevDay: () => { const n = dayOff - 1; navTo(() => { setView('day'); setDayOff(n) }, n === 0 ? '/' : `/day/${dateKey(n)}`) },
    nextDay: () => { const n = dayOff + 1; navTo(() => { setView('day'); setDayOff(n) }, n === 0 ? '/' : `/day/${dateKey(n)}`) },
    goBack: () => {
      const target = prevPath.current ?? parentPath()
      prevPath.current = undefined
      push(target)
      applyPath(target)
    },
  }

  const backTarget = prevPath.current ?? parentPath()
  const backLabel = backTarget.startsWith('/group/')
    ? `Group ${backTarget.split('/')[2]?.toUpperCase() ?? ''}`.trim()
    : backTarget === '/search'
      ? 'Search'
      : backTarget.startsWith('/team/')
        ? 'Back'
        : 'Today'

  return (
    <div style={{ minHeight: '100vh', background: '#f1ede4' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px 90px' }}>
        <Masthead showStepper={view === 'day'} off={dayOff} searchActive={view === 'search'} nav={nav} />

        {!ctx && loading && <p style={{ font: "400 18px 'Newsreader',serif", color: '#9a948a', paddingTop: 30 }}>Loading today’s games…</p>}
        {!ctx && !loading && error && (
          <p style={{ font: "400 18px 'Newsreader',serif", color: '#9a948a', paddingTop: 30 }}>Couldn’t load the scores just now. Please refresh in a moment.</p>
        )}

        {ctx && (
          <>
            {data && data.source !== 'espn' && (
              <p style={{ font: "400 13px 'Instrument Sans',sans-serif", color: '#b0a99c', paddingTop: 16, margin: 0 }}>Scores may be slightly delayed.</p>
            )}
            {view === 'day' && <DayView off={dayOff} ctx={ctx} nav={nav} />}
            {view === 'search' && <SearchView ctx={ctx} query={query} onQuery={setQuery} nav={nav} />}
            {view === 'group' && groupId && <GroupView groupId={groupId} ctx={ctx} backLabel={backLabel} nav={nav} />}
            {view === 'team' && teamId && <TeamView teamId={teamId} ctx={ctx} backLabel={backLabel} nav={nav} />}
            {view === 'match' && matchId && <MatchView matchId={matchId} ctx={ctx} backLabel={backLabel} nav={nav} />}
          </>
        )}
      </div>
    </div>
  )
}
