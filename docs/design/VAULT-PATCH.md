# VAULT-PATCH — Applywright design system (for Johan to apply)

Missions cannot write the Obsidian vault (`luna-vault/**` is sacred), so this is a
copy-paste patch. Two edits on the PC, neither of which touches anything already in the vault
except one line in the index.

Paths are Windows, matching the vault's on-disk layout:

| What | Path |
|---|---|
| Vault brain directory | `C:\Users\johan\Desktop\Coding\OpenClaw\luna-vault\Luna Vault\brain\` |
| Vault git root | `C:\Users\johan\Desktop\Coding\OpenClaw\luna-vault\Luna Vault\` (the `Luna Vault` **subdirectory**, not `luna-vault\`) |
| Repo canon this note points at | `C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright\docs\design\SPEC-V2.md` |

---

## Edit 1 — new note

**Create** `Luna Vault\brain\applywright-design-system.md` with exactly this content:

```markdown
---
type: reference
project: applywright
confidence: verified
last_verified: 2026-10-28
source: repo
tags: [brain, applywright, design, dark-mode]
---

# Applywright — design system (Working Proof / Pressproof)

Canon lives in the project repo, not here: `projects/applywright/docs/design/SPEC-V2.md`
(`C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright\docs\design\SPEC-V2.md`).
This note is the B-side summary and pointer; when the two disagree, SPEC-V2 wins.

## What it is

The marketing site and app are hand-written HTML/CSS/JS served by `node server/index.js` on
port 3160. The design system is **Meridian**, re-keyed for this product: ink and bone, a serif
display face, mono for metadata, one green. The promise is **Working Proof** (every rewrite
traceable to its source); the visual mechanism is **Pressproof** — desk-mat surfaces for controls,
paper reserved for user artefacts, redline proofs with inline `[CV §2]` citations, vernier gauges
instead of donut rings.

Shipped hero H1: **"Your numbers stay. The wording moves."** Proof line: **"Nothing invented."**
The score is presented as an advisory rubric with published weights (35/20/20/15/10), never as an
employer's verdict.

## Where each piece lives in the repo

| Concern | File |
|---|---|
| Palette, both schemes; type, space, shape, motion tokens | `public/assets/tokens.css` |
| Product re-key, dark-mode component rules, vernier gauge, theme control, motion additions | `public/assets/theme.css` |
| Theme resolution before first paint, three-state control injected into `.nav__actions`, `theme-color` meta | `public/assets/theme.js` (blocking `<script>` in the five marketing page heads) |
| Components, page composition | `public/assets/site.css` — **not** the theme layer's file |
| Motion layer already in place | `public/assets/motion.css` (loaded via `partials/nav.html`) |
| Static self-check (8 pages, includes, class definitions, CSP rules, copy hygiene) | `scripts/check.js` |
| This pass's screenshots (light and dark, 1440/768/360) | `screenshots/40-* … 52-*` |
| Design inputs and the three outside reviews | `docs/design/RESEARCH-*.md`, `docs/design/DIRECTION-{codex,gemini,grok}.md` |

## The three rules that must not be broken

1. **Never rename or delete a token.** Every page depends on the existing names; additions are
   fine, renames are a migration. The dark palette is `:root[data-theme="dark"]` in
   `tokens.css`, and the switch is one attribute set by `theme.js` before first paint — there is
   deliberately no `@media (prefers-color-scheme: dark)` block, so pages without `theme.js` keep
   their component rules intact.
2. **`--ink` is frozen.** It is the cover band (hero, footer, `.section--dark`) in both schemes.
   Anything that inks on paper uses `--mark` instead, or it vanishes in dark mode (1.08:1).
3. **Measured, not chosen.** Every text pair is ≥4.5:1 on every surface in both schemes and every
   rule or ring that carries meaning is ≥3:1; the receipt table is `SPEC-V2.md` §4 and the same
   numbers are in `theme.css` §7. Change a colour, re-measure, update both.

## Known gaps at this date

Sign-in, sign-up and `/app` do not load `theme.js`, so a dark choice is lost when navigating into
the authenticated app. The hero still carries browser chrome and the Before/After bubbles; the
advert-beside-the-CV composition is specified in `SPEC-V2.md` §8.1 and not built. `.hero__grad`,
the old scroll reveal and the `.pill--live` pulse are recommended for retirement.

## Verification

`node scripts/check.js` → 8 pages, 24 server modules, 0 errors, 0 warnings. Contrast: 66 pairs,
0 failures in both schemes. Headless Chrome: 23 assertions, 0 failed, 0 console errors.
```

---

## Edit 2 — link it from the index

The vault rule is **every brain note is linked from `brain/_index.md`**. Add one line to
`Luna Vault\brain\_index.md`, in the **Patterns & Knowledge** list, immediately after the
`[[brain/sites-building|Sites building]]` line:

```markdown
- [[brain/applywright-design-system|Applywright design system]] — Meridian re-keyed for Applywright: ink/bone, serif display, mono metadata; "Working Proof" promise, "Pressproof" mechanism; light+dark palettes with measured contrast, `data-theme` resolution before first paint, three-state theme control. Canon is the repo's `docs/design/SPEC-V2.md` (28 Oct 2026).
```

---

## How to apply

1. Create the note (Edit 1) with the code block's contents, frontmatter included.
2. Open `_index.md`, paste the line (Edit 2) under **Patterns & Knowledge**, after the
   `sites-building` row.
3. In Obsidian, open the new note and confirm the wikilink in `_index.md` resolves (the link text
   shows as *Applywright design system*, not a red link).
4. Commit in the vault repo — remember the git root is the `Luna Vault` subdirectory:

```
cd C:\Users\johan\Desktop\Coding\OpenClaw\luna-vault\Luna Vault
git add brain/applywright-design-system.md brain/_index.md
git commit -m "brain: add Applywright design system note (Working Proof / Pressproof)"
```

`.bak` and `.fixup` files are gitignored there; the vault has no remote, so the commit is a local
backup.

## What this patch deliberately does not do

- It does not copy `SPEC-V2.md` into the vault. The repo is canon and changes with the code; a
  pasted copy would drift the way the A/B mirrors already do elsewhere.
- It does not touch `brain/_directives.md`, `operator-preferences.md` or any existing note body
  other than the single index line.
- It records no secrets, tokens or vault credentials.
