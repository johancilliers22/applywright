# Applywright handoff to a Claude co-orchestrator

Prepared **2 November 2026**, retaining the requested 20261101 filename and packet
date. Evidence capture: 2026-11-02T18:53:14.9565252Z (UTC; Europe/London).

**READY FOR CO-ORCHESTRATOR INTAKE / FINISH SEQUENCE BLOCKED / PRODUCT INCOMPLETE.**
This document fulfils Johan's documentation request. It does not resume the
blocked implementation goal, launch workers, transfer ownership automatically,
qualify an executor, or accept unmerged product code. The previous implementation
handoff freeze remains until Root records the actual receiving-owner ACK and
the next specifically released commission. No receiving Claude ACK was found in
the inspected project coordination/resume records or Root's final receipt set;
the recorded transfer remains false. Recheck with Root before assuming that is
still current.

## Repository, delivery and recovery

Windows project root:
`C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright`

WSL view of the same root:
`/mnt/c/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright`

| Item | Verified value / boundary |
| --- | --- |
| Main at intake, before this documentation-only commit | `471d93c50024d0531dbe24abb032f34b455c326e` |
| Frozen substantive documentary delivery | `536e45457f315ff7b9823a01ac7d3676bd18b138` |
| Origin | `https://github.com/johancilliers22/applywright.git` |
| Backup | `../applywright-remote.git`, resolved from the project root |
| Fresh origin/main readback | `471d93c50024d0531dbe24abb032f34b455c326e` |
| Fresh backup/main readback | `471d93c50024d0531dbe24abb032f34b455c326e` |
| Product paths changed since resume baseline `a1d7592` | None in `server/`, `public/`, `scripts/`, or `tests/` through the verified intake HEAD |
| Foreign dirty path preserved | `docs/verification/20261028-intake/VAULT-PUBLICATION-RECEIPT.json` |
| Private evidence backup | `G:/Backups/Applywright/20261101-resume` |

The SHA above identifies the state handed over, not this file's own commit.
This file cannot contain its own future commit hash. Identify its named-path
delivery and independently check the current remotes with these read-only commands
from the project root:

```powershell
git log -1 --format="%H %s" -- docs/resume/20261101/CLAUDE-HANDOFF-20261101.md
git rev-parse HEAD
git ls-remote origin refs/heads/main
git ls-remote backup refs/heads/main
```

The operator verifies the new document commit on both remotes after pushing and
reports that actual SHA to Johan. The earlier delivery/publication proof remains
in `FINAL-CHECKPOINT-VALIDATION.json` and `FINAL-B-PUBLICATION-READBACK.json`.
Do not describe the existing checkout as clean: operator/foreign dirt and private
untracked evidence are deliberately preserved. Never blanket-stage them.

## Sources to read first

1. Project `AGENTS.md`, `RESUME-AND-HANDOFF-PLAN.md`, and
   `docs/OPERATOR-CONTINUATION-PLAN.md`.
2. `docs/IMPLEMENTATION-REGISTER.json` and the complete
   `docs/IMPLEMENTATION-PLAN.md`; retain every P0–P7 row, including product asks
   outside the immediate repairs.
3. `FINAL-CONTINUATION-HANDOFF.md`, `G1-R12-ACTUAL-RESULTS.json`,
   `G1-R12-INDEPENDENT-REVIEW.md`, `G1-CLAIM-RECORD-REPAIR-CONTRACT.md`,
   `FULL-GATE-R1.1-INDEPENDENT-REVIEW.md`, and its review summary in this directory.
4. `docs/PROVIDER-CREDITS-AND-HANDOFF.md`, the named archive manifests, and Root's
   current owner/release records. Relative filenames in this document without a
   `docs/` prefix are in `docs/resume/20261101/`.

Register raw SHA256 at intake:
`e6596a0d8943ff8bb7cccc92dd5482960758d502cbb2edc9efb87e996dc77566`.
Finish-sequence plan raw SHA256:
`d252b431b0468bbc993a1373b526f493ee78c4f32946a91eaa7daabd2ad7642e`.
These bind the local raw observations; Git text checkout may normalize line endings.

The register retains old R7 worktree/executed fields as history. Its
`currentCandidateRoot`, `currentReview`, `currentActualEvidence`, and
`latestActual` fields govern R12. In particular, old 100/100 and 211/211 fields
are not R12 results. Earlier running/pending paragraphs in retained handoffs
must not override their later terminal addenda and receipts.

## Finish-sequence disposition — all nine steps retained

| Plan step | Status | Evidence and remaining condition |
| --- | --- | --- |
| 1. Refresh broker, identities and Root releases | done for checkpoint | Fresh project/branch/worktree inventory and completed native broker readback; historical release receipts are retained, not reusable authority for another run. |
| 2. Make native evidence recoverable | done for recorded snapshots | Tracked manifests plus private G: archives. Both source and archive copies of the 16 frozen R12/combined-R11-R5 files were rehashed on 2 November: 32 comparisons, no drift. |
| 3. Obtain real finite WSL diagnostic feedback | done within exact cases | Root-qualified actual R10/R11/R12 and focused cases; completed owned children and leases released. This did not qualify a general, Windows, HTTP or browser executor. |
| 4. Complete G1 repair without weaker grounding | partial / blocked | R12 is still REQUEST_CHANGES, 6 P1 + 3 P2; actual replay and focused tests fail. A new occurrence-bound repair needs an explicit commission, review and new runtime authority. |
| 5. Finish A11Y corrections | partial | R5 Source PASS and 57/57 focused tests; full integrated gates and real DOM/AT/browser remain. |
| 6. Review Windows finite-case prerequisite | partial / blocked | R2 independently reviewed REQUEST_CHANGES, 4 P2; custody ABI remains unresolved. It is not a usable fallback executor. |
| 7. Run all required gates and integrate accepted product paths | open / blocked | The full-gate runner is Source REQUEST_CHANGES, 9 P1 + 3 P2, and unqualified. Three integrated gates remain NOT_RUN on current candidates. No new G1/A11Y merge. |
| 8. Finish scoped design/research and qualified preview | partial | Research/proposals retained; no new rendered visuals/animations or qualified preview. No listener on local port 3160 at this capture. Public deployment availability is UNKNOWN; old tunnel links are historical. |
| 9. Commit/push records and coordinate shared publication | done for prior bounded checkpoint; this document follows the same checks | Prior main and both remotes verified; named B note published by Estate. This file is a new named-path documentary delivery, not product acceptance or a receiving-owner ACK. |

The condition for writing this handoff is therefore met: the finish sequence is
**blocked**, rather than fully completed. Historical contrast and owned E2E
acceptance remain; incomplete G1, A11Y integration, infrastructure prerequisites
and later product work are not silently converted to done.

## Every implementation-register row

`done` means the stated bounded deliverable is evidenced, not that the programme
is complete. `partial` means usable work exists but the row's remaining outcome
is unaccepted/unverified. `open` means its requested outcome or qualifying route
is still outstanding. All **23 IDs**, in register order, are retained below.
No register rows or original product-plan rows are dropped or renumbered.

| Register ID | Status | Current evidence, limit and next condition |
| --- | --- | --- |
| `G1` | partial | Frozen R12: Source RC 6 P1 + 3 P2; 11 replay and 10 focused failures. Preserve current candidate/reviews/results; new occurrence-bound repair plus independent review and all gates required. |
| `CONTRAST-M1` | done | Accepted/pushed 7d40425; 21 focused tests and 58 token pairs with historical required gates. Bounded token contract only; rendered axe/WCAG remains outside acceptance. |
| `E2E-LIFECYCLE` | done | Accepted/pushed 8df799f: lifecycle/race/native ownership and isolated local-model-stub Chrome evidence. Live paid-model/deployment/current G1 proof remains separate. |
| `MAIN-DSH-RECONCILIATION` | partial | Original session acknowledged repo relay and corrected provenance. Preserve c7 safeguards and both histories; historical main three-gate pass coexisted with 90/211 independent results, not grounding acceptance. |
| `P1-C-CLAIM-CONTRACT` | partial | Claim/provenance scope decision and complete occurrence-record contract are recorded. Qualifications/titles/dates/figures and associations still need implemented and independently verified support. |
| `MODEL-P2` | partial | Partial c7 empty-summary/index safeguards exist; schema, index, transport and UI error semantics need reconciliation after overlapping G1 ownership clears. |
| `FAST-OFF` | done | Supported-scope historical configuration delivery: 382 Codex threads checked, 327 changed, zero Fast observed in that receipt. Current resume requests explicit Standard/default for Sol; unavailable hosts and old request epochs were not retrospectively changed. |
| `GEMINI-DESIGN` | partial | Frozen AGY Argon proposal exists and was reaped, but no decoded pixels/visual acceptance. Two-step editor needs version-bound preview API and preserved Ask/Accept/save behavior. |
| `GROK-RESEARCH` | open | Earlier native trial ended without useful research output. No report or Thinking/RUNNING status is treated as research; any future task needs a qualified route and finite useful-output/liveness check. |
| `MUSE-REFUTER` | done | Bounded advisory report delivered: 23 clear and 3 uncertain cases. This completes advisory delivery only; uncertainty is preserved and the report is not the semantic oracle. |
| `JEV-ADVISORY` | open | An actual qualified route/accounting receipt and bounded closed-set input/oracle are required. No project invocation or approval authority is claimed. |
| `CLAUDE-ORG` | open | Eligible direct pilot prepared, not submitted. Funding assumption is not observed balance; approved loader/adapter and known shared spent/pending/reservations with USD190 cap are still required. |
| `DSH-RESEARCH-USAGE-GLOBAL` | partial | Two prior tasks terminal; Root accepted research. Global usage reconciliation and authorised private-bookmark coverage remain unresolved; no blanket 991-item fetch or invented coverage. Estate owns publication. |
| `TERRA` | partial | Root completed a bounded dated pilot, not general project adoption or a cost comparison. Use only released roles with current catalogue/admission; no automatic Max preference. |
| `DOCS-RETENTION-GIT` | done | Bounded documentary delivery, private archives, remote proofs and named B-note publication are verified. This requested row-complete handoff is a new documentary commit; receiving-owner ACK is separate and still must be recorded. |
| `PRODUCT-PLAN-REMAINDER` | open | All original P0-P7 rows remain in IMPLEMENTATION-PLAN.md. Historical DONE and UI/UX/runtime claims need their own current evidence; no remaining row is erased by the repair subset. |
| `HUMAN-DECISIONS` | open | Retain production DNS/hosting, Stripe own sign-in/keys, VAT/invoicing, Scale pricing, any consumer sign-in and explicit receiving-owner ACK. Seek each only at its actual dependency. |
| `A11Y-D1-D2` | partial | R5 hint/control ownership, ARIA and save/error/retry corrections: independent Source PASS and actual 57/57. Three integrated gates and real DOM/AT/browser remain; integrate only six exact A11Y files after acceptance. |
| `DESIGN-MOTION-X-RESEARCH` | partial | Six DSH research files and operator adjudication copied; source comparisons are proposals, not implementation. Fresh project X access absent; Root owns wider bookmark research. |
| `CUA-ROOT-QUALIFICATION` | partial | Dated Root driver 0.38 limited release and bounded interactive proof exist. Current driver capability, task-specific admission and further Terra/CUA acceptance are not supplied by this handoff. |
| `WINDOWS-FINITE-CASE` | partial | R2 proposal independently reviewed RC 4 P2; custody ABI/keeper/environment implementation and exact native qualification remain. No Windows executor or runtime acceptance. |
| `WSL-PREDICATE-CASE` | done | Exact bounded R10/R11/R12/focused diagnostic work actually ran; completed leases released. This row is done for those consumed cases only, not a generic executor/full-gate/Windows release. |
| `CODEX-ORG-API` | open | Ordinary API use cases prepared, but current project adapter/profile/model entitlement and accounting remain unqualified. Funding assumption does not cover API-key Codex calls or prove a project call. |

## Accepted history and current candidate results

- Contrast M1: `7d40425a9cbc68fe5f03257036ad9acd1284a786`; independent review,
  21 focused tests, 58 token pairs and historical required gates. This is bounded
  token-contract acceptance, not full WCAG/axe or current rendered-page proof.
- Owned E2E lifecycle: `8df799f0016f7f2f021578424f65d59c19d539bf`; 38 mock checks,
  two race controls, four actual Windows ownership controls, and an isolated
  Chrome journey of 10 steps / 235 assertions using a local model stub. Historical
  skips remain explicit in the acceptance packet. This is not paid-model,
  deployment, current G1 or headless-agent CUA acceptance.
- G1 R12 in `t3-0564e52d`: 140 definitions, retaining 136 prior intents;
  independent Sol REQUEST_CHANGES 6 P1 + 3 P2. Actual results: fixture 76/76,
  replay 233/244 (11 faithful-positive false refusals), independent claims 29/29,
  tailoring 66/72 and refinement 64/68. The 10 focused failures have no
  skips/cancellation/todo/timeouts/stderr. Do not call passing subsets acceptance.
- A11Y R5 in the combined `t3-b1a7a4d5`: independent PASS_SOURCE, actual 57/57 in
  12 suites. Only its six exact A11Y files are candidates for later integration;
  that tree's G1 R11 files are rejected history and must not hitchhike into main.
- Full-gate R1.1: REQUEST_CHANGES 9 P1 + 3 P2. Main failure classes include false
  completion, timeout/forced-cleanup laundering, partial child placement,
  last-holder durable evidence, missing binding/freshness and uncovered effects.
  No stage/dependency install/control/test/full gate has executed through it.
- The Source review disclosed one concurrent documentary plan edit. Eighteen of
  nineteen pins stayed unchanged; executable drafts/frozen R1/public graph stayed
  stable. Root accepted the legitimate documentation maintenance and useful
  findings without retroactive all-inputs continuity or runtime permission.

## Every registered worktree and branch

The fresh inventory has **35 checkouts: main plus 34 T3 worktrees**. `T` is the
number of tracked dirty paths; `U` is the number of nonignored untracked files
at capture, before adding this document. These are metadata counts, not a
semantic review or permission to discard contents. Ignored contents were not
censused. All 34 T3 branch tips have **zero committed changes not in main**.
Their candidate work is in working files; a normal branch merge would not
transfer it. No candidate is currently marked MERGE.

T3 path prefix for every `t3-*` row:
`C:/Users/johan/.t3/worktrees/applywright/`.
The main row uses the complete project root above. Every branch is named exactly.

**KEEP** preserves its claim and evidence. **REMOVE** is a future cleanup
recommendation only: the owning T3 coordinator must first verify terminal state,
ignored/private artifact custody and supported cleanup scope. This request
performs no removal, prune, move, reset or branch deletion. A future merge/remove
decision needs a fresh state check and any required owner release.

| Checkout | Exact branch | HEAD at capture | T / U | Disposition | Reason |
| --- | --- | --- | --- | --- | --- |
| `applywright` | `main` | `471d93c50024` | 1 / 44 | KEEP | Independent integration checkout; preserve foreign dirt and private evidence |
| `t3-0564e52d` | `t3/g1-r12-source-successor` | `1fb6f71fb332` | 4 / 1 | KEEP | R12 rejected; preserve exact current Source and actual failure provenance |
| `t3-06b4af37` | `t3/contrast-m1-r3-correction` | `86b74c3a1869` | 1 / 3 | KEEP | Contrast R3 predecessor and result; retain review/correction lineage |
| `t3-11473ae7` | `t3/e2e-r3-source-correction` | `7d40425a9cbc` | 1 / 4 | KEEP | E2E R3 precursor; preserve rejected/intermediate lifecycle evidence |
| `t3-2fb3f4d3` | `t3/muse-grounding-cases` | `3b84986ffd5e` | 0 / 2 | KEEP | Muse advisory sources remain untracked; retain uncertain cases |
| `t3-3669749d` | `t3/e2e-owned-browser-lifecycle` | `86b74c3a1869` | 1 / 4 | KEEP | Original E2E candidate; retain native ownership design/history |
| `t3-551ab369` | `t3/contrast-gate` | `86b74c3a1869` | 1 / 3 | KEEP | Original contrast candidate; retain initial failure/correction evidence |
| `t3-69c42e7b` | `t3/e2e-lifecycle-r4-correction` | `292771642653` | 1 / 4 | KEEP | E2E R4 precursor; preserve startup-race lineage |
| `t3-6d10e797` | `t3/prepare-wsl-predicate-case` | `a1d7592e65ba` | 0 / 10 | KEEP | WSL executor R1 Source and review lineage; not a reusable executor |
| `t3-6e5f7dd4` | `t3/a11y-hint-id-collision-fix` | `a1d7592e65ba` | 3 / 3 | KEEP | A11Y intermediate collision correction; preserve ownership regressions |
| `t3-6f365ec7` | `t3/a11y-hint-id-collision` | `a1d7592e65ba` | 3 / 3 | KEEP | A11Y earlier collision candidate; preserve original evidence |
| `t3-76750b9f` | `t3/g1-r9-source-correction` | `a1d7592e65ba` | 4 / 1 | KEEP | G1 R9 rejected predecessor; preserve whole test history |
| `t3-7fef5f84` | `t3/g1-r7-combined-history` | `3b84986ffd5e` | 4 / 1 | KEEP | G1 R7 combined histories; retain frozen controls, not current acceptance |
| `t3-84a839b8` | `t3/pressproof-gemini-design-review` | `3b84986ffd5e` | 0 / 2 | KEEP | Gemini Source proposal/results; no pixels or design acceptance |
| `t3-94aa81d5` | `t3/e2e-startup-timeout-race` | `3b84986ffd5e` | 1 / 4 | KEEP | Accepted E2E R5 origin; preserve exact dirty postimages and result history |
| `t3-9a61eb7d` | `t3/grounding-g1-repair` | `86b74c3a1869` | 4 / 1 | KEEP | Initial G1 repair candidate; preserve source/review provenance |
| `t3-9a759bfe` | `t3/g1-r6-source-corrections` | `05b859e13d48` | 4 / 1 | KEEP | G1 R6 predecessor; retain old controls and known bypass history |
| `t3-9aa48ded` | `t3/grounding-g1-correction` | `86b74c3a1869` | 4 / 1 | KEEP | G1 earlier correction; preserve rejected postimages |
| `t3-a4173ab2` | `t3/windows-finite-case-revision` | `a1d7592e65ba` | 0 / 8 | KEEP | Windows R2 proposal with unresolved ABI and four Source findings |
| `t3-a4aeb610` | `t3/design-motion-research` | `6e6c13f5db5d` | 0 / 6 | KEEP | Six-file DSH motion/design research original; retain provenance |
| `t3-afca85b6` | `t3/a11y-hint-save-status` | `a1d7592e65ba` | 3 / 3 | KEEP | A11Y R3 original; preserve two-P2 regression lineage |
| `t3-b1a7a4d5` | `t3/g1-r11-a11y-r5` | `1fb6f71fb332` | 7 / 4 | KEEP | Combined rejected G1 R11 and focused-passing A11Y R5; do not bulk merge |
| `t3-b88271ff` | `t3/g1-grounding-r4-correction` | `7d40425a9cbc` | 4 / 1 | KEEP | G1 R4 predecessor; preserve uncommitted source and tests |
| `t3-bf853bb9` | `t3/g1-r10-grounding-source-correction` | `a1d7592e65ba` | 4 / 1 | KEEP | G1 R10 diagnostic origin; retain actual failures |
| `t3-c4597a35` | `t3/contrast-m1-r2-revision` | `86b74c3a1869` | 1 / 3 | KEEP | Contrast R2 predecessor; preserve correction history |
| `t3-cf7041b5` | `t3/windows-finite-case-proposal` | `a1d7592e65ba` | 0 / 7 | KEEP | Windows R1 seven-file inert proposal; preserve protocol gap history |
| `t3-e00182b7` | `t3/e2e-lifecycle-r2-source-fixes` | `86b74c3a1869` | 1 / 4 | KEEP | E2E R2 precursor; preserve native lifecycle progression |
| `t3-e05a8f36` | `t3/livebench-provider-evidence` | `3b84986ffd5e` | 0 / 0 | REMOVE (recommendation only) | Empty stalled Grok Source tree: no dirty/nonignored files or divergent commits; owner must first check ignored/private artifacts and supported cleanup |
| `t3-e8d401d4` | `t3/g1-r3-source-corrections` | `86b74c3a1869` | 4 / 1 | KEEP | G1 R3 rejected precursor; preserve postimages and tests |
| `t3-ea0c895a` | `t3/a11y-hints-save-status` | `6e6c13f5db5d` | 2 / 3 | KEEP | Original A11Y hints/save proposal and focused-test history |
| `t3-eb89e021` | `t3/wsl-predicate-case-r2` | `5199d328d97e` | 0 / 13 | KEEP | WSL R2 thirteen-file design/control origin; preserve qualified microroute lineage |
| `t3-f54d4b75` | `t3/g1-r10-1-grounding-fixes` | `a1d7592e65ba` | 4 / 2 | KEEP | G1 R10.1 source and both result reports; preserve history |
| `t3-f66efc7c` | `t3/contrast-r4-source-correction` | `86b74c3a1869` | 1 / 3 | KEEP | Accepted contrast R4 origin; preserve exact dirty postimages/results |
| `t3-fcd3c5c8` | `t3/grounding-g1-source-corrections` | `49e2e5ed8304` | 4 / 1 | KEEP | G1 earlier correction on original DSH base; retain safeguards/history |
| `t3-ff301e75` | `t3/grounding-g1-r8-corrections` | `a1d7592e65ba` | 4 / 1 | KEEP | G1 R8 rejected predecessor; preserve corrected assertions |

## Native actor state and evidence custody

The fresh 2 November read of existing broker
`46ac76de-4e76-42b4-a2b1-9f6d4e09c559` returned completed on Sol 6.1 with its final
closeout message; it was inspected, not woken. Its local 31-row ledger remains
28 completed, one historical quota failure and two held requests with null
native handles. No active rows are reported. The separate **1 November** native
inventory contains 64 terminal children and zero active children; this is a dated
inventory, not a new global OS/provider/MCP-eviction certificate.

Use `FINAL-BROKER-SNAPSHOT.json`, the private native ledger at
`docs/resume/20261029/NATIVE-DISPATCH-STATUS.json`, and the broker's private final
handoff for actual task/thread/run IDs. Do not restart the two historical held
requests automatically. No model, Source author, reviewer or runtime phase was
started to write this document; this is operator integration of existing evidence.

Private snapshots and manifests survive ordinary PC/WSL shutdown. In particular:

- `R12-FROZEN-ARCHIVE.json` and `R11-R5-FROZEN-ARCHIVE.json`: 5 + 11 frozen files;
  source and backup raw hashes matched at this handoff capture.
- `R12-ACTUAL-ARCHIVE-MANIFEST.json`: 24 files / 328529 bytes for actual case data,
  copy manifests and Root adjudication.
- `FINAL-CUSTODY-ARCHIVE-MANIFEST.json`: 26 files / 1032316 bytes for stopped
  review/input/reap/final-inventory evidence.
- `FULL-GATE-R1.1-ARCHIVE.json`: unexecuted draft and frozen review snapshots.
- `G:/Backups/Applywright/20261101-resume/final-metadata`: final remote readback,
  metadata files and Root's actual named-note publication receipt.

Do not publish raw provider inventories, credential metadata, compiled helpers
or unrelated local dirt. A clean clone contains tracked public summaries, not
all private raw evidence. Check the referenced private archive exists before
claiming that a future machine has the complete closure.

## Open gates and the releasing owner

| Open gate | Current condition | Who releases it / required proof |
| --- | --- | --- |
| Named Claude co-orchestrator ownership | No actual receiving ACK verified here; blocked goal is not resumed by this file | Receiving Claude returns actual identity/thread/harness/model/scope; Root/operator records it and releases the next specific commission. Existing Codex and T3 claims stay until reassigned. |
| New G1 Source repair | R12 rejected; no automatic R13 | Claude/Codex project architecture with Root's owner coordination assigns a new exact worktree/surface; DSH writes; a distinct Sol 6.1 High/xhigh Standard reviewer reviews it. Source PASS alone is not runtime acceptance. |
| Full-gate executor, setup and dependency closure | R1.1 has 9 P1 + 3 P2; 65 locked payload records are not a qualified install | Root independently dispositions exact successor Source, runtime/startup/dependency/default-worker/effects/cgroup/custody coverage and meaningful controls before any setup/gate run. No old approval retargeting. |
| Focused/independent finite execution | Old exact cases consumed and released | Root issues NEW exact source/plan/input/output authority; actual current native/domain/slot/resource admission and canonical full-lifetime EX are required. The actor running a case proves owned terminal/cleanup and before/after pins. |
| Three integrated gates | NOT_RUN on current G1/A11Y candidates | Root qualifies/binds the exact current stage and setup; the released operator executes `node --test tests/`, `node --test server/lib server/provider`, and `node scripts/check.js` under full-lifetime EX, preserving all failures/skips. |
| Product acceptance and merge | No new G1/A11Y product acceptance | Designated project acceptor, supported by independent review and all applicable actual gates; operator integrates named accepted postimages only, commits named paths, sacred-checks and verifies both remote refs. Never bulk-merge the combined R11/R5 tree. |
| Windows finite-case custody ABI | R2 REQUEST_CHANGES 4 P2; no qualified executor | Root/assigned native-ownership owner must review and qualify an exact successor. WSL diagnostics cannot substitute for Windows/native evidence. |
| Real DOM / AT / browser / visuals | Focused fake-DOM tests and Source proposals are insufficient | Project owner plus Root-approved native/GUI safety release: fresh admission, one guarded controller, owned test profile/DB/port, no main Chrome. Actual relevant consumer evidence; visual acceptance remains separately recorded. |
| Terra and estate-cua adoption | Limited dated Root pilot/driver release only | Root's exact tested roles, current account catalogue and fresh native/GUI admission. No generic Max superiority or latest-driver claim is made here. |
| New preview / hosting / deployment | No listener on local 3160 at capture; public status UNKNOWN | Root/shared port owner and project deployment owner qualify launch, credential/model/budget and host/port lifecycle; Johan supplies any required DNS/hosting decisions. Old tunnel links are not a new test URL. |
| Shared brain/vault publication | Existing named-note publication is proved; this document makes no shared write | SAME Estate is sole A/B publisher. Project sends a named proposal; publisher provides actual note/commit/readback. Only `brain/applywright-platform.md` is the assigned B surface. |
| Paid provider use | Exact balances and spent/pending/reservations UNKNOWN here | Toolchain/accounting owner supplies the approved adapter/selected-variable loader, entitlement and real budget ledger/cap admission. Johan's funding assumption is not observed accounting. |
| Business/human actions | DNS/hosting, Stripe sign-in/keys, VAT/invoicing, Scale price, consumer sign-in and returning-owner ACK remain applicable | Johan or the specifically named authorised owner when the dependency is reached. Never infer sign-in, payment, posting, business choice or production release from a document. |

Root: Codex chat `01a183f2-68ec-7223-bb5b-0705764b0734`.
Current project operator: `01a183ff-e374-7d32-ae0e-1938714e813c`.
SAME Estate publisher/coordinator: `3e09eb96-365d-4610-adfe-9de6d68ce445`.
T3 project environment: `c9887cd0-5164-44d0-a8c0-acc6c583ca42`.
Publications and peer receipt ACKs do not establish a new receiving lead.

## Provider work, credit use and UNKNOWN values

These are recorded project observations, not fresh entitlement tests. Read
`docs/PROVIDER-CREDITS-AND-HANDOFF.md` for exact sources and route limits; verify
current account metadata/terms before future use. This handoff itself launches
no additional provider call and makes no global configuration change.

| Provider / route | Recorded useful work or state | Usage / cost / next constraint |
| --- | --- | --- |
| DSH / official Windows DeepSeek Flash native T3 | G1/A11Y/finite-case Source authors and six-file design/motion research; 15 DSH rows in the current 31-row ledger | Per-task tokens, billed cost and served identity **UNKNOWN**. Unlimited logical delegation retains actual resource/claim/lock gates. Outputs need independent review. |
| Codex native / Sol 6.1 | Project orchestration and independent reviews; 16 ledger rows include historical failure/held requests, not 16 successful executions | High/xhigh, explicit Standard/default and Fast OFF for this resume. Per-task tokens/cost/served identity **UNKNOWN**. Last saved 1 November account snapshot: 26% weekly used / 74% remaining, account-wide; current 2 November usage **UNKNOWN**, not a project invoice. |
| Claude native subscription | Incoming project co-orchestrator/claim-contract advisory was prepared/deferred; no project advisory run claimed | Actual receiving identity, current entitlement and billed T3 route **UNKNOWN** until verified. Other estate lanes' Claude reviews do not prove a project invocation or project spend. |
| Gemini subscription / AGY | `gemini-4-argon-high` Source-backed design proposal, frozen/reaped | Tokens/cost **UNKNOWN**; zero decoded pixels proved, so no rendered-design acceptance. Gemini API key is images-only through the approved contract. |
| Grok native CLI/Build | Earlier `grok-4.7` trial had setup/dispatch evidence, no useful research output, then terminal cancellation | Useful research remains open. Tokens/cost **UNKNOWN**, not zero; a future trial needs finite useful-output/liveness evidence. |
| Meta MuseCode Wonder | `muse-wonder-1.0`, contributor OFF at the recorded task; 23 clear + 3 uncertain advisory cases | Tokens/cost **UNKNOWN**. This is advisory delivery, not an independent semantic oracle or current account qualification. |
| Terra 6.1 | Root's bounded 29 October pilot: High 43/45, xhigh 45/45, Max 43/45 on one fixture; no project implementation adoption | Task-specific competence/cost and current applicability **UNKNOWN** outside that fixture. No general Max superiority; only Root-released roles. |
| Jev / Hermes / Cursor / other hosts | Jev advisory route still required; installed/configured hosts alone are not a completed project provider task | Actual project invocation, served model, tokens, cost and entitlement **UNKNOWN** unless a named receipt proves them. No fallback around a denied scope. |
| Claude Org direct API | Approved profile recorded as `claude-org-api`; bounded eligible direct pilot prepared, NOT_SUBMITTED | Johan says assume MORE THAN USD100 available; conservative USD100 planning envelope, operator-reported expiry 22 November 2026. Exact balance, spent/pending/reservations and project billed cost **UNKNOWN**. Existing shared Claude USD190 cycle cap and approved accounting gate remain. No project paid call is claimed. |
| OpenAI Org ordinary API Platform | Prepared use cases; no qualified current project adapter/profile/model/accounting path or project call | Johan's same MORE THAN USD100 assumption is planning only. Exact balance, expiry, spent/pending and project billed cost **UNKNOWN**. Recorded promotional benefit excludes API-key Codex use; it does not replenish subscription limits. |

Recorded Claude monthly API-grant guidance excludes Claude Code/apps/extra
usage; purchased credits are a separate category. Do not generalise one credit
category to another. No purchased-credit fallback, purchase/autoreload, Admin-key
request or repeated balance question is authorised by the planning assumption.
Use the tool's own sign-in or the approved selected-variable loader; never read,
print, copy or infer secret-store, `.env`, auth/token values or authentication
homes. A prepared call is not billed-zero evidence. Missing telemetry stays
**UNKNOWN**, never zero or an invented total from cached dashboard counters.

## Exact first three tasks for the Claude Applywright co-orchestrator

### 1. Establish the actual receiving owner and a bounded project commission

Read this handoff and its linked current evidence; verify the project HEAD and
both remote refs, the worktree table against current state, and native broker
status without waking it. Return your actual owner/thread link, native
harness/provider, exposed model/effort/tier, accepted co-orchestrator scope and
UNKNOWN telemetry. Relay the actual ACK to Root through an authorised available
channel, or return a paste-ready relay if no channel exists. Have Root/operator
record the named receiver and next exact assignment outside the sealed packet.

**Done when:** Root's live ownership record contains the actual receiver/scope
and a specifically released next commission; existing Codex/broker/shared
publisher claims remain explicit. This first task does not run code, restart
workers, switch a live parent, alter globals, spend or claim product completion.

### 2. Produce a stopped G1 successor with occurrence-bound claim support

After task 1 and fresh Source admission, commission DSH Flash in a NEW assigned
worktree. Read current main/c7 safeguards, both historical test sets, the exact
R12 Source review and actual failures, and the complete claim-record contract.
Assign `server/lib/cv/tailor.js`, `refine.js`, their two `.test.mjs` files and one
named result report; module extraction requires a separately explicit surface.
Preserve frozen R12/R11 and original assertions/oracles. Repair actor/relative
scope, technology polarity/attachment, full measure subjects, currency/period
occurrences, event-versus-employer roles, explicit factual slots and canonical
language/unit forms. Preserve supported omission versus refine's no-dropped-
metric asymmetry. Keep the bridge-design refusal and faithful/adverse twins.

Use a distinct native Sol 6.1 High/xhigh, Standard/Fast OFF reviewer on the
stopped exact candidate. Do not use the DSH author as final reviewer or execute
tests in a model Source phase. No deny-all, hardcoded witnesses, weakened
expectations, dropped history or automatic repair loop counts as success.

**Done when:** a hash-pinned stopped successor and independent review address
all nine R12 findings and preserve the complete required test history; any
remaining REQUEST_CHANGES is carried forward explicitly. No merge or runtime
acceptance follows merely from Source PASS.

### 3. Resolve the full-gate execution prerequisite with Root

Present Root with the exact full-gate R1.1 review (9 P1 + 3 P2), its identities
and disclosed plan drift. Obtain an explicit successor assignment; use DSH for
the bounded implementation and a separate Sol review. Address all finite
failure paths, not just two headline symptoms: sticky failure/timeout outcomes,
pre-effect ownership and partial placement, last-holder durable recovery,
kernel/domain/native binding, positive startup/one-use/freshness/framing,
default workers, filesystem/FD/SQLite/network/listener effects, useful helper
tests, dummy fixtures and reachable fault controls/terminal evidence.

Root must bind actual dependency payloads and complete startup/runtime/effect
closure, then qualify the meaningful custody/death/timeout/useful-path controls
under NEW exact authority. Existing A11Y-only manifests do not automatically
cover task 2's G1 postimages; each current stage/candidate needs its own binding.
No stage/install/parser/control/test is allowed merely because drafts exist.

**Done when:** Root records an exact usable, independently reviewed and actually
qualified route for the intended current stage, or an exact unresolved blocking
condition with its responsible owner. The frozen R1.1 draft is not a fallback.

**After these three tasks:** obtain NEW case approvals, run the exact focused and
independent fixtures plus all three mandatory integrated commands under actual
full-lifetime EX, inspect every failure/skip, and integrate only independently
accepted current product paths. Keep G1/A11Y acceptance separate. Commit named
paths, run staged and committed sacred guards, push/read back both remotes, and
coordinate the next shared note update with Estate. Then pursue the qualified
preview, real DOM/AT/browser/visual evidence and remaining P0–P7 work. Do not
reinterpret this sequence as an automatic production or finance release.

## Shared publication already completed and limits retained

Only Estate wrote the named B note `brain/applywright-platform.md`. Local B
commit `cfd5ab01d8ae171adc04e84b1ea08bd08c01e6c4` and exact physical/committed raw
SHA256 `86cf9c44a4966a1619c3a964a3cb2619569be11079d97e4fc1b4a22c735fd746` are recorded
in the project readback. The owner reconciled the stale supplied base with newer
history and preserved it. B remote proof is NOT_CLAIMED. Shared A final addendum
was `c8787e75770a0dbc6d2fe85580837a93dad92c24` in Root's final delivery receipt;
the project operator performs no hub Git or direct shared brain/vault writes.

This new project handoff does not require another shared-publication loop to
be usable. Root may reference it in the live owner record. Preserve credentials,
foreign dirt, all evidence and original plans. No WSL shutdown, scheduled-task
restoration, PM2/fleet mutation or disk cleanup is performed here. No tests are
rerun for this documentation-only change; verification is register/worktree
coverage, metadata/receipt consistency, archive hashes, named Git diff/guards,
and actual push/readbacks.
