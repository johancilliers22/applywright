# MOTION.md — the Applywright motion audit, the changes, and the numbers

**Scope of this pass.** `public/assets/motion.css`, the motion rules in `public/assets/site.css`,
transitions and keyframes in `public/app/app.css`, and (deferred — see §9) `public/assets/editor.css`.
Nothing else was written: no HTML, no server code, no `tokens.css`, no `theme.css`, no new dependency,
no inline script. `CSP script-src 'self'` is untouched and `scripts/check.js` reports **10 pages,
24 server modules, 250 css classes — 0 errors, 0 warnings**.

**How every number below was produced.** Headless Edge `156.0.4314.50` over CDP against the live
server on `127.0.0.1:3160` (never restarted). Two protocols:

1. **Load.** Cache warmed with one navigation, then the measured navigation on a fresh page at
   1440×900. Instruments: `PerformanceObserver` for `largest-contentful-paint`, `longtask`,
   `long-animation-frame`, `layout-shift`, plus `first-contentful-paint` and CDP
   `Performance.getMetrics`.
2. **Scroll at 6× CPU.** `Emulation.setCPUThrottlingRate {rate: 6}` (verified: a fixed CPU loop runs
   7.31× slower), then a scripted scroll in rAF-paced steps to the bottom of the page while CDP
   `Tracing` records `devtools.timeline`. Frames are the trace's `AnimationFrame` async slices
   (`ph: b`→`e`, paired per thread), so "frame" means **main-thread frame work**, not wall-clock
   between rAF callbacks.

> **Instrument caveat, measured not assumed.** In this headless build `requestAnimationFrame` fires
> on a fixed 16.7 ms timer that does not stretch when the main thread is blocked: a deliberately
> injected 60 ms `scroll` handler produced 20 long tasks of 60–61 ms and 18 long-animation frames of
> 60–78 ms, while rAF deltas stayed at 17 ms. rAF deltas are therefore reported as a floor only.
> The sensitive instruments are the trace's `AnimationFrame` durations, `longtask`, `long-animation-frame`
> and CDP `TaskDuration`/`ScriptDuration`/`LayoutDuration`/`RecalcStyleDuration`.

---

## 1. The contract this pass enforces

From `tokens.css` (unchanged) and SPEC-V2 §5:

| Token | Value | This pass uses it for |
|---|---|---|
| `--dur-xs` | 120 ms | state: colour, border, focus ring, rail rows |
| `--dur-sm` | 180 ms | hover settle, release, drawer, toast, view transition |
| `--dur-md` | 260 ms | the page entrance, the evidence settle, the score ring |
| `--dur-lg` | 560 ms | **one** thing: the hero proof sheet's evidence trace |
| `--dur-data` | 420 ms | not used (the gauge fill it was invented for is gone, see §2) |
| `--ease` / `--ease-enter` / `--ease-exit` / `--ease-settle` / `--stagger` | unchanged | as before |

Rules applied everywhere:

- **One duration above 320 ms.** The evidence trace keeps `--dur-lg` (560 ms) — it is the hero's
  single deliberate move and the product's own claim shown once per visit. Every other duration in
  the four files is ≤ 320 ms; the page entrance went from 560 ms to 260 ms per element.
- **One move per surface**, per SPEC-V2 §5: page entrance (page surface), evidence trace
  (hero-proof surface), drawer disclosure, view transition (navigation surface), state changes
  (controls).
- **Nothing loops, nothing is scroll-triggered, no parallax, no typing.**
- **Only `transform` / `translate` / `opacity` animate as movement.** Colour, border-colour,
  background, box-shadow, stroke and `stroke-dasharray` transition too — those are paint, not
  layout, and the canon keeps colour changes under reduced motion on purpose. **Zero layout
  properties are animated** (verified by grep: no `width`, `height`, `top`, `left`, `margin`,
  `padding`, `inset`, `flex` or font property in any `transition` in the four files).

---

## 2. Inventory — before → after

Every transition, animation and `@keyframes` that was in the four files. "Trigger" is what starts
it. Rows marked ⛔ were defective and are gone; rows marked ➕ are new.

### `public/assets/motion.css`

| # | Rule | Before | After | Easing | Trigger |
|---|---|---|---|---|---|
| 1 | `@keyframes aw-enter` | 560 ms, `opacity 0→1` + `translateY(10px)→0`, 5-element stagger (0/55/110/165/220 ms) | **260 ms**, same shape, same stagger | `--ease-enter` | page load, once |
| 2 | H1 / `.page-head .display` entrance | same 560 ms fade+rise as row 1 (the LCP element was hidden) | ➕ **`@keyframes aw-rise`**: `translate: 0 10px → 0`, **no opacity**, 260 ms | `--ease-enter` | page load, once |
| 3 | `@keyframes aw-evidence` (hero proof sheet) | 560 ms, `opacity 0→1` + `translate: 0 6px`, 4-step stagger | **unchanged 560 ms** — the one allowed long duration, and the hero's single move | `--ease-enter` | page load, once |
| 4 | `@keyframes aw-disclosure` (mobile drawer) | 180 ms, fade + `translate: 0 -4px` | unchanged | `--ease-enter` | `.is-open` class add |
| 5 | reduced-motion block | cancelled `.btn:hover/:active` and `.link-arrow::after` transforms | extended: also `.link-arrow:active::after`, `.nav__toggle:active`, **and the exact press selector from `site.css`** (the bare `.btn:active` lost on specificity — measured, the press survived `reduce`) | — | `prefers-reduced-motion: reduce` |
| 6 | ➕ `@view-transition { navigation: auto }` | — | cross-document transition, opt-in | — | same-origin navigation |
| 7 | ➕ `@keyframes aw-vt-out` / `aw-vt-in` | — | 180 ms cross-fade of the root snapshot; `.nav` and `.footer` are named so they hold still | `--ease-exit` / `--ease-enter` | `/` → `/pricing` and back |
| 8 | ➕ `html:active-view-transition …` | — | entrance suppressed while a transition is revealing the new document (`animation: none`), guarded by `@supports selector(:active-view-transition)` | — | during a view transition |

### `public/assets/site.css`

| # | Rule | Before | After | Easing | Trigger |
|---|---|---|---|---|---|
| 9 | `.nav__links a` | `color`, `border-color` 220 ms | **120 ms**; ➕ `:active { color: var(--accent) }` | `--ease` | hover, press, `aria-current` |
| 10 | `.btn` | `transform, background, color, border-color` **220 ms**; `:hover` `translateY(-1px)`; `:active` `translateY(0)` (only cancelled the lift) | transform **90 ms** in / 180 ms out; colour **180 ms**; `:hover` lift kept; ➕ `:active:not(:disabled)` → `translateY(0) scale(0.985)` with `transition-duration: 60ms` | `--ease-exit` (press), `--ease` | hover, press, release |
| 11 | `.link-arrow::after` | `transform` 220 ms, `:hover` `translateX(3px)` | 180 ms `--ease-settle`; ➕ `:active` → `translateX(1px)` at 60 ms | `--ease-settle` | hover, press |
| 12 | `.input` / `.textarea` / `.select` | `border-color`, `box-shadow` 220 ms | **120 ms** | `--ease` | focus/blur |
| 13 | `.footer a` | `opacity` 220 ms | **120 ms** | `--ease` | hover |
| 14 | ➕ `.prose a` | none | `color` 120 ms, `:active` → `var(--accent)` | `--ease` | hover, press |
| 15 | ➕ `.nav__toggle` | none | `transform` 90 ms, `border-color` 120 ms, `:active` → `scale(0.96)` | `--ease-exit` | press |

### `public/app/app.css`

| # | Rule | Before | After | Easing | Trigger |
|---|---|---|---|---|---|
| 16 | `#app-nav a` | `background`, `color` 220 ms; flex row | **120 ms**, grid row (18px icon column), ➕ `:active { opacity: 0.7 }` | `--ease` | hover, press, `aria-current` |
| 17 | `#app-nav a svg` | `stroke` 220 ms | **120 ms** | `--ease` | hover, `aria-current` |
| 18 | `.aw-ring__value` | `stroke-dasharray` **600 ms** | **260 ms** `--ease-settle` — a measurement settling when a value is replaced, under the 320 ms ceiling | `--ease-settle` | score value changes |
| 19 | `.aw-meter__fill` | `width` **400 ms** — ⛔ a layout property, re-running layout every frame | **removed.** The bar snaps to its value | — | plan-credit changes |
| 20 | `.aw-spinner` + `@keyframes aw-spin` | ⛔ 16px ring rotating 700 ms **linear infinite** (a loop; WCAG 2.2.2 has no pause; `reduce` only slowed it to 2.4 s and still looped) | **deleted.** A static 8px accent pip at 0.6 opacity; the inline label carries the state | — | loading states |
| 21 | `#app-toast` | `opacity`, `transform` 220 ms | 180 ms, same two properties | `--ease` | `data-show` true/false |
| 22 | `#app-nav ul` / `li::marker` | no reset: 7 disc markers + the UA's 40 px `padding-inline-start` | `list-style: none`, `::marker { content: "" }`, margin/padding 0 | — | render |
| 23 | `#app-nav a[aria-current]` | real `border: 1px` on one row only (its icon and label sat 1 px right of the other six) | transparent 1px border on every row, `border-color` only on the current one | `--ease` | render / navigation |
| 24 | dashboard "Next actions" card | 1113 px wide for a 66ch list | `max-width: 42rem` (672 px), scoped to `#app-main > .aw-grid--metrics + .aw-section > .aw-card` | — | render |

### `public/assets/editor.css`

No transitions existed in the file before this pass, and **none were added** — the file was being
rewritten by `design-lead` while this pass ran and the Lead ruled it off-limits (see §9 for the
ready-to-apply block).

### Out of scope, but in the cascade — flagged, not touched

| File / rule | Finding |
|---|---|
| `tokens.css` `.reveal` | `transition: opacity 620ms, transform 620ms` plus `html.reveal-on .reveal:not(.is-visible)`. **Dead**: `site.js` retired the observer, and `grep -c 'reveal' public/*.html` is 0, so nothing animates and no first paint is hidden. It is still the longest declared duration in the project and SPEC-V2 §8.4 asks for its removal; `tokens.css` is out of this pass's write surface. |
| `theme.css` `.theme-toggle` | 120 ms colour/border/background, 120 ms icon crossfade/scale, `:active { translate: 0 1px }`, `aw-toggle-in` 180 ms, `aw-disclosure-in` 180 ms. Compliant; regression-checked after this pass (§6). |
| `tokens.css` reduced-motion | collapses every animation and transition to 0.01 ms globally — the floor this pass builds on, and why colour changes survive `reduce`. |
| `site.css` `.nav` `backdrop-filter: saturate(180%) blur(14px)` | The one paint-heavy property on a sticky element. Measured: no main-thread cost and no dropped frame at 6× (§5); left alone. |

---

## 3. Canon audit — what the design canon says, and the two tensions

SPEC-V2 §5 ("one move per surface", no parallax, no typing loops, colour is not motion) is now met
with two recorded tensions and no violations:

1. **The hero has an entrance and a trace.** The entrance is the page surface's move (every page
   has one); the evidence trace is the hero-proof surface's move. They overlap in time (entrance
   ends ~480 ms, trace ~780 ms). This is the reading the motion layer already documented and it is
   kept: the entrance is now short enough that it no longer competes, and the trace is the only
   thing in the file allowed to take half a second.
2. **The hero's H1 no longer fades in.** That is a deliberate exception to the entrance pattern: an
   element at `opacity: 0` is not an LCP candidate, so the fade did not delay the metric — it
   moved it. Measured before: LCP element = the nav's brand `SPAN`, 2,178 px². After: the H1,
   88,830 px², at the same 28 ms first-contentful-paint. The hero still rises; it just doesn't
   appear.

Retired/defective motion found and removed: the 700 ms infinite spinner loop (row 20), the 400 ms
`width` transition (row 19), the 600 ms ring draw (row 18) and the press that only cancelled its own
hover (row 10). The 620 ms `.reveal` rule is dead rather than active; flagged in §2 for its owner.

---

## 4. Interaction feedback

**Buttons and links.** Press and release are two beats, not one: the press answers in 60–90 ms (any
slower and the control feels unsure it was hit) and the release settles over `--dur-sm`. The fast leg
is declared only on `:active`, so it cannot slow the hover in. Press states are movement for controls
(`scale(0.985)` on buttons, `scale(0.96)` on the menu toggle) and colour for links (nav, prose,
footer, the arrow's 3px→1px settle), because a link that shifts under the pointer is a link somebody
misses. Measured: hover `matrix(1,0,0,1,0,-1)`, press `matrix(0.985,0,0,0.985,0,0)` at
`transition-duration: 0.06s`, release back to `-1px`; arrow hover `translateX(3px)`, press
`translateX(1px)`.

**Saved states without a toast parade.** The `/app` dashboard's confirmations are the toast
(180 ms, opacity + 1rem translate, never layout) and inline state words. The editor's save marker is
the file that needs the treatment and does not yet have it (§9) — the design is: the marker moves in
the same frame as the click (`busy`, `--accent`, 0.72 opacity), then reconciles to `--ok` on the
server's read-back or `--err` on failure, with `--dur-xs` colour/opacity transitions. That is an
optimistic-in-timing, honest-in-claim marker; a true optimistic write (paint "saved", roll back) needs
`editor.js` to queue the PATCH, which is not this pass's file.

**Loading states.** The only spinner in the project was `.aw-spinner` in `/app` — a 16px ring
rotating forever next to a label that already said "Reading the job boards…". It is now a static
8px pip. Two reasons: a 5-second-plus infinite loop with no pause violates WCAG 2.2.2, and the canon
bans loops. Real skeletons (placeholder bars in the shape of the incoming panel) need the markup to
carry them — `loadingState()` in `app.js` builds a two-span string — so that remains the app owner's
change and is listed in §9.

---

## 5. Fluidity

**Only compositor-friendly properties animate.** Movement is `transform`/`translate`/`opacity`
everywhere. The one SVG geometry transition left is `stroke-dasharray` on `.aw-ring__value`; SVG
dash offsets cannot be expressed as a transform and it is one small element, paint-only, 260 ms, on a
value change. No layout property is animated anywhere in the four files (grep-verified, §1).

**Reduced motion is honoured everywhere.** Verified with CDP
`Emulation.setEmulatedMedia {prefers-reduced-motion: reduce}`:

| Check | Result |
|---|---|
| `matchMedia('(prefers-reduced-motion: reduce)').matches` | true |
| `.hero .display`, `.hero__sub`, `.hero-proof__score`, `.nav__mobile` | `animation-name: none`, `opacity: 1` — the page paints complete |
| `.btn` computed `transition-duration` | `1e-05s` (the `tokens.css` global collapse) |
| hover / press transform on the primary CTA | `none` / `none` (the specificity bug in row 5 is fixed and re-verified) |
| `.nav` / `.footer` `view-transition-name` | `none` — no cross-document transition at all |
| navigation `/` → `/pricing` under reduce | `:active-view-transition` never matched, zero `view-transition` animations, entrance animations `none`, `.page-head .lede` at `opacity: 1` |

**No first paint that blocks LCP.** Before, the H1 was `opacity: 0` for 55 ms + 560 ms; measured
LCP element was the nav brand span (2,178 px²) instead of the H1 (88,830 px²) — the metric was
reporting the wrong thing, which is worse than a slow number. The H1 now runs a transform-only rise
and is the LCP candidate at FCP.

---

## 6. Jank test — 6× CPU, home and `/app`

Protocol: `Emulation.setCPUThrottlingRate 6`, scripted rAF-paced scroll from top to bottom, CDP trace
plus `longtask` / `long-animation-frame` observers. 1440×900.

**Instrument proof (sensitivity control).** A deliberately injected 60 ms `scroll` handler on the same
page and protocol produces: **20 long tasks of 60–61 ms, 18 long-animation frames of 61–78 ms**
(style/layout attributed 61–77 ms), `TaskDuration` **411–449 ms** vs **94–101 ms** baseline. A 30 ms
handler produces `ScriptDuration` 365 ms with no long task (it is under the 50 ms threshold), which
is why both instruments are reported. The page's own numbers below are therefore real zeros, not a
dead instrument.

| Metric | Home — before | Home — after | `/app` — before | `/app` — after |
|---|---|---|---|---|
| Frames sampled (main-thread `AnimationFrame` slices) | 68 | 68 | 28 | 28 |
| **Frames over 32 ms** | **0** | **0** | **0** | **0** |
| Frame p50 / p95 / max (ms) | 16.0 / 17.2 / 17.9 | 15.9 / 17.0 / 17.6 | 16.1 / 17.4 / 17.6 | 16.2 / 17.2 / 17.8 |
| **Long tasks > 50 ms** | **0** | **0** | **0** | **0** |
| Long-animation frames > 50 ms | 0 | 0 | 0 | 0 |
| Traced main-thread task time, whole scroll (ms) | 137 | 165 | 42 | 47 |
| — of which script / layout / style | 6 / 0 / 0 | 6 / 0 / 0 | 1 / 0 / 0 | 1 / 0 / 0 |
| Layouts during scroll | 0 | 0 | 0 | 0 |
| Style recalcs during scroll | 0 | 0 | 0 | 0 |
| rAF frames over 32 ms (floor only, see caveat) | 0 | 0 | 0 | 0 |

**Reading the numbers honestly.** The traced totals (137 → 165 ms on home, 42 → 47 ms on `/app`) move
in the wrong direction but are **tracing overhead plus run-to-run noise**, not a regression: with the
tracer off, four consecutive scrolls measure 47/48/50/43 ms and, with the new `view-transition-name`
declarations force-disabled, 46/55/57/47 ms — i.e. no measurable cost from the transition names
(median 47.5 vs 51 ms, overlapping ranges). Nothing in this pass runs during a scroll: the scroll
work is the compositor's, the main thread does no layout and no style, and both surfaces were already
at zero jank. **The honest result is "no jank found and none introduced", with the sensitive
instruments proven against injected jank.**

What was fixed in this pass was **potential** jank and the two real property defects that no
headless measurement at this size would catch:

- `.aw-meter__fill` transitioned `width` (a layout property, every frame for 400 ms) — removed.
- `.aw-spinner` rotated forever — removed.
- The score ring's 600 ms `stroke-dasharray` — now 260 ms.

**`/app` cumulative layout shift** is **0.0139 before and after**: one shift at 116 ms whose source
is a `<p>` at (288,274) 480×56 being removed when `app.js` swaps the route placeholder for the
dashboard. It is under the 0.1 "good" threshold, it is not caused by CSS, and a CSS-only fix cannot
reserve space for content whose height is unknown — flagged for the SPA owner (a `min-height` on the
mount). Home CLS is **0** in both states.

---

## 7. View transitions — shipped, behind `@supports (view-transition-name: none)`

**Decision: shipped.** A `/` → `/pricing` navigation now cross-fades the two documents over 180 ms
(`aw-vt-out` / `aw-vt-in`) while the shared chrome holds still: `.nav` and `.footer` carry
`view-transition-name`, so they do not fade at all. No HTML change, no script, so the CSP is
untouched. Everything is inside `@supports (view-transition-name: none)` +
`@media (prefers-reduced-motion: no-preference)`; engines without support see an ordinary
navigation.

**Verified working** (headless, `/` → `/pricing`): `:active-view-transition` matched in the new
document; live animations during the transition were `aw-vt-in`, `aw-vt-out` and the three UA group
animations for `root`, `nav`, `footer`; the entrance is suppressed while the transition reveals the
document (`animation-name: none`, `opacity: 1` on `.page-head` text), so it cannot double-play.

**Measured cost** (apples-to-apples: same-tab link click, identical page, 3 runs each; the control
run serves `motion.css` with `navigation: none`):

| Condition | FCP / LCP, VT off | FCP / LCP, VT on | Delta |
|---|---|---|---|
| 1× CPU | 60 / 60 / 64 ms | 72 / 76 / 80 ms | **+16 ms** |
| 6× CPU | 256 / 256 / 324 ms | 324 / 364 / 648 ms | **+108 ms** |

**Flash test.** Screencast frames were captured across the navigation in both modes: no blank or
near-blank frame appears either way (smallest frame 12,825 bytes with VT, 12,825 without; a blank
1440×900 frame at this quality is ~2–5 KB). So the honest statement is: **the hard cut was not a
white flash to begin with** — Chrome holds the old frame until the new page paints — and the view
transition buys continuity (chrome holds, body cross-fades) at a measurable first-paint cost of one
frame at normal speed and ~⅓ of the paint budget at 6× CPU.

That trade is recorded rather than hidden. If a later reviewer decides the +16 ms is not worth the
cross-fade, the revert is one line: delete `@view-transition { navigation: auto; }` (the rest of the
block is inert without it). Under reduced motion the cost is zero because the opt-in itself is
inside the `no-preference` block — verified above.

---

## 8. Review defects folded into this pass (Lead / `design-lead`)

### 8.1 The `/app` rail (Lead review)

Two defects were visible in `screenshots/ux-03-app-1440.png`; both are fixed in `app.css`.

| Defect | Before (measured) | After (measured) |
|---|---|---|
| Bullets on every rail row | all 7 `<li>` computed `list-style-type: disc`; the UA's `padding-inline-start: 40px` also indented the whole rail right of the brand (`ul` had no reset) | `list-style-type: none` on all 7, `::marker` content `""`; `ul` padding 0, margin 0 |
| Icon/label column | icon x **68 px** on the current row vs **67 px** on the other six; label x **95 px** vs **94 px** (the current row declared a real 1px border, the others none) | icon x **28.19 px**, label x **55.78 px** on **all seven rows**; rows 219×42 |
| Mobile drawer (375 px) | same element, same defect | bullets gone, every row at x=20 with icon x=32 and label x=60, `scrollWidth == clientWidth` (no horizontal scroll) |
| "Next actions" card width | 1113 px for a 66ch list, beside a 4-up metrics row of 4×266 px | **672 px** (`42rem`), scoped so `/app/alerts` keeps its full-width list card |

**Focus ring.** After moving the row from flex to grid, keyboard focus still draws around the whole
row: `Tab` gives `:focus-visible` true, `outline: 2px solid rgb(15,92,67)`, box 219×42 (the row, not
the text node), and pointer focus gives `outline-style: none` — `:focus-visible` only, as before.

**Not changed:** the settings glyph in the rail is a 3-track slider icon that reads as a filter. It is
an inline `<svg>` in `public/app/app.html`; swapping it is an HTML edit, outside this pass's write
surface, and the Lead is sending it to the SPA owner rather than having a CSS pass fake it with a
mask. Stat-card content, the applications table and all copy were not touched.

### 8.2 The page-head dead space (Lead review, measured by `design-lead`)

**Defect.** On every inner page the band's own bottom padding (40px at 1440) and the next section's
desktop padding (96px) were both paying a full desktop rhythm, leaving **137px** between the last
line of the page head and the first line of the section. This pass caps both at the values the same
rules already resolve to on a phone, so the desktop gap equals the measured phone gap instead of
exceeding it by 60%.

```css
.page-head { padding-block: clamp(2.75rem, 6vw, 4.5rem) 1.75rem; }  /* was … clamp(1.75rem, 3vw, 2.5rem) */
.page-head + .section { padding-block-start: 3.5rem; }                /* was the .section clamp: 96px at 1440 */
```

| Page | 1440 before | **1440 after** | 768 before → after | 360 before → after |
|---|---|---|---|---|
| `/pricing` | 137px | **85px** (−52) | 85 → **85** | 85 → **85** |
| `/about` | 137px | **85px** (−52) | 85 → **85** | 85 → **85** |
| `/how-it-works` | 137px | **85px** (−52) | 85 → **85** | 85 → **85** |
| `/security` | 137px (158 to its first heading — it has an on-page anchor row inside the band) | **85px** (−52) | 85 → **85** | 85 → **85** |

Measured as `first content top − last text line bottom` on the live pages, all four × 360/768/1440.
**Zero change below 940px** — the fix cannot over-correct a small screen because it does not touch
one; and no page gained horizontal overflow at any of the three widths (checked). `/` has no
`page-head` and is untouched.

### 8.3 Card corners — asked, not changed

The report noted that the editor's document sheet uses `--r-folio` (2px) while marketing cards use
`--r-lg` (18px). **This is coherent and was left alone.** The system's whole distinction is
document surface vs control surface (SPEC-V2 §1: paper is for the thing the user sends; everything
else sits on the desk), and the radii encode it: `--r-folio` 2px for paper artefacts (the editor's
sheet, the hero proof sheet, the diff/proof blocks), `--r-md`/`--r-lg` 12/18px for desk panels
(cards, rail rows, toasts). One radius for both would erase the only visual signal that separates
"a CV" from "a control".

---

## 9. Deliberately left alone

| Surface | Why |
|---|---|
| `public/assets/editor.css` | The Lead ruled this file off-limits mid-pass: `design-lead` is rewriting it (plus `editor.html` and the auth pages). The editor's save marker is the one piece of interaction polish this pass could not land. The ready-to-apply block (colour/opacity only, `--dur-xs`, plus the state colours) is below so it can be appended verbatim once that pass lands. |
| `tokens.css` `.reveal` (620 ms) | Out of scope, and dead: zero HTML elements carry the class and `site.js` retired the observer. Deleting the rule is safe; flagged in §2 for its owner. |
| `theme.css` (toggle, FAQ disclosure, icon animation) | Compliant and out of scope. Regression-checked: system→light/dark still cycles, the `aria-label` updates, the active icon's opacity swaps `[0,0,1]`→`[0,1,0]`, and the button still moves 1 px on press. |
| `.nav`'s `backdrop-filter` | The one expensive-looking paint property on a sticky element. Measured at 6× CPU: no long tasks, no frame over 32 ms, `style` and `layout` time 0 — headless rasterises off the main thread, and on this content the blur costs nothing measurable. Removing the blur is a visual decision for the nav owner, not a jank fix, so it stays. |
| `app.js` loading markup / skeletons | `loadingState()` is a two-span string; real skeletons need DOM, and this pass writes CSS only. The spinner loop is gone, which is the part CSS could fix. |
| `app.js` save/optimistic write in the editor | Needs a queued PATCH and rollback — `editor.js`, not CSS. |
| `/app` CLS 0.0139 | Caused by `app.js` swapping the route placeholder; not CSS-fixable (unknown content height). Flagged for the SPA owner. |
| `--dur-data` (420 ms) | Still declared in `tokens.css` and now unused: the gauge fill it was introduced for is gone (a fill growing from zero implies a computation that did not happen — SPEC-V2 §5), and the one measurement that does change (the ring) settles in 260 ms. Leave the token; removing it is a `tokens.css` change. |

### The editor block, ready for `editor.css` when it is free

```css
/* The save marker is the editor's clock: it moves in the same frame as the click
   (busy is set before the fetch), then settles on the server's answer. */
.ed-save { transition: color var(--dur-xs) var(--ease), opacity var(--dur-xs) var(--ease); }
.ed-save[data-state="loading"],
.ed-save[data-state="busy"] { color: var(--accent); opacity: 0.72; }
.ed-save[data-state="dirty"] { color: var(--warn); }
.ed-save[data-state="saved"] { color: var(--ok); }
.ed-save[data-state="error"] { color: var(--err); }

/* Accepting a proposal is a state change, not a jump. */
.ed-hunk { transition: border-left-color var(--dur-sm) var(--ease), opacity var(--dur-sm) var(--ease); }

/* The diff panel is inserted by editor.js; this is its only entrance, and it is
   transitions-only (no keyframes), opacity/translate, 180ms. */
@starting-style { .ed-diff__row { opacity: 0; translate: 0 -2px; } }
.ed-diff__row { transition: opacity var(--dur-sm) var(--ease-enter), translate var(--dur-sm) var(--ease-enter); }
```

---

## 10. Re-running the measurements

```powershell
# server is already up; never restart it
node scripts/check.js                       # 10 pages, 24 modules, 250 classes, 0 errors, 0 warnings
Invoke-WebRequest http://127.0.0.1:3160/    # and /pricing /app /editor /sign-in …
```

The measurement harness is CDP-only and needs no dependency; the shape is:

```js
// load
const cdp = await context.newCDPSession(page);
await page.addInitScript(() => { /* PerformanceObserver: lcp, longtask, long-animation-frame, layout-shift */ });
await page.goto(url); /* warm */ await page.reload(); /* measure */

// scroll at 6x
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'blink', 'benchmark'], recordMode: 'recordAsMuchAsPossible' } });
// scroll in rAF-paced steps, then pair ph:'b'→'e' AnimationFrame events per tid
await cdp.send('Tracing.end');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

// reduced motion
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
```

Sensitivity check: attach a `scroll` listener that busy-waits 60 ms. If that does not produce long
tasks and long-animation frames, the environment is not measuring and the zeros mean nothing.

---

## 11. Verification ledger (28 October 2026, live server :3160)

| Check | Result |
|---|---|
| `node scripts/check.js` | **0 errors, 0 warnings** — 10 pages, 24 server modules, 250 css classes |
| Pages `/`, `/how-it-works`, `/pricing`, `/about`, `/security`, `/app`, `/app/cv`, `/app/billing`, `/editor`, `/sign-in`, `/sign-up`, `/reset` | all **200** |
| Assets `/assets/motion.css`, `/assets/site.css`, `/app/app.css`, `/assets/editor.css` | all **200** |
| Console errors on `/` and `/pricing` | **0** |
| Theme toggle (system→light→dark→system) | works; `aria-label` and active icon opacity follow, no CTA shift |
| Rail at 1440 / 375 | bullets gone, icon and label columns identical on all 7 rows, no horizontal scroll |
| Keyboard focus on rail rows | 2px ring around the whole 219×42 row; none for pointer focus |
| Reduced motion | zero animations, zero view transitions, zero hover/press movement, page paints complete |
| LCP element on `/` | **`H1.display`, 88,830 px² @ 28 ms** (was the nav `SPAN`, 2,178 px²) |
| Frames over 32 ms, home + `/app`, 6× CPU | **0** before, **0** after |
| Long tasks > 50 ms, home + `/app`, 6× CPU | **0** before, **0** after |
| Animated layout properties in the four files | **0** |
| Page-head gap (last line → first section line), four inner pages | **137px → 85px at 1440**; 85px → 85px at 768 and 360; no horizontal overflow at any width |
| Card radius (`--r-folio` 2px vs `--r-md`/`--r-lg` 12/18px) | coherent by design — document surface vs control surface (§8.3), left alone |

**Files changed and line counts** (before → after):

| File | Lines | Diff |
|---|---|---|
| `public/assets/motion.css` | 149 → **263** | +154 / −40 |
| `public/assets/site.css` | 1635 → **1692** | +73 / −16 (motion + the §8.2 page-head gap) |
| `public/app/app.css` | 1814 → **1886** | this pass +116 / −48; `app-ui-aw`'s dark-theme pass has added to the same file since, so it is now co-owned — this pass stopped writing it at that point |
| `public/assets/editor.css` | 868 → 886 | not this pass — `design-lead`'s rewrite in progress |
| `docs/MOTION.md` | new | this file |

**Test data note.** Measuring the authenticated `/app` dashboard required a real session, so a
disposable QA account exists in the dev database: `motion-qa@applywright.example` (password not
recorded here), with one CV ("Jordan Ellis — Product Engineer") and one stored report (score 77).
It only affects the local SQLite file, not the shipped pages, and can be deleted with the CV and the
user row when the dev DB is next reset.

---

## 12. Round two — tactile feedback (28 October 2026, second pass)

Round one removed motion that delayed reading. This pass adds the state feedback that makes the
marketing pages feel like paper and ink: a scroll hairline that says where you are, hover/press cues
that are not colour-only, a quieter entrance, one settle for the proof sheet, and a ruled loading
sheet in the editor. No palette change, no new colour, no loop, nothing above `--dur-lg`.

**Scope note (worth flagging).** This pass touched `site.js` in addition to the four files named in
the brief: deliverable 4 is specified as an IntersectionObserver, and there is no CSS-only way to run
something *once per session on first entry*. The addition is one self-contained block (~40 lines) and
is the only script change.

### 12.1 Files and line counts

| File | Lines | What changed |
|---|---|---|
| `public/assets/motion.css` | 263 → **349** | entrance rewritten (hero trio, 180ms, 40ms stagger), scroll hairline, sheet-settle keyframes, duration contract updated |
| `public/assets/site.css` | 1692 → **1809** | interaction inventory (nav/prose/footer/drawer links, theme toggle), editor loading skeleton |
| `public/assets/tokens.css` | 630 → **642** | `--stagger-tight: 40ms` (duration token only) |
| `public/assets/site.js` | 108 → **151** | proof-sheet settle: IntersectionObserver + sessionStorage guard |
| `docs/MOTION.md` | 443 → this | this section |

### 12.2 Deliverable 1 — scroll-progress hairline

2px `--mark` rule, fixed under the nav (`top: 69px`, 63px under 660px), `transform: scaleX()` driven by
`animation-timeline: scroll(root block)`. No listener, no rAF, no layout. Scoped with
`html:has(.table-wrap)` to exactly the three long pages (`/how-it-works`, `/pricing`, `/security`); the
index, about, auth and editor pages have no table and get no rule. Verified: `content` absent on `/` and
`/about`; on the three pages the computed `transform` reads `scaleX(0)` at 0%, `0.500` at 50% and
`1.000` at 100% (instant scroll).

Two corrections found while building it, recorded because the first readings were wrong:

- **The "body::after is free" reading was a harness bug.** The test injected
  `body:has(.table-wrap) body::after`, a selector that cannot match, so it measured 0 recalcs for a
  rule that never applied. With a correct selector, *any* scroll-driven CSS animation in this Chrome
  costs ~150 style recalcs (one per frame) and ~30ms main-thread task time over a 2.5s scroll at 6×
  CPU; `will-change`, `contain` and moving the animation out of the nav change nothing. It is the
  price of the feature, not a placement bug: no layout, no long task, frame pacing unchanged.
- **The root pseudo-element is not `body::after` for a different reason:** `index.html`'s inline grain
  overlay already owns `body::after`, and a shared pseudo-element would be a collision waiting for the
  grain to be rolled out site-wide. The hairline therefore lives on `html::after`.

### 12.3 Deliverable 2 — interaction inventory

Each state is not colour-only, and every `:hover` rule is paired with `:focus-visible`. Verified by
**keyboard tabbing** (199 focus stops across nine pages, every one with a ring of ≥2px) and by hovering
each surface and diffing the computed non-colour properties.

| Surface | Rest | Hover | Press | Focus-visible |
|---|---|---|---|---|
| Nav link | no underline, 1px transparent border | underline 1px / offset 4px | underline 2px / offset 2px | same as hover + ring |
| Inline/prose link | 1px underline / offset 2px | 2px / offset 3px | 3px / offset 1px | same as hover + ring |
| Footer link | no underline, opacity .82 | underline 2px / offset 3px | — | same as hover + ring |
| Drawer link | no underline | underline 1px / offset 3px | 2px / offset 1px | same as hover + ring |
| Primary / ghost / on-dark button | — | 1px lift (`translateY(-1px)`) | 1.5% scale, 60–90ms leg | ring (inherited) |
| Arrow link | arrow at 0 | arrow +3px | arrow +1px | ring |
| Theme toggle | — | 1px shadow lift (`--shadow-sm`) | 1px translate (theme.css) | ring |
| Cards that are links | **none on these pages** — every `.card` is an `<article>`; app's `.aw-card` belongs to app-ui | | | |
| Table rows that open something | **none on these pages** — `table.compare` rows are static; the SPA's interactive table is app-ui's | | | |

No dead rules were added for the two "none" rows. The only non-hero load animation that remains on any
page is the theme control's 180ms arrival (`aw-toggle-in`), which belongs to `theme.css` and is
documented in SPEC-V2 §5.

### 12.4 Deliverable 3 — section entrance, once

The hero's three elements now arrive: eyebrow and standfirst with `aw-enter`, heading with `aw-rise`
(translate only, never opacity — the H1 stays the LCP candidate), each `--dur-sm` (180ms),
`--stagger-tight` (40ms) apart, group finished 260ms after first paint. The page-head band, the CTA
row and the hero meta are static; nothing below the hero animates on load on any page. The hero's
evidence trace is unchanged and remains the one 560ms move.

### 12.5 Deliverable 4 — the sheet settle

220ms (`--dur`, `--ease-settle`), transform + opacity, on the proof sheet only, once per session. The
IntersectionObserver adds `.is-settling` when the sheet first comes properly into view (threshold 0.5)
and writes `sessionStorage['aw-sheet-settled']`, so a return visit in the same session gets a still
sheet. It deliberately does **not** fire when the sheet is already half-visible at load: on `/` desktop
the evidence trace owns that moment, and two animated moves on one surface is exactly what the round-one
contract forbids. On a phone (390×700) the sheet starts at ratio 0.09, settles on first arrival, and
does not replay.

Measured cost: **0 long tasks** at 6× CPU while it runs; the animation is transform/opacity only, so it
was kept rather than dropped.

A first version of this trigger used "top below 90% of the viewport" and never fired at phone geometry
(the sheet top sat at 627px in a 700px viewport). Replaced with the visible-ratio guard above.

### 12.6 Deliverable 5 — editor loading skeleton

No ornament set has landed yet (no `.aw-proof`, `.sheet` or skeleton classes in any stylesheet), so the
fallback is a plain ruled block: `#ed-loading` becomes a paper sheet with `--r-folio`, hairline,
`--shadow-sheet` and the document's 28px ruled rhythm, the status text kept as a mono label. It is
CSS-only and drawn from `site.css` with an id selector because `editor.css` is another owner's file
this pass; the comment says to absorb it into `editor.css` when that file is free. No shimmer, no loop.
Verified against the real loading state (`/editor?cv=…` with a delayed API response): visible, 352px
paper, ruled gradient, solid hairline, status text "Loading the CV…". The same panel is reused by
`editor.js` for failure states ("No CV chosen", "Sign in to edit"), which therefore also read as a
ruled sheet — acceptable, and reported rather than papered over.

### 12.7 Measurements — 6× CPU, 1440×900, 2.5s rAF-paced scroll

Protocol: `Emulation.setCPUThrottlingRate 6`, one rAF loop for frame deltas, `longtask` observer, CDP
`Performance` counters for task/layout/style. Same pages, same protocol, before and after.

| Page | Frames | >32ms | p95 / max | Long tasks | Layout | Style recalcs | Task time |
|---|---|---|---|---|---|---|---|
| `/how-it-works` before | 175 | 0 | 16.7 / 16.8 | 0 | 0 | 0 | 146ms |
| `/how-it-works` after | 174 | 0 | 16.8 / 16.8 | 0 | 0 | 151 | 215ms |
| `/security` before | 175 | 0 | 16.7 / 16.8 | 0 | 0 | 0 | 161ms |
| `/security` after | 174 | 0 | 16.7 / 16.8 | 0 | 0 | 151 | 282ms |
| `/pricing` before | 175 | 0 | 16.8 / 16.8 | 0 | 0 | 0 | 130ms |
| `/pricing` after | 174 | 0 | 16.7 / 16.8 | 0 | 0 | 151 | 159ms |

**Attribution (3 runs each, hairline on vs off, `/security`):** on = 150.7 recalcs / 288ms mean task;
off = 0 recalcs / 257ms mean task. So the hairline accounts for ~150 recalcs and ~31ms of task time
across the whole scroll (~1.2% of the window); run-to-run noise is larger than that delta. **No frame
over 32ms and no long task in either state** — frame pacing is unchanged, which is the metric the
round-one contract cares about.

**Sensitivity control** (instrument proof): injecting a 60ms busy-wait scroll handler on the same page
and protocol produces **41 long tasks (60–74ms)**, 41/63 frames over 32ms, p95 66.7ms, task 2,566ms.
The zeros above are real, not a dead instrument.

**LCP** (three runs each, 1440×900):

| Page | Element | 1× | 6× |
|---|---|---|---|
| `/` | `H1.display`, 88,407 px² | 144 / 136 / 144 ms (before 140) | 956 / 936 / 956 ms (before 960) |
| `/how-it-works` | `H1.h1`, 83,083 px² | 124 / 140 / 136 ms (before 116) | 912 / 924 / 920 ms (before 880) |

Same element and size in every run; the differences are run-to-run noise on a shared machine, not a
change in what the metric measures. Both headings keep the transform-only rise, so no fade can move
LCP onto the logo.

**Duration ceiling.** Enumerating `document.getAnimations()` on all nine pages: the maximum wall-clock
duration is **560ms, `aw-evidence`, on `/`** — the hero trace, as allowed. Everything else is ≤220ms
(sheet settle), 180ms (entrance, drawer, toggle) or scroll-driven (`aw-progress`, duration `auto`, no
wall clock). Nothing exceeds `--dur-lg`.

### 12.8 Reduced-motion matrix (CDP `Emulation.setEmulatedMedia`, reduce)

| Check | Result |
|---|---|
| Hero trio `animation-name` / opacity | `none` / `1` — page paints complete |
| Evidence trace | `none` |
| Sheet settle class (desktop and first phone arrival) | absent |
| Scroll hairline on `/pricing` | `content: none`, `animation-name: none` |
| Primary CTA hover / press transform | `none` / `none` |
| Theme toggle press `translate` | `none` |
| Menu-toggle press transform | `none` |
| Drawer open | `animation-name: none` (opens in place) |
| View transitions | none (round one's `@supports` + reduce guard untouched) |

### 12.9 What was tried and changed rather than shipped

- **Hairline on `.nav::after`** → moved to `html::after`. Not for cost (measured the same) but because
  `body::after` is already the index grain overlay and a nav-owned pseudo-element would have meant
  duplicating the scroll-tracking rule per page later.
- **Settle trigger "top below 90% of the viewport"** → never fired at phone geometry; replaced with the
  visible-ratio guard (fires at <0.5 visible at load, threshold 0.5).
- **No shimmer on the editor skeleton.** A pulse is a loop and a loop is a spinner; the ruled sheet is
  the honest placeholder.
- **No card-lift or extra hover on cards.** The marketing cards are not links; a lift would advertise an
  interaction that does not exist.

### 12.10 Re-running these measurements

```bash
# server (already up in normal use): node server/index.js   # :3160
node scripts/check.js                                        # 0 errors / 0 warnings
# 6x-CPU scroll, LCP, animations, reduced-motion matrix: the harnesses used here are
# throwaway Playwright scripts under the OS temp dir; the protocol is in §12.7 and §12.8.
```

**Ledger for this pass:** `node scripts/check.js` → 10 pages, 24 server modules, **248 css classes,
0 errors, 0 warnings**; all ten routes **200**; keyboard audit **199/199** focus stops ringed; pixel
and duration checks as above; no console errors observed on the pages measured.

