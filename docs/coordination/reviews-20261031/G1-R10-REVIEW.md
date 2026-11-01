# G1 R10 pre-review (advisory, read-only)

Subject: writer candidate `C:/Users/johan/.t3/worktrees/applywright/t3-bf853bb9`
(branch `t3/g1-r10-grounding-source-correction`, HEAD/base `a1d7592e…`), 4 modified
paths + `GROUNDING-G1-R10-RESULT.md`. This is a static pre-review for the operator
before re-dispatching the R9-blocked independent Sol review. Nothing here is an
executed result: **NOT_RUN / SOURCE_TRACED**, as the R9 review itself was.

Custody checks run read-only: R10 byte identities match `GROUNDING-G1-R10-RESULT.md:90-93`
exactly (tailor.js 182026 B `bae55900…`, refine.js 84653 B `fe37313a…`,
tailor.test.mjs 120358 B `018443fa…`, refine.test.mjs 81074 B `f01215dc…`); the R9
worktree `t3-76750b9f` still holds the R9-reviewed bytes (`REVIEW.md:19-23`) and is an
exact prefix of `refine.test.mjs` (77119 B) and of the R8 bytes in `tailor.test.mjs`
(90524 B, `t3-ff301e75` = `7ca37463…`); the R10 report body hash matches
`bd565e5e…` (`GROUNDING-G1-R10-RESULT.md:1`). Definition counts 69 + 65 = 134 (`^test(`
in the two test files), and no R9 test name is missing.

## 1. Verdict

**Not worth dispatching as-is.** R10 is a substantive, mostly well-aimed correction —
every R9 finding has a source repair and an authored test — but the candidate cannot
pass its own retained suite, and the failures are derivable from source without
execution. At least three retained-row assertions must fail: (a) the frozen R8 row at
`tailor.test.mjs:1705` still asserts `BOTH` acceptance at `:1721-1722` for a pair that
R10's own control (`tailor.test.mjs:2629-2646`) and refine test (`refine.test.mjs:1762-1786`)
assert `groundChanges` refuses; (b) and (c) the retained R9 assertions
`refine.test.mjs:1435` and `:1645` pin `/figure 100000000 was dropped/`, while R10's new
lexical-unit tail (`refine.js:387-401`) now makes the reason
`figure 100000000 requests was dropped` (`refine.js:410,862`). The self-report records
the 1705 conflict (`GROUNDING-G1-R10-RESULT.md:284-298`) but never says the suite will
be red, and does not mention the dropped-figure text change at all. Recommend a narrow
operator-authorised R10.1 — either change/skip the frozen row with a recorded
adjudication, and keep `raw` digits-only or re-baseline the two R9 assertions — before
the Sol dispatch is retried. Everything else in R10 is worth the review.

## 2. Findings F1–F9

| # | R9 finding | R10 change / test (file:line, snippet) | Verdict |
|---|---|---|---|
| F1 | complete-object ownership reduces to head or one-token exemption | `tailor.js:3914` `function predicateLike(token)`; `:3935` `function objectHeadModifiers(rawTokens, scope, head)`; `:4077` `function objectPhraseExtends(candidatePhrase, targetRawTokens, targetHead, sourceVerb, scopeEnd)` — `:4096-4109` scans the whole extension (`if (predicateLike(next) && next === targetHead) return false; return true;`); `:4248` `ownershipPromotion` adds the same-head modifier run check `:4291-4298` (`if (extra.length) continue;`). Test `G1-R10: ownership binds the complete governed object, not its head` `tailor.test.mjs:2381-2422` (5 refusals + 4 positives, BOTH). | ADDRESSED (source-traced): the one-token early return is gone and the same-head anchor now compares the modifier run; residual grammar ambiguities are the writer's own `:325-346`. |
| F2 | person/title and application licences pooled beyond claimed occurrence | `tailor.js:758` `function thirdPartyActorBefore`; `:724` `THIRD_PARTY_PERSON_NOUNS`; `worked-as` guarded at `:847` (`if (thirdPartyActorBefore(source, match.index)) continue;`); bare-title leading nouns guarded at `:867`; occurrence-local licence `:876`/`:900` with `advertisedTitleReferenceSpans` and `:4616-4622` (`if (isAdvertisedTitleReferenceAt(target, orderedMatches[index].index, word, advertised)) continue;`); venue carve-out `:521-559`. Test `G1-R10: titles and employment need the candidate's own actor and occurrence` `tailor.test.mjs:2424-2476` (4 refusals + 5 positives, BOTH). | ADDRESSED (source-traced) for the R9 rows; the report's own residual (`:330-332`) admits a named third party in a separate clause is still undetected. |
| F3 | award owner/kind and complete subject unbound | `tailor.js:1706` `function awardKind`; `:1720` `function qualificationSubjects` now returns records `{subject, tokens, award, owner, index}` (`:1724` `const owner = thirdPartyActorBefore(source, index) ? "other" : "candidate";`); subject check `:4514-4548` (`new qualification subject "…" is not in the original`). Test `G1-R10: a credential binds owner, award kind and complete subject` `tailor.test.mjs:2478-2523` (3 refusals + 6 positives, BOTH). | ADDRESSED (source-traced): owner and award kind travel with the subject record and the head-deleting sub-run is refused. |
| F4 | unlisted units collapse and same-unit values reassociate | `refine.js:280` `function figureLexicalUnit(word)`, `:293` `figureUnitIdentity`, `:387-401` tail-word block, `:410` `raw: collapse(source.slice(match.index, end))`; `tailor.js:1039` `function lexicalUnitToken`, `:1150` `unitTailAfter`; association `tailor.js:1280/1318`, `refine.js:556/603` (`measureClaimTokens`, `measureReassociation`), `refine.js:611` intersection. Tests `tailor.test.mjs:2525-2554` and `refine.test.mjs:1736-1760`. | PARTIAL: unlisted units and clause-separated swaps are covered, but association is now *any shared clause noun* (`refine.js:558` clause marks are only `[".",";",":","\n"]`), so two measures in one clause still trade values — the writer admits this at `GROUNDING-G1-R10-RESULT.md:336-338`; it is also wider than R9's nearest-subject rule, and the `raw` change breaks retained rows (verdict section, §3.2). |
| F5 | ordinary modifier between count and requests restores phone amnesty | `refine.js:686` `function contactSpans` — `:703-720` scans a bounded 4-word same-clause run (`for (const word of followingWords.slice(0, 4)) { … if (MEASURED_COUNT_NOUNS.has(word)) { measuredObject = true; break; }`). Test `G1-R10: a metric drop survives an ordinary modifier and a contact label` `refine.test.mjs:1703-1734`. | ADDRESSED (source-traced) for the R9 row; the window is bounded at 4 words and stops only on `ed/ing` verb forms (`:718`), so a longer modifier still restores amnesty (writer's `:339-340`). |
| F6 | longer ordinary complement exempts explicit title | `tailor.js:821` `titleClaimPhrases`; the eight-word cap is removed with the rationale at `:856-859` and the bounded windows kept at `:860-870` (`if (leadingVerb(fragment)) continue;` … `if (leading.some((word) => THIRD_PARTY_PERSON_NOUNS.has(word))) continue;`). Test `G1-R10: a title inside a longer ordinary complement is still a title` `tailor.test.mjs:2556-2577`. | ADDRESSED (source-traced); uncapped capture can still read a noun-led compound as a title (writer's `:341-342`). |
| F7 | month-to-month endpoint association lost | `tailor.js:1412` `DATE_ENDPOINT` now accepts month+year on either side; `:1414-1417` `DATE_RANGE_RE`; `normalizeRange` `:1419-1431`. Test `G1-R10: a two-month range is one complete endpoint pair` `tailor.test.mjs:2579-2599` (recombined refused, full/dotted/abbreviated/to-present/modal-`May` accepted). | ADDRESSED (source-traced): both endpoints are complete date identities and the range is compared as one normalised pair. |
| F8 | employer-source guard rejects faithful prose | `tailor.js:505-513` `isEmployerAtClaim` now `/i`; `:614-623` `trimEmployerComplement`; `:424-436` source-side copular own-role (`const copularRole = new RegExp(...)` `:429-432`); `:597-605` ordinary-complement test extended with connectives. Tests `G1-R10: source and target employer frames agree on casing and prose` `tailor.test.mjs:2601-2627`. | ADDRESSED (source-traced) — the case-aware frame and trimming fix the asymmetry; note the new venue class can over-block a genuine "at <Company>" after an event noun ("led the workshop team at Northwind"). |
| F9 | retained BOTH positive drops independent count (P2) | Operator adjudication applied: frozen row `tailor.test.mjs:1705` untouched (R8 byte-prefix verified), appended R9 row replaced at `:2067` (`["a shared no-drop numbered claim", "Led 12 engineers.", "Led a team of 12 engineers."]`), new tailor-only control `:2629-2646` asserts `assertGrounded` accepts and `groundChanges` refuses the same drop pair; refine mirror `refine.test.mjs:1762-1786`. | NOT ADDRESSED in executable terms: the untouched frozen row is still asserted with `BOTH` at `:1721-1722`, so it contradicts the new control and the refine test — a guaranteed failing assertion (see §1, §4). Recording the conflict is not a disposition. |

## 3. What the R10 self-report does not mention

1. **The frozen-row conflict is disclosed, its execution consequence is not.** `GROUNDING-G1-R10-RESULT.md:284-298` says the 1705 row "expected BOTH accept" while `groundChanges` "correctly refuses"; it never states that `tailor.test.mjs:1721-1722` must therefore fail, and proposes no skip/expected-failure/authorisation. Retained history that fails is still a red suite.
2. **Reason-text regression from the F4 `raw` change.** `refine.js:410` now builds `raw` from `match.index` to the extended `end`, so "Processed 100000000 requests." yields `figure 100000000 requests was dropped` (`refine.js:862`). Retained R9 assertions at `refine.test.mjs:1435` and `:1645` require `/figure 100000000 was dropped/` and must fail. Not mentioned anywhere; the report's §5 retention claim (`:118-122`) says all R9 definitions remain without noting changed expectations.
3. **New duplicated logic across the two modules.** `figureLexicalUnit` (`refine.js:280-291`, skips `STOPWORDS`/`MEASURE_SKIP_WORDS`) and `lexicalUnitToken` (`tailor.js:1039-1049`, skips `CLAIM_*`/`COMMON_VERBS`/`TITLE_WORDS`/`MONTH`) are two implementations of one concept with divergent stop lists; `measureClaimTokens`/`measureReassociation` exist twice (`refine.js:556/603`, `tailor.js:1280/1318`) and R10 edited both. No test pins their agreement; only the `BOTH` rows would catch a divergence, invisibly.
4. **Widened allowances are not labelled.** (a) `measureClaimTokens` set-intersection (`refine.js:611`) is wider than R9's exact-subject comparison; (b) `objectPhraseExtends` adds the exemption `if (predicateLike(next) && next === targetHead) return false;` (`tailor.js:4108`) — a new pass relative to R9's blanket content-token extension; (c) the new source-side copular path (`tailor.js:424-436`) adds employer evidence with the lowercase branch `[a-z][a-z0-9'’&-]{2,}` and, unlike the target side at `tailor.js:638` (`if (isOrdinaryEmployerComplement(complement)) return;`), the source `add` at `:394-397` has no ordinary-complement filter; (d) `figureUnitIdentity` applied to spelled numbers (`refine.js:424`) widens the identity vocabulary. Each is source-anchored, but the report claims no widening and lists none.
5. **Which new tests would fail on R9 is never stated.** Static reading: `refine.test.mjs:1762-1786` would pass on R9 too (R9 refine already refuses drops — `t3-76750b9f/server/lib/cv/refine.js:796`), and the "covered multiplier swap" row (`refine.test.mjs:1736`) is likely already refused by the R9 conflicting-subject branch — i.e. some of the 11 new tests are controls, not regression tests. The other rows are plausible but UNKNOWN without execution.
6. **No syntax parse was run anywhere** (`GROUNDING-G1-R10-RESULT.md:312-320` says NOT_RUN includes "syntax parse"), so even parseability is unverified; both test files still end without a final newline (diff `\ No newline at end of file`), as they did at R8/R9. Minor: the report's line counts differ by one from a tool count for the two source files (5721/2333 vs 5720/2332), consistent with final-newline counting; byte identities match.

## 4. Execution risk and the first three tests

134 authored definitions (69 tailor + 65 refine) with **zero executions** in this round: no import, parse, oracle, fixture, gate, native or browser phase (`GROUNDING-G1-R10-RESULT.md:312-320`). Confidence in the *behavioural* claims is therefore zero-by-construction; confidence that the suite is red is high, because three retained-row failures are derivable from the bytes above (rows 1705/1721-1722, 1435, 1645). A full-suite run would also have to prove ~120 untouched R8/R9 rows still hold under materially changed shared code (figures, dates, titles, measures, employers) — none of that can be inferred.

Run these first, before a full suite (exact names, in the R10 test files):

1. `G1-R8: ownership binds the governing action to the same object` (`tailor.test.mjs:1662`) — contains the frozen `BOTH` row at `:1705` and proves/refutes the F9 contradiction class.
2. `G1-R8: a long accomplishment count is a metric, not a phone` (`refine.test.mjs:1431`) — proves/refutes the `raw`-text regression at `:1435`.
3. `G1-R9: a contact label cannot absorb the next accomplishment metric` (`refine.test.mjs:1640`) — second, independent instance of the same `raw` regression at `:1645`.

## 5. What the re-dispatched Sol reviewer should check

1. **Adjudication first:** require an operator record that either authorises changing `tailor.test.mjs:1705`/`:1721-1722` (or marking it expected-fail/skip) or explains why a red suite is acceptable; without it, stop at F9 and do not review the rest as integrable.
2. **Dropped-figure text:** trace `refine.js:387-412` + `:862` against `refine.test.mjs:1432-1437` and `:1642-1647`; require either digits-only `raw` or an authorised re-baseline. Do not accept "retained rows are history" as a pass.
3. **F4 residual, executed by the operator:** one clause with two measures ("Latency was 3 ms and processing time was 5 ms." → swapped values) — if accepted, F4 is PARTIAL as this review states; check both `assertGrounded` and `groundChanges`.
4. **Third-party employer:** "My colleague worked at Initech." → "I worked at Initech." — source-side `employerNamesIn.add` (`tailor.js:394-397`) has no actor filter; record whether R10 still accepts it (F2/F8 boundary).
5. **Venue over-block:** "Led the workshop team at Northwind." → "Worked at Northwind." — `isVenueAtClaim` (`tailor.js:555-559`) looks at any of the last 5 words; record a false-refusal if present.
6. **Duplicate-helper divergence:** a figure followed by a `COMMON_VERBS`/`TITLE_WORDS` word ("3 design", "3 support") — compare `lexicalUnitToken` (`tailor.js:1039`) and `figureLexicalUnit` (`refine.js:280`); a BOTH row would flip on divergence.
7. **New-test pattern sanity:** every refusal pattern must match an existing message (`tailor.js:4440,4548,4566,4616,4635`; `refine.js:615,862`), or the test fails on correct code.
8. **Custody/identity:** re-verify the four raw hashes, the R8 prefix (first 90524 B), the R9 prefix of `refine.test.mjs` (first 77119 B) and `reportBodySha256`; require the executor to report exact pass/fail/skip counts for all three gates (`node --test tests/`, `node --test server/lib server/provider`, `node scripts/check.js`), not a summary.
9. **Report arithmetic:** §5 claims "all 123 R9 definitions remain" — true by name; verify the one replaced row is the only expectation change, since this pre-review found two more changed expectations implied by behaviour (`:1435`, `:1645`).

## 6. Limits of this pre-review

Static only. No Node, import, test, build, server, browser or model phase was run, and nothing was written outside this file. Findings marked SOURCE_TRACED are inferences from the exact bytes at the cited lines; the three predicted failures are strong enough to block dispatch, but only an admitted executor can confirm or refute counts, timing or any runtime-only effect.
