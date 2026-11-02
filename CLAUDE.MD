This project is a MCP server to get data from user personnal GArmion data: wealthness, activities etc ...

## Architecture

src/
├── observability/                        # Global OpenTelemetry + Phoenix Setup
│   ├── instrumentation.ts                # MUST load BEFORE NestFactory (OTLP Exporter + MCP Instrumentor)
│   ├── observability.module.ts           # Provides custom Tracer & OpenInference helpers
│   └── phoenix-tracer.service.ts         # Helper for manual spans (e.g., RAG / DB / external APIs)
├── mcp/                                  # Core MCP Infrastructure Module
│   ├── decorators/                       # Custom metadata decorators
│   │   ├── mcp-tool.decorator.ts         # @McpTool({ name, description, inputSchema, outputSchema, annotations })
│   │   ├── mcp-resource.decorator.ts     # @McpResource({ uri, name, mimeType })
│   │   └── mcp-prompt.decorator.ts       # @McpPrompt({ name, description })
│   ├── transports/                       # Transport adapters
│   │   └── streamable-http.controller.ts # Stateless Streamable HTTP: POST /mcp (GET, DELETE answer 405)
│   ├── mcp-origin.guard.ts               # Origin check on every /mcp request (loopback origins only, else 403)
│   ├── envelope/                         # Response envelope toolkit
│   │   ├── reason-codes.ts               # Closed reason-code list (mirrors docs/spec/mcp-surface.md), ReasonCode type + Zod enum
│   │   ├── nulls.ts                      # nulls() builder: null fields + sibling {field: reason} map
│   │   ├── errors.ts                     # DomainMissError, closed error codes, error-result mapping (one place)
│   │   ├── trace-id.ts                   # TRACE_ID_PROVIDER token + placeholder trace id
│   │   ├── size-guard.ts                 # 25,000-char guard: trims the mainArray, sets truncated + hint
│   │   └── index.ts                      # Barrel
│   ├── services/
│   │   ├── mcp-server.service.ts         # Wraps @modelcontextprotocol/sdk McpServer
│   │   └── mcp-registry.service.ts       # Scans providers via DiscoveryService & binds handlers
│   ├── interfaces/
│   │   └── mcp-metadata.interface.ts     # TypeScript types for decorator metadata
│   └── mcp.module.ts                     # Global or dynamic module (@Global())
│
├── health/                               # Readiness gate + health endpoints
│   ├── readiness-gate.ts                 # READINESS_GATE token; default always ready
│   ├── readiness.guard.ts                # 503 on /mcp while the gate is not ready (after the Origin check)
│   ├── health.controller.ts              # GET /health/live, GET /health/ready
│   └── health.module.ts
│
├── modules/                              # Domain / Feature Modules
│   ├── example/                          # Example Domain Module
│   │   ├── tools/
│   │   │   └── analyze-metrics.tool.ts   # Injectable class using @McpTool()
│   │   ├── resources/
│   │   │   └── user-profile.resource.ts  # Injectable class using @McpResource()
│   │   ├── prompts/
│   │   │   └── review-plan.prompt.ts     # Injectable class using @McpPrompt()
│   │   ├── example.service.ts            # Pure domain logic (shared with REST/GraphQL)
│   │   └── example.module.ts
│   │
│   └── integrations/                     # External APIs / DB / Vector Store Module
│       └── ...
│
├── app.module.ts
└── main.ts                               # The only entrypoint: HTTP bootstrap, MCP over Streamable HTTP at POST /mcp

## Commands

- Fresh checkout: `npm ci`. Tests need no `.env` and no real Garmin data: fixtures are synthetic (ADR 0002).
- Server: `PORT=<port> npm run start` (3000 by default); `npm run start:dev` watches. It binds to `HOST` (`127.0.0.1` by default). Health: `GET /health/live` (always 200) and `GET /health/ready` (200, or 503 while the readiness gate says not ready).
- Validation, the same as `factory/checks.sh` and the `ci` workflow: `gitleaks git --redact .`, `npm run check:paths`, `npm run check` (lint, typecheck, unit + integration + e2e tests) and `npm run build`.
- MCP contract: `test/integration/__snapshots__/mcp-contract.json` is the snapshot of every registered tool. `npm run check` and CI fail instead of writing it; update it on purpose with `npx vitest run --project integration -u test/integration/mcp-contract.int-spec.ts`, then review and commit the diff.

## Commands

- Fresh checkout: `npm ci`. Tests need no `.env` and no real Garmin data: fixtures are synthetic (ADR 0002).
- Server: `PORT=<port> npm run start` (3000 by default); `npm run start:dev` watches.
- Validation, the same as `factory/checks.sh` and the `ci` workflow: `gitleaks git --redact .`, `npm run check:paths`, `npm run check` (lint, typecheck, unit + integration + e2e tests) and `npm run build`.

## Agent skills

### Issue tracker

Issues are tracked in Linear (team `jeremiebardon`, project `Garmin MCP`). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Software factory

`/factory run` builds every open Linear issue in project `Garmin MCP` labeled
`factory` through intake → spec → build → gate → review → approve, one GitHub
PR per issue. State is in `factory/jobs/` (gitignored); `factory/bin/job` is
its only writer. Checks: `factory/checks.sh`. The scripts need
`LINEAR_API_KEY` (a Linear personal API key) in the environment. Dashboard:
`cd factory && python -m http.server`, then open
http://localhost:8000/dashboard.html.
