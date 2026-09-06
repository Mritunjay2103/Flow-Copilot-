# Flow Copilot — Architecture

## Client / server boundary

```
┌─────────────────────────────────────────────────────────┐
│ Browser (Next.js client components)                     │
│  Brief UI · React Flow canvas · Copilot · Inspector ·   │
│  Execution monitor · Zustand store · localStorage       │
│                                                         │
│  NEVER: OLLAMA_BASE_URL, model secrets, raw fetch to    │
│         Ollama, eval / shell, accepting Ollama URLs     │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS JSON
                            ▼
┌─────────────────────────────────────────────────────────┐
│ Next.js App Router route handlers (server only)         │
│  POST /api/agent/plan                                   │
│  POST /api/agent/edit                                   │
│  POST /api/nodes/run                                    │
│  GET  /api/health/ollama                                │
│                                                         │
│  Zod validate → mode resolve → demo | ollama adapter    │
│  Graph invariant validation before success responses    │
└───────────────┬─────────────────────────┬───────────────┘
                │                         │
                ▼                         ▼
        src/lib/demo/*            src/lib/ollama/*
        (deterministic)           (fetch → Ollama HTTP)
                                  config from env only
```

- **Client** owns presentation, optimistic UX, persistence, and orchestration of run order (topological levels). It sends validated-shaped JSON; it does not apply untrusted LLM graphs blindly—the server returns the authoritative workflow after plan/edit.
- **Server** owns AI mode resolution, Ollama HTTP, structured-output parsing, graph operation application (`applyGraphOperations`), and sanitized errors (`Cache-Control: no-store` on agent/health routes).

## Proposed folder structure

```
src/
  app/                          # App Router pages & layouts
    api/
      health/ollama/route.ts
      agent/plan/route.ts
      agent/edit/route.ts
      nodes/run/route.ts
  components/
    canvas/                     # React Flow nodes, edges, controls
    copilot/                    # Chat UI
    brief/                      # Brief composer
    inspector/                  # Selected node / workflow details
    execution/                  # Run status, history, timings
  lib/
    ai-mode.ts                  # demo | ollama | auto resolution
    agent/                      # Planner/editor prompt + normalize helpers
    demo/                       # Deterministic planner, editor, executor
    ollama/                     # Server-only config + chatStructured client
    workflow/                   # Zod schemas, DAG utils, fixtures
  store/                        # Zustand stores + persistence
  test/                         # Shared test helpers / setup
```

Documents at repo root: `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `.env.example`.

## Workflow domain model

Core types (Zod as source of truth — see Prompt 2 implementation):

- **CreativeBrief** — objective, audience, platform, duration, aspect ratio, tone, product, visual direction, required/avoid elements, optional CTA.
- **Workflow** — `schemaVersion: 1`, id, title, objective, brief, nodes, edges, timestamps, positive `version`, `mode: "demo" | "ollama"`.
- **WorkflowNode** — id, kind, label, description, position, config (`modelClass`, instruction, enabled, settings), runtime (status, timings, error, output), locked.
- **WorkflowEdge** — id, source, target, optional label, animated.
- **NodeExecutionResult** — summary, artifacts (`simulated` flag), decisions, warnings.
- **Graph operations** — discriminated union (`add_node`, `update_node`, `remove_node`, `add_edge`, `remove_edge`, `replace_edge`, `update_workflow_metadata`) with reason; **AgentEditResponse** wraps `assistantMessage`, `intentSummary`, `operations`.

**Invariants** (`validateWorkflowGraph`): unique node/edge IDs; edges reference existing nodes; no self-edges; no duplicate source→target; ≥1 `brief_input` and ≥1 `output`; enabled non-input nodes reachable from an input; enabled non-output nodes can reach an output; **no cycles**. Execution order via `topologicalLevels` for parallel-safe branches.

## Planner, editor, and execution request flow

### Plan — `POST /api/agent/plan`

1. Reject oversized / invalid body; Zod-parse `CreativeBrief`.
2. Resolve `AI_MODE` → `activeMode`.
3. **demo:** deterministic planner → Workflow.  
   **ollama:** structured `/api/chat` with Workflow JSON Schema; normalize IDs/timestamps/mode; validate DAG; one repair pass on invariant failure.
4. Return `{ workflow, assistantMessage, activeMode, model, durationMs }` or sanitized `{ error }`.

### Edit — `POST /api/agent/edit`

1. Validate incoming Workflow + invariants; cap message lengths.
2. **demo / ollama** produce `AgentEditResponse` (operations only—not a replacement graph).
3. Server applies `applyGraphOperations`; validates result; one repair if needed.
4. Empty operations → no version bump; honest assistant message.
5. Return `{ workflow, edit, activeMode, model, durationMs }`.

### Run — `POST /api/nodes/run`

1. Accept workflow context, node id, upstream outputs.
2. Demo or Ollama text execution; media kinds return simulated artifacts + warnings.
3. Client orchestrates DAG levels; never runs arbitrary code from settings.

### Health — `GET /api/health/ollama`

Returns `{ configuredMode, activeMode, reachable, model, latencyMs, message }` without exposing `OLLAMA_BASE_URL`. Demo mode skips network.

## Persistence strategy

- **Browser `localStorage`** via Zustand persist (workflow, UI preferences, chat history as scoped in later prompts).
- No server-side session store or database in MVP.
- Export/import JSON and optional compressed share links (e.g. lz-string) for handoff without accounts.
- `resetRuntimeState` clears node runtime fields without destroying graph structure.

## Validation and security boundaries

| Boundary | Rule |
|----------|------|
| Env | `OLLAMA_*` and `AI_MODE` read only on server; never `NEXT_PUBLIC_OLLAMA_*`. |
| Request | Never accept Ollama base URL from the client body. |
| Schemas | Zod on all inbound API payloads and LLM structured outputs. |
| Graphs | Invariant validation before store write, canvas trust, or execution. |
| LLM trust | Edits are operations applied server-side; planner output normalized + validated. |
| Code execution | No `eval`, `Function`, shell, or executable settings expressions. |
| Errors | Sanitize; no stack traces, internal URLs, or raw model thinking to the client. |
| Retries | Bounded (typically one repair) for structured output / graph repair. |
| Rate limit | Optional in-memory per-instance limiter for prototype abuse reduction only. |
| Honesty | Demo engine label; `simulated: true` on placeholder media. |

## Ollama integration notes

- Use `fetch` against Ollama HTTP API (no SDK): `GET /api/tags` for health; `POST /api/chat` with `stream: false`, `format: <JSON Schema>`, `options.temperature: 0`, `keep_alive`.
- Validate with Zod after JSON parse; one repair retry on parse/validation failure.
- Local `.env.local` example: `AI_MODE=ollama`, `OLLAMA_BASE_URL=http://127.0.0.1:11434`, `OLLAMA_MODEL=qwen3:4b`, timeouts/keep-alive as in `.env.example`.
- Vercel: `AI_MODE=demo` only.
