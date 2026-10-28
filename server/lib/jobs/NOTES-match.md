# match.js — matching and profile scoring

Owner: agent `match`. Scope: `server/lib/jobs/match.js`, this note, the test file.
Covers SPEC §5 (`server/lib/jobs/match.js`) and nothing else.

```js
import { matchRule, scoreJobForProfile } from "./match.js";
```

Both functions are pure: no database, no network, no clock, no randomness. The same
input always produces the same output, which matters because an alert is re-polled on
a cadence and a score is shown in the UI.

Two additive exports are offered for the UI. They are not part of the SPEC contract
and nothing else depends on them yet:

- `EXPORT const SCORE_WEIGHTS` — the five weights, frozen, so a breakdown label does
  not repeat the numbers in the markup.
- `EXPORT function explainJobScore(job, profile)` — `{ score, parts[] }`, the same
  number plus the working (see "The breakdown" below).

## Input shapes

| Argument | Source | Fields read |
|---|---|---|
| `rule` | `alerts` row | `keywords`, `locations`, `remoteOnly`/`remote_only`, `minSalary`/`min_salary` |
| `job` | `jobs` row | `title`, `description`, `location`, `remote`, `salaryMin`/`salary_min`, `salaryMax`/`salary_max` |
| `profile` | `cvs.profile_json` | `titles`/`targetTitles`, `skills`, `keywords`, `location`/`locations`, `remote`, `seniority`/`level`, `years`/`yearsExperience`, `summary`, `text` |

The underscored column names are accepted as well as the camelCase ones, so a raw
SQLite row can be passed straight in without a mapping layer. `remote` may arrive as
`true`, `1` or `"1"`; all three count as remote.

`null` or `undefined` for any argument is tolerated and treated as "nothing known".
`matchRule(null, job)` matches everything, because an alert with nothing set is a
search for any job. `scoreJobForProfile({}, {})` is `0`.

## matchRule(rule, job)

Returns exactly `{ matched, reasons }`.

**Dimensions are AND-ed; alternatives within a dimension are OR-ed.** A rule matches
when every dimension it actually sets passes. Inside `keywords` and inside `locations`
the listed items are alternatives, because a saved search lists "data engineer,
analytics engineer" when either will do. An empty dimension is not a test and
produces no reason line.

- **Keywords** — token subset over the job's `title` + `description` only (not the
  company, not the URL). A keyword of several words needs every word present, in any
  order: `"data engineer"` matches "…data pipelines… senior engineer". Matching uses
  `tokenize` from `server/lib/text.js`; a keyword whose words are all one character
  long has nothing to match and fails explicitly.
- **Locations** — case-insensitive substring of `job.location`, after whitespace is
  collapsed. Any listed location will do.
- **remoteOnly** — passes when `job.remote` is truthy.
- **minSalary** — passes only when the job states a salary at or above the floor. The
  figure that decides is the bottom of the stated band (`salaryMin`, or `salaryMax`
  when that is the only figure given), because that is the pay the job guarantees. An
  unknown salary is a miss, never a neutral.

The item is dropped before the test when it repeats, keeping the first spelling and
the rule's order. Reason lines come out in the order keywords, locations, remote,
salary — always the same order for the same rule.

### The reason lines

One line per test run, plain words, no formatting:

| Test | Line |
|---|---|
| keyword found | `title or description contains "data engineer"` |
| keyword missing | `title or description does not contain "data scientist" (missing "scientist")` |
| keyword unusable | `keyword "R" has no searchable words` |
| location found | `job location "London, UK" contains "London"` |
| location missing | `job location "London, UK" does not contain "Leeds"` |
| location unknown | `job location is unknown, so it cannot meet "London"` |
| remote, yes | `job is marked remote` |
| remote, no | `job is not marked remote` |
| salary meets | `stated salary band 65000–80000 meets the 45000 floor` |
| salary short | `stated salary band 40000–90000 starts below the 45000 floor` |
| salary unknown | `salary unknown, so it cannot meet the 45000 floor` |
| no criteria | `the rule sets no criteria, so every job matches` |

A matched rule can still carry failing lines, because the keyword alternatives are
OR-ed: "does not contain kubernetes" sits next to "contains python". A consumer should
show the passing lines for a match and the failing lines for a miss. Do not try to
infer the verdict by filtering on wording.

## scoreJobForProfile(job, profile)

A transparent 0–100: how much of this job the profile can evidence. It is not a
prediction of an interview or an offer, and it does not model the employer.

Weights sum to 100. Each component produces a ratio from 0 to 1; points are
`ratio × weight`, rounded to two decimals, then summed and rounded to an integer and
clamped to 0–100. Because the parts are rounded first, the parts always reconcile with
the total.

| Component | Weight | What earns it |
|---|---|---|
| Keywords | 35 | The share of the job's own extracted keywords that the profile can evidence |
| Title | 25 | How much of a target title the job title covers |
| Location | 15 | Whether the candidate can do this job where it is |
| Seniority | 15 | How close the job's level is to the profile's |
| Salary | 10 | Whether the job states a salary at all |

### Keywords (35)

The job text is passed through `extractKeywords(text, { limit: 25 })`, so the terms are
the shared layer's unigrams, bigrams and trigrams. Each term counts towards the
denominator with its own weight; terms whose every word appears in the profile's
vocabulary (skills + keywords + target titles + summary + text) count towards the
numerator. Frequent job words therefore matter more than incidental ones.

Cannot compare — no job text, or a profile with no skills, titles, summary or text —
scores 0 with a detail saying which side is empty. A sparse profile should not earn
points for words it never claimed.

### Title (25)

Token coverage, not Jaccard: for every target title, the share of its words that
appear in the job title, and the best target wins. Coverage rather than symmetric
overlap because real job titles carry location, salary and noise — "Senior Data
Engineer — London — £60k" should still cover "Data Engineer". A profile with no target
titles scores 0.

### Location (15)

Five cases, in this order:

1. the profile accepts remote work and the job is marked remote → 1;
2. the profile states no location preference and the job states a location → 1 (there
   is no constraint to fail);
3. the job states no location → 0;
4. a stated profile location is a case-insensitive substring of the job location → 1;
5. anything else → 0, including a remote-only profile looking at an on-site job.

`profile.location` may be `"London, UK"`; the alternatives are split on commas, so
either "London" or "UK" matching is enough.

### Seniority (15)

Levels are 1 junior, 2 mid, 3 senior, 4 lead. The job's level comes from an explicit
field, then from its title ("head", "principal", "manager", "director" → 4; "senior",
"sr" → 3; "mid", "intermediate" → 2; "junior", "graduate", "intern", "trainee" → 1).
A job title with no marker at all reads as mid-level — "Data Engineer" is a mid-level
posting, and refusing to guess would silently remove 15 points from most of the feed.

The profile's level comes from an explicit field, then the seniority word in a target
title, then years of experience (<2 junior, <5 mid, <9 senior, else lead). A target
title with no marker is **not** read as mid-level: for the candidate that would be a
guess rather than a reading, so the component scores 0.

Points by distance: 0 apart → 1, 1 apart → 0.6, 2 apart → 0.25, 3 or more → 0.

### Salary (10)

Presence only: 1 when the job states a salary or a band, 0 when it does not. The
amount is not judged here — whether the pay is enough for the candidate is an alert
rule (`matchRule` with `minSalary`), not a score.

### The breakdown

`explainJobScore(job, profile)` returns `{ score, parts }`, in this fixed order:
`keywords`, `title`, `location`, `seniority`, `salary`. Each part is
`{ id, weight, ratio, points, detail }`, where `detail` is one plain sentence such as
`the job reads senior against a mid profile` or `5 of 17 job keywords appear in the
profile`. Useful for a score tooltip or an audit; the score itself is the same number
`scoreJobForProfile` returns.

Calibration against the test fixtures, with a mid-level data profile: a Data Engineer
posting whose description states only Python and SQL scores 100; a Senior Data
Engineer posting in London that states a salary but mentions tools the profile does not
list scores 71; a Warehouse Operative role in Leeds scores 19 — the 19 is salary
presence plus a one-level seniority gap, and the breakdown shows that the keywords,
title and location earned nothing.

## Interpretations of SPEC §5

The spec fixes the contracts but is silent on these points. Each is a decision, not an
accident:

1. **Keywords are alternatives, not a conjunction.** The spec does not say. An `alerts`
   row stores one TEXT column, and a saved search naturally lists alternatives. Within
   one keyword all words are still required.
2. **A salary floor is judged on the bottom of the band.** "a stated salary at or above
   it" is unambiguous for a single figure and ambiguous for a band. A band of
   40 000–90 000 does not meet a 45 000 floor, because the job guarantees only 40 000.
   The trade-off is a few missed postings rather than a feed full of jobs that pay less
   than the floor. A job that states only a maximum uses that figure, since it is the
   only figure the job states.
3. **`reasons` carries no overall verdict line.** The contract is
   `{ matched, reasons }`; a summary line would be a third statement of the same fact
   and would drift from `matched`.
4. **Only `title` + `description` are searched.** The spec says so for keywords, and it
   is also true for the score's keyword component, so the two agree. A rule for a
   company name will not match.
5. **The profile shape is not specified anywhere in the spec.** The fields above are a
   reading of what `cv/score.js` and `cv/tailor.js` will produce; every one is
   optional, and a missing field scores 0 rather than guessing.
6. **Currency is ignored.** The `alerts` table has no currency column, so a floor of
   45 000 is compared with a job's figure whatever its currency. Comparing GBP with
   USD would need a rate, a network call and a decision about which day's rate.
7. **`minSalary: 0` is a real floor**, not "no floor": it asks for a stated salary.
   `null`/`undefined` is the absence of the test.

## Limitations

- **No stemming.** Matching is literal token equality, so `"developer"` does not match
  a description that only says "developers", and `"engineer"` does not match
  "engineering". This is the sharpest limitation of the module. It follows from the
  spec's "token-subset … using tokenize", and it is the reason a keyword rule should
  use the form that appears in job titles. Adding a fold would change what the spec
  promises, so it would need the Lead's decision, not a silent change here.
- **Rule keywords are not stopword-filtered.** `tokenize` keeps stopwords (it only
  drops one-character tokens), so a keyword of "and" matches almost every posting.
- **Locations are plain substrings**, as the spec asks: "London" matches "Londonderry"
  and "UK" matches "Ukraine".
- **Seniority is read from the title only**, never the description. Descriptions say
  things like "you will report to the Senior Data Engineer", which would misfire. A
  bare job title therefore reads as mid-level.
- **The score has no notion of freshness or competition.** A three-week-old posting and
  one from this morning score the same; `posted_at` belongs to the feed ordering, not
  to this module.
- **The score is not comparable across profiles.** It measures fit to one profile. Two
  users' scores for the same job mean different things.
- **No currency, no cost of living, no visa or right-to-work check.** A job in another
  country can score well if the words and the location match.

## Integration (not yet runnable)

`server/index.js` and the `/api/alerts/run` handler do not exist yet, so this module has
not been exercised through HTTP and no integration test is claimed. The intended call
from the alert runner, once the Lead's store exists:

```js
// rows come from the Lead's store; the underscored names pass straight through
const { matched, reasons } = matchRule(alertRow, jobRow);
if (matched) {
  // create a notification using the reasons that passed
  const passed = reasons.filter((line) => !/does not|is unknown|not marked/.test(line));
}
```

That filter is shown only to make the shape of the data clear; the reliable approach is
to keep the per-test reasons on the notification record and let the UI decide. If the
Lead prefers a structured verdict instead of prose, this module can return one, but the
SPEC contract would need to change first.

The feed's own ordering can use `scoreJobForProfile(job, profile)`; the alerts runner
should use `matchRule` only, so a saved search never fires on a score threshold the
user did not set.

The `sources` module (`server/lib/jobs/sources.js`, written in parallel) emits jobs as
`{ title, company, location, remote, salary_min, salary_max, currency, description,
... }` with `remote` as `true` or `1` and the salary fields underscored. That is the
shape this module reads, so a normalised job goes straight from `fetchJobs` into
`matchRule` or `scoreJobForProfile` without a mapping layer. Reading its file is not
the same as running those two modules together, and no such combined run is claimed.

## Tests

```
node --test server/lib/jobs/match.test.mjs
```

29 tests, `node:test` and `node:assert/strict`, no network, no clock, no files. They
cover each matching dimension passing and failing, the exact unknown-salary reason, a
title-only match, a multi-word keyword, alternatives, the SQLite `1/0` remote flag, a
salary floor sent as `"45,000"`, the empty rule, determinism, the 0–100 bounds, the
weight sum, and a clearly better job out-scoring a clearly worse one.
