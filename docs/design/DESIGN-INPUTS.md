# DESIGN-INPUTS — one direction, measured pairs, and the work left

Synthesis of the four research files, read against [`SPEC.md`](../SPEC.md) and the shipped
`tokens.css`, `theme.css`, `site.css` and `motion.css`. Every ratio below was recomputed on
28 October 2026 from those files with the WCAG relative-luminance formula
([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). Thresholds: 4.5:1
for text, 3:1 for large text and for anything identifying a control or state. Computed ratios are
not rounded.

## 1. The aesthetic: the Docket

Keep Meridian's ink and bone, its serif/sans/mono trio and the green re-key; change only the layout
vocabulary, so the site reads as the thing it produces — a numbered, ruled, dated sheet — not a
picture of software. Bone becomes the default surface with one dark cover band per page instead of a
dark half. The measure stays 62ch, every block carries a folio (`§02 · PACK`) where `.eyebrow` sits,
rhythm comes from hairlines and meaning from a 48% ink rule, and the hero is one A4 specimen at
210×297 with 18mm margins and the findings as margin notes. Green appears only on a verified stamp,
a filled measure, a link and the focus ring. It is the only direction that is a layout change rather
than a replacement system, and it repeats the container's own claim: the pack is a single-column A4
page in system fonts (`SPEC.md` §5).

**Three borrowings from the runners-up.** From Working Proof: the *evidence trace* — source line and
rewrite side by side with the surviving facts marked, run once, complete when motion is off. From
"type like a marked CV": old-style figures in prose, tabular figures on scores, prices and dates.
From the repos file: Resume-Matcher's report order — one number, matched and missing keyword lists,
then per-finding detail. Nothing else travels: no hosted fonts, no `--color-*` layer.

### Where the files disagree

| Disagreement | Winner | Why |
|---|---|---|
| Docket (aesthetic) vs Working Proof (`DIRECTION-codex.md`) | Docket | Working Proof swaps palette, type and radii for a parallel `--color-*` system and three hosted faces, against the pack's own system-font rule |
| Is there a dark palette? | `tokens.css` on values, `RESEARCH-darkmode.md` on the defect | The measured dark block exists; nothing sets the attribute, so it is unreachable |
| Dark accent `#6cc6a4` vs shipped `#56d7a6` | Shipped | 8.33:1 against 9.48:1: both pass; re-measuring risks a regression for no gain |
| 45% ink (aesthetic) vs 48% `--line-meaning` | 48% | 45% measures 3.11:1 on `--paper`, 3.05:1 on `--bone`; 1.4.11 does not round |
| Scroll reveal: keep, retire, delete | Delete | It delays the reading it decorates; a scroll-triggered reveal is motion from an interaction ([2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)) |

Radii and type follow the same rule: 2px sheets on marketing blocks, shipped `--r-sm`/`--r-md` on
controls, system stacks over three hosted faces.

## 2. Tokens, light and dark

Existing names; existing values wherever they already pass. Light values are restated unchanged so
today's theme cannot regress.

| Token | Light | Light ratio | Dark | Dark ratio | Pair |
|---|---|---:|---|---:|---|
| `--paper` | `#fffdf8` | — | `#191c22` | — | page, cards |
| `--bone` | `#f5f2ea` | — | `#121419` | — | recessed band |
| `--ink` | `#0b0c0e` | — | `#08090b` | — | frozen cover band |
| `--text` | `#14161a` | 17.82:1 | `#f4f1e8` | 15.11:1 | on `--paper` |
| `--text-soft` | `#4a4f57` | 8.11:1 | `#c6cad2` | 10.39:1 | on `--paper` |
| `--text-muted` | `#59606e` | 6.22:1 | `#a6acb6` | 7.47:1 | on `--paper` |
| `--text-invert` | `#f5f2ea` | 17.49:1 | `#f5f2ea` | 17.81:1 | on `--ink` |
| `--accent` | `#0f6b4f` | 6.38:1 | `#56d7a6` | 9.48:1 | on `--paper` |
| `--on-accent` | `#ffffff` | 6.49:1 | `#06130d` | 10.54:1 | on `--accent` |
| `--accent-ink` | `#0a4c38` | 9.82:1 | `#8fefc6` | 12.46:1 | prose links |
| `--accent-soft` | `#e2efe9` | 15.32:1 | `#102a21` | 13.52:1 | `--text` on card |
| `--ok` `--warn` `--err` | `#0f6b4f` `#8a5108` `#a32018` | 6.38 / 6.33 / 7.44 | `#5fd99b` `#efb45f` `#ff918a` | 9.66 / 9.23 / 7.86 | on `--paper` |
| `--line` | `#e2e0dc` | 1.30:1 | `#383a3e` | 1.50:1 | rhythm only |
| `--line-strong` | `#c9c8c5` | 1.65:1 | `#757676` | 3.75:1 | **light fails 3:1** |
| `--line-meaning` | `#8a8988` | 3.43:1 | `#7c7c7c` | 4.09:1 | controls, states |
| `--focus` | `= --accent` | 6.38:1 | `= --accent` | 9.48:1 | ring; `--lime` 15.64 on `--ink` |
| `--mark` *(new)* | `#0b0c0e` | 19.25:1 | `#e8e6e1` | 13.68:1 | ink-on-paper parts |

The line rows are alpha composites: 12/22/48% ink over `--paper`, 14/42/45% cream over dark
`--paper`. Compositing to the nearest 8-bit channel shifts a ratio by up to 0.2, which is why these
differ slightly from the comments in `tokens.css`. Three fixes follow. An empty field is identified
only by its boundary, and `.input` uses `--line-strong` at 1.65:1 — move it to `--line-meaning`.
`.btn--primary` hardcodes `--btn-fg: #fff`, which is 1.80:1 once the dark accent is the background —
point it at `--on-accent`. And `--mark` replaces `--ink` in the ink-on-paper parts — logo ring, nav
bars, card icons, the light button, the featured pill, `#app-menu` — because `--ink` on a dark page
is 1.08:1 and the logo strokes vanish.

## 3. Motion

Four durations and three curves exist; nothing new is needed. Motion that fits no row here is
decoration.

| Motion | Duration | Easing | Use | Reduced-motion rule |
|---|---|---|---|---|
| State change | `--dur-xs` 120ms | `--ease` | Colour, border, icon swap | Colours change at once; colour is not motion |
| Disclosure | `--dur-sm` 180ms | `--ease-enter` | `.nav__mobile`, `.faq` | Opens in final position, no travel |
| Overlay | `--dur-md` 260ms | `--ease` | `#app-toast`, dialogs, theme swap | Appears instantly, no fade |
| Page entrance | `--dur-lg` 560ms, 55ms stagger | `--ease` | Hero, `.page-head`; once per load | Omitted; content present at first paint |
| Evidence trace | `--dur-lg` 560ms, 55ms offsets | `--ease-enter` | Source-to-rewrite connector, fact underlines | Rendered complete |
| Score change | `--dur-md` 260ms | `--ease` | Ring and number when a report replaces a score, never on load | New value replaces old; live region announces |

Retire with no replacement: the 620ms `.reveal`, the 900ms ring draw, the 220ms card lift and the
2.4s infinite `.pill--live` pulse. That pulse starts automatically, runs over five seconds and has
no pause control ([2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)) —
delete it rather than add one.

## 4. Component rules

| Component | Classes | Rule |
|---|---|---|
| Nav | `.nav`, `.nav__inner`, `.brand`, `.skip`, `.nav__actions` | Hairline base, 68px, no shadow. Current page: 2px `--line-meaning` with `aria-current`, never hue alone. `.brand__mark` strokes `--mark` |
| Hero | `.hero`, `.hero__inner`, `.hero__sub`, `.sheet` | No `.hero__grad`; one ink band. `.mock` becomes `.sheet`: 210×297, 18mm margins, findings as margin notes, no chrome |
| Cards | `.card`, `.card__kicker`, `.bento`, `.aw-card` | Marketing cards: `--r-sheet` 2px, hairline, no shadow; `.aw-card` keeps `--r-md`. Kicker becomes a folio. No lift unless the card is a link |
| Tables | `.table-wrap`, `table.compare`, `.aw-table`, `.aw-cell-num` | Rules only, no zebra. Mono `thead`. `tabular-nums` on numeric cells. `td.yes` carries a word or mark, not only `--ok` |
| Forms | `.form`, `.field`, `.input`, `.note`, `.aw-status`, `.form-errors` | One column. Label above, hint via `aria-describedby`. Error summary above the first field even for one error. Boundary `--line-meaning` |
| Empty states | `.aw-empty`, `.aw-empty__title`, `.aw-empty__body`, `.aw-loading`, `.aw-error` | What is missing, why, and the one action. Name the failing source. Never a dead end |

New classes ship with their rule in `site.css`, or `scripts/check.js` flags them as undefined.

## 5. Licences to respect

| Borrowed | Licence | Obligation |
|---|---|---|
| [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend/blob/main/LICENSE.txt) error summary | MIT, Crown Copyright 2017 | Notice kept; behaviour only, not its palette |
| [Open Props](https://github.com/argyleink/open-props/blob/main/LICENSE) breakpoints | MIT, Adam Argyle | Notice travels with the block |
| [Lucide](https://github.com/lucide-icons/lucide/blob/main/LICENSE) icons | ISC; MIT for the Feather subset | A listed icon needs both notices |
| [Resume-Matcher](https://github.com/srbhr/Resume-Matcher/blob/main/LICENSE) report layout | Apache-2.0 | Licence and `NOTICE` kept; changed files stated |
| [axe-core](https://github.com/dequelabs/axe-core/blob/develop/LICENSE) | MPL-2.0 | Dev dependency only, never in `public/` |
| [Newsreader](https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/OFL.txt) | SIL OFL 1.1 | Only if a house serif is bought |
| Recent, Land-book, Refero, Mobbin | All rights reserved | Reference only, captures in `docs/design` |
| WCAG, MDN, Typewolf | W3C licence, CC BY-SA 2.5, reference | Quote with attribution |

No GPL or AGPL component enters the served bundle. Pin a tag, not a branch.

## 6. Eight changes, in order

Defects first, then direction: 1–4 are failures, 5–8 are the aesthetic.

| # | Change | File |
|---|---|---|
| 1 | Field boundary to `--line-meaning` (1.65:1 today; 1.4.11 wants 3:1) | `site.css` |
| 2 | `.btn--primary` to `--on-accent`; `.btn--light`, `.card__icon`, `.brand__mark .m-ring`, `.nav__toggle span`, `.price-card--featured`, `#app-menu` to `--mark` | `theme.css` |
| 3 | Ship `theme.js` in `<head>`, two `media`-scoped `theme-color` metas in eight heads, a toggle in `.nav__actions` — or delete the dark block | `assets/theme.js`, `*.html`, `partials/nav.html`, `tokens.css` |
| 4 | Contrast assertions plus axe-core as a dev dependency; drop the dead `SPEC-V2.md` references | `scripts/check.js`, `package.json`, `tokens.css` |
| 5 | Delete `.hero__grad`; `.mock` becomes the A4 `.sheet` with margin notes and the trace | `index.html`, `site.css` |
| 6 | Delete `.reveal`, ring draw, pulse, card lift; keep one entrance; add the trace | `motion.css`, `site.js` |
| 7 | `--r-sheet: 2px` on marketing cards; folio eyebrow; `tabular-nums`; delete `--r-xl` | `tokens.css`, `site.css` |
| 8 | Fold the five `.code` hexes and the `.nav` `rgba(255, 253, 248, 0.94)` into scheme pairs | `site.css` |

---

1. Fix the three failing pairs in one commit: field boundary to `--line-meaning`, primary button
   foreground to `--on-accent`, `--mark` for the ink-on-paper parts.
2. Decide the dark palette this week: ship `theme.js` with the two `theme-color` metas, or delete
   `:root[data-theme="dark"]`. Leaving it unreachable costs twice.
3. Add the §2 ratios to `scripts/check.js` as unrounded assertions, then run axe-core over all eight
   pages before visual work starts.
4. Rebuild the hero around the A4 sheet and the evidence trace, deleting `.hero__grad`, the `.mock`
   chrome and the 900ms ring draw in the same change.
5. Cut motion to the six rows in §3, and delete the pulse rather than giving it a pause button.
