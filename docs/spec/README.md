# MVP spec

The build-ready spec for the MVP: a single-Athlete, self-hosted MCP server that exposes the Athlete's Garmin data, computes running analytics deterministically in code, traces into Arize Phoenix and runs under Docker Compose. Implementation tickets point here instead of at the decision tickets in Linear.

Read `GLOSSARY.md` and `docs/adr/` first. These files hold the exact rules and values; the ADRs hold the reasons behind the decisions that are hard to reverse.

| File | What it fixes | Decided in |
|---|---|---|
| [mcp-surface.md](mcp-surface.md) | The 11 tools, the response envelope (`freshness`, `nulls` reason codes, error tiers, units, size guard), descriptions, server `instructions`, tracing attributes, transport | JER-12 |
| [analytics.md](analytics.md) | Rep detection, time base, data-quality rules and every metric formula | JER-9 |
| [store-and-sync.md](store-and-sync.md) | The raw layer and projections, Derived Metrics, recompute, Races, Sync triggers and diffing, token, backoff | JER-10, JER-7 |
| [compose.md](compose.md) | `compose.yaml`, the `Dockerfile`, Postgres databases, env, readiness, operator CLI, connecting Claude, backups | JER-13 |
| [testing.md](testing.md) | Fixtures, the Synthetic Athlete, oracles, tolerances, test levels, fakes, Clock, leak guards | JER-14, JER-16 |

## Scope

The MVP is the Athlete-data side only. The Knowledge Base (RAG over Running Books) is deferred until the MVP runs: no `search_running_books`, `list_running_books` or `read_running_book_passage` tool, no `knowledgeBase` block, no books cross-pointer in descriptions, no `knowledge-base` module, no `kb` schema, no `docling-sidecar` or `tei-embed` service. Postgres keeps the pgvector image so the Knowledge Base can be added later without changing the database image.

After the MVP, in order: Phoenix evals, then MCP prompts, then the Knowledge Base.

Out of scope: more than one Athlete, writing back to Garmin, access from outside localhost, a custom agent app (the MCP client decides when to call tools), and analytics dedicated to sports other than running.

## Standing rules

- Every number is computed by the server, never by the LLM.
- Real Garmin data never enters the repo (ADR 0002). This spec states rules and formulas, never the Athlete's own values; those live in the gitignored `.garmin-samples/`.
- Open source where possible.
