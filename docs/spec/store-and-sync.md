# Local store and Garmin Sync

How Garmin data gets into the local store and what is derived from it. The reasons for the raw layer and the shared Postgres are in ADR 0001.

## Facts the design rests on

- The Garmin Personal API key is exchanged for a 24 h Bearer JWT. The token call needs `Accept: */*`. Pull-only, no webhooks.
- The activity list has no last-modified field; its only filters are `startDate` / `endDate`. The API cannot report edits or deletions.
- The full Activity index is a couple of pages of 100, so re-listing it on every Sync is cheap.
- Wellness range endpoints exist for daily summaries, sleep, stress, steps, weight and Body Battery. Daily HR and fitness age are per-date only.
- Sleep carries `sleepWindowConfirmationType`, so recent days can change after the fact.
- Wellness Data has gaps: nights without sleep, days without stress, no weight on most days.
- Activity detail has no Laps. Laps, Workout Steps and 1 Hz streams come only from the FIT File, downloaded per Activity as a ZIP.

## FIT parsing

- `@garmin/fitsdk` (official, ESM, typed; fills the enhanced speed and altitude fields and resolves `workout_step` subfields), with `fflate` to unzip.
- Lap `intensity` + `wkt_step_index` drive Rep detection ([analytics.md](analytics.md#reps-and-recoveries)).
- Caveats: the SDK is under Garmin's licence, not open source (fine for personal use; `fit-file-parser`, MIT, is the fallback). Compressed timestamps are unsupported (`fit_decode_failed`).

## Store

1. **Database**: one `pgvector/pgvector` Postgres, with a `garmin` schema (and a `kb` schema later for the Knowledge Base). Drizzle ORM, with `drizzle-kit` generating SQL migrations and `drizzle-orm`'s `migrate()` applying them at startup. Raw SQL stays available.
2. **Raw layer, the source of truth**:
   - every Garmin response is stored verbatim as `jsonb`, keyed by endpoint and natural key (Activity id or calendar date);
   - the FIT ZIP is stored as a blob in the database, not on a volume;
   - everything below is a projection of this layer and can be rebuilt from it.
3. **Normalised tables**:
   - **Activities**: the API summary plus the canonical start from API `startTimeGMT`. The FIT `session.startTime` is kept only to flag offsets.
   - **Laps** and **Workout Steps**, from the FIT File.
   - **Wellness Data days**: one row per calendar date per Wellness metric.
   - **Snapshots** of the HR Zone configuration and profile settings, kept per Sync.
4. **Derived Metrics** per Activity:
   - contents: Reps and Recoveries, HRRc, HR Zone time, TRIMP, Aerobic Decoupling, HR coverage and the `null` reason codes;
   - computed once, when the FIT File is decoded at Sync time;
   - each row records the `analytics_version`, the HR Zone configuration and the FIT `userProfile` gender it was computed with.
5. **No per-second rows.** A tool that needs a stream re-decodes the stored FIT File (about 20 ms).
6. **Query-time aggregates**: ATL / CTL / TSB, Weekly Volume, VDOT, Training Paces and race predictions are computed when a tool asks, from the per-Activity rows and the Races.
7. **Recompute**:
   - a change to `analytics_version`, the HR Zone configuration or the gender recomputes all Activities from the stored FIT Files (the latest snapshot applies to all history);
   - at startup, the recompute runs before the first Sync, and the server is not ready until it finishes (about 10 s for a couple of hundred files);
   - a zone change detected during a Sync triggers a recompute at the end of that Sync.
8. **Races**:
   - a table of their own, never touched by Sync, so a full re-sync cannot wipe them;
   - at most one Race per Activity, keyed by Activity id: official distance (m), optional name, declared-at;
   - declaring again replaces the Race; it can be removed;
   - VDOT is computed at query time, so an edit takes effect immediately;
   - a Race whose Activity was deleted in Garmin is kept, flagged `orphaned` and excluded from VDOT.

## Sync

9. **Placement**: a NestJS module inside the server process, with an in-process scheduler. No worker container.
10. **Triggers**: at startup (catch-up), hourly, and the `sync` tool. Read tools never call Garmin.
11. **Single flight**: every Sync (scheduler, `sync` tool, operator CLI) and the migrations take one Postgres advisory lock, so only one runs at a time across processes. A concurrent `sync` tool call reports the Sync already running; a scheduler run that finds the lock taken records `skipped: locked`.
12. **Backfill**, on the first run:
    - Activities: everything the API returns, of every sport: detail, `/workouts` and FIT. Non-running FIT Files are needed for Training Load.
    - Wellness Data: from the oldest Activity's date to today. No probing for older history.
    - About 600 Activity calls plus about 330 per-date Wellness calls: a few minutes at concurrency 1.
    - The first backfill never blocks readiness; `freshness.backfill` reports its progress.
13. **Incremental Activities**: re-list the whole index on every Sync and diff it by id.
    - New ids: fetch detail, workouts and FIT.
    - Changed summary fields (name, type): update the raw and normalised rows.
    - Ids that disappeared: soft-delete them (hidden from analytics, kept in the store; tools answer `activity_not_found`).
    - FIT Files are never re-downloaded unless forced.
14. **Incremental Wellness Data**: re-fetch a trailing 7-day window on every Sync. Older days are settled.
15. **Wellness metrics synced**: sleep, stress, Body Battery, daily HR (RHR and the 7-day RHR), daily summaries (steps, intensity minutes), weight and fitness age; the HR Zone configuration and profile settings as snapshots; HRV probed weekly only. Skipped: hydration, nutrition, menstrual cycle, SpO2 acclimation and `wellnessactivity`.
16. **Missing Day vs not synced**: recorded per day and per Wellness metric. A day Garmin was asked about and had nothing for is a Missing Day; a day not asked about yet is not synced. Neither is ever zero.
17. **FIT failures**:
    - a failed download or decode still stores the Activity with its API summary;
    - its FIT-derived metrics are `null` with `fit_unavailable` or `fit_decode_failed`;
    - the FIT is retried on the next 3 Syncs, then left alone until a forced re-download;
    - an Activity without a FIT File gets `no_fit`.
18. **Token**:
    - the JWT is kept in memory only, never persisted;
    - refreshed when less than 5 min remain, or on a 401 (the failed call is retried once);
    - neither the key nor the JWT ever appears in logs or trace attributes.
19. **Rate limits**: none are visible, but the Sync runs serially (concurrency 1), honours `Retry-After`, and backs off exponentially on 429 / 5xx, up to 5 attempts. When retries are exhausted the run is recorded as failed; the next run resumes from the stored state.
20. **Sync run log**: each run records its trigger, start and end, status (`ok`, `failed`, `running`), counts and error. The `freshness` block reads from it.
21. **Forced full re-download**: the operator CLI ([compose.md](compose.md#operator-cli)). Not exposed to the assistant.
