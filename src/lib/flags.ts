// Maps a team to its bundled flag (public/flags/<iso>.svg). ESPN gives FIFA-style
// abbreviations (USA, NED, GER…) which aren't ISO codes, so we translate to ISO
// 3166-1 alpha-2 (flag-icons filenames). Home nations use flag-icons' gb-eng /
// gb-sct. Covers the full 48-team 2026 field; unknown codes return undefined and
// the UI simply renders no flag.

import type { Team } from './model'

const FIFA_TO_ISO: Record<string, string> = {
  ALG: 'dz', ARG: 'ar', AUS: 'au', AUT: 'at', BEL: 'be', BIH: 'ba', BRA: 'br', CAN: 'ca',
  CPV: 'cv', COL: 'co', COD: 'cd', CRO: 'hr', CUW: 'cw', CZE: 'cz', ECU: 'ec', EGY: 'eg',
  ENG: 'gb-eng', FRA: 'fr', GER: 'de', GHA: 'gh', HAI: 'ht', IRN: 'ir', IRQ: 'iq', CIV: 'ci',
  JPN: 'jp', JOR: 'jo', MEX: 'mx', MAR: 'ma', NED: 'nl', NZL: 'nz', NOR: 'no', PAN: 'pa',
  PAR: 'py', POR: 'pt', QAT: 'qa', KSA: 'sa', SCO: 'gb-sct', SEN: 'sn', RSA: 'za', KOR: 'kr',
  ESP: 'es', SWE: 'se', SUI: 'ch', TUN: 'tn', TUR: 'tr', USA: 'us', URU: 'uy', UZB: 'uz',
}

export function isoForAbbr(abbr?: string): string | undefined {
  return abbr ? FIFA_TO_ISO[abbr.toUpperCase()] : undefined
}

export function isoForTeam(team?: Team): string | undefined {
  return isoForAbbr(team?.short)
}
