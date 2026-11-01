# G1 R10.1 independent exact SOURCE review

**REQUEST_CHANGES — SOURCE_TRACED / NOT_RUN.**

Both commissioned defects are addressed in the exact bytes, with no unauthorised expectation change or predicate relaxation relative to R10. However, a separate retained assertion at **refine.test.mjs:542** still conflicts with the restored, unit-bearing R9 display span. This is one P2 retained-suite conflict, inherited from earlier candidates, not introduced by R10.1. It prevents predicting a clean retained suite. The four requested advisory residuals also remain OPEN; they are recorded separately and are not demands to expand this narrow commission.

Counts: **2/2 commissioned repairs addressed; 134/134 definition lines retained in order (69 tailor + 65 refine); 0 newly introduced P1/P2 defects found; 1 additional inherited P2 retained-test conflict; 4/4 advisory residuals OPEN (2 P1, 2 P2).** Execution pass/fail/skip counts are UNKNOWN, not zero. No candidate acceptance, integration or whole-mission completion is given.

All source/test references below are relative to the candidate's server/lib/cv/ directory unless another path is stated.

## Exact custody and authority

- Candidate: C:/Users/johan/.t3/worktrees/applywright/t3-f54d4b75
- Actual root: C:/Users/johan/.t3/worktrees/applywright/t3-f54d4b75
- Actual branch: t3/g1-r10-1-grounding-fixes
- Actual HEAD/base: a1d7592e65ba291c0bf89d8a6552ab4090073037
- Before and after: exactly four unstaged modified paths, server/lib/cv/tailor.js, server/lib/cv/refine.js, server/lib/cv/tailor.test.mjs and server/lib/cv/refine.test.mjs; exactly two untracked reports, GROUNDING-G1-R10-1-RESULT.md and GROUNDING-G1-R10-RESULT.md; no staged paths.

Initial root/branch/HEAD/status and all six length/SHA256 measurements preceded tracing. A structured pre-output remeasurement and the post-report measurements are in REVIEW-IDENTITIES.json. Every measurement agrees with the supplied identities:

| Path | Bytes | Raw SHA256 |
|---|---:|---|
| tailor.js | 182026 | bae55900ba920505b69a31e74d9824de5b0bea02ba942ddbe8f5e6fc78cb4fd5 |
| refine.js | 85028 | 52b3b2d7ab953771c9caa025f02522533b897e1f15fcf0a83c7315bb1404920f |
| tailor.test.mjs | 122035 | c5720d759475cb4ca102f0d192107a99109a5cb27b6dab74f7a5ca94561b20f2 |
| refine.test.mjs | 81182 | 2b4ad2ef83d3fd18ad0751778689e7c6d114003a2c2b1c350e2ca3537de260d5 |
| GROUNDING-G1-R10-1-RESULT.md | 13303 | 538aacce9b94daa8fd669213bcb593d457cf288b4f024fe681f9375df08e589f |
| GROUNDING-G1-R10-RESULT.md | 21069 | 9ac148b2eead7bd87d6fb13fb430536a01d5a6ff9ec2db72f91fbbbc4fa9b516 |

The new report body, raw bytes after the first LF, independently hashes to 94a58e2910968235f2d1072e9ee1de60fc6f0c2bd7f80b7a96aedd66090689f5. The carried report body hashes to bd565e5eca1b50319bd8406a71f43c080251cb724d87054e28fef22e9a000973. The entire carried report and tailor.js are byte-identical to R10.

Read fully: CURRENT absolute main AGENTS.md; docs/resume/20261101/RESUME-AND-HANDOFF-PLAN.md; docs/resume/20261101/G1-R10-1-COMMISSION.md; docs/coordination/reviews-20261031/G1-R10-REVIEW.md; docs/t3/receipts/20261029-resume/g1-r9/review/REVIEW.md; the carried R10 writer report; all five R10.1 files. Also read the relevant receipts, the consolidated DSH advisory, and shared server/lib/text.js statically. Existing receipt/authority hashes are recorded in the identities file. Writer statements were treated as claims and checked independently.

Frozen five-file identities were freshly measured in each of R10 t3-bf853bb9, R9 t3-76750b9f, R8 t3-ff301e75 and R7 t3-7fef5f84, before and after this review. All 20 assigned file lengths/hashes, their branches, HEADs and Git status remain unchanged and agree with the saved historical identities. R7 correctly has its older HEAD 3b84986ffd5e334ae53b21ffb7d19b9934f1e7dc, rather than the successor base. The frozen 194931-byte R7 patch still hashes to 48bcf2bf468f996b17840886ce91f03bd30dfcba1457d03c0528ace151a8ec2e. This reviewer wrote to none of those trees. This is scoped file/status evidence and reviewer action history, not proof that no external actor ever wrote and restored some other byte.

## Commissioned defect 1 — ADDRESSED

The old R10 tailor.test.mjs:1705 pair was:

- Before: "Led 12 engineers across two squads."
- After: "Led a team of 12 engineers."
- Options: {}
- Old assertion: BOTH acceptance through the old accepted-table loop at :1721-1722.

Final accepted table is tailor.test.mjs:1708-1726. The row is absent. Its loop at :1727-1730 iterates only that local table; it cannot reach the adjudicated pair. No helper, loop assertion or predicate was disabled.

Final :1747-1752 explicitly calls groundChanges for the identical pair, asserts ok === false and requires /figure two was dropped/. Final :2657-2675 retains the separate F9 control: the exact pair is passed to assertGrounded at :2667 and accepted at :2668; groundChanges is refused at :2669-2674. The refine mirror at refine.test.mjs:1768-1772 remains a refusal. The older multiline CV assertGrounded-only positive at tailor.test.mjs:132-138 also remains; it is not a BOTH acceptance and uses the larger CV source.

SOURCE trace: refine.js:420-439 extracts "two" as a spelled figure; its key is absent from the target. The actual-source drop loop :860-870 therefore emits "figure two was dropped" at :867. Tailor's figure loop :4476-4511 checks target additions only; source engineers and ownership anchor the target at :4248-4364. These are static refusal/acceptance predictions, not calls.

The exact new historical BOTH-refusal row is final tailor.test.mjs:1689-1696:

| Before | After | Options | Source prediction | Intended |
|---|---|---|---|---|
| Led the migration of 14 payment services across 12 teams. | Led a team of 12 engineers. | {} | BOTH REFUSE, including ownership reason | REFUSE unsupported engineering-team leadership |

The active loop :1698-1704 asserts false and /stronger level of ownership/. The message exists at tailor.js:4741. Ownership provenance :3860-3888 and :3962-3989 keeps migration as the source object; engineers has neither its head nor a carried source phrase. The same-head/figure anchors :4291-4347 cannot borrow the adjunct "12 teams" for engineers. The support floor :4355-4361 rejects target "led"; groundChanges receives this entity reason at refine.js:796-805. Thus the new row's reason pattern is source-compatible.

The weaker target "Led 12 engineers." at :1683-1688 is retained. The no-drop shared positive from old R10 :2067 is now :2095, with its empty-reasons and true assertions at :2097-2101. Refine's no-drop positive remains :1775-1776. Both-path accepted engineering-team coverage therefore remains, alongside the separate tailor-only count-dropping control.

Only one existing expectation changes relative to R10: removal/reclassification of the old unsafe BOTH row. There is one new historical BOTH-refusal row and one added explicit drop-refusal block. No other existing expected value, assertion or control was changed or removed. The comments at :1732-1745 and :2658-2664 and the new result report explicitly record the adjudication. A carried historical R10 comment at :2087-2094 still says the old R8 row stays byte-identical; that sentence is stale in R10.1, but its no-drop row and assertions are correct and untouched. This is a documentation note, not an additional expectation change or a requested new correction round.

## Commissioned defect 2 — ADDRESSED, with the separate retained conflict below

R10 refine.js:410 used collapse(source.slice(match.index, end)). R10.1 refine.js:415 restores collapse(match[0]), exactly the R9 expression at its :370. The FIGURE_RE at :190-191 is byte-identical to R9.

For "Processed 100000000 requests.", FIGURE_RE captures the numeric/value span; collapse removes trailing whitespace. The lexical fallback :387-401 still consumes requests into family = "lex:request" and extends end. The emitted entry still carries key/valueKey/currency/percent/unit/index/end at :402-418. Only raw and its comment changed. The target lacks the typed key, and the actual-source drop loop :860-870 now constructs exactly "figure 100000000 was dropped". The contact lookahead :713-725 still recognizes requests as a metric; it does not exempt the number.

Retained refine.test.mjs:1435 and :1645 are byte-identical to R9 and R10, including line endings. Their surrounding false/warnings/kept assertions remain. The phone-warning assertions :1445 and :1653 are likewise byte-identical. Contact recognition uses source spans and entry.index (:691-740, :857-865); warning text uses contact.text (:872-877), not entry.raw. Hence restoring raw does not alter those contact-warning paths.

Digits-only here means the frozen R9 value span for the bare request count, not stripping every non-digit from every figure. Currency, percent, multiplier and recognised-unit text remain as written:

| Figure kind | Display span retained by FIGURE_RE | Separate comparison identity |
|---|---|---|
| Currency | £40,000; $40,000; GBP 40,000; £240k; trailing ISO codes | canonical numeric value and currency code |
| Percent | 40%; 40 percent; 40 per cent | canonical value plus percent flag/key |
| Multiplier/scale | 3x; 3 times; 40k | x family or scaled canonical value |
| Recognised duration/storage | 840ms; 3 ms; 3 GB | duration/storage family |
| Fallback noun/unit | 3 from "3 kilograms"; 100000000 from "100000000 requests" | lex family/key and extended association end |

Currency/percent/recognised-family branches never gained the R10 lexical extension, so their raw text is unchanged by this patch. Currency matching/refusal at :817-845 remains intact, including the retained $40,000 assertion at refine.test.mjs:704.

All raw consumers were traced: reassociation message :620; currency message :839; new-figure message :848; dropped-figure message :867. For fallback lexical nouns, the reassociation and new-figure messages also lose the noun, as does the dropped message. This is the scope of restoring the shared raw field, not a drop-only formatting change. Message deduplication can combine equal numeric descriptions of different lexical keys; refusal remains refusal because at least one reason survives. Key sets, unit identity, source entries, end-based clause windows, contact indices and rules/model assignment decisions do not consume raw as comparison authority.

Meaningful controls retained: kilograms/tonnes refusal and unchanged/plural alias positives; clause-separated measure refusal and unchanged assignments; GB alias/TB refusal; x/times; spelled hours; hyphen day count; currency identity and context-swap refusal; percent wording; c7 index/fill checks; Azure returned-text controls; Zephyria hard refusal and soft warning. Their test expectations are unchanged, but their execution remains NOT_RUN.

## Additional ranked finding — P2, inherited retained-suite conflict

### F1: recognised ms remains in raw, but refine.test.mjs:542 requires its absence

Evidence: refine.test.mjs:525-542; refine.js:190-191, :375-381, :415, :860-870. This same assertion is byte-identical in R9, R10 and R10.1; R9 FIGURE_RE and raw expression already contain the same mismatch.

| Before | After | Options | SOURCE prediction | Intended control |
|---|---|---|---|---|
| Exact source at refine.test.mjs:525-528, including "cut p95 API latency from 840ms to 220ms" and its phone block | Exact rewrite at :529-532 with " 840ms to 220ms" removed by :540 | {} | REFUSE metric drop, with "figure 840ms was dropped" and "figure 220ms was dropped"; :542's /figure (840\|220) was dropped/ cannot match these reasons | Refuse metric loss, name the lost metric, preserve the genuine-phone-only positive/warning |

The numeric expression consumes the recognised suffix ms. collapse(match[0]) therefore yields 840ms/220ms, not 840/220. The two duration keys disappear from the target, and neither 3-digit metric is phone data. The dropped-reason builder interpolates those unit-bearing raw strings verbatim. Tailor is called with figures:false, so it supplies no alternative digit-only figure reason that could rescue :542. If the earlier assertions are reached successfully, :542 is predicted false; any earlier failure also leaves this definition red. No execution result is claimed.

This does not invalidate the two specifically commissioned repairs. It does invalidate a claim that restoring the R9 raw span reconciles every retained display assertion. No additional test expectation was secretly changed to hide it.

Operator options, requiring explicit disposition rather than a leaf edit: validate this exact retained definition under the reviewed finite EX; then either authorise an equally specific unit-aware diagnostic assertion while retaining false + metric naming + phone warning, or commission a separate display-format policy that reconciles numeric-only drop text with currency and typed identity. The current grant does not authorise silently weakening or editing :542, and this review changes nothing.

## Requested DSH residual audit — inherited, no scope expansion demanded

All predictions use default options {}, unless shown. These code paths are unchanged from R10 except the display raw discussed above.

| Residual | Rank / status | Exact source evidence and finite prediction | Intended control / boundary |
|---|---|---|---|
| Same-clause two-measure swap | P1 / OPEN; broader F4 remains PARTIAL | tailor.js:1280-1329 and refine.js:561-619 delimit clauses only with period/semicolon/colon/newline. "Latency was 3 ms and processing time was 5 ms." -> "Latency was 5 ms and processing time was 3 ms." keeps all keys and gives every measure the same clause noun set; any shared token satisfies :1326 / :616. BOTH ACCEPT predicted. | REFUSE changed assignments. Preserve the semicolon-separated refusals at tailor.test.mjs:2556 and refine.test.mjs:1740-1748, unchanged assignments and faithful clause reordering. No R10.1 regression: raw does not affect these comparisons. |
| Third-party employer transfer | P1 / OPEN | employerNamesIn at tailor.js:403-408 captures worked-at anywhere and never calls thirdPartyActorBefore. employers.has at :4695-4700 then licenses "My colleague worked at Initech." -> "I worked at Initech."; BOTH ACCEPT predicted. The title/award actor guards :847 / :1724 do not guard employer extraction. | REFUSE colleague-to-candidate employment; preserve the genuine own-employer casing and copular positives, and the venue/technology negatives. Existing title/award fixes are partial actor coverage, not an employer-owner fix. |
| Venue over-block | P2 / OPEN | tailor.js:555-559 treats any of the previous five words as an event cue; employerNamesIn :416-422 discards the name. "Led the workshop team at Northwind." -> "Worked at Northwind." gives BOTH REFUSE with new employer predicted (:4695-4700). | For the advisory's intended genuine-company/team reading, ACCEPT the weaker employment rewrite. Preserve refusal of "I led a workshop at Azure." -> "Worked at Azure." The ambiguous venue/employer reading is not resolved by the five-word heuristic. |
| Duplicate unit/association helpers | P2 / OPEN, maintenance/consistency residual | tailor.js:1039-1050 uses CLAIM sets, COMMON_VERBS, verbLevel, months and titles; refine.js:280-294 uses STOPWORDS/MEASURE_SKIP_WORDS and duration/storage sets. measureClaimTokens/measureReassociation are duplicated at tailor.js:1280/1318 and refine.js:561/608. For "Recorded 3 review items." -> "Recorded 3.", review is skipped as COMMON_VERBS by tailor but becomes lex:review in refine; assertGrounded ACCEPT and groundChanges REFUSE with new/drop reasons predicted. | Pin intended shared lexical identity with both-path controls while keeping the deliberate one-way drop distinction. DSH examples "3 design"/"3 support" alone do not prove divergence: both implementations skip those words. No helper hoist or unrelated rewrite is required by this review. |

These are source-derived finite examples, not newly executed fixtures or revised oracle outputs. Their presence is not evidence of a new R10.1 bypass. They remain visible for the operator's existing finite-case/acceptance work.

## Byte retention and allowed diff

Read-only zero-context diffs versus frozen R10 show:

| File | Exact differing old -> final lines | Scope |
|---|---|---|
| tailor.js | none | byte-identical |
| refine.js | 410 -> 410-415 | one raw expression plus comment |
| tailor.test.mjs | insertion after 1688 -> 1689-1696; removal 1705; insertion after 1724 -> 1732-1752; comment 2630-2635 -> 2658-2664 | three adjudicated prefix hunks plus F9 comment |
| refine.test.mjs | comment 1763-1766 -> 1763-1767 | comment only |

Independent raw-preserving line exclusion of exactly these hunks makes the remaining complete byte streams equal for all three edited files. This comparison retains CRLF and EOF state; it is not normalized-diff evidence alone. No other expectation/control/assertion changed. The four source/test files retain CRLF; the two tests retain their absent final newline. Read-only git diff --check reports no whitespace error; no parser ran.

Static anchored definition lines are identical and ordered: 69 tailor and 65 refine, with zero indented definitions. There is no skip/todo/only test declaration added. The historical refusal is a new table row, not a 135th definition.

Frozen R8 tailor.test.mjs is 90524 bytes, SHA256 7ca37463fb1af5e26bf45e8fc902e6ef54b0922f65045565c6e85583eeebb14d. R10's first 90524 bytes match it. The three authorised prefix hunks add a net 1611 bytes; the corresponding R10.1 prefix is 92135 bytes. Removing exactly those additions and the old adjudicated row from the respective streams leaves every other prefix byte equal. The literal first 90524 bytes of R10.1 are therefore not claimed as an unchanged prefix.

Frozen R9 refine.test.mjs is 77119 bytes, SHA256 81d65ca4b4eacfec72b7597eaea84e9e0c7ddf0d58eedaa38e98761e09e907c4. R10.1's first 77119 bytes match exactly. The four required lines :1435/:1645/:1445/:1653, and the additionally identified :542, have raw line-with-CRLF hashes in REVIEW-IDENTITIES.json.

## Identity, ownership and unrun gates

This is one independent leaf review. No delegate was created and no parent was messaged or reconfigured. The broker and operator retain sole execution/integration/acceptance/commit/push authority. Human parent selections and every setting remain untouched.

Saved review payload explicitly requests Codex gpt-6.1-sol, reasoningEffort xhigh, serviceTier default (Standard, Fast OFF). The host identifies this session as T3 Code through Codex gpt-6.1-sol/xhigh. Actual served backend identity, actual billed service-tier telemetry, leaf native task/run IDs, token usage and cost were not independently exposed here and remain UNKNOWN/null. Writer identity receipts describe the DSH writer and are not substituted for reviewer identity. No config/profile, account or process-argv intake was used to infer missing values.

NOT_RUN for this leaf:

- Node, import, syntax/parser, PowerShell JS parser, Add-Type, test/oracle/fixture or any project execution.
- Focused 134 definitions; retained 211 comparisons; prepared 76 comparisons; all finite predictions and the newly identified :542 control.
- node --test tests/
- node --test server/lib server/provider
- node scripts/check.js
- Reviewed finite Windows EX execution/composition, actual full-lifetime canonical EX/resource admission, and any WSL diagnostic execution.
- Native ownership qualification and isolated browser journey, independently.
- Build/compiler/native/browser/GUI/AT/server/product/model/API/network phases, deployment, runtime and whole-mission qualification.

No installs, Git writes, credentials/env/auth/token/config/profile/store or foreign-argv intake, settings/guard/slot/context/access/default/process/service/PM2/WSL/scheduler/goal changes occurred. Full access was only the permission mode; read-only SOURCE scope remained instructional. Only this REVIEW.md and REVIEW-IDENTITIES.json were created.

Next operator check: carry the two repaired controls and the retained :542 conflict into the already-required reviewed finite EX after the proper owner release; retain exact before/after identities and actual pass/fail/skip evidence. The four inherited residuals remain explicit acceptance inputs, without an unrequested broad correction commission.

