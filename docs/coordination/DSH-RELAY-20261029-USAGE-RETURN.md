# DSH relay to the Codex operator / T3 orchestration — for when the usage limit returns

29 October 2026, 19:20Z. Written by the original DSH desktop lane after re-scanning everything Codex did between
the 17:16 resume and the usage cutoff. **No Git write, no commit, no dispatch, no restart, no model call.** Advisory
input outside the native ledger; the native receipts remain the authority.

Read order on return: `docs/resume/20261029/RESUME-PLAN.md` → `docs/t3/receipts/20261029-resume/CURRENT-CHECKPOINT.json`
(the 19:10 snapshot) → `docs/t3/receipts/20261029-resume/NATIVE-DISPATCH-STATUS.json` → this file.

## 1. Where it actually stopped

```
main           a1d7592 "Docs: resume native missions and record Root qualification gates"
               pushed (origin/main == a1d7592); one commit since the resume base 6e6c13f
working tree   63 paths: 58 untracked (the whole docs/t3/receipts/20261029-resume tree
               plus my four advisory files), 5 modified (AGENTS.md,
               IMPLEMENTATION-REGISTER.json, OPERATOR-CONTINUATION-PLAN.md,
               RESUME-PLAN.md, VAULT-PUBLICATION-RECEIPT.json)
native ledger 15 tasks, all terminal + reaped, hashes unchanged
last checkpoint state: FINITE_R2_SOURCE_PROPOSAL_AND_A11YR3_G1R9_INDEPENDENT_REVIEWS_RUNNING (19:10:16Z)
tests/build/native/browser: NOT_RUN — EX boundary json says Execution: NOT_RUN, no approved
               Windows offline executor, one narrow Source composition then Sol/Root review
worktrees     27 preserved under C:\Users\johan\.t3\worktrees\applywright (none pruned)
```

**The cut fell between dispatch and result on two lanes.** That is the first thing to resolve, before any new work:

| Lane | Last recorded | Result |
|---|---|---|
| G1 R9 writer | terminal, `t3-76750b9f`, 5 identities verified | candidate exists, **not accepted** |
| G1 R9 independent review | dispatched 19:08:51, `task.identity.native.json` 19:10:16 | **no REVIEW.md → UNKNOWN, assume unread** |
| A11Y R3 writer | terminal, `t3-6e5f7dd4` | candidate exists |
| A11Y R3 review | REVIEW.md present | **REQUEST_CHANGES — 2 × P2** (§3) |
| Windows finite-case R1 | review present | **REQUEST_CHANGES, runtime BLOCKED** |
| Windows finite-case R2 | dispatched, review dir empty | **UNKNOWN** |
| WSL predicate case | commissioned 19:06, `t3-a4173ab2` | **never dispatched** |

## 2. What the round produced — and the verdicts

- **G1** has been through R7 → R8 → R9. R7 was reviewed with seven behavioural classes; R8's review was
  **REQUEST_CHANGES** ("unguarded undefined-property …"); R9 corrected it. G1 has **never** had a clean independent
  review, and no G1 source has ever run a gate.
- **A11Y** has been through R1 → R2 → R3, each followed by an independent Sol review. The R1 report is the one that
  mattered: it found the test import/bootstrap failure, two eligible loading-live routes, a hint-ID collision and
  suppressed-kind dedupe. R2 fixed them; R3 added the ID-ownership handling demanded by
  `docs/resume/20261029/A11Y-R3-ID-OWNERSHIP-DECISION.md`; the R3 review found two remaining P2s (§3).
- **Research / design-motion** completed, adjudicated, frozen (`docs/resume/20261029/RESEARCH-ADJUDICATION.md`).
- **Terra**: Root's receipt records one synthetic pilot — xhigh 45/45, high 43/45, `SourceUnchanged: true`, and
  **cost/tokens/latency all null**. That is a bounded pilot, not adoption. estate-cua got a limited driver release
  only (Sol/DSH interactive); no project CUA call was made.
- **My own F1 finding is adjudicated and should not be re-litigated**: the two `isCountOne` bodies are confirmed
  present and matching, the delegation to `assertGrounded` remains at `refine.js:363-366`, and the operator ruled
  the duplication a maintenance concern rather than a behavioural blocker — **do not hoist helpers or expand the
  four owned files to satisfy my advisory.**

## 3. What I would fix first — and it is a design simplification, not another patch

### 3.1 A11Y R4: stop relocating; give the helper an unguessable namespace

The R3 review's two P2s are both consequences of the same choice — the helper generates plain IDs (`hint-N`,
`field-N`) in the same string space as caller IDs, then *repairs* collisions by relocating its own nodes:

- **R3F1** — a caller's pre-existing token text (`describedby="hint-1 keep-help"`) is mistaken for the helper's own
  reference, so relocation rewrites a token the caller owned.
- **R3F2** — a later caller-supplied `field-1` collides with an earlier *generated* `field-1`; relocation finds no
  owned hint to move and two controls end up sharing one ID.

Both are "impossible by construction" problems that are being solved by reachability logic. The cheap correct
design is:

1. At module load, create a per-load random salt: `const HINT_NS = "f" + randomSalt(8);` (crypto-backed, 8–10 chars).
2. Generated IDs are `${HINT_NS}-h` / `${HINT_NS}-c` — a caller writing a literal at author time cannot guess it, so
   the predetermined-detached-control case in the R3 decision cannot arise.
3. Track **owned tokens** in a Set keyed by the node itself (`WeakMap<node, string[]>`), never by comparing token
   text. `describedByWith()` appends only owned tokens; caller tokens are never parsed for meaning.
4. Delete `relocateOwnedHint` entirely. Nothing moves, so nothing can lose a reference.

That keeps every contract the R3 decision states (caller IDs preserved, labels preserved, non-owned tokens and their
order preserved, no strong global references retaining detached trees) with less code than the relocation it
replaces. The decision doc explicitly allows "a smaller correct design [that] meets the whole current contract".

If the operator prefers the relocation design anyway, R3F1 alone still blocks SOURCE acceptance, so R4 has to fix
token-ownership bookkeeping regardless.

### 3.2 The real queue-level blocker is EX, not the candidates

`docs/resume/20261029/EXECUTION-BOUNDARY.json`: no approved Windows offline executor; **all** required gates are
NOT_RUN for every candidate since the resume. Every round since R7 is therefore source-only. The next useful step
is not R10 — it is Root approving one narrow Windows offline executor so the accumulated candidates can actually be
run. Until then, more rounds only stack unreviewed, unexecuted source.

### 3.3 Housekeeping that costs nothing and prevents loss

- 58 untracked receipt files are the **only** record of 15 native tasks, two reviews and four frozen candidates.
  Commit them (operator, named paths) or state explicitly that they are local-only; either is fine, silence is not.
- `docs/resume/20261029/RESUME-PLAN.md` is modified but uncommitted since 18:31 — the plan the next session is told
  to read is not in git.
- My four advisory files are untracked by design: `docs/coordination/DSH-ORIGINAL-SESSION-RECONCILIATION-20261029.md`,
  `docs/coordination/DSH-REVIEW-20261029-G1R7-AND-A11Y.md`, `docs/verification/20261029-a11y-app-editor/`,
  `docs/verification/20261029-docs-truth/`, plus this relay.

## 4. Corrections to my own earlier advice (so it is not trusted beyond what it earned)

- My a11y audit **under-read the save path**: it reported "0 live regions" as if save feedback were absent, but the
  editor already carries save-success/dirty messaging; the R1 review found the real defects in the controller. Use
  the Sol reviews, not my static audit, as the defect list.
- My gate numbers were informational and unleased; the operator explicitly refused to corroborate them. Do not cite
  them as evidence.
- My structural read of R7 said "nothing obviously weakened". The Sol review found seven behavioural classes, so the
  structural read was worth less than it looked.

## 5. Ordered next actions when usage returns

1. **Recover the two UNKNOWN reviews** rather than re-running work: read the native thread state for the G1 R9
   review (`docs/t3/receipts/20261029-resume/g1-r9/review/task.identity.native.json`) and the finite R2 review. If
   orphaned, re-dispatch against the same hashes — `t3-76750b9f` for G1 R9, and the finite R2 manifest already in
   the tree.
2. **A11Y R4** with §3.1's design; then one independent Sol review; then (only) gates under an approved executor.
3. **G1**: consume the R9 review verdict; correct only what it names. Do not open R10 before that.
4. **Dispatch the WSL predicate case** that was commissioned at 19:06 but never launched, if its inputs are still
   valid (`docs/resume/20261029/WSL-PREDICATE-CASE-COMMISSION.md`).
5. **Ask Root for the finite EX executor** — it unblocks every lane at once.
6. Commit or explicitly localise the receipt tree and the resume plan.

## 6. Decisions that are Johan's, not an orchestrator's

- Approve a Windows offline EX executor (the actual blocker).
- Terra adoption: bounded pilot 45/45 at xhigh is not adoption; product and critical review use remain gated.
- Whether A11Y keeps the relocation design or takes the namespace simplification in §3.1.
- Disk cleanup: deferred by Johan's instruction; nothing here touches it.

— Original DSH desktop lane, 2026-10-29T19:20Z

---

## Update, 31 October 2026 — superseded in part by a full re-review

Nothing was committed or dispatched between 29 Oct 19:48 and this note. Three read-only reviews have since landed
and change the "next actions" above:

- **`docs/coordination/DSH-REVIEW-20261031-CODEX-WORK.md`** — the consolidated review (read this first).
- **`docs/coordination/reviews-20261031/G1-R10-REVIEW.md`** — R10 is **not dispatchable as-is**: the frozen R8 row
  at `tailor.test.mjs:1705` contradicts R10's own control, and the F4 `raw` change breaks two retained R9
  assertions. Needs a narrow R10.1 before the Sol retry.
- **`docs/coordination/reviews-20261031/A11Y-R4-BRIEF.md`** — design A (ownership + unique-token invariant), **not**
  the namespace design this relay proposed; B fails three current definitions and the binding clause.
- **`docs/coordination/reviews-20261031/LEDGER-GAPS.md`** — authority file, three lanes with missing terminal
  receipts, two orphans, and the 12-step resume checklist.

Also new since this relay was written: `.git/info/exclude:9` ignores `/docs/t3/receipts/`, so the 1,073-file native
ledger is outside git. Make it durable before resuming.