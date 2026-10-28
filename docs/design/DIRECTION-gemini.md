# Gemini 4 Argon — visual critique and direction (reviewed 28 Oct 2026)

Reviewer: Gemini 4 Argon, from the rendered screenshots plus the CSS. Lead's note: this
review is the only one based on pixels rather than source, so its defect list outranks
the two speculative directions. Slogan rejected in favour of Grok's line — see §6.

Reviewed: `screenshots/20-home.png`, `30-app-dashboard.png`, `31-app-cv.png`,
`32-app-jobs.png`, `33-app-applications.png`, `36-app-jobs-390.png` (390×844 @2×),
plus `tokens.css`, `theme.css`, `site.css`, `motion.css`, `app/app.css`, `app/app.js`.

---

## 1. What works (keep it)

1. **Warm archival ground with hairline separation.** `--bone` `#f5f2ea` rail against
   `--paper` `#fffdf8` main, bounded by `1px solid var(--line)`. Calm hierarchy without shadows —
   right for a product where people read dense adverts and letters.
2. **Tabular numerals** (`.aw-num`, `.aw-ring__value`, `.price__amount`,
   `font-variant-numeric: tabular-nums`). Scores read as measurements, not gamified badges.
3. **Mono eyebrow + 22px rule cadence** (`.eyebrow::before`). Gives every section an
   index-card entry point before the serif takes over.

## 2. Eight defects, in impact order

| # | Defect | Fix |
|---|---|---|
| 1 | **Mobile rail footer eats ~185px** (≈29% of a 360×640 screen). Below 900px `#app-nav` hides but `#app-rail-foot` stays visible inside a sticky bar. | `@media (max-width:900px){ #app-rail:not(.is-open) #app-rail-foot{display:none} }`; closed bar = `#app-rail-head` only, ~56px; expose the foot only in the open drawer. Unify the 940px/900px breakpoints to one value. |
| 2 | **Display prose crushed into a metric tile.** `.aw-value--lg` applies `clamp(2.4rem…3.2rem)` serif to "Alex Morgan — product engineer" inside a 4-col grid, four stacked lines beside two-digit numerals. | Restrict `.aw-value--lg` to ≤6ch numerals. Add `.aw-value--doc` at `clamp(1.15rem, 1rem + .35vw, 1.375rem)`, `line-height:1.25`, 2-line clamp. `container-type: inline-size` on `#app-body`; metrics go 4-up only at `@container (min-width:980px)`. |
| 3 | **Hero is still a chatbot mock.** `.mock__msg` / `.mock__bubble` with `Before`/`After` chips says "prompt and response", then the app has no chat at all. | Replace with a paper proof sheet on the dark stage: real role header, `78 / 100` vernier, struck-through weak bullet, grounded replacement with `[CV §2 · 18%]`. |
| 4 | **CV library hierarchy inverted.** ~520px import form first; `Your CVs` at the viewport edge; "analyse" ~1,800px down. | When `state.cvs.length > 0`: CV folios + score panel first; all three ingestion forms behind one `<details>` drawer, open only on an empty account. |
| 5 | **Stadium-pill inflation + repeated nags.** Every row action is `border-radius:999px`; job cards repeat salary twice and carry a disabled "No credits left"/"See plans" pair; pack artefacts hide behind a ghost "Notes & refine". | `.btn--sm` (30px, 4px radius, xs) for dense actions; crisp corners for page commits; one top credit strip; drop duplicate salary; promote "Open pack" + explicit "Print CV"; tint `select[data-status]` with a leading dot. |
| 6 | **Brand/semantic green collision + orphaned favicon + hard nav seam.** `--accent` and `--ok` are both `#0f6b4f`; favicon still Meridian's `#2f4bff` crosshair; `.nav` is 86% cream across a charcoal hero. | Split interactive `--accent #0f5c43` / `--accent-ink #093d2c` from semantic `--ok #1d7d46`, `--warn #945306`, `--err #b42318`. Folio favicon (done). Nav shares the hero material on dark-hero pages. |
| 7 | **Barren canvas + equal-weight zero chips.** Eight filter chips at identical contrast, three of them `(0)`; ~500px dead paper below the table; ~520px void mid-rail. | Dim `(0)` chips (`opacity:.48; border-style:dashed`); group nav into Prepare / Find & manage; at ≥1120px make Applications a master–detail split (queue list + live pack folio). |
| 8 | **Serif fallback + collapsed mid-scale.** `Iowan Old Style` → `Palatino Linotype` at `font-weight:500` (a weight Palatino lacks → synthetic bold); `--fs-4xl` reaches 88px, then everything drops to 12–14px. | `--display` at `font-weight:400`, stack landing on a real Roman cut (Sitka Heading / Palatino / Georgia). Cap display at ~68px, `-0.028em`. Add one intermediate reading size (~15px/1.6) for bullets, letters and findings. |

## 3. Direction — *Pressproof*

Make the site look like the thing it makes. Desk-mat surfaces for controls, **paper only for user
artefacts** (CVs, packs, letters, redlines), so the product never looks like generic SaaS. It also
honours the *-wright* in the name: a craftsperson building something sound by hand.

1. **Desk-mat chrome vs stacked paper folios.** Controls sit recessed on `--bone` with hairline
   rules; `.aw-folio` is `--paper`, `2px` corners, `1px var(--line-strong)`, stacked-sheet offset
   shadow (`4px 4px 0 var(--bone-2), 4px 4px 0 1px var(--line)`), and a mono registration stamp
   (`PRIMARY · VOICE 88 · A4`).
2. **Ruled margin-gutter redlines with inline citations.** 40px mono gutter down the left of every
   rewrite block; weak phrasing struck through in ochre (`#7c4305` on `#fdf2e6`); grounded
   insertions washed press-green (`rgba(15,92,67,.11)`) with `[CV §2]` chips.
3. **Vernier caliper gauges, not donut rings.** Flat precision scale via
   `repeating-linear-gradient(90deg, var(--line-strong) 0 1px, transparent 1px 10%)`, a 1px
   threshold hairline at 70 labelled `STRONG FIT`, forest fill bar, tabular `78 / 100`.

## 4. Dark mode — what breaks, what inverts, what must not

Breaks today (measured): `--accent #0f6b4f` is **2.15:1** on `#0b0c0e` and 2.01:1 on `#14161a`;
`--accent-ink` **1.54:1**; `--warn` 2.68:1 and `--err` 2.42:1 on `#14161a`; black-alpha
`--line` is **1.00:1 (invisible)** on ink; `.aw-bar__track` / `.aw-ring__bg` reference
`--bone-2`, which glows like chalk; `.btn--primary` hardcodes `color:#fff`.

Invert (desk and chrome): `--bone → #0d0f12`, `--bone-2 → #191d23`, `--surface-ui → #13161b`,
`--line → rgba(243,239,230,.10)`, `--line-strong → rgba(243,239,230,.20)`, `--text → #ece8de`,
`--text-soft → #a8aeb8`, `--text-muted → #7d8592`, `--accent → #47c99a` (8.6:1 on `#13161b`),
`--accent-fill → #137556` with `--on-accent #fffdf9` (5.3:1), `--accent-soft → rgba(71,201,154,.14)`,
`--ok → #4cc38a`, `--warn → #f0ad4e`, `--err → #f27268`.

Must **not** invert: the printable A4 CV sheet (keep warm stock `#f8f5ec` with charcoal ink — it is a
print artefact), the marketing hero's dark stage (already ink), and any SVG mark interior or primary
button foreground (never `filter: invert(1)`).

## 5. Motion

Add: (1) **vernier settle** — `scaleX` fill, 420ms `cubic-bezier(.22,1,.36,1)`; (2) **redline
cross-settle** — insertion wash 200ms `cubic-bezier(.16,1,.3,1)` with 50ms-staggered citations;
(3) **folio/drawer glide** — 240ms in `cubic-bezier(.2,.8,.2,1)`, 160ms out.

Reject: **typewriter / token-streaming reveals and spring count-ups** on tailored bullets or scores.
They are visual shorthand for "watch a chatbot improvise", which contradicts the grounding promise,
and theatrical latency is friction for someone anxious about their CV.

## 6. Slogans

Offered: A "Tailored to the advert. Grounded in your actual work." · B "Score the fit, sharpen the
evidence, send it yourself." · C "Every word backed by your CV. Shaped for the role in front of you."

**Rejected by the Lead** in favour of Grok's *"Your numbers stay. The wording moves."* — shorter,
concrete (numbers, not facts), and it names a mechanism. Keep A as the recorded alternative.

## 7. Highest-impact change in an afternoon

Build one `.aw-proof` paper-and-redline folio in hand-written CSS and put it in the hero, the CV
library and the applications board. Today a CV product never shows a CV page on first load. That one
component makes the promise visible in all three places with no backend change.

### Drop-in foundation

```css
.aw-proof{background:#fffdf8;color:#14161a;border:1px solid rgba(11,12,14,.22);border-radius:2px;
  box-shadow:4px 4px 0 var(--bone-2,#eae5d9),4px 4px 0 1px rgba(11,12,14,.14);overflow:hidden}
.aw-proof__bar{display:flex;flex-wrap:wrap;gap:.5rem 1rem;justify-content:space-between;
  padding:.65rem 1rem;background:#f5f2ea;border-bottom:1px solid rgba(11,12,14,.14);
  font-family:var(--mono);font-size:var(--fs-xs);letter-spacing:.06em;text-transform:uppercase;color:#4a4f57}
.aw-proof__row{display:grid;grid-template-columns:2.5rem minmax(0,1fr);border-bottom:1px solid rgba(11,12,14,.08)}
.aw-proof__gutter{padding:.75rem .4rem;text-align:right;font-family:var(--mono);font-size:.6875rem;
  color:#59606e;background:rgba(11,12,14,.025);border-right:1px solid rgba(11,12,14,.14);font-variant-numeric:tabular-nums}
.aw-proof__body{padding:.75rem 1rem;font-size:.9375rem;line-height:1.55}
.aw-proof__del{background:#fdf2e6;color:#7c4305;text-decoration:line-through;text-decoration-thickness:1.5px;padding:.05em .25em}
.aw-proof__ins{background:rgba(15,92,67,.11);color:#093d2c;border-bottom:1.5px solid #0f5c43;padding:.05em .25em;
  transition:background-color 200ms cubic-bezier(.16,1,.3,1)}
.aw-proof__cite{display:inline-block;margin-left:.35rem;padding:.08rem .38rem;font-family:var(--mono);
  font-size:.6875rem;color:#093d2c;background:#e2efe9;border:1px solid rgba(15,92,67,.28);border-radius:2px}
@media (max-width:480px){.aw-proof{box-shadow:2px 2px 0 var(--bone-2,#eae5d9)}
  .aw-proof__row{grid-template-columns:1.9rem minmax(0,1fr)}.aw-proof__body{padding:.65rem .75rem;font-size:.875rem}}
@media (prefers-reduced-motion:reduce){.aw-proof__ins,.aw-proof__cite{transition-duration:.01ms!important;transform:none!important}}
```
