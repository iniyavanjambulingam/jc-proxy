# jc-proxy — Architecture & Design

## Overview

jcXproxy is a TypeScript gateway that accepts OpenAI-compatible (and Anthropic-compatible) chat requests and routes them across multiple LLM backend providers. It runs on Fastify 5, uses Zod for validation, js-yaml for config persistence, and Docker for deployment.

```
Client (Claude Code / n8n / LangChain / OpenAI SDK / Cline / Roo Code)
  │
  ▼
┌─────────────────────────────────────────────────┐
│  Fastify Server (port 3000)                     │
│                                                 │
│  ┌──────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Auth     │  │ Admin UI   │  │ Health     │  │
│  │ preHandler│  │ /admin     │  │ /health    │  │
│  └────┬─────┘  └────────────┘  └────────────┘  │
│       ▼                                         │
│  ┌──────────────────────────────────────────┐   │
│  │ Router                                   │   │
│  │ Model resolution → Provider selection    │   │
│  │ → Failover loop → Fallback chain         │   │
│  └────────────┬─────────────────────────────┘   │
│               ▼                                 │
│  ┌──────────────────────────────────────────┐   │
│  │ Provider Registry                        │   │
│  │ Groq │ Gemini │ OpenRouter │ Cloudflare  │   │
│  │      │        │            │ OpenAI-     │   │
│  │      │        │            │ Compatible  │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │ Utilities                                │   │
│  │ Logger │ Retry │ SSE │ Search │ Signature│   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
        │
        │ (Docker internal network)
        ▼
┌─────────────────────┐    ┌─────────────────────┐
│  SearXNG (port 8080)│◄──►│  Redis (port 6379)  │
│  Metasearch engine  │    │  Rate limit cache   │
│  Google, Bing, DDG  │    └─────────────────────┘
│  Wikipedia, Brave   │
│  Mojeek             │
└─────────────────────┘
```

## Request Lifecycle

### 1. Ingress

A client sends `POST /v1/chat/completions` (OpenAI format) or `POST /v1/messages` (Anthropic format). CORS is handled by `@fastify/cors`.

### 2. Authentication

`auth.ts` checks the `Authorization: Bearer <key>` or `x-api-key` header against the configured key list. On success, the key's `allowedModels` restriction is attached to the request. Invalid or missing keys return 401.

### 3. Validation

Zod schema (`ChatRequestSchema`) validates the body. Malformed requests return 400. Anthropic-format requests go through a translator (`anthropic.ts`) that remaps model names, flattens content blocks, and converts tool definitions to OpenAI shape.

### 4. Model Access Check

If the API key has `allowedModels`, the requested model is checked against it. Disallowed models return 403.

### 5. Model Resolution

The registry resolves the model in four priority steps:

```
1. Dedicated models     → always route to their assigned provider
2. Alias expansion      → "coding" checks aliases.coding for the first resolvable model
3. Provider prefix      → "groq/llama-3.3-70b-versatile" routes to the Groq provider
4. Routing strategy     → priority (first match), round-robin (rotate), random (shuffle)
```

### 6. Provider Execution with Failover

```
for each candidate provider:
  try:
    provider.chat(request) or provider.stream(request)
    → success: record health, log, return response
  catch retryable error (429, 5xx):
    → record failure, try next provider
  catch non-retryable error (400, 401, 403):
    → throw immediately
```

If all providers return 429, the router jumps to the next model in the fallback chain.

### 7. Model Fallback Chain

When all channels for a model are rate-limited, the router transparently falls back:

```typescript
// Configurable via YAML — example default chains:
const DEFAULT_FALLBACK_CHAINS = {
  'gemini-2.5-flash':              ['gemini-3.1-flash-lite-preview', 'gemini-1.5-flash', 'llama-3.3-70b-versatile'],
  'gemini-3.1-flash-lite-preview': ['gemini-2.5-flash',              'gemini-1.5-flash', 'llama-3.3-70b-versatile'],
  'gemini-1.5-flash':              ['gemini-2.5-flash',              'llama-3.3-70b-versatile'],
};
```

### 8. Web Search Interception

If a model responds with a `web_search` tool call, the router:

1. Executes the search via Tavily / Brave / SearXNG / DuckDuckGo (parallel fan-out, deduped by URL)
2. Appends grounded results to the conversation history
3. Re-dispatches to `gemini-3.1-flash-lite-preview` for the next turn
4. Repeats up to 3 search rounds, then disables the `web_search` tool

SearXNG is bundled as a Docker sidecar — no external API key needed. It queries Google, Bing, DuckDuckGo, Wikipedia, Brave, and Mojeek in parallel. Tavily and Brave are used as additional sources when their API keys are configured. DuckDuckGo is always included as a baseline fallback.

### 9. Streaming

For streaming requests, the route handler calls `reply.hijack()` to take over the raw socket. Chunks are formatted as SSE via `formatSSE()`. The stream ends with `data: [DONE]\n\n`. For Anthropic-format streaming, OpenAI chunks are translated into Anthropic SSE event types (`message_start`, `content_block_start/delta/stop`, etc.).

### 10. Logging

Every completed request is logged with provider ID, model name, latency, HTTP status, and retry count. Logs are stored in a 1,000-entry in-memory ring buffer, accessible via the admin dashboard.

---

## Module Architecture

### Boot & Configuration

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point. Loads config, initializes registry, creates Fastify instance, registers routes, starts listening. |
| `src/config.ts` | Singleton `AppConfig`. Reads/writes YAML. `getConfig()`, `saveConfig()`, `updateConfig(updater)` for atomic mutations. |
| `src/types.ts` | All interfaces and Zod schemas: `AppConfig`, `ProviderConfig`, `ChatRequest`, `ChatResponse`, `StreamChunk`, etc. |

### HTTP Routes

| File | Endpoint | Purpose |
|------|----------|---------|
| `src/routes/chat.ts` | `POST /v1/chat/completions` | Main chat endpoint. Validates, enforces model permissions, streams or returns JSON. |
| `src/routes/models.ts` | `GET /v1/models` | Lists available models. Filters by API key's `allowedModels` when present. |
| `src/routes/anthropic.ts` | `POST /v1/messages` | Anthropic API translation layer. Converts between Anthropic and OpenAI formats. |
| `src/routes/admin.ts` | `GET /admin` + `/admin/api/*` | Dashboard UI and full REST API for managing providers, keys, aliases, routing, logs. Session + Bearer auth. |
| `src/routes/health.ts` | `GET /health` | Returns health snapshots for all providers. |
| `src/auth.ts` | — | Fastify preHandler. Validates bearer tokens, attaches `apiKeyConfig` to request. |
| `src/adminAuth.ts` | — | Fastify preHandler. Session cookie + Bearer token auth for admin routes. |
| `src/sessionManager.ts` | — | In-memory session store. 24h expiry, random 32-byte IDs, HttpOnly cookie generation. |

### Routing & Orchestration

| File | Purpose |
|------|---------|
| `src/router.ts` | Decision engine. Model resolution, provider selection, failover loop, fallback chains, web search interception. |
| `src/services/provider-registry.ts` | Maintains model-to-provider mappings. Handles model discovery, alias expansion, routing strategies. |
| `src/services/fallbackService.ts` | Centralized fallback chain lookups. Single source of truth for router. |
| `src/services/healthService.ts` | Per-provider health tracking: EMA latency, consecutive failures, active requests. |
| `src/services/logService.ts` | Structured logging with ring buffer, stats, and disk persistence (JSONL). |

### Provider Implementations

| File | Provider | Notes |
|------|----------|-------|
| `src/providers/base.ts` | Base class | Abstract contract + static health tracking, 60s cooldown for 429s. |
| `src/providers/gemini.ts` | Gemini | Most complex. Translates OpenAI format to Gemini API. Handles thought signatures, tool param sanitization. |
| `src/providers/groq.ts` | Groq | Thin wrapper. OpenAI-compatible endpoint. |
| `src/providers/openrouter.ts` | OpenRouter | Thin wrapper. Adds `HTTP-Referer` header. |
| `src/providers/cloudflare.ts` | Cloudflare Workers AI | Maps model names to `@cf/` prefixed IDs. Streaming only. |
| `src/providers/openai-compatible.ts` | Generic | Escape hatch for any OpenAI-compatible endpoint. |

### Utilities

| File | Purpose |
|------|---------|
| `src/utils/logger.ts` | In-memory ring buffer (1,000 entries). `log()`, `getLogs()`, `clearLogs()`. |
| `src/utils/retry.ts` | `isRetryable(status)` — true for 429, 500, 502, 503, 504. |
| `src/utils/stream.ts` | `formatSSE(chunk)` and `SSE_DONE` constant. |
| `src/utils/search.ts` | Web search fan-out: Tavily, Brave, SearXNG, DuckDuckGo. Deduped by URL. |
| `src/utils/signature-store.ts` | Persistent TTL cache for Gemini thought signatures. Survives restarts. |

### Frontend

| File | Purpose |
|------|---------|
| `src/dashboard.ts` | Embedded HTML/JS/CSS string. Admin dashboard with grouped provider cards, model selectors, API key management, logs viewer. |

---

## Provider Capabilities

| Capability | Gemini | Groq | OpenRouter | Cloudflare | OpenAI-Compatible |
|------------|--------|------|------------|------------|-------------------|
| Tools      | ✓      | ✓    | ✓          | ✗          | ✓                 |
| Streaming  | ✓      | ✓    | ✓          | ✓          | ✓                 |
| Vision     | ✓      | ✗    | ✓          | ✗          | ✓                 |
| Embeddings | ✓      | ✗    | ✗          | ✗          | ✓                 |
| JSON Mode  | ✓      | ✗    | ✓          | ✗          | ✓                 |
| Reasoning  | ✓      | ✓    | ✓          | ✗          | ✓                 |

---

## Tool Calling Flow

```
Client sends:
{
  model: "gemini/gemini-2.5-flash",
  tools: [{ type: "function", function: { name, parameters } }],
  messages: [...]
}
         │
         ▼
gemini.ts: mapTools()
  ├── Strip unsupported JSON Schema fields (additionalProperties, $schema, $ref, $defs)
  └── Convert to Gemini format: { functionDeclarations: [...] }
         │
         ▼
gemini.ts: mapMessages()
  ├── role: "system" → inject as user + model "Understood."
  ├── role: "tool" → batch into functionResponse parts
  └── assistant tool_calls → convert to functionCall parts
         │
         ▼
Gemini API returns functionCall parts
         │
         ▼
gemini.ts: response mapping
  ├── functionCall → tool_calls in OpenAI format
  └── Return: { choices[0].message.tool_calls: [...] }
```

---

## Anthropic API Translation

`anthropic.ts` enables Claude Code and Anthropic-native clients to use any backend:

| Anthropic Feature | Translation |
|-------------------|-------------|
| `claude-*` models | Maps to `claudeCode.target` from config (default `gemini-3.1-flash-lite-preview`) |
| Content blocks (text, image, document, tool_use, tool_result) | Flattened to OpenAI message format |
| `tool_choice` (auto, any, tool, none) | Converted to OpenAI `tool_choice` |
| Streaming events | OpenAI SSE chunks re-mapped to Anthropic event types |

---

## Health Tracking

```
BaseProvider.recordSuccess(id, latency)
  ├── successCount++
  ├── latency = measured
  └── healthy = true

BaseProvider.recordFailure(id, status)
  ├── failureCount++
  ├── lastFailure = timestamp
  ├── if status == 429: rateLimitCount++, 60s cooldown
  └── if failureCount > 5: healthy = false
```

---

## Admin Dashboard

The dashboard is embedded as an HTML string in `src/dashboard.ts`. Features:

- **Grouped provider cards** — providers grouped by type (Gemini, Groq, etc.) with collapsible sections
- **Per-type "Add Channel" buttons** — pre-fills the type in the add modal
- **Auto-generated IDs** — prevents duplicate provider IDs
- **Model selector** — shows discovered models filtered by type when adding a channel
- **Health dots** — green/red indicators per provider
- **Model tags** — shows enabled vs discovered model counts
- **Refresh/Edit/Delete** — per-provider controls
- **API key management** — create keys with per-model allowlists
- **Model aliases** — map friendly names to model lists
- **Routing mode** — switch between priority, round-robin, random
- **Web search config** — Tavily API key, Brave API key, SearXNG URL
- **API logs** — real-time log viewer with provider filtering

---

## File Structure

```
src/
├── index.ts                    Server entry, route registration
├── config.ts                   YAML config load/save/update
├── types.ts                    Interfaces and Zod schemas
├── auth.ts                     Bearer token authentication
├── router.ts                   Routing logic, failover, fallback
├── dashboard.ts                Embedded admin HTML/JS/CSS
├── providers/
│   ├── base.ts                 Abstract base + health tracking
│   ├── gemini.ts               Gemini API (custom mapping)
│   ├── groq.ts                 Groq API (OpenAI-compatible)
│   ├── openrouter.ts           OpenRouter API (OpenAI-compatible)
│   ├── cloudflare.ts           Cloudflare Workers AI API
│   └── openai-compatible.ts    Generic OpenAI-compatible endpoint
├── routes/
│   ├── chat.ts                 POST /v1/chat/completions
│   ├── models.ts               GET /v1/models
│   ├── anthropic.ts            POST /v1/messages (Anthropic translation)
│   ├── admin.ts                Admin dashboard + REST API
│   └── health.ts               GET /health
├── services/
│   └── provider-registry.ts    Model-to-provider mapping + discovery
└── utils/
    ├── logger.ts               In-memory log buffer
    ├── retry.ts                Retryable status codes
    ├── stream.ts               SSE formatting
    ├── search.ts               Multi-backend web search
    └── signature-store.ts      Gemini thought signature cache

config/
└── config.example.yaml         Example configuration

searxng/
└── settings.yml                SearXNG instance configuration

docs/
└── gemini-tool-calls-rca.md    Gemini tool call debugging notes
```

---

## Dependency Graph

```
index.ts
  ├── config.ts ──────────────── types.ts
  ├── router.ts ──────────────── services/provider-registry.ts
  │     ├── utils/retry.ts           ├── providers/base.ts ──── types.ts
  │     ├── utils/logger.ts          ├── providers/groq.ts
  │     └── utils/search.ts          ├── providers/gemini.ts ── utils/signature-store.ts
  │           └── utils/logger.ts    ├── providers/openrouter.ts
  │           └── config.ts          ├── providers/cloudflare.ts
  │                                  └── providers/openai-compatible.ts
  ├── routes/chat.ts ────────── auth.ts, router.ts, types.ts, utils/stream.ts
  ├── routes/models.ts ──────── auth.ts, router.ts
  ├── routes/anthropic.ts ───── auth.ts, router.ts, types.ts
  ├── routes/admin.ts ───────── config.ts, router.ts, dashboard.ts, utils/logger.ts
  └── routes/health.ts ──────── providers/base.ts
```

---

## Deployment

### Docker (Recommended)

```bash
docker compose up -d --build
```

This starts 3 containers:

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `jcxproxy` | Built from Dockerfile | `3000` (exposed) | API gateway |
| `searxng` | `searxng/searxng:latest` | `8080` (internal) | Self-hosted metasearch engine |
| `redis` | `redis:7-alpine` | `6379` (internal) | SearXNG rate limit cache |

SearXNG is only accessible from the jcxproxy container via Docker's internal network — no host port exposed. Web search works out of the box with zero API keys.

### Configuration

Edit `config/config.example.yaml`:

```yaml
listen:
  port: 3000
  host: 0.0.0.0

apiKeys:
  - key: sk-your-api-key
    allowedModels: []          # empty = all models allowed

routing:
  mode: priority               # priority | round-robin | random
  providers:
    - id: '1'
      type: gemini
      apiKey: AIzaSy...
    - id: '2'
      type: groq
      apiKey: gsk_...

aliases:
  coding:
    - groq/llama-4
    - openrouter/qwen3-coder

webSearch:
  tavilyApiKey: tvly-...       # optional
  braveApiKey: bsv1_...        # optional
  searxngUrl: http://searxng:8080  # bundled SearXNG (Docker) or external

claudeCode:
  enabled: true
  target: gemini-3.1-flash-lite-preview
  fallbacks:
    - gemini-2.5-flash
    - llama-3.3-70b-versatile
```

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Provider health status |
| GET | `/v1/models` | Yes | List models (filtered by key permissions) |
| POST | `/v1/chat/completions` | Yes | OpenAI-compatible chat |
| POST | `/v1/messages` | Yes | Anthropic-compatible chat |
| GET | `/admin` | Session/Bearer | Admin dashboard UI |
| POST | `/admin/api/login` | Admin key | Create session cookie |
| POST | `/admin/api/logout` | Session | Destroy session cookie |
| GET | `/admin/api/config` | Session/Bearer | Full config dump |
| POST | `/admin/api/providers` | Session/Bearer | Add provider |
| PUT | `/admin/api/providers/:id` | Session/Bearer | Update provider |
| DELETE | `/admin/api/providers/:id` | Session/Bearer | Delete provider |
| POST | `/admin/api/providers/:id/refresh-models` | Session/Bearer | Re-discover models |
| GET | `/admin/api/health` | Session/Bearer | Health data |
| GET | `/admin/api/models` | Session/Bearer | All discovered models |
| GET | `/admin/api/logs` | Session/Bearer | Request logs |

---

## Key Design Decisions

1. **Model prefix routing** — `gemini/model-name` routes directly to Gemini, stripping the prefix
2. **Tool param sanitization** — Gemini rejects `additionalProperties`/`$schema`; stripped before forwarding
3. **Embedded HTML** — Dashboard is a TS string constant, no file path dependency at runtime
4. **Config persistence** — Admin API mutations write to YAML immediately via `updateConfig()`
5. **Failover on retryable only** — 429/5xx trigger next provider; 400/401/403 fail immediately
6. **Thought signature cache** — Gemini reasoning tokens persist across restarts and channel failovers
7. **Auto-generated provider IDs** — Prevents duplicate ID issues in the registry
8. **Per-key model filtering** — `/v1/models` respects API key permissions, not just chat endpoints
9. **Bundled SearXNG** — Self-hosted metasearch via Docker sidecar; zero API keys required for web search
10. **Configurable fallback chains** — Users customize model fallbacks via YAML or admin dashboard
11. **Claude Code config** — Dedicated `claudeCode` section routes all `claude-*` models to a chosen target with ordered fallbacks
