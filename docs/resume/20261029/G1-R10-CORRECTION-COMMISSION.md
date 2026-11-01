# G1 R10 correction commission — after independent R9 REQUEST_CHANGES

## Basis

Independent Sol 6.1/xhigh/Standard SOURCE review of stopped R9 returned
**REQUEST_CHANGES** with seven P1 and two P2 findings (F1–F9). Review:
`docs/t3/receipts/20261029-resume/g1-r9/review/REVIEW.md`
29790 bytes, SHA256 `54ce5586f80ad59acb032947e94c7499c9ffe3d4b3e6ac08e180c35f5aceed43`.
Identities: `review/REVIEW-IDENTITIES.json`. Every finding is
`SOURCE_TRACED / NOT_RUN`, not observed failure; no expectation was edited by the
reviewer.

Operator re-verified the stopped R9 candidate before this commission: worktree
`C:/Users/johan/.t3/worktrees/applywright/t3-76750b9f`, branch
`t3/g1-r9-source-correction`, HEAD/base
`a1d7592e65ba291c0bf89d8a6552ab4090073037`, exactly four unstaged modified
source/test paths plus untracked `GROUNDING-G1-RESULT.md`, nothing staged, and
the five raw SHA256/length identities match `REAP-VERIFIED.json` exactly.

R9 is **not accepted**. It is the input to R10. R10 is one more SOURCE
correction, not a runtime, integration or acceptance step.

## One DSH writer, new assigned native worktree

Official DSH Flash / high / full access, fresh native capability and lifetime
admission, Estate defaults/context unchanged. No Terra, estate-cua, Claude API,
second provider or hidden fallback. No new coordinator/goal/timer.

New native-assigned worktree from current main HEAD
`a1d7592e65ba291c0bf89d8a6552ab4090073037`. Verify actual cwd/root/HEAD/branch
and initial clean scope before any write; mismatch or collision means HOLD and
report. Do not create branches/worktrees or run checkout commands yourself.

Own only, in the new worktree:

- `server/lib/cv/tailor.js`
- `server/lib/cv/refine.js`
- `server/lib/cv/tailor.test.mjs`
- `server/lib/cv/refine.test.mjs`
- a fresh root `GROUNDING-G1-R10-RESULT.md`

Nothing else. No main or other-worktree writes, no docs/ledger writes, no Git
writes/stage/commit/branch/merge/push/reset/prune, no installs, no
credentials/env/auth/token/config/profile/store intake, no settings/context/
permissions/guard/slot/default/process/service/PM2/WSL/scheduler changes.

SOURCE ONLY: author code and tests. Execute ZERO Node/import/syntax/test/oracle/
probe/build/native/PowerShell-parser/Add-Type/browser/GUI/server/product/model/
API/network phases. Read, hash, static Git and diff only. No self-acceptance.

## Input copy and custody

Copy exactly the four source/test files from the stopped R9 candidate
`C:/Users/johan/.t3/worktrees/applywright/t3-76750b9f` into the matching paths of
the new worktree. Do not copy `GROUNDING-G1-RESULT.md`, directories, data,
environment/config or any other attempt. Verify these five identities before
and after the copy, and fail closed on any mismatch:

| Path | Bytes | Raw SHA256 |
|---|---:|---|
| server/lib/cv/tailor.js | 166641 | f9a92df697f4dbcf2d5026b77a63ba6751082ecc58bbd1d024c9b5ab5d56dbde |
| server/lib/cv/refine.js | 82001 | 869702614ea8c15875c07d3776b4e06f1369238c1637ed75e42e5dcdabc7b470 |
| server/lib/cv/tailor.test.mjs | 105741 | 5e7caf86a5814ef94ab6f2047478a74151d17ffce8756cf22fc87223602dd2e8 |
| server/lib/cv/refine.test.mjs | 77119 | 81d65ca4b4eacfec72b7597eaea84e9e0c7ddf0d58eedaa38e98761e09e907c4 |
| GROUNDING-G1-RESULT.md (read only) | 25254 | fe1654b2e4aefb1a7a0b00b635ff52e7e1178d346127c7220facf91e9e649931 |

Frozen R7/R8/R9 candidates, their patches, reviews, identities and the immutable
211-comparison corpus stay untouched. The new report is new; the old report is
never edited or copied forward.

## Required corrections — structural, not example-specific

Read the full review for exact strings, options and line references. The
summaries below bind the required behaviour; do not patch only the literal
example.

**F1 (P1) — complete owned object.** `objectPhraseExtends` returns false as soon
as the token after the carried phrase is a possible verb/qualifier/deverbal noun,
and the same-head path anchors a partial object. "Personally owned design" must
not license "design review meetings"; "website design" must not license "bridge
design"; "improved latency" must not license "delivered latency improvement
workshops". Bind the complete governed object and its figures before strength.
Preserve full-object positives, the platform-design at-scale adjunct removal,
"Helped with reviews" → "Supported reviews", the 40% improvement rewrite, R6
reverse-modifier refusals and R7 deploy/building positives. No noun blacklist and
no blanket nominalisation refusal.

**F2 (P1) — person/title/occurrence licence.** A colleague's senior title, a
workshop venue, and a separate application sentence must not license a held title
or employment. Bind actor, role and occurrence: "Worked as an engineer" plus
"colleague worked as a senior engineer" must not accept "Worked as a senior
engineer"; "led a workshop at Azure" must not accept "Worked at Azure"; an
advertised application reference alone stays allowed. Preserve genuine own senior
roles/headers, "Worked at Azure" → "Worked at azure", "Built services with Azure"
→ "Built Azure-based services", and the advertised application sentence alone.

**F3 (P1) — award owner, award kind and complete subject.** Qualification
subjects are strings with no owner or award kind; degree from one span and
medicine from another person's certificate currently combine. The shorter
contiguous sub-run must not delete the subject head and assert a different
discipline ("degree in nursing management" must not become "degree in nursing").
Match owner + award + complete subject together. Preserve own degree subject,
long/acronym subjects, Has/Holds with engineering in the colleague source,
honours/descriptors, legitimate complete omission to "Has a degree", conjoined
independently-named subjects, and the high-degree idiom. Keep the work-only
subject refusal and its refine returned-text checks at
`refine.test.mjs:1596-1637`.

**F4 (P1) — measure unit identity and claim association.** Unknown lexical units
must not collapse to a bare numeric key: 3 kilograms must not license 3 tonnes.
Reassociation currently only rejects same-value/different-unit, so 3 ms/5 ms
values may move between latency and processing time; percent and currency are
excluded from reassociation. Bind value + unit/scale + measured complete object/
claim. Preserve recognized GB/gigabytes aliases, times/x, three/3 hours,
hyphenated day counts, GBP/£40k/£40,000, percent equivalents, unchanged
assignments, clause reordering with assignments intact, and the already-covered
GB→TB and 3 ms/3x refusals. Document the bounded unit vocabulary honestly; do not
silently amnesty unknown units.

**F5 (P1) — count versus contact role.** The count-role override inspects only the
immediate next token, so "100 000 000 API requests" is treated as a phone and the
metric drop is exempted. An ordinary modifier between count and object must not
restore contact amnesty, including grouped and leading-zero forms and the
Contact + requests variant. Preserve genuine phone-only omission with a warning,
keep-all-figures, real unlabeled grouped phone omission, Product-engineer/
building and 840/220 drops. Tailor's one-way drop contract stays distinct; no BOTH
parity requirement for metric drops.

**F6 (P1) — title inside a longer ordinary complement.** "Innovation engineer
with experience in web services across multiple teams" is not exempt merely
because the segment exceeds eight words. Capture the bounded own-title phrase
within ordinary complements without blacklisting nouns. Preserve generic
"Engineer with experience in web services across multiple teams", the same
complete source-backed innovation title, and ordinary Use/Work/Delivers/
Collaborates/Experience-building controls.

**F7 (P1) — two-month range endpoint association.** `DATE_RANGE_RE` accepts a
month on the first endpoint but only a year/present on the second, so June 2020 →
September 2021 can be recombined to September 2020 → June 2021 from field-wide
month/year sets. Capture and compare the complete endpoint pair. Preserve the
already-repaired full/dotted/abbreviated and to-present aliases in both
directions and casing, modal May, undotted aliases, unsupported new months and
recognized changed-range refusals.

**F8 (P2) — employer frame symmetry and faithful prose.** The employer-source
guard is case-sensitive and target-only for copular evidence, so "Delivered
services at Northwind" → "Worked at northwind", "I was an engineer at Azure" →
"I was an engineer at azure", and R9's own "Worked as an engineer at Northwind
Traders" → "I was an engineer at Northwind Traders" refuse, while "Worked at
scale with colleagues" invents employer "scale with colleagues". Make source and
target frames symmetric and case-aware without exempting all worked-at clauses.
Preserve genuine employer casing, invented-employer refusals, "Built services" /
"Built services at scale" → "Worked at scale", with-colleagues grammar, and role
headers.

## F9 operator adjudication (explicit, narrow)

The retained R8 row at `tailor.test.mjs:1705` and its R9 repeat at `2059` expect
BOTH accept for "Led 12 engineers across two squads" → "Led a team of 12
engineers", while `groundChanges` correctly refuses the dropped "two". This is a
contract conflict, not another missing-set exception.

Operator decision: keep the deliberate tailor one-way / refine drop-preserving
distinction; do not weaken `groundChanges`.

- Leave the frozen R8-prefix row at `1705` byte-identical as history.
- Replace the appended R9 repeat at `2059` with a genuine no-drop shared
  positive: source "Led 12 engineers." → "Led a team of 12 engineers.".
- Append a documented tailor-only `assertGrounded` control for the
  "across two squads" case, and a refine `groundChanges` refusal for the same
  dropped count, so the one-way behaviour is explicit.
- Record this adjudication and the conflict in the new report and in the test
  comment. No other expectation is to be changed. The prior unsafe-unit
  adjudication (migration 14 services / across 12 teams does not evidence
  leadership of 12 engineers; refusal stays, explicit-engineer positive stays)
  remains binding.

## Retention and reporting

Every one of the 123 R9 definitions in the two complete test files must remain
byte-identical and in order; new definitions are appended. Do not edit, delete or
reorder an existing assertion, helper, title or expectation except the single
appended F9 row expressly adjudicated above. Report exact before/after byte
lengths, raw/canonical-LF SHA256 and Git blobs for the four files and the report,
the scoped diff, definition counts/retention, how each of F1–F9 is covered with
its faithful controls, and every NOT_RUN boundary.

No syntax, unit, comparison, integrated gate, native, browser, model or runtime
result is claimed. Nothing is staged, committed or accepted. A new independent
Sol 6.1/xhigh/Standard exact-byte review and a properly admitted operator
execution remain prerequisites to integration and acceptance.
