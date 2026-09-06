# HexFlow Copilot — Demo script (90–120 seconds)

Use this for a recruiter-facing screen recording. Prefer the **deployed** demo (`AI_MODE=demo`) so evaluators can replay the same path.

**Fill in before recording:** live URL = `YOUR_LIVE_URL`

---

## Timing map

| Time | Action | On-screen focus |
|------|--------|-----------------|
| 0:00–0:10 | Open live URL | Shell, **Demo engine** badge, empty state |
| 0:10–0:25 | Pulse X1 sample → Plan | Brief composer → canvas DAG |
| 0:25–0:35 | Show canvas + badge | Graph + **Demo engine** |
| 0:35–0:55 | Copilot: hooks | Graph updates |
| 0:55–1:10 | Copilot: subtitles | Graph updates |
| 1:10–1:35 | Run + Scene Planner + provider honesty | Execution + Inspector |
| 1:35–1:50 | Export JSON | Download / export dialog |
| 1:50–2:00 | Close on hypothesis | Canvas + badge |

Target length: **90–120 seconds**.

---

## Step-by-step

### 1. Open the deployed URL (≈10s)

1. Incognito / private window → `YOUR_LIVE_URL`.
2. Confirm **Demo engine** in the top bar.

**Narration:**  
“HexFlow Copilot turns a creative brief into an executable workflow graph. This public build uses the deterministic demo engine — interactive software, not a mocked screenshot — and no external API keys.”

### 2. Choose Pulse X1 and generate (≈15s)

1. Under Example briefs, open **Sneaker launch** (Pulse X1).
2. Click **Plan workflow**.
3. Wait for the canvas to fill.

**Narration:**  
“I start from the Pulse X1 sample brief. The planner returns a validated DAG — brief intake through script, scenes, and output — ready to edit.”

### 3. Canvas and mode badge (≈10s)

1. Pan briefly across the graph.
2. Point at the **Demo engine** badge.

**Narration:**  
“Everything stays on a node canvas the team can inspect. The badge makes the engine explicit so we never confuse demo with a live model.”

### 4. Copilot command — hooks (≈20s)

In Copilot, send exactly:

```text
Add three hook variants before the script.
```

**If local Ollama is slow (local recording only), say:**  
“The copilot is translating the request into validated graph operations. It does not replace the workflow blindly; the server applies the smallest safe edit and checks that the graph is still executable.”

**Narration (demo mode):**  
“I ask the copilot to add three hook variants before the script. The server applies structured operations and re-validates the graph — conversational control without losing executability.”

### 5. Copilot command — subtitles (≈15s)

Send exactly:

```text
Replace voice-over with subtitles.
```

**Narration:**  
“Second edit: replace voice-over with subtitles. Same contract — operations in, safe DAG out.”

### 6. Run the workflow (≈15s)

1. Click **Run workflow**.
2. Expand the Execution drawer; watch statuses advance.

**Narration:**  
“Running the workflow shows every step’s status and timing. Text and intelligence nodes complete; generation stays honest.”

### 7. Scene Planner output + provider honesty (≈15s)

1. Select **Scene Planner** (or the scene-planning node on the canvas).
2. Open Inspector → **Output**.
3. Select a media node (image / video / voice / music) and show **Needs provider** / simulated labelling.

**Narration:**  
“Scene Planner output is inspectable in the side panel. Media nodes are labelled needs-provider and simulated — this prototype does not claim real image or video generation.”

### 8. Export JSON (≈10s)

1. Export → Download JSON (defaults may include runtime; fine for the clip).
2. Briefly show the file name / dialog.

**Narration:**  
“Export gives a portable JSON workflow — the same structure you can import or share later.”

### 9. Close (≈10s)

Hold on canvas + **Demo engine** badge.

**Narration:**  
“The hypothesis: chatting against a node canvas cuts workflow setup friction. Next with a Creative Studio team: real providers behind these boundaries, collaborative review, and deeper brand validators — without losing honesty or DAG safety.”

---

## Local Ollama variant (optional)

If recording locally with `AI_MODE=ollama`:

1. Same script; badge may show **Ollama connected**.
2. Use the exact waiting narration in step 4 when the model thinks.
3. Still show **Needs provider** on media nodes — Ollama does not unlock fake generation.

---

## Checklist before you hit record

- [ ] `YOUR_LIVE_URL` loads in incognito  
- [ ] Mode badge shows **Demo engine** (public)  
- [ ] Pulse X1 sample plans successfully  
- [ ] Both copilot commands produce visible graph changes  
- [ ] Run completes; provider honesty is visible  
- [ ] Mic levels OK; UI zoom readable at 1080p  
