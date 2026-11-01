# Next Muse brief — advisory refutation of the motion proposal

**Issued by:** DSH Flash/high research sub-agent, 29 October 2026.
**For:** Muse Wonder, contributor-OFF, through the existing qualified native route.
**Nature:** advisory critique only. Muse never authorises an action, never accepts a
change, and never becomes a second research owner. The project operator
(`01a183ff-e374-7d32-ae0e-1938714e813c`) decides.

This is a bounded critique brief, not a new research stream. It does not start a child,
allocate a worktree, or grant any execution.

---

## 0. Constraints

- **Contributor mode OFF.** No training/contribution opt-in; if the harness cannot verify
  it, stop and report that, do not proceed.
- **Source-only.** Read the named files and, if your harness allows, the cited public
  pages. No browser, GUI, estate-cua, sign-in, X, product/model API, tests, builds, or
  repository cloning. No secret/auth/config/profile intake. No commit.
- **Advisory tone.** Your value is refutation, not agreement. A brief that says "looks
  good" has failed.
- **One output:** a critique document plus a short result. Do not write implementation
  patches, do not rewrite the plan, and do not create a competing design.

---

## 1. Read

Absolute read-only paths (may be uncommitted and absent from a new worktree):

1. `C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright/AGENTS.md`
2. `.../docs/resume/20261029/RESUME-PLAN.md`
3. `.../docs/research/20261029-design-motion/RESEARCH.md`
4. `.../docs/research/20261029-design-motion/ADOPTION-PLAN.md`
5. `.../docs/research/20261029-design-motion/SOURCES.json`
6. `.../docs/design/SPEC-V2.md` §5
7. `.../docs/MOTION.md` §1, §3, §6, §7, §9
8. `.../docs/design/GEMINI-LEAD-REVIEW-20261028.md` §3.1, §3.3, §3.4
9. Current source, statically: `public/assets/motion.css`, `tokens.css`,
   `public/assets/editor.css`, `editor.js` (especially 1090–1161, 1354–1399),
   `public/app/app.js` (4123–4168), `app.html` (105–111)

Do not fetch or reason about private bookmark content. Public primary sources are fine;
the citations are in `SOURCES.json`.

---

## 2. Questions to answer (closed set)

Answer each with a verdict — **SOUND**, **OVERSTATED**, **WRONG**, or **UNVERIFIABLE** —
plus the source or line that decides it. Do not expand the set.

1. **The central claim.** "The right move is zero new dependencies: guard the four smooth
   scrolls, add `@starting-style` to editor state changes, and cross-fade SPA routes."
   Is this sufficient for a "professional fluid" result, or does it under-deliver?
2. **The VT deferral.** The plan refuses same-document View Transitions until route
   renderers return a node. Is that deferral justified by `app.js:4123-4160`, or is there
   a smaller correct commit point the plan missed?
3. **The AutoAnimate rejection.** It is rejected for animating width/height and for
   observer/interval machinery. Is that a fair reading of the cited source (`SOURCES.json`
   S18), or does the rejection over-weight implementation detail against a real benefit?
4. **The Motion rejection.** It is rejected on 922,802-byte package size with a
   `framer-motion` dependency. Is package-level `unpackedSize` a legitimate adoption
   argument for a vanilla app that would import one subpath? Where exactly does the
   argument stop being honest?
5. **The "opacity is not motion" reading.** WCAG 2.3.3's definition excludes colour,
   blur and opacity changes "which do not change the perceived size, shape, or position."
   Does the plan lean on that too hard to avoid reduced-motion work?
6. **The editor save marker.** Adding a colour/opacity transition to a status that already
   changes text — does this add signal, or is it decoration that could make "saving" look
   successful before the server answers?
7. **The dock.** A 120 ms sticky dock that appears on dirty state. Does it survive WCAG
   2.4.11 in the plan's own formulation, or does `scroll-padding-bottom` fail when the
   dock's height changes with the message?
8. **The one-move-per-surface canon.** The plan keeps the 560 ms hero trace and adds a
   route crossfade and a save transition. Is "one move per surface" still coherent, or has
   the definition been stretched until it means nothing?
9. **The evidence base.** The plan cites historical operator measurements from
   `docs/MOTION.md` and live upstream support data, but measured nothing itself. Which
   recommendations could be invalidated by a single rendered test, and which are
   source-factual regardless?
10. **The biggest omission.** Name one thing the plan does not consider that would change
    the ranking. Only one; justify it.

---

## 3. What a useful answer contains

- A short verdict table for questions 1–10.
- For each OVERSTATED/WRONG: the exact sentence or claim, the contradicting evidence, and
  the smallest correction.
- A list of claims that are **UNVERIFIABLE without a browser** (do not ask for one; just
  label them).
- A "what I would cut first" paragraph: the single phase or rule you would remove to
  reduce risk, and why.
- A "what I would keep" paragraph: the one thing that is load-bearing and must not be
  weakened.

Do not:
- propose a different visual direction or a new aesthetic;
- propose a library, framework, or build step;
- restate the plan as your own;
- claim rendered, pixel, performance, or AT evidence;
- edit the plan, the research, or any product file.

---

## 4. Handback

Return: critique path, SHA-256, byte length, contributor-mode evidence, the model identity
actually served, and token/cost only if exposed (else `UNKNOWN`). Stop after the critique.
Do not start another child, do not commit, and do not mark anything accepted.
