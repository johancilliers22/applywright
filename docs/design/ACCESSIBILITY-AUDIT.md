# Accessibility audit — Applywright marketing site

**Date:** 28 October 2026
**Scope:** `public/{index,how-it-works,pricing,about,security}.html`, the state variants of
those pages, and the shared stylesheets (`tokens.css`, `theme.css`, `site.css`, `motion.css`,
`auth.css`) as rendered in both colour schemes at 1440 and 390.
**Not in scope:** the authenticated SPA (`public/app/**`, `server/**`), `public/partials/**`
(`nav.html`, `footer.html`), `theme.js` and `site.js` — those have other owners and changes that
need them are listed in §6 instead of made here.

**Result:** the 24-run matrix measured **44 → 16 axe violation nodes**, and the WCAG-tagged
subset went **2 → 0 nodes**. All 16 remaining were one best-practice rule, `heading-order`,
caused entirely by the `h4` column labels in `partials/footer.html`; the `<h3>` change in
`0f19177` fixed them, which is why the same work is summarised as "44 → 0" elsewhere (the
commit subject and the vault note). Read that shorthand precisely: **16 was the
best-practice `heading-order` count at audit time, since fixed; 0 is the WCAG-tagged count.**
Nothing was added to the project's dependencies.

- **Verdict: WCAG 2.2 A/AA — no automated failures left in the audited surface.**
- Remaining work is the four lower-severity items for the `site.js`, `nav.html` and auth/SPA
  owners; the §6.1 footer markup change has since landed in `0f19177`.

---

## 1. What was audited

| Page | File | Schemes | Viewports |
|---|---|---|---|
| `/` | `public/index.html` | light + dark | 1440×900, 390×844 |
| `/how-it-works` | `public/how-it-works.html` | light + dark | 1440, 390 |
| `/pricing` | `public/pricing.html` | light + dark | 1440, 390 |
| `/about` | `public/about.html` | light + dark | 1440, 390 |
| `/security` | `public/security.html` | light + dark | 1440, 390 |
| `/sign-in` | `public/sign-in.html` | light only¹ | 1440, 390 |
| `/sign-up` | `public/sign-up.html` | light only¹ | 1440, 390 |
| `/reset` | `public/reset.html` | light only¹ | 1440, 390 (separate line, §3) |

¹ These pages do not load `theme.js`, so there is no dark scheme to audit. That is itself a
finding for another owner — see §6.6.

**Not audited:** `public/editor.html` and `/editor` (with `assets/editor.css`, `assets/editor.js`)
did not exist when this pass started; another agent added them mid-pass and still owns them. It is a
different surface (a document editor with its own class namespace) and needs its own pass.

**24 runs** make the before/after matrix (5 marketing pages × 2 schemes × 2 viewports + the two
auth pages × 2 viewports). `/reset` was added by another agent mid-pass, so it is reported
separately rather than folded into the comparison.

**State variants audited on top of the static load** (`state-audit.mjs`, 12 extra runs): the mobile
drawer open (index, pricing × light/dark), every FAQ disclosure open (index, pricing × light/dark),
and the contact form in its error state with the server's message on screen (about, security ×
light/dark). **Ten of the twelve runs reported the one `heading-order` node and nothing else; the two
`/security` runs reported nothing.**

---

## 2. What was run

### 2.1 axe-core over the DevTools protocol

`axe-core@4.10.2` (the `axe.min.js` bundle, 553 KB) downloaded to `%TEMP%\aw-a11y\`, injected with
`Runtime.evaluate` into a headless Chrome 156.0.8078.48 instance driven over CDP by Node 26.12.1
with the global `WebSocket` — the same pattern the project's own `scripts/browser-preview.mjs`
uses. No npm install, no devDependency, no file added to the repo.

Method points that matter for reproducing the numbers:

- **Full rule set.** `axe.run(document)` with no `runOnly`, so best-practice rules such as
  `heading-order`, `landmark-one-main` and `region` are included, not just the WCAG tags.
- **Theme is set the way the site sets it**, not by forcing an attribute: pin
  `localStorage['applywright-theme']` and emulate `prefers-color-scheme`, navigate, then call
  `window.applywrightTheme.set('dark')` and assert `document.documentElement.dataset.theme`.
  Verified per run from `getComputedStyle(document.body).backgroundColor`
  (`#fffdf8` light / `#191c22` dark) — an earlier version of this harness silently audited the
  OS scheme instead of the requested one, so the assertion is deliberate.
- **Viewports:** `Emulation.setDeviceMetricsOverride` at 1440×900 DPR 1 and 390×844 DPR 1 with
  `mobile: true` below 500 px.
- **Settle:** two `requestAnimationFrame`s plus 300 ms after the theme change, so the entrance and
  reveal transitions are not mid-flight when axe looks.
- Results are written to JSON (`axe-before.json`, `axe-after.json`) and summarised per run.

### 2.2 Manual checks axe cannot make

Scripted in `manual-checks.mjs`, `manual2.mjs` and `pixel-checks.mjs` (all in `%TEMP%\aw-a11y\`):

1. **Tab order per page** — real `Input.dispatchKeyEvent` Tab presses (not `focus()`), 14–40 stops
   per page, recording tag, class, accessible text, on-screen state and computed outline.
2. **Skip link** — Tab once, check the link is on screen, Enter, check `document.activeElement` and
   `scrollY`; repeated in dark and on a non-hero page.
3. **Mobile drawer** — real mouse click on the toggle at 390, then Tab, then Escape; checking
   `aria-expanded`, `aria-label`, the drawer's computed `display` and where focus lands.
4. **Focus visibility** — focus moved by real Tab traversal so `:focus-visible` applies, then the
   pixels around the control are captured through CDP and decoded in-page with
   `createImageBitmap`/`OffscreenCanvas` to measure the ring against **the surface it is actually
   painted on** (see §4.7 for why computed-style arithmetic gets this wrong).
5. **Contact-form error announcement** — two paths: a real `POST /api/contact` that the server
   rejects with 400 (`email must be a valid address`), and a forced network failure; then reading
   the live region's text, role and `aria-live`, plus every field's `aria-invalid`.
6. **FAQ `<details>`** — keyboard activation with full key sequences, the accessibility tree's
   role/name/expanded state, and content visibility after toggling.
7. **Theme toggle by keyboard** — Tab to it, Enter, Space, and the `role="status"` text.
8. **Focus inside a scroll-reveal block** — Tab into a block `site.js` has hidden, then measure the
   block's opacity before and after the transition.
9. **Reduced motion** — emulated `prefers-reduced-motion: reduce`, checking nothing is left at
   `opacity: 0` and transitions collapse.
10. **Landmarks and heading outline** — `Accessibility.getFullAXTree`, filtered to landmark and
    heading roles.

---

## 3. Before and after

### 3.1 Per-run violation nodes

| Page | Scheme | Viewport | Before | After |
|---|---|---|---|---|
| index | light | 1440 | 2 | 1 |
| index | light | 390 | 2 | 1 |
| index | dark | 1440 | 2 | 1 |
| index | dark | 390 | 2 | 1 |
| how-it-works | light | 1440 | 2 | 1 |
| how-it-works | light | 390 | 3 | 1 |
| how-it-works | dark | 1440 | 2 | 1 |
| how-it-works | dark | 390 | 3 | 1 |
| pricing | light | 1440 | 2 | 1 |
| pricing | light | 390 | 3 | 1 |
| pricing | dark | 1440 | 2 | 1 |
| pricing | dark | 390 | 3 | 1 |
| about | light | 1440 | 2 | 1 |
| about | light | 390 | 2 | 1 |
| about | dark | 1440 | 2 | 1 |
| about | dark | 390 | 2 | 1 |
| security | light | 1440 | 1 | **0** |
| security | light | 390 | 3 | **0** |
| security | dark | 1440 | 1 | **0** |
| security | dark | 390 | 3 | **0** |
| sign-in | light | 1440 | 0 | 0 |
| sign-in | light | 390 | 0 | 0 |
| sign-up | light | 1440 | 0 | 0 |
| sign-up | light | 390 | 0 | 0 |
| **matrix total** | | | **44** | **16** |
| reset (added mid-pass) | light | 1440 | — | 0 |
| reset (added mid-pass) | light | 390 | — | 0 |

### 3.2 By rule

| Rule | Impact | Rule type | Before (nodes / runs) | After |
|---|---|---|---|---|
| `link-in-text-block` | serious | WCAG 1.4.1 | 20 / 20 | **0** |
| `scrollable-region-focusable` | serious | WCAG 2.1.1 | 8 / 6 | **0** |
| `heading-order` | moderate | best practice | 16 / 16 | 16 / 16 (owner: `partials/footer.html`, §6.1) |
| **distinct rules** | | | **3** | **1** |
| **WCAG-tagged rules** | | | **2** | **0** |

No failed WCAG rule remains. Every `critical`/`serious` finding is closed. axe also reports
`incomplete` (things it refuses to judge) — those were measured by hand in §5.

### 3.3 State variants (12 runs, after the fixes)

| State | Runs | Violation nodes | Rules |
|---|---|---|---|
| Mobile drawer open | 4 | 4 | `heading-order` only |
| Every FAQ disclosure open | 4 | 4 | `heading-order` only |
| Contact form in its error state | 4 | 2 | `heading-order` only (`security` 0) |

---

## 4. What was fixed

Every change is accessibility-only: no layout, colour or type change is intended, and no inline
script or handler was introduced (the CSP is `script-src 'self'`).

### 4.1 `link-in-text-block` — the footer's inline link had no non-colour cue

**`public/assets/site.css`** — added `.footer .footer__tag a` (underline).

The sentence *"Applywright is a product of Intelligent Artificial ·
intelligentartificial.net"* is the only inline link inside running text on the site. `.footer a`
sets `text-decoration: none` and `opacity: 0.82`, so the link resolved to `#cbc9c2` against
`#a9aeb6` surrounding text — **1.34:1**, i.e. distinguishable by colour alone, which 1.4.1 does
not allow. The fix adds the underline (a non-colour cue) and leaves the colour untouched.

Two selector levels (`.footer .footer__tag a`) on purpose: `.footer a` appears later in the file at
the same specificity, and a single-class rule loses to it — the first attempt at this fix did
exactly that and axe kept reporting 20 nodes.

### 4.2 `scrollable-region-focusable` — sideways-scrolling regions had no keyboard route

**`public/how-it-works.html`** — `<div class="table-wrap" tabindex="0" role="region"
aria-label="Score components and their weights">`
**`public/pricing.html`** — `<div class="table-wrap" tabindex="0" role="region"
aria-label="Plan quotas, side by side">`
**`public/security.html`** — both `<pre class="code">` blocks: `tabindex="0" role="region"` with
`aria-label="Export and delete endpoints"` and `aria-label="The five field groups a tailoring
request sends"`.

`table.compare` has `min-width: 620px` and `.code` scrolls on `overflow-x`, so below roughly 700 px
both scroll — and a scroll container that cannot take focus cannot be scrolled without a pointer
(WCAG 2.1.1). The `security.html` tables already carried this pattern; the fix extends the existing
convention to the two tables and two code blocks that lacked it, including a label so a screen
reader user knows why focus landed on a region.

### 4.3 Generated glyphs were leaking into accessible names

**`public/assets/site.css`** — `.faq summary::after` (`"+" / ""`), `.faq details[open]
summary::after` (`"−" / ""`), `.mock__tool::before`, `.price-list li::before`, `.price-list
li.is-muted::before`, `.link-arrow::after`.
**`public/assets/auth.css`** — `.auth__facts li::before`.

The CSS-generated `+` / `−`/ `→` / `✓` / `▸` marks are painted with an empty alternative text
(`content: "+" / ""`), which browsers use for speech and exclude from the accessible name. This was
a real defect, not cosmetics: the accessibility tree showed the FAQ disclosure as
**"Do you apply for me? +"** and then **"Do you apply for me? −"** once opened — the accessible name
changed with the state, so a screen reader re-announced a different label on every toggle. The state
is already carried by the native disclosure role and its expanded flag.

`.step::before` keeps its step counter in the name deliberately: "01, Ingest" is meaningful reading
order, not decoration. `.eyebrow::before` is empty already.

### 4.4 Form hints were not associated with their control

**`public/about.html`** and **`public/security.html`** — the message field's hint now has an `id`
and the `<textarea>` an `aria-describedby`.

The message hint ("Specific is better: the job, the finding and what you expected instead." / "Up to
4,000 characters…") sat after the control as an unassociated paragraph, so it was not read when the
field took focus. This is the association the design spec already asks for (`SPEC-V2.md` §6, "hint
via `aria-describedby`"); it is markup-only and does not touch `site.js`.

### 4.5 Focus inside a scroll-reveal block was invisible for ~620 ms

**`public/assets/motion.css`** — `html.reveal-on .reveal:not(.is-visible):focus-within`.

`site.js` hides blocks that start below the fold (`opacity: 0`) until an IntersectionObserver sees
them. Tabbing straight into one focuses a control that is not yet painted — measured on `/pricing`
at 390: the block holding the focused link sat at **opacity 0** when focus arrived and reached
`0.997` about 620 ms later. WCAG 2.4.7 wants the focus indicator visible when focus arrives; the
rule settles the block on the frame focus lands, with `transition: none` so the interval is not
simply shortened. The observer still handles the scroll case, so nothing pops in early.

### 4.6 Prepared, not applied — footer heading level

**`public/assets/site.css`** — `.footer h3, .footer h4 { … }`.

The `heading-order` finding is a markup problem in a file this pass does not own (§6.1). The style
rule now covers both levels, so the owner's one-character edit (`<h4>` → `<h3>`, four times) cannot
shift the footer's appearance.

### 4.7 Why the first pixel measurement was wrong (method note)

Two traps were hit and are recorded here because they are easy to repeat:

1. **`outline-offset`.** The focus ring is drawn 2–3 px *outside* the element, so the surface it must
   contrast against is the element's parent, not its own fill. Walking ancestors from the element
   itself reported the primary button's ring at **1.00:1** (accent on accent) when the rendered
   contrast is 6.9–7.9:1 against the paper/bone it is really drawn on.
2. **`scroll-behavior: smooth`** (set globally in `tokens.css`) plus CDP clip coordinates being
   *page* coordinates, not viewport coordinates: taking `getBoundingClientRect()` while the browser
   is still animating a scroll captures the wrong part of the page. The harness now disables smooth
   scrolling for measurement and reads the box and the scroll offset in one evaluate.

Both are measurement bugs, not site bugs — but they are exactly the kind of thing that produces an
"everything fails" report that is wrong. The numbers in §5 are from the corrected harness
(pixel-sampled ring/background pairs, not arithmetic on computed styles).

---

## 5. Manual checks — results and evidence

### 5.1 Tab order

First eight stops are identical on all five marketing pages, in reading order, with nothing
invisible and nothing skipped:

```
1  a.skip          "Skip to content"
2  a.brand         "Applywright"
3  a              "Product"
4  a              "Pricing"
5  a              "How it works"
6  a.btn--ghost    "Sign in"
7  a.btn--primary  "Get started"
8  button.theme-toggle  "Colour theme: light. Switch to system."
```

Then the page's own controls in DOM order — e.g. `/about`: hero-free page head → the `mailto:` link
→ Name → Email → Message → "Send message" → footer. On `/security` the on-page nav
("Applying", "No scraping", …) comes next, which matches the visual order. No stop was hidden or
zero-sized, and no positive `tabindex` exists anywhere in the audited pages, so the order is the DOM
order.

### 5.2 Skip link

| Page / scheme | First Tab | On screen | Enter → focus | Ring contrast |
|---|---|---|---|---|
| `/` light | `a.skip` | yes (0,0, 146×52) | `main#main`, `tabindex="-1"` | 15.64:1 |
| `/` dark | `a.skip` | yes | `main#main` | 15.92:1 |
| `/security` light | `a.skip` | yes | `main#main` | 7.85:1 (accent on paper) |

`site.js` sets `tabindex="-1"` on `#main` and calls `main.focus()`; `site.css` keeps the landmark
from painting a ring (`#main:focus { outline: none }`). Focus actually moves — the check asserts
`document.activeElement.id === "main"`, not just the hash.

### 5.3 Mobile drawer (390)

| Page / scheme | Click on the toggle | Tab after opening | Escape | Focus ring |
|---|---|---|---|---|
| `/` light | `aria-expanded` `false`→`true`, `aria-label` "Menu"→"Close menu", drawer `display: block` | first drawer link ("Product") | closed (`false`), **focus back on the toggle** | 10.88:1 |
| `/` dark | opens (drawer links visible and focusable) | first drawer link | closed, focus returned | 15.66:1 |
| `/pricing` light | `aria-expanded` / label / `display` as above | first drawer link | closed, focus returned | — |
| `/pricing` dark | opens | first drawer link | closed, focus returned | — |

The full `aria-expanded`/`aria-label`/`display` triplet was read on `/` in the light scheme and on
`/pricing` light; the dark runs assert the drawer opens, takes focus and closes the same way (there
is one code path in `site.js`, so a scheme-specific difference would be a bug). It is a disclosure,
not a modal: focus is not trapped, Tab walks into the open list, Escape closes and returns focus to
the button that opened it.

### 5.4 Focus visibility, measured from pixels

Ring colour is read from `getComputedStyle`, but the contrast is measured between the *painted* ring
pixels and the *painted* pixels around them (CDP screenshot → in-page `createImageBitmap` →
`OffscreenCanvas`, classify ring pixels, take the peripheral surface colour). Minimum required for a
UI indicator: **3:1** (WCAG 1.4.11).

| Control | Light | Dark |
|---|---|---|
| Skip link | 15.64:1 | 15.92:1 |
| Hero primary CTA (`/`, lime ring on the ink band) | 15.57:1 | 15.78:1 |
| Hero secondary CTA `.btn--on-dark` | 15.50:1 | 15.78:1 |
| Nav link (ink nav over the ink hero) | 10.78:1 | 15.52:1 |
| Theme toggle | 10.78:1 | 15.52:1 |
| FAQ summary | 7.85:1 | 8.20:1 |
| Contact input (`#contact-name`) | 7.13:1 | 8.85:1 |
| Contact submit button | 7.13:1 | 8.85:1 |
| Prose link (`/security`) | 7.21:1 | 8.79:1 |
| On-page nav link (on `--bone`) | 6.90:1 | 8.60:1 |
| Drawer link (390) | 10.88:1 | 15.66:1 |
| Footer link² | ≈10.7:1 | ≈10.7:1 |

² `.footer a` carries `opacity: 0.82`, and CSS `opacity` applies to the outline as well as the text,
so the ring is painted at 82 % — `rgb(178,199,139)` against the ink footer, ≈10.7:1. It passes
comfortably; the dimming is a cosmetic side effect worth knowing about, not a defect (§6.5).

**Hero and dark mode specifically** (the two cases named in the brief): the ink band keeps the ring
legible by swapping `outline-color` to `--lime` (15.5–15.9:1), and the dark scheme's `--focus`
(`#47c99a`) measures 8.2–8.9:1 on the dark paper/bone. No control in either scheme relies on a tint
or a shadow as its only focus indicator.

### 5.5 Contact form — error announcement

| Check | Result |
|---|---|
| Live region | `<p data-form-status role="status" aria-live="polite">` — correct role, polite |
| Real server 400 (`email must be a valid address`) | announced: `"Could not send: email must be a valid address"` on `/about` and `/security` |
| Forced network failure | `"Could not send: network down"`, announced |
| Submit button after failure | re-enabled (no dead end) |
| Native validation | invalid email blocks the request first, so the browser's own accessible validation message is what a user normally sees |
| Field-level state | **missing** — no `aria-invalid`, no `aria-describedby` to the error, focus stays where it was. WCAG 3.3.1 is met by the text message; the association is the improvement in §6.2 |

### 5.6 FAQ `<details>`

| Check | index | pricing |
|---|---|---|
| Reachable by Tab | yes, stop 14 | yes, stop 12 |
| Accessibility role | `DisclosureTriangle` | `DisclosureTriangle` |
| Announced name | the question (after §4.3 removed the glyph) | same |
| Expanded state exposed | yes (`expanded: false` → `true`) | yes |
| Enter toggles | yes (`open: false` → `true` → `false`) | yes |
| Space toggles | yes | yes |
| Content after opening | rendered and readable | rendered and readable |

The one defect found here was the `+`/`−` in the accessible name, fixed in §4.3. Native
`<details>` is announced sensibly without extra ARIA, so no ARIA was added.

### 5.7 Theme toggle by keyboard

Tab stop 8. Enter and Space both activate it. The `role="status"` live region announces the result
(`"Colour theme: system, now light"`, `"Colour theme: dark"`), the accessible name updates
(`"Colour theme: light. Switch to system."` → `"Colour theme: system, currently light. Switch to
dark."`), and `data-theme` on `<html>` changes. Correct: a three-state cycler with no
`aria-pressed`, exactly as `SPEC-V2.md` §6 describes.

### 5.8 Reduced motion

With `prefers-reduced-motion: reduce`: `html` has no `reveal-on` class, **0** blocks are hidden, and
the collapsed transition duration reads `1e-05s`. Nothing depends on motion to become readable.

### 5.9 Landmarks and headings

`/pricing`: `banner`, `main`, `contentinfo`, `navigation "Primary"`, and four labelled `region`s
("Pick the quota that matches your search", "Every quota, side by side", "The small print, in plain
English", "Start free. Change plan when the search gets busy") — one `main`, one `h1` per page.
`/security` adds `navigation "On this page"` and the four scrollable regions (two tables, two code
blocks), each labelled. Heading outline per page is `h1 → h2 → h3` with a single break: the footer's
`h4`s (§6.1).

### 5.10 Colour contrast where axe gives up (`incomplete`)

axe returned 18 `color-contrast` incompletes on `/` (the hero's decorative gradient overlay), 4 on
`/how-it-works` and 2–4 on `/security` each run. Measured by pixel instead:

| Element | Light | Dark |
|---|---|---|
| Hero `h1` | 17.49:1 | 17.81:1 |
| Hero sub / eyebrow (`--text-invert-soft`) | 8.77:1 | 8.93:1 |
| Hero meta line (over the gradient's warm corner) | 8.54:1 | 8.73:1 |
| Mock tool line (lime on ink-2) | 14.48:1 | 15.11:1 |
| Mock small copy | 8.12:1 | 8.47:1 |
| `<code>` chip (`.txt`) | 16.35:1 | 15.89:1 |
| `<pre class="code">` block | 14.65:1 | 15.28:1 |
| Auth page quote / facts | 17.49 / 8.77:1 | (no dark scheme) |
| `.dot-sep` separator³ | 2.52:1 | 3.65:1 |

³ `.dot-sep` is `aria-hidden="true"` and purely decorative (a mid-dot between metadata items). WCAG
1.4.3 exempts pure decoration, so it is not a failure — but it is the only sub-4.5 text-shaped pixel
on the site, and it is recorded here rather than hidden. Raising it would mean deleting the muted
treatment the design uses, so it was left for the owner to decide (§6.4).

---

## 6. What is left, and who owns it

### 6.1 `heading-order` — footer column labels are `h4` under an `h2` — **owner: `public/partials/footer.html`**
**Severity: moderate (axe best-practice, not a WCAG failure). 16 nodes / 16 runs, plus 10 in the
state runs.**

The last heading in `<main>` on `/`, `/how-it-works`, `/pricing` and `/about` is an `h2` (the CTA
band); the footer then starts at `h4`. On `/security` the last heading happens to be an `h3`, which
is why that page is now clean.

```diff
-        <h4>Product</h4>
+        <h3>Product</h3>
-        <h4>Plans</h4>
+        <h3>Plans</h3>
-        <h4>Account</h4>
+        <h3>Account</h3>
```

No styling change is needed: `site.css` now styles `.footer h3, .footer h4` with the same rule
(§4.6). This is the only thing standing between the site and a clean axe run.

### 6.2 Field-level error state on the contact forms — **owner: `public/assets/site.js`**
**Severity: low.** WCAG 3.3.1 is met (the error is described in text in a polite live region), so
this is an enhancement, not a failure. In the `catch` block, after writing `out.textContent`, also:

```js
// the API's message names the field; keep the association for screen readers
emailField?.setAttribute("aria-invalid", "true");
emailField?.setAttribute("aria-describedby", "contact-form-status");
```

and give the status paragraph `id="contact-form-status"`, clearing `aria-invalid` on the next
submit. Associating the message with the control is the difference between hearing an announcement
and knowing which field to fix.

### 6.3 The mobile drawer is not a navigation landmark — **owner: `public/partials/nav.html`**
**Severity: low.** Below 940 px `.nav__links` is `display: none`, so the only primary-nav landmark
is hidden and the drawer's links sit in the `banner` region as an unlabelled `<div>`. Wrapping the
drawer's links in `<nav aria-label="Primary">` gives mobile users the same landmark the desktop
layout has. (Not a WCAG failure — the links are reachable, in order, and correctly labelled.)

### 6.4 Decorative separator contrast — **owner: design decision (no change made)**
**Severity: informational.** `.dot-sep` renders at 2.52:1 on `--bone` and 3.65:1 on the dark
`--bone`. It is `aria-hidden` decoration and exempt from 1.4.3. If the owner wants it visible to
low-vision users, the fix is `color: var(--text-muted); opacity: 1` (5.65:1 / 8.07:1) — a visual
change, which is why this pass did not make it.

### 6.5 Footer links dim their own focus ring — **owner: `public/assets/site.css` (this pass), optional**
**Severity: informational.** `.footer a { opacity: 0.82 }` dims the painted ring to 82 % along with
the text. Measured ≈10.7:1 against the ink footer, so it passes by a wide margin. Replacing the
element `opacity` with an alpha colour (`color: color-mix(in srgb, var(--text-invert) 82%,
transparent)`) would leave the ring at full strength with an identical text appearance. Not done
because it is not a defect and it changes how a shared component transitions on hover.

### 6.6 Auth and SPA surfaces have no dark scheme — **owner: auth/SPA (`sign-in.html`, `sign-up.html`, `reset.html`, `app/app.html`)**
**Severity: low (consistency).** These pages do not load `theme.js`, so a user who chose dark on the
marketing site is dropped into the light palette at sign-in — and they cannot be audited in dark
mode until that changes. Already recorded for the owner in `SPEC-V2.md` §8.5.

### 6.7 Extra tab stops and landmark regions from §4.2 — **intentional trade-off**
The four scroll regions are now focus stops at every width, including desktop widths where they do
not scroll, and each is a labelled `region` landmark: one extra stop on `/how-it-works`, one on
`/pricing`, two on `/security` (its two tables already had the pattern). That is the standard fix —
a scroll container must be operable from the keyboard in Safari and Firefox, which do not yet make
scrollers focusable the way Chrome 132+ does — and it is the cost of the four nodes §4.2 removes. If
the owner wants the stops conditional, the attribute is the lever, not CSS: remove `tabindex="0"`
and accept the Safari/Firefox gap.

### 6.8 No accessibility gate in `scripts/check.js` — **owner: `scripts/check.js`**
**Severity: informational.** `check.js` verifies HTML structure, includes, CSP-friendliness, hype
vocabulary and secret literals, but nothing about contrast or ARIA. `SPEC-V2.md` §8.7 already asks
for this; the concrete proposal is to add the pair list from §5.4/§5.10 as assertions, or a
committed `axe-core` dev dependency with this audit's matrix as the test. This pass deliberately
added no dependency, per the brief.

### 6.9 Non-JS submission of the security contact form — **owner: `public/security.html` (this pass, left alone)**
**Severity: informational.** `about.html`'s form has `action="/api/contact" method="post"`;
`security.html`'s has neither, so without JavaScript it reloads the page with the fields in the
query string and no feedback. The API only accepts JSON either way, so the no-JS path is a dead end
in both cases. Not an accessibility failure (it needs a real endpoint contract), but the two copies
of the same form should not drift.

---

## 7. How to re-run this audit

Temp tooling only — nothing added to `package.json`:

```powershell
# 0. the site (this pass did not restart it; it was already serving)
Invoke-WebRequest http://127.0.0.1:3160/ -UseBasicParsing | Select-Object StatusCode

# 1. the tooling, outside the repo
$dir = "$env:TEMP\aw-a11y"
New-Item -ItemType Directory -Force $dir | Out-Null
Invoke-WebRequest -Uri https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js -OutFile "$dir\axe.min.js"

# 2. the matrix — writes axe-after.json and prints a per-run table + totals
node "$dir\axe-audit.mjs" http://127.0.0.1:3160 --json "$dir\axe-after.json"

# 3. the state variants (drawer open, FAQ open, form error)
node "$dir\state-audit.mjs" http://127.0.0.1:3160

# 4. manual checks
node "$dir\manual-checks.mjs"  http://127.0.0.1:3160   # tab order, skip link, drawer, rings (computed)
node "$dir\manual2.mjs"        http://127.0.0.1:3160   # FAQ, form errors, theme toggle, reveal, reduced motion, landmarks
node "$dir\pixel-checks.mjs"   http://127.0.0.1:3160   # pixel-sampled rings and text contrast

# 5. the fixes themselves, asserted
node "$dir\verify-fixes.mjs"   http://127.0.0.1:3160   # 9 checks: FAQ name, footer underline, hints, focus stops, reveal, footer rule
```

`axe-audit.mjs` needs `axe.min.js` beside it. The other three scripts use no axe bundle: they read
computed styles, real key events, the accessibility tree and CDP screenshots. If
`%TEMP%\aw-a11y\` is gone, Appendix A reproduces the matrix at its core.

`node scripts/check.js` (0 errors, 0 warnings) remains the project's own gate; it does not check
accessibility (§6.8).

### Appendix A — minimal axe matrix, self-contained

```js
// node axe-matrix.mjs [baseUrl] — Node 22+, no dependencies.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
const BASE = process.argv[2] || "http://127.0.0.1:3160";
const AXE = await readFile(new URL("./axe.min.js", import.meta.url), "utf8");
const port = 9450;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`,
  "--user-data-dir=" + process.env.TEMP + "/aw-axe-profile", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let info; for (let i = 0; i < 80 && !info; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(150); } }
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map(); let sessionId = null;
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}, s = true) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, ...(s && sessionId ? { sessionId } : {}) })); });
const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
await send("Page.enable"); await send("Runtime.enable");
sessionId = (await send("Target.attachToTarget", { targetId: (await send("Target.createTarget", { url: "about:blank" }, false)).targetId, flatten: true }, false)).sessionId;
for (const path of ["/", "/how-it-works", "/pricing", "/about", "/security"]) {
  for (const theme of ["light", "dark"]) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
      await send("Page.navigate", { url: BASE + path }); await sleep(700);
      await evalJs(`localStorage.setItem('applywright-theme','${theme}')`);
      await send("Page.navigate", { url: BASE + path }); await sleep(950);
      await evalJs(AXE);
      const r = await evalJs(`axe.run(document).then(r => ({ theme: document.documentElement.dataset.theme,
        byRule: r.violations.map(v => v.id + ":" + v.nodes.length), nodes: r.violations.reduce((n, v) => n + v.nodes.length, 0) }))`);
      console.log(`${path} ${theme} ${w} theme=${r.theme} nodes=${r.nodes} ${r.byRule.join(", ")}`);
    }
  }
}
ws.close(); chrome.kill();
```

Expected on the current tree: `/security` 0 everywhere, the other four pages `heading-order:1` while
`partials/footer.html` still uses `h4`; any `link-in-text-block` or `scrollable-region-focusable`
line means a regression of §4.1 or §4.2.

---

## 8. Verification ledger

Run from `projects/applywright` on 28 October 2026, with the server already on `127.0.0.1:3160`:

| Check | Command | Result |
|---|---|---|
| Static self-check | `node scripts/check.js` | **10 pages, 24 server modules, 247 css classes — 0 errors, 0 warnings** |
| Pages live | `Invoke-WebRequest` for `/`, `/how-it-works`, `/pricing`, `/about`, `/security`, `/sign-in`, `/sign-up`, `/reset` | **8/8 → 200** |
| axe matrix (24 runs) | `node axe-audit.mjs` | **44 → 16 violation nodes; 3 → 1 distinct rule; 0 WCAG-tagged rules** |
| axe state variants (12 runs) | `node state-audit.mjs` | 10 nodes, all `heading-order` (footer) |
| Fix-level verification | `node verify-fixes.mjs` | 9/9 pass (name, underline, hint, focus stops, reveal, footer rule) |
| Focus-ring contrast | `node pixel-checks.mjs` | **min 6.90:1** across 13 controls × 2 schemes (floor is 3:1) |
| Skip link | `node manual-checks.mjs` | focus lands on `main#main` on `/` and `/security`, both schemes |
| Drawer | `node manual-checks.mjs` | opens, Tab enters, Escape closes and returns focus, 2 pages × 2 schemes |
| FAQ | `node manual2.mjs` | `DisclosureTriangle`, expanded state exposed, Enter/Space toggle, reachable at stop 14/12 |
| Form errors | `node manual2.mjs` | server 400 and network failure both announced in the polite live region |
| Reduced motion | `node manual2.mjs` | 0 hidden blocks, transitions `1e-05s` |

`check.js` was **0 errors / 0 warnings** at close. It reported one transient warning while
`public/editor.html` was being written by another agent mid-pass (a class its stylesheet did not
yet define); that page is outside this audit's scope (§1) and its warning had cleared by the final
run.

Two operational notes for whoever re-runs this:

- The tree was being edited by other agents throughout. A concurrent commit (`6cb8d47`, "Recovery UI,
  accessibility and theme refinements") swept these edits in; the working tree was re-verified
  afterwards (`verify-fixes.mjs`, all pass) because the same commit also compacted comments in
  `site.css` and `motion.css`.
- `axe-audit.mjs` now refuses to audit a page it cannot load. A mid-run restart of the app server
  produced one run against Chrome's `ERR_CONNECTION_REFUSED` page, whose `meta-viewport` and
  landmark failures belong to nobody; the recorded numbers are from real pages only.
