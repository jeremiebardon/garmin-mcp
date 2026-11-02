# Testing strategy

How the MVP is tested. The reason committed tests use synthetic data only is ADR 0002: the repo is public, and personal data in git history is hard to remove.

## Fixtures

1. **Synthetic FIT shapes**, generated in memory at test time by a typed builder in `test/fixtures/fit/`, with the `@garmin/fitsdk` `Encoder`. No `.fit` binaries in git. Each shape reproduces a real file's quirk, not its data:
   - **A**: 1500 m Reps auto-lapped 1000 + 500, jog Recoveries.
   - **B**: 120 s and 90 s standing rests, a 2 km Rep split 1000 + 1000, timer stop / start pauses in warmup and cooldown, compliance `faster`.
   - **C**: a half-marathon-distance Continuous Run with an 80-record HR gap plus gaps of 5 s or less, start-lag HR, `hrv` RR messages.
   - **D**: a 527 s stretch with distance but no position, a single-step Workout run as a fartlek, a session start 7 days off the API start.
   - **Failure variants**: a corrupt ZIP (`fit_decode_failed`), no FIT (`no_fit`), a Recovery under 60 s, a pause inside the HRRc window, HR coverage under 90%, a treadmill run, non-running Activities.
2. **No GPS** in synthetic FIT Files: no position or altitude fields at all. No MVP metric uses GPS, and its absence is exactly shape D.
3. **Synthetic values never mirror real ones**: invented results (for example a 1:30:00 HM and a 42:00 10K, each with its own externally computed VDOT), invented dates and ids (`9000000001…`), and HR Zones and RHR / max that differ from the Athlete's (for example RHR 60, max 190). The Athlete's real numbers never appear in the repo.
4. **Garmin JSON fixtures are synthesised**, not redacted copies: a typed builder whose types come from `garmin_api.json` (`openapi-typescript`), so fakes cannot drift from the API spec. They keep the full row shape, dangerous fields included with placeholder values, so the "no raw Garmin field names" invariant has something to catch.
5. **Synthetic Athlete**: a seeded, deterministic history for integration and e2e:
   - about 16 weeks, with shapes A–D on known dates plus filler Continuous Runs;
   - a treadmill run, a lap swim, a ride and a walk with HR;
   - a declared 10K and HM, an undeclared Race Candidate, a soft-deleted id and an orphaned Race;
   - Wellness Data with chosen Missing Days and not-synced days;
   - a timezone with daylight saving time, with weeks across its DST start and end;
   - more than 100 Activities, so `list_activities` pages and the fake Garmin index spans two pages.

   It is seeded into the raw layer and then projected. The Sync tests go through the fake Garmin instead.
6. **Real samples: a local-only suite.** The spec file is committed but generic: it discovers files in `.garmin-samples/` and skips cleanly when they are absent. Its expected values live in a gitignored `.garmin-samples/expected.json` written by the Athlete. A quirk found in a real file is reproduced as a synthetic shape before it is fixed.

## Oracles

An oracle is the source of the right answer, and it is never the code under test.

- **(a) By construction**: segments use constant speed and step-function HR, so values can be computed by hand. Example: HR 170 for the last 5 s of the Rep and 140 at 55–60 s of the Recovery → HRRc = 30. Each expectation carries a one-line derivation comment.
- **(b) External computation**: the VDOT / %max / Training Paces / prediction constants and the TRIMP exponentials are computed once outside the codebase (a Python one-off or a spreadsheet) and pinned as literals, with a note on where they came from. Never computed by importing our own helpers.
- **(c) The device's own totals**: Rep distance and Timer Time must equal the sum of the FIT `lap.total_distance` / `total_timer_time`, and Activity totals must equal the API summary.
- No second FIT decoder: (c) is already an independent check.

## Tolerances

Published fields are exact at their published rounding. Tolerances apply only to raw internal values and to real files. A `null` vs a value, and the reason code, are always exact.

| Metric | Synthetic, published | Synthetic, raw | Real samples (local) |
|---|---|---|---|
| Pace | exact (s/km, `m:ss`) | ±0.5 s/km | ±1 s/km |
| Distance | exact (km 2 dp) | ±0.5 m | ±1 m vs lap sums |
| HR avg / max | exact | — | exact |
| HRRc | exact | ±0.01 | ±1 bpm |
| HR Zone time | exact (s) | ±1 s | ±2 s per zone |
| TRIMP | exact (1 dp) | ±0.05 | ±0.5% |
| ATL / CTL / TSB | exact (1 dp) | ±0.05 | — |
| Decoupling | exact (1 dp) | ±0.05 pt | ±0.1 pt |
| VDOT | exact (1 dp) | ±0.01 | exact |
| Predictions / Training Paces | exact | ±0.5 s | ±1 s |
| HR coverage | exact (1 dp) | — | exact |

## Test levels

| Level | Where | What | Runs in |
|---|---|---|---|
| 1. Unit | `src/**/*.spec.ts` | Pure functions, no Nest, DB or I/O: Rep grouping, HRRc, HR gap interpolation and coverage, zone time, TRIMP, ATL / CTL / TSB, decoupling, VDOT / paces / predictions, day and week bucketing in the profile timezone, the `nulls` builder, the size guard | `ci` |
| 2. Pipeline | `test/pipeline/**/*.spec.ts` | Synthetic FIT bytes → ZIP → decode → Derived Metrics on shapes A–D and the failure variants; the lap-sum oracle | `ci` |
| 3. Integration | `test/integration/**/*.int-spec.ts` | Real Postgres. Migrations and repositories; Sync against the fake Garmin (index diffing, the 7-day re-fetch, Missing Day vs not synced, FIT failures and the 3-retry cap, token refresh, backoff, single flight); recompute triggers; projection rebuild equivalence (ADR 0001) | `ci` |
| 4. Contract / E2E | `test/e2e/**/*.e2e-spec.ts` | The real Nest app + Postgres, driven by the MCP SDK `Client` over Streamable HTTP. Contract snapshot; envelope invariants on every tool; golden tool outputs on the shapes; error tiers; ranges, maximums, the weekly switch and cursor stability; the DST weeks; the size guard; tracing attributes; Origin check; 503 before readiness | `ci` |
| 5. Local | `test/local/**/*.local-spec.ts` | Real samples against `expected.json`; the leak guard against the real index | local only |

## Tooling

- **Integration database**: Testcontainers (`@testcontainers/postgresql`) on the production pgvector tag, read from `compose.yaml`. A Vitest `globalSetup` starts one container per run and migrates a template database; each test file gets its own `CREATE DATABASE … TEMPLATE`. The Compose database is never used by tests.
- **External services are faked at the HTTP boundary**, as in-process servers on ephemeral ports, with base URLs set by config. No msw or nock patching of `fetch`. The **fake Garmin** serves the token exchange (checking `Accept: */*`), the paged index, detail, workouts, FIT ZIP, and the Wellness range and per-date endpoints. It can script 401, 429 + `Retry-After`, 5xx bursts, 204, vanished ids and edited summaries, and issues **canary** key and JWT strings.
- **Clock**: an injected Clock port; no `Date.now()` in domain code. Tests pin "now" for `freshness.today` and `stale` after 2 h, the token refresh under 5 min, the 7-day Wellness window, CTL warm-up, the 12-week VDOT rule and the `partial` week. Vitest fake timers drive only the scheduler and backoff sleeps.
- **Tracing**: `instrumentation.ts` exposes a setup function that takes an exporter. Tests use `InMemorySpanExporter` + `SimpleSpanProcessor` (`@opentelemetry/sdk-trace-base`). One shared helper asserts that no attribute of any span contains the canary key or JWT. Tests also assert `session.id`, the `garmin_mcp.*` attributes, the TOOL / `sync-run` / `decode-fit` structure, `garmin_mcp.result.truncated`, and the `traceId` in `internal_error`.
- **Golden outputs**: explicit assertions on every metric value are the oracle, plus a file snapshot (`toMatchFileSnapshot`, `__golden__/<tool>.<shape>.json`) for the full shape.
- **Contract snapshot**: one committed file holding tool names, input and output JSON Schemas, annotations and descriptions. The description-template check ([mcp-surface.md](mcp-surface.md#descriptions)) runs over the same tool list.
- **Snapshot discipline**: update snapshots (`vitest -u`) only in a commit that changes the tool. CI runs with updates off, so a missing or outdated snapshot fails.

## Vitest layout and scripts

- One `vitest.config.ts` with `test.projects`: `unit`, `integration`, `e2e`, `local`.
- Scripts: `test` (unit, pipeline included), `test:int`, `test:e2e`, `test:all` (unit + integration + e2e), `test:local`, and `check` (oxlint + `tsc --noEmit` + `test:all` with snapshot updates off).
- Coverage is reported, not gated.

## CI vs local

- **`ci.yml`** (push to `main` and PRs, `ubuntu-latest`): `npm ci`, gitleaks, the forbidden-path check on `git ls-files`, `npm run check`, and `docker build .`. Hermetic: Node 24 + Docker, no `.env`, no `.garmin-samples/`, no repository secrets, and the real Garmin host is never contacted.
- **Hardening**: `permissions: contents: read`; `pull_request` only, never `pull_request_target`; actions pinned by SHA; Dependabot; GitHub secret scanning + push protection; `ci` required on `main`; `SECURITY.md`.
- **Local only**: the real-sample suite and the leak guard against the real index.

## Leak guards

1. A fixture scan over `test/fixtures/**` (in CI): fails on any numeric lat / long or any non-placeholder `owner*` / `*ProfileImageUrl*`. Locally it also fails on any real id, start time or zone floor.
2. gitleaks, in CI and as a documented pre-push check.
3. The forbidden-path check: `.env`, `.garmin-samples/`, `*.fit`, `*.zip`, `books/`, and `backups/` once it exists.
