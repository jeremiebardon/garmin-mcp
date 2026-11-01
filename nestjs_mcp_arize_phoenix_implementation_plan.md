# NestJS MCP Server + Arize Phoenix Observability Implementation Plan

This implementation plan outlines the step-by-step architecture and execution path for building a production-ready **Model Context Protocol (MCP)** server in **NestJS**, complete with decorator-driven auto-discovery and zero-boilerplate **Arize Phoenix (OpenInference + OpenTelemetry)** observability.

---

## 1. Target Directory Structure

```text
src/
├── observability/                        # Phase 1: Global OpenTelemetry + Arize Phoenix Setup
│   ├── instrumentation.ts                # MUST load BEFORE NestFactory (OTLP Exporter + MCP Instrumentor)
│   ├── observability.module.ts           # @Global() module exporting custom tracer helpers
│   └── phoenix-tracer.service.ts         # Helper for manual spans (e.g., RAG / DB / external APIs)
│
├── mcp/                                  # Phase 2: Core MCP Infrastructure & Discovery Module
│   ├── decorators/                       # Custom metadata decorators
│   │   ├── mcp-tool.decorator.ts         # @McpTool({ name, description, schema })
│   │   ├── mcp-resource.decorator.ts     # @McpResource({ uri, name, mimeType })
│   │   └── mcp-prompt.decorator.ts       # @McpPrompt({ name, description })
│   ├── transports/                       # Phase 4: Transport adapters
│   │   ├── stdio.transport.ts            # Local CLI / Stdio integration helper
│   │   └── sse.controller.ts             # Remote HTTP + SSE / Streamable HTTP endpoints
│   ├── services/
│   │   ├── mcp-server.service.ts         # Wraps @modelcontextprotocol/sdk McpServer singleton
│   │   └── mcp-registry.service.ts       # Scans providers via DiscoveryService & wraps tools in OTel spans
│   ├── interfaces/
│   │   └── mcp-metadata.interface.ts     # TypeScript types for decorator metadata
│   └── mcp.module.ts                     # @Global() MCP module
│
├── modules/                              # Phase 3: Domain / Feature Modules
│   ├── analytics/                        # Example Domain Module
│   │   ├── tools/
│   │   │   └── analyze-metrics.tool.ts   # Injectable adapter class using @McpTool()
│   │   ├── resources/
│   │   │   └── user-profile.resource.ts  # Injectable adapter class using @McpResource()
│   │   ├── prompts/
│   │   │   └── review-plan.prompt.ts     # Injectable adapter class using @McpPrompt()
│   │   ├── analytics.service.ts          # Pure domain logic (shared with REST/GraphQL)
│   │   └── analytics.module.ts
│
├── app.module.ts
├── main.ts                               # Imports './observability/instrumentation' on Line 1 (HTTP/SSE mode)
└── main-stdio.ts                         # Imports './observability/instrumentation' on Line 1 (Stdio mode)
```

---

## 2. Phase-by-Phase Execution Plan

### Phase 1: Bootstrap OpenTelemetry & Arize Phoenix
**Objective:** Initialize OpenTelemetry before any `@nestjs/*` or `@modelcontextprotocol/sdk` modules are imported so Node modules and MCP transports are properly instrumented.

#### 1.1 Install Dependencies
```bash
# Core MCP & Validation
npm install @modelcontextprotocol/sdk zod @nestjs/core @nestjs/common reflect-metadata

# OpenTelemetry & Arize Phoenix (OpenInference)
npm install @opentelemetry/api \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/sdk-trace-base \
  @opentelemetry/exporter-trace-otlp-proto \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/instrumentation \
  @arizeai/openinference-semantic-conventions \
  @arizeai/openinference-instrumentation-mcp
```

#### 1.2 Deliverables
- [ ] **`src/observability/instrumentation.ts`**:
  - Configure `OTLPTraceExporter` pointing to `process.env.PHOENIX_COLLECTOR_ENDPOINT` (default: `http://localhost:6006/v1/traces`).
  - Configure `NodeTracerProvider` with `ATTR_SERVICE_NAME` and `SEMRESATTRS_PROJECT_NAME`.
  - Register `MCPInstrumentation()` via `registerInstrumentations()` to automatically extract `traceparent` metadata from incoming MCP JSON-RPC requests.
- [ ] **`src/observability/phoenix-tracer.service.ts`**:
  - Create an `@Injectable()` wrapper around `trace.getTracer('domain-tracer')` for manual child spans (e.g., `OpenInferenceSpanKind.RETRIEVER` or `CHAIN`).
- [ ] **`src/observability/observability.module.ts`**:
  - Mark with `@Global()` and export `PhoenixTracerService`.

---

### Phase 2: Build the MCP Core & Decorator Discovery Layer
**Objective:** Create a decoupled MCP infrastructure module that uses NestJS's `DiscoveryModule` to automatically find and register `@McpTool`, `@McpResource`, and `@McpPrompt` methods on startup, wrapping each execution in an OpenInference `TOOL` span.

#### 2.1 Deliverables
- [ ] **`src/mcp/interfaces/mcp-metadata.interface.ts`**:
  - Define `McpToolOptions`, `McpResourceOptions`, and `McpPromptOptions` interfaces.
- [ ] **`src/mcp/decorators/mcp-tool.decorator.ts`**:
  - Create `@McpTool(options)` using `SetMetadata(MCP_TOOL_METADATA, options)`.
- [ ] **`src/mcp/services/mcp-server.service.ts`**:
  - Instantiate and expose the singleton `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`.
- [ ] **`src/mcp/services/mcp-registry.service.ts`**:
  - Implement `OnModuleInit`.
  - Inject `DiscoveryService`, `MetadataScanner`, and `Reflector`.
  - Iterate over all singleton providers in the NestJS container and scan their prototype methods for `MCP_TOOL_METADATA`.
  - Bind discovered methods to their provider instance (`prototype[methodName].bind(instance)`).
  - Wrap the bound execution inside `tracer.startActiveSpan('mcp.tool.<name>')` with `OpenInferenceSpanKind.TOOL`, recording:
    - `SemanticConventions.TOOL_NAME`
    - `SemanticConventions.TOOL_DESCRIPTION`
    - `SemanticConventions.TOOL_PARAMETERS` & `INPUT_VALUE`
    - `SemanticConventions.OUTPUT_VALUE`
    - Exception recording and `SpanStatusCode.ERROR` on failure.
- [ ] **`src/mcp/mcp.module.ts`**:
  - Import `DiscoveryModule` from `@nestjs/core` and export `McpServerService`.

---

### Phase 3: Implement Domain Modules & Thin Tool Adapters
**Objective:** Keep MCP protocol concerns out of core business services by creating thin `@Injectable()` tool adapter classes inside each domain module.

#### 3.1 Deliverables
- [ ] **`src/modules/<domain>/<domain>.service.ts`**:
  - Implement pure domain logic (database queries, calculations, external API calls).
- [ ] **`src/modules/<domain>/tools/<action>.tool.ts`**:
  - Define strict `zod` schemas with `.describe()` annotations on every field so LLM agents understand parameter constraints.
  - Inject the domain service and decorate the handler method with `@McpTool({ name, description, schema })`.
  - Format return payloads into standard MCP response blocks (`{ content: [{ type: 'text', text: JSON.stringify(result) }] }`).
- [ ] **`src/modules/<domain>/<domain>.module.ts`**:
  - Register tool and resource adapter classes in the module's `providers` array so `DiscoveryService` can inspect them.

---

### Phase 4: Wire Dual Transports (Stdio & Streamable HTTP/SSE)
**Objective:** Support both local subprocess execution (Claude Desktop, Cursor, MCP Inspector) and remote multi-tenant cloud agents (LangGraph, custom orchestrators).

#### 4.1 Deliverables
- [ ] **`src/main-stdio.ts` (Local CLI Entrypoint)**:
  - **Line 1:** `import './observability/instrumentation';`
  - Bootstrap using `await NestFactory.createApplicationContext(AppModule, { logger: false });` so NestJS startup logs never pollute `stdout` (which corrupts the JSON-RPC stream).
  - Retrieve `McpServerService` and connect `StdioServerTransport`.
- [ ] **`src/mcp/transports/sse.controller.ts` (Remote HTTP/SSE Entrypoint)**:
  - Expose endpoints for remote MCP connections (`GET /mcp/sse` and `POST /mcp/messages` or Streamable HTTP `/mcp`).
  - Apply NestJS `@UseGuards()` for API key or Bearer token authentication.
- [ ] **`src/main.ts` (HTTP Server Entrypoint)**:
  - **Line 1:** `import './observability/instrumentation';`
  - Bootstrap standard HTTP server via `await NestFactory.create(AppModule);`.
- [ ] **`package.json` Scripts**:
  - `"start:stdio": "node dist/main-stdio.js"`
  - `"start:http": "node dist/main.js"`

---

### Phase 5: End-to-End Verification & Trace Inspection
**Objective:** Verify JSON-RPC protocol compliance, Zod validation, and distributed trace propagation in Arize Phoenix.

#### 5.1 Verification Checklist
- [ ] **Start Local Arize Phoenix Collector**:
  ```bash
  docker run -d --name phoenix -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest
  ```
- [ ] **Test Tool Discovery & Execution via MCP Inspector**:
  ```bash
  npm run build
  npx @modelcontextprotocol/inspector node dist/main-stdio.js
  ```
- [ ] **Verify Phoenix Traces (`http://localhost:6006`)**:
  - Confirm project registration under `PHOENIX_PROJECT_NAME`.
  - Trigger a tool call in the MCP Inspector and verify a `TOOL` span appears with populated `input.value`, `tool.parameters`, and `output.value`.
  - Trigger an invalid or failing tool call and verify `SpanStatusCode.ERROR` and stack trace capture.
  - Connect an upstream instrumented client (e.g., LangGraph with `openinference-instrumentation-mcp`) and verify that NestJS tool spans nest as children under the upstream agent trace.

---

## 3. Critical Architectural Guardrails

| Guardrail | Reason | Enforcement Location |
| :--- | :--- | :--- |
| **Import `instrumentation.ts` on Line 1** | OpenTelemetry must patch Node modules (`http`, `pg`, MCP SDK) before NestJS imports them. | `src/main.ts` & `src/main-stdio.ts` |
| **Disable `stdout` logs in Stdio mode** | Any non-JSON-RPC string written to `process.stdout` immediately breaks the MCP Stdio protocol. | `src/main-stdio.ts` (`{ logger: false }`) & OTel Exporter |
| **Use `OTLPTraceExporter` (Never `ConsoleSpanExporter`)** | `ConsoleSpanExporter` writes spans to `stdout`, corrupting Stdio transport communication. | `src/observability/instrumentation.ts` |
| **Bind `this` context during discovery** | Passing an unbound prototype method to `McpServer.tool()` loses NestJS dependency injection (`this.service` becomes `undefined`). | `src/mcp/services/mcp-registry.service.ts` |