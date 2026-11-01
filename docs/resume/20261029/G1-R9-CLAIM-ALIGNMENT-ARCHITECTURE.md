# G1 R9 architecture: match typed claims, not global phrase occurrence

Operator architecture/adjudication after the exact R8 Sol REQUEST_CHANGES.
No execution or acceptance is claimed. Keep R8 frozen, its unsafe-positive
decision, every prior report and all211 original independent expectations.

R8 repaired old literals but still validates several facts through field-wide
sets or adjacent-token exceptions. R9 must repair the association rule, not add
a special case for review meetings, a particular vendor or another unit spelling.
The existing full review is authoritative for exact cases/controls. This note
defines the general implementation boundary before the next writer starts.

## Evidence representation

Within the four owned core files, represent a sensitive claim with its source
span, owner/role, predicate kind, complete object, figures/units and origin.
Kinds include ownership, employment/title, qualification, calendar/date and
measured accomplishment. Distinguish candidate-owned evidence, another person's
referenced role/credential, application-target references and contact metadata.

Existing parsing helpers may be retained where sound. A whole-corpus occurrence
can license an ordinary name/reference, but cannot by itself establish employment,
held seniority, an award subject or a metric attached to a different object.
Do not require a new dependency or a general natural-language theorem. For an
explicit sensitive claim with insufficient evidence, return a specific refusal;
never exempt it because a capture is long or its words individually occur.

## Required matching rules

1. Preserve the complete provenance record, including objectFigures, when
   constructing ownership source clauses. R8 lost that Set and dereferences it.
   Valid faithful numbered claims must return acceptance, not throw or become
   a silent refusal. Catching exceptions as success is forbidden.
2. Match the governed complete object before comparing ownership strength and
   its figures. A carried source phrase, one-token lookahead, partial overlap or
   a number from another object cannot establish ownership of a longer/different
   head. Keep adjunct removal and the existing deploy-time/building controls.
3. Employment evidence requires an employment/own-role frame or genuine CV role
   header. Presented at a vendor conference is not employment; lowercase/copular
   phrasing still makes an employer claim when the frame says so. Reuse ordinary
   worked-at complements such as scale as grammar, not invented employers.
4. Own title/seniority evidence must belong to the candidate. Supported a senior
   engineer is evidence about the supported person, not the candidate's title.
   Bare title phrases with trailing complements still include their modifiers.
   Advertised/target-title exemptions apply to the specific application-reference
   occurrence, never every matching title in the same target document. Retain
   a truthful application sentence without licensing an earlier held-title claim.
5. Credential subjects must come from a credential-bearing span, with its award
   and owner, not the same full phrase in work prose. Preserve complete long
   subjects/acronyms, award descriptors, subject omission and degree idioms.
6. Match figures with their measure/object and dimension, not field-wide value
   or unit sets. Latency3ms and throughput3x cannot trade their units. Storage
   scales are distinct; an unlisted unit must retain a normalized lexical unit
   identity instead of becoming a bare number. Recognized aliases/equivalences
   remain supported. Do not weaken currency, percent, count or duration controls.
7. Contact classification is span-specific. A nearby Contact label must not
   absorb a following accomplishment line; separators or a leading zero alone
   cannot override an explicit count/measure context. A real phone may be omitted
   with a warning while a metric on the next line remains protected. Dropping
   both must still reject the metric. Tailor's one-way drop contract is distinct.
8. Normalize full/abbreviated/dotted calendar identities structurally inside
   ranges. Jun.2020 and June2020 denote the same date; punctuation must not
   manufacture inequality. Unsupported dates still reject and modal May remains
   ordinary grammar. Preserve the dated-month and undotted-range controls.

## Test and scope policy

All R8 findings and faithful controls need independently executed comparisons,
not just source declarations. Add boundary families for multiple object nouns,
other-person titles, copular/lowercase employers, mixed application/held-title
sentences, complete work-only subject phrases, typed measure reassociation,
contact+metric drops, ordinary complements and dotted date ranges. Keep all
previous positive/negative controls; do not tune expected answers to implementation.

Use shared typed evidence where it prevents a demonstrated semantic drift;
do not perform an unrelated helper-hoist merely for style. Any new shared export
must remain inside the owned tailor/refine files and preserve existing API calls.
No text.js/new product-module scope expansion is implied. Model return paths
must consume the same validation result, retain c7 field/index safeguards, and
never return a falsely accepted string under a fallback/rules mode label.

DSH owns the next implementation in its new assigned worktree; Sol remains the
independent exact-byte reviewer. Source workers run no tests. Actual tests need
the reviewed finite executor/full-lifetime EX, not a SOURCE observation. Source
declarations, a generic exception catch or a green old corpus alone cannot close
the new claim-alignment findings. No broad factuality guarantee is inferred.
