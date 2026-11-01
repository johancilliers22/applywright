# Consolidated review of Codex's Applywright work — before it continues

31 October 2026, 20:55Z. Written by the original DSH desktop lane after a full re-scan (nothing has been committed in
two days) and three parallel read-only reviews: G1 R10, accessibility, and the native receipt ledger. Companion
files, all in `docs/coordination/reviews-20261031/`: `G1-R10-REVIEW.md`, `A11Y-R4-BRIEF.md`, `LEDGER-GAPS.md`.

**Nothing was edited, committed, dispatched or executed for this review.** The authoritative verdicts remain the
independent Sol reviews; this is what a careful reader should know before re-dispatching.

---

## 1. Scan: the project is frozen and one class of evidence is outside git

```
main            a1d7592, pushed — zero commits since 29 Oct 19:27
working tree    67 rows = 5 modified tracked + 62 untracked, 0 staged
authority       docs/resume/20261029/NATIVE-DISPATCH-STATUS.json (19:48:58Z, 17 tasks)
NOT authority   docs/t3/receipts/20261029-resume/CURRENT-CHECKPOINT.json (19:10:16Z, 15 tasks) — stale
```

**The receipt tree cannot be committed.** `.git/info/exclude:9` contains `/docs/t3/receipts/`, so the entire native
ledger — now **1,073 files / 10.9 MB**, including every payload, `REVIEW.md`, admission and terminal identity — is
invisible to `git status` and will not be staged by any `git add`. That is a deliberate local-only choice, but it
means: a clean clone, a reset, or a `git clean` destroys the only record of 17 delegated tasks. The hold note and
the 62 untracked docs are the only durable pointer to it.

**Fix before anything else:** either commit a compact manifest of the ledger (paths + SHA256 + verdict per lane) or
state explicitly that the tree is local-only and archive it out of the repo. Right now the project's evidence chain
depends on one machine's working directory.

---

## 2. G1 R10 — substantive, but **not dispatchable as-is**

Verdict from the source review: every R9 finding has a repair and an authored test, but **R10 cannot pass its own
retained suite**, and both failures are derivable from the bytes without running anything:

1. **F9 contradiction.** `tailor.test.mjs:1705` (frozen R8 row) is still asserted through `BOTH` at `:1721-1722`,
   while R10's own control `tailor.test.mjs:2629-2646` and refine test `refine.test.mjs:1762-1786` assert that
   `groundChanges` *refuses* the identical pair. Guaranteed red. The writer's report records the conflict
   (`GROUNDING-G1-R10-RESULT.md:284-298`) but not that the suite fails, and proposes no disposition.
2. **`raw`-text regression (F4).** `refine.js:387-412`, `:410`, `:862` now produce
   `figure 100000000 requests was dropped`, while retained R9 assertions pin `/figure 100000000 was dropped/`
   (`refine.test.mjs:1435`, `:1645`). Not mentioned in the report at all.

Also: **F4 PARTIAL** (clause-separated swaps fixed; same-clause reassociation still possible and the new
set-intersection is wider than R9's), **F9 not addressed in executable terms**, new duplicated logic
(`figureLexicalUnit` vs `lexicalUnitToken`, two measure helpers with divergent stop lists), and unlabelled widened
allowances (`tailor.js:4108` `predicateLike`+head exemption; source-side copular employer evidence at `:638` without
the target-side ordinary-complement filter).

**Recommendation:** a narrow, operator-authorised **R10.1** before the Sol dispatch is retried — change or skip the
frozen 1705 row *with a recorded adjudication*, and either keep `raw` digits-only or re-baseline the two R9 rows.
Then re-dispatch the existing payload (`c223a136…`) with a fresh `clientRequestId`. The nine checks the re-dispatched
reviewer should make are listed in `G1-R10-REVIEW.md` §5.

**My own verification** (independent of the reviewer): R9→R10 is `tailor.js +487/−105`, `refine.js +99/−33`,
tests `+364/−1`; **0 test declarations removed, 11 added, 0 assertions removed, 35 added** — so the "134 definitions"
arithmetic is sound and nothing was quietly deleted. The hard guards (`is not in the original` ×15,
`COMMON_VERBS` ×13, contact-data ×5, integer-index check) are all still present.

---

## 3. Accessibility — my proposed design was wrong; take the reviewed one

I had proposed replacing ID relocation with a per-load random namespace. The review found that **fails three
ways**: `a11y-focused.test.mjs:548-576` reads an *observed* generated id and supplies it as a later caller id, so
randomness changes the value and not the collision; two current definitions assert exact `field-1`/`hint-3` shapes
(`:275`, `:277`); and the binding decision (`A11Y-R3-ID-OWNERSHIP-DECISION.md:16-17`) explicitly refuses randomness
as proof.

**Recommended instead (design A):** keep relocation, add per-node ownership, and enforce the missing invariant —
*the helper's own token must be text-unique on its control* — at both allocation points, plus a separate
`ownedControls` map so a later supplied `field-N` **renames the earlier generated id and its label `for`** (never
the caller's id). That closes both P2s on the reviews' own traces in ≈55 lines touching `public/app/app.js` only,
with all 46 current test intents intact. Full function-level design, 9-case test matrix and preserved-behaviour list
in `A11Y-R4-BRIEF.md`.

---

## 4. Ledger — resume from the right file, and repair three claims

- **Authority:** `docs/resume/20261029/NATIVE-DISPATCH-STATUS.json` (19:48:58Z, 17 tasks). Do **not** resume from
  `CURRENT-CHECKPOINT.json` (19:10, 15 tasks, still marks three lanes "running").
- **Three lanes claim `completed` with no terminal receipt:** `g1-r9/review`, `a11y/r3/review`,
  `windows-finite-case-r2`. Their outputs exist and were consumed (the R9 review was consumed at 19:28), so the
  work is real — the *receipt* is missing. Either obtain a terminal observation or label them "output written,
  terminal unobserved". Do not let a missing receipt read as a missing result.
- **Two orphans:** the Windows R2 independent review was never authored (no directory, no payload — its eight
  hashes are in `LEDGER-GAPS.md` §2.1), and the WSL predicate case was commissioned at 19:06 and never dispatched.
- **Provenance:** all 17 tasks (and 15/15 in the stale checkpoint) leave `servedIdentity`/`tokens`/`cost` null.
  That is honest — keep it null, never zero or estimated. Note the "211 independent comparisons" is a static count
  across five R7 evidence files (52+31+48+24+56) and `retained211: NOT_RUN`; the "38" accessibility test intents are
  38 `test(` in 9 `describe(`, also zero executed.
- **Service-tier mismatch worth resolving:** the policy says Johan's manual Fast selection on T3 parents is preserved,
  but the only fresh parent readback in the ledger (18:37:40Z) shows `serviceTier: default`. Either the policy was
  applied after that readback or the selection did not take. Verify from a fresh native readback before any claim
  about tier is made — and do not silently reset a Fast parent to Standard to "match the receipt".

The 12-step before-you-continue checklist with pass conditions is `LEDGER-GAPS.md` §6.

---

## 5. The systemic point, which matters more than any single finding

The grounding lane is at round **R10** and the accessibility lane at **R3**, and **not one test has ever been
executed** — the Windows EX qualification is still unapproved, so every candidate is source-only. That is not a
failure of Codex's discipline (the receipts are unusually honest about it); it is the shape of the queue. Five
rounds of source review have found, between them, two guaranteed-failing tests, one text regression, three missing
terminal receipts, and one orphaned review. Every further round costs review attention and adds unverified bytes.

**So: no new rounds until an executor exists.** When Codex returns, the sequence should be:

1. Make the ledger durable (§1) and fix the three receipt claims (§4) — structural, not product.
2. One narrow **R10.1** writer (the two defects in §2), then retry the Sol dispatch with the existing payload.
3. One narrow **A11Y R4** writer using design A, then one Sol review.
4. Get the Windows EX executor approved; run the three tests named in `G1-R10-REVIEW.md` §4 first, then gates.
5. Only then the two orphans (Windows R2 review, WSL predicate case).

---

## 6. Corrections to my own earlier advice

- My a11y namespace design (B) is **wrong** for this codebase — evidence in §3. Discard it.
- My `isCountOne` duplication finding was **adjudicated**: bodies match, delegation intact at `refine.js:363-366`,
  maintenance concern only. Do not hoist helpers to satisfy it.
- My static a11y audit under-read the existing save path; the Sol reviews are the defect authority, not my audit.
- My gate numbers were unleased and the operator rightly refused to corroborate them; they are not evidence.

— Original DSH desktop lane, 2026-10-31T20:55Z
