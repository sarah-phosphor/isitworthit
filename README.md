# Does It Matter? — World Cup for Non-Soccer Fans

Every World Cup game, translated into plain English. For each match it answers the
only question a casual viewer has: **Does it matter? What changes? Why?**

Live site: **doesitmatter.fyi** (see `DEPLOY.md` to wire it up).

## How it works

Two layers, deliberately separated:

1. **Data (automatic).** A Netlify function pulls the real FIFA World Cup 2026 from
   ESPN's public JSON — fixtures, scores, live minute, group standings, and betting
   odds — normalizes it, and serves a slim payload. The browser polls it every 60s,
   so the site stays current with **no human in the loop**. openfootball is a free
   fallback if ESPN is unavailable.

2. **Editorial (computed).** The "does it matter / what changes / why" copy isn't in
   any feed — but the *logic* is deterministic. `src/lib/qualification.ts` works out,
   from the live standings, what each match is actually at stake for and renders it
   as plain English. It leans on ESPN's own clinched/eliminated flags and
   deliberately **under-claims** when something isn't mathematically certain.

   Win-probability bars come from ESPN's live betting odds; when a game has no full
   odds yet (most upcoming games), it falls back to a qualitative "favored" line.

### Shareable URLs
Path-based client routing (History API; the `netlify.toml` SPA redirect makes deep
links work): `/` (today), `/day/<YYYY-MM-DD>`, `/search`, `/group/<A–L>`,
`/team/<country-slug>`, `/match/<id>`. Cards and names link through; browser
back/forward work.

### Optional hand-polish
Every match has complete automatic copy. `src/lib/overrides.ts` is an (empty) map
where a human can override any field for a marquee match — purely optional sugar.
The site is complete without it.

## Stack
Vite + React + TypeScript, deployed to Netlify (static SPA + one function). No
database, no API keys.

## Develop
```bash
npm install
npm run dev            # http://localhost:5173 — the dev server also serves the
                       # data function locally, so no netlify-cli needed
npm run build          # typecheck + production build → dist/
npm run verify:data    # print the normalized feed + engine copy (live ESPN)
npx tsx scripts/verify-render.tsx   # SSR sanity-check every view
```

## Layout
```
netlify/functions/scores.ts   data endpoint: ESPN → normalize → fallback + cache
src/lib/espnSource.ts         ESPN fetch + normalize (the source of truth)
src/lib/openfootballSource.ts free fallback feed
src/lib/qualification.ts      the deterministic "does it matter" engine
src/lib/buildCard.ts          match + editorial → card view-model
src/lib/{model,dates,overrides,useScores}.ts
src/components/MatchCard.tsx   the card (all states)
src/App.tsx                    state machine + masthead + day/search/group/team views
design/                        the original Claude Design handoff (provenance)
```
