# Dark and light mode, without breaking the Meridian system

There is no theme layer today: `prefers-color-scheme`, `color-scheme`, `data-theme` and
`light-dark` appear nowhere under `public/`, and all eight pages declare `theme-color="#0b0c0e"` — the ink
black — over a `#fffdf8` canvas. So this is a naming job before a colour job.

## 1. `--ink` is doing two jobs, and that is the blocker

`tokens.css` mixes palette names (`--ink`, `--bone`, `--paper`) with roles (`--text`, `--line`). The role
tokens already behave like roles: the 200-plus `--line*` and `--text*` declarations across the three
stylesheets need no edits, only dark values. The palette tokens do not. `--ink` is a background in
`.section--dark`, `.hero`, `.footer` and `.mock`, and it is *ink on paper* in `.brand__mark .m-ring`,
`.nav__toggle span`, `.card__icon`, `.price-card--featured` and `#app-menu`. Swap the palette ends and the
logo vanishes as the dark bands turn pale: `--text` on `--ink` is **1.08:1**.

The split is one new role. Add `--mark` (`#0b0c0e` light, `#e8e6e1` dark) and leave `--ink` fixed, so the
always-dark bands survive untouched. About a dozen declarations change to `--mark` — the logo ring, nav
toggle bars, current-page underline, `.skip`, `.btn`, `.btn--light`, `.card__icon`, the featured price card
and its pill, and `#app-menu` — three of which also need their label switched from `--text-invert` to
`--surface`.

Everything else is cheaper: `--paper` (27 uses) and `--bone` (17) are surfaces and flip in one block, and
`--ink-2` needs a single lift to `#1d2026` so `.card--ink` does not vanish into a dark page.

## 2. Where the current palette actually stands

Ratios use the WCAG relative-luminance formula
([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)); thresholds are 4.5:1 for text,
3:1 for control boundaries and states
([1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).

| Pair (as shipped) | Ratio | Verdict |
|---|---|---|
| `--text` on `--paper` | 17.82 | pass |
| `--text-soft` on `--paper` | 8.11 | pass |
| `--text-muted` on `--paper` | 6.22 | pass |
| `--accent` on `--paper` | 6.38 | pass |
| `--err` on `--paper` | 7.44 | pass |
| `--accent` on `--ink` | 3.02 | **fails 4.5**, scrapes 3:1 |
| `--accent-ink` on `--ink-2` | 1.81 | fails |
| `--line-strong` over `--paper` (22% ink) | 1.65 | **fails 3:1**, and it is the only thing identifying `.input` |
| `--line-invert-strong` over `--ink-2` (26% cream) | 2.21 | fails 3:1 |

Two conclusions. Light-theme text already complies, so dark mode must not touch it — that is a
regression risk, not a redesign. The accent and the alpha borders are the only per-scheme values needed;
the borders fail *today*, so replace them with measured hexes rather than nudging the alpha.

The brand green cannot cross over as text: `#0f6b4f` on ink is 3.02:1. A dark accent must be lighter, and
then `.btn--primary`'s hardcoded `--btn-fg: #fff` inverts with it — white on `#6cc6a4` is 2.05:1, while ink
on it is 9.55:1.

## 3. The switch

| Piece | Where | Why |
|---|---|---|
| `color-scheme: light dark` | `:root` in `tokens.css` | UA-paints the canvas, scrollbars, form controls and spellcheck underline in the used scheme ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme)) |
| `:root` + `[data-theme="dark"]` token blocks | new `assets/scheme.css` | Two blocks, one override selector, greppable |
| Classic `<script>` before the stylesheets | all eight `<head>`s | Module scripts are deferred, so `site.js` cannot set the attribute before first paint ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type)) |
| `localStorage` key `theme` = `system`/`light`/`dark` | that script | `prefers-color-scheme` has only `light` and `dark`; `no-preference` was removed from the spec, so "follow my system" can only be the *absence* of an attribute ([web.dev](https://web.dev/articles/prefers-color-scheme), [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)) |
| Two `<meta name="theme-color">` with `media` | every `<head>` | The single `#0b0c0e` is already wrong on the default light page; the attribute accepts a media query ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color)) |
| `<link media="(prefers-color-scheme: dark)">` for the dark block | page heads | Keeps the sheet for the mode you are not in off the critical path ([web.dev](https://web.dev/articles/prefers-color-scheme)) |

`light-dark()` would collapse each pair into one declaration keyed off `color-scheme`, making the manual
override `[data-theme="dark"] { color-scheme: dark }`. It is Baseline 2024, later than the `color-mix()` the
site already relies on, so treat it as the tidy-up once a browser floor is agreed
([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark)); do not ship it as the only
mechanism.

## 4. What breaks if this is not planned for

- **Chrome's Auto Dark Theme** algorithmically darkens pages that do not declare support. `color-scheme:
  light dark` is how to take over; `only light` is the opt-out
  ([Chrome for Developers](https://developer.chrome.com/blog/auto-dark-theme)).
- **Forced colours.** `box-shadow`, `text-shadow` and non-URL `background-image` are forced to `none`, so
  `.hero__grad` and the featured card's shadow vanish, while the `.bento` hairline grid survives as a
  `background-color` gap ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)).
  Never let shadow carry meaning alone.
- **Hardcoded colours.** `.code` carries five hexes (`#e6e7ea`, `#7f8794`, `#9fb4ff`, `#b9e79a`, `#ffb59a`) and
  `.nav` an `rgba(255, 253, 248, 0.94)` fallback. Both need scheme pairs.
- **Focus.** `--accent` as a ring is 6.38:1 on paper but 3.02:1 on ink; `--lime` is 15.6:1 on ink. Use a
  `--focus` token per scheme. The 2px-perimeter, 3:1 change-of-contrast rule is
  [2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) (AAA), and 1.4.11 applies to the
  ring in both schemes.
- **Status colour.** Findings and statuses must stay readable without hue, per
  [1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) and SPEC §9.

## 5. Reuse

`<dark-mode-toggle>` (GoogleChromeLabs) is **Apache-2.0**: permissive, with attribution and the notice
retained. Its README documents the flash-on-load problem (#77) and the loader-script workaround worth
borrowing, plus the `color-scheme` meta. It states it is not an official Google product. Borrow the pattern,
not the dependency: the site ships no third-party JS. `tokens.css` and `site.css` carry no licence header of
their own, worth settling before palettes are published.

---

1. Add `--mark`, keep `--ink` fixed, and change the declarations that use ink as ink-on-paper to `--mark`,
   switching the labels on `.skip`, `.btn` and the featured pill from `--text-invert` to `--surface`.
2. Create `assets/scheme.css` with `:root` and `[data-theme="dark"]` blocks that redefine only `--paper`,
   `--bone`, `--ink-2`, `--text*`, `--line*`, `--accent*`, `--ok`, `--warn`, `--err`, `--focus` and
   `--shadow-*`, restating the light values unchanged so today's theme cannot regress.
3. Choose the dark accent and edges from measured pairs: `#6cc6a4` on `#14161a` is 8.84:1 with ink labels at
   9.55:1, and edges must reach 3:1 against `#14161a`, which `#4e4f50` (2.21:1) does not.
4. Put one blocking classic script and two `theme-color` metas in all eight heads, storing
   `theme=system|light|dark`, and give `site.js` a toggle that writes only that key and the attribute.
5. Before merge, screenshot every page in all three states plus `forced-colors: active`, and assert every pair
   above in a test, so a palette edit fails CI, not a user.
