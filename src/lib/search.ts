// URL slugs for team pages (diacritic-insensitive). The search feature was
// removed in R3.2 — `slugify` is still used for /team/<slug> routing.

const strip = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function slugify(s: string): string {
  return strip(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
