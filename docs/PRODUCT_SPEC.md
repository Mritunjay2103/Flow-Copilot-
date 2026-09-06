# HexFlow Copilot — Product Specification

**Product name:** HexFlow Copilot  
**Descriptor:** A Creative Studio concept for HexCoded  
**Tagline:** Turn creative intent into executable workflows.

## Problem statement

Creative teams turn campaign briefs into production pipelines by hand: analyzing intent, writing scripts, planning scenes, building prompts, validating brand rules, and adapting for platforms. That work is fragmented across docs, chats, and tools, with no single editable, executable representation of the plan.

HexFlow Copilot turns a natural-language creative brief into an editable node-based workflow. A chat copilot then modifies the graph through conversational commands. Nodes can be executed with visible status, outputs, timings, and export—so intent becomes a inspectable, runnable DAG rather than a static document.

## Target user

A creative strategist, producer, or hiring evaluator who wants to:

- describe a short-form campaign in plain language;
- see a structured workflow immediately;
- refine the graph by talking (“add a brand check,” “branch into three hooks”);
- run nodes and inspect outputs without wiring paid generation APIs.

Primary context for this prototype: a polished **hiring / portfolio demo** for HexCoded, usable locally with Ollama and publicly with a deterministic demo engine.

## Primary user journey

1. Open HexFlow Copilot and compose a creative brief (objective, audience, platform, duration, tone, product, constraints).
2. Submit the brief → agent plans a DAG workflow (demo or Ollama).
3. Inspect the graph on a React Flow canvas; select nodes to view config and runtime.
4. Chat with the copilot to edit the graph (add/remove/replace nodes, update metadata).
5. Execute the workflow node by node (or by topological levels); watch status, timings, retries, and outputs.
6. Export / import / share the workflow JSON; review history of runs.

## Exact MVP scope

- Brief composer → validated `CreativeBrief`.
- Plan API → validated `Workflow` DAG.
- Conversational edit API → operation list applied server-side; never wholesale LLM overwrite of the graph.
- Node run API → per-node execution with honest simulated media placeholders.
- Interactive canvas (`@xyflow/react`), copilot chat, inspector, execution monitor.
- Zustand + `localStorage` persistence (no auth, no DB).
- Dual modes: **Ollama** (local) and **demo** (public / fallback).
- Export, import, and shareable URL encoding (e.g. lz-string) as specified in later build prompts.
- Unit/component tests (Vitest + RTL) and one Playwright smoke path.
- Desktop-first shell with a usable narrow-screen fallback.

## Non-goals

- Authentication, multi-user sync, or a database.
- Real image, video, voice, or music generation providers / API keys.
- Executing arbitrary user code, shell commands, or node-supplied JavaScript.
- Distributed production rate limiting, billing, or multi-tenant isolation.
- Mobile-native app or fully mobile-optimized creative tooling.
- Claiming that demo/simulated artifacts were produced by a real model or provider.

## Ollama mode versus demo mode

| | **Ollama mode** | **Demo mode** |
|--|-----------------|---------------|
| **Where** | Local (`AI_MODE=ollama` or reachable `auto`) | Public Vercel (`AI_MODE=demo`) and local fallback |
| **Planning / editing / text nodes** | Real LLM via Ollama `/api/chat` + JSON Schema structured outputs | Deterministic interactive engine |
| **Media nodes** | Still placeholders (`needs_provider` / `simulated: true`) | Same honesty rules |
| **Network** | Server → `OLLAMA_BASE_URL` only; never from the browser | No Ollama calls |
| **UI** | May show active model name when safe | Must display **Demo engine** clearly |

`AI_MODE=auto` tries Ollama once and falls back to demo only for connection, timeout, or unavailable-model failures—not for schema bugs or programmer errors.

## Functional acceptance criteria

- A valid brief always yields either a Zod-validated DAG or an explicit, sanitized error.
- Chat edits appear as a validated operation list; empty operations do not bump workflow version or claim success.
- Graphs with cycles, missing endpoints, duplicate IDs, or unreachable enabled nodes are rejected before canvas/execution.
- Node execution shows status transitions, outputs, timings, and honest warnings for provider-dependent nodes.
- Client never receives `OLLAMA_BASE_URL` or accepts a client-supplied Ollama URL.
- Public demo remains fully usable for plan → edit → execute without any external LLM.

## Accessibility expectations

- Keyboard-reachable primary actions (brief submit, chat send, run controls).
- Meaningful labels on form fields and icon-only controls.
- Sufficient color contrast for status chips and text on the application shell.
- Focus management that does not trap the user inside the canvas or chat.
- Prefer semantic HTML and ARIA where custom widgets (React Flow, panels) need it.
- Desktop-first; narrow screens must remain operable (panels stack or collapse without losing core actions).

## Failure states

| Failure | Expected behavior |
|---------|-------------------|
| Invalid brief / oversized body | 4xx with `error.code`, human message, `retryable` |
| Ollama unreachable (`ollama` mode) | Clear actionable error; no silent fake success |
| Ollama unreachable (`auto` mode) | Fall back to demo; response states `activeMode: "demo"` |
| Malformed LLM JSON / schema fail | Bounded repair retry; then sanitized retryable error |
| Invalid graph after edit/plan | Reject; do not write into client store |
| Ambiguous edit command | Zero operations + clarifying assistant message |
| Media node run | Complete with `simulated: true` / `needs_provider` and explicit warning |
| Rate limit (prototype, in-memory) | Documented soft limit; useful error |

## Public-demo honesty requirements

- UI must label **Demo engine** when the active mode is demo.
- Artifacts from image/video/voice/music nodes must set `simulated: true` and warn that no generation provider is connected.
- Copy must not imply paid APIs, cloud LLMs, or real media generation on Vercel.
- The core loop—brief → graph → conversational edit → execute—must remain genuinely interactive and useful in demo mode.
