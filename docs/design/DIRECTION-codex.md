# Applywright design direction: Working Proof

Status: design direction for implementation  
Target: hand-written HTML, CSS and small self-hosted JavaScript; no framework or build step  
Required widths: 360, 768 and 1440 CSS px

## 1. Concept

Applywright should feel like a calm working proof prepared by a meticulous editor: one job, one CV, every gap named and every rewrite traceable to its source. The visual language is an application file in progress rather than an AI chat product—cool paper surfaces, dark ink, restrained verification green, strong rules, marginal evidence and a clear next action. That fits somebody applying under pressure because the interface does not perform excitement or promise an outcome; it reduces the search to an ordered set of facts, shows what is ready, shows what still needs attention and keeps the user in control of the final submission.

The direction is called **Working Proof**. Its memorable device is the evidence trace between a source line and its grounded rewrite. Everything else stays quiet.

## 2. Slogan

| Candidate | Rationale |
|---|---|
| **Make your CV fit the job. Keep every fact.** | Names the useful transformation and the non-negotiable grounding rule in two short sentences. It makes no promise about hiring. |
| **A stronger application, still entirely yours.** | Reassuring and human; emphasises ownership, although it says less about job-specific scoring. |
| **Score the gaps. Tailor the truth.** | Compact and memorable, but “the truth” risks sounding moralising and slightly campaign-like. |
| **Match the role without rewriting your history.** | Expresses relevance without fabrication; the negative construction is more defensive than the product needs at first contact. |
| **Know the score. Send the right CV.** | Captures the score-to-pack flow, but “right” is less precise than the product's grounded claim. |

**Recommendation for the hero headline: “Make your CV fit the job. Keep every fact.”**

Use this supporting copy directly below it:

> Score your CV against the job, fix the named gaps and prepare a grounded application pack. Applywright rewrites only what your CV can prove. You submit it.

Primary CTA: **Score your CV**. Secondary CTA: **See how scoring works**. Do not use “Get started” as the hero action; it hides what happens next.

## 3. Type system

Self-host three Latin-subset WOFF2 files under `public/assets/fonts/`; no remote font service is needed, so the CSP stays unchanged.

| Role | Family | Licence | Files and weights | Use |
|---|---|---|---|---|
| Interface | **Public Sans** | SIL Open Font License 1.1 | `public-sans-latin-wght-normal.woff2`, variable 100–900 | Body copy, navigation, controls, form labels, dashboard headings and table content. |
| Document voice | **Literata** | SIL Open Font License 1.1 | `literata-latin-opsz-wght-normal.woff2`, variable optical size and weight | Marketing hero, major marketing section headings, CV/document names and printable-document previews. It is not used for dashboard page titles or buttons. |
| Evidence | **IBM Plex Mono** | SIL Open Font License 1.1 | `ibm-plex-mono-latin-500.woff2`, weight 500 | Score values, weight values, dates, source references, file formats and grounding receipts only. Never use it for navigation, generic labels or decorative eyebrows. |

Fallbacks:

```css
--font-ui: "Public Sans", "Segoe UI Variable Text", "Segoe UI", Arial, sans-serif;
--font-document: "Literata", Georgia, "Times New Roman", serif;
--font-evidence: "IBM Plex Mono", "Cascadia Code", Consolas, monospace;
```

Use `font-display: swap`, `font-synthesis: none` and `font-optical-sizing: auto` on Literata. Keep body copy to `66ch`, ledes to `54ch` and display headings to `12ch`. Text is left-aligned throughout; do not centre marketing copy except a small, isolated empty state.

### Scale and treatment

| Token | Value | Line height | Weight / tracking | Use |
|---|---:|---:|---|---|
| `--type-meta` | `0.8125rem` | `1.45` | Mono 500, `0` tracking | Dates, scores, formats and evidence references. |
| `--type-small` | `0.875rem` | `1.55` | Sans 400/600, `0` | Hints, captions, secondary table content. |
| `--type-body` | `1rem` | `1.62` | Sans 400, `-0.006em` | Default body. |
| `--type-lede` | `clamp(1.0625rem, 1rem + 0.25vw, 1.25rem)` | `1.5` | Sans 400, `-0.012em` | Introductory copy. |
| `--type-h3` | `clamp(1.25rem, 1.15rem + 0.4vw, 1.5rem)` | `1.25` | Sans 650, `-0.022em` | Card, stage and module headings. |
| `--type-h2` | `clamp(2rem, 1.6rem + 1.8vw, 3.25rem)` | `1.08` | Literata 520, `-0.035em` | Marketing section headings. |
| `--type-display` | `clamp(2.75rem, 1.9rem + 4.2vw, 5.75rem)` | `0.98` | Literata 520, `-0.045em` | Home hero only. |
| `--type-app-title` | `clamp(1.75rem, 1.55rem + 0.8vw, 2.25rem)` | `1.12` | Sans 650, `-0.03em` | Product page titles. |

Sentence case is mandatory. Remove tracked all-caps metadata. A heading uses either the serif or the sans, never a mixed-font highlighted word. Use tabular numerals on scores, prices and dates: `font-variant-numeric: tabular-nums`.

## 4. Colour

Keep the **deep-green idea**, but tune it from `#0F6B4F` to the cooler, darker `#0B6046` in light mode. Green is appropriate here because it means “grounding verified” and “ready”, not “AI magic”; it is also an existing brand cue worth preserving. Stop using it as a wash on whole sections or on every selected item. Ink is the primary structural colour; green marks actions, verified evidence and focus.

### Semantic tokens

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--color-canvas` | `#F1F3EF` | `#0E1411` | Page background. Cool ledger grey, not beige. |
| `--color-surface` | `#FFFEFA` | `#151D19` | Primary panels, forms and tables. |
| `--color-surface-subtle` | `#E6EBE5` | `#1C2721` | Rail, grouped rows, quiet notices. |
| `--color-text` | `#161B18` | `#F1F4EF` | Body and headings. |
| `--color-text-muted` | `#4F5B54` | `#ABB6AF` | Secondary copy. |
| `--color-border` | `#BDC7BF` | `#3A4840` | Functional boundaries. Use solid colour, not low-opacity black. |
| `--color-accent` | `#0B6046` | `#77D4A8` | Primary actions, focus and verified evidence. |
| `--color-accent-hover` | `#074936` | `#96E1BD` | Hover/pressed emphasis. |
| `--color-accent-subtle` | `#D9EBE2` | `#1A3B2E` | Selected rows and verified evidence backgrounds. |
| `--color-on-accent` | `#FFFFFF` | `#0E2118` | Text on a filled accent control. |
| `--color-warning` | `#7B5300` | `#F0C36A` | Warning text/rule. Always include a written label. |
| `--color-danger` | `#A6372C` | `#FF9F92` | Error/rejected text/rule. Always include a written label. |
| `--color-focus` | `#0B6046` | `#77D4A8` | `2px` focus ring with `3px` offset. |

Selection uses `--color-accent-subtle` with `--color-text`. The logo ring uses text; its centre uses accent. Do not add a second decorative accent.

### Contrast checks

Ratios are WCAG relative-luminance ratios using the hex values above.

| Mode / surface | Body text | Muted text |
|---|---:|---:|
| Light canvas `#F1F3EF` | `15.62:1` | `6.36:1` |
| Light surface `#FFFEFA` | `17.28:1` | `7.04:1` |
| Light subtle surface `#E6EBE5` | `14.43:1` | `5.88:1` |
| Dark canvas `#0E1411` | `16.80:1` | `8.91:1` |
| Dark surface `#151D19` | `15.49:1` | `8.22:1` |
| Dark subtle surface `#1C2721` | `13.90:1` | `7.38:1` |

White on the light accent is `7.57:1`; dark on the dark-mode accent is `9.42:1`. Both are suitable for button text.

Theme selection has three states: **System**, **Light**, **Dark**. System is the default and follows `prefers-color-scheme`; an explicit user choice sets `data-theme="light"` or `data-theme="dark"` on `<html>` and persists in local storage.

## 5. Layout

### Grid and responsive behaviour

- **360:** 4 columns, `20px` page gutters, `12px` gaps. Everything important is one column. Hero CTAs stack and fill the available width through `420px`; other button groups wrap without forcing full-width controls.
- **768:** 8 columns, `32px` gutters, `20px` gaps. The hero remains stacked; forms use 6 columns and supporting notes use 2.
- **1440:** 12 columns inside a `1248px` maximum marketing wrapper, `48px` outer gutters and `24px` gaps. The hero is 7 columns of copy and 5 columns of proof. Do not stretch prose to fill the wrapper.
- Breakpoints: `600px`, `960px` and `1280px`. Avoid component-specific breakpoints unless content visibly breaks.

The dashboard is not constrained to the marketing wrapper. At `>=960px`, use a `248px` fixed rail and a main work area with `40px` left/right padding, capped at `1280px`. At 1440 the work area uses a 12-column grid; the priority action spans 7 columns and its supporting status spans 5. At 768 the rail becomes an overlay drawer and the main area uses `32px` gutters. At 360 it uses `16px` gutters and a `56px` top bar.

### Spacing and section rhythm

Base unit: `4px`. Supported spacing tokens only: `4, 8, 12, 16, 24, 32, 48, 72, 96px`.

- Marketing sections: `96px` block padding at 1440, `72px` at 768, `56px` at 360.
- Hero: `88px` top and `96px` bottom at 1440; `56px`/`64px` at 768; `40px`/`48px` at 360.
- Section heading to content: `40px` desktop, `32px` tablet/mobile.
- Dashboard page heading to first task: `32px`; module to module: `40px`; title to module content: `16px`.
- Form field gap: `20px`; label to control: `8px`; button group gap: `12px`.

### Shape, border and shadow

- `--radius-control: 4px`; buttons, inputs, selects.
- `--radius-panel: 8px`; panels, tables, score reports.
- `--radius-overlay: 12px`; drawer, popover, modal and toast only.
- `--radius-pill: 999px`; status tokens and segmented controls only. Buttons are not pills.
- Static panels have a `1px solid var(--color-border)` boundary and **no shadow**.
- Use a `2px` accent rule on the left edge for selected/verified states, not a tinted card plus shadow.
- Shadows are reserved for things that physically overlap content: drawer `0 16px 48px rgb(0 0 0 / 0.24)`, popover/toast `0 8px 24px rgb(0 0 0 / 0.20)`. Dark mode uses the same geometry at `0.40` alpha.
- The navigation and tables are separated with rules, not floating rounded containers.

### Marketing composition

Alternate by information structure, not by background colour: proposition, worked proof, ordered process, constraints, plans, questions. No run of three equal “feature cards”. Use full-width ruled rows for claims and a single paper proof panel for examples. The home page should contain at most three surface colours in one viewport.

### Dashboard composition

Every product screen follows: page title, current task, evidence/status, history. The dashboard starts with one “Do next” item, then a compact metric strip, then recent applications and alert hits. CV uses a source column and an analysis column at 1440. Jobs uses a compact filter bar above a ruled result list. Applications keeps a real table at desktop and becomes labelled rows at mobile; status filters remain pills because they are true segmented states.

## 6. Motion system

Motion shows cause and effect; it does not decorate the page.

| Effect | Timing and easing | What moves | Reduced-motion equivalent |
|---|---|---|---|
| Control feedback | `120ms`, `cubic-bezier(0.2, 0, 0, 1)` | Border, background and colour only. Pressed buttons translate `1px` down. | State colours change immediately; no translation. |
| Drawer / disclosure | `180ms`, `cubic-bezier(0.16, 1, 0.3, 1)` | Drawer translates from the inline start by `12px` while opacity reaches 1. Content itself does not stagger. | Drawer appears/disappears immediately in its final position. |
| Toast | enter `160ms` ease-out; exit `120ms` ease-in | Opacity plus `6px` vertical travel. | Instant opacity change, no travel; the same live-region announcement remains. |
| Score update | `420ms`, `cubic-bezier(0.16, 1, 0.3, 1)` | Ring changes from the previous score to the new score; the number cross-fades. Never animate from zero on page load. | New ring and number replace the old state immediately; the live region announces the score. |
| Loading | No looping animation longer than `800ms`; prefer skeleton-free text such as “Reading your CV…” | If a spinner is unavoidable, one `700ms` rotation. | Static 8px accent square plus the same loading text. |

Use these tokens:

```css
--duration-fast: 120ms;
--duration-ui: 180ms;
--duration-data: 420ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
```

### Signature move: the evidence trace

The home hero's worked rewrite contains the same verified facts in source and result: for example `18%`, `2 engineers`, `2 releases`. On first paint, a `2px` green rule draws from source to rewrite over `640ms`; the matching facts receive a left-to-right underline in three `90ms` offsets. It runs once and does not replay on scroll or hover. The facts and the written “Verified against your source” receipt are present before animation, so motion carries no unique information. Under `prefers-reduced-motion: reduce`, the connector and all underlines render in their completed state immediately.

Remove the existing section-by-section scroll reveal, card lift, pulsing “live” dot and generic staggered page entrance. Do not animate theme changes, large blocks of text, layout dimensions, gradients, parallax or background noise.

## 7. Eight concrete changes, ordered by impact

### 1. Replace the visual foundation

**Files:** `public/assets/tokens.css`, `public/assets/theme.css`, new `public/assets/fonts/*`.

- In `tokens.css`, add the three `@font-face` declarations plus the type, spacing, radius and motion primitives. In `theme.css`, define the exact light/dark `--color-*` values and the temporary compatibility aliases.
- Replace the present ink/bone aliases with the semantic `--color-*` tokens. Keep compatibility aliases such as `--paper: var(--color-surface)` and `--text: var(--color-text)` through the redesign, then remove them in one final cleanup after every selector uses semantic names.
- Put the light values on `:root` and the dark values in both `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { ... } }` and `:root[data-theme="dark"] { ... }`. Put an explicit light block on `:root[data-theme="light"]` so a light override wins while the OS is dark.
- Set `color-scheme: light dark`, change body to Public Sans, and change the display utility to Literata. Remove `--ember`, `--lime`, translucent line tokens and the radial-grain utility; they are not part of this direction.
- Replace the global pill radius and shadow defaults with the three radius rules and overlay-only shadows specified above.

### 2. Rebuild the home hero around a worked proof

**Files:** `public/index.html`, `public/assets/site.css`.

- Replace the current headline with the recommended slogan and supporting copy in section 2.
- Remove `section--dark` from the hero. In light mode the hero uses `--color-canvas` with dark text; in dark mode the global theme supplies the dark canvas and light text. Do not force a dark hero inside the light theme.
- Remove `.hero__grad`, the fake browser bar, the decorative score ring and the `78` sample. A static marketing score can drift away from the scoring code and conflicts with the product rule that displayed scores come from enforcement code.
- Replace `.mock` with `<figure class="proof-sheet" data-proof-trace>` containing a `<figcaption>Worked rewrite</figcaption>`, a source row, a tailored row and a written grounding receipt. Wrap each repeated fact in `<mark class="proof-fact">` on both rows. Use real `<del>` only where words are actually removed; do not colour an entire paragraph green.
- At `>=960px`, set `.hero__inner` to the 7/5 grid. At smaller widths stack proof below copy. Give `.proof-sheet` an 8px radius, a surface background, a 1px border and no browser chrome or shadow.
- Change CTAs to **Score your CV** and **See how scoring works**. Keep “Free: one CV and three packs a month. No card.” as a single small line; remove middle-dot separators.

### 3. Replace the generic marketing component grammar

**Files:** `public/assets/site.css`, `public/index.html`, `public/how-it-works.html`.

- Change `.btn` to a 4px radius, `min-height: 44px`, `padding: 0.72rem 1rem`; remove the hover lift. Primary is filled accent, secondary is transparent with a solid border, and textual tertiary actions are underlined text without an appended arrow.
- Restyle `.eyebrow` as a sentence-case `.section-label`: Public Sans 600 at 14px, no letter spacing, no uppercase and no decorative leading hairline. Keep `.eyebrow, .section-label` in one selector while renaming the HTML, then remove the `.eyebrow` alias after all marketing pages are converted.
- Replace `.grid.grid-3` feature-card runs and `.bento` with `.evidence-list`: one bordered container, children separated by horizontal rules, each row using a 4/8-column split at desktop and one column on mobile. This applies to the three home flow statements and the “what it refuses” statements.
- In `how-it-works.html`, change the six `.step` divs to an actual `<ol class="process-list">`. Each `<li class="process-stage">` has a real sequence number, heading, main explanation and muted boundary note. At `>=960px`, use a 3-column sticky process key and a 9-column ruled list; at 360/768 the key is not sticky and the list is one column.
- Remove card shadows, icon tiles, all-caps card kickers, bento gaps and the link-arrow glyph. Keep rounded cards only where the content is genuinely a self-contained document or form.
- Retire forced `.section--dark` bands and the always-dark footer. Bands and footer follow the selected global theme, using canvas, surface and surface-subtle plus borders to create hierarchy.

### 4. Make the app shell operational rather than decorative

**Files:** `public/app/app.html`, `public/app/app.css`.

- Add `class="app-nav-list"` to the product `<ul>` and explicitly set `list-style: none; margin: 0; padding: 0;`. This removes the stray bullets visible in all four app screenshots.
- Change the desktop rail to `248px`, surface-subtle background and a 1px border. The active link gets a `2px` accent inset rule and a subtle surface background; remove the floating white card and shadow.
- Use Public Sans for `#app-title`; reserve Literata for CV names/previews. Reduce rail labels to 15px and keep icons at 18px with a 1.5px stroke.
- Move the desktop breakpoint from `900px` to `960px`. Below it, use a 56px top bar and an overlay drawer no wider than `320px`; do not push the page down when the menu opens. At 360, keep brand, theme button and menu button visible without a primary marketing CTA.
- Move plan usage into a compact `<dl>` in `#app-rail-foot`; write “Free plan · 0 pack credits left” in sentence case. Keep Sign out as a text action, not a full-width pill.

### 5. Put the dashboard's next action first

**Files:** `public/app/app.js` in `renderDashboard()` and `metricCard()`, `public/app/app.css`.

- In `renderDashboard()`, render `nextActionsFor(...)` before metrics. The first item becomes `<section class="aw-priority">` with the action title, one-sentence reason and one primary button. Additional actions become ruled rows below it, not a card inside a section.
- Replace `.aw-grid--metrics` and four `.aw-card` metric boxes with one `<dl class="aw-metric-strip">` containing four `<div>` groups. Use `dt` for Primary CV, Last score, Packs this month and Unread hits; use `dd` for the value; put dates/limits in `<small>`. Separate groups with 1px rules. At 1440 it is four columns, at 768 two by two, at 360 one column.
- Do not render the CV name as a 50px serif block. Use a 16px/650 sans name and the document font only inside a CV-preview component.
- Below metrics, create `.aw-dashboard-grid`: recent applications spans 7 columns and unread alert hits spans 5 at `>=1280px`; both stack below that. Preserve real table semantics.
- The visual reading order must be: Dashboard title → do-next task → score/usage facts → recent history. Empty states occupy the same place as the content they replace.

### 6. Give each product screen a task-specific layout

**Files:** `public/app/app.js` in `renderCvScreen()`, `renderJobsScreen()` and `renderApplicationsScreen()`; `public/app/app.css`.

- **CV:** at `>=1280px`, use `.aw-cv-workspace` with 5 columns for CV source/import and 7 for score/findings. Cap pasted-text fields at `720px` when alone. Put “Import a profile” behind a disclosure unless no CV exists; it must not dominate the library on every visit.
- **Jobs:** replace the large rounded search card with `.aw-filter-bar`, a surface-subtle strip of keyword, location, remote checkbox and action. Results are `.aw-job-row` entries separated by rules; company/title and salary/location are the primary line, source and age are evidence metadata. The capture form is a disclosure titled **Capture a posting** below results, closed by default after the user has at least one saved job.
- **Applications:** keep the table at `>=768px`, remove the outer rounded card, and make the status filter a horizontally scrollable segmented control. Do not freeze a column; allow the table viewport to scroll horizontally from 768–959px. Below 768, each application is a labelled definition list with the status control and CV pack action last.
- Across all three, replace large blank vertical areas with deliberate max-widths; never stretch one text field or three-row table to the full 1440px work area.

### 7. Add system/light/dark control without weakening CSP

**Files:** new `public/assets/theme.js`, `public/partials/nav.html`, `public/app/app.html`, and every page `<head>` that currently links `theme.css`.

- Add `<script src="/assets/theme.js"></script>` in `<head>` before the stylesheets, without `defer`, so the saved attribute is applied before first paint. It is same-origin and complies with `script-src 'self'`; do not add inline boot code.
- `theme.js` reads `localStorage.getItem('applywright-theme')`, accepts only `light` or `dark`, and otherwise removes `data-theme`. After DOM ready it binds all `[data-theme-toggle]` controls, cycling System → Light → Dark, updating visible text and `aria-label`, and updating `<meta name="theme-color">` to the effective canvas colour. Listen to `matchMedia('(prefers-color-scheme: dark)')` only while the state is System.
- Add a 44×44 button to `.nav__actions` and `#app-rail-foot`: `<button type="button" class="theme-toggle" data-theme-toggle><span aria-hidden="true">◐</span><span class="sr-only">Colour theme: system</span></button>`. Marketing navigation shows the icon only. The app rail adds a visible `[data-theme-label]` span containing System, Light or Dark at `>=960px`; the label is visually hidden below that breakpoint.
- A storage exception must fail closed to System. Theme changes are instant; do not place a transition on `*`, `body` or CSS custom properties.

### 8. Replace generic motion with the evidence trace

**Files:** `public/assets/motion.css`, `public/assets/site.js`, `public/app/app.css`, `public/index.html`.

- Delete the IntersectionObserver scroll-reveal block in `site.js`, the `.reveal` hidden state in `tokens.css`, the generic `aw-enter` stagger, card hover lift and pulsing live dot in `motion.css`.
- Implement the proof connector with a pseudo-element or inline SVG whose `transform-origin` is the source side and whose `scaleX` animates 0→1 over `640ms var(--ease-out)`. Implement `.proof-fact` underline with a background-size animation and `90ms` offsets. Place all animation inside `@media (prefers-reduced-motion: no-preference)`.
- Under `prefers-reduced-motion: reduce`, force connector scale and underline background-size to their final values; turn drawer, toast, score and spinner movement into the equivalents in section 6.
- Keep only direct state transitions in app CSS. The score ring transitions only when an analysis response replaces a previous score, never merely because the page loaded.

## 8. Anti-patterns to avoid

- No aurora, mesh or radial gradients; no glowing green fog behind the hero.
- No AI sparkle, wand, robot, chatbot bubble or “powered by AI” motif. The product's distinction is grounded evidence, not model presence.
- No fake customer logos, testimonials, activity feeds, counters or sample scores presented as current product data.
- No “land your dream job”, “10× your applications”, “beat the ATS” or implied hiring guarantee.
- No three-across field of identical rounded cards, generic bento grid or shadow on every surface.
- No pill buttons. Pills are reserved for statuses, filters and segmented state.
- No tracked all-caps mono eyebrow above every heading. Mono is evidence, not decoration.
- No single italic/green word in a headline and no serif used merely to make the dashboard look premium.
- No appended arrow on every link, hover lift on every panel or fade-up reveal on every section.
- No animated score count from zero; it implies a computation that did not occur on page load.
- No green-only success or red-only failure. Every status includes text and, where useful, a shape or rule.
- No résumé stock photography, anonymous office people, floating document thumbnails or browser-window chrome around static copy.
- No claim that Applywright submits, scrapes LinkedIn, fabricates experience or silently retains the uploaded binary.

The final test is simple: if the logo and product name were removed, the page should still look like a careful, traceable CV-preparation workspace—not a generic AI SaaS landing page.
