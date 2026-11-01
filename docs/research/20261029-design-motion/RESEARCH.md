# Professional fluid motion for Applywright — research and option assessment

**Task:** DSH Flash/high research sub-agent, 29 October 2026. Disjoint docs-only stream
commissioned by `docs/resume/20261029/RESUME-PLAN.md` production-queue item 3.
**Base:** `6e6c13f5db5df83dc625c7197067b851f165f14f`, branch `t3/design-motion-research`,
worktree `C:\Users.johan\.t3\worktrees\applywright\t3-a4aeb610`.
**Mode:** SOURCE ONLY. No Node, tests, builds, browser, GUI, model API, or product
execution. No pixel was decoded, no frame was timed, and no assistive technology was
driven by this task. Every performance number below is either quoted from a primary
source or labelled as a **historical operator measurement already recorded in this
repo**; none is a new result.

This file answers one question: *which motion and interaction techniques should a
vanilla HTML/CSS/JS product with an existing `Pressproof` design system adopt, in what
order, and what must be true before each one ships?* It is deliberately bounded. It is
not a catalogue of animation libraries and it does not re-open the visual direction.

---

## 1. Method and evidence tiers

**Tier A — live primary sources fetched for this task** (URLs and retrieval date in
`SOURCES.json`): MDN reference pages and the machine-readable MDN browser-compat-data
(BCD), the Chrome for Developers View Transitions guides, W3C WCAG 2.2 Understanding
documents, official GitHub repository metadata, the npm registry, and the GSAP licence.

**Tier B — current product source at the pinned HEAD**, read statically and hashed:
`public/assets/motion.css`, `site.css`, `theme.css`, `tokens.css`, `editor.css`,
`editor.js`, `site.js`, `public/app/app.css`, `app.js`, `app.html`, `public/editor.html`,
and `docs/MOTION.md`. Exact hashes are in `RESULT.md`.

**Tier C — historical operator measurements recorded in `docs/MOTION.md`** (Edge
156.0.4314.50 over CDP, 28 October 2026, live server `:3160`). These are the only
rendered numbers this project owns. They are quoted as *recorded*, not re-verified, and
they do not transfer to any change proposed here.

**Not evidence:** search snippets, star counts, vendor marketing copy, the prior Gemini
report's visual language, and the project's own screenshots (no pixels were delivered to
this task).

A note on dates: the harness clock reads 2026-10-29 and upstream pages report 2026
revisions (for example WCAG 2.2.2 was "Updated 10 August 2026"). BCD version numbers are
the authoritative support statement; publication dates are given only where the source
itself states one.

---

## 2. What already ships, and why it changes the recommendation

Applywright is not starting from zero. `docs/MOTION.md` records a two-round motion pass
that already retired the defects a generic "add smooth animations" brief would
reintroduce:

| Already decided | Source | Consequence for this research |
|---|---|---|
| One move per surface; no parallax, typing, loops, or scroll-triggered reveals | `docs/MOTION.md` §1, SPEC-V2 §5 | New work must fit an existing surface, not add a second reveal system. |
| Only `transform` / `translate` / `opacity` move; zero layout properties animated | `docs/MOTION.md` §1 (grep-verified) | Any library that animates `width`/`height` is out by default. |
| Four durations, one long exception (560 ms hero trace); everything else ≤ 320 ms | `docs/MOTION.md` §1 | A 250–375 ms default from a library is not automatically acceptable. |
| Reduced motion collapses durations globally; marketing motion is inside `no-preference` | `tokens.css:242-253`, `motion.css` | Adding motion outside `motion.css` needs its own reduce guard. |
| Cross-document View Transitions ship behind `@supports` + `no-preference` | `motion.css:302-349` | The pattern is proven here; only its coverage is incomplete. |
| The infinite spinner and the `width` transition were deleted as defects | `docs/MOTION.md` §2 rows 19–20 | "Fluidity" is not "more animation". |

Recorded measurements worth keeping in view (operator-measured, 28 Oct 2026):

- Cross-document View Transition cost: **+16 ms FCP/LCP at 1× CPU, +108 ms at 6× CPU**
  on a same-tab `/` → `/pricing` navigation (`docs/MOTION.md` §7). The transition buys
  continuity, not speed.
- 6× CPU scroll on `/` and `/app`: 0 frames over 32 ms, 0 long tasks, 0 layouts
  (`docs/MOTION.md` §6). The current baseline is already smooth; the risk in new work
  is regression, not rescue.
- The scroll hairline costs ~150 style recalcs and ~31 ms of task time across a whole
  scroll (`docs/MOTION.md` §12.7) — measurable but not janky. It is the ceiling for
  decorative scroll work, and it is already spent.

**Conclusion:** the useful question is not "which animation library". It is "where is
the product's motion contract currently broken or absent, and what is the smallest
native mechanism that closes each gap without spending the performance budget twice?"

---

## 3. Gap register — where the current contract is not actually met

Each row is a static source fact at `6e6c13f`, not a rendered observation.

| ID | Gap | Exact evidence | Why it matters |
|---|---|---|---|
| **G1** | **SPA route swaps have no transition and no route label.** `renderRoute()` replaces the whole view, then focuses `<main id="app-main" tabindex="-1">`. The main element has no `aria-labelledby`, so focus announces "main", not the new screen. | `public/app/app.js:4140-4159`; `public/app/app.html:105` (`<main id="app-main" tabindex="-1">`), `:111` (`#app-view`) | Every `/app` navigation is an abrupt content replacement. This is the largest *interaction* gap on the product surface, and the cheapest to make professional. |
| **G2** | **Motion delivery is unevenly wired.** `motion.css` is linked only from `public/partials/nav.html:6`. Marketing pages include that partial; `app.html`, `editor.html`, `sign-in`, `sign-up`, `reset` do not. Those pages therefore get no cross-document view transition, no shared hover/press reset, and no `@starting-style` layer. | stylesheet inventory over `public/*.html`, `public/app/app.html`, `public/partials/nav.html` | The same `.btn` behaves differently depending on which page you are on. This is the root cause of the prior Gemini finding P2-2 ("reduced-motion transform overrides missing on `/app`, `/editor`, auth"). |
| **G3** | **JavaScript smooth scrolling ignores the user's motion preference.** Four call sites pass `behavior: "smooth"` unconditionally. `editor.js` already has the correct pattern two functions away. | unguarded: `app.js:1683`, `app.js:2196`, `app.js:2670`, `editor.js:1433`. Guarded correctly: `editor.js:1090-1092` (`matchMedia("(prefers-reduced-motion: reduce)")` → `behavior: reduce ? "auto" : "smooth"`) | `html { scroll-behavior: auto }` under reduce (`tokens.css:242-245`) does not remove a per-call `behavior: "smooth"` request. These are interaction-triggered moves on the exact screens where a user is reading a long CV. |
| **G4** | **The editor has no motion layer at all.** `editor.css` contains **zero** `transition:` and **zero** `animation:` declarations (grep). Save state is text + colour only; a proposal hunk appears in place with no entry cue. | `public/assets/editor.css` (all 21,889 bytes), `editor.js:1148-1161` (`setSaveState` writes `data-state` + text on `[data-savestate]`) | The screen whose primary verb is "save" gives no movement feedback, while marketing pages have three entrance systems. The fix is small and contained. |
| **G5** | **Save-state announcement is better than the static audit claims, but still incomplete.** Success is announced (`editor.js:1391 announce("Saved at …")`, `!quiet` only) through `#ed-status` (`editor.html:320`, `role="status" aria-live="polite"`). Busy and loading are **not** announced, and `setSaveState()` never calls `announce()`. | `editor.js:1129-1132`, `:1148-1161`, `:1354-1399`, `:1391`; `editor.html:320` | `docs/verification/20261029-a11y-app-editor/STATIC-A11Y-AUDIT.md` D2 says "0 live regions" and was read at `6e3eb12`; at `6e6c13f` the live region exists. Reconcile before using D2 as a work item. Any *motion* on the save marker must not become the only signal. |
| **G6** | **Cross-document View Transitions are Chromium/Safari only.** Firefox has no `@view-transition` support. The existing `@supports (view-transition-name: none)` gate means Firefox silently gets a hard navigation, which is correct but invisible in review. | `motion.css:302-306`; BCD `@view-transition` [S04] | Keep it progressive. Do not make continuity a requirement for task completion. |
| **G7** | **The `.aw-meter__fill` lesson is not yet encoded as a rule.** The width transition was removed by hand; there is no guard preventing the next contributor from animating a layout property. | `docs/MOTION.md` §2 row 19; no automated motion-property check exists in `scripts/check.js` | A source-only follow-up could add a static assertion (see ADOPTION-PLAN Phase 0). |
| **G8** | **Focus is moved, but the thing focused is unlabelled, and a proposed sticky dock can obscure it.** `main.focus({preventScroll:true})` exists; the dock proposal (Gemini Alternative B) is a sticky footer that must not cover the focused control. | `app.js:4156-4159`; WCAG 2.4.11 [S13]; Gemini review §3.1 | Motion and layout changes must be checked against focus visibility, not only against taste. |

G1 and G3 are defects in the current contract. G2 and G4 are absences. G6–G8 are
constraints on any fix. Nothing here requires a framework or a dependency.

---

## 4. Options evaluated

Eight options were assessed against the same tests: vanilla fit, dependency and module
strategy, documented payload, reduced-motion control, focus/keyboard/AT implications,
progressive enhancement, performance risk, adoption effort, and rollback. Sizes are
whatever the cited artefact states; **no bundle was built or measured by this task**.

### O1 — Native CSS transitions + `@starting-style` + `allow-discrete` (pattern)

- **What it is:** transition an element from a defined first-style state when it is
  first rendered or changes from `display: none`, rather than from "no previous style".
  `transition-behavior: allow-discrete` lets `display`/`content-visibility` participate.
- **Primary sources:** MDN `@starting-style`, Baseline 2024, "works across the latest
  devices and browser versions since August 2024" [S01]; BCD adds exact versions —
  Chrome 117, Firefox 129, Safari 17.5 [S02]. `transition-behavior` is Chrome 117,
  Safari 17.4, Firefox 129 **partial** (transitioning `display` is not supported; bug
  1882408) [S03].
- **Vanilla fit / dependencies:** zero. It is the idiom the project already uses.
- **Documented payload:** none (platform feature).
- **Where it fits Applywright:** the proposal diff rows (`editor.js` builds
  `.ed-diff__row` into `#ed-diff-region`), the proposal block inserted by
  `revealReview()`, the `#app-toast`, and the theme control's injected arrival.
- **Reduced motion:** put the `@starting-style` and `transition` inside
  `@media (prefers-reduced-motion: no-preference)`, or let the existing global 0.01 ms
  collapse handle it. The global collapse is a floor, not a design: it turns a 180 ms
  fade into a 0.01 ms one, which is effectively instant.
- **Focus / keyboard / AT:** inserting a node and fading it does not change tab order.
  **The real hazard is exit:** if a removed element is kept displayed for a transition,
  it can remain focusable or exposed while it is visually leaving. For anything
  destructive or focus-holding, remove it from the accessibility tree immediately
  (`inert`, `hidden`, or removal) and animate only a non-interactive wrapper. Never put
  a focusing move behind an animation.
- **Performance risk:** low if only `opacity`/`translate` change. `@starting-style` on a
  `display` transition can delay layout and should be reserved for small surfaces.
- **Effort:** S (CSS only, plus a class toggle where JS inserts nodes). **Rollback:**
  delete the block; the DOM is unchanged.

### O2 — Same-document View Transitions for SPA route swaps (pattern)

- **What it is:** `document.startViewTransition(updateCallback)` snapshots the old and
  new DOM and cross-fades (or custom-animates) between them.
- **Primary sources:** BCD `ViewTransition` — Chrome 111, Firefox 144, Safari 18 [S05];
  `view-transition-name` has the same baseline [S06]. Chrome's same-document guide [S07]
  documents the operational rules that matter most here:
  - "Only one view transition is allowed to run at a time. If a new view transition
    starts while one is already running, the old transition skips to the end."
  - during the update callback "the page is frozen"; network fetches should happen
    before `startViewTransition`, not inside it;
  - the default group animation includes **position/transform, width and height**, and
    the guide says animating width/height is "generally frowned upon … as it runs
    layout per frame", with the optimisation not yet implemented;
  - reduced motion is **not automatic**: the guide shows an explicit
    `@media (prefers-reduced-motion) { ::view-transition-* { animation: none !important } }`
    and cautions that "reduced motion doesn't mean no motion".
- **Vanilla fit / dependencies:** zero; one feature-detected call in `app.js`.
- **Where it fits Applywright:** `renderRoute()` (`app.js:4130-4160`) is exactly the
  shape the API expects: a synchronous DOM replacement followed by focus. Wrap the
  `mount.replaceChildren(...)` + focus in the callback, after the route's data has
  already been fetched. Only the root is captured by default, so the whole view
  crossfades; give the rail or nav a `view-transition-name` only if its box is identical
  on both routes (the cross-document code already names `.nav`/`.footer`), and name
  nothing whose box changes size.
- **Reduced motion:** do not call the API at all when
  `matchMedia("(prefers-reduced-motion: reduce)").matches`; render synchronously. A CSS
  `animation: none` override still pays snapshot cost.
- **Focus / keyboard / AT:** the DOM is the same DOM; Assistive Technology sees the new
  content. Focus still has to be moved deliberately. Add
  `aria-labelledby="app-title"` to `#app-main` so the existing focus call announces the
  screen name. Do **not** move focus inside the update callback in a way that depends on
  the animation finishing.
- **Performance risk:** one full-viewport snapshot + crossfade per route change. Cost is
  bounded by route-change frequency. It is not appropriate for list refreshes, toasts,
  or per-keystroke state.
- **Effort:** M (roughly 15–30 JS lines + a small CSS block). **Rollback:** remove the
  wrapper, or gate it behind a constant; the synchronous path remains.

### O3 — Cross-document View Transitions (pattern; already shipped)

- **What it is:** `@view-transition { navigation: auto }` cross-fades whole-document
  navigations.
- **Primary sources:** BCD `@view-transition` — Chrome 126, Safari 18.2, **Firefox
  false** [S04]. The project already ships it `motion.css:302-349`, gated by
  `@supports` and `no-preference`, with `.nav`/`.footer` named.
- **Fit:** already correct for marketing pages. The only change worth considering is
  loading `motion.css` on the product pages too (G2), which would also deliver the
  reduce resets. That is a delivery decision, not a new technique.
- **Performance:** the operator-measured +16 ms (1×) / +108 ms (6×) is the price of
  continuity on a navigation; it is not paid on interaction.
- **Effort:** XS to retain; S to extend the include. **Rollback:** one line
  (`navigation: none` / remove include).

### O4 — Web Animations API `Element.animate` for FLIP (pattern)

- **What it is:** measure first/last boxes, apply an inverting transform, then animate to
  identity. `Animation` objects are cancellable and awaitable.
- **Primary sources:** MDN `Element.animate` and the Web Animations API guide [S08].
  (Universal browser support; no compatibility table needed.)
- **Fit:** only where an element genuinely *moves* between two positions. Current flows
  mostly replace children rather than reorder them. The one candidate is relocating the
  proposal host into the main column (`editor.js:797-853` per the prior review), but
  that is a one-time structural move, not a repeated interaction, and animating it
  would draw the eye to a layout jump that currently does not exist.
- **Reduced motion:** simply do not call `animate()`; apply the final style.
- **Focus / AT:** FLIP changes only the visual transform; the DOM stays put. If the move
  also changes DOM order, focus order changes and must be handled separately.
- **Performance:** compositor-friendly if only transform; layout reads (getBoundingClientRect)
  are the cost, and are fine for a handful of elements.
- **Effort:** S–M. **Rollback:** delete the helper; no persistent style.
- **Verdict: HOLD.** Adopt only when a measured reorder case appears. Do not invent one.

### O5 — CSS scroll-driven animations (`animation-timeline`) (pattern; already shipped)

- **What it is:** bind an animation's progress to scroll position or element visibility
  without a listener.
- **Primary sources:** BCD `animation-timeline` — Chrome 115, Firefox 159, Safari 26
  [S09]. The project ships one use: the 2 px scroll hairline on pages with `.table-wrap`,
  `motion.css:157-199`.
- **Fit:** the single use is defensible: it communicates position and animates only
  `scaleX`. It also costs ~150 style recalcs per scroll (historical operator
  measurement, `docs/MOTION.md` §12.7).
- **Do not extend it** to entrance reveals (`view()` timelines). That would reintroduce
  the scroll-triggered motion `docs/MOTION.md` deliberately retired, and it would spend
  the same recalculation budget again.
- **Reduced motion / support:** already inside `no-preference` + `@supports`; unsupported
  engines get no hairline, which is the honest fallback.
- **Effort:** zero to retain. **Rollback:** delete the block.

### O6 — AutoAnimate (`@formkit/auto-animate`) (library)

- **Identity / licence:** `formkit/auto-animate`, MIT, created 2022-05-11, last push
  2026-07-10, 13,946 stars, not archived [S15]. Latest release **v0.10.0**, published
  2026-07-10 [S16]. npm `0.10.0`, `dist.unpackedSize` **59,207 bytes**, 27 files, **no
  runtime dependencies** in `package.json` [S17].
- **What it does:** one call observes a parent's child list and animates additions,
  removals and moves with the Web Animations API [S18].
- **Reduced motion:** **built in and on by default** — the source disables itself when
  `matchMedia("(prefers-reduced-motion: reduce)").matches`, unless the documented
  `disrespectUserMotionPreference` option is set ("not recommended") [S18].
- **Why it is not adopted for these flows:**
  1. **It animates layout.** When an element's size changes it animates `width` and
     `height` (`start.width`/`start.height` in `remain()`), exactly the property class
     this repo forbids.
  2. **It runs standing machinery.** MutationObserver + ResizeObserver +
     IntersectionObserver + a 2-second `setInterval` poll per tracked element +
     `requestIdleCallback`/rAF [S18]. That is a lot of ambient work for a long-lived SPA,
     and it mutates the parent's `position` to `relative`.
  3. **Removal re-parents the node** with `position:absolute`, `pointer-events:none`,
     then removes it after the animation [S18] — a focus/AT hazard if the removed row
     held focus.
  4. Its defaults are 250 ms (removal/remain) and 375 ms (addition), outside the
     project's 120/180 ms state vocabulary.
- **Effort:** S to add, but M to contain. **Rollback:** remove the call.
- **Verdict: DEFER / not for current flows.** It is a legitimate library with a good
  licence and a real reduced-motion default; it simply solves a problem this product
  does not have, with costs this product has already decided not to pay.

### O7 — Motion (`motion`, formerly Framer Motion / Motion One) (library)

- **Identity / licence:** `motiondivision/motion`, MIT, last push 2026-10-29, 34,651
  stars, not archived [S19]. npm **14.7.1**, `dist.unpackedSize` **922,802 bytes**,
  dependencies `tslib` and `framer-motion@14.7.1`; React is an optional peer dependency
  [S20]. No GitHub release objects are published for the current line (the releases API
  returned an empty list) [S21], so the npm version is the release evidence.
- **Fit:** excellent for React; for a hand-written vanilla SPA whose entire motion need
  is four state transitions and one route crossfade, it is a large dependency with a
  React-oriented transitive package. The `motion/mini` export exists, but the published
  package still installs the full dependency set, so the package-level size is the
  honest adoption cost.
- **Reduced motion:** the library documents reduced-motion handling, but the app would
  still need its own policy for which transitions are removed vs shortened.
- **Verdict: REJECT for this scope.** Revisit only if the product grows orchestrated,
  spring-based, interruptible sequences that WAAPI cannot express cleanly.

### O8 — Lenis smooth scrolling (library)

- **Identity / licence:** `darkroomengineering/lenis`, MIT, last push 2026-10-29,
  16,957 stars, not archived [S22].
- **What it is:** a smooth-scroll wrapper that takes over wheel/touch scrolling.
- **Why rejected:** it hijacks the scroll gesture, which is the one interaction the
  product must not reinterpret. It conflicts with native keyboard scrolling, scroll
  anchoring, find-in-page, and the user's OS motion preference; it would also invalidate
  the existing `scroll-behavior: auto` reduce rule and the measured zero-layout scroll
  budget. The product has no design need for inertia.
- **Effort:** S to add, L to unwind. **Verdict: REJECT.**

### Screened but not qualified further

| Candidate | Why it was not taken to a full assessment |
|---|---|
| **GSAP** (`greensock/GSAP`) | Its current licence is a proprietary Webflow "Standard 'No Charge' GSAP License" (effective 2025-04-30, modified 2025-05-30), not an OSI licence; it restricts competitive visual-animation builders and reserves termination/amendment rights [S23]. Adding it changes the licence surface of an MIT project for capability this scope does not need. |
| **anime.js** (`juliangarnier/anime`, MIT, last push 2026-08-21 [S24]) | A general-purpose tween engine with no capability the four native patterns lack for these flows; it would add a dependency and a second timing model. |
| **Swup / Barba.js** | Page-transition routers that restructure navigation. The app already has a hand-written SPA router and a working cross-document View Transition; either would duplicate both. Not fetched or qualified — screened by role. |
| **`interpolate-size` / `calc-size` for height-auto animation** | Chrome 129+ only, still marked experimental in BCD; Firefox and Safari report `false` [S10]. Unusable as a progressive baseline, and animating height is out by canon. |

---

## 5. Option matrix

| Option | Vanilla fit | Dependency / payload | Reduced motion | Layout animation | Focus/AT risk | Support | Effort | Verdict |
|---|---|---|---|---|---|---|---|---|
| O1 CSS transitions + `@starting-style` | Native | none | media query / global collapse | none if opacity/translate | exit-node exposure | Chrome 117 / FF 129 / Safari 17.5 | S | **Adopt (P1)** |
| O2 Same-document VT | Native | none | manual guard required | default group animates box; avoid sized names | focus still manual; label `main` | Chrome 111 / FF 144 / Safari 18 | M | **Adopt (P2)** |
| O3 Cross-document VT | Native | none | already guarded | no | none | Chrome 126 / Safari 18.2 / FF no | XS | **Retain / extend include** |
| O4 WAAPI FLIP | Native | none | skip call | transform only | DOM order separate | universal | S–M | **Hold** |
| O5 Scroll-driven CSS | Native | none | already guarded | none (`scaleX`) | none | Chrome 115 / FF 159 / Safari 26 | XS | **Retain, don't extend** |
| O6 AutoAnimate | Good | 59,207 B unpacked, 0 deps | built-in default | **yes** (`width`/`height`) | removal re-parent | modern | S add / M contain | **Defer** |
| O7 Motion | Good vanilla entry | 922,802 B unpacked + framer-motion | documented | avoidable | medium | modern | M | **Reject** |
| O8 Lenis | Good | small (not measured) | n/a | scroll hijack | high | modern | S / L unwind | **Reject** |

**Selected stack: O1 + O2, retaining O3 and O5, holding O4.** That is zero new
dependencies, one new feature-detected API call, and CSS that fits the existing token
vocabulary.

---

## 6. Bookmark discovery — ACCESS_ABSENT for this worker

The task asked for already-authorised X bookmark metadata/export pointers in project
docs or the hub intake documentation. What exists is **documentation of past
interactive reads**, not a public-safe export artifact:

| Pointer | What it says | Usable here? |
|---|---|---|
| `agent-system/docs/DOC-INDEX.md:978` | Points to `ASTRA-ARCHITECTURE-TAKEOVER-20260929/MODEL-AND-BOOKMARK-INTAKE.md` and `X-MEMORY-SOURCE-INTAKE-20260929.md` | No — both describe capture "through a dedicated read-only Chrome research tab" / "through the connected Chrome UI" |
| `.../MODEL-AND-BOOKMARK-INTAKE.md:3` | "Captured by Astra through a dedicated read-only Chrome research tab" | No — interactive browser, not an export |
| `.../X-MEMORY-SOURCE-INTAKE-20260929.md:3` | "Root inspected Johan's X bookmarks through the connected Chrome UI" | No — interactive browser, not an export |
| `.../research-intake-20261004/resume-20261019/cr1-x/CR1-X-TRIAGE-20261019.md` | A 35,384-byte triage of 38 bookmarks, read-only, metadata via `gh api`/`npm view`; it references raw/list files (`x-reads-raw-20261019.md`, `x-new-bookmarks-list-20261019.tsv`) | Triage only. The **raw and list files are not present** in the directory listing — the checkpoint that names them is stale. |
| `.../CHECKPOINT-RESEARCH-20261019.md:27` | Names an `estate-x-reader` profile under `~/.local/share/` | No — private agent home; explicitly out of bounds |
| `.../intake-20261019/research/INTAKE.md` | 18 pasted public links, several requiring Johan's sign-in | Public links only; none is a bookmark export |

**Result: `ACCESS_ABSENT`.** No explicit authorised public-safe bookmark export or
connector is available to a headless source worker, and the two capture routes that do
exist require an interactive signed-in Chrome session this task is forbidden to touch.
No private saved text was read, copied, or published. Public research continued
immediately, as instructed, and no Grok wait or Johan sign-in was requested.

The one public-safe by-product: the triage doc's public `x.com` URLs are pointers, not
evidence. None was needed; every recommendation above stands on the primary sources in
`SOURCES.json`.

---

## 7. Honest unknowns

| Unknown | Why it stays unknown | What would resolve it |
|---|---|---|
| Actual bundle cost of any option in *this* app | No build was run; npm `unpackedSize` is a package-level number, not minified+gzip, not tree-shaken | An operator build with the real import graph |
| Same-document VT cost on `/app` | Not measured; the +16/+108 ms figures are cross-document, different surfaces | Operator CDP run: `PerformanceObserver` LCP + `Tracing` at 1× and 6× |
| Whether `@starting-style` on the diff rows is perceptible or noise | Not rendered | A/B with reduced motion, 1440 and 375, real content |
| Rendered contrast, focus order, AT announcements on `/app` and `/editor` | No browser/AT was used; prior audits are static and partly stale (G5) | Operator browser gate + manual screen-reader pass |
| Firefox behaviour of the SPA transition fallback | Reasoned from BCD support, not executed | Cross-browser run |
| Cost/usage/served identity of this research task | Not exposed by the harness | Harness receipt |

---

## 8. Recommendation in one paragraph

Adopt nothing new. Make the existing native layer honest and complete: guard the four
unguarded smooth-scroll calls, give the editor the 120/180 ms state feedback it is
missing with `@starting-style` on inserted rows, label `#app-main` and cross-fade SPA
route swaps with a feature-detected `document.startViewTransition` that is skipped under
reduced motion. Keep cross-document View Transitions and the scroll hairline exactly as
they are; do not add AutoAnimate, Motion, Lenis, or GSAP. The detailed phasing,
component hypotheses, checks to run later, and rollback for each step are in
`ADOPTION-PLAN.md`.
