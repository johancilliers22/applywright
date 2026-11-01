# DSH review — G1 R7 candidate, and the a11y brief about to be dispatched

29 October 2026, 17:25Z. Read-only review for the Codex operator and broker. **No Git write, no commit, no server
start, no test/build/native/browser phase under SOURCE** — the three gate numbers quoted below are labelled
informational.

## 1. State verified

| Fact | Evidence |
|---|---|
| HEAD | `6e6c13f` "Docs: publish final closeout and tomorrow handoff" (= resume plan's base) |
| Night commits | `8df799f` E2E + checkpoint, `8c595df` offline state, `6e6c13f` closeout docs |
| App/tunnel | **stopped** — port 3160 has no listener; pid `15812` is now `svchost.exe` (PID reuse), the closeout record's stop is genuine; `cloudflared` running is T3's own tool tunnel (`…\t3\tools\cloudflared\…\tunnel … run`, no `--url`) |
| Gates at HEAD (informational, no EX) | HTTP **213 tests / 209 pass / 4 skipped / 0 fail**; modules **350 / 349 pass / 1 skipped**; `check.js` **0 errors, 0 warnings**, 58 contrast comparisons |
| Working tree | 35 dirty paths, all other lanes' receipts; my three artefacts still **untracked** (see §4) |
| Schedulers | still `[]` — none recreated, as instructed |
| A11Y task | **not yet dispatched** — no `docs/t3/receipts/20261029-resume/`, T3 mission list unchanged |

## 2. G1 R7 candidate — structural review (feeds the Sol review, not a substitute)

**Integrity: verified.**

```
patch  docs/closeout/20261029/G1-R7-UNREVIEWED-CANDIDATE.patch
sha256 48bcf2bf468f996b17840886ce91f03bd30dfcba1457d03c0528ace151a8ec2e  == manifest ✓
scope  server/lib/cv/{tailor.js, refine.js, tailor.test.mjs, refine.test.mjs}  (4 files, none other)
base   3b84986; current HEAD blobs for all four are byte-identical to that base → applies cleanly
shape  +4378 / −239 lines · 55 hunks · +50 test declarations, 6 replaced · +233 assertion/assert calls, −14
```

**Coverage of the c7 bypass repros is retained, not dropped.** Added occurrences in the candidate: `Initech` 31,
`Zephyria` 13, `Effectively led` 8, `Initech-labs` 7, multiline 5. The 6 replaced tests are the c7-era names
(soft-mode opener, line-by-line ownership, hyphen licensing, fabricated-employer repro) superseded by R2–R7
variants. Product-code removals (189 lines) are refactors — figure parsing rewritten to carry `index`/`end`,
`unitKind`, month set, curated-word phrase building — not guard deletions; the c7 safeguards reappear, e.g.
`isCountOne` (so "one" as a count is not a returned figure) and the integer-index requirement for bullet rewrites.

### F1 — the patch removes a stated anti-drift rule and then duplicates the helper it protects

This is the one finding I would send back before integration. The patch **deletes** this comment from `refine.js`:

```text
* checks — dates, qualifications, job titles, employers and other proper nouns —
* are delegated to `assertGrounded` in `cv/tailor.js`, which already encodes that
* philosophy and keeps the two modules from drifting apart.
```

…and **adds `isCountOne(source, index)` twice, byte-identical**, at patch positions ~L92 (`refine.js`) and
~L1017 (`tailor.js`):

```js
function isCountOne(source, index) {
  const before = /([A-Za-z]+)\s*$/.exec(source.slice(0, index));
  if (before && ["no", "any", "every"].includes(before[1].toLowerCase())) return false;
  …
}
```

Same class of seam as the earlier `hasLayoutRisk` duplication (which had to be hoisted into `text.js` because the
two modules drifted). Two copies of a regex pair will diverge the first time one is touched. This is not a reason
to reject the candidate's behaviour — 233 added assertions and a parity test (`every fabricated orchestrator
change is refused by both exported predicates`) mitigate it — but it is the exact thing the Sol review should
rule on: **hoist to one module and import, or add a blocking parity test for the helper itself.**

### F2 — what I explicitly could not verify

- Semantic correctness of the 233 new assertions, phrase anchors, claim-role provenance and the hypothesised
  `design → design reviews` / vendor-as-employer transfers: Sol's job, with the frozen manifest hashes.
- The EX numbers (100 units + 211 independent comparisons) — quoted from the manifest, **not re-run**; no EX here.
- Legitimate-English/paraphrase controls: the candidate keeps a large accepted corpus, but I did not execute it.

**Recommendation:** dispatch the Sol review against the frozen hashes as the resume plan says, and add F1 to its
scope. Do not integrate on my structural read; it says "nothing obviously weakened", which is not "accepted".

## 3. A11Y brief — facts to give the writer *before* dispatch (it is not yet running)

The commission says "inspect the real current DOM construction; do not blindly apply stale snippets". Current
facts, measured just now at `6e6c13f`:

- **`field()` really is the only hint builder**: `public/app/app.js:700`. **21 `field(` calls**, hints passed for
  File/OCR, minimum salary, password, locations, capture text. There is **one manual `aria-describedby`** in the
  SPA (`app.html:161,174` — the bookmarklet textarea, id `linkedin-capture-help`). A writer that overwrites
  `aria-describedby` on that control breaks the bookmarklet help; the fix must **append** to existing tokens.
- **Editor save node**: `public/editor.html:52`, `<span class="mono ed-save" id="ed-save-state" data-savestate
  data-state="loading">`. **`setSaveState()` is at `editor.js:1148`** and writes `dataset.state` + `textContent` on
  every `[data-savestate]` node — one static node, but select by attribute, not id.
- **Do not double-announce**: failures already use `role="alert"` (`editor.js:1138`). The polite live region should
  carry `loading/busy/saved` only, and `polite` (not assertive) so Ctrl+S does not interrupt typing.
- **Save semantics**: `TOMORROW.md` records a help-copy contradiction — `editor.html:311` says accept *then*
  separate save while the button says "Accept and save" and `acceptHunk` saves. Do not "fix" that by removing save
  calls; it needs a preview/API contract. The a11y task must not change save behaviour.
- **Preserve the 7 existing `aria-describedby` tokens** on editor textareas (`editor.html:121–173`).

## 4. My untracked artefacts (operator decision needed)

| Path | Content |
|---|---|
| `docs/coordination/DSH-ORIGINAL-SESSION-RECONCILIATION-20261029.md` | provenance reply to Codex, including the `d204703` parent correction |
| `docs/verification/20261029-a11y-app-editor/` | static a11y audit + apply-ready D1/D2 patches + probe |
| `docs/verification/20261029-docs-truth/` | 66 stale count claims split into 21 living / 45 historical + probe |

Resume-plan item 5 (living-doc reconciliation) is exactly the third row: `PIPELINE.md:122` still says
"150 pass, 0 fail" today. Nothing in these three files is committed; commit or discard, and tell me which.

## 5. What I can take next without colliding

Items 1 (G1 review) and 2 (a11y) are broker-dispatched; item 3 is a docs-only research worktree. The unclaimed,
non-colliding slice is **item 5's docs reconciliation** — I already hold the exact 21/45 split. If the operator
wants it, assign a worktree and I will produce the corrections as a named-path patch rather than editing main.

— Original DSH desktop lane, 2026-10-29T17:25Z
