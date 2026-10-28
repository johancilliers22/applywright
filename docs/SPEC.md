# Applywright — product spec (single source of truth)

Read this before writing anything. It defines the product, the data model, every
module contract, the HTTP surface, and — importantly — what this product refuses
to do. Where this file and your instincts disagree, this file wins. If it is
genuinely wrong, say so in your report instead of silently deviating.

## 1. Product

**Applywright** turns one CV into a tailored application for every job worth
applying to, and keeps the paperwork straight while you do it.

Product: Applywright. Company and site: Intelligent Artificial. Tagline: *Your CV, tailored for every job.*
Positioning: an application workspace for people who are serious about a search —
not a spray-and-pray bot.

What it actually does, in order:

1. **Ingest** a CV (paste text, or upload `.txt`/`.md`/`.docx`; PDF only when a
   local `pdftotext` exists) and segment it into contact block, summary,
   experience, education, skills.
2. **Score** that CV against a specific job description: keyword coverage,
   structure, quantified achievements, readability, formatting risks. Every point
   of the score is explained by a named finding with a fix.
3. **Tailor**: rewrite the summary, the bullets and the skills line for that job,
   using only facts present in the CV plus the structured profile. It may rephrase
   and re-order. It may not invent an employer, a date, a qualification or a number.
4. **Package**: a print-ready, single-column, ATS-safe CV, a covering letter, and
   answers to the common screening questions.
5. **Track**: every application has a status, a score, its pack and a timeline.
6. **Alert**: saved searches poll public job APIs and drop matches into an inbox
   (and an RSS feed), so the search keeps running without you.

### Hard boundaries (do not build these, do not imply them)

- **No LinkedIn scraping and no automated submission to third-party sites.**
  It breaches their terms, gets accounts banned, and produces fraudulent
  applications. The product prepares, you approve.
- **No fabricated experience.** Tailoring is grounded rewriting: every rewritten
  bullet must be traceable to a line in the source CV, and a grounding check
  rejects anything that introduces an unverified number, employer, title or date.
- **No auto-send.** The application queue ends at "approved and ready"; the human
  clicks apply on the employer's own page and records the outcome. Capture of a
  posting you are looking at is user-initiated (they paste the URL or the page),
  never background scraping.
- **No silent data retention.** CV text is stored as text (never the raw binary),
  and export/delete must work.

## 2. Plans (canonical — the site and the entitlement code must agree)

| Plan | Price | CVs | Tailored packs / month | Alerts | Other |
|---|---|---|---|---|---|
| Free | £0 | 1 | 3 | 1 | job feed with 40 results/day |
| Pro | £19 / month | 5 | 60 | 10 | full ATS reports, covering letters, pack history |
| Scale | £49 / month | unlimited | unlimited | 50 | API access, priority refresh, export everything |

Annual: 10 months for 12 (Pro £190/yr, Scale £490/yr). Prices are in GBP and include any applicable tax.
Cancel anytime; downgrade keeps existing packs readable.

## 3. Data model (SQLite via `node:sqlite`, one file at `data/applywright.db`)

All tables have `user_id` except `jobs` (a shared cache) and `users`.

```sql
users(id TEXT PK, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL,
      name TEXT, plan TEXT NOT NULL DEFAULT 'free', plan_renews_at TEXT, stripe_customer_id TEXT,
      created_at TEXT NOT NULL, deleted_at TEXT)

sessions(id TEXT PK, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
         user_agent TEXT, ip TEXT)

cvs(id TEXT PK, user_id TEXT NOT NULL, name TEXT NOT NULL, format TEXT NOT NULL, text TEXT NOT NULL,
    profile_json TEXT, primary_flag INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)

jobs(id TEXT PK, source TEXT NOT NULL, external_id TEXT, title TEXT NOT NULL, company TEXT,
     location TEXT, remote INTEGER, salary_min INTEGER, salary_max INTEGER, currency TEXT,
     url TEXT, description TEXT, posted_at TEXT, fetched_at TEXT NOT NULL, tags_json TEXT,
     dedupe_hash TEXT NOT NULL UNIQUE)

reports(id TEXT PK, user_id TEXT NOT NULL, cv_id TEXT NOT NULL, job_id TEXT, job_title TEXT,
        score INTEGER NOT NULL, report_json TEXT NOT NULL, created_at TEXT NOT NULL)

applications(id TEXT PK, user_id TEXT NOT NULL, job_id TEXT, cv_id TEXT NOT NULL, title TEXT NOT NULL,
             company TEXT, url TEXT, status TEXT NOT NULL DEFAULT 'pack_ready', score INTEGER,
             pack_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
             applied_at TEXT, notes TEXT)

alerts(id TEXT PK, user_id TEXT NOT NULL, name TEXT NOT NULL, keywords TEXT NOT NULL,
       locations TEXT, remote_only INTEGER NOT NULL DEFAULT 0, min_salary INTEGER,
       cadence TEXT NOT NULL DEFAULT 'daily', last_run_at TEXT, active INTEGER NOT NULL DEFAULT 1,
       created_at TEXT NOT NULL)

notifications(id TEXT PK, user_id TEXT NOT NULL, alert_id TEXT, job_id TEXT, title TEXT NOT NULL,
              body TEXT, read_at TEXT, created_at TEXT NOT NULL)

usage(id TEXT PK, user_id TEXT NOT NULL, feature TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 1,
      at TEXT NOT NULL)

settings(user_id TEXT PK, json TEXT NOT NULL)
```

Indexes: `jobs(dedupe_hash)`, `jobs(fetched_at)`, `applications(user_id, updated_at)`,
`notifications(user_id, read_at)`, `usage(user_id, feature, at)`, `sessions(expires_at)`.

Application statuses: `pack_ready` → `approved` → `submitted` → `interview` →
`rejected` → `offer` (plus `withdrawn`).

## 4. Shared library (`server/lib/text.js`) — Lead owns, everyone imports

```js
export const STOPWORDS;                                  // Set<string>
export function tokenize(text);                          // string[] lowercased words
export function normalizeTerm(term);                     // "Project-Manager" -> "project manager"
export function extractKeywords(text, { limit = 40 } = {});   // [{ term, weight, count }]
export function keywordCoverage(cvText, jobText, opts);  // { matched, missing, ratio }
export function sentences(text);                         // string[]
export function bulletize(text);                         // string[]  (•, -, *, numbered lines)
export function sha256(text);                            // hex
export function slugify(text);                           // filesystem-safe
export function pct(part, whole);                        // 0-100 rounded
```

Keyword rules: normalise case and punctuation, drop `STOPWORDS`, drop tokens
shorter than 2 chars, keep 2–3-word phrases that occur adjacent, weight by
frequency × rarity across the two documents. Deterministic — same input, same
output, always.

## 5. Module contracts (pure functions, no DB, no network unless stated)

Each module is its own folder with `module.js`, `self-test.mjs` and `NOTES.md`.
`self-test.mjs` runs with `node --test`. Aim for 60%+ coverage of your own logic.

### `server/lib/cv/extract.js`
```js
export async function extractText({ buffer, filename, mime }); // { text, format, warnings }
export function docxToText(buffer);        // strips XML, keeps paragraph breaks
export function segmentSections(text);     // { contact:{name,email,phone,links[]}, sections:{summary,experience,education,skills,other}, raw }
export function detectFormat(filename, mime); // 'txt'|'md'|'docx'|'pdf'|'unknown'
```
Requirements: DOCX is a zip — parse the central directory yourself with
`node:zlib` (no dependencies), read `word/document.xml`, convert `<w:p>` to
newlines and `<w:tab/>` to spaces, decode XML entities. PDF: attempt
`pdftotext - -` via `child_process` if it exists on PATH, else return
`format:'pdf'` with an explanatory warning. Never throw on malformed input —
return warnings. `segmentSections` must handle a CV with no headings at all
(all lines fall into `other` plus whatever heuristics find).

### `server/lib/cv/score.js`
```js
export function scoreCv({ cvText, jobText, profile });
// { score:0-100, subscores:{keywords,structure,achievements,readability,formatting},
//   keywordCoverage:{matched,missing,ratio},
//   findings:[{id,severity:'high'|'medium'|'low',title,detail,fix}], advice:string[] }
```
Deterministic weights (document them in NOTES.md): keywords 35, structure 20,
achievements 20, readability 15, formatting 10. Findings must be specific and
actionable ("Only 2 of 14 job keywords appear in your experience section: …"),
never generic ("improve your CV"). No network, no model.

### `server/lib/cv/tailor.js`
```js
export async function tailorCv({ cvText, profile, job, model }); // model = optional provider
// { summary, bullets:[{section,original,rewritten,evidence}], keywordsPlaced:[],
//   coverLetter, screening:{motivation,noticePeriod,rightToWork,salaryExpectation},
//   warnings:[], mode:'model'|'rules' }
```
Two paths: `model` present → one JSON-mode call to the provider (the Lead passes
an OpenAI-compatible client), validated against a schema; no model → a
deterministic rule-based rewriter (re-order bullets by keyword overlap, tighten
wording, prepend keywords that appear in the CV, no inventing). Both paths must
run `assertGrounded(original, rewritten)`: every number in a rewritten bullet
must appear in the original or be absent; no new employer/title/date tokens.

### `server/lib/jobs/sources.js`
```js
export const SOURCES;                       // { arbeitnow, remotive, remoteok }
export async function fetchJobs({ query, location, remoteOnly, limit, signal, fetchImpl });
// { jobs: Job[], errors: [{source,message}] }
export function normalizeArbeitnow(payload, query);
export function normalizeRemotive(payload, query);
export function normalizeRemoteok(payload, query);
```
Live endpoints (verified reachable 2026-10-28):
`https://www.arbeitnow.com/api/job-board-api`,
`https://remotive.com/api/remote-jobs?limit=50`,
`https://remoteok.com/api`.
Requirements: 6s timeout per source, tolerate one source failing, dedupe by
`sha256(company|title|location)` lowercased, filter by query tokens when given,
cap `description` at 8 000 chars, send a descriptive User-Agent, never throw.
`fetchImpl` is injectable so tests use fixtures instead of the network.

### `server/lib/jobs/capture.js`
```js
export function isSupportedHost(url);                       // boolean + source name
export function parseCapturedPosting({ url, html, text });  // Job
```
Recognise Greenhouse (`boards.greenhouse.io`, `job-boards.greenhouse.io`),
Lever (`jobs.lever.co`), Workable (`apply.workable.com`), Ashby
(`jobs.ashbyhq.com`), Workday (`*.myworkdayjobs.com`), plus generic
`schema.org/JobPosting` JSON-LD on any page (that is the reliable path — prefer
it). Extract title, company, location, salary if stated, description text,
posted date. Return `{ ...job, confidence: 0-1, warnings:[] }`.

### `server/lib/jobs/match.js`
```js
export function matchRule(rule, job);            // { matched, reasons:[] }
export function scoreJobForProfile(job, profile); // 0-100
```
`rule` shape: `{ keywords, locations, remoteOnly, minSalary }`. Keyword match is
token-subset on title + description; locations are case-insensitive substring;
`minSalary` only matches when the job states a salary at or above it (unknown
salary = no match, and say so in `reasons`).

### `server/lib/packs/build.js`
```js
export function buildPack({ profile, cvText, job, tailored });
// { cvHtml, cvTextPlain, coverLetterMd, answers:[{question,answer}], filenameBase }
```
`cvHtml` is a complete standalone HTML document with inline print CSS: A4,
18mm margins, single column, no tables for layout, no icon fonts, no images,
`@media print` page-break rules, system fonts, 10.5–11pt body. It must survive a
copy-paste into Word and parse cleanly in an ATS: headings as real text, no
text-in-shapes, no columns. Tests assert structure (headings present, no
`<table>`, no external URLs, escapes the user's text).

### `server/lib/billing/plans.js`
```js
export const PLANS;                        // { free, pro, scale } with price, quotas
export function entitlements(plan);        // resolved quota object
export function can(plan, feature, usage);  // { allowed, used, limit, remaining }
export function priceFor(plan, interval);   // 'month'|'year' -> pence
export function stripeConfigured();         // boolean, from env only
```

## 6. HTTP API (Lead implements; this is the contract clients test)

Cookie session auth (`aw_session`, HttpOnly, SameSite=Lax, 30 days). Every
mutation requires `origin` to match the host. Errors are
`{ error: { code, message } }`. Rate limits: auth 10/min per IP, others 120/min.

```
POST   /api/auth/register   {email,password,name}        → {user}
POST   /api/auth/login      {email,password}             → {user}
POST   /api/auth/logout                                  → {ok}
GET    /api/auth/me                                      → {user, plan, usage}

GET    /api/cvs                                          → {cvs}
POST   /api/cvs             {name?, text} | {name, filename, contentBase64}  → {cv}
GET    /api/cvs/:id                                      → {cv}
PATCH  /api/cvs/:id         {name?, primary?}             → {cv}
DELETE /api/cvs/:id                                      → {deleted:true}

POST   /api/analyse         {cvId, jobText?|jobId?}      → {report}
GET    /api/reports                                      → {reports}
POST   /api/tailor          {cvId, jobId?|jobText?, title?, company?, url?}  → {application}
GET    /api/applications                                 → {applications}
PATCH  /api/applications/:id {status?,notes?}            → {application}
GET    /api/applications/:id/cv                          → text/html (print pack)

GET    /api/jobs?query=&location=&remote=1&limit=  → {jobs, sources, cached}
POST   /api/jobs/capture    {url, html?, text?}    → {job}
GET    /api/jobs/:id                               → {job}

GET    /api/alerts                                         → {alerts}
POST   /api/alerts          {name,keywords,locations?,remoteOnly?,minSalary?,cadence?} → {alert}
PATCH  /api/alerts/:id      {active?, ...}                  → {alert}
DELETE /api/alerts/:id                                     → {deleted:true}
POST   /api/alerts/run                                     → {checked, matched, created}

GET    /api/notifications?unread=1                         → {notifications}
POST   /api/notifications/:id/read                         → {ok}
GET    /feed/:token.rss                                    → RSS 2.0

GET    /api/billing/plans                                  → {plans}
POST   /api/billing/checkout {plan, interval}              → {url} or 501 when unconfigured
POST   /api/billing/webhook                                → Stripe-shaped, 501 when unconfigured
GET    /api/health                                         → {status, version, provider, sources}
GET    /api/export                                         → JSON of everything owned by the user
DELETE /api/account        {password}                      → {deleted:true}
```

## 7. Screens

Marketing (public): `/`, `/how-it-works`, `/pricing`, `/security` (includes the
compliance stance in plain English), `/about`.
Product (authenticated): `/app` dashboard (CV score snapshot, next actions, recent
applications, alert hits), `/app/cv` (CV library + upload/paste + score against a
pasted job), `/app/jobs` (feed, filters, capture box, save-to-queue),
`/app/applications` (queue + status board + pack viewer), `/app/alerts`,
`/app/billing`, `/app/settings` (export/delete).
Auth: `/sign-in`, `/sign-up`.

## 8. File ownership (advisory but enforced by the Lead at integration)

| Path | Owner |
|---|---|
| `server/index.js`, `server/app.js`, `server/db.js`, `server/auth.js`, `server/lib/text.js`, `server/lib/store.js` | Lead |
| `server/lib/cv/extract.js` | agent: ingest |
| `server/lib/cv/score.js` | agent: score |
| `server/lib/cv/tailor.js` | agent: tailor |
| `server/lib/jobs/sources.js` | agent: sources |
| `server/lib/jobs/capture.js` | agent: capture |
| `server/lib/jobs/match.js` | agent: match |
| `server/lib/packs/build.js` | agent: packs |
| `server/lib/billing/plans.js` | agent: billing |
| `public/app/**` | agent: app-ui |
| `public/*.html` marketing + `public/assets/site.css` overrides | agent: site |
| `docs/DEPLOY.md`, `README.md` | agent: docs |
| `tests/**` | agent: tests |
| `docs/SPEC.md` | Lead |

Nobody edits a file they do not own. No git, no `npm install`, no dev servers, no
network access from tests (inject fixtures).

## 9. Quality bar

- British English. Plain, specific, no hype words, no exclamation marks.
- Every score, quota or price shown in the UI must come from the code that
  enforces it — no decorative numbers.
- Accessible: labels, focus states, keyboard paths, 4.5:1 contrast, no colour-only
  status.
- Responsive at 375 / 768 / 1440.
- Honest empty states and honest errors. If a job source is down, say which one.
