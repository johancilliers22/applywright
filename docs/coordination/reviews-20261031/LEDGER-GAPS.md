# Ledger gaps — Applywright native resume, 29 October 2026

Read-only audit, 2026-10-31. Authority: `docs/resume/20261029/CODEX-LIMIT-HOLD-20261029.md` and `docs/resume/20261029/NATIVE-DISPATCH-STATUS.json` (observed 2026-10-29T19:48:58Z).
No project file changed except this one; no tests, servers, processes or commits run. The 70 KB status JSON is under `docs/resume/20261029/`; `docs/t3/receipts/20261029-resume/` holds only the `.before-*` snapshots and `CURRENT-CHECKPOINT.json`.

## 1. Lane table

Claims are from the hold note and the status JSON's `state`/`outputStatus`; receipts are
files actually present under `docs/t3/receipts/20261029-resume/`.

| Lane | Ledger claim | Receipts present | Flag |
|---|---|---|---|
| g1-r7-review | completed, REQUEST_CHANGES (7 findings) | dispatch, terminal, reap, after-reap, REAP-VERIFIED, OUTPUT-EVIDENCE, REVIEW.md | OK |
| g1-r8 | completed, source candidate, 111 definitions | dispatch, terminal, reap, after-reap, REAP-VERIFIED, CANDIDATE-EVIDENCE | OK |
| g1-r8/review | completed, REQUEST_CHANGES (9 findings) | full terminal set, REVIEW.md, REVIEW-IDENTITIES | OK |
| g1-r9 | completed, 5 hashes / 123 definitions | full terminal set, REAP-VERIFIED, CANDIDATE-EVIDENCE | OK |
| g1-r9/review | completed, REQUEST_CHANGES (7 P1, 2 P2) | dispatch, task.identity, REVIEW.md, REVIEW-IDENTITIES, REVIEW-CONSUMPTION; **no terminal, reap, after-reap or REAP-VERIFIED**; `NATIVE-MANIFEST.json` says `running`, `NO_TERMINAL_RESULT_OBSERVED` | GAP-TERMINAL |
| g1-r10 | completed, 134 definitions, pending review | dispatch, task.identity, REAP-VERIFIED, SOURCE-ADMISSION; **no terminal, reap, after-reap; no CANDIDATE-EVIDENCE** | GAP-TERMINAL, GAP-CANDIDATE |
| g1-r10/review | failed, provider usage limit | `REVIEW-DISPATCH-FAILED.json` only; no dispatch receipt; no REVIEW.md (expected, zero files written) | EXPECTED-FAIL; task/run IDs claimed with no `task.dispatch.native.json` |
| a11y (R1) | completed, source candidate | full terminal set, REAP-VERIFIED, CANDIDATE-EVIDENCE | OK |
| a11y/review | completed, REQUEST_CHANGES (4 findings) | full terminal set, REVIEW.md, REVIEW-IDENTITIES | OK |
| a11y-r2 | completed, 38 definitions claimed | full terminal set, REAP-VERIFIED, CANDIDATE-EVIDENCE | OK (count static, §3) |
| a11y-r2/review | completed, REQUEST_CHANGES (F3 P2) | full terminal set, REVIEW.md, REVIEW-IDENTITIES | OK |
| a11y-r3 | completed, 6 hashes / 46 definitions | full terminal set, REAP-VERIFIED, CANDIDATE-EVIDENCE | OK |
| a11y-r3/review | completed, REQUEST_CHANGES (2 P2) | dispatch, task.identity, REVIEW.md, REVIEW-IDENTITIES, NATIVE-MANIFEST; **no terminal, reap, after-reap or REAP-VERIFIED**; manifest `running`, `NO_TERMINAL_RESULT_OBSERVED` | GAP-TERMINAL |
| windows-finite-case (R1) | completed, BLOCKED_ABI_GAP | full terminal set, REAP-VERIFIED, OUTPUT-EVIDENCE | OK (uses OUTPUT-EVIDENCE) |
| windows-finite-case/review | completed, 9 findings | full terminal set, REVIEW.md, REVIEW-IDENTITIES | OK |
| windows-finite-case-r2 | completed, SOURCE revision complete, pending review | dispatch, task.identity, NATIVE-MANIFEST, SOURCE-ADMISSION; **no terminal, reap, after-reap, REAP-VERIFIED, OUTPUT-EVIDENCE**; manifest `running`, `NO_TERMINAL_RESULT_OBSERVED` | GAP-TERMINAL, GAP-CANDIDATE |
| windows-finite-case-r2/review | owed (`providerHold.blockedLanes`; hold note line 60) | **no directory, no payload** | ORPHAN |
| design-motion | completed, six outputs, research not accepted | full terminal set, REAP-VERIFIED, OUTPUT-EVIDENCE; no REVIEW.md (no review task) | OK |

`CURRENT-CHECKPOINT.json` is stale: observed 19:10:16Z, 38 minutes before the authority;
15 tasks (no g1-r10 or g1-r10/review), still marking windows-finite-case-r2,
a11y-r3-review and g1-r9-review `running`. Its filename does not make it current.

No review is claimed complete without a `REVIEW.md`; the failure runs the other way. Three lanes are marked `completed` with only "Actual native delegate plus initial thread/run metadata" as `stateBasis`, while their manifests say `running`. Their `REVIEW.md` files were
written after the last recorded observation (19:10:16Z): a11y-r3 review 19:16:54Z, g1-r9
review 19:21:15Z. R9 review output was later consumed at 19:28:24Z
(`g1-r9/review/REVIEW-CONSUMPTION.json`, `completedAtUtc` 19:25:48Z), so the output exists —
the terminal receipt does not. The hold note's Windows R2 "completed 19:21Z" has no
terminal receipt: the output files were written 19:20:02–19:20:57Z, so completion time is
inferred from file mtimes. UNKNOWN as a native terminal time.

## 2. Orphan list

### 2.1 Windows finite-case R2 review — prepared in name only

- No `windows-finite-case/r2/review/` directory and no review payload anywhere.
- Writer payload: `windows-finite-case/r2/delegate.payload.json`, SHA256
  `7722e2ed56d09081f754852defcc3eab664dbacf685191d4ea6c139e98df0433` (recomputed).
- Candidate worktree: `C:\Users\johan\.t3\worktrees\applywright\t3-a4173ab2`, branch
  `t3/windows-finite-case-revision`, base `a1d7592e65ba291c0bf89d8a6552ab4090073037`;
  one untracked output directory, 8 files, no recorded identity receipt.
- No recorded candidate hashes (the R2 lane has no REAP-VERIFIED). Recomputed 2026-10-31,
  full SHA256, in worktree `docs/verification/20261029-windows-finite-case/`:

```
APPROVAL-TEMPLATE-NOT-AUTHORITY.json 361aee0bc0c9ef26d394b7ec70232bfa5fd2003eae505ce649731218f6133904
CAPTURE-AND-CLOSURE-DESIGN.md        6ff0beb6498d4fb0a5dfed919e2709813a61e373e7f3670eb8ce9da50622777e
DESIGN.md                            80eb159c90f3720983942bb973b13de2577c0d55af668299a9570cdb6c88b409
PLAN-TEMPLATE-NOT-ADMITTED.json      ad39621d3167889d26a1405cd482b08a6707fa6a218696ce94d446dabd692f45
PROTOCOL-GAPS.md                     b63643a13424c93b872567b2ded565a69d15d1534f53916cbd23812b0c61425d
RESULT.md                            9dce6af44e1007b4e10f5b0e157f34e4de4dbca618fbcc6a4eb3f28e5c74bc01
SOURCE-CHECKS.md                     b8c0400a6316b90d6129b33474d368d543f7038b3fa4f532aadec99e7bfc65db
windows-bridge-proposal.ps1          e0286d84de3f24917a0ef24e23fe1806c5669e303adc756412b892f46e53d9d3
```

- Resuming needs: first a terminal receipt for the R2 writer (manifest says running), then a
  review payload authored from those eight hashes.

### 2.2 WSL predicate case — commissioned, never dispatched

- Commission `docs/resume/20261029/WSL-PREDICATE-CASE-COMMISSION.md`, 5,124 B, SHA256
  `c8f3838dfbbb75ef5fe618433e8e237b7e4ec89515997212cd69e96bcfe11580`.
- Broker send `docs/resume/20261029/WSL-PREDICATE-COMMISSION-SEND.json`, 386 B, SHA256
  `d4e7baa1d5b3860fad952cb17ddd753a711fba8aa3cb69a9d84d4eaf51f0fe9b`: `status` and
  `delivery` both `queued`, no task, child-thread or run id. Mtimes 19:06:08/19:06:09Z
  corroborate the 19:06 commission.
- No worktree (no match under `C:\Users\johan\.t3\worktrees\applywright\`), no receipt directory, no task in `NATIVE-DISPATCH-STATUS.json`. Payload: none. Recorded hash: none. Worktree: unassigned. Resuming needs an assigned worktree, an authored payload and a real `task.dispatch.native.json`.

### 2.3 G1 R10 review — dispatched, failed before reading

- Payload `g1-r10/review/delegate.payload.json`, SHA256
  `c223a136ed09018938ab9e0ad0a6c3690c5483255317a0522103aa838460c31a` (recomputed, matches);
  target `codex` `gpt-6.1-sol`, `reasoningEffort=xhigh`, `serviceTier=default`.
- `REVIEW-DISPATCH-FAILED.json`: requested 19:47:56.243Z, failed 19:48:00.898Z,
  `reviewFilesWritten: []`, candidate unchanged (4 modified + 1 untracked).
- Candidate worktree `C:\Users\johan\.t3\worktrees\applywright\t3-bf853bb9`, branch
  `t3/g1-r10-grounding-source-correction`, base `a1d7592`; all five recorded hashes
  re-verified 2026-10-31 (§3).
- Resuming needs: provider reset (stated 2026-11-04T16:50 local, timezone unverified),
  re-verification of the five candidate hashes and R9 origin, fresh admission per
  `g1-r10/review/SOURCE-ADMISSION.attempt1.json`, then the same payload SHA with a **new**
  `clientRequestId`; outputs `REVIEW.md` and `REVIEW-IDENTITIES.json`.

## 3. Arithmetic

| Claim | Evidence checked | Result |
|---|---|---|
| G1 R10 = 69 tailor + 65 refine = 134 defined tests | counted `test(` in `t3-bf853bb9/server/lib/cv/{tailor,refine}.test.mjs` → 69 + 65; matches `g1-r10/REAP-VERIFIED.json` | VERIFIED (static; 0 executed) |
| 123 from R9 | counted in `t3-76750b9f/…` → 61 + 62 = 123; matches R9 `definitionsClaimed: 123` and `g1-r9/review/REVIEW.md` | VERIFIED (static) |
| 11 new | 69−61 = 8, 65−62 = 3, total 11 | VERIFIED |
| diffs +487/−105, +99/−33, +283/−1, +81/−0 | `git diff --no-index --numstat` R9→R10 per file, exactly those values | VERIFIED |
| `refine.test.mjs` exact R9 prefix | byte comparison R9 (77,119 B) vs R10 (81,074 B): true | VERIFIED |
| `tailor.test.mjs` retains all R9 except one row | exactly one deleted line, the F9 row `"the same numbered object with a count noun"…`, replaced by the no-drop pair; 283 additions | VERIFIED |
| "211 independent comparisons" | sum of `comparisons` in five R7 files under `docs/verification/20261029-g1-r7-diagnostic-attempt1/`: 52+31+48+24+56 = 211, passed 211, failed 0 | VERIFIED AS RECORDED historical R7 evidence; not re-executed (`REVIEW-CONSUMPTION.json` `retained211: NOT_RUN`) |
| "38 a11y test intents" | `t3-afca85b6/docs/verification/20261029-a11y-fix/a11y-focused.test.mjs` → 38 `test(`, 9 `describe(`; independent inventory at `a11y/r2/review/REVIEW.md` line 105 | VERIFIED (static; zero executed) |

No count here is an execution result of the 29 October resume: focused 123+new and retained
211 are `NOT_RUN`, and prepared 76 is `AUTHORED_NOT_RUN`, in `g1-r9/review/REVIEW-CONSUMPTION.json`.

## 4. Provenance gaps

- **Served identity, tokens and cost are null in every lane.** 17/17 tasks in
  `NATIVE-DISPATCH-STATUS.json` and 15/15 in `CURRENT-CHECKPOINT.json` have `servedIdentity`,
  `tokens`, `cost` null; requested model/options are recorded for all 17.
- Reviewer prose agrees: `a11y/r3/review/REVIEW.md` — "backend served identity, actual
  service-tier telemetry, tokens and cost are UNKNOWN/null";
  `g1-r9/review/REVIEW-CONSUMPTION.json` stores `servedIdentity: null`, `tokens: null`,
  `costUsd: null`. `latestSolChildTierObservation` has `servedIdentity: null`,
  `actualBackendTier: null`.
- `ROOT-TERRA-QUALIFICATION-RECEIPT.json`: `ProviderTokenUsage`, `BilledCost`,
  `InferenceLatencyMs` null for all three arms. `USAGE-OBSERVATION.json` is account-level
  only (47% weekly used at 17:16Z), not per-task usage.
- **Parent tier cannot be checked.** `parentTierPolicy` (18:35:36Z) requires preserving
  human-selected Fast, but the only fresh readback, `latestParentTierObservation`
  (18:37:40Z, thread `46ac76de-…`), returns `serviceTier: default`; the policy's own
  `actualCurrentSelection` is `NOT_FRESHLY_OBSERVED_BY_THIS_INTAKE`. Requested, observed and
  served tier are UNKNOWN — verify before any tier claim or change.
- Requested-vs-served identity is therefore unverifiable for every lane. Do not backfill
  zeros.

## 5. Durability risk

- HEAD `a1d7592`; nothing committed since. `git status --porcelain`: **66 rows = 5 modified
  tracked + 61 untracked, 0 staged** (verified 2026-10-31, before this report; this report
  adds one untracked directory, taking the tree to 67 rows).
- 5 modified tracked: `AGENTS.md`, `docs/IMPLEMENTATION-REGISTER.json`,
  `docs/OPERATOR-CONTINUATION-PLAN.md`, `docs/resume/20261029/RESUME-PLAN.md`,
  `docs/verification/20261028-intake/VAULT-PUBLICATION-RECEIPT.json`.
- 61 untracked rows (before this report): `docs/coordination/` 3,
  `docs/research/20261029-design-motion/` 1, `docs/resume/20261029/` 22,
  `docs/verification/` 35. They include the authority status JSON, the hold note and both
  commission documents.
- **Not in those 61:** `docs/t3/receipts/` is ignored by `.git/info/exclude:9`
  (`/docs/t3/receipts/`). The resume receipt tree is 241 files / 1,640,996 bytes, invisible
  to `git status`; a plain `git add` will not stage it.
- Candidate worktrees sit outside the repo, uncommitted: R10 `t3-bf853bb9` (4 modified + 1
  untracked), R9 `t3-76750b9f` (4 + 1), windows R2 `t3-a4173ab2` (0 + 1, 8 files), windows
  R1 `t3-cf7041b5` (0 + 1), a11y R2 `t3-afca85b6` (3 + 1), a11y R3 `t3-6e5f7dd4` (3 + 1),
  G1 R7 `t3-7fef5f84` (4 + 1).
- Three things most at risk if the next session assumes they are committed:
  1. **G1 R10 candidate** in `t3-bf853bb9` — five files exist uncommitted; their hashes live
     only in the hold note and the ignored `REAP-VERIFIED.json`.
  2. **The receipt tree** — every payload, `REVIEW.md`, terminal identity and admission file
     is ignored, local-only and unrecoverable from a clone or clean.
  3. **The uncommitted docs** (61 untracked + 5 modified), especially
     `docs/resume/20261029/NATIVE-DISPATCH-STATUS.json` and the hold note: a reset or
     `git clean` destroys the ledger that states what happened.

## 6. Before-you-continue checklist

1. Open `docs/resume/20261029/NATIVE-DISPATCH-STATUS.json` as the authority. Pass:
   `observedAtUtc` 19:48:58Z, 17 tasks, `providerHold.blockedLanes` =
   `["g1-r10-review","windows-finite-case-r2-review"]`.
2. Do not resume from `docs/t3/receipts/20261029-resume/CURRENT-CHECKPOINT.json`. Pass: its
   `observedAtUtc` (19:10:16Z) is older and it has 15 tasks.
3. Re-verify the R10 candidate. Pass: all five SHA256 in `g1-r10/REAP-VERIFIED.json` match
   `t3-bf853bb9`, and `git -C … status --porcelain` shows exactly `M` ×4 plus
   `?? GROUNDING-G1-R10-RESULT.md`, nothing staged.
4. Re-verify the R9 origin. Pass: all five hashes in `g1-r9/REAP-VERIFIED.json` `files[]`
   match `t3-76750b9f`, including `GROUNDING-G1-RESULT.md` `fe1654b2…`.
5. Re-run admission exactly as `g1-r10/review/SOURCE-ADMISSION.attempt1.json`: Windows
   ≥4 GiB, names-only Ubuntu/docker-desktop, `/tmp/redline-heavy.lock` probe released,
   product diff EMPTY vs `6e6c13f`. Pass: decision `ADMIT_SOURCE_DISPATCH_OBSERVATION_ONLY`
   with a current timestamp.
6. Check provider availability before any dispatch. Pass: a successful native call or a
   reset newer than 19:48Z; the stated reset is 2026-11-04T16:50 local (timezone unverified).
7. Re-dispatch R10 review with payload SHA `c223a1…` and a **new** `clientRequestId`. Pass:
   new task/run ids, then `REVIEW.md` and `REVIEW-IDENTITIES.json` under `g1-r10/review/`,
   candidate bytes unchanged.
8. Repair or relabel terminal evidence for `windows-finite-case-r2`, `a11y-r3-review` and
   `g1-r9-review`. Pass: a `task.terminal.native.json`/after-reap receipt per lane, or an
   explicit note "output written, terminal unobserved".
9. Windows R2 review: obtain the writer terminal first, then author the payload from the
   eight hashes in §2.1. Pass: payload SHA recorded and `r2/review/` populated with a
   dispatch receipt.
10. WSL predicate case: assign a new worktree, author the payload against commission SHA
    `c8f3838d…`. Pass: `task.dispatch.native.json` under a new
    `docs/t3/receipts/20261029-resume/wsl-predicate-case/`.
11. Keep provenance honest. Pass: every new receipt leaves `servedIdentity`/`tokens`/`cost`
    null unless a provider returns them; no zeros or estimates.
12. Make durability explicit before resuming. Pass: named-path commits or an out-of-repo
    archive cover the pre-audit 66 `git status` rows (67 including this report) **and** the
    241 ignored receipt files; check with `git status --porcelain` and `git status --ignored`.
13. Re-read the parent tier before claiming Fast preserved. Pass: a current thread-config
    readback showing the intended tier, with requested, observed and served recorded
    separately.
