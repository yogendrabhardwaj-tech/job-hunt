# Agency — personal job-hunt workspace

A localhost web app with an AI agent that tracks the roles you apply to, scores your resume against each job, and writes a tailored copy for each one. The agent runs on the **Claude Agent SDK** and uses the 22 playbooks from [paramchoudhary/resumeskills](https://github.com/paramchoudhary/resumeskills) (MIT, vendored in `.claude/skills/`).

## Run it

```bash
npm install
npm run dev          # API on :8787, UI on http://localhost:5173
```

**Auth:** the agent uses your existing `claude` CLI login (`claude auth status`), so no API key is needed. If `ANTHROPIC_API_KEY` is set, that is used instead.

**Free models (AI sources page):** open **AI sources** in the sidebar to add OpenRouter, Hugging Face, Google Gemini, LM Studio or any other OpenAI-compatible server. Each source has its own model, key, weight and optional daily run limit.
- **Balanced** mode sends each run to the source with the least use today, relative to its weight. **Priority order** uses the top source until it is paused or fails.
- If a source fails (rate limit, quota, unreachable, model can't call tools), the run continues on the next source, and the failed one is paused for a while: 2 minutes for a per-minute rate limit, an hour for a daily quota or a bad key.
- Claude is listed as a **fallback-only** source by default, so it runs only when every free source is unavailable. Turn it off to never use your Claude plan.
- Models must support tool calling and need a context window of at least 32k (tailoring prompts are about 15–20k tokens). Use **Test** on each source to check tool calling.
- Keys are stored in `data/settings.json` (git-ignored) and never sent to the browser.

**Optional env vars:**

| Variable | Default | What it does |
|---|---|---|
| `AGENT_MODEL` | `claude-opus-5-5` | Initial model for the Claude source (change it on the AI sources page afterwards) |
| `AGENT_EFFORT` | `medium` | `low` … `max` |
| `PORT` | `8787` | API port |
| `DATA_DIR` | `./data` | Where jobs and resumes are stored |

For a single-process production build: `npm run build && npm start`, then open http://localhost:8787.

## Workflow

1. **Profile & master** — upload your resume (PDF, DOCX or text). The agent converts it to clean Markdown in `data/resumes/master_resume.md` without changing any facts. Add your achievements and LinkedIn. LinkedIn blocks scraping, so either upload the PDF from **More → Save to PDF** on your profile, or paste the text.
2. **New role (⌘K)** — paste a job URL. The app creates record `J0001`, `J0002`, … and fetches the posting:
   - Greenhouse and Lever postings come through their public JSON APIs.
   - Other sites are read from their schema.org JSON-LD or HTML.
   - Pages rendered by JavaScript fall back to the agent's WebFetch, and you can always paste the description yourself.

   The agent then extracts the must-haves, nice-to-haves, ATS keywords and red flags, and scores your master resume.
3. **Job workspace** — the score strip compares your master and tailored scores. The gap analysis lists critical, major and minor gaps, plus questions the agent wants answered. Below that is the side-by-side view: the role's requirements on the left (met / partial / missing, with evidence) and your resume on the right, with keywords highlighted.
4. **Tailor resume** — writes `<Name>_Resume_<AppJobID>_<EmployerJobID>_<Company>.md` (e.g. `Jane_Doe_Resume_J0003_372316_Deloitte_US.md`; the employer ID or company is left out when it isn't known). Your master is never modified. The agent may only use facts from your master resume, achievements and LinkedIn. The new copy is re-scored automatically. You can view the changes against the master, edit the Markdown, or export to PDF through the print view.
5. **Cover letter / interview prep / notes / status** — each job has its own tab.
6. **Copilot (⌘J)** — a chat agent that knows which page you're on. It can create jobs from links, run workflows, edit resumes, update statuses and add achievements, and it can load any of the resumeskills playbooks.

## Architecture

```
server/src
  index.ts      Express API + SSE (/api/events live bus, /api/chat streaming)
  workflows.ts  scan → analyze → tailor → cover-letter / interview-prep, import, chat
  agent.ts      routes each run to an AI source, with failover; Claude runs via the Agent SDK
  llm/          providers.ts (sources, usage, routing), openai.ts (tool-calling loop for
                OpenAI-compatible APIs), builtins.ts (WebFetch / WebSearch / Skill for that path)
  tools.ts      the agent's tools: save_job_details, save_match_analysis, save_tailored_resume, …
  extract.ts    posting fetch (ATS APIs → JSON-LD → HTML), PDF/DOCX text extraction
  keywords.ts   deterministic ATS keyword coverage (same matcher drives the UI highlights)
  store.ts      JSON db (data/db.json) + Markdown resumes (data/resumes/)
web/src         React + Vite + Tailwind UI
.claude/skills  resumeskills playbooks (inlined into workflow prompts; Skill tool in chat)
```

The agent writes all data through typed tools validated with zod, so outputs always have a fixed structure. It can only use those tools plus WebFetch, WebSearch and Skill (permission mode `dontAsk`). It has no shell access and can't write files directly.

Runs on free sources cost nothing beyond their rate limits; runs on the Claude source are billed to your Claude plan or API usage. A scan plus analysis is two agent runs; tailoring is two more (write, then re-score).
