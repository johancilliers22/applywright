# Applywright — Gemini Lead Visual & UX Design Review (`Pressproof` Continuation)

- **Date:** 2026-10-29 (commissioned under `20261028` provider-delegation wave)
- **Unit / Role:** `GEMINI-DESIGN` — Lead Visual & UX Design Proposal (source-backed, read-only)
- **Commissioning Broker Thread:** `46ac76de-4e76-42b4-a2b1-9f6d4e09c559`
- **Operator Authority:** Codex `01a183ff-e374-7d32-ae0e-1938714e813c` (retains architecture, integration, acceptance, commit, and push)
- **Assigned Worktree:** `C:\Users\johan\.t3\worktrees\applywright\t3-84a839b8` (`t3/pressproof-gemini-design-review`)
- **Verified Checkout `HEAD` Before Writes:** `3b84986ffd5e334ae53b21ffb7d19b9934f1e7dc` (clean working tree; reconciled from `05b859e0610fcdfdb42c1a968591c118dd8914ec` via docs/verification-only advance with zero `public/`, `scripts/`, `server/`, `tests/`, or `package.json` blob drift)
- **Runtime / Model Provenance:** T3 Code via Antigravity harness (`antigravity-acp`, native subscription catalogue, no API key); catalogue choice `Gemini 4 Argon High` (`gemini-4-argon-high`; `Carbon` unavailable in account catalogue and not aliased/guessed)
- **Scope Boundary:** Implementation-ready design review and specification only. Zero product HTML/CSS/JS/server/test files modified.

---

## 0. Epistemic Honesty, Vision-Route Limit & Baseline Boundaries

1. **Vision-route ground truth (`pixelsReceivedByVisionRoute: false`):**
   - All 14 pinned historical captures listed in `docs/t3/receipts/20261028-provider-delegation/SOURCE-AND-HISTORICAL-CAPTURE-PINS.json` (`40-home-light-1440.png`, `42-home-light-360.png`, `30-app-dashboard.png`, `31-app-cv.png`, `ux-68` through `ux-74`, `final-about2.png`, `final-how3.png`, `final-security3.png`) plus 9 earlier `ux-30..ux-56` captures in `C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright\screenshots\` were verified on disk by byte length, UTC timestamp, and `SHA-256` digest (full ledger in `GEMINI-DESIGN-RESULT.md`).
   - Testing the qualified read-only tools (`filesystem:read_media_file` and `view_file`) confirmed that `read_media_file` offloads binary PNGs to step storage (`[Resource offloaded to file:///...]`) without injecting decoded image tensors into the model's multimodal vision context, while `view_file` denies external parent paths and returns UTF-8-decoded byte text (`\ufffdPNG...`) on offloaded files. Because `node`, PowerShell `Add-Type`, and browser/GUI launches are prohibited in this slice, **zero decoded screenshot pixels were viewed directly**.
   - Accordingly, this document makes **zero invented pixel observations**. Every finding below is a **source-backed design diagnosis** anchored to exact `file:line` evidence at `3b84986` and cross-referenced against existing machine-measured geometry/contrast tables in `docs/design/UX-REVIEW-20261028.md`, `docs/design/SPEC-V2.md`, `docs/design/ACCESSIBILITY-AUDIT.md`, and `docs/verification/20261028-intake/CONTRAST-ACCEPTANCE.md`.
2. **Bounded contrast gate vs rendered proof:**
   - Commit `7d40425` (`scripts/contrast.js`) enforces a bounded **29-pair-per-scheme (58 comparisons)** sRGB token gate over `public/assets/tokens.css` and `public/assets/theme.css`. It is **not** a rendered-DOM or `axe-core` audit (`IMPLEMENTATION-PLAN.md` `P2.9` remains `QUEUED`). Component-level alpha rules, disabled states, borders using `--line` / `--line-strong`, and pseudo-elements in `public/app/app.css` and `public/assets/editor.css` can still fail WCAG 2.2 AA while `node scripts/check.js` passes.
3. **Preservation of product direction & historical advisory boundary:**
   - Applywright's brand promise (**Working Proof** — *"Your numbers stay. The wording moves."*) and visual mechanism (**Pressproof** — warm `--paper` / `--bone` editorial folios, `--ink` proof stages, forest `--accent` / jade dark `--accent`, `--lime` preserved-fact marks, zero webfont downloads, British English, no auto-apply hype) are preserved intact.
   - Earlier DSH desktop commits (`49e2e5e`, `c7c79ce`, `2927716`) and the `6e3eb12` opener proposal are treated strictly as historical/advisory context, not accepted semantic oracles. Current `main` still carries `grounding.test.js` failures (`121` of `211` checks failing per `CURRENT-CHECKPOINT.md`), so no backend/product repair acceptance is inferred here. Every row of `docs/IMPLEMENTATION-PLAN.md` (`P1.x`–`P4.x`) remains active unless already verified `ACCEPTED`.

---

## 1. Audit Reconciliation — Legacy Defects Already Fixed vs Open Work at `3b84986`

Several items highlighted in `docs/design/DIRECTION-gemini.md` and `docs/design/UX-REVIEW-20261028.md` were repaired between those reviews and `3b84986`. Separating them prevents future `DSH` / `app-ui` / `editor` slices from wasting cycles or regressing working code.

### 1.1 Legacy Findings Verified Fixed in Current Source (`3b84986`)

| Earlier Reference | Historical Symptom | Current `3b84986` Source Proof (Fixed) | Status |
| :--- | :--- | :--- | :--- |
| `DIRECTION-gemini` §2.1 (`ux-02`, `ux-74` context) | Closed mobile `/app` rail left `#app-rail-foot` visible, consuming ~185px of a `375×812` viewport. | `public/app/app.css:44-56` hides `#app[data-open="false"] #app-rail-foot { display: none; }` below `900px` and adds backdrop overlay when open. | **Fixed in source** |
| `DIRECTION-gemini` §2.2 (`30-app-dashboard.png`) | Long CV titles and job headlines rendered at numeric display scale (`30–36px`) inside narrow metric cells. | `public/app/app.js:972-1007` (`quietStats()`) + `public/app/app.css:407-413` (`.aw-value--doc`) clamp prose titles to `var(--fs-md)` (`1.0625rem`) with 2-line clamp. | **Fixed in source** |
| `DIRECTION-gemini` §2.3 (`40-home-light-1440.png`) | Marketing hero used a fake browser window with chat bubbles and a decorative `78` ring. | `public/index.html:60-118` + `public/assets/site.css:490-650` + `public/assets/theme.css:192-235` ship `.hero-proof` (folio `<dl>`) and `.hero-gauge` vernier scale. | **Fixed in source** |
| `UX-REVIEW` P1-O2 (`ux-34`, `ux-52`, `ux-56`) | Refinement proposal cards rendered inside sticky `.ed-pane--rail` (`overflow: hidden` / viewport clamp), clipping buttons off-screen. | `public/assets/editor.js:797-853` (`syncProposalSlot()`) relocates `#ed-proposals` into `#ed-main` above `#ed-form` whenever `state.loaded` is true. | **Fixed in source** |
| `UX-REVIEW` P1-O3 (`ux-51`, `ux-55`) | Unparsed CVs opened in `/editor` with seven blank textareas and no explanation where raw text lived. | `public/assets/editor.js:325-363` (`renderParseNotice()`) injects `#ed-parse-notice` naming the character count and offering one-click copy into Summary. | **Fixed in source** |
| `UX-REVIEW` P2-O1 & P2-O7 | `/app` nav showed `<ul>` disc markers and lacked `theme.js` / theme toggle. | `public/app/app.css:154-160` strips list markers; `public/app/app.html:14, 29` loads `/assets/theme.js` and mounts `.nav__actions` in `#app-rail-head`. | **Fixed in source** |
| `DIRECTION-gemini` §2.5 & §2.7 (`ux-73` context) | Repeated orange credit nags in rail/banners; zero-hit job board chips looked clickable; colour-only status dots. | `public/app/app.css:496-515, 696-768` + `public/app/app.js:1945-2090, 2306-2329` ship monochrome `.aw-creditline`, disabled dashed `.aw-chip--empty`, and shaped `.aw-status-mark` glyphs. | **Fixed in source** |
| Empty-CV scratch entry & loading sheet (`ux-68..74`) | Users without a file could not author a CV from scratch; `/editor` loading text floated unframed. | `public/app/app.js:908-947, 1397` adds `"Write from scratch"` (`POST /api/cvs/blank`) and `"Edit sections"`; `public/assets/site.css:1790-1814` styles `#ed-loading` as a ruled folio sheet. | **Shipped (needs polish — see §2)** |

### 1.2 Previously Logged Findings That Remain Unfixed or Partially Open at `3b84986`

- **`UX-REVIEW` P1-O1 (`/app/cv` `<select>` programmatic label):** **STILL BROKEN** (`public/app/app.js:647, 1500-1507` — detailed in **P1-2** below).
- **`UX-REVIEW` P2-M1 (`/editor` save button & save status scroll off-screen):** **STILL OPEN** (`public/assets/editor.css:27-96` — elevated to **P1-1** for mobile/touch reachability).
- **`DIRECTION-gemini` §2.4 & §3.1–3.2 / `IMPLEMENTATION-PLAN` `P3.3` & `P3.4`:** CV library collapsed `<details class="aw-ingest">` when `cvs.length > 0` (`app.js:1840`), **but `.aw-folio` and `.aw-proof` do not exist anywhere in `public/app/app.css` or `public/app/app.js`** (**P1-4**).
- **`IMPLEMENTATION-PLAN` `P2.6`, `P2.7`, `P2.9`, `P4.3`:** Polite live-region route/score announcements, reduced-motion coverage outside marketing nav pages, rendered contrast/axe verification, and bookmarklet metadata preservation remain **OPEN**.

---

## 2. Ranked User-Facing Observations (`3b84986` Source + Audit Evidence)

### P0 — Product-Promise, Data-Safety & Broken-State Blockers

#### P0-1 · `/editor` Directly Contradicts Its Own Save Promise and Silently Overwrites Server CVs
- **Evidence:**
  - `public/editor.html:330` (*"What this page will not do"*): `"Accepting a hunk is a click; saving is a second one."`
  - `public/editor.html:204` (`#ed-refine-hint`): `"Proposals come back below — nothing is applied or saved until you accept it."`
  - `public/assets/editor.js:1354, 1441-1474` (`buildHunkCard()`, `acceptHunk()`): The primary button is labelled `"Accept and save"`, applies the hunk to the form, and immediately executes `await save()` (`PATCH /api/cvs/:id` with `readForm()`), which **also commits any unrelated unsaved edits the user typed in other sections**.
  - `public/assets/editor.js:1213-1222` (`askForProposals()`): `if (state.dirty) { const ok = await save(); if (!ok) return; }` — clicking `"Ask for a proposal"` **silently saves all dirty form edits to the database** before requesting proposals, with zero warning or confirmation.
- **User impact:** Applywright's core differentiator is strict user agency (*"nothing happens behind your back"*). Saying saving is a second click while persisting to SQLite on the first click—and silently overwriting the stored master CV merely to preview AI proposals—breaks user trust and can destroy a clean stored CV when a user is experimenting with rough draft edits.

#### P0-2 · `/editor` Empty, `401`, and `404` States Display Error-Red `"not saved"` and Leave Right-Rail Tools Live Against a Null CV
- **Evidence:**
  - `public/editor.html:52`: Static initial `#ed-status` reads `"No CV chosen · loading"`.
  - `public/assets/editor.js:1079-1105` (`showFailure()`): Calls `setSaveState("error")`, setting `data-state="error"` (`color: var(--err)` in `public/assets/editor.css:113`) and visible text `"not saved"` even when no `?cv=` parameter was supplied, the CV ID returned `404`, or the session returned `401`.
  - `public/assets/editor.css:308`: `.ed-shell:has(#ed-form[hidden]) .ed-pane--nav { display: none; }` hides the left section nav, **leaving `.ed-pane--rail` (the right 340px column) visible and interactive** (corroborating historical capture `ux-30-editor-nocv-1440.png` geometry in `UX-REVIEW` §4).
  - `public/assets/editor.js:1480-1652`: While `!state.loaded`, `#ed-li-parse` (`"Read this profile"`) and `#ed-kw-run` (`"Check keyword coverage"`) are **never disabled**. Submitting LinkedIn text parses sections, renders `"Add the ticked sections and save"`, writes into the hidden `#ed-form`, fails `save()` (missing `state.cvId`), and announces `"The merge is in the editor but could not be saved"`. Submitting `"Check keyword coverage"` posts `cvId: ""` to `/api/analyse` (`400 Bad Request`).
- **User impact:** Signed-out or deep-linked users see an alarming red `"not saved"` data-loss indicator when nothing was edited, and are invited to paste their LinkedIn profile or job advert into controls guaranteed to fail.

---

### P1 — Reachability, Programmatic Accessibility & Pressproof Continuity

#### P1-1 · Mobile & Long-Document Save Action and Save Status Scroll Out of Reach in `/editor`
- **Evidence:**
  - `public/editor.html:46-66` & `public/assets/editor.css:27-96`: `.ed-bar` (`#ed-status`, export links, `#ed-save`) sits in static document flow at the top of `<body class="ed-page">`.
  - `public/assets/editor.js:488-503, 1808`: `autoSize()` expands all seven section `<textarea>` controls to full content height (`scrollHeight`), pushing document height to `2,475px` at `1440×900`, `4,782px` at `768×1024`, and `4,839px` at `375×812` (`UX-REVIEW` §4 P2-M1; historical captures `ux-36`, `ux-38`, `ux-50`). Keyboard shortcut `Ctrl+S` / `Cmd+S` (`editor.js:1808`) helps desktop keyboard users only.
- **User impact:** On phones (`375px`) and tablets (`768px`), editing `Experience`, `Projects`, or `Education` places the user `1,800–3,800px` below `.ed-bar` with no `Ctrl+S` equivalent, no visible `"Save changes"` button, and no visible `#ed-status` indicator when `dirty` or when a save fails (`error`).

#### P1-2 · `/app/cv` CV Selector `<select>` Lacks a Programmatic Accessible Name (Unfixed WCAG 4.1.2 / 1.3.1 Defect)
- **Evidence:**
  - `public/app/app.js:647-661` (`selectControl()`): Constructs `el("select", { class: "select", id, "aria-label": ariaLabel })` without generating a fallback `id` when `id` is omitted (unlike `field()` at `app.js:634`, which runs `if (!control.id) control.id = uniqueId("field")`).
  - `public/app/app.js:1500-1508` (`renderSelect()`): Calls `selectControl({ options: ..., value: selectedCvId, onchange: ... })` with neither `id` nor `ariaLabel`, then writes `el("label", { for: select.id }, "CV")`. Because `select.id` is `""`, `el()` sets `for=""` (or an orphaned label) on `<label>` and omits `id` on `<select>`, leaving `<select class="select">` nameless in the accessibility tree (`UX-REVIEW` P1-O1).
- **User impact:** Screen-reader and voice-control users ("Click CV") cannot identify or target the CV selector governing scoring and pack generation on `/app/cv`.

#### P1-3 · Split-Brain Draft vs Stored State on `/editor` Exports and Untrue Word-Count Copy
- **Evidence:**
  - `public/editor.html:86`: `<p class="ed-pane__note">Each count is the number of words in that section on the saved copy.</p>`
  - `public/assets/editor.js:1774-1790`: The `input` listener calls `updateCounts()` on every keystroke, so `#ed-nav` counts reflect the **unsaved draft**, contradicting the note right beneath them.
  - `public/assets/editor.js:1703-1748` (`exportMarkdown()`, `exportDocx()`, `printSheet()`): All three export actions serialise `readForm()` (the unsaved client-side form), whereas `/app/cv` (`POST /api/analyse`, `POST /api/tailor`) reads the server's saved SQLite copy. Zero visual or spoken warning informs a user exporting while `state.dirty === true` that their downloaded `.docx`/PDF differs from the CV stored in their workspace.
- **User impact:** Users who edit a CV, click `.docx` or `Print / PDF`, and navigate back to `/app/cv` (or close the tab after `beforeunload` fatigue) score and tailor against stale server text while holding an unstored file.

#### P1-4 · Pressproof Seam Break Between Marketing/Editor Folios and `/app` SaaS Cards (`P3.3` & `P3.4`)
- **Evidence:**
  - `public/index.html:60-118` + `public/assets/site.css:490-650` establish Pressproof's signature artefact language: `2px` `--r-folio` corners, `.hero-proof__stamp` monospace registration headers, `[CV §n]` citations, and `--lime` (`#d7efa6` / `#0b0c0e` at `15.64:1` + `font-weight: 600`) preserved-fact marks. `public/assets/editor.css:354-358` carries the same `--r-folio` + `--shadow-sheet` onto `.ed-section`.
  - In `public/app/app.css` (`lines 542-555, 864-889, 1344-1371`) and `public/app/app.js` (`cvCard()` at `1330`, `tailorOutput` at `1697`, `packDetailView()` at `2905`), **neither `.aw-folio` nor `.aw-proof` exists**. Stored CVs, tailored packs, cover letters, and refinement diffs render inside `18px` (`--r-lg`) or `14px` (`--r-md`) generic cards indistinguishable from billing, alert, and danger-zone settings boxes.
- **User impact:** Crossing from `/` into `/app` drops the tactile "document on a proof desk" metaphor at the exact moment the user inspects their real CV and tailored application pack.

#### P1-5 · Missing Polite Screen-Reader Announcements for SPA Route Transitions, Score/Pack Results & Armed Account Deletion (`P2.6` + WCAG 4.1.3)
- **Evidence:**
  - `public/app/app.html:52-60` & `public/app/app.js:4008-4062`: `renderRoute()` updates `#app-title` and calls `byId("app-main").focus({ preventScroll: true })`, but `<main id="app-main" tabindex="-1">` has no `aria-labelledby="app-title"`, so assistive technology announces `"main"` without the new screen's heading.
  - `public/app/app.js:1583` (`runAnalysis`) & `1697` (`tailorButton`): Replacing `scoreOutput` / `tailorOutput` does not emit a concise polite summary (e.g., `"Scored 78 out of 100, strong match, 4 findings"`).
  - `public/app/app.js:3839-3847` (`deleteButton` in `/app/settings`): First click arms destructive deletion (`deleteButton.textContent = "Click again to delete everything"`) for 6 seconds **without calling `say(deleteStatus, ...)`**. Screen-reader users receive zero feedback that a second click will permanently erase their account.

---

### P2 — Visual Hierarchy, Boundary Contrast, Motion & Copy Polish

#### P2-1 · WCAG 1.4.11 Non-Text Contrast & Disclosure Accessible-Name Drift in `public/app/app.css`
- **Evidence:**
  - `public/app/app.css:105`: `#app-menu` (the `40×40px` mobile rail hamburger button) uses `border: 1px solid var(--line-strong)` (`rgba(11, 12, 14, 0.22)` → `1.65:1` on `--paper` / `1.62:1` on `--bone`), failing WCAG 1.4.11 (3:1 control boundary) right next to `.theme-toggle` (`public/assets/theme.css:291`), which explicitly uses `var(--line-meaning)` (`3.43:1` / `3.35:1`) for that reason.
  - `public/app/app.css:937`: `.aw-segmented` (`/app/billing` Monthly/Annual radio group) uses `border: 1px solid var(--line)` (`1.19:1` in light scheme) with unselected labels having no border at all.
  - `public/app/app.css:1307, 1319`: `.aw-ingest > summary::after` declares `content: "+"` and `content: "−"` without `/ ""` empty alt text, mutating the `<summary>` accessible name between `"Add another CV +"` and `"Add another CV −"` (the exact defect repaired in `.faq summary::after` at `public/assets/site.css:768-779`).

#### P2-2 · `prefers-reduced-motion: reduce` Transform Overrides Missing on `/app`, `/editor`, and Auth Pages (`P2.7`)
- **Evidence:**
  - `public/assets/site.css:225-234` and `public/assets/theme.css:310-312` apply `transform: translateY(-1px)`, `scale(0.985)`, and `translate: 0 1px` on `.btn` and `.theme-toggle`.
  - Their `@media (prefers-reduced-motion: reduce)` neutralisations live exclusively in `public/assets/motion.css:207-228`, which is linked via `public/partials/nav.html:6`. Because `public/app/app.html`, `public/editor.html`, `public/sign-in.html`, `public/sign-up.html`, and `public/reset.html` do not include `nav.html` or `motion.css`, interactive controls still translate/scale when OS reduced motion is active.

#### P2-3 · Empty-Workspace Action Competition (`/app` vs `/app/cv`) & Overcrowded CV Card Footers
- **Evidence:**
  - `public/app/app.js:908-947` (`emptyCvHero()`, captured in `ux-68` and `ux-72`): Presents `"Open CV library"` (`btn--primary`), `"Write from scratch"` (`btn--ghost`), and `"Jobs feed →"` simultaneously. Clicking `"Open CV library"` navigates to `/app/cv`, where `renderCvScreen()` (`app.js:1840-1896`) renders an `.aw-empty` card (`"No CVs on file"` + `"Write from scratch"`) stacked directly above an already-expanded `<details class="aw-ingest" open>` (`"Import your first CV"`), forcing vertical scrolling past an empty-state box to reach the upload/paste form on `375×812`.
  - `public/app/app.js:1348-1409` (`cvCard()`): Packs up to four metadata badges plus four buttons (`Edit sections`, `Score against a job`, `Set default`, `Delete`) into one card footer (`ux-70`, `ux-74` context), flattening primary workflow actions against destructive housekeeping.

#### P2-4 · Copy, Meta & Stylesheet Ownership Hygiene (`app.js`, `theme.css`, `site.css`, `P4.3`)
- **Evidence:**
  - `public/app/app.js:3789`: Account key-value row in `/app/settings` reads `"Planning renews"` instead of `"Plan renews"`.
  - `public/assets/theme.css:3`: Header comment states `"Loaded after tokens.css and site.css"`, whereas all 10 HTML pages intentionally load `tokens.css` → `theme.css` → `site.css` so `site.css` consumes re-keyed tokens and layers `.theme-toggle:hover` (`site.css:1780`).
  - `public/assets/site.css:1787-1814`: `#ed-loading` ruled-sheet skeleton still lives at the bottom of `site.css` (shipping unused CSS to all marketing/auth/app pages) with an inline note to absorb into `public/assets/editor.css` once `editor.css` is unlocked.
  - All 10 HTML `<head>` blocks hardcode `<meta name="theme-color" content="#0b0c0e" />`, painting dark browser chrome when JavaScript is disabled even though the no-JS fallback scheme is light (`#fffdf8`).
  - `public/app/app.js:2399-2437` (`IMPLEMENTATION-PLAN` `P4.3`): Job-capture prefill drops structured `company` / `location` hints from bookmarklet payloads instead of surfacing them alongside the captured posting.

---

## 3. Concrete Design Proposals Across the Four Required Focus Areas

### 3.1 Mobile & Scrolled Save Reachability (`/editor`)

1. **Keep `.ed-bar` static at the top of `<body class="ed-page">`** so narrow (`375px`) and zoomed (`200%` at `1440px` → `720×450` CSS px) viewports never lose 22–30% of vertical reading height to a permanently pinned multi-row header.
2. **Desktop (`≥ 1120px`) — Sticky Index Colophon inside `.ed-pane--nav`:**
   - `.ed-pane--nav` is already `position: sticky; top: var(--sp-5)` (`editor.css:320`). Add a compact `.ed-nav-colophon` block below `#ed-nav` (`padding-top: var(--sp-3); border-top: 1px solid var(--line)`) containing:
     - A synced secondary status readout (`data-ed-status-mirror`, `aria-hidden="true"` because `#ed-status` owns the single `role="status"` live region) showing `Saved 14:32` / `Unsaved changes` / `Save failed`.
     - A full-width compact `"Save changes"` button (`#ed-save-rail`, `min-height: 40px`) enabled iff `state.loaded && state.dirty`, plus a `↑ Top / Export` jump link (`#ed-bar`).
3. **Mobile & Tablet (`< 1120px`) — Adaptive Thumb-Zone Colophon Dock (`.ed-dock`):**
   - Render `<div class="ed-dock" id="ed-dock" hidden>` as the last child inside `<main id="ed-main">` (`position: sticky; bottom: 0; z-index: 30; margin-inline: calc(-1 * var(--gutter)); padding: var(--sp-2) var(--gutter) calc(var(--sp-2) + env(safe-area-inset-bottom, 0px)); background: color-mix(in srgb, var(--paper) 94%, transparent); backdrop-filter: blur(10px); border-top: 1px solid var(--line-meaning)`).
   - **Zero clutter when clean:** Keep `#ed-dock[hidden]` when `!state.loaded` or (`!state.dirty && state.saveState === "saved"`), preserving 100% of vertical screen height during reading.
   - **Immediate thumb reach when dirty, saving, or errored:** Reveal `#ed-dock` whenever `state.loaded && (state.dirty || state.saveState === "saving" || state.saveState === "error")`:
     - Top `2px` registration accent rule (`border-top: 2px solid var(--accent)` when `dirty`/`saving`; `2px solid var(--err)` when `error`).
     - Left: concise state label (`"Unsaved draft"` / `"Saving…"` / `"Not saved — retry"`).
     - Right: `"Save changes"` primary button (`min-height: 44px; padding-inline: 1rem`, meeting `44×44px` touch comfort).

### 3.2 `/app` Information & Visual Hierarchy (`Pressproof` `.aw-folio` + `.aw-proof`)

1. **Introduce `.aw-folio` for User Documents vs `.aw-card` for Workspace Chrome (`public/app/app.css` + `public/app/app.js`, closing `P3.3`):**
   - **Rule of separation:** Controls, filters, quota meters, forms, billing plans, and settings remain `.aw-card` (`border-radius: var(--r-md)` `14px`, flat `1px solid var(--line)`). Every artefact the candidate **authors or sends**—a stored CV in `cvCard()`, a tailored CV/cover-letter preview in `tailorOutput` and `packDetailView()`—uses `.aw-folio`:
     ```css
     .aw-folio {
       background: var(--paper);
       color: var(--text);
       border: 1px solid var(--line-strong);
       border-radius: var(--r-folio); /* 2px cut sheet */
       box-shadow: var(--shadow-sheet);
       padding: clamp(1.1rem, 2.2vw, 1.5rem);
       display: grid;
       gap: var(--sp-3);
       container-type: inline-size;
     }
     .aw-folio[data-default="true"] {
       border-left: 3px solid var(--accent);
     }
     .aw-folio__stamp {
       display: flex;
       flex-wrap: wrap;
       align-items: baseline;
       justify-content: space-between;
       gap: 0.25rem 0.75rem;
       padding-bottom: var(--sp-2);
       border-bottom: 1px solid var(--line);
       font-family: var(--mono);
       font-size: var(--fs-xs);
       letter-spacing: 0.08em;
       text-transform: uppercase;
       color: var(--text-muted);
     }
     ```
2. **Introduce `.aw-proof` Grounded Redline & Fact Highlighting (`P3.4`):**
   - When rendering tailored bullet comparisons or refinement diffs in `/app/cv` and `/app/applications`, replace flat `.aw-diff` blocks with `.aw-proof`:
     - Side-by-side `minmax(0, 0.95fr) minmax(0, 1.05fr)` at `@container (min-width: 520px)`, single-column stacked with explicit `ORIGINAL` / `TAILORED` `.aw-proof__kind` monospace labels below `520px`.
     - Wrap preserved numbers, dates, and metrics matched from the source bullet in `<mark class="aw-proof__fact">` (`background: var(--lime); color: var(--ink); font-weight: 600; padding: 0 0.18em; border-radius: 1px` — `15.64:1` luminance contrast plus `600` weight cue for colour-blind/greyscale legibility) alongside `<span class="aw-proof__cite">[CV §Experience]</span>` (`1px solid var(--line-meaning)`, `--r-folio`).
     - Render grounding-reset warnings inside a dedicated `.aw-proof__reset` strip (`border-left: 3px solid var(--warn)`) directly beneath the reset bullet so the candidate sees *which* bullet fell back to their original wording and *why*.
3. **De-duplicate Empty-State & Card Actions:**
   - **Dashboard (`/app`) empty CV state (`emptyCvHero()`):** Present **two** actions only: `"Import a CV"` (`btn--primary`, linking `/app/cv#cv-import`) and `"Write from scratch"` (`btn--ghost`). Remove the third inline `"Jobs feed →"` action from the hero footer (the Jobs card directly below already owns job browsing).
   - **CV Library (`/app/cv`) empty state (`renderCvScreen()`):** When `cvs.length === 0`, omit the redundant `.aw-empty` `"No CVs on file"` card above `<details class="aw-ingest" open>`; place `"Write from scratch"` in the `"Import your first CV"` section header `actions` slot so the file dropzone and paste box sit immediately above the fold on `375×812`.
   - **CV Folio Card (`cvCard()`):** Keep `"Edit sections"` (`btn--primary` when unparsed or empty, `btn--ghost` otherwise) and `"Score against a job"` as the primary action pair; group `"Set default"` and `"Delete"` into a secondary `.aw-folio__util` cluster separated by `margin-inline-start: auto` (stacking cleanly below `520px`) with `min-height: 36px` (`44px` on coarse pointers via `@media (pointer: coarse)`).
   - **Applications Pack Detail (`packDetailView()`):** Organise opened packs as a single `.aw-folio` dossier with a four-stop `.aw-segmented` view switcher (`Tailored CV`, `Covering letter`, `Screening answers`, `Audit & warnings`) so users inspect one clean sheet at a time instead of scrolling 2,000px inside an inline expansion row.

### 3.3 `/editor` Truth & Status Architecture

1. **Honour Two-Step Staging (Align Code to `editor.html:330`, Never Lie in Copy):**
   - Rename hunk action button from `"Accept and save"` to **`"Stage in draft"`** (`public/assets/editor.js:1354`).
   - Clicking `"Stage in draft"` applies the proposed text into the target `<textarea>`, adds `data-staged="true"` on `.ed-section` (`border-left: 3px solid var(--accent)`), updates `state.dirty = true`, calls `setSaveState("dirty")`, and announces `"Staged in Experience draft. Save changes when ready."` It **does not** fire `PATCH /api/cvs/:id` and **never** sweeps unrelated dirty sections to the server without explicit `"Save changes"`.
   - Add a `"Save all staged changes"` primary button inside `#ed-proposals`'s header bar once ≥1 hunk is staged, preserving fast two-click completion (`Stage in draft` → `Save changes`) exactly as `editor.html:330` promises.
2. **Eliminate Silent Pre-Proposal Auto-Save (`editor.js:1213-1222`):**
   - If `state.dirty === true` when the user clicks `"Ask for a proposal"`, do **not** silently call `save()`. Render an inline confirmation strip `#ed-dirty-confirm` directly below `#ed-ask`:
     > *"You have unsaved edits on this sheet. Refinement reads the saved CV on the server."*  
     > `[Save changes and ask]` (`btn--primary`) · `[Cancel]` (`btn--ghost`)
3. **SeparateSave Status States (`idle` / `loading` / `saved` / `dirty` / `saving` / `error` / `unavailable`):**
   - Replace misleading initial `"No CV chosen · loading"` (`editor.html:52`) with `"Loading CV…"` (`data-state="loading"`).
   - Add `data-state="unavailable"` (`color: var(--text-muted)`, neutral hairline border—**never** `--err` red) for missing `?cv=`, `401` unauthenticated, and `404` missing CV states, displaying `"No CV open"` or `"Sign-in required"`. Reserve `data-state="error"` (`"Not saved — retry"`, `--err`) strictly for failed `PATCH /api/cvs/:id` writes when `state.loaded === true`.
4. **Word-Count & Dirty-Export Truth (`editor.html:86`, `editor.js:1703-1748`):**
   - Update `editor.html:86` to state honestly: `"Word counts update live as you edit."` Append an `(unsaved)` marker on `#ed-nav` items whose current value differs from `state.savedSnapshot[section]`.
   - When `state.dirty === true` and the user triggers `.md`, `.docx`, or `Print / PDF`, show a non-blocking polite banner / status notice: `"Exported your unsaved draft. Save changes so scoring and tailoring use this version."`

### 3.4 Empty, Loading & Error States + Accessibility Hardening

1. **Gate `.ed-pane--rail` When No CV Is Loaded (`editor.css` + `editor.js`):**
   - In `public/assets/editor.css:308`, hide `.ed-pane--rail` alongside `.ed-pane--nav` whenever `#ed-form` is hidden and `#ed-error` is visible:
     ```css
     .ed-shell:has(#ed-error:not([hidden])) .ed-pane--nav,
     .ed-shell:has(#ed-error:not([hidden])) .ed-pane--rail {
       display: none;
     }
     ```
   - In `public/assets/editor.js` (`setControlsEnabled(enabled)`), explicitly toggle `.disabled = !enabled` on `#ed-instruction`, `#ed-scope`, `#ed-li-text`, `#ed-li-parse`, `#ed-kw-jd`, and `#ed-kw-run` during loading and failure states so keyboard/programmatic submission against an unloaded CV is impossible.
   - Style `#ed-error` as a centred `max-width: 34rem` `.ed-empty-folio` card with tailored recovery actions:
     - Missing `?cv=`: `"Choose a CV to edit"` → `[Open CV library]` (`/app/cv`, `btn--primary`) + `[Dashboard]` (`/app`, `btn--ghost`).
     - `401`: `"Your session has ended"` → `[Sign in]` (`/sign-in?next=...`, `btn--primary`).
     - `404`: `"That CV is no longer on file"` → `[Open CV library]` (`/app/cv`, `btn--primary`).
2. **Fix `/app` Accessible Naming, Live Announcements & Reduced Motion:**
   - `public/app/app.js:647`: In `selectControl()`, assign `const controlId = id || uniqueId("select")` and pass `id: controlId` to `el("select", ...)` so `renderSelect()`'s `<label for="${select.id}">CV</label>` always binds (`P1-2`).
   - `public/app/app.html:60` + `public/app/app.js:4056`: Add `aria-labelledby="app-title"` on `<main id="app-main" tabindex="-1">` so focusing `#app-main` on SPA navigation announces `"CV library, main"` automatically; add a dedicated polite shell announcer `#app-announcer` (`class="sr-only" role="status" aria-live="polite"`) called on score completion, pack generation, and first-click arming of `"Delete my account"` (`"Warning: account deletion armed for 6 seconds. Activate Delete my account again to permanently erase your account."`) (`P1-5`).
   - `public/app/app.css:105, 937, 1307, 1319`: Switch `#app-menu` and `.aw-segmented` borders to `var(--line-meaning)`; change `.aw-ingest > summary::after` to `content: "+" / ""` and `content: "−" / ""` (`P2-1`).
   - Move button/theme-toggle `@media (prefers-reduced-motion: reduce)` transform resets into `public/assets/site.css` and `public/assets/theme.css` (right beside the rules they cancel) so all 10 pages—not only the 5 pages including `nav.html`—honour reduced motion (`P2-2`).

---

## 4. Most Important Unresolved Design Decision — Two Pressproof Alternatives

### Focal Decision
**How should `/editor` reconcile mobile/scrolled save reachability (`P1-1`), draft-vs-server truth (`P0-1`, `P1-3`), and viewport budget (`WCAG 1.4.10` Reflow at `375px` and `200%` zoom) without breaking the Pressproof "quiet sheet of paper" experience?**

### Alternative A — Persistent Pinned Top Proof-Bar + One-Click Auto-Commit (Copy Re-aligned to Code)

- **Mechanism:**
  1. Make `.ed-bar` `position: sticky; top: 0; z-index: 40` across all viewports (`320px`–`1440px+`).
  2. To prevent `.ed-bar` wrapping to three rows (`~124px`) at `375px` and `200%` zoom (`720×450`), collapse `.md`, `.docx`, and `Print / PDF` into a `<details class="ed-export-menu"><summary class="btn btn--ghost">Export</summary>…</details>` disclosure below `960px`, keeping `.ed-bar` at `56–62px`.
  3. Retain immediate server persistence on `"Accept and save"` (`acceptHunk()` → `PATCH /api/cvs/:id`) and automatic pre-proposal `save()` inside `askForProposals()`, and **rewrite `editor.html:204, 330`** to state explicitly: *"Accepting a hunk saves the whole CV immediately; asking for a proposal saves any pending edits first."*
- **Strengths:**
  - Lowest JS delta (`editor.js` state machine barely changes; mostly CSS + copy truth fix).
  - Status pill and `"Save changes"` stay in one consistent top location across desktop and mobile.
- **Weaknesses:**
  - **Ergonomic miss on phones:** On `375×812` one-handed use, pinning primary `"Save changes"` to the top edge puts the main commit control in the hardest-to-reach thumb zone, directly above the OS address bar/Dynamic Island.
  - **Reflow compression at `200%` zoom (`720×450` CSS px):** A permanent `62px` sticky header consumes ~14% of total viewport height even when the user is merely reading a clean CV.
  - **Weakens Applywright's agency guarantee:** Auto-saving rough experiments in `Summary` because the user clicked `"Ask for a proposal"` on `Experience`—or accepted one hunk in `Skills`—can overwrite a clean default CV used by `/app/cv` and `/api/tailor`.

### Alternative B — Adaptive Thumb-Zone Colophon Dock + True Two-Step Draft Staging (**PREFERRED**)

- **Mechanism:**
  1. **Unobstructed reading sheet when clean:** Keep `.ed-bar` static at the top of `<body class="ed-page">`. When `state.dirty === false` and `state.saveState === "saved"`, zero sticky bars intrude on vertical reading height at `375×812` or `200%` zoom (`720×450`).
  2. **Desktop (`≥ 1120px`):** Mount `.ed-nav-colophon` inside the already-sticky left `.ed-pane--nav` rail (`position: sticky; top: var(--sp-5)`), mirroring save state (`Saved HH:MM` / `Unsaved draft` / `Not saved`) with a `40px` `"Save changes"` button and `↑ Top / Export` anchor—zero vertical height stolen from `#ed-main`.
  3. **Mobile & Tablet (`< 1120px`):** Mount `#ed-dock.ed-dock` (`position: sticky; bottom: 0; z-index: 30`) inside `#ed-main`, **visible only when `state.loaded && (state.dirty || state.saveState === "saving" || state.saveState === "error")`**. Styled as a Pressproof colophon strip (`--paper` at 94%, `1px solid var(--line-meaning)`, `2px` `--accent` or `--err` registration rule, `44px`-tall `"Save changes"` button, `env(safe-area-inset-bottom)` padding).
  4. **True two-step staging (`Stage in draft` → `Save changes`):** Clicking `"Stage in draft"` on a proposal hunk updates the local section `<textarea>` + marks `.ed-section[data-staged="true"]` without writing to SQLite; `#ed-proposals` gains a `"Save staged changes"` header button; and clicking `"Ask for a proposal"` while `state.dirty === true` shows an explicit inline `"Save changes and ask"` / `"Cancel"` prompt instead of silently mutating `/api/cvs/:id`.

### Trade-Off Matrix & Preferred Rationale

| Criterion | Alternative A (Pinned Top Bar + Auto-Commit) | Alternative B (Thumb Colophon + Two-Step Staging — **Preferred**) |
| :--- | :--- | :--- |
| **One-handed mobile reachability (`375×812`)** | Weak — top-edge reach across `812px` screen | **Strong** — bottom thumb-zone `44px` button appears exactly when needed |
| **WCAG 1.4.10 Reflow (`320px` / `200%` zoom `720×450`)** | Eats `56–62px` permanently during clean reading | **0px overhead when clean**; compact `56px` bottom strip only while dirty/errored |
| **User agency & stored-CV safety (`P0-1`)** | Weakens promise via silent pre-proposal/cross-section saves | **Preserves promise** — server CV changes only on explicit `"Save changes"` |
| **Pressproof aesthetic coherence** | Standard SaaS sticky toolbar | **Editorial folio**: quiet ruled paper while reading; registration colophon while proofing |
| **Implementation complexity** | Low (`editor.html`, `editor.css`, small `editor.js` tweak) | Moderate (`~75` lines in `editor.js` + `~65` lines in `editor.css` + `editor.html` dock node) |

**Decision:** **Adopt Alternative B.** Applywright wins trust by never mutating a candidate's canonical CV without deliberate consent, and by treating the screen like calm paper when reading while placing a firm `44px` Pressproof colophon directly under the thumb the instant unsaved edits exist.

---

## 5. Disjoint Future Implementation Scopes & Measurable Acceptance Checks

All proposed work packages respect `AGENTS.md` and `docs/IMPLEMENTATION-REGISTER.json` file-ownership boundaries, avoiding active backend grounding (`server/refine.js`, `server/tailor.js`) and locked test harnesses until those slices release.

### WP-1 · Editor Truth, Empty-State Gating & Thumb-Zone Colophon (`editor` owner)
- **Exact file scope:** `public/editor.html`, `public/assets/editor.css`, `public/assets/editor.js` (plus absorbing `#ed-loading` out of `public/assets/site.css` in coordination with WP-3).
- **Changes:**
  - Implement Alternative B: `.ed-nav-colophon` (`≥ 1120px`), `#ed-dock` (`< 1120px`), `"Stage in draft"` two-step hunk staging, `#ed-dirty-confirm` explicit prompt before proposal generation when `dirty`, `data-state="unavailable"` neutral status on missing/`401`/`404` CV, live word-count copy truth + per-section `(unsaved)` badge, dirty-export notice, and `.ed-pane--rail` hiding + input disabling when `!state.loaded`.
- **Measurable acceptance checks:**
  1. Opening `/editor` (no `?cv=`) or `/editor?cv=nonexistent` sets `#ed-status[data-state="unavailable"]` (computed `color` ≠ `--err`), hides both `.ed-pane--nav` and `.ed-pane--rail` (`getComputedStyle(...).display === "none"`), and sets `.disabled === true` on `#ed-save`, `#ed-ask`, `#ed-li-parse`, and `#ed-kw-run`.
  2. Editing `#sec-experience` at `375×812` scrolled to `y = 2200` reveals `#ed-dock` within the viewport (`rect.bottom <= window.innerHeight`, `#ed-dock` button `rect.height >= 44`).
  3. Clicking `"Stage in draft"` on a refine hunk sends **zero** `PATCH /api/cvs/:id` network requests, sets `state.dirty === true`, and leaves `#ed-status[data-state="dirty"]`; clicking `"Save changes"` sends exactly **one** `PATCH /api/cvs/:id` and transitions `#ed-status[data-state="saved"]`.
  4. Clicking `"Ask for a proposal"` while `state.dirty === true` sends **zero** `PATCH` or `POST /api/cvs/:id/refine` requests until `#ed-dirty-confirm`'s `"Save changes and ask"` is activated.

### WP-2 · `/app` Pressproof `.aw-folio` / `.aw-proof`, Hierarchy & A11y Hardening (`app-ui` owner)
- **Exact file scope:** `public/app/app.html`, `public/app/app.css`, `public/app/app.js`.
- **Changes:**
  - Add `.aw-folio`, `.aw-folio__stamp`, `.aw-proof`, `.aw-proof__fact`, `.aw-proof__cite`, and `.aw-proof__reset` (`P3.3`, `P3.4`); apply to `cvCard()`, `tailorOutput`, and `packDetailView()`.
  - Fix `selectControl()` fallback `uniqueId("select")` (`P1-2`); add `aria-labelledby="app-title"` on `#app-main` and `#app-announcer` polite live region for score/pack completion and armed account deletion (`P1-5`).
  - Deduplicate `emptyCvHero()` to 2 CTAs and remove redundant `.aw-empty` card above open `.aw-ingest` when `cvs.length === 0` (`P2-3`).
  - Switch `#app-menu` and `.aw-segmented` borders to `var(--line-meaning)`; update `.aw-ingest > summary::after` to `content: "+" / ""` and `"−" / ""` (`P2-1`); fix `"Plan renews"` typo (`app.js:3789`) and preserve bookmarklet `company`/`location` metadata (`P4.3`).
- **Measurable acceptance checks:**
  1. On `/app/cv` with ≥1 CV, `document.querySelectorAll("select")` has zero elements with empty accessible name (`select.labels.length >= 1` and `select.id !== ""`).
  2. On `/app/cv` (`cvs.length === 0`) at `375×812`, `<details class="aw-ingest" open>` top edge sits above `y = 320px` with zero `.aw-empty` siblings preceding it; `/app` empty state renders at most 2 `.btn` links inside `emptyCvHero()`.
  3. `#app-menu` and `.aw-segmented` computed border luminance contrast ≥ `3.0:1` against `--bone` and `--paper` in both light and dark themes; `<summary>` accessible name in `.aw-ingest` contains neither `"+"` nor `"−"`.
  4. First click on `"Delete my account"` populates `#deleteStatus` / `#app-announcer` (`textContent.length > 0`) synchronously.
  5. CV cards and pack views render with `.aw-folio` (`getComputedStyle(el).borderTopLeftRadius === "2px"`), and tailored bullets highlight preserved numeric/date tokens inside `mark.aw-proof__fact` (`fontWeight >= 600`).

### WP-3 · Cross-Page Reduced-Motion, Theme Comment & Static Gate Coverage (`site` + `check` owners)
- **Exact file scope:** `public/assets/site.css`, `public/assets/theme.css`, `public/*.html` (`meta[name="theme-color"]` light default `#fffdf8`), `scripts/check.js`, and E2E rendered audit (`P2.9` when `tests/e2e.test.js` lock clears).
- **Changes:**
  - Co-locate `@media (prefers-reduced-motion: reduce)` transform resets for `.btn` in `public/assets/site.css` and `.theme-toggle` in `public/assets/theme.css` (`P2.7`); update stale cascade comment in `public/assets/theme.css:3`; update default static `<meta name="theme-color" content="#fffdf8" />` across the 10 HTML files; extend `scripts/check.js` css-class scan to include `public/app/app.css` alongside `public/assets/*.css`.
- **Measurable acceptance checks:**
  1. Under emulated `prefers-reduced-motion: reduce` on `/app`, `/editor`, and `/sign-in`, `getComputedStyle(btn)` on `:hover` / `:active` resolves `transform: none` and `.theme-toggle:active` resolves `translate: none`.
  2. `node scripts/check.js --strict` exits `0` with `0 errors, 0 warnings` across all 10 HTML pages and both CSS directories.
  3. Headless rendered contrast & `axe-core` pass (`P2.9`) across all 10 routes × `{light, dark}` × `{375, 768, 1440}` reports `0` critical/serious WCAG 2.2 AA violations.
