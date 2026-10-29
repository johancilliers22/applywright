# Proposal for Core G1: the curated verb list is too thin (38 of 70 ordinary CV verbs are refused as invented names)

**Status:** proposal + reproducible evidence. **No product file was edited.** `server/lib/cv/tailor.js`,
`server/lib/cv/refine.js` and their tests are **Core G1's** surface per `projects/applywright/AGENTS.md`, so this
is written for the G1 lane / coordinator to accept, reject or amend. It is not a patch.

**Measured:** 2026-10-29T00:20Z, against `main` at `2927716`, working tree as found (G1/E2E/contrast lanes
active; nothing in this file's scope edited). Product untouched.

**Evidence, runnable:** `docs/verification/20261029-openers-proposal/probe-openers.mjs`

```powershell
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
node docs/verification/20261029-openers-proposal/probe-openers.mjs   # exits 1 today
```

## The finding

The P1-A fix (`c7c79ce`) closed a real bypass by requiring every capitalised phrase to be either **in the
source** or **curated English**. That principle is right. The corpus of curated English is too small for the
job: a rewrite that opens with an ordinary but uncommon CV verb is refused as an invented name.

```
corpus: 70 ordinary CV verbs (British -ise forms, third-person -s, hyphenated, past tense)
accepted: 32
refused as "new name" (false refusals): 38        ← 54%
refused for ownership (correct by design): 0
bypass controls still refused: 3/3
```

The 38 false refusals:

```
Revamps Overhauls Champions Orchestrates Helms Pioneers Fortifies Unblocks De-risks Spearheads
Steers Galvanises Rallies Cultivates Onboards Consolidates Standardises Hardens Optimises
Accelerates Simplifies Secures Stabilises Troubleshoots Diagnoses Prototypes Benchmarks
Audits Forecasts Facilitates Unifies Prioritises Delegates Coaches Recruits Retains Upskills
Initiated
```

Concretely: `assertGrounded("Worked on the payments platform for two years.",
"Optimises the payments platform.")` fails with `new name "Optimises" is not in the original`. A user asking for
"make it more formal" and receiving a sentence that opens with a verb outside the list gets a refusal whose
reason reads as if they had invented a company.

## Why this is a list problem, not a principle problem

`isCuratedWord()` accepts a single word only if it is in `COMMON_VERBS` (~150 bases) or the generated inflection
set, the sentence-opening adverbs, or the acronyms — or a multi-segment phrase whose every segment is. Names are
proper nouns; a verb added to that list is English, so **expanding it cannot admit `Initech`, `Initech-labs` or
`Zephyria`** — which the probe asserts on every run (3/3 controls still refused).

The bypass fix and the false refusals are therefore separable: keep the two-licence rule exactly as it is, and
widen the English licence.

## Proposed change (G1's call)

Add these **base forms** to `COMMON_VERBS` (the existing inflection generation then covers -s/-ed/-ing):

```
revamp overhaul champion orchestrate helm pioneer fortify unblock rally cultivate onboard
consolidate standardise standardize harden optimise optimize accelerate simplify secure
stabilise stabilize troubleshoot diagnose prototype benchmark audit forecast facilitate
unify prioritise prioritize delegate coach recruit retain upskill initiate
```

And handle the two shapes the base-form mechanism does not reach:

1. **Hyphenated verbs** — `de-risk`, `de-risks`, `de-risked`. Either add `risk` and `de` as segments so the
   multi-segment licence passes, or special-case a small hyphenated-verb set. (`isCuratedWord` currently requires
   *every* segment to be curated.)
2. **Past tense of a base already in the list** — `Initiated` was refused, which suggests the past-tense
   generation does not cover every base; worth checking `-ed`/`-d`/doubled-consonant (`stopped`) formation in the
   inflection builder rather than only adding `initiate`.

Nothing here touches the ownership guard, `softSentenceStart` (still removed, correctly), or the source licence.

## Acceptance checks for whoever takes it

1. `node docs/verification/20261029-openers-proposal/probe-openers.mjs` → **exit 0** (0 false refusals, 3/3
   bypass controls still refused).
2. The ten executed review repros from `c7c79ce` still refuse — `Initech is my employer`, `Initech-labs`,
   `Zephyria`, `Effectively led 12 engineers`, the multiline promotion — and the English-acceptance set
   (`Delivers a 40%`, `Use the existing pipeline`, `Go-based` in-source, `Collaborates effectively`,
   `worked with → partnered with`) still passes.
3. New tests pin at least ten of the 38 verbs above, in the same style as the existing curated-word tests.
4. The three mandatory gates, run by the integrating operator with the heavy lock: `node --test tests/`,
   `node --test server/lib server/provider`, `node scripts/check.js`.

## Governance notes the coordinator must reconcile

- **`c7c79ce` touched G1-owned files.** The P1-A/P1-B fix was committed from this lane before
  `projects/applywright/AGENTS.md` assigned `tailor.js`/`refine.js` to Core G1. G1's R3 branch is based on
  `86b74c3`, so it will not contain that commit; the coordinator needs to decide whether R3 rebases onto it, is
  compared against it, or is superseded by it. This proposal deliberately does **not** add a second edit to
  those files.
- **This file is uncommitted on purpose.** Per `AGENTS.md`, only the operator integrates accepted source,
  commits named paths and pushes. The evidence file and this proposal are left in the tree at
  `docs/verification/20261029-openers-proposal/` for the coordinator to commit or discard.
- **It is a measurement, not a verdict on the P1-A fix.** The two-licence rule is the right shape; the English
  corpus behind it is what needs widening. Closing the bypass was worth a temporary false-refusal cost; leaving
  it at 54% would make the product feel broken to anyone who writes in verb-fronted bullets.
