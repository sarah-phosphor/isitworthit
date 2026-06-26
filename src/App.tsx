import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ScoresPayload } from './lib/model'
import { useScores } from './lib/useScores'
import { buildCard } from './lib/buildCard'
import { buildContext, groupSummary, teamNextOutlook, teamStatusLine, type QualContext } from './lib/qualification'
import { dateKey, dayOffset, fullLabel, offsetForKey, relName } from './lib/dates'
import { slugify } from './lib/search'
import { isoForTeam } from './lib/flags'
import { MatchCard } from './components/MatchCard'
import { StandingsTable } from './components/StandingsTable'
import { Flag } from './components/Flag'

type View = 'day' | 'standings' | 'group' | 'team' | 'match'

interface Nav {
  openTeam: (id: string) => void
  openGroup: (id: string) => void
  openMatch: (id: string) => void
  goToday: () => void
  goStandings: () => void
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

// ---------- masthead ----------

function Masthead({ view, off, nav, data }: { view: View; off: number; nav: Nav; data: ScoresPayload | null }) {
  const matchesActive = view === 'day' || view === 'match'
  const standingsActive = view === 'standings' || view === 'group' || view === 'team'
  const tab = (active: boolean): CSSProperties => ({
    cursor: 'pointer',
    font: "500 14px 'Instrument Sans',sans-serif",
    letterSpacing: '.03em',
    paddingBottom: 5,
    color: active ? '#1c1a17' : '#8a857d',
    borderBottom: `2px solid ${active ? '#8a2b22' : 'transparent'}`,
  })
  const stepLink = {
    cursor: 'pointer',
    font: "500 13px 'Instrument Sans',sans-serif",
    letterSpacing: '.03em',
    color: '#6b6660',
    whiteSpace: 'nowrap' as const,
  }
  return (
    <header style={{ padding: '38px 0 0' }}>
      {/* minimal intro — no links here; navigation is the tabs below (R4-3) */}
      <h1 style={{ margin: 0, font: "500 28px/1.1 'Newsreader',serif", letterSpacing: '-.015em', color: '#1c1a17' }}>Does it matter?</h1>
      <p style={{ margin: '6px 0 0', font: "400 15px 'Newsreader',serif", color: '#6b6660' }}>World Cup stakes, explained normally.</p>
      <div style={{ height: 1, background: '#ddd7ca', margin: '16px 0 0' }} />

      {/* persistent tabs — identical on every page (item 3) */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '9px 0' }}>
        <span onClick={nav.goToday} style={tab(matchesActive)}>Matches</span>
        <span onClick={nav.goStandings} style={tab(standingsActive)}>Standings</span>
      </nav>
      <div style={{ height: 1, background: '#ddd7ca' }} />

      {/* Matches view only: date stepper centered, "Updated X ago" right (item 3) */}
      {view === 'day' && (
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0 0' }}>
          <div style={{ flex: '1 1 0', minWidth: 0 }} />
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 24 }}>
            <span onClick={nav.prevDay} className="lk" style={stepLink}>‹ {relName(off - 1)}</span>
            <div onClick={nav.goToday} style={{ cursor: 'pointer', textAlign: 'center', minWidth: 148, height: 38, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
              <div style={{ font: "500 15px 'Newsreader',serif", color: '#1c1a17', lineHeight: 1.05 }}>{fullLabel(off)}</div>
              <div style={{ font: "600 9px 'Instrument Sans',sans-serif", letterSpacing: '.2em', textTransform: 'uppercase', color: '#8a2b22', lineHeight: 1, minHeight: 9 }}>
                {Math.abs(off) <= 1 ? relName(off) : ''}
              </div>
            </div>
            <span onClick={nav.nextDay} className="lk" style={stepLink}>{relName(off + 1)} ›</span>
          </div>
          <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
            {data && <Freshness data={data} />}
          </div>
        </nav>
      )}
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

// ---------- standings (the grouped A–L grid; every team is listed + clickable) ----------

export function StandingsView({ ctx, nav }: { ctx: QualContext; nav: Nav }) {
  return (
    <section style={{ paddingTop: 30 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '36px 48px' }}>
        {ctx.payload.groups.map((g) => (
          <div key={g.id}>
            <h3
              onClick={() => nav.openGroup(g.id)}
              className="lk"
              style={{ cursor: 'pointer', margin: 0, paddingBottom: 9, borderBottom: '2px solid #c9c1b2', font: "600 16px 'Newsreader',serif", letterSpacing: '.1em', textTransform: 'uppercase', color: '#1c1a17' }}
            >
              {g.name}
            </h3>
            {g.table.map((r) => {
              const st = ctx.status.get(r.teamId)
              const out = st?.status === 'out'
              return (
                <div
                  key={r.teamId}
                  className="wc-row"
                  onClick={() => nav.openTeam(r.teamId)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 8px', borderBottom: '1px solid #e6e1d6', opacity: out ? 0.55 : 1 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <Flag iso={isoForTeam(ctx.payload.teams[r.teamId])} h={18} />
                    <span style={{ font: "500 19px 'Newsreader',serif", color: '#1c1a17' }}>{r.name}</span>
                  </div>
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
    </section>
  )
}

// ---------- group ----------

export function GroupView({ groupId, ctx, nav }: { groupId: string; ctx: QualContext; nav: Nav }) {
  const g = ctx.groupById.get(groupId)
  if (!g) return null
  const cards = ctx.payload.matches
    .filter((m) => m.group === groupId)
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.dateISO.localeCompare(b.dateISO))
    .map((m) => buildCard(m, ctx, nav))
  return (
    <section style={{ paddingTop: 34 }}>
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

export function TeamView({ teamId, ctx, nav }: { teamId: string; ctx: QualContext; nav: Nav }) {
  const team = ctx.payload.teams[teamId]
  if (!team) return null
  const next = ctx.payload.matches.find((m) => (m.state === 'upcoming' || m.state === 'live') && (m.homeId === teamId || m.awayId === teamId))
  const past = teamPast(teamId, ctx.payload)
  return (
    <section style={{ paddingTop: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Flag iso={isoForTeam(team)} h={30} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <h2 style={{ margin: 0, font: "500 40px 'Newsreader',serif", color: '#1c1a17', letterSpacing: '-.02em' }}>{team.name}</h2>
          {team.group && (
            <span onClick={() => nav.openGroup(team.group!)} className="lkb" style={{ cursor: 'pointer', font: "500 11px 'Instrument Sans',sans-serif", letterSpacing: '.08em', textTransform: 'uppercase', color: '#9a948a', borderBottom: '1px solid #d3ccbf' }}>
              Group {team.group}
            </span>
          )}
        </div>
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
          <div style={{ ...LBL, marginBottom: 12 }}>{next ? 'Next match' : 'What’s next'}</div>
          {next ? (
            <MatchCard card={buildCard(next, ctx, nav)} />
          ) : (
            (() => {
              const o = teamNextOutlook(teamId, ctx)
              const color = o.tone === 'through' ? '#1c1a17' : o.tone === 'out' ? '#9a948a' : '#3a3631'
              return <p style={{ margin: 0, font: "400 17px/1.5 'Newsreader',serif", color }}>{o.line}</p>
            })()
          )}
        </div>
      </div>
    </section>
  )
}

// ---------- match ----------

export function MatchView({ matchId, ctx, nav }: { matchId: string; ctx: QualContext; nav: Nav }) {
  const match = ctx.payload.matches.find((m) => m.id === matchId)
  if (!match) return null
  const card = buildCard(match, ctx, nav)
  const group = match.group ? ctx.groupById.get(match.group) : undefined
  return (
    <section style={{ paddingTop: 34 }}>
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

// ---------- data freshness (R2-6) ----------

function relTimeAgo(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const sec = Math.max(0, Math.round((nowMs - t) / 1000))
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hr${hr === 1 ? '' : 's'} ago`
  const d = Math.round(hr / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

// "Updated X ago", re-derived as the page polls (and on a local 30s tick so the
// label keeps climbing when a poll fails). Surfaces the fallback states too.
function Freshness({ data }: { data: ScoresPayload }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const rel = relTimeAgo(data.generatedAt, now)
  const saved = data.stale || data.source === 'cache'
  const delayed = data.source === 'openfootball'
  const label = saved
    ? `Showing saved scores${rel ? ` · last updated ${rel}` : ''}`
    : delayed
      ? `Live scores may lag${rel ? ` · updated ${rel}` : ''}`
      : rel
        ? `Updated ${rel}`
        : ''
  if (!label) return null
  // lives in the masthead nav-left now (R3-5); darker than before so it reads (R3-6)
  return (
    <span style={{ font: "400 12.5px 'Newsreader',serif", letterSpacing: '.01em', whiteSpace: 'nowrap', color: saved || delayed ? '#8a2b22' : '#8a857d' }}>
      {label}
    </span>
  )
}

// Explicit GA4 page_view on client-side route changes (the SPA navigates via the
// History API; the initial load is already counted by gtag('config') in
// index.html). NOTE: GA4 enhanced measurement may also auto-track History
// changes — see the R4 flag re: possible double-count.
function trackPageView(path: string) {
  if (typeof window === 'undefined') return
  const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
  if (typeof g === 'function') {
    g('event', 'page_view', { page_path: path, page_location: window.location.href, page_title: document.title })
  }
}

// ---------- app shell ----------

export function App() {
  const { data, error, loading } = useScores()
  const [view, setView] = useState<View>('day')
  const [dayOff, setDayOff] = useState(0)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [matchId, setMatchId] = useState<string | null>(null)
  const inited = useRef(false)

  const ctx = useMemo(() => (data ? buildContext(data) : null), [data])

  function applyPath(path: string) {
    const [a, b] = path.split('/').filter(Boolean)
    if (a === 'standings') return setView('standings')
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
    const onPop = () => {
      applyPath(window.location.pathname)
      trackPageView(window.location.pathname)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const push = (p: string) => {
    window.history.pushState({}, '', p)
    trackPageView(p)
  }
  const navTo = (updater: () => void, path: string) => {
    updater()
    push(path)
  }

  const nav: Nav = {
    openTeam: (id) => navTo(() => { setTeamId(id); setView('team') }, `/team/${slugify(data?.teams[id]?.name ?? id)}`),
    openGroup: (id) => navTo(() => { setGroupId(id); setView('group') }, `/group/${id.toLowerCase()}`),
    openMatch: (id) => navTo(() => { setMatchId(id); setView('match') }, `/match/${id}`),
    goToday: () => navTo(() => { setView('day'); setDayOff(0) }, '/'),
    goStandings: () => navTo(() => setView('standings'), '/standings'),
    prevDay: () => { const n = dayOff - 1; navTo(() => { setView('day'); setDayOff(n) }, n === 0 ? '/' : `/day/${dateKey(n)}`) },
    nextDay: () => { const n = dayOff + 1; navTo(() => { setView('day'); setDayOff(n) }, n === 0 ? '/' : `/day/${dateKey(n)}`) },
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1ede4' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px 90px' }}>
        <Masthead view={view} off={dayOff} nav={nav} data={data} />

        {!ctx && loading && <p style={{ font: "400 18px 'Newsreader',serif", color: '#9a948a', paddingTop: 30 }}>Loading today’s games…</p>}
        {!ctx && !loading && error && (
          <p style={{ font: "400 18px 'Newsreader',serif", color: '#9a948a', paddingTop: 30 }}>Couldn’t load the scores just now. Please refresh in a moment.</p>
        )}

        {ctx && (
          <>
            {view === 'day' && <DayView off={dayOff} ctx={ctx} nav={nav} />}
            {view === 'standings' && <StandingsView ctx={ctx} nav={nav} />}
            {view === 'group' && groupId && <GroupView groupId={groupId} ctx={ctx} nav={nav} />}
            {view === 'team' && teamId && <TeamView teamId={teamId} ctx={ctx} nav={nav} />}
            {view === 'match' && matchId && <MatchView matchId={matchId} ctx={ctx} nav={nav} />}
          </>
        )}
      </div>
    </div>
  )
}
