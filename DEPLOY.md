# Deploy → doesitmatter.fyi

The app is built and verified locally. These are the steps to put it live. Nothing
here needs API keys or environment variables.

## 1. Create the GitHub repo & push
From `~/Desktop/Claude_Code/doesitmatter` (already a git repo with an initial commit):

```bash
gh repo create doesitmatter --private --source=. --remote=origin --push
# or, manually:
#   git remote add origin git@github.com:<you>/doesitmatter.git
#   git push -u origin main
```

## 2. Connect Netlify
- Netlify → **Add new site → Import an existing project** → pick the `doesitmatter` repo.
- Build settings are read from `netlify.toml`, so just confirm:
  - Build command: `npm run build`
  - Publish directory: `dist`
  - Functions directory: `netlify/functions`
  - Node version: `20`
- Deploy. The data endpoint will live at `/.netlify/functions/scores`.

## 3. Point the domain
- Netlify → **Domain management → Add a custom domain** → `doesitmatter.fyi`.
- Update DNS at your registrar to Netlify (either Netlify DNS, or an `ALIAS`/`A`
  record to the Netlify load balancer + `www` CNAME). Netlify provisions HTTPS.

That's it — it'll auto-deploy on every push to `main`.

## Keeping it fresh
- **Scores/standings update themselves** — the function re-fetches ESPN on each
  request (cached ~60s) and the page polls every 60s. No redeploys needed for data.
- **Resilience:** if ESPN hiccups, the function serves its last good response, then
  the free openfootball feed; the browser also keeps the last payload in
  localStorage. A "scores may be slightly delayed" note shows if it's on a fallback.

## Optional: hand-polished copy for marquee games
When you want a sharper line on a big match, ping me — I'll read the live data and
add an entry to `src/lib/overrides.ts` (keyed by match id), then it needs a push to
go live. Totally optional; the automatic copy stands on its own.

## If a future season needs odds-written copy via Claude
Not used today. If you ever want richer LLM-written prose, it'd be added as a build
step with an `ANTHROPIC_API_KEY` Netlify env var — but the current computed copy
needs none.
