import { useMemo, useState } from 'react'
import type { ScoresPayload } from './lib/model'
import { useScores } from './lib/useScores'
import { buildCard } from './lib/buildCard'
import {
  buildContext,
  editorialFor,
  groupSummary,
  teamStatusLine,
  type QualContext,
} from './lib/qualification'
import { dayOffset, fullLabel, relName, timeLabel } from './lib/dates'
import { MatchCard } from './components/MatchCard'

type View = 'day' | 'search' | 'group' | 'team'

interface Nav {
  openTeam: (id: string) => void
  openGroup: (id: string) => void
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

// ---------- small per-team helpers (mirror the prototype's teamNow/teamPast) ----------

function teamNow(teamId: string, p: ScoresPayload): { text: string; color: string } {
  const opp = (m: { homeId: string; home: string; away: string }) =>
    m.homeId === teamId ? m.away : m.home
  const involves = (m: { homeId: string; awayId: string }) =>
    m.homeId === teamId || m.awayId === teamId
  const live = p.matches.find((m) => m.state === 'live' && involves(m))
  if (live?.score) {
    const mine = live.homeId === teamId ? live.score.home : live.score.away
    const ops = live.homeId === teamId ? live.score.away : live.score.home
    return { text: `${mine}–${ops} vs ${opp(live)} · ${live.minute ?? 'Live'}`, color: '#8a2b22' }
  }
  const up = p.matches.find((m) => m.state === 'upcoming' && involves(m))
  if (up) return { text: `${relName(dayOffset(up.dateISO))} · ${timeLabel(up.dateISO)} vs ${opp(up)}`, color: '#9a948a' }
  const comp = p.matches.filter((m) => m.state === 'completed' && involves(m))
  const last = comp[comp.length - 1]
  if (last?.score) {
    const a = last.homeId === teamId ? last.score.home : last.score.away
    const b = last.homeId === teamId ? last.score.away : last.score.home
    const v = a > b ? 'Won' : a < b ? 'Lost' : 'Drew'
    return { text: `${v} ${a}–${b} vs ${opp(last)}`, color: '#9a948a' }
  }
  return { text: '', color: '#9a948a' }
}

function teamPast(teamId: string, ctx: QualContext): Array<{ line: string; note: string }> {
  return ctx.payload.matches
    .filter((m) => m.state === 'completed' && (m.homeId === teamId || m.awayId === teamId) && m.score)
    .map((m) => {
      const isHome = m.homeId === teamId
      const mine = isHome ? m.score!.home : m.score!.away
      const opp = isHome ? m.score!.away : m.score!.home
      const oppName = isHome ? m.away : m.home
      const v = mine > opp ? 'Beat' : mine < opp ? 'Lost to' : 'Drew with'
      return { line: `${v} ${oppName} ${mine}–${opp}`, note: editorialFor(m, ctx).whatChanges }
    })
}

// ---------- masthead ----------

function Masthead({ view, off, nav }: { view: View; off: number; nav: Nav }) {
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
            <span style={{ textDecoration: 'line-through', textDecorationColor: '#8a2b22', textDecorationThickness: 2, textUnderlineOffset: 2 }}>
              Soccer
            </span>{' '}
            <span style={{ display: 'inline-block', transform: 'rotate(-5deg)', fontStyle: 'italic', fontWeight: 600, color: '#8a2b22' }}>
              Football
            </span>{' '}
            Fans
          </span>
        </h1>
      </div>
      <p style={{ margin: '9px 0 0', font: "400 17px 'Newsreader',serif", color: '#6b6660' }}>
        Every game, translated.
      </p>
      <div style={{ height: 1, background: '#ddd7ca', margin: '22px 0 0' }} />

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, padding: '10px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span onClick={nav.prevDay} className="lk" style={stepLink}>
            ‹ {relName(off - 1)}
          </span>
          <div
            onClick={nav.goToday}
            style={{ cursor: 'pointer', textAlign: 'center', minWidth: 148, height: 38, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}
          >
            <div style={{ font: "500 15px 'Newsreader',serif", color: '#1c1a17', lineHeight: 1.05 }}>{fullLabel(off)}</div>
            <div style={{ font: "600 9px 'Instrument Sans',sans-serif", letterSpacing: '.2em', textTransform: 'uppercase', color: '#8a2b22', lineHeight: 1, minHeight: 9 }}>
              {Math.abs(off) <= 1 ? relName(off) : ''}
            </div>
          </div>
          <span onClick={nav.nextDay} className="lk" style={stepLink}>
            {relName(off + 1)} ›
          </span>
        </div>
        <span
          onClick={nav.goSearch}
          style={{
            cursor: 'pointer',
            font: "500 13px 'Instrument Sans',sans-serif",
            letterSpacing: '.04em',
            paddingBottom: 2,
            color: view === 'search' ? '#1c1a17' : '#9a948a',
            borderBottom: `2px solid ${view === 'search' ? '#8a2b22' : 'transparent'}`,
            whiteSpace: 'nowrap',
          }}
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
    .sort((a, b) => (STATE_ORDER[a.state] - STATE_ORDER[b.state]) || a.dateISO.localeCompare(b.dateISO))
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

// ---------- search ----------

export function SearchView({ ctx, query, onQuery, nav }: { ctx: QualContext; query: string; onQuery: (s: string) => void; nav: Nav }) {
  const q = query.trim().toLowerCase()
  const groups = ctx.payload.groups
    .map((g) => ({
      g,
      teams: g.table.filter((r) => !q || r.name.toLowerCase().includes(q)),
    }))
    .filter((x) => x.teams.length > 0)

  return (
    <section style={{ paddingTop: 34 }}>
      <h2 style={{ margin: '0 0 4px', font: "500 24px 'Newsreader',serif", color: '#1c1a17', letterSpacing: '-.01em' }}>Search by team</h2>
      <p style={{ margin: '0 0 18px', font: "400 15px 'Newsreader',serif", color: '#8a857d' }}>
        Pick a country to see where it stands and what its next game means.
      </p>
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
              const now = teamNow(r.teamId, ctx.payload)
              return (
                <div
                  key={r.teamId}
                  className="wc-row"
                  onClick={() => nav.openTeam(r.teamId)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '12px 8px', borderBottom: '1px solid #e6e1d6' }}
                >
                  <div>
                    <div style={{ font: "500 21px 'Newsreader',serif", color: '#1c1a17' }}>{r.name}</div>
                    <div style={{ font: "500 12px 'Instrument Sans',sans-serif", letterSpacing: '.02em', color: now.color, marginTop: 3 }}>{now.text}</div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', paddingTop: 3 }}>
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
      {q.length > 0 && groups.length === 0 && (
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
    .sort((a, b) => (STATE_ORDER[a.state] - STATE_ORDER[b.state]) || a.dateISO.localeCompare(b.dateISO))
    .map((m) => buildCard(m, ctx, nav))
  return (
    <section style={{ paddingTop: 30 }}>
      <span onClick={nav.goBack} className="lk" style={{ cursor: 'pointer', font: "500 12px 'Instrument Sans',sans-serif", letterSpacing: '.04em', color: '#8a857d' }}>
        ← {backLabel}
      </span>
      <h2 style={{ margin: '16px 0 0', font: "500 30px 'Newsreader',serif", color: '#1c1a17', letterSpacing: '-.015em' }}>{g.name}</h2>
      <p style={{ margin: '12px 0 0', font: "400 18px/1.5 'Newsreader',serif", color: '#3a3631', maxWidth: 660 }}>{groupSummary(g, ctx)}</p>

      <div style={{ height: 1, background: '#ddd7ca', margin: '28px 0 0' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: '0 16px', alignItems: 'center', fontFamily: "'Instrument Sans',sans-serif" }}>
        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid', padding: '12px 0 10px', font: "500 10px 'Instrument Sans',sans-serif", letterSpacing: '.14em', textTransform: 'uppercase', color: '#b0a99c', borderBottom: '1px solid #e6e1d6' }}>
          <span>#</span>
          <span>Team</span>
          <span style={{ textAlign: 'right' }}>GD</span>
          <span style={{ textAlign: 'right', width: 42 }}>Pts</span>
        </div>
        {g.table.map((r) => {
          const st = ctx.status.get(r.teamId)
          return (
            <div
              key={r.teamId}
              onClick={() => nav.openTeam(r.teamId)}
              className="gr-row"
              style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid', alignItems: 'center', cursor: 'pointer', padding: '14px 0', borderBottom: '1px solid #e6e1d6' }}
            >
              <span style={{ font: "500 13px 'Instrument Sans',sans-serif", color: '#b0a99c' }}>{r.rank}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ font: "500 19px 'Newsreader',serif", color: '#1c1a17' }}>{r.name}</span>
                <span style={{ font: "400 12px 'Instrument Sans',sans-serif", letterSpacing: '.02em', color: st?.tone }}>{st?.note}</span>
              </span>
              <span style={{ textAlign: 'right', font: "400 13px 'Instrument Sans',sans-serif", color: '#8a857d' }}>{r.gdLabel}</span>
              <span style={{ textAlign: 'right', width: 42, font: "500 14px 'Newsreader',serif", color: '#1c1a17' }}>{r.pts}</span>
            </div>
          )
        })}
      </div>

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
  const past = teamPast(teamId, ctx)
  return (
    <section style={{ paddingTop: 30 }}>
      <span onClick={nav.goBack} className="lk" style={{ cursor: 'pointer', font: "500 12px 'Instrument Sans',sans-serif", letterSpacing: '.04em', color: '#8a857d' }}>
        ← {backLabel}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 16 }}>
        <h2 style={{ margin: 0, font: "500 38px 'Newsreader',serif", color: '#1c1a17', letterSpacing: '-.02em' }}>{team.name}</h2>
        {team.group && (
          <span onClick={() => nav.openGroup(team.group!)} className="lkb" style={{ cursor: 'pointer', font: "500 11px 'Instrument Sans',sans-serif", letterSpacing: '.08em', textTransform: 'uppercase', color: '#9a948a', borderBottom: '1px solid #d3ccbf' }}>
            Group {team.group}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 48, marginTop: 30, alignItems: 'start' }}>
        <div>
          <div style={{ ...LBL, marginBottom: 7 }}>Current status</div>
          <p style={{ margin: '0 0 30px', font: "400 21px/1.45 'Newsreader',serif", color: '#1c1a17' }}>{teamStatusLine(teamId, ctx)}</p>

          <div style={{ ...LBL, marginBottom: 12 }}>Past matches</div>
          <div>
            {past.map((p, i) => (
              <div key={i} style={{ padding: '13px 0', borderTop: '1px solid #e6e1d6' }}>
                <div style={{ font: "500 17px 'Newsreader',serif", color: '#1c1a17' }}>{p.line}</div>
                <div style={{ font: "400 15px/1.45 'Newsreader',serif", color: '#6b6660', marginTop: 2 }}>{p.note}</div>
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

// ---------- app shell ----------

export function App() {
  const { data, error, loading } = useScores()
  const [view, setView] = useState<View>('day')
  const [dayOff, setDayOff] = useState(0)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [prev, setPrev] = useState<View>('day')

  const ctx = useMemo(() => (data ? buildContext(data) : null), [data])

  const nav: Nav = {
    openTeam: (id) => { setPrev(view); setTeamId(id); setView('team') },
    openGroup: (id) => { setPrev(view); setGroupId(id); setView('group') },
    goBack: () => setView(prev || 'day'),
    goToday: () => { setView('day'); setDayOff(0) },
    goSearch: () => setView('search'),
    prevDay: () => { setView('day'); setDayOff((o) => o - 1) },
    nextDay: () => { setView('day'); setDayOff((o) => o + 1) },
  }
  const backLabel = ({ day: 'Today', search: 'Search', group: 'Group', team: 'Back' } as Record<View, string>)[prev] || 'Today'

  return (
    <div style={{ minHeight: '100vh', background: '#f1ede4' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px 90px' }}>
        <Masthead view={view} off={dayOff} nav={nav} />

        {!ctx && loading && <p style={{ font: "400 18px 'Newsreader',serif", color: '#9a948a', paddingTop: 30 }}>Loading today’s games…</p>}
        {!ctx && !loading && error && (
          <p style={{ font: "400 18px 'Newsreader',serif", color: '#9a948a', paddingTop: 30 }}>
            Couldn’t load the scores just now. Please refresh in a moment.
          </p>
        )}

        {ctx && (
          <>
            {data && data.source !== 'espn' && (
              <p style={{ font: "400 13px 'Instrument Sans',sans-serif", color: '#b0a99c', paddingTop: 16, margin: 0 }}>
                Scores may be slightly delayed.
              </p>
            )}
            {view === 'day' && <DayView off={dayOff} ctx={ctx} nav={nav} />}
            {view === 'search' && <SearchView ctx={ctx} query={query} onQuery={setQuery} nav={nav} />}
            {view === 'group' && groupId && <GroupView groupId={groupId} ctx={ctx} backLabel={backLabel} nav={nav} />}
            {view === 'team' && teamId && <TeamView teamId={teamId} ctx={ctx} backLabel={backLabel} nav={nav} />}
          </>
        )}
      </div>
    </div>
  )
}
