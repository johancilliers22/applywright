# A11Y R4 brief — evaluating the two R3F1/R3F2 designs

**Status:** advisory input for the Codex operator, 2026-10-31. Read-only: no product source edited,
nothing committed, no test/build/browser/server/provider phase run. The independent Sol exact-source
review remains the authoritative verdict; this file compares designs, it does not accept one.
**Read against:** worktree `C:/Users/johan/.t3/worktrees/applywright/t3-6e5f7dd4` @ `a1d7592` (branch
`t3/a11y-hint-id-collision-fix`); binding decision
`docs/resume/20261029/A11Y-R3-ID-OWNERSHIP-DECISION.md`; reviews
`docs/t3/receipts/20261029-resume/a11y/review/REVIEW.md` (R1), `.../a11y/r2/review/REVIEW.md`,
`.../a11y/r3/review/REVIEW.md`. Paths below are worktree-relative unless named otherwise.

## 1. Verdict

**Recommend A**, with the three amendments at the end of §3: it closes both P2s on the reviews' own
finite traces and adds ≈55 lines to `public/app/app.js`, touching no other product file.

**B is not admissible as the design.** It closes both stated traces, but it deletes the repair a
current definition requires (`a11y-focused.test.mjs:548-576` supplies an *observed* generated id),
it changes generated-ID shapes two current definitions assert exactly (`:275`, `:277`), and the
binding decision (`:16-17`) rules randomness out as a proof. A hybrid (A's repair + B's namespace) is
admissible but strictly larger and still breaks those two definitions.

## 2. What R3 does today — mechanism

- `app.js:82` `reservedIds` (generated + preserved ids); `:89` `ownedHints` (Map: hint id →
  `{hint: WeakRef, control: WeakRef}`); `:106-114` `uniqueId` (counter; skips `reservedIds` and live
  ids; reserves); `:116-118` `reserveId`; `:124-131` `replaceToken` replaces **every** part equal to
  `from`; `:137-146` `removeToken`. `uniqueId` call sites: `:172` (relocation), `:822`, `:827`.
- `describedByWith` (`:811-815`) returns the string **unchanged** when the token is present (`:813`),
  so it can decline to append. `field` (`:817-842`): control id → relocate then reserve (`:818-820`),
  else generate `field-N` (`:822`); with a hint, generate `hint-N` (`:827`), build the paragraph
  (`:828`), set the attribute unconditionally (`:829`), label `for` from the control id (`:834`), and
  record ownership **unconditionally** (`:838-840`).

**R3F1 — token text mistaken for ownership (confirmed at source).** R3 review `:19-26`, re-walked:
(1) `A.id=name`, caller tokens `hint-1 keep-help`; `B.id=hint-1`. (2) `field("Name", A, "Name help")`:
`hint-1` is free (only `name` reserved, `:820`) so the hint takes it; `:813` appends nothing; `:829`
writes the unchanged string; `:839` records ownership anyway. (3) `field("Scope", B)` no hint: `:819`
finds that record, `:172` allocates `hint-2`, `:175-178` rewrites A to `hint-2 keep-help` — a
**caller-owned token renamed**. (4) Chain variant (`:26`): A tokens `hint-2 keep-help`, B=`hint-1`,
C=`hint-2` → after the first move A reads `hint-2 keep-help hint-2`; claiming `hint-2` rewrites
**both** occurrences (`:124-131`).

**R3F2 — later supplied `field-N` duplicates an earlier generated control.** R3 review `:36-43`: A
has no id → `:822` gives `field-1`, `:834` gives its label `for="field-1"`. B arrives with caller id
`field-1`: `:819` → `:160-161` returns `false` (`ownedHints` is keyed by **hint** ids); `:820` only
re-adds a Set member. Two controls share `field-1`. Both are contract counterexamples, not observed
collisions: `app.js` has **0** literal `field-<n>`/`hint-<n>` strings (grep), agreeing with R2 `:82`
and R3 `:45`.

## 3. Design A — ownership by generated id, disjointness by allocation

The helper's own token must be **text-unique on its control**. Then "rewrite the token" is
unambiguous and no caller token can be renamed. Provenance alone is insufficient: `replaceToken`
(`:124-131`) cannot tell two equal occurrences apart, so even a WeakMap saying "the helper owns a
reference on A" cannot say *which* `hint-1` to move. An index record would disambiguate but is
brittle, because `describedByWith` normalises separators on every append — use the invariant.

```
describedByTokens(control) -> Set<string>                    // new
uniqueId(prefix, avoid) -> string                            // one extra condition at :111
relocateOwnedHint(id)                                        // same shape; avoid = tokens minus id
ownedControls: Map<id, {control: WeakRef, label: WeakRef}>   // new, beside :89
relocateOwnedControlId(id, incomingControl) -> boolean       // new
field(labelText, control, hint)                              // wiring only; exported API unchanged
```

- `uniqueId`: `while (reservedIds.has(id) || documentHasId(id) || (avoid && avoid.has(id)))`.
- `field` claim path: `relocateOwnedHint(control.id)` → `relocateOwnedControlId(control.id, control)`
  → `reserveId(control.id)`; repair still precedes the incoming reservation (`:818-820` order kept).
  Hint path: `hintId = uniqueId("hint", describedByTokens(control))` (`:827`). Record step: after the
  tree exists (keep `:838-840`) set
  `ownedControls.set(control.id, {control: new WeakRef(control), label: new WeakRef(tree.children[0])})`
  when the helper generated the id, and refresh that same-id/same-control record on repeated calls.
- `relocateOwnedHint`: keep `:159-183`; only allocate `uniqueId("hint", tokensWithout(control, id))`.
  `id` is still reserved during allocation (`:169` runs after `:172`), so the replacement cannot be
  the vacated id; the dead-hint branch (`:165-170`) stays sound because the removed token is
  helper-owned and text-unique.
- `relocateOwnedControlId`: deref both refs. Earlier control *gone* → drop record, release id,
  return `false`. Earlier control *is* the incoming control → keep record, return `false`, no rename.
  Otherwise `uniqueId("field", new Set([id]))`, set `control.id`, `label.setAttribute("for", nextId)`
  if the label is alive, release the old id, re-key the record, return `true`.

**Traces.** *T1 (R3F1 primary):* A's hint allocates `hint-2` (hint-1 is in A's tokens), so nothing
owns `hint-1` when B claims it (`:161` false); A's tokens stay `["hint-1","keep-help","hint-2"]` →
**closed**. *T2 (chain):* A's hint is `hint-1`; B's claim relocates it to `hint-3` (`hint-2` is a
caller token on A, excluded by the avoid set) → `["hint-2","keep-help","hint-3"]`; C's `hint-2`
matches no owned hint → untouched → **closed**. A's caller token then also names C's control — the
caller's own dangling reference, which the decision requires be preserved (R3 review `:19-22`).
*T3 (R3F2):* A generated `field-1`; B claims it → A renamed to the next free `field-N`, label `for`
follows, `field-1` released for B → **closed**. *T4 (inverse):* B claims `field-1` before A exists;
A's generation skips it (`:111`) — correct today, preserve.

**Amendments the writer must not skip.** (1) Apply `avoid` at **both** allocations (`:827`, `:172`),
not only when appending. (2) Control relocation must be a no-op when the record's control **is** the
incoming control (repeated `field()` on one node, `:818`). (3) WeakRef: today it is built only for
hinted fields (`:839`); control bookkeeping would build it for every generated-id field — either
guard `typeof WeakRef === "function"` and skip bookkeeping (documenting that R3F2 stays unfixed
there) or state the evergreen requirement explicitly; never substitute strong references (decision
`:21-22`).

## 4. Design B — per-load random namespace

Ids become `f<8 random chars>-<n>`; owned tokens tracked per node; `relocateOwnedHint` deleted. Space
is disjoint from any *predetermined* literal, so T1–T4 pass and R3F1 cannot occur (no rewriting
mechanism remains). It fails on three counts:

1. **It cannot delete the repair.** `test:548-576` reads an earlier hint's *actual* generated id
   (`:558`) and supplies it as a later caller id (`:562`); randomness changes the value, not the
   collision, so `:569` fails once relocation is gone. Randomness defeats guessed literals, not
   observed ids.
2. **It breaks two current definitions.** `:275` asserts `control.id === "field-1"`, `:277` asserts
   `hint.id === "hint-3"`; namespaced ids fail both, breaching `DECISION:4` ("Preserve the frozen
   R1/R2 histories and38 current test intents"; R3's eight are equally current, R3 review `:120-137`),
   and a random source needs an injection seam in a test file that already manipulates globals
   (`test:58-109`), so failures stop being diffable.
3. **The binding clause.** `DECISION:16-17`: *"A prefix change/randomness alone is not a proof against
   the stated predetermined detached-control case."* B is prefix/randomness alone.

## 5. A vs B

| | A | B alone | hybrid A+B |
|---|---|---|---|
| Closes T1/T2 | yes | yes | yes |
| Closes T3/T4 | yes (new control repair) | yes by construction | yes |
| Keeps `:548-576` | yes | **no** | yes |
| Keeps `:275`/`:277` | yes | **no** | **no** |
| Decision `:16-17` | satisfied (deterministic repair) | **breached** | satisfied ("not alone") |
| Size in `app.js` | ≈ +55, no deletions | ≈ +5, −65 | ≈ +60, no deletions |
| Main risk | control rename, WeakRef surface | contract + retained definitions | both |

**Recommendation:** ship A as above in `public/app/app.js` only, plus the §6 definitions and a
revised result/manifest. A+B is permissible under the clause (the repair still exists) but buys
nothing against a caller that can observe an id and breaks `:275`/`:277` — not recommended.

## 6. Test matrix (finite traces; all in `a11y-focused.test.mjs`)

Primitives: `test:111-146` (`tokensOf`, `makeControl`, `registryOf`, `resolveIn`, `freshApp`) and
`:347-390` (`attachAll`, `assertFieldPairs`, `adversarialPair`). Keep the 46 current definitions
unchanged; add nine, each from `await freshApp("<tag>")`.

| # | Setup | Action | Assertions |
|---|---|---|---|
| N1 | A.id=`name`, describedby `hint-1 keep-help`; B.id=`hint-1`, **no hint** (the exact R3F1 case) | field A (hint) then B; attach A first | A.id `name`; B.id `hint-1`; A tokens exactly `["hint-1","keep-help",<A hint>]` (**text unchanged**); A hint ≠ `hint-1`; B has **no** describedby and a 2-node tree; all ids unique; A's hint token resolves to A's paragraph |
| N2 | as N1 | field A then B; attach B first | same assertions (order-independent) |
| N3 | as N1 reversed | field B first, then A (hint) | A's caller tokens unchanged; A's hint avoids B's `hint-1`; unique; resolutions |
| N4 | A.id=`name`, tokens `hint-2 keep-help`; B=`hint-1`; C=`hint-2`; B and C no hint | field A (hint), B, C | A tokens `["hint-2","keep-help",<A hint>]`, `<A hint>` ∉ {`hint-2`}; B keeps `hint-1`; C keeps `hint-2`; unique; A's hint token resolves to A's paragraph |
| N5 | A.id=`name`, no tokens; B=`hint-1`, no hint (the R2/R3 plain case) | field A (hint), B | the repair still runs: A's hint moved off `hint-1`; B has **no** describedby and a 2-node tree; B's label `for="hint-1"`; unique |
| N6 | multiple detached fields: A.id=`name`, tokens `existing-help keep-help`; B=`hint-1`; C claims the relocated id | field A, B, C | token text/order preserved across **two** relocations; each appended token resolves to its own hint; C keeps the id it supplied |
| N7 | A no id (hinted); B.id=`field-1` | field A, then B | A.id becomes a fresh `field-N` ≠ `field-1`; A's label `for` === A.id; B.id `field-1`; B's label `for` === `field-1`; unique; both hint tokens resolve |
| N8 | as N7 | field A then B; attach B first; repeat with B hinted | same assertions; B's optional hint does not change the control repair |
| N9 | as N7 reversed | field B (`field-1`) first, then A (no id) | B keeps `field-1`; A's generated id skips it; unique |

Positive controls to keep: generated-only exact ids `test:268-283`, live-document skip `:514-546`,
token-policy `:579-590`.

## 7. Preserved behaviour (must not regress)

- **Definitions:** 46 total — 38 carried from R1/R2 (mapping in R2 review `:105-120`) plus R3's eight
  (R3 review `:124-137`); byte-identical except the additive block (method: R3 review `:122`).
- **Import/bootstrap cleanup:** `test:58-109` descriptor capture/restore and bounded document; the
  editor's own guard `editor.js:2289` unchanged (R1 F1, R3 review `:90`).
- **Single loading/save channel:** `editor.html:94-96` placeholder visible but **not** live;
  `editor.html:320` is the one polite `role="status"` sink; wired at `editor.js:1211-1214`,
  `:1230-1234`; loading at `:1326`, placeholder hidden at `:1383`.
- **Quiet/enabled dedupe:** `editor.js:953-968` (observed vs spoken kind) and `:981-991`; expected
  sequences in R2 review `:64-78`.
- **Existing error alerts:** `editor.js:1216-1221` appends `role="alert"`; save failure `:1469`; no
  polite duplicate (`saveStateView` has no `error` announcement, `:933-939`).
- **Save semantics unchanged:** `editor.js:1428-1474` — no-change early return `:1432-1436`, PATCH
  `:1444`, busy reset in `finally`. R4 changes **no** editor file; `editor.js`/`editor.html` are
  byte-identical to R2 (R3 review `:107`, `:172`), so they are out of scope by construction.

## 8. Risks

1. **Renaming a generated control id** is new. It is synchronous, updates the helper's own label
   `for`, and no production code reads `field-<n>` ids (0 literal matches), so the only observable is
   the label association. Whether every production `field()` runs before its tree is attached is
   **UNKNOWN** (not enumerated); the rename stays consistent either way in the same task.
2. **Label liveness:** if a caller keeps the control but discards the helper's label there is nothing
   to update; a caller-built label pointing at the old id is outside the helper contract — state that
   boundary in the result.
3. **Metadata growth unchanged, not fixed:** `reservedIds` and both Maps accrete strings across route
   rebuilds (R3 review `:78`); records are weak, so no DOM retention. Allocated numbers shift only
   where a control carries generated-looking tokens, and no current definition does (`:254-342`,
   `:393-576`), so `:275`/`:277` still hold.
4. **Repeated `field()` on one control** (two hints on one control) stays unmodelled — R3 review
   `:80`; out of R4 scope.

## 9. Not verified, and gates

All traces are **SOURCE_TRACED / NOT_RUN** static reasoning over the files read here. No syntax,
test, browser, AT or label-resolution execution was performed; `WeakRef` availability, actual DOM
label resolution after a rename, and AT delivery remain **NOT_RUN / UNKNOWN**. After R4 the operator
owns the gates in R3 review `:197-207`: syntax on `app.js` and the focused `.mjs`,
`node --test docs/verification/20261029-a11y-fix/`, `node --test tests/`,
`node --test server/lib server/provider`, `node scripts/check.js`, then the admitted browser journey,
each under full-lifetime admission with before/after hashes. Preserve failures and skips.
