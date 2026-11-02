# MCP tool surface

11 tools, shaped by the question the Athlete asks, not by Garmin endpoint. Tool names and shapes are cheap to change while there is one client and one Athlete, so this is a spec, not an ADR.

## Cross-cutting rules

1. **Shaped by question.** Tools use glossary nouns. No raw Garmin JSON appears in any response. Read tools serve the local store only and never call Garmin.
2. **Tools only.** No MCP resources: in Claude Desktop and Code the user attaches resources, the model cannot fetch them. MCP prompts come after the MVP.
3. **Naming.** Tool names are `snake_case` `verb_noun`, with verbs from `get_`, `list_`, `declare_`, `remove_`, plus `sync`. No `garmin_` prefix: the client already namespaces by server. Input and output fields are `camelCase`.
4. **Output.** Each tool has a Zod input schema and a Zod `outputSchema`, and returns `structuredContent` plus the same compact JSON as one text block. Athlete-data tools carry `freshness` at the top level.
5. **`null` + reason.** Values stay plain. Any object with `null` fields has a sibling `nulls` map, `{fieldName: reasonCode}`. Never zero-fill. See [Reason codes](#reason-codes).
6. **Errors**, in four tiers. See [Errors](#errors).
7. **Units** are carried by the field name. See [Units and formats](#units-and-formats).
8. **Dates and timezone.** See [Units and formats](#units-and-formats).
9. **Pagination.** Only `list_activities` is paged, with an opaque keyset `cursor` / `nextCursor` on the start time. Every other tool is bounded by a date range or is small.
10. **Size.** Every tool's worst case is bounded by design (limits, maximum ranges, the weekly switch); the largest legitimate response is about 10 KB. See [Size guard](#size-guard). No 1 Hz stream or intraday timeline is ever exposed (HR, Body Battery and stress arrays included).
11. **Annotations.** See [Annotations](#annotations).
12. **Descriptions** follow a template. See [Descriptions](#descriptions).
13. **Server `instructions`**. See [Server instructions](#server-instructions).
14. **Tracing.** See [Tracing](#tracing).
15. **Transport.** See [Transport](#transport).

Non-running Activities can be read; their run-only metrics are `null` with reason `not_running`.

## The `freshness` block

Every Athlete-data tool returns it at the top level:

```
{
  today,            // YYYY-MM-DD in the profile timezone
  timezone,         // IANA name from the Garmin profile
  lastSyncedAt,     // when the last successful Sync finished
  lastSync: { status, finishedAt, error? },   // status: ok | failed | running
  stale,            // true when the last success is more than 2 h old
  notSyncedDays?,   // range tools only: days in the range not yet synced
  missingDays?,     // range tools only: { metric: [dates] }, days Garmin had nothing for
  backfill?         // during the first backfill only: { done, total }
}
```

`notSyncedDays` and `missingDays` are separate lists: a Missing Day is a day Garmin was asked about and had nothing for; a not-synced day has not been asked about yet. Neither is ever zero.

## Reason codes

The `nulls` reason codes are a closed list. Adding one is a spec change. The enum in `src/mcp/envelope/` mirrors this table: the two must change together.

| Code | Meaning |
|---|---|
| `no_fit` | The Activity has no FIT File |
| `fit_unavailable` | The FIT download failed |
| `fit_decode_failed` | The FIT File could not be decoded (corrupt ZIP, compressed timestamps) |
| `no_hr` | No HR was recorded |
| `hr_coverage_low` | HR covers less than 90% of the Timer Time in the metric's window |
| `recovery_too_short` | HRRc: the Recovery is shorter than 60 s of Timer Time |
| `pause_in_window` | HRRc: a timer pause falls inside the 60 s window |
| `not_continuous_run` | Aerobic Decoupling: the Activity has Reps |
| `too_short` | Aerobic Decoupling: less than 45 min of Timer Time |
| `not_running` | A run-only metric on a non-running Activity |
| `treadmill` | A metric that excludes treadmill runs (VDOT, decoupling) |
| `no_race` | VDOT: no declared Race to compute it from |
| `not_synced` | The day has not been synced yet |
| `missing_day` | Garmin was asked and had nothing for the day |

States that still have a value are boolean flags, not nulls: `ctlWarmingUp`, `vdotStale`, `incompleteDay`, `orphaned`, `partial`, `raceCandidate`.

## Errors

| Tier | When | Response |
|---|---|---|
| Bad input | The input fails the Zod schema | The SDK's Zod validation error |
| Domain miss | The thing asked for does not exist | `isError: true` + `{error: {code, message, hint}}`; `hint` names the next tool to call |
| Empty or not yet synced | Nothing in the range, or not synced yet | Never an error: a normal response with `[]` / `null` + reason + `freshness` |
| Unexpected failure | A bug or an outage | `isError: true` + `{error: {code: "internal_error", message, traceId}}`, with the Phoenix trace id |

Domain-miss codes: `activity_not_found` (also for soft-deleted ids) and `race_not_found`. This list is closed too.

## Units and formats

| Field | Format |
|---|---|
| `distanceKm` | km, 2 dp |
| `distanceM` | m (Race official distance) |
| `timerTimeSec` + `timerTime` | seconds + `h:mm:ss` |
| `paceSecPerKm` + `pace` | s/km + `m:ss/km` |
| `*HrBpm` | integer bpm |
| `ascentM` | integer m |
| `trimp`, `decouplingPct`, `vdot` | 1 dp |

- A text form is added only for pace and durations.
- Metric units only. English keys and enum values. Garmin Activity and Workout names are passed through verbatim.
- Calendar dates are `YYYY-MM-DD` in the profile timezone, applied to all history.
- Timestamps are ISO 8601 local time with offset, never `Z`.
- Inputs take absolute dates only, with inclusive `from` / `to`. Claude resolves "last week" against `freshness.today`.
- Weeks are keyed by `weekStart`, the Monday.

## Size guard

A response whose JSON is over 25,000 characters has its main array cut until it fits, and gains `truncated: true` and a `hint` (how to narrow the request). The guard is a safety net: no tool should reach it by design. It measures the compact JSON of `structuredContent`. Each tool names its main array with `mainArray` in `@McpTool`. A tool with no main array, or one still over the limit with that array empty, gets `internal_error`.

## Annotations

| Tools | Annotations |
|---|---|
| Read tools | `readOnlyHint: true`, `openWorldHint: false` |
| `declare_race` | `idempotentHint: true` |
| `remove_race` | `destructiveHint: true` |
| `sync` | `openWorldHint: true`, `idempotentHint: true` |

## Descriptions

About 60 to 90 words, in this order:

1. What it returns, in glossary terms.
2. When to use it, and the neighbouring tool to use instead when not.
3. The fixed line: "Numbers are computed by the server. Metrics that are `null` carry a reason in `nulls`; never read them as zero."

Every input field gets a `.describe()` with its format, default and limit.

(The books cross-pointer on `get_activity`, `get_training_load`, `get_weekly_volume` and `get_vdot` waits for the Knowledge Base.)

## Server instructions

Sent at initialisation, about 80 words, saying:

- The Athlete's numbers come only from the data tools.
- Never compute, estimate or extrapolate a training metric yourself. If a tool doesn't return it, say so.
- Check `freshness.stale` before giving date-sensitive advice.
- Resolve relative dates against `freshness.today`.
- Never declare a Race without the Athlete's explicit confirmation.

## Tool catalogue

| # | Tool | Purpose | Inputs | Output (besides the envelope) | Description notes |
|---|---|---|---|---|---|
| 1 | `get_athlete_profile` | Everything needed to interpret the numbers | none | `timezone`, `today`; HR Zones `{method: HR_RESERVE, restingHrBpm, maxHrBpm, floors z1–z5}`; `trimpSexCoefficient`, `analyticsVersion`; `capabilities {hrv, power, barometricAltitude}`; coverage `{firstActivityDate, activityCountsBySport, wellnessFrom}`; latest fitness age and its components | "Call this first when you need context to interpret the Athlete's numbers" |
| 2 | `list_activities` | Find Activities and compare them | `from?`, `to?`, `sport?` (`running\|cycling\|walking\|swimming\|other`), `structure?` (`interval\|continuous`), `racesOnly?`, `limit?` (20, max 100), `cursor?` | Rows, newest first: `activityId`, `startTime`, `name`, `sport`, `structure`, `distanceKm`, `timerTime(Sec)`, `pace(SecPerKm)`, `avgHrBpm`, `ascentM`, `trimp`, `race {distanceM, name} \| null`, `raceCandidate`, and for Interval Sessions `reps {count, pattern: "5×1000 m", avgPace, avgHrrcBpm}`; plus `nextCursor` | With no dates, the newest 20. Points to `get_activity` for detail |
| 3 | `get_activity` | One Activity with its Derived Metrics | `activityId` (coerced from a string or a number), `includeLaps?` (false) | The summary: the row fields + elapsed time (never used in a calculation), max HR, average and max cadence, stride, calories, ascent and descent, Workout name and steps; HR Zone time z0–z5 (s and %); `trimp`; `hrCoveragePct`; `decouplingPct` + ascent (Continuous Run of 45 min or more); the Rep table (see [analytics.md](analytics.md#rep-table)); `laps[]` on request; `race` / `raceCandidate` | Garmin's duplicate metrics (`hrTimeInZone_*`, `fastestSplit_*`, per-Activity intensity minutes) are never exposed. No stream tool |
| 4 | `get_training_load` | Fatigue, fitness and form | `from?`, `to?` (default: the last 42 days) | Daily points `{date, load, atl, ctl, tsb, incompleteDay}`; above 90 days, weekly points (end-of-week ATL/CTL/TSB + summed load); `current {date, atl, ctl, tsb, ctlWarmingUp}` | No ramp rate or other metric outside [analytics.md](analytics.md) |
| 5 | `get_weekly_volume` | Running totals per Monday-to-Sunday week | `from?`, `to?` (default: the last 8 weeks, max 53) | Rows keyed by `weekStart`: distance, Timer Time, run count, longest run, ascent, HR Zone time, summed Training Load (all sports), % change in distance; `partial` on the current week | |
| 6 | `get_vdot` | VDOT, Training Paces and race predictions | `asOf?` (a date; applies the 12-week rule as of that date) | `vdot` + its source Race + `vdotStale`; Training Paces E (range), M, T, I, R as `pace` + `paceSecPerKm`; predictions 5K / 10K / HM / M; the Races that count, each with its VDOT | With no Race: `vdot: null` (`no_race`) and a hint to call `list_races`. Notes that Daniels' tables are not reproduced |
| 7 | `list_races` | Declared Races and Race Candidates | none | `races[] {activityId, date, name, distanceM, time, vdot, orphaned}`; `candidates[] {activityId, date, distanceKm, time, reason}` | Candidates are never applied automatically |
| 8 | `declare_race` | Declare or replace a Race (local store only) | `activityId`, `distanceM` (positive), `name?` | The Race + `vdotBefore` / `vdotAfter` | "Only after the Athlete has explicitly confirmed the Activity and its official distance in this conversation; never declare a Race Candidate on your own." Lists 5000 / 10000 / 21097.5 / 42195 |
| 9 | `remove_race` | Remove a declared Race | `activityId` | The removed Race + `vdotBefore` / `vdotAfter` | `race_not_found` if there is none |
| 10 | `get_wellness` | Daily Wellness Data | `from?`, `to?` (default: the last 7 days, max 92), `metrics?` (`sleep\|rhr\|stress\|bodyBattery\|steps\|intensityMinutes\|respiration\|weight`, default all) | One row per date: `sleep {totalSec, totalText, deepSec, lightSec, remSec, awakeSec}`, `rhr {rhrBpm, rhr7dAvgBpm}`, `stress {avg, max, restSec, lowSec, mediumSec, highSec}`, `bodyBattery {min, max, charged, drained}`, `steps`, `intensityMinutes {moderate, vigorous}`, `respiration {avgBrpm}`, `weightKg`; Missing Day / not synced in `nulls` | No sleep score (none in the data), no HRV (see `capabilities`), no intraday timelines, no composite readiness score. Claude combines this with `get_training_load` |
| 11 | `sync` | Run an incremental Sync now | none | `status ok\|failed\|running`, `counts {activitiesAdded, activitiesUpdated, activitiesSoftDeleted, wellnessDaysRefreshed}`, `durationSec`, `errors[]`, `progress?` | Blocks up to 60 s, then returns `running` with progress. "Call only when `freshness.stale` is true or the Athlete says they just finished an Activity, never before every answer." Reports a Sync already running instead of starting a second |

## Module map

Each module keeps its tool adapters in `tools/`.

| Module | Holds |
|---|---|
| `athlete` | #1; the profile, HR Zone snapshots and capabilities |
| `activities` | #2–3; FIT decode, Reps and Derived Metrics |
| `training` | #4–6 |
| `races` | #7–9; Race Candidate detection |
| `wellness` | #10 |
| `sync` | #11; the Garmin client, token, scheduler and run log |
| `src/mcp/envelope/` | the `freshness` builder, `nulls`, error tiers and the size guard |

## Tracing

Each tool call gets an OpenInference TOOL span with `tool.name`, `tool.description`, `tool.parameters`, `input.value`, the full `output.value` and exceptions, plus:

- `session.id`: the MCP session id;
- `garmin_mcp.result.count` and `garmin_mcp.result.truncated`;
- `garmin_mcp.freshness.stale` and `garmin_mcp.freshness.last_synced_at`;
- `garmin_mcp.null_reasons`: the distinct reason codes in the response;
- `garmin_mcp.analytics_version`;
- `garmin_mcp.error.code`.

Child spans: auto-instrumented `pg` spans; a CHAIN span `decode-fit` when a FIT File is re-decoded; a CHAIN span `sync-run`, which is the root span when the scheduler runs a Sync.

The Garmin key and the JWT never appear in any attribute. Garmin HTTP spans record the endpoint path, not the headers.

## Transport

- Streamable HTTP only, at `POST /mcp`. No stdio entrypoint; the MCP Inspector connects over HTTP.
- The server listens on `HOST`, default `127.0.0.1`. Published ports are bound to `127.0.0.1` only.
- No auth token.
- `Origin` check (DNS-rebinding protection): allow a missing `Origin` (Claude Code, `mcp-remote` and the Inspector proxy send none); allow `http://localhost:*`, `http://127.0.0.1:*` and `http://[::1]:*`; reject every other origin with 403.
- `/mcp` answers 503 until the server is ready (see [compose.md](compose.md#health-startup-and-readiness)).

## Deferred

- A resampled-stream tool (for example per 500 m), until a real question needs it.
- A composite readiness score: it would be a new metric outside [analytics.md](analytics.md).
- MCP prompts (a weekly review, a race-readiness check), after the Phoenix evals.
