# SPEC-V2 — the Applywright design system

Status: shipped, 28 October 2026. This supersedes `docs/design/DESIGN-INPUTS.md` where they
disagree; the older file remains useful as the research synthesis it is (it was written before
`theme.js` existed and before the palette split landed). `docs/SPEC.md` still wins on product
truth: this file only decides how that product looks, moves and reads.

What shipped in this pass:

| File | What it is |
|---|---|
| `public/assets/tokens.css` | the palette for **both** schemes, plus type, space, shape and motion tokens. Semver-safe: no token renamed, no token deleted. |
| `public/assets/theme.css` | the product re-key, the dark scheme's component rules, the vernier gauge, the theme control, the motion this layer adds. |
| `public/assets/theme.js` | theme resolution before first paint, the three-state control injected into `.nav__actions`, the `theme-color` meta. |
| `public/{index,how-it-works,pricing,about,security}.html` | one blocking `<script>` in the head; the index hero's H1, subhead, ring removal and proof line. |
| `docs/design/SPEC-V2.md` | this file. |
| `docs/design/VAULT-PATCH.md` | the vault note for the operator to apply. |

---

## 1. Concept

**The promise is Working Proof; the mechanism is Pressproof.**

- **Working Proof** (Codex) is the name for what the product is: a calm proof prepared by a
  meticulous editor, where every rewrite is traceable to its source. It is a promise about
  evidence, and it is the name this spec keeps.
- **Pressproof** (Gemini) is the *visual* language that makes the promise visible: desk-mat
  surfaces for controls, paper reserved for user artefacts, redline proofs with inline
  `[CV §2]` citations, vernier gauges instead of donut rings. Adopting it was the Lead's call and
  it is the right one — it is the only direction that distinguishes a control surface from a
  document surface, which is exactly the distinction this product sells.

The identity stays: **ink and bone, a serif display face, mono for metadata, one green.** None of
that was the problem. What changes is what the page is *made of*: paper is for the thing the user
sends (CVs, letters, packs, redlines); everything else sits on the desk.

Unmistakable, not fashionable, means three things:

1. **The evidence is on the page.** A rewrite appears next to its source, with the surviving facts
   marked and the citation inline. No competitor's marketing page can do that convincingly
   because none of them have a grounding check.
2. **The score is a measurement.** A labelled scale with a threshold rule, the rubric's weights
   spelled out, and the sentence "our rubric, not an employer's verdict". A donut says "an
   employer rated you"; a vernier says "this is where you are on a scale we published".
3. **The material carries the hierarchy.** Hairlines and paper, not drop shadows and cards. The
   document metaphor is honest here: the pack is a single-column A4 page in system fonts
   (`SPEC.md` §5), so the site is not dressing itself as a document it cannot produce.

Borrowed from the Docket research file: folio corners (`--r-folio: 2px`), a stacked-sheet offset
shadow (`--shadow-sheet`, two hard steps, no blur), tabular numerals, and the rule that a line
carrying meaning measures ≥3:1. Not borrowed: its full layout rewrite, which belongs to the
`site.css` owner.

---

## 2. Slogan

**Shipped hero H1: “Your numbers stay. The wording moves.”**
**Proof line under the grounding check: “Nothing invented.”**

Six words. It names a mechanism a reader can picture (two things do different things), it is the
exact behaviour `assertGrounded` enforces — numbers, employers, titles and dates are preserved;
wording, order and emphasis may change — and it is provable on the free plan in one session. It
also pre-empts the category's main objection ("the AI will make things up") without making a
virtue claim the product cannot keep.

### Rejected, and why

| Candidate | Source | Why not |
|---|---|---|
| Your CV, tailored for every job. | current tagline (`SPEC.md` §1) | Fails the competitor-paste test: Teal, Rezi, Enhancv and Jobscan can all ship the sentence unchanged. It is a category label, not a claim. |
| Make your CV fit the job. Keep every fact. | Codex | Nine words (over the budget), and the first clause is the category's own claim. The second clause is the good half, and Grok's line states it as a mechanism. Kept in the spec as the strongest rejected alternative. |
| Tailored, not templated. | Lead | True, but a positioning line about the product's build method, not about the user's outcome. "Templated" is also a weaker objection than "fabricated". |
| Tailored to the advert. Grounded in your actual work. | Gemini A | Accurate and too long; two abstract nouns where Grok has one concrete one. |
| Score the fit, sharpen the evidence, send it yourself. | Gemini B | Three verbs, three beats, no single memorable image. |
| Every word backed by your CV. Shaped for the role in front of you. | Gemini C | The best of Gemini's three, and still two clauses of equal weight with nothing to picture. |
| A score you can argue with. | Grok (rejected by Grok) | Clever and deniable; "argue with" reads as defensive to someone who has just been rejected. |

### Copy rules that follow

1. **The competitor paste test.** If Jobscan, Teal or Enhancv could ship a heading unchanged,
   rewrite it until it names a finding, a kept fact, or the click the human still makes.
2. **“Nothing invented” is a proof line, not a boast.** It belongs next to the grounding check,
   where the artefact is visible. As a headline it is a virtue claim every AI CV site makes.
3. **No dream-job language, no multipliers, no pass rates.** The 75%-rejected-by-ATS figure has no
   traceable primary source (`docs/research/ats-reality.md`); the score is our rubric and is
   labelled as one everywhere it appears.

Not in this pass, for the page owner: `<title>`, `meta description`, the footer tagline and the
sign-in quote still carry "Your CV, tailored for every job." The H1 and the title now disagree.

---

## 3. Type

**System stacks, not hosted faces.** Codex proposed self-hosting Public Sans, Literata and IBM Plex
Mono. Rejected: the printable pack is deliberately system-font (`SPEC.md` §5), so a marketing page
set in a face the artefact cannot use weakens the product's own claim, and three variable WOFF2
files are payload and licensing surface for no functional gain. Gemini's critique and the
aesthetic research both argue the same way. If a house serif is ever bought, the sanctioned
shortlist is Newsreader or Source Serif 4 (both SIL OFL 1.1, self-hosted, `font-display: swap`).

| Role | Family | Use |
|---|---|---|
| Display | `--display`: Iowan Old Style → **Sitka Heading** → Palatino Linotype → Book Antiqua → Palatino → Georgia → Times New Roman | hero, section headings, prices, statistics |
| Interface | `--sans`: Segoe UI Variable Text → Segoe UI → system-ui | body, controls, tables, nav |
| Metadata | `--mono`: Cascadia Code → SF Mono → JetBrains Mono → Consolas | rubric readouts, folios, registration stamps, code, citations |

Three corrections, all measured against the rendered page rather than assumed:

1. **Serif weight 400, not 500.** Palatino Linotype ships 400 and 700 and has no Medium, so the
   browser was synthesising the bold — visible as smeared stems at display sizes. `Sitka Heading`
   is added to the stack because it is a real Roman cut that ships with Windows, and it is what a
   Windows visitor now sees.
2. **Display capped at 68px (`--fs-4xl` max `4.25rem`), tracking `-0.028em`.** 88px is a poster,
   and the tracking that suits an 88px optical size crowds a 68px one.
3. **A missing middle size.** The scale went 88px display, then 17px body, then 12–14px metadata.
   `--fs-reading: 0.9375rem` / `--lh-reading: 1.6` is the size bullets, findings and letters are
   read at.

`font-variant-numeric: tabular-nums` on scores, prices, counts and dates; old-style figures are not
used, because the numbers that matter here are measurements that must align in a column.

> Note for the next pass: `site.css` (another owner) independently landed the same three fixes at
> the same values, which is reassuring but means `--fs-4xl` now has two homes. Keep the token;
> delete the literal.

---

## 4. Colour, with measured contrast

**Two layers.** `tokens.css` owns the palette — both schemes, one place to look. `theme.css` owns
the product re-key and every rule a token cannot express (a logo stroke that must not flip, a
button whose foreground `site.css` hardcodes).

**The switch is one attribute.** `<html data-theme="dark">`, set by `theme.js` before the first
paint. There is no `@media (prefers-color-scheme: dark)` block: pages that do not load `theme.js`
(sign-in, sign-up, `/app`) have no attribute, so they stay on the light palette with their
component rules intact instead of flipping tokens they have no dark overrides for. "System" is
resolved by the script, not by CSS, so a saved `light` choice and a dark OS can never disagree.
`:root { color-scheme: light }` / `[data-theme="dark"] { color-scheme: dark }` also opts out of
Chrome's Auto Dark Theme.

### The palette

Ratios are WCAG relative-luminance, computed from the shipped hexes, not rounded. Threshold 4.5:1
for text; 3:1 for a rule, ring or boundary that carries meaning (1.4.11).

| Token | Light | Light ratio (on) | Dark | Dark ratio (on) | Role |
|---|---|---|---:|---|---:|---|
| `--paper` | `#fffdf8` | — | `#191c22` | — | page, cards |
| `--bone` | `#f5f2ea` | — | `#121419` | — | recessed band, nav on inner pages |
| `--bone-2` | `#eae5d9` | — | `#0d0f13` | — | wells, avatars |
| `--ink` | `#0b0c0e` | — | `#08090b` | — | frozen cover band: hero, footer, `.section--dark` |
| `--ink-2` | `#14161a` | — | `#0f1115` | — | `.mock`, `.card--ink`, `.code` |
| `--ink-3` | `#1d2026` | — | `#171a20` | — | bubbles, bars inside a band |
| `--text` | `#14161a` | 17.82 paper | `#f4f1e8` | 15.11 paper | body |
| `--text-soft` | `#4a4f57` | 8.11 paper | `#c6cad2` | 10.39 paper | ledes, prose, card foot |
| `--text-muted` | `#59606e` | 6.22 paper / 5.65 bone / 5.03 bone-2 | `#a6acb6` | 7.47 / 8.07 / 8.40 | labels, metadata |
| `--text-invert` | `#f5f2ea` | 17.49 ink | `#f5f2ea` | 17.81 ink | copy on a band |
| `--text-invert-soft` | `#a9aeb6` | 8.77 ink / 7.32 ink-3 | `#a9aeb6` | 8.93 / 7.81 | copy on a band |
| `--accent` | `#0f5c43` | 7.85 paper / 7.13 bone | `#47c99a` | 8.20 paper / 8.85 bone | actions, links, focus |
| `--accent-ink` | `#093d2c` | 12.04 paper | `#86e7c0` | 11.54 paper | prose links |
| `--accent-soft` | `#e2efe9` | 15.32 (`--text` on it) | `#16302a` | 12.48 | `.card--accent` |
| `--on-accent` | `#ffffff` | 7.98 on accent | `#06130d` | 9.12 on accent | label on a filled control |
| `--ok` | `#1d7d46` | 5.07 paper / 4.61 bone | `#4cc38a` | 7.70 / 8.32 | verified, ready |
| `--warn` | `#945306` | 5.90 paper / 5.36 bone | `#f0ad4e` | 8.77 / 9.47 | needs attention |
| `--err` | `#b42318` | 6.47 paper / 5.88 bone | `#f27268` | 6.00 / 6.48 | failed, rejected |
| `--mark` | `#0b0c0e` | 19.25 paper | `#e8e6e1` | 13.68 paper | ink-on-paper parts (logo, menu glyph, icons) |
| `--line-meaning` | 48% ink → `#8a8988` | 3.43 paper / 3.35 bone | 45% cream → `#7c7c7c` | 4.09 / 4.41 | a rule or boundary that carries meaning |
| `--lime` | `#d7efa6` | 14.48 on ink-2 | `#d7efa6` | 15.11 on ink-2 | gauge fill, focus ring on ink |
| `--focus` | `= --accent` | 7.85 paper | `= --accent` | 8.20 paper | focus ring |

Every pair above is asserted in one pass over the tokens; the 66-pair list is reproduced in §9.
All text pairs clear 4.5:1 on every surface they are used on; every indicator pair clears 3:1.

### Three decisions inside the palette

**1. The action green and the status green are now different colours.** They were both `#0f6b4f` —
Gemini's defect 6, and a real one: a "verified" tick and a link were the same ink, so the tick read
as something to click. Split per Gemini: `--accent #0f5c43` (action), `--ok #1d7d46` (status), with
`--warn`/`--err` moved to the same deeper family. It costs 1.3 points of accent contrast on
`--paper` (6.38 → 7.85 on the *indicator* pair is unaffected; the text pair was 5.80 → 7.13 on
`--bone`) and buys a distinction the interface needs. Dark keeps the same logic: `#47c99a` action,
`#4cc38a` status.

**2. `--mark` exists so the logo never disappears.** Research-darkmode §1 measured the trap:
`--ink` is both a background (band) and a foreground (logo strokes, menu glyph, card icons, the
light button). Flipping it makes the band pale and the logo vanish (1.08:1). Rather than freeze
`--ink` and leave seven rules wrong, `--mark` is declared in both schemes and `theme.css` points
the seven components at it until `site.css` migrates. When it does, the overrides delete without
a pixel changing.

**3. The dark text greys are deliberately heavier than Gemini's proposal.** Gemini suggested
`--text-muted #7d8592`; that measures 4.57:1 on the dark paper — passing, but with no headroom on
a page that is mostly 15px prose. Shipped: `#a6acb6` at 7.47:1. The quiet-look benefit does not
outweigh reading comfort for someone working through a job advert at 11pm. Recorded as a resolved
conflict, not an oversight.

### What did not change, and why

Light values that already passed are untouched: `--paper`, `--bone`, `--ink`, `--text`,
`--text-soft`, `--text-muted`, `--text-invert`, `--text-invert-soft`, `--line*`, `--lime`,
`--ember`. The live site's light theme is therefore the same theme it was, plus the accent/status
split and the typographic fixes. That was the only way to ship a dark mode without a regression
review of every page.

### Known cosmetic leftovers (not failures)

- `--line-strong` is 22% ink = 1.65:1 on `--paper`. It used to be the only thing identifying an
  empty `.input`; `site.css` now uses `--line-meaning` (3.43:1) there, so nothing depends on it.
- `--line-invert-strong` is 26% cream = 2.21:1 on `--ink` in the light scheme (2.9:1 dark). It is
  used for ghost-button boundaries that also carry a text label and for decorative hairlines.

---

## 5. Motion

Four durations, three curves, one stagger. Tokens in `tokens.css`; the existing `--ease`/`--dur`
stay authoritative for everything already written.

| Token | Value | Use |
|---|---|---|
| `--dur-xs` | 120 ms | state: colour, border, icon swap |
| `--dur-sm` | 180 ms | hover, press, disclosure |
| `--dur-md` | 260 ms | panels, drawers |
| `--dur-lg` | 560 ms | page entrance, once per load |
| `--dur-data` | 420 ms | a measurement settling when a value is replaced |
| `--ease-enter` | `cubic-bezier(.16,1,.3,1)` | enter |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | exit |
| `--ease-settle` | `cubic-bezier(.22,1,.36,1)` | data settle (vernier, score change) |
| `--stagger` | 55 ms | sibling offsets |

Added by this layer, and nothing else:

1. **The theme control's state change** — the active icon crossfades and settles from
   `scale(.72) rotate(-14deg)` to rest in 120 ms; the button moves 1px on press. This is the
   motion that explains what the click did.
2. **The control's arrival** — 180 ms fade/scale, once, because the button is injected after the
   document starts parsing.
3. **A disclosure settles** — `.faq details[open]` content arrives with a 4px, 180 ms
   `translateY` and opacity. Reopening replays it; nothing is hidden from a first paint.

Deliberately **not** added, each for a reason worth recording:

- **No animated theme switch.** A full-page colour transition is a paint over every surface for a
  quarter of a second, it needs a transition list that will silently miss the next component
  someone adds, and it makes a toggle feel slower than it is. Codex asked for instant; the
  research asked for state-change motion only. The icon change is the feedback.
- **No gauge fill on load.** A fill growing from zero implies a computation that did not happen.
  `--dur-data`/`--ease-settle` exist for the one place a score genuinely changes — a new analysis
  response replacing an old one — which is `app-ui`'s surface.
- **No new scroll reveal.** `site.js`/`motion.css` already run a 620 ms reveal system; adding a
  second one would fight it. §7 recommends retiring it instead.
- **No count-ups, typewriter reveals or token streaming.** They are the visual shorthand for
  "watch a chatbot improvise", which is the opposite of the grounding promise.

**Reduced motion.** `tokens.css` collapses every animation and transition to 0.01 ms under
`prefers-reduced-motion: reduce`, and this layer additionally returns the toggle and the
disclosure to their settled state. Colour changes survive (colour is not motion). Verified in the
headless pass: with the preference on, the page renders dark, the H1 is at `opacity: 1`, and the
toggle's animation duration is `1e-05s`.

---

## 6. Component rules

**Theme control** (`.theme-toggle`, injected by `theme.js`; `nav.html` is not edited).
40×40, `--r-sm`, boundary `--line-meaning` — not `--line-strong`, because at 1.65:1 a ghost
button's only boundary fails 1.4.11. Three states, one button: `aria-label` reads
`Colour theme: system, currently light. Switch to dark.`, and a `role="status"` live region
announces the result of a click. There is no `aria-pressed`: a three-state control is not a toggle,
so the label carries the state and the action. The cycle is **system → the opposite of what you
are looking at → the other explicit mode → system**, because a fixed rotation makes the first
click out of "system" a no-op whenever the OS already matches. `localStorage['applywright-theme']`
holds `light`/`dark`; its absence means system, and a storage exception fails closed to system.
The footprint is reserved with `html[data-theme-pending] .nav__actions::after` so the CTAs never
shift when the button lands.

**Vernier gauge** (`.hero-gauge*`). A flat scale with 10% ticks, a fill, a threshold hairline and
a mono readout; `role="img"` with the value in the label, and the number repeated as text so the
bar is never the sole carrier. The score is labelled "our rubric, not an employer's verdict".

**Section inversion.** Depth order is identical in both schemes (paper above bone above bone-2
above ink), so `site.css`'s surface rules keep their meaning without restatement. Two dark-only
adjustments: `.section--dark` gets a hairline edge where it meets the page, and `.bento` cells step
up to `--ink-2` so the grid does not read as one black rectangle.

**Print.** Printing a dark page forces the light palette back, including `--mark` and the one
hardcoded foreground, and removes the hero wash. A dark page must not print as grey text.

**Tables, forms, empty states** (adopted from Codex, some already landed by `site.css`): rules
instead of zebra; mono `thead`; `tabular-nums` on numeric cells; `td.yes` carries a word, not only
`--ok`; one column for forms, label above control, hint via `aria-describedby`, error summary
above the first field even for one error; an empty state names what is missing, why, and the one
action, and never dead-ends.

**Status is never colour-only.** Every state also carries a word, a glyph or a rule.

---

## 7. Where the inputs disagreed, and what won

| Conflict | Winner | Reason |
|---|---|---|
| Concept: Docket (research) / Working Proof (Codex) / Pressproof (Gemini) | **Working Proof the promise, Pressproof the mechanism** | Pressproof distinguishes a control surface from a document surface, which is the product's own distinction. "Working proof" names what the artefact is. Neither name is a layout. |
| Self-hosted type (Codex) vs system stacks (aesthetic, Gemini) | **System stacks** | The pack is system-font by spec; hosted faces would make the marketing page typographically richer than the product it sells. No payload, no licence, no CJK/fallback risk. |
| Replace the palette with a `--color-*` semantic layer (Codex) vs extend Meridian | **Extend Meridian** | Every page and the SPA depend on the existing names; a parallel system is a migration, not an addition, and it cannot be semver-safe in one pass. |
| Cool grey-green canvas `#F1F3EF` (Codex) vs warm bone | **Warm bone** | The warm paper is the identity, it already passes every pair, and changing it would repaint the live site for taste rather than a defect. |
| Light accent `#0f6b4f` (shipped) / `#0B6046` (Codex) / `#0f5c43` (Gemini) | **`#0f5c43`** | Only Gemini separated the action green from the status green, which is a real defect. The value is measured (7.85 paper, 7.13 bone). |
| Dark accent `#6cc6a4` (research) / `#56d7a6` (my first pass) / `#47c99a` (Gemini) | **`#47c99a`** | All three pass; Gemini's keeps the dark scheme in the same press-green family as the new light accent, and 8.20:1 on the dark paper is ample. |
| Dark muted `#7d8592` (Gemini) vs `#a6acb6` (shipped) | **`#a6acb6`** | 4.57:1 vs 7.47:1. Dense prose at 15px deserves headroom; "quieter" is not worth reading strain. |
| Slogan: Codex's "Make your CV fit the job. Keep every fact." / Gemini A / Grok | **Grok** | Six words vs nine, concrete ("numbers") vs abstract ("facts"), and it names a mechanism. Lead's decision, recorded with the alternatives in §2. |
| Hero: Codex's conventional composition vs Grok's advert-beside-CV | **Grok/Gemini** | The ring implies an employer's verdict the product does not issue; a proof sheet shows the product. Lead's decision; the build is deferred (§8.1). |
| Motion: Codex "delete every reveal" vs Gemini "add settles" | **Settle only, on state** | The existing reveal system is owned by `site.js`/`motion.css`; adding a rival would be worse than leaving it. Retirement is recommended in §8.4. |
| `theme-color`: two `media`-scoped metas (research) vs one JS-updated meta | **JS** | With a manual override, a `media="(prefers-color-scheme: dark)"` meta would state the OS preference while the page renders the opposite. One meta that follows the resolved theme is the only honest option. |
| Animated theme change | **None** | Cold surface doesn't need ceremony; instant is the honest answer. |

---

## 8. The next pass, in priority order

**1. Hero composition — the one thing deliberately left half-done.** Not built: `public/index.html`'s
body is the marketing-page owner's write surface, and this pass already changes its H1, subhead and
proof panel. What shipped instead is the honest minimum: the ring is gone (a decorative 78 that
implied an employer's verdict), replaced by the rubric readout, and "Nothing invented." sits under
the grounding check.

The target, in Grok's composition with Gemini's proofs:

```
left  │ advert's requirement lines, verbatim-looking, matched ones marked
      │ "Own a checkout flow with measurable conversion gains"   [matched]
      │ "Comfortable with 2-week release cycles"                 [matched]
right │ the CV bullet that answers each, with the preserved number marked
      │ "Cut checkout drop-off 18% over 2 releases, working with 2 engineers…"
      │ [CV §2 · 18%]  Numbers preserved · wording reordered
foot  │ 75 / 100 · keywords 35, structure 20, achievements 20, readability 15, formatting 10
      │ A rubric, not an employer's verdict.  ·  Nothing invented.
```

Then delete `.hero__grad` and the `.mock` browser chrome (dots, fake URL) in the same change — a
fake browser frame around a fake chat is the exact costume the research says to drop. A static
marketing score of 78 should not survive as a number: if the mock keeps a score, it must be
labelled as an example the rubric produces, which §6's gauge already does.

**2. One `.aw-proof` folio component.** Pressproof lives or dies on this: a sheet with a registration
stamp, a 40px mono gutter, struck-through weak phrasing and press-green insertions with inline
`[CV §2]` citations. Gemini supplied a drop-in foundation (`DIRECTION-gemini.md` §7). It is one
component used in three places (hero, CV library, applications board) — not a second system.

**3. `--mark` migration in `site.css`.** Move the seven ink-on-paper components to `var(--mark)`;
then the corresponding `html[data-theme="dark"]` overrides in `theme.css` §2.1 delete cleanly.
Same pixels, less debt.

**4. Retire the old motion.** `.reveal` (620 ms, scroll-triggered), the 900 ms ring draw (dead now
that the ring is gone), the 220 ms card lift and the 2.4 s `.pill--live` pulse. The pulse starts by
itself, runs over five seconds and has no pause control — WCAG 2.2.2 — so delete it rather than
dress it. None of these are in this writer's scope.

**5. Dark mode reaches the authenticated surfaces.** `sign-in.html`, `sign-up.html` and
`app/app.html` do not load `theme.js`, so a user who chose dark on the marketing site is dropped
back into the light theme at sign-in. Two lines per page (the same blocking `<script>`), then
`app.css` needs its hardcoded colours checked against the dark palette — that is the SPA owner's
work, and it should not be improvised from this file.

**6. Fold the literals.** `.code` still carries five hexes and `.nav` one `rgba()` fallback
(`site.css`). Both should become scheme pairs or tokens; `theme.css` already covers the nav
fallback so the light theme cannot flash cream.

**7. Turn the receipts into a gate.** Add the §4 pairs to `scripts/check.js` as unrounded
assertions (or run `axe-core` as a dev dependency) so a future palette edit fails a test rather
than a user. `check.js` is not this writer's file.

**8. One `--fs-4xl`.** `site.css` now duplicates the display cap as a literal at the same value.
Keep the token, drop the duplicate.

---

## 9. Verification ledger

Run from `projects/applywright` on 28 October 2026:

| Check | Command | Result |
|---|---|---|
| Static self-check | `node scripts/check.js` | **8 pages, 24 server modules, 174 css classes — 0 errors, 0 warnings** |
| Script syntax | `node --check public/assets/theme.js` | exit 0 |
| Pages live | `Invoke-WebRequest http://127.0.0.1:3160/{,how-it-works,pricing,about,security}` | all 200, includes expanded (nav present in the served HTML) |
| Assets live | `/assets/theme.js`, `/assets/theme.css` | 200 |
| Contrast, light | 66-pair assertion pass over `tokens.css` + `theme.css` | 0 failures; lowest text pair 4.61:1 (`--ok` on `--bone`), lowest indicator 3.35:1 |
| Contrast, dark | same list, dark block | 0 failures; lowest text pair 4.72:1 (`--err` on `--paper`), lowest indicator 4.09:1 |
| Headless render | Chrome `--headless=new` over DevTools, 23 assertions | 0 failed, 0 console errors |

The headless pass asserts, in both schemes: `data-theme` and the `theme-color` meta correct at the
**first animation frame** (no flash), the toggle present and 40×40, the nav order unchanged, the
H1 text, the gauge rendered, `.mock .muted` resolving to the inverted role (a pre-existing 2.5:1
bug), 0 px horizontal overflow at 1440/768/360, one click from system resolving to the opposite of
what is displayed and persisting, reload keeping the theme from the first frame, no CTA movement
when the injected control lands, explicit light beating a dark OS, and reduced motion settling.

Screenshots in `screenshots/`: `40-home-light-1440`, `41-home-light-768`, `42-home-light-360`,
`43-home-dark-1440`, `44-home-dark-1440-full`, `45-home-dark-360`, `46-home-dark-768`,
`47-pricing-dark-1440`, `48-how-it-works-dark-1440`, `49-security-dark-1440`, `50-about-dark-1440`,
`51-pricing-light-1440`, `52-home-dark-reduced-motion-1440`.

The 66-pair list (grep-able, reproducible by reading the tokens): body/lede/muted/invert text on
every surface they sit on; the hero sub against the worst point of the accent gradient (composited
at 18.7%); footer links at their 0.82 opacity; every button variant in both schemes; chip, card
foot, kicker, table head, price list, tick, warn/err, prose link; mock bubble, gauge legend, gauge
value, gauge threshold, lime fill; the five hardcoded `.code` syntax colours; the theme toggle
label; `--mark`; the focus ring on paper and bone; `--line-meaning` on paper and bone in both
schemes.

---

## 10. Provenance

Inputs read in full before writing this: `docs/SPEC.md`, `docs/research/{market,ats-reality}.md`,
`docs/design/RESEARCH-{repos,communities,darkmode,aesthetic}.md`,
`docs/design/DIRECTION-{codex,gemini,grok}.md`, `docs/design/DESIGN-INPUTS.md`, the shipped
`tokens.css` / `theme.css` / `site.css` / `motion.css`, and the headless screenshots in
`screenshots/`.

Licences: nothing hosted or vendored was added — no webfont, no icon set, no framework, no build
step. The `--mark` seam and the two-layer token split are original to this repo. Gemini's
`.aw-proof` foundation (§8.2) is that review's own work, supplied for this project. External
claims quoted above are from the research files, which cite WCAG 2.2, MDN, Chrome for Developers,
and the vendor documentation listed there.
