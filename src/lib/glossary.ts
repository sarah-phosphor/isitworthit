// Plain-English definitions for the few football terms the copy leans on. Keyed
// so the engine can attach a hover tooltip to a term without repeating prose.

export const GLOSSARY = {
  goalDifference:
    'Goal difference = goals scored minus goals let in. It’s the first tiebreaker when two teams finish level on points.',
  knockout:
    'From here it’s single-elimination: the winner advances, the loser is out. No more draws to fall back on.',
  seeding:
    'Finishing first in the group usually means an easier opponent in the next round than finishing second.',
} as const

export type GlossaryKey = keyof typeof GLOSSARY
