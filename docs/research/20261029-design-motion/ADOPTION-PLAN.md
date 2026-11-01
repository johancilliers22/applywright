# Adoption plan — motion and interaction, phased and reversible

**Status:** proposal only. Nothing in this plan has been applied, executed, or tested.
Every command and assertion below is **defined but NOT RUN** by this task. The project
operator (`01a183ff-e374-7d32-ae0e-1938714e813c`) owns integration, execution, acceptance
and commit/push; this file is input to that decision.

**Companion records:** `RESEARCH.md` (evidence and option verdicts), `SOURCES.json`
(citations), `RESULT.md` (process and hashes).

---

## 0. Guardrails that outrank every item below

1. **Save/API semantics do not change.** No optimistic write, no auto-save, no change to
   `PATCH /api/cvs/:id`, no reordering of `setSaveState()` relative to the server
   response. Motion follows state; it never announces a state the server has not
   confirmed.
2. **One move per surface.** A control's state change and a page's arrival are different
   surfaces. Do not add a second entrance to a page that already has one.
3. **Only `opacity`, `translate`, `transform` move.** No `width`, `height`, `top`,
   `margin`, `padding`, `inset`, or `flex` transitions. `background`/`color`/`border-color`
   may transition because they are paint, not motion.
4. **Reduced motion is a first-class branch, not a postscript.** Any JS that requests
   smooth motion must check `matchMedia("(prefers-reduced-motion: reduce)")` first.
5. **Focus is never moved by an animation and never hidden by one.** WCAG 2.4.11 [S13]
   applies to the sticky dock and any sticky bar.
6. **No new dependency** in Phases 0–3. A dependency needs a separate proposal with a
   measured bundle and a licence review.
7. **Preserve other owners' files and frozen attempts.** Each phase names a hypothesis;
   the operator maps it to the current owner (SPA, editor, design, a11y) before any write.

---

## 1. Ranked sequence

| Rank | Phase | Flow | What changes | New motion | Risk | Effort | Why this rank |
|---:|---|---|---|---|---|---|---|
| 1 | **P0** | Cross-cutting | Truth + parity: guard 4 smooth scrolls, fix `#app-main` label, decide `motion.css` delivery | none | Low | S | Removes defects before adding anything; makes later phases safe. |
| 2 | **P1** | Editor save / proposal | Save-marker state transition, staged-hunk rule, diff-row entry via `@starting-style` | 120/180 ms, colour + 2 px translate | Low | S–M | Highest-value screen with zero existing motion; contained to two files. |
| 3 | **P2** | SPA route swaps | 120 ms opacity fade on the route mount (2a); same-document VT only after a synchronous commit point exists (2b) | opacity 120 ms; VT crossfade 180 ms | Medium | S then M | The largest interaction gap, but the current router writes inside `route.render`, so VT needs a refactor first. |
| 4 | **P3** | Folio / proof | `.aw-folio`/`.aw-proof` are design work; the only motion is a 180 ms crossfade when one pack replaces another | 180 ms opacity | Low | M | Design value is in the static artefact; motion adds little and must not distract. |
| 5 | **P4** | Responsive interactions | Thumb-zone save dock (Gemini Alternative B), drawer and sheet transitions | 120 ms translate/opacity; 44 px target | Medium | M | Real usability win on phones, but the sticky layer must pass 2.4.11 first. |

Phases 1 and 2 are independent and can be reviewed in parallel. Phase 3 depends on the
folio implementation landing; Phase 4 depends on P0's focus-label work.

---

## 2. Phase 0 — make the baseline honest (no new motion)

### 0.1 Guard the four unguarded smooth scrolls

**Evidence:** `public/app/app.js:1683`, `:2196`, `:2670`, `public/assets/editor.js:1433`.
The correct pattern already exists at `editor.js:1090-1092`.

**Hypothesis (illustrative, not applied):**

```js
const reduceMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

target.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
```

**Why it matters:** `tokens.css:242-245` sets `html { scroll-behavior: auto }` under
reduce, but a per-call `behavior: "smooth"` is an explicit request; the CSS floor does
not remove it. This is an interaction-triggered move on long CV screens, i.e. exactly the
case WCAG 2.3.3 [S11] describes.

**Reduced-motion fallback:** instant scroll. **Rollback:** revert the four call sites.
**Acceptance definition (NOT RUN):** under emulated reduce, each call site resolves to
`behavior: "auto"` (source assertion or a single CDP scroll test); under no-preference it
remains smooth.

### 0.2 Label the SPA route target

**Evidence:** `app.html:105` `<main id="app-main" tabindex="-1">`, `:107`
`<h1 id="app-title">`, `app.js:4103` updates the heading, `app.js:4156-4159` focuses
`main` without a name.

**Change hypothesis:** add `aria-labelledby="app-title"` to `#app-main` (one attribute).
The existing focus call then announces the new screen's heading instead of "main".

**Acceptance definition (NOT RUN):** after a client-side route change, the focused
element has `aria-labelledby="app-title"` and its accessible name resolves to the current
`#app-title` text; no duplicate `id` in the document.

### 0.3 Decide motion delivery once (G2)

**Problem:** `motion.css` is loaded only through `partials/nav.html:6`. The product pages
(`app.html`, `editor.html`, `sign-in`, `sign-up`, `reset`) get no `motion.css`, so they
miss the hover/press resets and the cross-document transition.

**Two viable hypotheses (operator chooses; do not do both blindly):**

- **Option A — include it.** Add `<link rel="stylesheet" href="/assets/motion.css" />` to
  the five product/auth pages (or move the link into a shared head partial if one
  exists). Smallest diff; gives every page the same reduce resets. Risk: `motion.css`
  contains marketing-only selectors (`.hero`, `.hero-proof`, `html:has(.table-wrap)`)
  that simply do not match elsewhere; that is harmless, but it also means the file is
  not a clean "base" layer.
- **Option B — co-locate the resets.** Move the `prefers-reduced-motion: reduce` blocks
  for `.btn`, `.theme-toggle`, `.nav__toggle`, `.link-arrow` next to the rules they
  cancel in `site.css`/`theme.css`, and keep `motion.css` marketing-only. Cleaner
  cascade, larger diff, and it matches the prior Gemini recommendation (P2-2).

**Recommendation:** Option B for correctness, Option A as the interim if the operator
wants one small commit. Either way, **do not** add a third motion file.

**Acceptance definition (NOT RUN):** under reduce, on `/app`, `/editor` and `/sign-in`,
computed `transform`/`translate` on hover and active states is `none`, and no
`view-transition` animation runs.

### 0.4 Reconcile the stale save-announcement finding

`docs/verification/20261029-a11y-app-editor/STATIC-A11Y-AUDIT.md` D2 says the editor has
no live regions; at `6e6c13f` it has `#ed-status` and `announce()` is called on successful
save (`editor.js:1391`) but not on `busy`/`loading`. Treat D2 as **partially obsolete**;
the real gap is busy/loading, not success. Any Phase 1 motion must be additive to the
existing announcement, never a substitute.

---

## 3. Phase 1 — editor save and proposal states

**Flow:** `/editor` load → edit → save → ask → stage/accept → export.
**Files (hypothesis):** `public/assets/editor.css`, small additions in
`public/assets/editor.js`. No HTML change is strictly required; `#ed-save-state` already
carries `data-state`.

### 1.1 Save marker: state change, not decoration

The marker already changes text and `data-state` (`editor.js:1148-1161`). Give it the
120 ms colour/opacity transition the project already uses for controls:

```css
/* Illustrative. Values are existing tokens. */
.ed-save {
  transition: color var(--dur-xs) var(--ease), opacity var(--dur-xs) var(--ease);
}
.ed-save[data-state="busy"] { color: var(--accent); opacity: 0.72; }
.ed-save[data-state="dirty"] { color: var(--warn); }
.ed-save[data-state="saved"] { color: var(--ok); }
.ed-save[data-state="error"] { color: var(--err); }
```

Why opacity 0.72 on busy: it is a visible "in flight" cue that does not shift layout and
does not claim success. The colour change alone is not the signal — the word
("saving…", "saved 14:32", "not saved") is.

**Do not** animate the marker's width or add a spinner. The prior spinner was deleted for
WCAG 2.2.2 and loop reasons (`docs/MOTION.md` §2 row 20).

### 1.2 Staged hunk: a rule, not a bounce

When a proposal is staged into the draft, mark the section rather than moving it:

```css
.ed-section[data-staged="true"] { border-left: 3px solid var(--accent); }
.ed-section { transition: border-left-color var(--dur-sm) var(--ease); }
```

`border-left-color` is paint, not layout; it does not move text. This is the visual half
of the "stage in draft" semantics; the semantic half is the `state.dirty` change and the
existing announcement.

### 1.3 Diff rows: entry via `@starting-style`

The proposal rows are inserted by `editor.js` into `#ed-diff-region`. A 180 ms, 2 px
translate + opacity entry is enough to say "this just arrived":

```css
@media (prefers-reduced-motion: no-preference) {
  @starting-style {
    .ed-diff__row { opacity: 0; translate: 0 -2px; }
  }
  .ed-diff__row {
    transition: opacity var(--dur-sm) var(--ease-enter),
                translate var(--dur-sm) var(--ease-enter);
  }
}
```

`@starting-style` is Baseline 2024 (Chrome 117 / Firefox 129 / Safari 17.5) [S01, S02].
Older engines simply show the row; that is the correct fallback.

**Focus hazard:** `revealReview()` already moves focus into the review block
(`editor.js:1090-1096`). The entry transition must not delay that focus or trap it. The
rows are not focusable until their buttons render, so a 180 ms fade is safe; do not add
`pointer-events: none` to the container.

### 1.4 What not to do in the editor

- No height animation on the diff panel or the proposal host (layout per frame; also
  `interpolate-size` is Chrome-only and experimental [S10]).
- No "saved" flash before the server responds.
- No motion on every keystroke; `input` already updates counts and dirty state.
- No auto-scroll animation beyond the guarded `scrollIntoView` in 0.1.

### Acceptance definitions (NOT RUN)

1. Under no-preference, `getComputedStyle(#ed-save-state).transitionDuration` is
   `0.12s`; under reduce it is `1e-05s` or `none`.
2. `setSaveState("busy")` changes `data-state` and computed colour; the text still reads
   "saving…".
3. Staging a hunk sends **zero** `PATCH` requests, sets `data-staged="true"`, and leaves
   `#ed-save-state[data-state="dirty"]`.
4. Clicking Save sends exactly one `PATCH`, then `data-state="saved"`; the live region
   announces "Saved at HH:MM".
5. The diff rows are visible at `opacity: 1` and `translate: none` in the final state on
   both engines and under reduce.

### Rollback

Delete the `.ed-save`, `.ed-section[data-staged]`, `@starting-style` and `.ed-diff__row`
blocks. No JS state changes are required, so rollback cannot affect save semantics.

---

## 4. Phase 2 — SPA route swaps

**Flow:** `/app` → `/app/cv` → `/app/jobs` → `/app/billing` via `navigate()` and
`popstate`, all through `renderRoute()` (`app.js:4123-4168`).

### 2a. Low-risk first step: opacity fade on the mount

The router already renders a loading state, awaits the screen, then writes content. A
120 ms opacity change on `#app-view` after the new content is committed removes the hard
cut without a snapshot and without freezing the page:

```css
/* Illustrative. One move per navigation. */
#app-view { transition: opacity var(--dur-xs) var(--ease); }
#app-view.is-route-entering { opacity: 0; }
```

```js
// Illustrative: set the class, commit, then remove it on the next frame.
```

**Critical ordering:** the class must be applied *before* the new content is committed
and removed *after* it, or the browser will coalesce the change and nothing happens. A
double `requestAnimationFrame` is the usual shape. Under reduce, skip the class entirely.

**Why opacity only:** WCAG 2.3.3's definition excludes opacity changes that do not alter
perceived size/shape/position [S11]. This is the least risky way to remove the hard cut.

### 2b. Same-document View Transition — only after a synchronous commit point

**Why not now:** `renderRoute` awaits `route.render(mount, …)`, and the screen renderer
mutates `#app-view` internally. Wrapping the whole function would hold the transition
across data fetching, and Chrome's guide explicitly warns that the page is frozen during
the update callback and that fetches should happen before `startViewTransition` [S07].

**Prerequisite refactor (owned by the SPA owner, not this task):** route renderers return
a detached node (or a fragment) instead of writing into `#app-view`; `renderRoute` awaits
the data, then performs one synchronous `replaceChildren(node)` inside the callback.

Once that exists:

```js
// Illustrative, not applied.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduce && document.startViewTransition) {
  document.startViewTransition(() => {
    mount.replaceChildren(node);
    main.focus({ preventScroll: true });
  });
} else {
  mount.replaceChildren(node);
  main.focus({ preventScroll: true });
}
```

**Rules for the transition:**
- Snapshot the root only. Do **not** name cards or panels whose box changes size; the
  default group animates width/height and the guide calls that out as layout per frame
  [S07].
- By default only the root is captured, so the whole view crossfades. Name `.nav`/rail
  only if their box is identical on both routes; otherwise leave them in the root
  snapshot. Never name a sized card.
- Duration 180 ms (`--dur-sm`), `--ease-enter`/`--ease-exit`; nothing longer.
- One transition per navigation. If a second navigation starts, let the API skip the
  first to the end (documented behaviour [S07]).
- Do not call it for list refreshes, toasts, or filter changes.

**Reduced-motion fallback:** synchronous commit, no snapshot. Do not rely on a CSS
`animation: none` override; skipping the API avoids the snapshot cost entirely.

**A11y:** the DOM is the same; the label fix from 0.2 is what makes the focus
announcement correct. Keep `focus({preventScroll:true})` so the transition does not fight
a scroll.

### Acceptance definitions (NOT RUN)

1. `/app` → `/app/cv`: exactly one `view-transition` animation set; `.nav`/rail have
   `view-transition-name: none`; duration ≤ 180 ms.
2. Under reduce: `document.startViewTransition` is not called (instrument the method),
   no `::view-transition` animations exist, and the route still renders.
3. On an engine without the API (or with it stubbed out): the route still renders and
   focus still moves; no console error.
4. After the swap, `document.activeElement === #app-main` and its accessible name is the
   new `#app-title` text.
5. Rapid double navigation: the second call does not throw and the final view is the
   second route.

### Rollback

2a: delete the class rules and the two `classList` calls. 2b: remove the `if` branch and
keep the synchronous path; the refactor is independently useful.

---

## 5. Phase 3 — folio and proof surfaces

**Flow:** `/app/cv` CV cards, tailored output, pack detail (the `.aw-folio`/`.aw-proof`
work already specified in the Gemini review §3.2 and implementation plan P3.3/P3.4).

**Motion position:** these surfaces are *documents*. They should be still. The only
defensible motion is a single 180 ms opacity crossfade when a stored pack replaces the
previous one in the same slot — a state change, not an entrance.

```css
/* Illustrative. */
.aw-folio[data-swapping="true"] { opacity: 0.6; }
.aw-folio { transition: opacity var(--dur-sm) var(--ease); }
```

Do not:
- animate preserved-fact `<mark>` highlights (the mark carries meaning; movement
  distracts from reading);
- stagger bullets or rows;
- animate the registration stamp;
- add a reveal on scroll.

**Reduced motion:** the crossfade collapses to instant via the global rule; no branch
needed because it is opacity only.

**Acceptance definitions (NOT RUN):** swapping packs changes opacity once and ends at 1;
no `width`/`height`/`translate` transition exists on `.aw-folio`/`.aw-proof`; the printed
sheet is unchanged (print media has no transition).

**Rollback:** delete the `[data-swapping]` rule and its toggle.

---

## 6. Phase 4 — responsive interactions and the thumb-zone dock

**Flow:** `/editor` on a phone or tablet, scrolled deep into a long document, with unsaved
changes (Gemini review Alternative B).

**Motion position:** the dock's arrival is a state change (dirty/saving/error), not a page
entrance. 120 ms `translate` + opacity, 2 px, once per state change — or no movement at
all if the operator prefers.

**Non-negotiable constraints:**
- **44 × 44 px** minimum target for the Save control.
- `env(safe-area-inset-bottom)` padding.
- The dock must not cover the focused control (WCAG 2.4.11 [S13]); use `scroll-padding-bottom`
  on the document equal to the dock height, or hide the dock on focus within the last
  viewport.
- `#ed-dock[hidden]` when clean, so reading height is untouched.
- The dock's label repeats the save state; it does not replace `#ed-status`.

**Reduced-motion fallback:** show/hide instantly; no translate.

**Acceptance definitions (NOT RUN):**
1. At 375×812, scrolled to `y=2200`, editing a section reveals `#ed-dock` with its button
   `rect.height >= 44` and `rect.bottom <= innerHeight`.
2. Tabbing to the last focusable control above the dock leaves it at least partially
   visible (2.4.11).
3. The dock is `hidden` when `state.dirty === false && state.saveState === "saved"`.
4. Under reduce, no `transform`/`translate` transition is present; the dock still appears.

**Rollback:** remove the dock node and its CSS; the header Save remains.

---

## 7. Cross-phase reduced-motion matrix (to be completed by the operator)

| Surface | no-preference | reduce | How it is achieved |
|---|---|---|---|
| SPA route mount | 120 ms opacity fade | instant | class skip |
| SPA route VT | 180 ms crossfade | not called | `matchMedia` guard |
| Editor save marker | 120 ms colour/opacity | 0.01 ms / instant | tokens global collapse |
| Diff rows | 180 ms opacity/translate | instant | `no-preference` block |
| Staged hunk rule | 180 ms border colour | instant colour | tokens collapse |
| Folio swap | 180 ms opacity | instant | tokens collapse |
| Dock | 120 ms translate/opacity | instant | `no-preference` block |
| Cross-document VT | 180 ms | none | existing `motion.css` guard |
| Scroll hairline | scroll-driven scaleX | none | existing guard |

---

## 8. Operator validation criteria (later; none run here)

A phase is eligible for integration only when all of the following are recorded by the
operator, on the actual candidate, with before/after hashes:

1. **Static gates:** `node scripts/check.js` → 0 errors, 0 warnings; the three canonical
   suites unchanged or improved (`node --test tests/`, `node --test server/lib
   server/provider`). Preserve skips.
2. **Source review:** independent reviewer (not the author) confirms no layout property is
   animated, no save/API semantics changed, and no dependency was added.
3. **Rendered reduced motion:** CDP `Emulation.setEmulatedMedia` with
   `prefers-reduced-motion: reduce` on `/`, `/app`, `/app/cv`, `/editor`, `/sign-in`;
   assert no animations except the global 0.01 ms collapse, no view transitions, and no
   `scrollIntoView({behavior:"smooth"})` effect.
4. **Rendered no-preference:** the same routes at 375 / 768 / 1440; assert the expected
   animation names and durations, zero horizontal overflow, and no console errors.
5. **Focus/AT:** tab through each changed surface; after SPA navigation the focused
   element announces the new heading; the dock does not obscure focus; the save state is
   announced once per change (polite, not assertive).
6. **Performance budget:** on the changed routes at 6× CPU, no new long task > 50 ms and
   no new frame > 32 ms versus the recorded baseline (`docs/MOTION.md` §6, §12.7). The
   comparison must use the same protocol; do not quote the old numbers as new results.
7. **Rollback rehearsal:** revert the phase's file set and confirm the route still works
   without the motion.

---

## 9. Explicit non-goals

- A framework, a component library, or a build step.
- GSAP, Motion, AutoAnimate, Lenis, Swup, Barba.
- Scroll hijacking, parallax, typewriter, count-ups, infinite loops, skeleton shimmer.
- Animating `height: auto` (Chrome-only `interpolate-size`, experimental [S10]).
- Motion as the only signal for save, error, or status.
- Any change to `PATCH /api/cvs/:id`, route data loading, or the save button semantics.
- Any pixel, performance, or accessibility claim without the operator's own measurement.
