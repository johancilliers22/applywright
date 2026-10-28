# PAGE COMPOSITION — /pricing, /about, /security

Composition pass, 28 October 2026. Scope: `public/pricing.html`, `public/about.html`,
`public/security.html`, plus this record. `index.html`, `how-it-works.html`, `site.css`,
`motion.css`, `app/**` and `server/**` were not touched.

Every number below was measured in Chromium at 1440×900 (also 768 and 360) against the running
server on `127.0.0.1:3160`, with the light and dark palettes. Method is stated with each table.

---

## 1. The reading measure

**Value: 58ch.** It is consumed as a token with a fallback, in each of the three pages:

```css
.lede,
.prose p,
.prose ul,
[data-measure] {
  max-width: var(--measure-reading, 58ch);
}
```

`ch` scales with the font, so one value holds across both reading sizes:

| Text | Size | Resolves to | Rendered first-line characters |
|---|---|---|---|
| Body prose | 15px (`--fs-reading`) | 469px | 64–75, median 64–70 |
| Lede | 21px (`--fs-lg`) | 656.6px | 61–72, median 65–68 |
| Step detail | 15px | 469px | 66–76, median 72 |

Characters counted from the rendered first line (caret at the right edge of line 1, then the
collapsed text before it), not from `ch` arithmetic. Minimum values are single-line paragraphs;
maximum values are lines dominated by narrow glyphs (`i`, `l`, `.`, `·`), where more than 72
characters fit the same 469px. That is normal proportional-text variance: the measure is fixed,
the line fill is not.

Also required for the measure to hold: `.section-head` carries its own 68ch cap, which is narrower
than the lede at 58ch, so it was overridden to `max-width: none` on these three pages. Without it
the lede is clamped to 623px and lands at 59–65 characters.

**Handoff to design-lead:** drop the two rules above into `site.css` when the site-wide
`--measure-reading` lands, then delete the three page copies. The token value I measured against
the 65–72 brief is **58ch**; the pages pick up a different value with no markup change.

### Before → after, longest prose block (1440)

| Page | Before width | Before chars/line | After width | After chars/line (median) |
|---|---|---|---|---|
| `/pricing` (lede) | 701.9px | 72 | 656.6px | 65 |
| `/about` ("Why it exists") | 549.8px | 81 | 469px | 70 |
| `/security` (body prose) | 549.8px | 81 | 469px | 64 |
| `/security` (lede) | 701.9 / 623.2px | 72 / 64 | 656.6px | 66 |

Your table listed 640/85, 430/55 and 480/62. Those widths predate the `site.css` reading-size
change (`.prose`, `.small` and step text moved to 15px/1.6 at 11:23 that day); re-measured at the
time of this pass, the "before" blocks were 550px at reading size and 702px for ledes. Both sets of
numbers agree on the diagnosis — the three pages were not on one measure — and the fix is a single
value now measured, not estimated.

---

## 2. The four structural fixes

### 2.1 `/security` — the four steps, out of the ribbon

| | Before | After |
|---|---|---|
| Layout | one column, 480–550px, number chip absolutely positioned | 2×2 band at ≥1000px, cells 524px |
| Steps height (grid) | 687.5px | **394.1px (−43%)** |
| Step cell heights | 189.8 / 142 / 93.6 / 166.1 | 196.9 / 196.9 / 173.2 / 173.2 |
| `#apply` section height | 1,570.4px | **1,152.2px (−27%)** |
| Number alignment | 2.2rem chip, `top: -0.15rem`, box-centred | flex `align-items: baseline`, real elements |
| Section wrap | 760px (content ≈ 60% empty to the right) | 1,160px |

Numbers kept, order kept (row-major 01→04). The chip became a mono number beside the heading on
one baseline; measured line-box bottom delta is 2.1px, which is the font-size difference between
the 14px number and the 16px heading — the baselines coincide, which is what the brief asked for.
The remaining width is used by "Why the last step is yours" (prose) beside the approved-and-ready
note.

A single number/heading-left + detail-right column was implemented first and did **not** halve the
height once the measure was applied: the detail column narrows to 469px, so the same text takes
the same number of lines and only the heading row is saved. A single row of four would put the
detail at ~34 characters, outside the measure. The 2×2 band is the shape that satisfies all three
constraints (order as content, measure respected, width used).

### 2.2 `/about` — "Why it exists" no longer sits beside nothing

| | Before | After |
|---|---|---|
| Section wrap | 760px | 1,160px |
| Prose column | 549.8px | 529.2px (text 469px) |
| Right column | empty | 478.8px constraint figure |
| Section height | 668.2px | 1,109.3px |
| Page height | 3,603px | 4,461px |

The section is now the same shape as the "what that rules out / what that leaves" block further
down: prose on the left, a stacked card figure on the right. The figure is "How this is built":
three constraints (grounded rewrites, no auto-submission, data exportable), each with one line of
evidence and a link to `/how-it-works` or `/security`. It is a stacked figure rather than three
columns because three columns inside a 479px column would be ~150px each — the measure does not
survive that, and the brief for this pass put the figure beside the prose.

### 2.3 `/security` — the data-flow figure and the retention table

New section `#glance` immediately after the page head: a `<figure>` containing

* an ordered list of three nodes — your browser → this server → what leaves the server;
* a `<ul>` strip of what is never stored, never sent and never readable;
* a `<figcaption>` pointing at the retention table lower on the page.

Rendered at 1440: figure 405.7px tall, three nodes 1:1:1, connectors drawn as rules between cards
(no glyph arrows, so a text-only reader does not see `→`). At 360 it stacks to one column. The
retention table is unchanged in content (13 rows) and now sits at full 1,080px width, 868.5px tall,
with its caption and `scope="col"` headers intact.

**List or table (the question from review).** The flow is an ordered list: three nodes where the
order is the meaning (browser → this server → outbound), and a table would imply three columns to be
compared rather than a direction to be followed. The exclusions are a definition list: three
label/clause pairs, not rows. The "what / where / lifetime" matrix is a table and already exists in
`#your-cv` — 13 rows, caption, `scope="col"`, full width — so the page has exactly one table for the
one thing that is genuinely a matrix, and lists for the things that are sequences and pairs. The
figure's caption is the bridge: it points at the table rather than duplicating it.

**Ornament slot:** design-lead's `public/assets/art/` set has since landed (16 files, and the
registration corner renders in this section). The figure ships as semantic HTML/CSS with the slot
marked in a comment, so an ornament can be added inside it without changing the structure. Nothing in
the figure depends on the art.

**Figure restored after review.** A concurrent art edit at 11:53 removed the opening
`<figure data-flow>` tag and the slot comment but left the children and the closing tag, so the browser
rendered the flow as a plain nested list and lost the card styling. The opening tag and slot comment
were restored at 11:58; the figure, the three node cards and the connectors render again at every
width. The `screenshots/final-security.png` in the repo was captured from that intermediate state, so
its glance section is superseded by `fix-security-glance-light.png` / `-dark` / `-360`.

### 2.4 `/pricing` — comparable cards, a real control, a marked recommendation

| | Before | After |
|---|---|---|
| Card heights | 498.9 / 474.9 / 407.7 | 502.3 / 502.3 / 502.3 |
| Price row top | 905.3 / 905.3 / 905.3 | 997 / 997 / 997 |
| List top | 1,002.3 / 1,002.3 / 1,002.3 | 1,094 / 1,094 / 1,094 |
| CTA top | 1,258.3 / 1,234.3 / 1,167.1 (91.2px spread) | 1,350 / 1,350 / 1,350 (**0px spread**) |
| Page height | 4,227px | 4,169px |

Alignment is `grid-template-rows: subgrid` at ≥900px, so kicker, price, note, list and CTA share
five row tracks across the three cards. Browsers without subgrid get the previous flex cards; the
layout still reads, the CTAs no longer align.

**Annual/monthly is a working control, with no JavaScript:** a `<fieldset>` of two radios styled as
a segmented control, driving the cards and the comparison table's price row through `:has()`.
Because it is gated on `@supports selector(:has(*))`, the control is only rendered where it works;
where it is not supported the fieldset is hidden and both intervals are stacked in each price cell —
the honest fallback specified in the brief, not a fake toggle. Verified by clicking the labels:
monthly → `£0/£19/£49 a month`, annual → `£0/£190/£490 a year`, in both palettes, on the cards and
in the table; keyboard focus draws a 2px ring on the label. The only reference to the control from
the copy is its own legend; no sentence was added to explain it.

Recommendation: Pro is marked in the card (`Recommended` badge) and in the comparison table, where
the Pro column header carries the badge and the whole column is tinted `--accent-soft`. The table
keeps the rows the page already had (dailyDigest has left the plan model in schema 3, and the
capability flag list has since been cut to the three a handler gates in `64edb96`, leaving
Scale a quota tier rather than a feature tier), `font-variant-numeric: tabular-nums` on all cells, a caption, and `scope="col"` on every
header.

### 2.5 The two review defects

1. **The exclusions ran together in text.** As bullets with a `<strong>` label, the label and the
   clause were separate only because of `display: block`; in text extraction, screen readers and
   copy-paste they read `Never storedThe uploaded file…`. They are now a definition list
   (`<dl data-never>` with three `<div>` groups, `<dt>` label and `<dd>` clause) and the colon lives
   in the markup: `Never stored: The uploaded file…`. Rendered, the label sits on its own line above
   its clause; copied, it reads as a label. Verified at 360, 768 and 1440 in both palettes: the `dl`
   is `display: grid` with three columns at ≥760 and one at 360, and copy-paste text reads
   `Never stored: The uploaded file: decoded in memory, read, discarded. Never sent: …`.
2. **The retention link no longer carries the sentence.** The figcaption is now two parts: the
   sentence `Read from the code in server/.` and a standalone `Jump to the retention table` link on
   its own line (`.link-arrow`, `justify-self: start`), so no phrase doubles as a destination. The
   link points at `#your-cv`, where the table is.

---

## 3. Rhythm

One rule set for the three pages, rather than per-section guesses:

| Measurement | 1440 | 768 | 360 |
|---|---|---|---|
| Page-head padding (top / bottom) | 72 / 28 | 46 / 28 | 44 / 28 |
| Dead band: last page-head text → first section text | **85** | **85** | **85** |
| First section under the page head, padding-top | 56 | 56 | 56 |
| Other sections, padding-block | 96 | 56 | 56 |
| Section head → first content block | 52 | 40 | 32 |
| Block → block inside a composed section (`[data-block] > * + *`) | 32 | 32 | 32 |
| Two-column gaps (`[data-pair]`, `[data-billing-cols]`) | 24 row / 32 col | 24 / 32 | single column |
| List item gaps | 12–14 | 12–14 | 12–14 |

The 85px dead band is the same on all three pages at all three widths. On `/security` it was
106px before this pass, measured from the last line of the lede, because the "On this page" row sat
flush against it (0px gap, 14px type) and read as the paragraph's last line. The row is now
`margin-top: 24px`, `padding-top: 16px`, a 1px rule above it, and 12px type — so the head's last
*text* is the navigation, and the 85px runs from the navigation to the section. The same
`on this page` pattern was added to `/pricing` (Plans · Compare · Billing) and `/about` (Why it
exists · Position · Principles · Contact) so the three pages share it.

Before: `/pricing` and `/about` had page heads of 357.7px and 390.2px with no navigation; `/security`
had 429.1px with a flush row. After: 426.1px, 458.7px and 476.5px respectively — the extra height is
the ruled navigation row (36.4px on pricing), not padding.

---

## 4. Verification

Run from `projects/applywright`:

| Check | Command | Result |
|---|---|---|
| Static check | `node scripts/check.js` | **0 errors, 0 warnings** (10 pages, 24 server modules) |
| Pages 200 | `Invoke-WebRequest` on `/`, `/how-it-works`, `/pricing`, `/about`, `/security`, `/sign-in`, `/sign-up`, `/app`, `/editor` | 200 on all nine |
| Horizontal overflow | `document.documentElement.scrollWidth - innerWidth` at 360/768/1440, light and dark | **0 on all three pages, all six combinations** |
| Heading order | collect `main h1..h4`, assert no level skipped | valid on all three: `H1 H2 H3 H4 H4 H4 H2 H2 H3…`, no skips |
| Tables | `caption` present, every `th` has `scope` | 3 tables: pricing 1 (4 `col` headers, 9 rows), security 2 (3 `col` each; 13 and 4 rows) — all compliant |
| One h1 / one main | DOM counts | 1 / 1 on all three |
| Switch | click both labels, read the visible amounts | monthly and annual both correct, cards and table, both palettes |
| Form controls | every `input`/`textarea` resolves a label; every button and link has a name | all labelled; the two radios are implicitly labelled `Monthly` and `Annual, ten months for twelve`, the fieldset legend is `sr-only` (1×1), no unnamed button or empty link |
| In-page anchors | every `href="#…"` resolves to an element | pricing 4/4, about 4/4, security 9/9 (all new anchors included) |
| Both palettes | `window.applywrightTheme.set('light'/'dark')` before measuring | measured and captured; no overflow or layout change |

The after set is in the repo: `screenshots/final-pricing.png`, `final-about.png`, `final-security.png`,
`final-how.png` (Lead's captures), with design-lead's art-comparison set beside them. Note that
`final-security.png` predates the figure restoration in §2.3, so the current glance section is
evidenced by the `fix-security-glance-{light,dark,360}.png` crops.

Earlier full-page captures and section crops are in
`C:\Users\johan\AppData\Local\Temp\applywright-composition\` (outside the repo, because the write
scope was the three pages and this document):

* `pricing-{360,768,1440}-{light,dark}.png` — 6
* `about-{360,768,1440}-{light,dark}.png` — 6
* `security-{360,768,1440}-{light,dark}.png` — 6
* crops for the four fixes: `review-pricing-plans-*`, `review-about-why-*`,
  `review-security-glance-*`, `review-security-apply-*` (light, dark and 360 where useful)

Re-measured after design-lead's ornament and art pass (11:53–11:58) and after the figure restoration:
`/pricing` 4,103px, `/about` 4,363px, `/security` 12,352px tall at 1440 light; horizontal overflow
still 0 at 360, 768 and 1440 in both palettes, and the section rhythm in §3 is unchanged.

Regenerate by running the server on port 3160 and repeating the Playwright calls: set the viewport,
`window.applywrightTheme.set(theme)`, wait for `document.fonts.ready`, then
`page.screenshot({ fullPage: true })`; scroll the element into view before element screenshots.

---

## 5. What could not be done, and the honest alternatives

1. **A JavaScript toggle was not available** (no scripts may be added to the marketing pages in this
   pass, and inline script is blocked by the CSP and by `scripts/check.js`). Solved with radios and
   `:has()` in page-scoped CSS, gated on `@supports selector(:has(*))`, with the both-intervals
   stacked fallback where `:has()` is absent. Nothing is faked: on an unsupporting browser there is
   no control at all, only the prices.
2. **No ornament set.** `public/assets/art/` has not landed; the flow figure ships with the slot
   marked. Its structure does not depend on the art.
3. **The measure is repeated in three `<style>` blocks** because `site.css` is owned by polish-aw
   during this pass. Two rules (the measure, the `.section-head` unclamp) should move to `site.css`
   and the copies be deleted; the token hook is already in place.
4. **The three-column figure became a stacked figure beside the prose** for `/about`, per the
   newest brief ("put the three constraints figure beside it"), because three columns inside 479px
   cannot hold the measure.
5. **The band of four became a 2×2 band** for `/security`, for the two reasons in §2.1. Step
   numbering and order are unchanged.
6. **Some labels are new copy.** The glance section's eyebrow, heading, lede and figcaption and the
   three "never" labels; the about figure's heading, three evidence lines, link labels and caption;
   the three page-index labels; the switch labels and the "Recommended" badge; two `<h3>` labels in
   the pricing billing section. No paragraph of body prose was rewritten — the rest is the existing
   copy, moved.
7. **Mobile does not hold the measure**, and cannot: at 360px the column is 320px, which is 38–52
   characters. The measure applies from 768px up (609px lede, 469px prose at 768; 656.6px / 469px
   at 1440).
8. **Out of my scope, noticed while measuring:** `partials/footer.html` says "Prices include any
   applicable tax", while `docs/SPEC.md` §2 and the pricing page say prices exclude VAT. Also
   `index.html` and `how-it-works.html` are still on their own measures (design-lead owns the
   pipeline page; index is design-lead's too).

---

## 6. What changed in each file

* `public/pricing.html` — one page-scoped `<style>` (measure + page index + switch + subgrid
  alignment + recommendation marking + tabular numbers + two-column billing row); page-index nav;
  section ids `plans`, `compare`, `billing`; billing switch; prices as `[data-amount]` pairs;
  Pro marked in card and table; billing section head gained the plan-changes sentence as its lede;
  meta description corrected from "include any applicable tax" to "exclude VAT" (matching the lede
  and SPEC §2).
* `public/about.html` — one page-scoped `<style>` (measure + page index + split top-alignment +
  block rhythm + constraint figure); page-index nav; section ids `why`, `position`, `principles`,
  `contact`; "Why it exists" widened to `.wrap` with its prose beside the new "How this is built"
  figure; position/principles/contact heads moved into a consistent `section-head` above their
  content; `.section--dark .prose p` colour fixed for the dark palette.
* `public/security.html` — one page-scoped `<style>` (measure + page index + flow figure + step
  band + pair grid + block rhythm + two-column account list + advisory measure); every `wrap--narrow`
  widened to `wrap`; new `#glance` flow figure; steps as a 2×2 band; the seven prose sections
  recomposed as head + `[data-pair]`/grid blocks so the width is used; retention table at full
  width; page index 12px with a rule, and gains "At a glance".
