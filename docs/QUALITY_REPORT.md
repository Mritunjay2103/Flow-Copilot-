# HexFlow Copilot — Quality Report

**Date:** 2026-09-06  
**Scope:** Prompt 15 security pass + Prompt 17 final visual/functional audit  
**Mode under test:** `AI_MODE=demo` (Vitest + Playwright)

## Commands run (final)

| Command | Result |
|---------|--------|
| `npm run lint` | **Pass** (0 errors) |
| `npm run typecheck` | **Pass** |
| `npm run test` | **Pass** — 18 files, **159** tests |
| `npm run build` | **Pass** |
| `npm run test:e2e` | **Pass** — 3 tests (1 smoke + 2 audit), 0 failed |

### Exact pass/fail counts

- **Unit / component / API (Vitest):** 159 passed, 0 failed  
- **E2E (Playwright Chromium):** 3 passed, 0 failed  
  - `e2e/home.spec.ts` — core smoke  
  - `e2e/final-audit.spec.ts` — desktop 1440×900 full recruiter path  
  - `e2e/final-audit.spec.ts` — narrow 390×844 operable layout  
- **Lint / typecheck / production build:** all passed  

Screenshots saved under `docs/screenshots/` (descriptive filenames `01`–`14`).

## Final audit path verified (clean demo session)

1. Fresh context, empty `localStorage`  
2. Onboarding skip  
3. Brief composer → Pulse X1 sample → plan  
4. Canvas nodes readable; fitView after plan/edit  
5. Copilot: “Add three hook variants before the script.” → graph changes (move before script)  
6. Copilot: “Replace voice-over with subtitles.” → VO removed, subtitles present  
7. Run → progress / completed + **Needs provider** rows  
8. Scene Planner inspector output  
9. Export JSON download  
10. Refresh → persistence  
11. Undo / redo  
12. Share URL opened in a fresh context  

Narrow: library/copilot drawers + run without horizontal overflow blockers.

## Security controls verified

| Control | Status | Notes |
|---------|--------|-------|
| Ollama URL server-only; never accepted from clients | Verified | `server-only` config; strict Zod bodies; settings strip provider URLs |
| No API keys or secrets in repo / client bundle | Verified | No tracked secrets; no `NEXT_PUBLIC_OLLAMA_*` |
| No `eval` / `Function` / shell / unsafe HTML | Verified | Grep-clean; instructions are data only |
| No raw stacks or internal URLs to API clients | Verified | Sanitized API errors; client URL redaction |
| Request bodies size-limited + schema-validated | Verified | Plan 20KB / edit 100KB / run 40KB |
| LLM responses schema-validated | Verified | Structured output + graph validation; no silent demo fallback for schema bugs |
| Workflows graph-validated before storage/execution | Verified | Persist, import, share, edit, demo plan |
| Bounded retries / timeouts / cancellation | Verified | Ollama + client `signalWithTimeout` |
| Import / share size limits | Verified | 1 MB import; share hash caps |
| `localStorage` hydration safe | Verified | Soft-fail parse; quota swallowed |
| Locked nodes cannot be removed | Verified | Graph ops + UI |
| Failures preserve last valid workflow | Verified | Plan/edit failure paths |
| Simulated / needs_provider labelled | Verified | UI + execution filters |
| Logs avoid full briefs / outputs | Verified | Meta-only Ollama logs |

## Issues observed in Prompt 17 and fixed

1. **Pulse X1 + “add hooks before script” was a no-op** when hooks already existed after the script → demo editor now **moves** hook variants before the script when asked.  
2. **Canvas fitView raced node measurement** → delayed second `fitView` on id/version/node-count changes so more nodes land in view.  
3. **Success toasts used error (red) styling** → `StatusBanner` with info/danger tones.  
4. **Narrow top bar crowding** → hide workflow title on small screens; keep `h1` as `sr-only` for a11y.  
5. **E2E persistence check cleared storage on reload** (test harness) → sessionStorage-gated clear only once per tab.

## Known limitations

- Not production-ready (no auth, multi-user sync, or distributed rate limits).  
- No real image/video/audio generation — media nodes stay `needs_provider` / simulated.  
- Share URLs are client-side compressed hashes with size caps.  
- Persistence is browser `localStorage` only.  
- In-memory rate limiter is per process.  
- React Flow Pro attribution warning may appear in console when attribution is hidden (non-blocking).  

## Intentionally deferred

| Item | Why |
|------|-----|
| Distributed rate limiting / CSP hardening | Outside hiring-demo MVP |
| Full automated axe suite | Manual + Playwright path coverage for submission |
| React Flow Pro license | Attribution warning only; product remains usable |

## Vercel environment setting (exact)

```text
AI_MODE=demo
```

Set for Production (and Preview if used). Do **not** set `AI_MODE=ollama` on Vercel.

## Owner manual checklist (concise)

1. Deploy with `AI_MODE=demo`.  
2. Open live URL in incognito → **Demo engine** badge.  
3. Pulse X1 → Plan → hooks command → subtitles command → Run.  
4. Confirm Needs provider on media; open Scene plan Output; Export.  
5. Refresh once (persistence); optional Share link in a second window.  
6. Spot-check ~390px width: drawers open, Run still reachable.  
7. Confirm README screenshot/GIF and `docs/SUBMISSION_CHECKLIST.md` before emailing.

## Acceptance check

The exact recruiter demo path works from a clean public-demo browser session (Playwright audit + unit coverage).
