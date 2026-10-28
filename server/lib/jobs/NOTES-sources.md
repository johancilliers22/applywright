# sources — notes

`server/lib/jobs/sources.js` reads three public job boards and turns their payloads
into rows shaped like the `jobs` table in SPEC §3. This file records what the boards
actually return (probed 2026-10-28), the decisions the spec left open, and what the
module deliberately refuses to do.

Run the tests:

```
node --test server/lib/jobs/sources.test.mjs
```

28 tests, no network, no clock, no files. The suite also replaces `globalThis.fetch`
with a thrower while `fetchJobs` runs, so a regression that reaches for the network
fails rather than passes quietly.

## What the boards send

All three were fetched live while this module was written; the fixtures in
`sources.test.mjs` mirror the field names below.

| Board | Envelope | Posting fields used | Quirks |
|---|---|---|---|
| Arbeitnow | `{ data: [...], links, meta }` | `slug`, `company_name`, `title`, `description`, `remote`, `url`, `tags`, `job_types`, `location`, `created_at` | 300 rows on page 1. Descriptions are **escaped** HTML (`&lt;p&gt;`) and sometimes escaped twice (`&amp;amp;`). No salary fields at all. `remote` is a boolean and is authoritative — "Remote, OR" is a real place. `created_at` is unix seconds and behaves like ingest time: many rows in one page share the same second. |
| Remotive | `{ "0-legal-notice", "00-warning", "job-count", "total-job-count", jobs: [...] }` | `id`, `url`, `title`, `company_name`, `category`, `tags`, `job_type`, `publication_date`, `candidate_required_location`, `salary`, `description` | Everything is remote — it is a remote-only board. The free feed returned **10** postings per request regardless of `?limit=2` or `?limit=50`. `publication_date` has no timezone (`2026-10-22T18:40:19`). `salary` is free text: `70K-80K`, `$170k - $200k`, `OTE $25k - $35k`, `$50-$75 /hour`, `$1000 per task`, `""`. Their docs ask for at most about four requests a day. |
| Remote OK | bare array; `[0]` is `{ last_updated, legal }` with no posting fields | `slug`, `id` (string), `epoch`, `date`, `company`, `position`, `tags`, `description`, `location`, `url`, `apply_url`, `salary_min`, `salary_max` | 99 postings plus the legal notice. Title is `position`. `salary_min`/`salary_max` are whole US dollars where **0 means "not stated"**. `location` is usually `""`. Descriptions carry mojibake (`company\u00e2\u0080\u0099s`). |

Observed on 2026-10-28: Arbeitnow 300 rows (0 salaries, 14 remote), Remotive 10
(5 with a salary, all remote), Remote OK 99 (24 with a salary, all remote). All three
requests together took about 0.6 s.

## Field mapping

| `jobs` column | Value |
|---|---|
| `source` | `arbeitnow` / `remotive` / `remoteok` — matches the `SOURCES` keys |
| `external_id` | Arbeitnow `slug` (falls back to `url`), Remotive `id` as a string, Remote OK `id` |
| `title` | Arbeitnow `title`, Remotive `title`, Remote OK `position`; empty title ⇒ the row is dropped (the column is `NOT NULL`) |
| `company` | `company_name` / `company`; `null` when absent |
| `location` | Arbeitnow `location`, Remotive `candidate_required_location`, Remote OK `location` (often `""`) |
| `remote` | `1`/`0` integers, not booleans — the column is `INTEGER` |
| `salary_min` / `salary_max` | integers, or `null` when the board does not state a figure |
| `currency` | `GBP`/`EUR`/`USD`/`CAD`/`AUD` from a symbol or code; `null` when the board states no currency |
| `url` | only `http(s)` URLs survive; anything else becomes `null` rather than a broken link |
| `description` | plain text (see below), capped at 8 000 characters |
| `posted_at` | ISO 8601 in UTC, from `created_at` / `publication_date` / `date` (falling back to `epoch`); `null` when absent or implausible |
| `tags_json` | `JSON.stringify` of a lowercased, de-duplicated, sorted array |
| `tags` | the same array, unstringified (see the store seam below) |
| `dedupe_hash` | `sha256(lowercased company|title|location)` from `server/lib/text.js` |
| `fetched_at` | **not set here** — the store stamps it on insert, so this module never reads the clock |

## Decisions worth knowing

**Descriptions are converted to text.** The boards send HTML, sometimes escaped
once and sometimes twice. Keyword extraction, scoring and tailoring all read this
column, so `htmlToText()` strips tags and decodes entities in two rounds; otherwise
`lt`, `p` and `nbsp` become keywords and the score is nonsense. Descriptions are
capped at 8 000 characters *after* that clean-up.

**Mojibake is repaired where it is safe.** Remote OK's feed re-encodes UTF-8 as
Latin-1. The repair only runs when the string is pure Latin-1 and the round trip
produces no replacement characters, so ordinary Unicode text is never mangled. It is
a best-effort fix, not a guarantee.

**Salaries are never annualised.** `$50-$75 /hour`, `€5,000 /month` and `$1000 per
task` all become `null`, because turning them into a yearly figure would require
inventing hours per week and weeks per year. `per annum`, `a year` and `annually` are
annual and are parsed. Single figures become `min = max`. Amounts below 1 000 or
above 10 000 000 are rejected as implausible annual salaries rather than guessed at.
Remote OK states no currency; its figures are US dollars on the site, so that
assumption is recorded in the code and here. Remotive's `70K-80K` states no currency,
so `currency` stays `null` even though the numbers were parseable.

**Prices of honesty:** a `null` salary means "not stated", never "free" or "unknown
but probably fine". `match.js` treats an unknown salary as no match and says so, which
is the same posture.

**Query filtering is AND over tokens.** A query is tokenised with the shared
tokenizer, stopwords are removed, and every remaining token must appear somewhere in
title, company, location, tags or description. AND rather than OR because "react
nurse" should return nothing. The shared stopword list also carries trade words such
as `team` and `lead`, so a query made entirely of stopwords falls back to the words
actually typed — otherwise "team lead" would filter nothing at all. A query over 12
tokens is truncated to the first 12.

**Location filtering treats an unstated location as remote-agnostic.** When
`remoteOnly` is false, a posting with `location = ""` does not match a location
search (the user asked for a place). When `remoteOnly` is true it does match, because
Remote OK never states a place and Remotive says "Worldwide" — for remote work "where"
is answered by "remote". Location matching is a case-insensitive substring on the
normalised value; accents are not folded.

**Dedupe keeps the richest record.** When two boards carry the same posting the
survivor is the one with the longer description, then a stated salary, then a URL,
then a posted date; exact ties keep the earlier board (`arbeitnow`, `remotive`,
`remoteok`). Nothing is merged field by field — one record wins whole, so a row is
always traceable to a single payload.

**Ordering is newest first**, then board priority, then `dedupe_hash` so ties can
never flip between runs. `limit` defaults to 50 and is capped at 200; a limit that is
not a positive number falls back to the default.

**Failures are reported, never thrown.** Each board settles on its own and `errors`
is assembled in a fixed board order, so the caller always knows which source is down
(the quality bar in SPEC §9 requires exactly that). A board that answers with the
wrong shape, non-JSON, a non-2xx status, or a network failure produces one
`{ source, message }` entry; a board that answers with junk *rows* inside a good
envelope is filtered silently. A request that produces no job list is an error rather
than an empty feed, so a broken contract cannot look like "no jobs today".

**`fetchImpl` is injectable.** This is the only network the module performs, one
request per board, with a descriptive User-Agent, an `AbortSignal` combining the
caller's signal and a 6-second budget, and no retries. Retrying, caching and
throttling belong to the caller: Remotive asks for at most about four requests a day,
so the Lead's job cache should sit in front of `fetchJobs`, not inside it.

## What this module does not do

- **No pagination.** Arbeitnow page 1, Remote OK's default page, Remotive's free feed
  (10 rows). More pages would mean more requests per call, which the boards'
  rate guidance does not allow from a search box.
- **No source balancing.** The merge is a single newest-first list, and Arbeitnow
  dominates it: on 2026-10-28, `limit: 200` returned 200 Arbeitnow rows, because its
  `created_at` is ingest time (minutes old) while Remotive is delayed by a day and
  Remote OK's newest postings were two days old. This is the sharpest limitation of
  the module. If the feed must represent every board, ask each board separately
  (`SOURCES[id].normalize` on its own payload) and interleave, or pass a per-board
  limit from the caller — a quota hidden inside this function would be a policy the
  Lead never agreed to.
- **No salary inference**, no currency conversion, no location geocoding, no
  description summary, no model.
- **No attribution rendering.** Remotive and Remote OK both require the listing to
  name them as the source and link back to the original posting; their legal notices
  say access is suspended otherwise. Each `SOURCES` entry carries an `attribution`
  line for the UI to render. That is the Lead's and the UI agent's job; this module
  only supplies the line.
- **No `fetched_at`.** The store owns it.

## Integration notes for the Lead

- `fetchJobs` returns `{ jobs, errors }` exactly as SPEC §5 specifies. `/api/jobs`
  already returns a `sources` field: derive it from `Object.keys(SOURCES)` minus
  `errors.map(e => e.source)` for the boards that answered, and show the failing
  board's `message` in the UI.
- **Store seam (found by reading `store.js`, not changed by me).**
  `store.upsertJob` writes `JSON.stringify(job.tags ?? [])` into `tags_json`, so a row
  that carries only `tags_json` would be stored with `"[]"`. Job rows therefore carry
  **both** `tags` (array) and `tags_json` (string), and `store.upsertJob({ ...job })`
  as written in `app.js` now preserves tags. If `store.js` later reads `job.tags_json`
  instead, nothing here needs to change.
- Job rows are ready for `store.upsertJob`, with `dedupe_hash` already computed and
  `fetched_at` still to add. Dedupe inside this module only covers one call; the
  `dedupe_hash` unique constraint covers the rest.
- `SOURCES` carries more than the three names: each entry has `id`, `label`, `url`
  (the endpoint as SPEC records it), `requestUrl()` (what is actually requested),
  `attribution`, `expect` (shape check) and `normalize`. `url` and `requestUrl()`
  agree today; Remotive's `?limit=50` is the reason the two exist.
- Callers can normalise a payload they already have — e.g. a cached response — with
  `normalizeArbeitnow(payload, query)`, `normalizeRemotive(...)`,
  `normalizeRemoteok(...)`. Each is pure and returns jobs already query-filtered and
  description-capped, but not location-filtered, remote-filtered, deduped or capped:
  that is `fetchJobs`.
- `fetchJobs` makes three network requests per call and each call re-reads all three
  boards. `app.js` already caches the feed for a few minutes; keep that cache in
  front of it.

## Interpretation of SPEC §5

The spec fixes the exports, the endpoints, the 6-second budget, the dedupe key, the
query filter, the 8 000-character cap, the User-Agent, the injectable fetch and the
"tolerate one failure, never throw" rule. It is silent on the following, which were
decided here and can be changed without breaking the contract:

1. Default `limit` 50, ceiling 200.
2. AND semantics for query tokens, searched across title, company, location, tags and
   description; stopword removal with an all-stopword fallback; 12-token cap.
3. The location rule for postings with no stated location (see above).
4. `remote` as `1`/`0` rather than a boolean, to match the column type.
5. `tags_json` sorted, lowercased and de-duplicated; `job_type`/`job_types` folded in
   as tags, Remotive's `category` left out.
6. `dedupe_hash` emitted as part of the row (the spec lists it as a column but not in
   the §5 job shape).
7. Which duplicate wins when two boards carry the same posting.
8. Ordering (newest first, then board priority, then hash).
9. Payload validation: a missing job list is an error; junk rows inside a good list
   are skipped.
10. Extra descriptive fields on `SOURCES` (label, requestUrl, attribution, expect) on
    top of the three keys the spec names.
11. Remote OK's currency is assumed to be USD; Remotive's currency is left `null` when
    unstated.
