import type { Group } from '../lib/model'
import type { QualContext } from '../lib/qualification'
import { isoForTeam } from '../lib/flags'
import { Flag } from './Flag'

// The grouped A–L standings grid. Shared by the group page and the match page.
// One typeface — Newsreader — to match the cards (R2-1); hierarchy via size/weight/color.
// Flags carry the color; status stays plain text; eliminated rows fade back (R3).
export function StandingsTable({
  group,
  ctx,
  onOpenTeam,
}: {
  group: Group
  ctx: QualContext
  onOpenTeam: (id: string) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: '0 16px', alignItems: 'center', fontFamily: "'Newsreader',serif" }}>
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid', padding: '12px 0 10px', font: "600 11px 'Newsreader',serif", letterSpacing: '.14em', textTransform: 'uppercase', color: '#b0a99c', borderBottom: '1px solid #e6e1d6' }}>
        <span>#</span>
        <span>Team</span>
        <span style={{ textAlign: 'right' }}>GD</span>
        <span style={{ textAlign: 'right', width: 42 }}>Pts</span>
      </div>
      {group.table.map((r) => {
        const st = ctx.status.get(r.teamId)
        const out = st?.status === 'out'
        return (
          <div
            key={r.teamId}
            onClick={() => onOpenTeam(r.teamId)}
            className="gr-row"
            style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid', alignItems: 'center', cursor: 'pointer', padding: '14px 0', borderBottom: '1px solid #e6e1d6', opacity: out ? 0.55 : 1 }}
          >
            <span style={{ font: "500 13px 'Newsreader',serif", color: '#b0a99c' }}>{r.rank}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Flag iso={isoForTeam(ctx.payload.teams[r.teamId])} h={18} />
              <span style={{ font: "500 19px 'Newsreader',serif", color: '#1c1a17' }}>{r.name}</span>
              <span style={{ font: "400 13px 'Newsreader',serif", color: st?.tone }}>{st?.note}</span>
            </span>
            <span style={{ textAlign: 'right', font: "400 13px 'Newsreader',serif", color: '#8a857d' }}>{r.gdLabel}</span>
            <span style={{ textAlign: 'right', width: 42, font: "500 14px 'Newsreader',serif", color: '#1c1a17' }}>{r.pts}</span>
          </div>
        )
      })}
    </div>
  )
}
