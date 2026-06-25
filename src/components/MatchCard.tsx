import type { CSSProperties } from 'react'
import type { CardVM, Chance, GlossVM } from '../lib/buildCard'

const LBL: CSSProperties = {
  font: "500 11px 'Instrument Sans',sans-serif",
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color: '#8a857d',
}
const BODY: CSSProperties = { font: "400 16px/1.52 'Newsreader',serif", color: '#3a3631' }

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
              font: "400 13px/1.5 'Instrument Sans',sans-serif",
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8 }}>
        {chances.map((c, i) => (
          <span
            key={i}
            style={{
              font: "500 11px 'Instrument Sans',sans-serif",
              letterSpacing: '.01em',
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

export function MatchCard({ card }: { card: CardVM }) {
  return (
    <article
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
              font: "500 10px 'Instrument Sans',sans-serif",
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: '#8a2b22',
            }}
          >
            {card.liveMinute}
          </span>
        </div>
      )}
      {card.isUpcoming && (
        <div
          style={{
            font: "500 10px 'Instrument Sans',sans-serif",
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: '#6b6660',
            marginBottom: 15,
          }}
        >
          Upcoming
        </div>
      )}
      {card.isCompleted && (
        <div
          style={{
            font: "500 10px 'Instrument Sans',sans-serif",
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: '#6b6660',
            marginBottom: 15,
          }}
        >
          Final
        </div>
      )}

      {/* matchup + score (fixed height so cards align row-to-row) */}
      <div style={{ minHeight: 58 }}>
        <h3
          style={{
            margin: 0,
            font: "500 27px/1.12 'Newsreader',serif",
            letterSpacing: '-.01em',
            color: '#1c1a17',
          }}
        >
          <span
            onClick={card.openHome}
            className={card.homeClickable ? 'lk' : undefined}
            style={{ cursor: card.homeClickable ? 'pointer' : 'default' }}
          >
            {card.homeName}
          </span>
          <span style={{ fontStyle: 'italic', fontWeight: 400, color: '#b0a99c' }}> vs </span>
          <span
            onClick={card.openAway}
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
      <div
        style={{
          marginTop: 7,
          font: "500 12px 'Instrument Sans',sans-serif",
          letterSpacing: '.05em',
          color: '#8a857d',
        }}
      >
        <span
          onClick={card.openGroup}
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

      <div style={{ height: 1, background: '#e6e1d6', margin: '18px 0 16px' }} />

      {/* does it matter */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 17 }}>
        <span style={LBL}>{card.matterLabel}</span>
        <span style={{ font: "600 18px 'Newsreader',serif", color: card.matterColor }}>
          {card.matters}
        </span>
      </div>

      {/* what changes */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...LBL, marginBottom: 5 }}>{card.changeLabel}</div>
        <div style={{ font: "500 19px/1.38 'Newsreader',serif", color: '#1c1a17', minHeight: 54 }}>
          {card.whatChanges}
        </div>
      </div>

      {/* why */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...LBL, marginBottom: 5 }}>Why?</div>
        <GlossLine g={card.whyGloss} style={{ ...BODY, minHeight: 76 }} />
      </div>

      {/* upcoming / live: expected result + if-not */}
      {card.notCompleted && (
        <>
          <div style={{ marginBottom: 18 }}>
            <div style={{ ...LBL, marginBottom: 9 }}>Expected result</div>
            {card.hasChances ? <Bar chances={card.chances} /> : <div style={BODY}>{card.expectedHeadline}</div>}
          </div>
          {card.hasIfNot && (
            <div>
              <div style={{ ...LBL, marginBottom: 5 }}>If it goes the other way</div>
              <GlossLine g={card.ifNotGloss} style={BODY} />
            </div>
          )}
        </>
      )}

      {/* completed: what was predicted */}
      {card.hasPred && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...LBL, marginBottom: 9 }}>What was predicted</div>
          <Bar chances={card.predChances} />
        </div>
      )}
    </article>
  )
}
