# Artwork — the Pressproof ornament and illustration set

Hand-authored SVG, no raster, no external assets, no licences to clear. This is the reference for
the set: what each piece is, the rules that make it a set, where it is used, and what was rejected.

Files live in `public/assets/art/`. PNGs are generated from their SVGs with headless Chrome (a
screenshot of the served file at its authored size), never drawn by hand.

| File | Bytes | What it is |
|---|---:|---|
| `reg-mark.svg` | 396 | the base motif: a printer's registration target on the 24 grid |
| `reg-divider.svg` | 697 | a section divider: hairline interrupted by the mark (240 wide) |
| `reg-corner.svg` | 537 | corner ornament for a proof sheet (48 = two cells) |
| `reg-bullet.svg` | 575 | micro mark for captions, drawn on the grid and shown at 12px |
| `pipeline.svg` | 2,400 | ingest → score → tailor → pack as a press-proof schematic (1248 × 360) |
| `empty-cvs.svg` | 669 | empty state: no CVs yet (blank folio, loose sheet, corner ticks) |
| `empty-proposals.svg` | 631 | empty state: no proposals yet (redline sheet, one struck line) |
| `empty-applications.svg` | 808 | empty state: no applications (ledger with one open row) |
| `grain.svg` | 838 | the 240 × 240 paper-grain tile (turbulence, stitched) |
| `og-card.svg` | 3,865 | the 1200 × 630 social card |
| `og-card.png` | 59,027 | generated from `og-card.svg` |
| `favicon.svg` | 791 | the folio mark, refined for 16px |
| `apple-touch-icon.svg` / `.png` | 645 / 1,016 | 180 × 180, full-bleed ink |
| `maskable-icon.svg` / `.png` | 646 / 3,099 | 512 × 512, mark inside the 60% safe area |

## The rules (what makes it a set)

1. **One grid.** Everything is drawn in 24-unit cells. `reg-mark` is a 1-cell mark, `reg-corner` is
   2 cells, the sheets in the pipeline are 168 × 238 (A4 proportion, 7 × ~10 cells), and the empty
   states are 240 × 168 (10 × 7 cells). Sizes that are not visibly tied to the grid still start or
   end on a cell edge.
2. **One stroke weight.** `stroke-width="1.5"` on the root of every illustrative file, inherited by
   its children. Ruled paper lines inside a sheet drop to `1` — the only second weight in the set,
   used only for content that is not structure.
3. **`currentColor` and `fill="none"`.** Every stroke takes the text colour of its host; nothing
   hard-codes a palette value except the social card and the icons, which render outside the page.
   Fills appear only where a fill is the point (the folio sheet's paper, the turned corner).
4. **Scalable.** `viewBox` on every file, no width/height coupling except where the file must render
   standalone (icons, OG card). Inline placements let the stroke follow the size; `reg-bullet` adds
   `vector-effect="non-scaling-stroke"` so a 24-grid drawing can be shown at 12px and still keep
   1.5px strokes.
5. **Decorative by default.** `aria-hidden="true" focusable="false"` on every illustrative file, and
   on every inline copy. Anything carrying meaning is accompanied by HTML text: the pipeline's stage
   names are its `<figcaption>`, the empty states' meaning is the SPA's heading and body, the
   security corner frames a list that reads completely without it.
6. **No text in SVGs.** The only exception is `og-card.svg`, which is a picture of the product and
   renders outside the type system. Everything a person might select is HTML.
7. **No animation.** Nothing animates on load or by default. No hover animation was added, so there
   is no `prefers-reduced-motion` branch to forget. The grain is a static layer.
8. **Contrast.** Ornaments are decorative and may sit at text-soft/hairline strength. The one piece
   that carries structure — the pipeline — is stroked in `currentColor` (17:1 on paper in the light
   scheme, 15:1 in the dark), and its meaning is also in the caption, so it is never ornament-only.

## Placement

| Art | Page | Purpose |
|---|---|---|
| `reg-mark` (inline, 24px) | `/` (between the cover band and "The flow") | a registration rule ends the hero and starts the reading; two hairline rules either side of the mark |
| `pipeline.svg` (inline) | `/how-it-works` | the pipeline figure above the six steps — "see the shape before the detail" |
| `reg-corner` (inline, 48px) | `/security`, inside `figure[data-flow]` in "At a glance" | proof corner on the flow sheet; in the normal flow above the three cards, so it cannot overlap them |
| `grain.svg` as a data URI | all five marketing pages | page-wide paper grain at 3% |
| `favicon.svg`, `apple-touch-icon.png` | all five marketing pages `<head>` | tab icon and iOS home-screen icon |
| `og-card.svg` / `.png` | not yet wired (needs an absolute URL — snippet below) | social preview |
| `empty-cvs`, `empty-proposals`, `empty-applications` | files only | SPA empty states; see "left for owners" |

Placement notes:

- Every inline mark inherits `currentColor`, so the set follows the theme with no second copy.
- The pipeline figure's caption is HTML: `01 ingest · 02 score · 03 tailor · 04 pack` plus one
  sentence. No stage name is inside the SVG.
- The corner ornament was deliberately **not** placed on the pipeline figure: the schematic already
  carries station marks and folio corners, and a third registration motif there competed with them.
- `/pricing` and `/about` have no body art in this pass. Their composition was being rewritten by
  another agent while the set landed; a decorative insertion during that rewrite is a merge, not a
  design decision. The grain, icon family and measure token apply to both.
- OG tags need an absolute URL and the pages' `<head>` is shared with the page owners, so the card is
  shipped and documented rather than guessed at:

```html
<meta property="og:image" content="https://<host>/assets/art/og-card.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
```

## The reading measure (the page-composition fix that shipped with this set)

`--measure-reading: 68ch` in `tokens.css`. Measured, not estimated: 1ch is 8.09px at the 15px
reading size, so 68ch is 550px and ~65–68 characters per line. At the 21px lede size (1ch = 11.33px)
the same 68ch is 770px and 62–72 characters. `ch` scales with the font, so one token covers prose,
step bodies and ledes. The marketing pages already referenced `var(--measure-reading, 58ch)`, so the
token is now the single value; 58ch measured 57–59 characters at 15px, hence the change.

| Page | Before | After | Longest line after |
|---|---|---|---|
| `/about` prose | 680px, 83–89 cpl | **529px, median 65, longest 68** | 73 (a one-line paragraph) |
| `/how-it-works` steps | 1,028px, 116–117 cpl | **550px, median 63–67, longest 68** | 73 |
| `/pricing` ledes | 657px (~52–61 cpl) | 770px cap (~62–72 cpl) | — (short intros) |
| `/security` "At a glance" | 3 cards of 352px | unchanged — the page owner's 3-column composition | 42 |

`/how-it-works` steps also became a real grid: fixed number-chip column (52px), heading column
(≥14rem), body at the measure. Measured alignment across steps 1–4: heading x = 248, body x = 552,
body width = 550 — identical on every step. The second paragraph is now a sub-note, set one size
down behind a `--line-meaning` rule, rather than a smaller paragraph doing the body's job.
One trap worth recording: the measure is applied to the **paragraph**, not to the grid track. `ch`
in a track resolves against the grid container's font size (17px), while the paragraph is 15px,
which made the track ~15% too wide.

## Grain

`grain.svg` is a 240 × 240 tile of `feTurbulence type="fractalNoise" baseFrequency="0.9"
numOctaves="3" stitchTiles="stitch"`, desaturated, applied through `body::after` as a fixed,
pointer-transparent overlay at `opacity: 0.03`, `background-size: 240px 240px`, and switched off in
print. The filter region is pinned to the tile edges in user space (`filterUnits="userSpaceOnUse"`),
so the noise is stitched at exactly the edges the CSS repeats.

**Seam proof (measured, not eyeballed).** The tile was drawn twice in each direction on a 480 × 480
canvas and the pixel difference across the tile boundary compared with the difference between
adjacent interior columns:

| Measurement | Mean absolute channel difference |
|---|---:|
| tile boundary (column 239 → 240) | **17.61** |
| interior adjacent columns | **22.80** |

A seam would show a spike at the boundary; the boundary is quieter than typical interior variation,
so there is no visible join. Screenshots: `screenshots/art-grain-seam-480x240.png` (tile at 100%,
2× device scale) and `screenshots/art-after-grain-strip-2880.png` (a 2× viewport-width strip of the
live page).

## Favicon family

The old mark had three 1.5px rules and a 0.75px fold edge; at 16px those became mush. The refined
mark keeps one bold sheet, the turned corner and **two** 2.2px rules, and adds a hairline keyline so
the ink square does not vanish on a dark tab bar. Verified at true 16px and 32px
(`screenshots/art-favicon-16-upscaled.png`).

- `favicon.svg` — 32-unit artboard, reads at 16.
- `apple-touch-icon.svg` / `.png` — 180 × 180, full-bleed ink, mark at 56%; iOS rounds it.
- `maskable-icon.svg` / `.png` — 512 × 512, mark inside the 60% safe area, no transparency.
- The PNGs are a headless-Chrome render of the SVG at its authored size, not a redraw.

The marketing heads now point at `art/favicon.svg` and add `apple-touch-icon`. `app/`, `sign-in`,
`sign-up` and `reset` still use `/assets/favicon.svg`; copying `art/favicon.svg` over it is a
one-line follow-up for its owner. The maskable icon needs a `manifest.webmanifest` that does not
exist yet.

## The social card

`og-card.svg`, 1200 × 630: ink ground, bone frame with corner registration marks, the wordmark,
the slogan at 78px serif, and one redline detail — a struck "Now" line in the error red, the
grounded rewrite in press green with its `[CV §2]` citation chip, and `NUMBERS PRESERVED · 18% · 2 · 2`.
The proof line "Nothing invented." closes the card. `og-card.png` is the render; see
`screenshots/art-og-card-render.png`.

Text is set in the system stacks (Sitka Heading → Palatino → Georgia; Segoe UI; Cascadia Code), so
the card renders the same way the site does on this machine without a font licence.

## Rejected

| Idea | Why not |
|---|---|
| A custom icon font or sprite sheet | A sprite cannot inherit `currentColor` per instance, and an icon font costs a request and a licence review for eight marks. Inline SVG is the whole point. |
| Raster texture (a PNG grain) | A PNG grain is 3–10× the bytes, has a fixed tile size that shows banding when scaled, and cannot be recoloured. The SVG turbulence is 838 bytes and theme-neutral. |
| A generic flow chart (rounded boxes and arrows) | That is the category's own diagram. Three sheets on a 24 grid, with station marks and a redlined margin, say what the product is. |
| Baking stage labels into the pipeline | Selectable text belongs in HTML; the caption is also what a screen reader reads. |
| A donut/ring "score dial" as an ornament | We removed exactly that from the hero: it implies an employer's verdict. The set has no gauges for that reason. |
| A heavy paper texture / sepia wash | The research files rule out faux paper: this product is used by someone worried about money, and nostalgia reads as unserious. Grain at 3% is the most that survives that test. |
| Animated marks (drawing crosses, pulsing targets) | Nothing on these pages earns motion by itself, and every animation needs a reduced-motion branch. Static marks; the site's only motion stays with state changes. |
| Two-column prose to fill the page width | It fixes width and breaks reading order. A measure plus a composed grid (heading column, figure column) is the fix, not narrower columns. |

## Left for owners

- **SPA empty states.** Files are shipped and the placement is a one-liner: `empty-cvs.svg` for the
  empty CV library (`/app/cv`, and the dashboard's "no CVs yet" card), `empty-proposals.svg` for the
  editor's proposal panel when nothing has been proposed, `empty-applications.svg` for `/app`'s
  "No applications yet" block. Render at 160–200px wide, `aria-hidden`, with the existing empty-state
  heading and body beside it — the illustration must never be the only thing that says what is
  missing. They expect a `<figure>`/`<div>` inside the existing `.empty`-style block; I did not
  invent a class for another owner's markup.
- **`/pricing` and `/about` body art** — reserved, see above.
- **OG meta tags** — snippet above; needs the production host.
- **`app/`, `sign-in`, `sign-up`, `reset`** — favicon and grain not applied; those heads belong to
  their owners and were mid-pass.

## Verification

| Check | Result |
|---|---|
| `node scripts/check.js` | **10 pages, 24 server modules, 248 CSS classes — 0 errors, 0 warnings** |
| Pages live | `/`, `/how-it-works`, `/pricing`, `/about`, `/security` → 200 |
| Art assets live | every file under `assets/art/` → 200 as served |
| Horizontal overflow | **0 px** on all five pages at 1440 and 375, light and dark |
| Grain seam | boundary 17.61 vs interior 22.80 (see above) |
| Measure | `/about` 529px, median 65 / longest 68; `/how-it-works` 550px, median 63–67 / longest 68 |
| Console | no exceptions or errors on any captured page |

Screenshots: `art-before-*` and `art-after-*` for all five pages at 1440 and 375 in both schemes
(20 each), `art-set-preview.png` (every mark at its intended size), `art-og-card-render.png`,
`art-favicon-16-upscaled.png`, `art-grain-seam-480x240.png`, `art-after-grain-strip-2880.png`,
`art-security-glance-1440.png`.

### Concurrency note

`/pricing`, `/about` and `/security` were being rewritten by the page-composition owner during this
pass (`security.html` at 11:53, 11:57 and 11:58). One of my edits to `/security` landed while its
`<figure data-flow>` was being restructured; the opening tag was restored by that owner, and the
ornament now sits inside the restored figure as agreed. If those pages move again, the placement
rows above are the contract: the mark is inline and decorative, and the page renders correctly
without it.
