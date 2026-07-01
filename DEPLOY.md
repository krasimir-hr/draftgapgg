# Deployment & local testing

Three ways to run DraftGap, from fastest-iteration to production.

---

## 1. Native local dev (fastest)

Run the dev servers directly — hot reload on both ends.

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate   # use Python 3.12 (psycopg2 has no 3.14 wheels)
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver        # http://localhost:8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

`backend/.env` drives configuration. For a zero-dependency local DB, **leave `DB_NAME` empty**
and Django falls back to SQLite. To use the managed Postgres instead, fill in the `DB_*` values
(requires `psycopg2` → Python ≤ 3.12).

Relevant defaults when a var is absent: `ALLOWED_HOSTS=localhost,127.0.0.1`,
`CORS_ALLOWED_ORIGINS=http://localhost:5173`, `DEBUG=False`. Set `DEBUG=True` locally.

---

## 2. Full stack locally via Docker (prod-like smoke test)

Builds the real images and serves everything through Caddy on `http://localhost`.

```bash
# uses the managed DB from backend/.env
SITE_ADDRESS=:80 VITE_API_URL=http://localhost docker compose up --build

# …or with a throwaway local Postgres (set DB_HOST=db in backend/.env first):
SITE_ADDRESS=:80 VITE_API_URL=http://localhost docker compose --profile localdb up --build
```

Open `http://localhost`. The SPA, `/api`, `/admin`, `/static`, and `/media` are all served
from the one origin, so CORS is a non-issue. Stop with `Ctrl-C`; `docker compose down -v`
wipes the volumes.

---

## 3. Production (single VPS + Cloudflare)

Recommended box: Hetzner CX22 (~€4/mo). Point your domain's A record at the server
(proxied through Cloudflare if you use it).

**One-time setup on the server**
```bash
# install Docker, then:
git clone <repo> draftgap && cd draftgap
```

Create a **root `.env`** (for compose substitution):
```ini
SITE_ADDRESS=yourdomain.com          # real domain → Caddy auto-provisions HTTPS
VITE_API_URL=https://yourdomain.com  # same origin; /api is proxied to the backend
SYNC_INTERVAL=21600                  # Leaguepedia re-scrape interval, seconds
```

Fill in `backend/.env` from `backend/.env.example` (`DEBUG=False`, a fresh `SECRET_KEY`,
your `DB_*`, and set `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`
to your domain).

**Launch**
```bash
docker compose up -d --build
```

That starts: `backend` (gunicorn, runs migrate + collectstatic on boot), `web`
(Caddy: SPA + reverse proxy + automatic Let's Encrypt TLS), and `cron`
(the data pipeline, below). Static/media live in named volumes shared with Caddy.

### Data pipeline (the `cron` service)

Each cycle (`SYNC_INTERVAL`, default 6h) runs, in order — each step independent
so one failure doesn't block the rest:

```
python manage.py sync_events          # tournaments, teams, rosters (Leaguepedia)
python manage.py sync_matches --all   # matches, games, performances (Leaguepedia, reliable)
python manage.py pull_oracleselixir   # Tier-2 enrichment (Oracle's Elixir, best-effort)
python manage.py compute_ratings --all # recompute Performance Ratings (PR / points)
```

**Two-tier ratings.** Leaguepedia is the reliable backbone (every game gets a
"basic" rating immediately). Oracle's Elixir adds laning/vision stats for
~92% of games (all but LPL) and is joined on `riot_platform_game_id`; it's
**best-effort** — its only feed is a daily Google Drive CSV whose *anonymous*
downloads are quota-throttled, so `pull_oracleselixir` uses the **Drive API key**
(`OE_DRIVE_API_KEY`) and enrichment simply backfills a cycle later if a pull
fails. Set the key in `backend/.env` (see `.env.example`). To test ingestion
without the key, drop a yearly CSV anywhere and run
`pull_oracleselixir --file <path> --no-download`.

> **License:** Oracle's Elixir data is free for **non-commercial use with
> attribution**. Credit "Oracle's Elixir" visibly in the UI. See
> `docs/player-rating-system.md` for the rating methodology.

**Updates**
```bash
git pull && docker compose up -d --build
```

### Cloudflare (optional but recommended)
Put the domain behind Cloudflare (free) for CDN + caching. Since API data only changes
when `sync_events` runs, a cache rule on `/api/*` GETs makes the site feel instant and keeps
the box near-idle. Use SSL mode **Full (strict)** — Caddy already serves a valid cert.

---

## ⚠️ Rotate leaked secrets
`backend/.env` was previously committed to git, so its old `SECRET_KEY` and `DB_PASSWORD`
are in history. Generate a new `SECRET_KEY` and rotate the database password before going live:
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```
