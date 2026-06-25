// Team search + URL slugs. Search is diacritic-insensitive and alias-aware so
// "USA", "Turkey", "Korea" etc. find the right country.

const strip = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function slugify(s: string): string {
  return strip(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// common names / abbreviations → the ESPN display name
const ALIASES: Record<string, string[]> = {
  'United States': ['usa', 'us', 'usmnt', 'america', 'united states'],
  Türkiye: ['turkey', 'turkiye'],
  'South Korea': ['korea', 'south korea', 'korea republic'],
  'Ivory Coast': ['ivory coast', 'cote divoire', 'cote d ivoire'],
  'Congo DR': ['congo', 'dr congo', 'drc', 'democratic republic of congo'],
  Czechia: ['czech', 'czech republic', 'czechia'],
  'Bosnia-Herzegovina': ['bosnia', 'herzegovina', 'bosnia herzegovina'],
  'Cape Verde': ['cape verde', 'cabo verde'],
  Curaçao: ['curacao'],
}

export function teamMatchesQuery(name: string, short: string | undefined, q: string): boolean {
  const nq = strip(q.trim())
  if (!nq) return true
  const tokens = [strip(name), ...(short ? [strip(short)] : []), ...(ALIASES[name] ?? []).map(strip)]
  return tokens.some((t) => t.includes(nq)) || (short ? strip(short) === nq : false)
}
