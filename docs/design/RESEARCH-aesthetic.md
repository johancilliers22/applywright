# Aesthetic direction: the Docket

**Recommendation.** Make the site look like the thing it makes — a numbered, ruled, dated sheet — instead of a picture of software. Keep the Meridian system as it stands: ink and bone, the serif/sans/mono trio, and the green re-key in `theme.css` (`--accent: #0f6b4f`). Change only the layout vocabulary: **the Docket**, where every page is a sheet in a case file.

## What the site does now

`index.html` opens on a dark hero with two radial gradients (`.hero__grad`) and a browser-chrome mock (`.mock`); the rest of the site runs on 18px cards (`--r-lg`), pill buttons, and a three-column bento shared by `/` and `/how-it-works`. That vocabulary is generic SaaS; it would fit a CRM or a helpdesk equally well. The direct competitors are sold on a match percentage and a list of missing keywords ([market research](../research/market.md)), so those are category furniture too. A Docket is the record of a search, not a dashboard about one. The mock is also inaccurate: it shows a chat with "Before"/"After" bubbles, and no screen in the specification is a chat ([SPEC §7](../SPEC.md)).

Two existing details already point the right way — the mono eyebrow with its hairline rule (`.eyebrow`) and the honest stat band ("5 / 3 / 0 / 6"). Those are document conventions, not dashboard ones.

## Why "document" is the truthful metaphor

The product's output is a single-column A4 page, 18mm margins, system fonts, no layout tables ([SPEC §5](../SPEC.md)). Applicant tracking parses CVs linearly, and column layouts plus header-only contact blocks defeat that reading order ([ATS research](../research/ats-reality.md)). So the strongest visual asset is the artefact itself: show the page at the page's own proportions. Choosing paper conventions is not nostalgia here; it is the product's evidence.

Legibility has to survive that choice. Meridian's hairlines can only ever be decorative, and the measurements say why: `--line` (12% ink) composites to **1.30:1** on paper and bone, `--line-strong` (22%) to **1.65:1** on paper. Anything carrying state or marking a control boundary needs 3:1 ([WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)); that takes **45% ink — 3.35:1 on paper, 3.29:1 on bone**. The type palette passes comfortably: `--text-muted` at 6.22:1 on paper, 5.65:1 on bone; `--accent` at 6.38:1 and 5.80:1; white on `--accent` at 6.49:1 ([WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) requires 4.5:1).

## The rules

| Rule | What it means in practice | Existing surface it touches |
|---|---|---|
| **One sheet, one measure** | Bone as the default surface, 62ch measure, one dark cover band rather than a dark half-page | `.section--bone`, `.measure`, `.hero` |
| **A folio on every block** | `§02 · PACK` where `.eyebrow` sits now; figures in tabular numerals so columns line up ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric)) | `.eyebrow`, `.card__kicker`, `.stat__value` |
| **Rules, not boxes** | Hairlines for rhythm, 45% ink rules for anything that means something, 2px radii, no drop shadows | `.card`, `.bento`, `--r-lg` |
| **State is a stamp** | Rectangle, mono, uppercase, dated (`PACK READY · 28 OCT`); label plus rule, never hue alone ([WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)) | `.chip`, `.pill`, status colours |
| **The artefact is the hero** | An A4 specimen at 210×297, margin notes carrying the findings | `.mock`, `.mock__body` |
| **One green means verified** | `--accent` only on the filled measure, the stamp rule, focus rings and links — never gradients or dividers | `--accent`, `.hero__grad`, `.auth__aside::before` |

## Keep, replace, retire

| Decision | Items |
|---|---|
| **Keep** | Ink/bone palette, display serif, `--mono`, `.eyebrow`, `.measure`, stat band, `.note`, focus ring, reduced-motion block |
| **Replace** | `.hero__grad` → one ink cover band; `.mock` browser chrome → A4 specimen; `.card` shadows → ruled blocks; `.bento--3` → ruled three-column set; pill buttons → rectangles |
| **Retire** | Radial glows in `site.css` and `auth.css`, the chat bubbles, the unused `--r-xl` token, runtime scroll-reveal on prose |

## Typefaces

Keep the system stacks. The pack is deliberately system-font ([SPEC §5](../SPEC.md)); a site set in a face the artefact cannot use weakens its own claim, and costs a licence and a payload. If a house serif is wanted later, the only two I would sanction are [Newsreader](https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/OFL.txt) and [Source Serif 4](https://raw.githubusercontent.com/adobe-fonts/source-serif/release/LICENSE.md) — both SIL Open Font License 1.1, self-hosted with `font-display: swap` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display)). Do not buy a display face for this. Current editorial practice is a serif against a grotesque and often a mono — Typewolf's Site of the Day shows exactly that pairing ([Heart & Soil](https://www.typewolf.com/site-of-the-day/heart-and-soil), [index](https://www.typewolf.com/)) — and Meridian already has those three roles.

For print, `@page` sets size and margins, but its margin boxes are unevenly supported, so page furniture must degrade rather than depend on them ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@page)).

## What not to do

No faux-paper texture, sepia wash, typewriter face, tilted rubber stamp or "CV paper" skeuomorphism. The person using this is worried about money; nostalgia reads as frivolous and a gimmick reads as a risk. `.grain` is already at that edge — keep it on dark only. Keep motion to state changes; site.js already adds `.reveal` at runtime, and a reveal animation delays the reading it is decorating.

## Evidence and licences

| Source | Supports | Licence |
|---|---|---|
| [SPEC](../SPEC.md) | A4, 18mm, single column, system fonts, screens | Internal |
| [ATS research](../research/ats-reality.md) | Linear parsing, column penalty | Internal |
| [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) | Contrast, non-text contrast, colour | W3C document licence |
| [MDN: `font-variant-numeric`](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric), [`@page`](https://developer.mozilla.org/en-US/docs/Web/CSS/@page), [`font-display`](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display) | Mechanisms | CC BY-SA 2.5 |
| [Typewolf](https://www.typewolf.com/) | Current serif/sans/mono practice | Reference only |
| [Newsreader OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/OFL.txt), [Source Serif 4 OFL](https://raw.githubusercontent.com/adobe-fonts/source-serif/release/LICENSE.md) | Optional typefaces | SIL OFL 1.1 |

## Five moves

1. Rebuild the `index.html` hero around a real A4 specimen at 210×297 with 18mm margins, generated by the same `buildPack` output the product prints, with findings set as margin notes; delete `.mock`'s browser chrome.
2. Add `--rule` (`rgba(11,12,14,0.12)`), `--rule-state` (`rgba(11,12,14,0.45)`), `--r-sheet: 2px` and a folio size to `tokens.css`, then swap `--r-lg` for `--r-sheet` on marketing components in `site.css` and delete the unused `--r-xl`.
3. Replace every status chip with one dated stamp component, and audit each status surface so the label and rule carry the meaning, not the colour.
4. Remove `.hero__grad` and the `auth.css` glows, replacing both with a single ink cover band and one rule.
5. Apply `font-variant-numeric: tabular-nums` to scores, prices, counts and dates, and check the result at 375, 768 and 1440 before anything else ships.
