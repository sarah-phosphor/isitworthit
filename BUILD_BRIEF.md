# Build Brief — doesitmatter.fyi fixes

You built this site. This is a punch list of fixes from Sarah. Surgical changes, not a rethink — keep the existing visual style (serif, cream background, oxblood accents) and don't disturb the live-data layer or the engine's under-claiming behavior.

## Context
- **Live at:** https://doesitmatter.fyi (also doesitmatter-fyi.netlify.app)
- **Code:** `~/Desktop/Claude_Code/doesitmatter`
- **Deploy:** currently live via a direct Netlify CLI deploy (Netlify project `doesitmatter-fyi`) — **not git-linked yet**. Make changes, build clean, and commit. **You don't need to deploy** — once committed, the redeploy + live verification is handled separately. (If you'd rather self-deploy: `netlify deploy --prod` against site `doesitmatter-fyi`.)
- **Data:** live ESPN feed via `netlify/functions/scores.ts`; the "does it matter / what changes" copy is computed by the deterministic engine.

## Terminology (Sarah's words)
- **Standings view** = the grouped A–L grid (teams, points, status). Do **not** call it the "team page." Search-by-team is just a feature of it.
- **Team page** = an individual team's detail view (e.g. France, Egypt).

## Punch list

**1. Charts render for all of today's matches.**
The win-probability / odds bars currently show only for the first 2 of today's matches. They should render for **every** match in the day view.

**2. Remove low-quality auto-copy everywhere it appears:**
- The "If it goes the other way" line (e.g. "Without a win, they're most likely out")
- The "Eight of the twelve third-place teams also advance… So finishing third isn't automatically out…" explainer
- The "expected result" line

**3. More sub-URLs so users can click around.**
Each **match, group, and team** gets its own shareable URL, with cards/names linking through to them. (Confirm routing approach as you go.)

**4. Match location in the game heading.**
Add the venue/location to the heading part of each game.

**5. Replace "In the hunt" wording.**
Sarah dislikes it. Appears as a status in the standings view and as "still in the hunt" in team-page CURRENT STATUS — reword in both. Propose a clearer phrase.

**6. Search matches common names/abbreviations.**
Placeholder invites "USA" but only "United States" returns results. Search must match common names and aliases: USA → United States, England, Türkiye/Turkey, South Korea/Korea, etc.

**7. Remove the per-team next/last-game line in standings.**
Lines like "Tue, Jun 30 · 6:00 PM PT vs Third Place Group C/E/F/H/I" or "Lost 0–1 vs South Africa" mix next-match and last-result with no label, and include jargon. Remove them from the standings grid — points + status carry it; match detail lives on the new sub-pages.

**8. Team pages: too much text — get to the point.**
PAST MATCHES repeats a verbose subtext under every match (e.g. "France are through; Senegal finished third — waiting on the best-third math"). Trim each past-match line to essentially just the result; drop the repetitive best-third/finished-third explainer. Tighten CURRENT STATUS too.

**9. Team page header spacing/sizing.**
The "← Today" back link sits too tight against the big team title and reads too small — add breathing room above the heading and give it a clearer treatment. Also: team pages show **two** "Today" elements (the top date-nav bar + the "← Today" back link). Consider whether the date-nav bar belongs on team pages at all — likely remove it there.

## When done
Build clean and commit. Flag anything where the right call isn't obvious (especially #3 routing and #5 wording) rather than guessing.
