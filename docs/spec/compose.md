# Docker Compose topology

How the MVP runs. Every choice here is cheap to reverse (a file, a tag, an env var), so this is a spec, not an ADR.

## Facts the design rests on (checked 2026-11-01)

- **Claude Desktop cannot reach a localhost HTTP server directly.** A custom connector connects from Anthropic's cloud, so it can't reach `127.0.0.1`, and `claude_desktop_config.json` only starts local stdio servers. Desktop needs the `mcp-remote` stdio bridge. Claude Code connects directly with `--transport http`.
- **Postgres 18 data directory**: the official images moved PGDATA to `/var/lib/postgresql/18/docker`, so the volume mounts at `/var/lib/postgresql`, not `…/data`.
- **Phoenix**: port 6006 serves both the UI and OTLP over HTTP (`/v1/traces`). It can store its data in Postgres 14 or later through `PHOENIX_SQL_DATABASE_URL`. `PHOENIX_DEFAULT_RETENTION_POLICY_DAYS` purges traces (the default, 0, keeps them forever). Datasets and experiments live in Phoenix's own database.
- Phoenix 21.0.0 is a new major; the previous line ends at 20.27.0. Both have `-nonroot` variants.

## Services

`compose.yaml` at the repo root, with `name: garmin-mcp` so the volume and network names stay stable. It replaces the empty `docker-compose.yml`.

| Service | Image | Published (host) | Depends on | Limits |
|---|---|---|---|---|
| `mcp` | built from `./Dockerfile` | `127.0.0.1:${MCP_PORT:-3000}:3000` | `postgres` healthy, `phoenix` started | `mem_limit: 1g`, `cpus: 2`, `NODE_OPTIONS=--max-old-space-size=768` |
| `postgres` | `pgvector/pgvector:0.8.7-pg18-trixie` | `127.0.0.1:${POSTGRES_PORT:-5432}:5432` | none | `mem_limit: 1.5g`, `cpus: 2`, `shm_size: 256m` |
| `phoenix` | `arizephoenix/phoenix:version-20.27.0-nonroot` | `127.0.0.1:${PHOENIX_PORT:-6006}:6006` (UI + OTLP over HTTP; gRPC 4317 not published) | `postgres` healthy | `mem_limit: 1g`, `cpus: 1` |

- **All services**: `restart: unless-stopped`; `logging: json-file` with `max-size: 10m` and `max-file: 3`.
- **`mcp`**: `init: true` so signals reach Node; `stop_grace_period: 30s`, with Nest shutdown hooks so a Sync stops at a safe point.
- **Phoenix**: version 21 waits for a Dependabot PR and a check of its breaking changes. Its anonymous product telemetry is turned off (check the exact env var name when implementing). If the nonroot image needs a writable working directory, give it a `tmpfs`; it needs no volume.
- **Image tags** are pinned in full, never the moving `pg18`. `compose.yaml` is the only place the Postgres tag is written; the Testcontainers setup reads the `postgres` service's `image:` from it.

## Server image

`Dockerfile` at the repo root:

- **Stages**: `deps` (`npm ci`) → `build` (`nest build`) → `runtime` (`npm ci --omit=dev`, then copy `dist/` and the generated Drizzle SQL migrations).
- **Base**: `node:24.22.2-trixie-slim` (glibc, not Alpine).
- **Runtime**: `USER node`, `NODE_ENV=production`, `CMD ["node","--enable-source-maps","dist/main.js"]`.
- **Migrations at startup** use `drizzle-orm`'s `migrate()`, not `drizzle-kit`, so the runtime needs no dev dependency.
- **`.dockerignore`**: `.env*`, `.garmin-samples/`, `books/`, `.books/`, `spikes/`, `backups/`, `node_modules/`, `dist/`, `.git/`, `*.fit`, `*.FIT`, `*.zip`. Nothing personal can end up in an image layer.
- **CI**: the `ci` workflow gets a `docker build .` step, with no push and the GHA layer cache.

## Postgres: one instance, two databases

- **`garmin`** database, owned by the `garmin` role: the Athlete data (the `garmin` schema; `kb` later).
- **`phoenix`** database, owned by a separate `phoenix` role: Phoenix's traces, datasets and experiments.
  - Created by a committed init script, `./docker/postgres-init/10-phoenix.sh`, bind-mounted read-only into `/docker-entrypoint-initdb.d`, when the volume is first initialised.
  - If `pgdata` already exists, a documented one-off `psql` command creates them instead.
  - A separate database keeps Phoenix migrations away from the `garmin` schema; restoring one database never touches the other.
- **Healthcheck**: `pg_isready -U garmin -d garmin`, every 5 s.

## Network

- All three services share the default network. No `internal: true`: the server needs outbound HTTPS to Garmin, and Docker can't publish ports from an internal network.
- Isolation comes from binding every published port to `127.0.0.1`.
- The server reads `HOST` (default `127.0.0.1`). Compose sets `HOST=0.0.0.0` inside the container, so the published port works while the host side stays on loopback.
- Clients always use `127.0.0.1`, never `localhost`: on Windows, `localhost` can resolve to `::1` first and get "connection refused".

## Volumes

- **`pgdata`**: named `garmin-mcp-pgdata`, mounted at `/var/lib/postgresql`, declared `external: true` and created once with `docker volume create garmin-mcp-pgdata` (documented in the README). `docker compose down -v` then cannot delete the Athlete's data or the eval datasets; Races, curated datasets and the full Wellness history cannot all be recovered from Garmin.
- No other volume: no FIT volume, no Phoenix volume, no `./books` until the Knowledge Base.

## Environment

- Compose passes each service only the variables it needs, through `environment:` with interpolation, never `env_file: .env`. Postgres and Phoenix never see the Garmin key.
- Required variables use `${VAR:?}`, so `up` stops when one is missing.
- No Docker `secrets:` files: the key stays in `.env`. `docker inspect` can show it, which is acceptable for one user on localhost.
- **`.env.example`** (committed, no values):
  - required: `GARMIN_PERSONAL_API_KEY`, `POSTGRES_PASSWORD` (the `garmin` role), `PHOENIX_DB_PASSWORD` (the `phoenix` role);
  - optional: `MCP_PORT`, `POSTGRES_PORT`, `PHOENIX_PORT`, `LOG_LEVEL`, `PHOENIX_RETENTION_DAYS`.
- **Fixed in `compose.yaml`**, not in `.env`: `DATABASE_URL=postgres://garmin:${POSTGRES_PASSWORD}@postgres:5432/garmin`; `GARMIN_BASE_URL` (the real host); the OTLP endpoint `http://phoenix:6006/v1/traces`; `PHOENIX_PROJECT_NAME=garmin-mcp`; `HOST=0.0.0.0`; Phoenix's `PHOENIX_SQL_DATABASE_URL` and `PHOENIX_DEFAULT_RETENTION_POLICY_DAYS`.
- Tests override every base URL and the trace exporter through config.

## Health, startup and readiness

- `GET /health/live`: the process is up.
- `GET /health/ready`: 503 until the migrations and the recompute have finished, then 200. `/mcp` uses the same gate. The logic lives in the app, so the e2e suite tests it without Compose.
- **Compose healthcheck for `mcp`**: `node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"` (the slim image has no curl), with `interval: 10s` and `start_period: 60s`.
- **Order**: `postgres` healthy → migrations → recompute (about 10 s) → ready → catch-up Sync and backfill in the background.
- Phoenix being down never blocks the server: the OTLP exporter drops spans until it is back. `phoenix` has no healthcheck because nothing waits on it.

## Operator CLI

- `docker compose exec mcp node dist/cli.js resync --full`, with an optional `--fit-only`.
- A Nest `createApplicationContext` with no HTTP, reusing the `sync` module, the same image and the same env. It takes the advisory lock, prints progress, and sends its spans to Phoenix.
- Not exposed over HTTP; Claude cannot reach it.

## Connecting Claude

- **Claude Code**, at user scope:

  ```
  claude mcp add --transport http --scope user garmin http://127.0.0.1:3000/mcp
  ```

  No `.mcp.json` is committed, or every coding session in this public repo would load the Athlete's real-data tools.

- **Claude Desktop**, through the `mcp-remote` stdio bridge in `claude_desktop_config.json`:

  ```json
  { "mcpServers": { "garmin": {
    "command": "npx",
    "args": ["-y", "mcp-remote@<pinned>", "http://127.0.0.1:3000/mcp", "--transport", "http-only"]
  } } }
  ```

  Pin the version so `npx` doesn't pull `@latest` on every launch. It needs Node on the host. No auth headers; `--allow-http` is only for hosts other than localhost.

## Dev workflow

- Backing services: `docker compose up -d postgres phoenix`, then `docker compose stop mcp`.
- Server on the host: `npm run start:dev` reads `.env`, with `DATABASE_URL=…@127.0.0.1:5432/garmin` and the Phoenix endpoint `http://127.0.0.1:6006/v1/traces`. Forgetting to stop `mcp` is harmless for data (the advisory lock), but the two clash on port 3000.
- No Compose `develop.watch`: rebuilding the image on every edit is slow.
- **MCP Inspector**: `npm run inspect` runs `npx @modelcontextprotocol/inspector@<pinned>`; connect with Streamable HTTP to `http://127.0.0.1:3000/mcp`.
- Tests never use the Compose database.

## Phoenix retention and sensitivity

- Trace retention: `PHOENIX_DEFAULT_RETENTION_POLICY_DAYS=${PHOENIX_RETENTION_DAYS:-30}`. Tool spans carry the full `output.value`, which is the Athlete's data.
- The retention sweep does not purge datasets, examples or experiments. Whether a dataset example survives once its source span is deleted is checked when the evals are built.
- The evals phase needs no topology change: datasets and experiments live in the `phoenix` database, are backed up with it, and sit on the protected volume.
- Phoenix auth stays off; port 6006 is loopback only.
- `SECURITY.md` lists the `phoenix` database and `backups/` as places where personal data lives.

## Backup and restore

- `npm run db:backup`: `docker compose exec -T postgres pg_dump -Fc` for each database into `backups/garmin-<date>.dump` and `backups/phoenix-<date>.dump`.
- `npm run db:restore -- <db> <file>`: `pg_restore --clean --if-exists`.
- `backups/` is gitignored and added to the forbidden-path guard (`scripts/check-forbidden-paths.mjs`).
- Manual only: before a Postgres major upgrade (dump and restore), before a risky migration, or whenever wanted.

## Dependabot

Add the `docker-compose` ecosystem (for `compose.yaml`) and `docker` (for the `Dockerfile`), so one PR bumps production and tests together.

## Room for the Knowledge Base later

It slots in through a later `compose.kb.yaml` override, enabled with `COMPOSE_FILE=compose.yaml:compose.kb.yaml` in `.env`, adding `docling-sidecar`, `tei-embed`, the `./books:/books:ro` mount and the server's `TEI_URL` and `SIDECAR_URL`. The MVP `compose.yaml` stays at three services. Before enabling it, raise the WSL2 VM memory: the two services need about 14 GiB.
