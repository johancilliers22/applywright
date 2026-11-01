# Next Gemini brief — implementable motion design (qualified, source-only)

**Issued by:** DSH Flash/high research sub-agent, 29 October 2026.
**For:** the Gemini lead visual-design author, through the already-qualified
Antigravity/AGY subscription route.
**Commissioning path:** the existing broker `46ac76de-4e76-42b4-a2b1-9f6d4e09c559`; the
project operator `01a183ff-e374-7d32-ae0e-1938714e813c` alone commissions, integrates,
accepts and commits. This brief does not start a child, allocate a worktree, or authorise
execution.

---

## 0. Non-negotiable preconditions

1. **Work in a new assigned worktree** from the operator's accepted base. Own exactly one
   design document plus your own result report. No product/source/test/package/config
   edits, no other worktree, no vault/brain writes, no commit or push.
2. **Source-only.** No server, build, test, Node, browser, GUI, estate-cua, model API, or
   product execution. Do not attach Johan's Chrome, copy a profile, or read cookies,
   tokens, auth/config files, or `.env`.
3. **Preserve the existing direction.** `Pressproof` (paper for artefacts, desk for
   controls), ink/bone, system stacks, one green, the copy rules, and every implementation
   plan row stay. You are specifying motion and interaction inside that system, not
   redesigning it.
4. **No new dependency.** The recommendation under review uses native CSS, the Web
   Animations API, and View Transitions only. A library proposal is out of scope.

---

## 1. Media-delivery qualification is still owed — read this before any visual claim

The prior Gemini report (`docs/design/GEMINI-LEAD-REVIEW-20261028.md` §0) recorded
`pixelsReceivedByVisionRoute: false`. It verified 14 pinned PNGs by length, timestamp and
SHA-256, but the vision route returned no decoded pixels; the report therefore made
**zero pixel observations**. Its proposals are source-backed design reasoning, not a
visual validation, and none of its motion is implemented.

That gap is **not closed** by this research task either: no browser, screenshot decode,
or rendered measurement was performed.

Therefore, before you write a single sentence about how a transition looks:

**Gate A — produce a media-delivery receipt.** For each capture you intend to reason
from, record: absolute path, byte length, UTC mtime, SHA-256, and an explicit statement
that the image tensor was decoded into your multimodal context (not offloaded, not
UTF-8-decoded bytes). If your harness cannot prove that, say so and continue **source-only**
with no visual adjectives. A screenshot on disk is not evidence that you saw it.

**Gate B — only then** write the design. If Gate A fails, the brief is still useful: it
becomes a precise specification with acceptance criteria, explicitly marked
"not visually validated".

Do not ask Johan to sign in, do not open X, and do not wait for another model.

---

## 2. What to read (in this order)

Absolute main paths, read-only; they may be uncommitted and absent from your worktree:

1. `C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright/AGENTS.md`
2. `.../projects/applywright/docs/resume/20261029/RESUME-PLAN.md`
3. `.../projects/applywright/docs/design/SPEC-V2.md` §1, §5, §6
4. `.../projects/applywright/docs/MOTION.md` — the existing contract and the recorded
   measurements (treat the numbers as historical, not yours)
5. `.../projects/applywright/docs/design/UX-REVIEW-20261028.md` §5, §8, §11
6. `.../projects/applywright/docs/design/GEMINI-LEAD-REVIEW-20261028.md` §3.1, §3.3, §3.4
7. This research: `docs/research/20261029-design-motion/RESEARCH.md` and
   `ADOPTION-PLAN.md`
8. Current source, statically: `public/assets/motion.css`, `tokens.css`, `site.css`,
   `theme.css`, `public/assets/editor.css`, `editor.js`, `public/app/app.css`, `app.js`,
   `app.html`, `public/editor.html`

Do not re-derive the option ranking; it is settled. Your job is the **design** of the
four flows named below.

---

## 3. Deliverable

One document: `docs/design/GEMINI-MOTION-DESIGN-20261029.md`, plus your own result
report. Structure:

### 3.1 Design intent (≤ 400 words)

What should motion *mean* on this product? The research position: motion is the visible
consequence of a state change (saved, staged, navigating, replaced), never an entrance
decoration and never a performance. Confirm, qualify, or refute that with source
reasoning. Do not write a manifesto.

### 3.2 Four flow specifications

For each flow, give implementable detail an editor/SPA owner can apply without guessing:

**A. SPA route swap (`/app` → `/app/cv` → `/app/jobs` → `/app/billing`)**
- Exact component boundary: `#app-view` / `#app-main`.
- Two-stage proposal: (2a) 120 ms opacity crossfade now; (2b) 180 ms same-document View
  Transition only after route renderers return a node instead of writing into the mount.
- What holds still (rail, nav, plan line), what moves (body snapshot only), what must
  not be named (`view-transition-name` on sized cards).
- The route-chrome typography and focus behaviour during the swap: heading, `aria-labelledby`,
  `focus({preventScroll:true})`.
- Reduced-motion branch: no snapshot, no crossfade.

**B. Editor save and proposal states**
- Save marker (`#ed-save-state`): colour/opacity semantics for loading, busy, dirty,
  saved, error at 120 ms; the word is the signal, the colour is support.
- Staged hunk: left rule, not a bounce; 180 ms border-colour only.
- Diff-row entry: `@starting-style`, 180 ms, 2 px translate + opacity; rows are not
  focusable until their buttons exist.
- Proposal block (`#ed-proposals`): one arrival, no per-hunk stagger.
- State announcement stays independent: `#ed-status` polite live region; motion never
  replaces it.

**C. Folio / proof surfaces**
- The `.aw-folio`/`.aw-proof` static design is the value; specify the one permitted
  motion (180 ms opacity when a pack replaces another in the same slot) and list what
  must stay still (fact marks, stamps, bullets, citations).
- Print behaviour: no transitions, no transforms.

**D. Responsive interactions / thumb-zone dock**
- Reveal conditions (dirty, saving, error), 120 ms translate/opacity, 44 px target,
  safe-area padding, `hidden` when clean.
- The WCAG 2.4.11 obligation: `scroll-padding-bottom` or focus-aware hiding; prove the
  design does not cover a focused control.
- Drawer/disclosure: 180 ms, 4 px, in place; no slide across the page.

### 3.3 Token and pseudo-element map

A table mapping every proposed transition to existing tokens: `--dur-xs` 120 ms,
`--dur-sm` 180 ms, `--dur-md` 260 ms, `--ease`, `--ease-enter`, `--ease-exit`,
`--ease-settle`. If a value is not already a token, say why and propose a token rather
than a literal.

### 3.4 Reduced-motion matrix

Every row: surface / no-preference / reduce / mechanism (media query, global collapse, or
JS skip). State explicitly which rows are opacity-only (and therefore outside WCAG 2.3.3's
definition of motion animation) and which are translate/scale (and therefore inside it).

### 3.5 Focus, keyboard, AT notes per flow

Where focus goes, when, and what is announced. Name the failure mode you are avoiding
(e.g. focus moved into a node that is still fading, a sticky dock covering the focus ring,
a removed row retaining focus).

### 3.6 Acceptance checks the operator can run later

Concrete enough to be executable: selectors, computed properties, expected animation
names/durations, routes, viewports (375/768/1440), reduced-motion emulation, no horizontal
overflow. Mark them **defined, not run**.

### 3.7 What you are not claiming

No decoded pixels unless Gate A passed; no rendered measurement; no accessibility
conformance certificate; no performance number; no implemented code.

---

## 4. What would make the brief fail review

- Proposing a library, a build step, or a framework.
- Animating `width`, `height`, `top`, or `margin`.
- A motion that plays before the server confirms a save.
- A scroll reveal, parallax, parallax-like translate on scroll, loop, shimmer, or typewriter.
- Motion as the only carrier of status.
- A "delightful" interaction that adds a click or delays reading.
- Any claim of visual validation without a decoded-pixel receipt.
- Any change to save/API semantics, route data loading, or the existing copy.

---

## 5. Handback

Return: the document path, its SHA-256 and byte length, the Gate A receipt (or an explicit
`pixelsReceivedByVisionRoute: false`), the exact model/harness actually served, and
token/cost only if the harness exposes them (otherwise `UNKNOWN`). Do not commit, push,
accept, or start another child.
