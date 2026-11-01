# G1 R10.1 narrow successor — operator disposition

Base: stopped R10 `C:/Users/johan/.t3/worktrees/applywright/t3-bf853bb9`, five
files, hashes in `docs/t3/receipts/20261029-resume/g1-r10/REAP-VERIFIED.json`.
New assigned worktree from main `a1d7592`; copy the five R10 files exactly, then
edit only the four product/test paths plus a new `GROUNDING-G1-R10-1-RESULT.md`.

## Verified defects (operator checked the bytes, 2026-11-01)

1. **Retained unsafe BOTH expectation.** `tailor.test.mjs:1705` is inside the
   frozen R8 byte prefix and sits in the `accepted` list whose loop at
   `:1721-1722` asserts `BOTH(...).ok === true` for
   "Led 12 engineers across two squads." -> "Led a team of 12 engineers.".
   R10's own new control at `:2629-2646` proves `groundChanges` refuses that pair
   (`figure two was dropped`), and `refine.test.mjs:1767` refuses it too. The
   retained row therefore cannot pass.
2. **Dropped-figure display regression.** `refine.js:410` now stores
   `raw: collapse(source.slice(match.index, end))` where `end` includes the
   trailing noun, and `refine.js:862` builds `figure ${entry.raw} was dropped`.
   So "Processed 100000000 requests." reports `figure 100000000 requests was
   dropped`, while retained `refine.test.mjs:1435` and `:1645` require
   `/figure 100000000 was dropped/`. Both retained assertions must keep passing.

## Required corrections

- Remove that pair from the BOTH-accepted expectation. Assert
  `groundChanges` refusal with the dropped-figure reason, and keep
  `assertGrounded` acceptance only in the explicit tailor-only control at
  `:2629-2646` (or an equivalent separate tailor-only control). Do **not** skip,
  xfail, delete or weaken a test or the predicate.
- Add an explicit BOTH-refusal row for the exact historical unsafe pair
  "Led the migration of 14 payment services across 12 teams." -> "Led a team of
  12 engineers." (the existing refusal row at `:1685` uses the weaker target
  "Led 12 engineers."; add the team target).
- Record the adjudication in the test comment and the result report with exact
  file/line, old expectation, new expectation and rationale; state that this is
  the one operator-authorised expectation change and that frozen R10/R9/R8/R7
  worktrees are untouched.
- Restore digits-only `raw` for dropped-figure display (e.g. the numeric/value
  text only), keeping typed unit/object identity in its own fields. `refine.js`
  or its helpers may change so both retained warning assertions pass; do not
  edit `refine.test.mjs:1435` or `:1645`.
- Preserve every other R10/R9/R8 control, including both R9 warning assertions,
  the refine drop-preserving contract, tailor's one-way distinction, the
  `:2067` no-drop positive, and the 134 defined tests (minus none, plus the new
  refusal row).

No execution of any kind. Report hashes, diff vs R10, definitions, exact
old/new expectation record and NOT_RUN boundaries.
