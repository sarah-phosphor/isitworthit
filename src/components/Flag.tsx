import type { CSSProperties } from 'react'

// A bundled country flag (cross-platform — raw emoji flags don't render on
// Windows). `iso` is an ISO 3166-1 alpha-2 code; nothing renders without one
// (so callers can pass spacing via `style` with no phantom gap when absent).
// Hairline ring keeps white-heavy flags (Japan, England) off the cream bg.
export function Flag({ iso, h = 18, style }: { iso?: string; h?: number; style?: CSSProperties }) {
  if (!iso) return null
  return (
    <img
      src={`/flags/${iso}.svg`}
      alt=""
      aria-hidden="true"
      style={{
        height: h,
        width: 'auto',
        flex: 'none',
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: 2,
        boxShadow: '0 0 0 .5px rgba(0,0,0,.16)',
        ...style,
      }}
    />
  )
}
