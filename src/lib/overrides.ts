// On-demand hand-polish layer. Every match has fully-automatic computed copy;
// these optional overrides let a human replace any field for a marquee match.
// Ships empty — the site is complete without it. Keyed by ESPN match id.
//
// To polish a match: find its id (it's in the card's data / the URL of the ESPN
// event) and add an entry, e.g.
//   '760473': { matters: 'Yes.', whatChanges: 'Who wins the group.',
//               why: { text: '…' } }

import type { Gloss } from './model'
import type { Editorial } from './qualification'

export type EditorialOverride = Partial<
  Pick<Editorial, 'matters' | 'whatChanges' | 'expectedHeadline' | 'wasExpected'>
> & { why?: Gloss; ifNot?: Gloss }

export const OVERRIDES: Record<string, EditorialOverride> = {
  // (empty in v1 — computed copy stands on its own)
}

export function applyOverride(e: Editorial, matchId: string): Editorial {
  const o = OVERRIDES[matchId]
  return o ? { ...e, ...o } : e
}
