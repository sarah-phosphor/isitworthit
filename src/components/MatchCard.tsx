import type { CSSProperties } from 'react'
import type { CardVM, Chance, GlossVM } from '../lib/buildCard'

// One typeface — Newsreader. Hierarchy is built from size / weight / caps / color,
// not a second family. (R2-1)
const LBL: CSSProperties = {
  font: "600 11px 'Newsreader',serif",
  letterSpacing: '.13em',
  textTransform: 'uppercase',
  color: '#8a857d',
}
// State chip (UPCOMING / FINAL) — same caption treatment, a touch darker.
const STATE: CSSProperties = {
  font: "600 11px 'Newsreader',serif",
  letterSpacing: '.13em',
  textTransform: 'uppercase',
  color: '#6b6660',
  marginBottom: 15,
}
const BODY: CSSProperties = { font: "400 16px/1.5 'Newsreader',serif", color: '#3a3631' }
const SECTION = 16 // uniform gap between the three verdict blocks (R2-5)

function GlossLine({ g, style }: { g: GlossVM; style: CSSProperties }) {
  if (g.noTip) return <div style={style}>{g.text}</div>
  return (
    <div style={style}>
      {g.pre}
      <span className="mc-tip">
        <span style={{ borderBottom: '1px dotted #9a948a', cursor: 'help' }}>{g.term}</span>
        <span className="mc-pop">
          <span
            style={{
              display: 'block',
              background: '#1c1a17',
              color: '#f1ede4',
              padding: '11px 13px',
              font: "400 13px/1.5 'Newsreader',serif",
              boxShadow: '0 8px 22px rgba(0,0,0,.24)',
            }}
          >
            {g.tip}
          </span>
        </span>
      </span>
      {g.post}
    </div>
  )
}

function Bar({ chances }: { chances: Chance[] }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 2, height: 7, overflow: 'hidden' }}>
        {chances.map((c, i) => (
          <div key={i} style={{ height: 7, background: c.color, width: `${c.pct}%` }} />
        ))}
      </div>
      {/* reserve ~2 lines so the bar keeps a fixed offset from the card bottom and
          the bars line up across a row even when a legend wraps (R2-3) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8, minHeight: 34 }}>
        {chances.map((c, i) => (
          <span
            key={i}
            style={{
              font: "500 13px 'Newsreader',serif",
              color: c.legendColor,
              fontWeight: c.legendWeight,
            }}
          >
            {c.legendMark}
            {c.label} {c.pct}%
          </span>
        ))}
      </div>
    </>
  )
}

export function MatchCard({ card, linkToMatch = true }: { card: CardVM; linkToMatch?: boolean }) {
  return (
    <article
      onClick={linkToMatch ? card.openMatch : undefined}
      className={linkToMatch ? 'mc-clickable' : undefined}
      style={{
        background: '#f8f6f0',
        border: '1px solid #e6e1d6',
        boxShadow: '0 1px 3px rgba(0,0,0,.07)',
        padding: '26px 28px 24px',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Newsreader',serif",
        cursor: linkToMatch ? 'pointer' : 'default',
      }}
    >
      {/* state label */}
      {card.isLive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15 }}>
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#8a2b22',
              animation: 'livepulse 1.6s ease-in-out infinite',
            }}
          />
          <span
            style={{
              font: "600 11px 'Newsreader',serif",
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: '#8a2b22',
            }}
          >
            {card.liveMinute}
          </span>
        </div>
      )}
      {card.isUpcoming && <div style={STATE}>Upcoming</div>}
      {card.isCompleted && <div style={STATE}>Final</div>}

      {/* matchup + score */}
      <div>
        <h3
          style={{
            margin: 0,
            font: "500 27px/1.12 'Newsreader',serif",
            letterSpacing: '-.01em',
            color: '#1c1a17',
          }}
        >
          <span
            onClick={(e) => {
              e.stopPropagation()
              card.openHome()
            }}
            className={card.homeClickable ? 'lk' : undefined}
            style={{ cursor: card.homeClickable ? 'pointer' : 'default' }}
          >
            {card.homeName}
          </span>
          <span style={{ fontStyle: 'italic', fontWeight: 400, color: '#b0a99c' }}> vs </span>
          <span
            onClick={(e) => {
              e.stopPropagation()
              card.openAway()
            }}
            className={card.awayClickable ? 'lk' : undefined}
            style={{ cursor: card.awayClickable ? 'pointer' : 'default' }}
          >
            {card.awayName}
          </span>
        </h3>
        {card.hasScore && (
          <div style={{ marginTop: 10, font: "500 19px 'Newsreader',serif", color: '#1c1a17' }}>
            {card.scoreStrip}
          </div>
        )}
      </div>

      {/* meta: group (clickable) + tail */}
      <div style={{ marginTop: 7, font: "400 13px 'Newsreader',serif", color: '#8a857d' }}>
        <span
          onClick={(e) => {
            e.stopPropagation()
            card.openGroup()
          }}
          className={card.groupClickable ? 'lkb' : undefined}
          style={{
            cursor: card.groupClickable ? 'pointer' : 'default',
            borderBottom: '1px solid #d3ccbf',
            paddingBottom: 1,
          }}
        >
          {card.groupLabel}
        </span>
        {card.metaTail}
      </div>
      {card.venue && (
        <div style={{ marginTop: 4, font: "italic 400 13px 'Newsreader',serif", color: '#9a948a' }}>
          {card.venue}
        </div>
      )}

      <div style={{ height: 1, background: '#e6e1d6', margin: '18px 0 16px' }} />

      {/* does it matter (stacked, like the other two — R2-5) */}
      <div style={{ marginBottom: SECTION }}>
        <div style={{ ...LBL, marginBottom: 5 }}>{card.matterLabel}</div>
        <div style={{ font: "600 18px 'Newsreader',serif", color: card.matterColor }}>{card.matters}</div>
      </div>

      {/* what changes */}
      <div style={{ marginBottom: SECTION }}>
        <div style={{ ...LBL, marginBottom: 5 }}>{card.changeLabel}</div>
        <div style={{ font: "500 19px/1.38 'Newsreader',serif", color: '#1c1a17' }}>{card.whatChanges}</div>
      </div>

      {/* why */}
      <div style={{ marginBottom: SECTION }}>
        <div style={{ ...LBL, marginBottom: 5 }}>Why?</div>
        <GlossLine g={card.whyGloss} style={BODY} />
      </div>

      {/* upcoming / live: expected result — pinned to the bottom so bars align across a row (R2-3) */}
      {card.notCompleted && card.hasChances && (
        <div style={{ marginTop: 'auto' }}>
          <div style={{ ...LBL, marginBottom: 9 }}>Expected result</div>
          <Bar chances={card.chances} />
        </div>
      )}

      {/* completed: what was predicted */}
      {card.hasPred && (
        <div style={{ marginTop: 'auto' }}>
          <div style={{ ...LBL, marginBottom: 9 }}>What was predicted</div>
          <Bar chances={card.predChances} />
        </div>
      )}
    </article>
  )
}
