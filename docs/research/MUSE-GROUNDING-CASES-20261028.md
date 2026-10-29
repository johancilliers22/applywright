# Muse grounding cases — advisory synthetic corpus (2026-10-28)

Status: **ADVISORY ONLY — NOT AN ORACLE, NOT A FIXTURE, NOT ACCEPTED.**
Author role: research sub-agent (first-pass refutation / synthesis).
Validator required before any adoption: Codex / frontier review.
Nothing in this file asserts a runtime outcome. No source, oracle, test or
implementation was executed, imported or modified to produce these expectations.
All `Before` / `After` / `Context` strings below are ordinary synthetic English
invented for this corpus. They are deliberately **not** copies of the literal
Sol R5 finding strings, the DSH desktop `c7c79ce` / `292` material, or the `6e3`
opener proposal, all of which remain unaccepted history / advisory only.

## Identity and gates (declared before report writes)

- Worktree: `C:\Users\johan\.t3\worktrees\applywright\t3-2fb3f4d3`
- Branch: `t3/muse-grounding-cases`
- Actual HEAD before writes: `3b84986ffd5e334ae53b21ffb7d19b9934f1e7dc`
  (matches the expected preparation base; `git status --porcelain` was empty)
- Base adoption record read: `docs/coordination/DOCS-ONLY-BASE-ADOPTION-20261029.json`
  (parent copy; docs-only descendant, product source blobs unchanged)
- Owned outputs (only these two files may be written by this task):
  [MUSE-GROUNDING-CASES-20261028.md](/C:/Users/johan/.t3/worktrees/applywright/t3-2fb3f4d3/docs/research/MUSE-GROUNDING-CASES-20261028.md)
  and [MUSE-GROUNDING-RESULT.md](/C:/Users/johan/.t3/worktrees/applywright/t3-2fb3f4d3/docs/research/MUSE-GROUNDING-RESULT.md)
- Harness / model: Muse Code harness; requested `muse-wonder-1.0` / max,
  normal context, unchanged. Served identity as reported by the session
  runtime: `muse-wonder-1.0` with max reasoning effort. Requested, served and
  selected are recorded distinctly; no greeting or model probe was run.
- Contributor qualification: operator brief records own-Windows non-secret
  `contributor_mode_enabled=false` checked `00:37:49Z`,
  `disclosureacknowledged=true`, unchanged. This agent made no settings,
  auth, provider, model-variant or contributor-mode change and read no
  secret / `.env` / token material. Native catalogue presence was not treated
  as served-model or auth proof.
- Usage / cost: not exposed to this agent. Recorded as `UNKNOWN` / null.
  Never zero.

## Contract read (grounding scope)

From [SPEC.md](/C:/Users/johan/.t3/worktrees/applywright/t3-2fb3f4d3/docs/SPEC.md):
tailoring may rephrase and re-order using only facts present in the source CV
plus the structured profile; it may not invent an employer, a date, a
qualification or a number. Every rewritten bullet must be traceable to a source
line, and the grounding check rejects anything introducing an unverified
number, employer, title or date.

From [APPLYWRIGHT-GROUNDING-G1-COMMISSION.md](/C:/Users/johan/.t3/worktrees/applywright/t3-2fb3f4d3/docs/t3/APPLYWRIGHT-GROUNDING-G1-COMMISSION.md)
and the stopped independent R5 SOURCE review
(`sol-review.FINDINGS.md`, parent receipts, read-only), the intended full
P1-C claim / provenance scope is:

- ownership and object provenance (governing verb vs object head vs adjunct);
- qualifications and subjects (whole subject is the claim unit);
- job title and seniority;
- dates, counts and currency amounts (identity, not just digits);
- technologies and employers (evidence must be a technology use, not an
  ordinary homograph, adjective, imperative or list neighbour).

R6 diagnostic context noted from the operator brief only (not re-executed
here): 211 independent comparisons passed, 95/98 units with 3 failures
described as a dropped-phone contact rewrite, a false `building` promotion and
an `Additionally … deploy time fell 40%` false `deploy` promotion. R7
(combined `c7` safeguards + R6 repairs) is in progress and not accepted.
These advisory cases therefore include adjunct / object-noun controls for the
`building` / `deploy` shape with fresh wording, without asserting what any
candidate currently does.

## How to read each case

- `Expected` is a **semantic** expectation: what a faithful grounded rewrite
  means in ordinary English, judged from `Before` (+ `Context` where given)
  alone. It is not a prediction of current code behaviour.
- `Basis` separates the two kinds of expectation this brief requires:
  - `UNAMBIGUOUS` — the source text determines the verdict; any correct
    grounding rule must agree.
  - `HEURISTIC-UNCERTAIN` — the verdict itself is `UNCERTAIN` because the
    source text genuinely underdetermines the rewrite, or because a
    case-folding / tokenising heuristic cannot recover a distinction that
    the semantics needs. These must not be hardened into fixtures without
    frontier adjudication of the extra context that would decide them.
- Both exported predicates in the product (`assertGrounded` for tailoring,
  `groundChanges` for refine) are expected to share each verdict, with one
  standing exception carried from the prior oracles and restated in the
  notes: dropping contact data (e.g. a phone number) is a warning-level
  contact event in `groundChanges`, not an accomplishment-claim rejection.
  No case below turns on silently dropping contact data.
- `Options: {}` unless a `Context:` line is shown, in which case the context
  string is the structured-profile / surrounding-text evidence a caller
  would supply. Context is evidence, not a licence: it can only support a
  claim whose object it actually names.

## Part 1 — Unambiguous semantic expectations (G-01 … G-23)

### Employer / title homographs: ordinary word vs invented entity

**G-01 — REJECT — ordinary place noun promoted to employer.**
Before: `Repaired laptops for staff on site.`
After: `Repaired laptops at Harbour.`
Basis: UNAMBIGUOUS. The governing verb, object and recipient are unchanged;
the only new content is a capitalised locative in the employer / workplace
slot. `Harbour` appears nowhere in the source, as place or employer. A
faithful rewrite cannot manufacture the workplace. Capitalisation and the
preposition `at` do not create evidence.

**G-02 — ACCEPT — faithful verb synonym, no new entity (pair to G-01).**
Before: `Repaired laptops for staff on site.`
After: `Fixed laptops for staff on site.`
Basis: UNAMBIGUOUS. `Fixed` is an ordinary synonym of the source governing
verb; object (`laptops`), beneficiary (`staff`) and adjunct (`on site`) are
preserved token-for-token. This is the control that forbids a reject-all or
capital / verb-blacklist repair: same structure as G-01, no invented slot.

**G-03 — REJECT — ordinary noun added as title specialism.**
Before: `Worked as an analyst.`
After: `Worked as a Bridge analyst.`
Basis: UNAMBIGUOUS. `Bridge` (ordinary noun / verb) is inserted as a
pre-nominal title modifier. The source title is the bare role; the rewrite
claims a specialism / team / employer qualifier that has no source token in
any role. Title claim units include their modifiers: adding one is a new
title fact, symmetric to adding a seniority token (G-14).

### Ownership: governing verb, object head, adjunct and figure binding

**G-04 — REJECT — ownership moves to a different object across clauses.**
Before: `Helped with onboarding.\nPersonally owned platform migration.`
After: `Personally owned platform onboarding.`
Basis: UNAMBIGUOUS. The support clause governs `onboarding`; the ownership
clause governs `migration`. The rewrite attaches the ownership verb to the
support clause's object. Shared modifier `platform` is not the object head
and cannot transfer provenance. This is the clause-association class, stated
with fresh objects so it cannot be satisfied by memorising earlier nouns.

**G-05 — REJECT — context names a different object and cannot license this one.**
Before: `Helped with testing.`
After: `Personally owned testing.`
Context: `Personally owned migration.`
Basis: UNAMBIGUOUS. Context is provenance for the object it names
(`migration`). It supplies no ownership evidence for `testing`. Accepting
here would make context a document-global ownership licence, which the
clause-local contract forbids. Contrast G-06, where the before-text itself
carries the ownership.

**G-06 — ACCEPT — same-object ownership faithfully restated (pair to G-04/G-05).**
Before: `Personally owned platform onboarding at scale.`
After: `I personally owned platform onboarding.`
Basis: UNAMBIGUOUS. Governing ownership verb, object head (`onboarding`)
and modifier (`platform`) all come from the same source clause. Dropping the
trailing adjunct `at scale` removes colour, not a claim. An explicit subject
`I` is voice, not a new fact.

**G-07 — REJECT — duration figure migrates with the wrong object.**
Before: `Helped with onboarding.\nDelivered platform migration in 8 weeks.`
After: `Delivered platform onboarding in 8 weeks.`
Basis: UNAMBIGUOUS. The figure `8 weeks` is an adjunct of the `migration`
clause: it binds to that clause's verb + object, not to the document. The
rewrite keeps the digits identical, so a digit-only check passes it, but the
claim (onboarding took 8 weeks) is new. Figure identity without figure
association is insufficient.

**G-08 — ACCEPT — figure stays bound to its own object (pair to G-07).**
Before: `Delivered platform onboarding in 8 weeks.`
After: `Completed platform onboarding in 8 weeks.`
Basis: UNAMBIGUOUS. Verb synonym at the same ownership level (`Delivered` →
`Completed`), same object head, same duration adjunct. This control forbids
repairs that reject any sentence containing a figure or a verb change.

**G-09 — ACCEPT — sentence adjunct + object noun are not an ownership promotion.**
Before: `Reduced deploy time by 40% by rebuilding the pipeline.`
After: `Additionally, deploy time fell by 40% after the pipeline rebuild.`
Basis: UNAMBIGUOUS (semantic). `Additionally` is a discourse adjunct in
opener position; `deploy` is the head of the object noun phrase
(`deploy time`), not a governing verb; `fell by 40%` preserves the source
figure, direction and cause adjunct. Classifying either opener word as an
ownership / leadership verb would be a part-of-speech error, not a grounding
judgement. Included because the R6 failure description names this shape;
wording here is fresh and no runtime behaviour is asserted.

**G-10 — ACCEPT — `building` as object modifier is not a governing verb.**
Before: `Handled building access requests.`
After: `Handled building access requests promptly.`
Basis: UNAMBIGUOUS (semantic). `building` is a noun modifier inside the
object (`building access requests`); the governing verb is `Handled` in
both. Adding a manner adverb (`promptly`) adds no employer, figure, title
or ownership fact. A heuristic that keys on the substring / lemma `build`
without checking government will false-positive here; the semantic
expectation is nevertheless accept.

**G-11 — REJECT — adverb before a gerund cannot hide an ownership promotion.**
Before: `Helped with rota cover.`
After: `Experience in quietly leading rota cover.`
Basis: UNAMBIGUOUS. The wrapper (`Experience in …`) contains the governing
gerund `leading`; the adverb `quietly` sits between preposition and gerund
and fills no noun slot. Source level is support (`Helped with`); target
level is leadership (`leading`). Adverb insertion must not reclassify the
gerund as a noun or the wrapper as neutral experience.

**G-12 — ACCEPT — evidenced adverb + gerund supports the finite verb (pair to G-11).**
Before: `Experience in quietly leading rota cover.`
After: `Led rota cover.`
Basis: UNAMBIGUOUS. The same adverb + gerund structure as G-11, but here it
is the **source** evidence. A repair for G-11 that simply rejects every
`Experience in <adverb> <gerund>` shape would also destroy this grounded
rewrite. The pair pins the direction of the rule: classify the governing
gerund wherever it governs, in source and target alike.

### Qualifications, titles, dates, counts, currency

**G-13 — REJECT — shared head noun cannot license a swapped subject modifier.**
Before: `Holds a degree in mechanical engineering.`
After: `Holds a degree in electrical engineering.`
Basis: UNAMBIGUOUS. The qualification subject is the whole phrase
`mechanical engineering`. Sharing the head `engineering` is exactly the
overlap that must not count as provenance. Symmetric to G-04: modifier
overlap is not object / subject identity.

**G-14 — REJECT — acronym subject addition is a new qualification fact.**
Before: `Holds a degree in engineering.`
After: `Holds a degree in AI engineering.`
Basis: UNAMBIGUOUS (semantic). `AI` here is a subject modifier (artificial
intelligence), parallel to G-13's modifier swap. It must not be discarded
as a pronoun, stopword or grammar token, and its all-caps form must not be
discarded as noise either. The heuristic risk (case-folding conflating
acronyms with function words, the class the stopped R5 review raised for a
different acronym) is real, but it makes implementations fragile, not the
semantics uncertain: the source subject is bare `engineering`.

**G-15 — ACCEPT — same whole subject, auxiliary-only change (pair to G-13/G-14).**
Before: `Holds a degree in mechanical engineering.`
After: `Has a degree in mechanical engineering.`
Basis: UNAMBIGUOUS. Only the possession auxiliary changes (`Holds` to
`Has`); the complete subject, including its modifier, is preserved. Forbids
repairs that reject any degree sentence or that require token-identical
auxiliaries.

**G-16 — REJECT — seniority token added to an unchanged title.**
Before: `Worked as a support analyst.`
After: `Worked as a senior support analyst.`
Basis: UNAMBIGUOUS. `senior` is a new seniority fact attached to the title
claim unit. No source token carries seniority in any clause. (The faithful
counterpart — same title with only the framing verb changed, e.g.
`Employed as a support analyst.` — is ACCEPT by the same unit rule as
G-15; it is stated here rather than numbered, to keep the corpus inside
its size bound without losing the positive control.)

**G-17 — REJECT — calendar month invented from a season.**
Before: `Covered shifts through spring.`
After: `Covered shifts through June.`
Basis: UNAMBIGUOUS. `June` is a new date claim. A season is not evidence
for any month inside it. Capitalisation of the month must not exempt it
as a name, and the modal / season reading must not swallow the date
reading once the word sits in a temporal `through …` slot.

**G-18 — ACCEPT — spelled-out / digit count equivalence (pair class to G-17).**
Before: `Handled one escalation.`
After: `Handled 1 escalation.`
Basis: UNAMBIGUOUS. `one` and `1` are the same count of the same object;
singular morphology already agrees. Equivalence of number words and digits
(including hyphenated durations such as `one-day` / `1-day`) is grounded
rewriting, not a new figure. The reverse invention — adding `one` where
the source has a bare plural, e.g. `Handled escalations.` to
`Handled one escalation.` — is REJECT by G-17's rule: a count appears
where none existed.

**G-19 — REJECT — same digits, different currency identity.**
Before: `Saved £9,500 a year.`
After: `Saved $9,500 a year.`
Basis: UNAMBIGUOUS. Currency is part of the figure's identity. Digit
preservation does not preserve the claim when the currency unit changes.
Symbol, code and spelled forms of the *same* currency are equivalent;
different currencies at the same numeral are not.

**G-20 — ACCEPT — currency form equivalence, same identity (pair to G-19).**
Before: `Saved £9,500 a year.`
After: `Saved GBP 9,500 annually.`
Basis: UNAMBIGUOUS. Symbol to ISO code for the same currency, same amount
(`9,500`, including its `9.5k`-style shortened / expanded variants), and
`a year` to `annually` is adjunct paraphrase. This control forbids repairs
that reject any currency-token change whatsoever.

### Technologies: homograph, adjective and imperative boundaries

**G-21 — REJECT — ordinary adjective cannot become a language claim.**
Before: `Wrote swift import scripts.`
After: `Wrote Swift-based import scripts.`
Basis: UNAMBIGUOUS (semantic). Lowercase `swift` in the source is the
ordinary adjective (fast). The rewrite capitalises it into the language
name and adds the `-based` technology frame. Capitalisation applied by
the rewrite is not source evidence, and adjectival use is not technology
use. Any case-insensitive technology match must still require a
technology *role* in the source.

**G-22 — ACCEPT — list evidence survives case and terminal punctuation.**
Before: `Built import scripts.`
After: `Built Go-based import scripts.`
Context: `Skills: Go and rust.`
Basis: UNAMBIGUOUS. The context is a two-item technology list. The second
item is lowercase and carries the sentence's terminal period; neither
fact removes it from the list, and the first item is thereby evidenced
as a language, not the ordinary verb. Punctuation stripping must apply
to the list item before classification, without stripping internal
technology punctuation elsewhere.

**G-23 — REJECT — imperative neighbours are not a language list (pair to G-22).**
Before: `Built import scripts.`
After: `Built Go-based import scripts.`
Context: `Go and ship the import scripts.`
Basis: UNAMBIGUOUS. Here `Go` is followed by coordinated imperatives
(`ship …`): it reads as the ordinary verb / instruction opener, not as a
list item naming a language. A conjunction alone does not create list
evidence; the neighbouring items must themselves classify as technology
names once punctuation is stripped. G-22 and G-23 differ only in the
neighbours, which is the point: the boundary is the neighbours' category,
not the presence of `and`.

Count for Part 1: 23 numbered expectations (G-01 … G-23), of which 13 are
REJECT and 10 are ACCEPT. Every REJECT is flanked by at least one ACCEPT
exercising the same mechanism, per the commission's grounded-positives
requirement.

## Part 2 — Uncertain heuristics (U-01 … U-03): do not harden into fixtures

These three are **expected UNCERTAIN**. They are included so that a
validator can see where this author is *not* claiming a semantic verdict.
Adopting any of them as a pass / fail fixture without extra deciding
context would encode a guess.

**U-01 — UNCERTAIN — beneficiary elaboration or invention?**
Before: `Supported the Atlas migration.`
After: `Supported the Atlas migration for the finance team.`
Basis: HEURISTIC-UNCERTAIN. If `Atlas` work was in fact for the finance
team, the adjunct is faithful elaboration of an implicit beneficiary; if
not, it invents the beneficiary. The before-text underdetermines which.
`Atlas` itself is preserved in both, so this is not an employer-invention
case. Deciding context would be a source line naming (or excluding) the
beneficiary. Until then, neither ACCEPT nor REJECT is semantically
forced, and a checker that guesses either way should say so.

**U-02 — UNCERTAIN — category adjunct: faithful label or new specialism?**
Before: `Led workshops for new starters.`
After: `Led training workshops for new starters.`
Basis: HEURISTIC-UNCERTAIN. `training` may merely name the category the
source workshops already belonged to (workshops for new starters are
ordinarily training), or it may narrow the claim to a training
specialism the source never stated. Ordinary-English adjunct insertion
of this kind sits on the elaboration / invention boundary. Contrast
G-03, where the inserted modifier attaches to a *title* claim unit and
is therefore unambiguously a new fact: role titles are closed claims,
activity adjuncts are not always.

**U-03 — UNCERTAIN — place shortening or employer invention?**
Before: `Worked at the harbour office.`
After: `Worked at Harbour.`
Basis: HEURISTIC-UNCERTAIN. Unlike G-01, the source does mention a
harbour — as a place (`the harbour office`). Shortening a place
reference and naming an employer spelled the same way produce identical
target strings. Capitalisation in the target cannot disambiguate,
because the rewrite itself supplies the capital. A provenance record
(was there an employer entity in the structured profile?) decides this;
the two sentences alone do not. Any implementation verdict here is a
heuristic default and should be reported as such, not as grounding.

## Refutation notes — what would falsify or refine this corpus

1. **Governing-verb test.** G-09 / G-10 claim that adjunct openers and
   object-noun modifiers must never be classified as governing verbs.
   Falsifier: a natural CV sentence where `Additionally, …` or a
   `building …` object genuinely carries an ownership promotion would
   force a narrower statement. None was found in the read oracles.
2. **Object-head test.** G-04 / G-05 / G-13 claim modifier overlap never
   transfers provenance. Falsifier: an idiom where the modifier *is* the
   claim (e.g. a trademarked modifier naming the product) would need an
   explicit idiom carve-out, not a general overlap score.
3. **Figure-association test.** G-07 claims figures bind clause-locally.
   Falsifier: headline / summary restatements that legitimately carry a
   figure across clauses would show the binding is discourse-level in
   that genre; the corpus scope is single-bullet rewriting, where the
   clause-local reading is the safe one.
4. **Homograph test.** G-21 / G-22 / G-23 claim technology evidence needs
   a technology role (list membership with technology-classified
   neighbours, or a `-based` / tool frame in the source). Falsifier: a
   common CV idiom using a bare technology name verbally (e.g. `We Go
   for payments.`) would need handling as evidence, not as a verb.
5. **Residual invention risk.** Even a checker passing all 23 Part 1
   expectations cannot prove the absence of arbitrary factual invention
   (novel employer names with no homograph hook, plausible-but-false
   dates, swapped object heads with high token overlap). Heuristics bound
   known claim classes; they are not proof. This corpus does not change
   that limit and must not be cited as whole-mission certification.
6. **Contact-data boundary.** No case here drops contact data. The
   standing oracle expectation (dropped phone = warning in
   `groundChanges`, acceptance preserved) is a contact-handling rule,
   deliberately distinct from accomplishment claims; conflating the two
   is the R6 failure shape this corpus avoids rather than re-tests.

## Source inputs read (read-only) and SHA-256

Local worktree inputs (this worktree, `3b84986…`):

| File | Bytes | SHA-256 |
|---|---:|---|
| `AGENTS.md` | 5997 | `4948f45696a0e4d5e52c92654d36d67f37a38ddef63876ea34a551e1b69e63f6` |
| `docs/SPEC.md` | 17551 | `39307ed3738ec47d7cf899040b795a42787941c9daf2b81d03762e4bac3fa81e` |
| `docs/t3/APPLYWRIGHT-GROUNDING-G1-COMMISSION.md` | 5757 | `f95528e1f5008a1d57113b04f8366d48b42f62891d2d10f469973fcb951d4cef` |
| `docs/t3/APPLYWRIGHT-PROVIDER-DELEGATION-20261028.md` | 5607 | `9579b7ffa8f2b6ca4acdfd506581f1f0adb151b908a04ce2ea6b77d183ed298b` |

Parent-root inputs (uncommitted there, absent from this worktree; read via
absolute paths, never written):

| File | Bytes | SHA-256 |
|---|---:|---|
| `docs/t3/receipts/20261028-grounding-g1/r5/review/sol-review.FINDINGS.md` | 9464 | `cac7c13451566fdb2a08d72ac5a6f6fd0441d2192dcc11bc03a01b28ee9bc454` |
| `docs/verification/20261028-intake/verify-grounding-candidate.initial-50.mjs` | 4742 | `ba32c41efb24992702e7c8986e7bbb2becff666aff8e538dfdf49ba19a4c8009` |
| `docs/verification/20261028-intake/verify-grounding-candidate.mjs` | 4846 | `64330fbe1845f23b3b7ac104defec791813eea7f6766407e455adb8b0c2fc8d6` |
| `docs/verification/20261028-intake/verify-grounding-review-cases.mjs` | 4018 | `6c9d8a3aeb0c4b1b3abf79a3690d45902615a09762ee4837e88fd90467dca20f` |
| `docs/verification/20261028-intake/verify-grounding-review-r2-cases.mjs` | 4892 | `41f9069763fec8591e8a6487aa80d7b0e86fd65af95a375e54c1afc46c5a3ac6` |
| `docs/verification/20261028-intake/verify-grounding-review-r3-cases.mjs` | 3732 | `589c1eb39e0b72da0537ddede12ffaca77d68208b0da70a8ae965a13dcc5408f` |
| `docs/verification/20261028-intake/verify-grounding-review-r45-cases.mjs` | 6099 | `7b61abac34a319767776bf691333ecaf9bfb481e605c37b147aca360931968a4` |
| `docs/verification/20261029-g1-r6-diagnostic-attempt1/verification.json` | 11581 | `f26a3307e85ca144aab05b9ffe2be5c3ae72c968ab1d804c17ef900818270e59` |
| `docs/coordination/DOCS-ONLY-BASE-ADOPTION-20261029.json` | 4112 | `d6e7891551f6a28ca7ab280831de7bd2d2c21dfa6e30d10b02a3a1ca8b6dad1f` |

Parent root for the second table:
`C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright/`.
All prior oracles remain unchanged; nothing above imports, executes or
re-pins them. The R6 `verification.json` was read as a record (its state
is FAIL with source unchanged); its logs were not re-run and no candidate
was invoked from this worktree.

## Limits and stop

- Cases: 26 expectations total (23 unambiguous + 3 uncertain), inside the
  commissioned 12–24 *case* band if each ACCEPT/REJECT pair sharing one
  mechanism is counted as one case with two expectations; if every
  expectation is counted singly, the corpus is 2 over the band's top and
  the validator may drop G-10 and G-20 (pure controls) first. This
  ambiguity is flagged rather than hidden.
- No runtime outcome is asserted for any case. `NOT_RUN` for all
  execution, tests, builds, browsers, servers and model calls.
- This output is stopped here for operator / Codex frontier inspection.
  It grants the operator and the frontier reviewer read inspection of
  this file and its companion result file. It does **not** grant
  adoption as oracle or fixture, source edits, staging, commit, merge
  or publication. Those remain operator decisions after validation.

