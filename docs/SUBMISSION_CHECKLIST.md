# Flow Copilot — Publish checklist

Use this before sharing the project publicly. Replace placeholders with your real values. Do **not** invent URLs or test results.

| Placeholder | Meaning |
|-------------|---------|
| `YOUR_LIVE_URL` | Vercel (or other) public deployment URL |
| `YOUR_REPO_URL` | Public GitHub repository URL |
| `YOUR_EMAIL` | Address you will send from |

---

## Pre-flight

- [ ] Public URL opens in **incognito** / private window: `YOUR_LIVE_URL`
- [ ] Demo mode works **without** relying on prior `localStorage` (fresh profile can plan → edit → run)
- [ ] Deployment Environment Variable **`AI_MODE=demo`** is set (Production + Preview as needed)
- [ ] UI shows **Demo engine** (not a silent Ollama failure)
- [ ] No broken primary buttons (Plan, Copilot send, Run, Export, Import, Undo/Redo, Recheck)
- [ ] Narrow / mobile layout does not block the demo (library / copilot drawers still reachable)
- [ ] GitHub repository is **public**: `YOUR_REPO_URL`
- [ ] No secrets in git history (no API keys; this prototype has none — still scan `.env*` is untracked)
- [ ] README screenshots present under `docs/screenshots/` and linked from README
- [ ] License selected on the repository (e.g. MIT) and/or `LICENSE` file added
- [ ] `npm run lint` · `npm run typecheck` · `npm run test` · `npm run build` pass on the submitted revision
- [ ] Optional: `npm run test:e2e` pass (Chromium installed)
- [ ] Share message includes **live URL** and **repository URL**

---

## Share message draft (fill placeholders)

**Subject:** Flow Copilot — creative workflow studio

**Body:**

```text
Hi,

Sharing Flow Copilot — a portfolio prototype that turns creative briefs into executable workflow graphs.

Live demo: YOUR_LIVE_URL
Repository: YOUR_REPO_URL

Public deploy runs AI_MODE=demo (deterministic interactive engine, no API keys).
Local README covers optional Ollama for the same planner/editor contracts.

Happy to walk through the 90–120s path in docs/DEMO_SCRIPT.md.

Thanks,
YOUR_NAME
```

---

## Recording / README assets

- [ ] Followed `docs/DEMO_SCRIPT.md` (Pulse X1 → hooks → subtitles → run → provider honesty → export)
- [ ] README embeds screenshots from `docs/screenshots/`

---

## Final sign-off

| Item | Value |
|------|--------|
| Live URL | `YOUR_LIVE_URL` |
| Repo URL | `YOUR_REPO_URL` |
| AI_MODE on deploy | `demo` |
| Date checked | `_YYYY-MM-DD_` |
| Revision / commit | `_commit SHA_` |

When every box above is checked, you’re ready to share.
