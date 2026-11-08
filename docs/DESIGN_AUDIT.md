# Design audit: Agency job-hunt workspace

Date: 2026-10-29. Method: bencium `design-audit` + `typography` (Butterick) skills. Every screen (Dashboard, Applications, Job workspace, Profile, Resume library, Print view) was captured at 390 px, 1024 px and 1500 px with the copilot open, and the code under `web/src` was reviewed.

**Status:** Phase 1 implemented 2026-10-29 (see the Phase 1 log at the end). Phases 2 and 3 are awaiting approval.

There is no DESIGN_SYSTEM, APP_FLOW or PRD document yet. Tokens currently live only in `web/src/styles.css` `@theme` (brand indigo + Tailwind slate). The first proposed step is to create `docs/DESIGN_SYSTEM.md` from the tokens below.

```
DESIGN AUDIT RESULTS

Overall Assessment: On a wide desktop the app is clean and consistent, but it breaks completely below
~1100 px. Several basics are also below professional standard: meta text contrast, missing keyboard
focus, an inconsistent type scale with 15 ad-hoc sizes, and a generic purple-gradient "AI" look.

────────────────────────────────────────────

PHASE 1 — Critical

- App shell (all screens, 390 px): The fixed 232 px sidebar and 400 px copilot leave the content area 0 px wide, so
  the app is unusable on a phone → Below 768 px: sidebar becomes a top bar with a menu sheet, and the copilot becomes
  a full-screen sheet opened from a floating button → Every screen must work at every width.
- App shell (1024 px): The copilot takes 39% of the width and squeezes every page → Below 1280 px the copilot
  overlays the page (slide-over with backdrop) instead of docking; from 1280 px it docks as today →
  The page keeps its layout and the copilot is still one keystroke (⌘J) away.
- Applications (1024 px): The Role column collapses to 0 px, so the "ROLE" and "STATUS" headers overlap and titles
  disappear → Below a 640 px container, render each row as a stacked card (title / meta / status + match row) →
  The most important column must never be the one that vanishes.
- Job workspace (1024 px): The action buttons wrap mid-word ("Re-/score", "Re-tailor/resume") → Add
  whitespace-nowrap to buttons; let the button group wrap as a whole under the title → Broken labels read as bugs.
- Accessibility (all): No buttons, links, tabs or nav items have a visible keyboard focus state (only the pipeline
  cards do) → Global focus-visible ring of 2 px brand-500 with a 2 px offset → Keyboard users cannot see where
  they are (WCAG 2.4.7).
- Contrast (all): slate-400 (#94a3b8) on white is 2.6:1 and is used for informative text ("added 24m ago",
  timestamps, hints, file names). Sidebar slate-600 on slate-950 (~2.6:1) is used for "Agent activity / Idle" →
  Informative text minimum is ink-muted = slate-500 (4.8:1); sidebar labels slate-400 on slate-950 (~8:1) →
  Fails WCAG AA 1.4.3 and is hard to read on any screen.
- Profile (loading): While data loads, the page shows empty inputs and the "Drop your resume here" empty state,
  as though no profile exists → Show skeleton fields and a skeleton resume page until loaded → The empty state
  is misleading. Flag for build agent: if the user types before load finishes, "Save" can overwrite the stored
  profile with blanks (form only hydrates when not dirty). This is a functional fix outside design scope.

Review: These either block use outright (phone, tablet, keyboard) or present wrong information (contrast, false
empty state). They come before any aesthetic work.

────────────────────────────────────────────

PHASE 2 — Refinement

- Type scale (all): 15 distinct arbitrary sizes (9.5–26 px), with body copy at 13–13.5 px →
  A 7-step scale: caption 11, meta 12, small 13, body 14, title 16, heading 22, display 28. UI body text at
  14 px (Butterick: 15–25 px for reading text; 14 px is the floor for dense app UI) → Consistent rhythm and
  better legibility, and the eye learns the hierarchy.
- Font (all): "Inter" is named but never loaded, so macOS falls back to SF and Windows to Segoe. The resume uses
  Charter, which is macOS-only, so Windows and PDFs differ → Self-host two faces via @fontsource (no external
  requests): UI = "Geist" (sans, tabular figures), resume = "Source Serif 4". Max 2 families →
  Identical rendering everywhere, and printed PDFs match the screen.
- Card headings (all): Every card title is an 11.5 px uppercase grey eyebrow ("GAPS TO CLOSE", "STRENGTHS…"),
  so hierarchy is flat and caps are overused → Card titles in sentence case, title size (16 px, semibold, ink).
  Keep caps only for table headers and tiny meta labels, tracked 0.06em → Clear levels: page title → card title
  → body.
- Letterspacing (typography): Resume section heads use 0.14em (over the 5–12% maximum); table headers use
  tracking-wide = 0.025em (below the 5% minimum) → All caps use 0.06em, and the resume h2 uses 0.1em → Butterick's
  caps rule.
- Colour roles (all): Indigo means three different things: the brand/primary action, the "Good fit" band
  (60–74%) and the "Interviewing" status → Brand indigo for actions only. Match bands use a separate semantic
  scale (good = emerald-600, fair = sky-600, stretch = amber-600, low = rose-600). Interviewing becomes
  violet-600 and Screening fuchsia-600 → One colour, one meaning.
- AI accent (all): Purple-to-indigo gradient buttons and a gradient logo are the stock "AI product" look →
  AI actions use a flat brand-600 fill with a sparkle icon; the logo becomes a flat mark → It looks deliberate
  and calmer, and AI actions are still recognisable by the icon.
- Profile header: A disabled grey "Saved" button sits where the primary action goes and reads as broken →
  Show an inline status ("All changes saved" / "Unsaved changes" + Save button only when dirty) → Primary
  slot only holds a real action.
- Resume library: The preview's toolbar floats above the page, and the page top does not align with the
  list's top (offset 64 px) → Put the toolbar inside the preview card's header, aligned with the list card's
  top edge → Locked grid.
- Typography in copy (all): About 10 straight apostrophes in UI strings (what's, isn't, you're, Couldn't…),
  a "✓" glyph used as an icon (Profile → LinkedIn), and spaced em dashes in helper text → Curly ’ everywhere,
  the Check icon instead of the glyph, and helper text rewritten without em-dash asides.
- Tables (Applications, Dashboard): Row dividers on every row plus a header fill → Keep the single rule under
  the header and use 12 px row padding without inner borders (Butterick: remove borders, add padding) → Less noise.

Review: Nothing here blocks use, but together these are what separate "clean prototype" from "product":
one type scale, one font pair, one meaning per colour.

────────────────────────────────────────────

PHASE 3 — Polish

- Dark mode (all): Not supported → Token-based dark theme (not inverted): surface #0b1020, raised #111831,
  line #1e2742, ink #e6e9f2, muted #9aa3b8, the same semantic hues one step lighter, and the toggle in the
  sidebar footer → Long evening job-search sessions are easier on the eyes.
- Motion: Spinners, shimmer and pulse ignore prefers-reduced-motion → Wrap them in motion-safe: and use static
  fallbacks → Accessibility (WCAG 2.3.3).
- Agent run feedback: When a workflow finishes, the only signal is the record silently updating → Add a toast
  ("Tailored resume ready · 76% (+5)" with an Open action), and score rings count up once on change →
  Agentic work should be visible when it lands.
- Reduction (sidebar): "Agent activity · Idle" occupies space while idle, and "Agent · claude-opus-5-5" in the
  user chip exposes an implementation detail → Hide the section when idle (show a live pill only while running)
  and move the model name to a tooltip → Every element earns its place.
- Reduction (Dashboard): "Suggested next steps" and "Recent agent runs" render as two empty cards most of the
  time → Show each only when it has items, or merge them into one "Activity" card → Less chrome.
- Empty / error states: Error text is raw (e.g. "Scan failed: HTTP 403 …") → A human message plus a next step
  ("This site blocks automated reading. Paste the description instead." + button) → Not hostile or technical.
- Resume rendering: The contact line wraps with a dangling "·" at the start of a line, and generated headlines
  use " - " and "|" as separators → Flag for build agent: render contact items as separate inline-block spans,
  and update RESUME_FORMAT in server/src/agent.ts to use " · " separators and an en dash for date ranges.

Review: Each item is small, but together they make the app feel alive and finished. Do these once Phase 1–2
tokens exist, because dark mode depends on them.

────────────────────────────────────────────

DESIGN_SYSTEM UPDATES REQUIRED

- Colour tokens (styles.css @theme, then docs/DESIGN_SYSTEM.md):
  --color-surface #f7f8fb · --color-raised #ffffff · --color-line #e4e7ee · --color-ink #0f172a ·
  --color-ink-muted #5b6478 (≥4.5:1 on raised) · --color-brand-600 #4f46e5 (actions only)
  semantic: --color-good #059669 · --color-fair #0284c7 · --color-stretch #d97706 · --color-low #e11d48
  stage: saved slate-500 · applied sky-600 · screening fuchsia-600 · interviewing violet-600 · offer emerald-600
- Type tokens: --text-caption 11px/1.35 · --text-meta 12px/1.4 · --text-small 13px/1.45 · --text-body 14px/1.5 ·
  --text-title 16px/1.35 · --text-heading 22px/1.25 · --text-display 28px/1.1; caps tracking 0.06em
- Fonts: --font-sans "Geist", system-ui… · --font-serif "Source Serif 4", Georgia… (via @fontsource, self-hosted)
- Focus: --ring 2px brand-500, offset 2px
- Radii: control 8px · card 12px · panel 16px (current mix of rounded-lg/xl/2xl formalised)
- New components: <PageShell> (responsive sidebar / top bar), <CopilotSheet> (dock ≥1280, overlay below),
  <Toast>, <ResponsiveRow> for Applications.

────────────────────────────────────────────

IMPLEMENTATION NOTES FOR BUILD AGENT

- styles.css: add the tokens above to @theme; add `:focus-visible { outline: 2px solid var(--color-brand-500);
  outline-offset: 2px }`; .resume h2 letter-spacing 0.14em → 0.1em; font-feature-settings add "kern" 1.
- npm i @fontsource-variable/geist @fontsource-variable/source-serif-4; import both in main.tsx;
  --font-sans "Geist Variable", --font-serif "Source Serif 4 Variable".
- Global replace for informative text: text-slate-400 → text-ink-muted, except on placeholder/disabled/
  decorative icons. Layout.tsx sidebar: text-slate-600 → text-slate-400; text-slate-500 → text-slate-400.
- Layout.tsx: <main> width logic. At max-lg, the copilot aside becomes `fixed inset-y-0 right-0 z-40 w-[min(420px,100vw)]
  shadow-2xl` with a backdrop. At max-md, the nav becomes a 56 px top bar with a sheet menu and a floating copilot
  button bottom-right (48 px target).
- Applications.tsx: wrap the table in a container check; at @max-2xl render `<ul>` cards (title line-clamp-2,
  meta, StatusSelect + MiniBar row).
- JobWorkspace.tsx header buttons: add whitespace-nowrap to Button base class in ui.tsx.
- ui.tsx SectionTitle: `text-[11.5px] uppercase tracking-[0.08em] text-slate-500` → `text-title font-semibold
  text-ink` (sentence case). Table headers: tracking-wide → tracking-[0.06em].
- format.ts band(): 60–74 tone/stroke/bar brand → fair (sky-600 #0284c7). STATUS_META interviewing indigo →
  violet-600, screening violet → fuchsia-600 (update PipelineBoard STAGE_FILL to match).
- ui.tsx Button variant "ai": gradient → `bg-brand-600 hover:bg-brand-700 text-white`; Layout/AgentPanel logo
  gradient → flat bg-brand-600.
- Profile.tsx: header button → status text + Save (visible only when dirty); loading → skeletons while
  `data === undefined`; "✓" → <Check className="size-3.5" />.
- Copy: replace straight apostrophes in Profile.tsx, Applications.tsx, JobWorkspace.tsx (PasteJd),
  NewJobModal.tsx with ’ (U+2019).
- Replace arbitrary text-[Npx] classes with the 7 scale tokens (map: 9.5/10/10.5/11 → caption; 11.5/12 → meta;
  12.5/13 → small; 13.5/14 → body; 15/16 → title; 19/22/24 → heading; 26 → display).
```

## Phase 1 log (2026-10-29)

- Shell: below 768 px the sidebar becomes a 56 px top bar with a menu sheet, and a floating copilot button sits bottom-right. Below 1280 px the copilot overlays the page with a backdrop (closed by Esc or clicking the backdrop), and on narrow screens it starts closed. From 1280 px it docks as before.
- Applications: below a 672 px container, rows render as stacked cards. The toolbar search flexes to fit.
- Pipeline: on narrow containers the stage track is a 3 + 2 grid, so every stage stays visible.
- Buttons: `whitespace-nowrap shrink-0`; the job header action group wraps as a whole.
- Focus: global `:focus-visible` outline (2 px brand-500, 2 px offset) in the base layer; StatusSelect gets its own focus ring.
- Contrast: 35 informative `text-slate-400` uses on light surfaces → slate-500; sidebar slate-600/500 → slate-400.
- Profile and Resume library: container-query two-column layouts (`@3xl`). Page gutters and resume paper padding tighten on phones.
- Profile: skeleton until data loads. Correction to the flag above: the server merges profile saves as a patch, so typing before load could not wipe other fields; it only displayed them as blank. The skeleton removes that state.
