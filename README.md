# Applywright

*Your CV, tailored for every job.*

Applywright turns one CV into a tailored application for each job worth applying to,
and keeps the paperwork straight while you do it. It scores a CV against a specific job
description, rewrites the summary and bullets using only facts the CV already contains,
builds a print-ready ATS-safe CV with a covering letter and screening answers, tracks
each application through its statuses, and polls three public job boards for saved
searches so the search keeps running between sessions.

One Node process, one dependency (Express), and a SQLite file on disk. There is no
build step, no container to run, and no external service that has to be reachable for
the product to start.

## What it refuses to do

These are design decisions, not omissions. Where a check is possible, the code makes it:
capture refuses the hosts that forbid automated access, and the grounding check rejects a
rewrite that invents a fact. Nothing needs checking for submission, because no submission
code was written.

**No LinkedIn scraping.** Applywright never fetches LinkedIn, and it does not crawl
employer sites in the background. The only outbound reads are the three public job APIs
(`arbeitnow.com`, `remotive.com`, `remoteok.com`) and the Stripe API if you configure
billing. `POST /api/jobs/capture` refuses `linkedin.com`, `indeed.com` and `glassdoor`
URLs outright, with the reason in the response, because those sites' terms forbid
automated access and re-publication. Capturing any other posting is user-initiated: you
paste the URL and the page text or HTML. The reason is practical. Scraping breaches the
terms of those sites, gets accounts restricted, and the data it yields is exactly what
the site did not intend to publish.

**No automated submission.** Nothing in this codebase posts an application to an
employer's site or fills in their form. A tailored pack ends at `pack_ready`, you
approve it, and you click apply on the employer's own page and record the outcome. The
reason is that an application is a statement made in your name: you have to see what is
being sent, and third-party submission is what produces fraudulent applications at
scale.

**No fabricated experience.** Tailoring is grounded rewriting. Every rewritten bullet is
checked against the source CV, and a bullet that introduces a number, a currency amount,
an employer, a job title, a date range or a qualification the CV does not contain is
replaced with the CV's own wording and the reason is recorded as a warning. The reason
is that an invented metric on an application is a false claim, it is the first thing a
careful interviewer checks, and it is not recoverable once sent.

The same discipline covers retention: CV text is stored as text and never as the raw
uploaded binary, `GET /api/export` returns everything the account owns, and
`DELETE /api/account` hard-deletes the user and cascades through their rows.

## Requirements

- **Node 22.5 or newer.** The database layer uses `node:sqlite`, which arrived in
  22.5.0; earlier releases cannot load the server module at all. No flag is needed on
  current releases (this tree was tested on Node 26.12.1). If an early 22.x build
  refuses to resolve `node:sqlite`, either add `--experimental-sqlite` or move to a
  newer release.
- **No external services.** The app starts with an empty environment: tailoring falls
  back to deterministic rules, plans and quotas are visible, and checkout answers 501
  until Stripe is configured.
- **A SQLite file on disk**, created on first boot at `<repo>/data/applywright.db`,
  together with its `-wal` and `-shm` companions. The directory is created if missing
  and is gitignored.
- Optional: `pdftotext` (Poppler) on `PATH` if you want to upload PDF CVs. Without it a
  PDF upload is refused with an explanatory warning rather than a crash.

## Quickstart

### Windows (PowerShell)

```powershell
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
npm install
Copy-Item .env.example .env.local
npm start
```

### Linux or WSL

```bash
cd /mnt/c/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright
npm install
cp .env.example .env.local
npm start
```

`npm start` runs `node server/index.js`. It prints the URL, the tailoring mode, the
database path and whether billing is configured:

```
  Applywright  ·  your CV, tailored for every job.

  URL        http://127.0.0.1:3160
  tailoring  deterministic rules (no MODEL_API_KEY)
  database   .../projects/applywright/data/applywright.db
  jobs       arbeitnow, remotive, remoteok
  billing    not configured (plans visible, checkout disabled)
```

Open `http://127.0.0.1:3160/` for the public pages, `/sign-up` to create the first
account, and `/app` for the product screens once you are signed in. `Ctrl+C` stops the
server and closes the database.

The public routes are `/`, `/how-it-works`, `/pricing`, `/about`, `/security`,
`/sign-in`, `/sign-up`, `/reset` and `/bookmarklet`, all served from `public/*.html`
through a small include and token renderer (`server/pages.js`) — except `/bookmarklet`,
which is rendered inline in `server/app.js` so it can substitute the public origin into
the bookmarklet.
`/app/*` is a single page: `public/app/app.html` plus `public/app/app.js` and `app.css`,
served as static files from `/app`. A page whose HTML file is missing does not error — the
route falls through to the 404 handler, so a wrong file name looks like a missing route.

The bookmarklet is **one artifact, two entry points**: `public/assets/bookmarklet.js`
(generated from the readable `bookmarklet.src.js`) is what both surfaces serve. Inside the
product, `/app` → Settings → *Browser capture · Install once; no sign-in* substitutes
`__ORIGIN__` with `location.origin` in the browser and is the primary install; the
server-rendered `/bookmarklet` page substitutes `__ORIGIN__` with `PUBLIC_URL` and is the
shareable one for someone who is not signed in. The artifact itself makes no network
calls.

Public sign-up is open by default. Set `REGISTRATION_OPEN=0` before exposing the app
publicly: sign-in keeps working and `POST /api/auth/register` answers `403
registration_closed`.

Account recovery does not need a mail server. `/reset` accepts either a recovery code
saved at sign-up (`POST /api/auth/recover`) or a single-use, expiring reset link issued on
the host (`POST /api/auth/forgot` records the token; the operator passes it on). A
signed-in session can also change the password, and `scripts/reset-password.mjs` is the
operator's last resort.

The visual system is hand-written CSS on the Meridian tokens: `public/assets/tokens.css`
(palette, type scale, primitives), `theme.css` (the product re-key and the dark scheme),
`motion.css`, `site.css` for the marketing pages and `public/app/app.css` for the product.
The dark theme is applied by `html[data-theme="dark"]` and set from `theme.js` in each
page head, so a saved preference does not flash. There is no CSS framework and no build
step.

## Configuration

Settings come from three places, in this order of precedence:

1. an `overrides` object passed to `loadConfig()` (tests only);
2. the process environment, but only when the variable is set to a non-empty value;
3. `.env.local`, then `.env` in the project root — the first file that exists is used,
   and the two are never merged.

Because an empty environment variable is skipped, `FOO=` on the command line does not
erase a value stored in `.env.local`. Number settings are clamped to their permitted
range rather than refused, so an out-of-range value silently becomes the nearest limit.

| Variable | Default | Behaviour when unset |
|---|---|---|
| `PORT` | `3160` | Listens on 3160. Clamped to 0–65535; `0` asks the OS for a free port. |
| `HOST` | `127.0.0.1` | Loopback only. Set `0.0.0.0` only if something in front of the app terminates TLS and you have deliberately chosen that. |
| `PUBLIC_URL` | `http://127.0.0.1:3160` | Scheme and host, no trailing slash. Read once at boot for the RSS feed's self-link and the Stripe success, cancel and portal return URLs; a wrong value sends paying customers to the wrong site. Set it to the proxy or tunnel origin. |
| `DATABASE_PATH` | `./data/applywright.db` in `.env.example` | **Not read by the config loader today.** The database is always `<repo>/data/applywright.db`; the variable is listed in `.env.example` but `server/config.js` resolves the path from the repo root. See [Limitations](#limitations). |
| `TRUST_PROXY` | `0` | `req.ip` is the socket address and `X-Forwarded-For` is ignored. `1` (or `true`/`yes`/`on`) trusts exactly one proxy hop, which also makes `X-Forwarded-Proto` decide `req.protocol`. |
| `SECURE_COOKIES` | `0` | The `aw_session` cookie is sent without `Secure`. `1` adds `Secure`, so the browser will only return it over HTTPS — correct behind a TLS proxy, wrong on plain `http://`. |
| `REGISTRATION_OPEN` | `1` | Public sign-up. `0`/`false`/`no`/`off` refuses `POST /api/auth/register` with `403 registration_closed`; sign-in, sessions and every other route keep working. Set it to `0` before exposing the app publicly and create accounts by invitation. |
| `MODEL_API_KEY` | empty | Tailoring stays on the deterministic rule-based rewriter and `mode` is `rules`. When set, one JSON-mode chat completion is made per pack. |
| `MODEL_BASE_URL` | `https://api.deepseek.com/v1` | The OpenAI-compatible base; `/chat/completions` is appended. Trailing slashes are stripped. |
| `MODEL_NAME` | `deepseek-chat` | Sent as the `model` field. |
| `MODEL_TIMEOUT_MS` | `60000` | Per-request timeout for the model call; clamped to 5000–300000. |
| `MODEL_MAX_TOKENS` | `2000` | `max_tokens` on the model call; clamped to 256–8192. |
| `MODEL_PROVIDER` | inferred | `anthropic` when `ANTHROPIC_ORG_API_KEY` is set, `openai` when `MODEL_API_KEY` is, `none` when neither is. Set it explicitly to force one route. |
| `ANTHROPIC_ORG_API_KEY` | empty | Routes tailoring through the Anthropic Messages client in `server/provider/anthropic.js` instead of the OpenAI-compatible one. Deliberately a separate variable: the loader never maps it onto `ANTHROPIC_API_KEY`. Also accepts `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, `ANTHROPIC_TIMEOUT_MS`, `ANTHROPIC_MAX_TOKENS`. Neither key is listed in `.env.example`. |
| `STRIPE_SECRET_KEY` | empty | Checkout answers 501 `not_configured`. Both Stripe secrets must be present for billing to count as configured. |
| `STRIPE_WEBHOOK_SECRET` | empty | Webhooks answer 501, and without it billing is not "configured" even if the secret key is set. |
| `STRIPE_PRICE_PRO_MONTHLY` | empty | `POST /api/billing/checkout` for `pro`/`month` answers 501 naming the missing price. |
| `STRIPE_PRICE_PRO_YEARLY` | empty | As above for `pro`/`year`. |
| `STRIPE_PRICE_SCALE_MONTHLY` | empty | As above for `scale`/`month`. |
| `STRIPE_PRICE_SCALE_YEARLY` | empty | As above for `scale`/`year`. |
| `AUTH_RATE_LIMIT_PER_MINUTE` | `10` | `register` and `login` get 10 requests a minute per IP, separate from the general budget; clamped to 1–1000. |
| `RATE_LIMIT_PER_MINUTE` | `120` | General API budget per IP per minute; clamped to 1–100000. |
| `MAX_BODY_BYTES` | `8388608` (8 MB) | JSON bodies above this are rejected with 413 `payload_too_large`; clamped to 16384–33554432. |
| `MAX_CV_BYTES` | `5242880` (5 MB) | Uploaded CV files above this are refused before extraction; clamped to 1024–20971520. The refusal message says "5 MB" because the default is what it was written for. |
| `JOB_FEED_LIMIT` | `60` | Ceiling on results per feed request, whatever `?limit=` asks for; clamped to 1–300. |
| `JOB_FEED_CACHE_MINUTES` | `15` | A feed response is reused for 15 minutes per identical query; `0` means every request re-fetches the boards. Clamped to 0–1440. |
| `ALERTS_SCAN_MINUTES` | `30` | No background alert scan runs. Otherwise the process checks due alerts on this interval in the same process; `0` disables it. Clamped to 0–1440. |
| `CONTACT_EMAIL` | `hello@applywright.example` | Substituted into pages as `{{CONTACT_EMAIL}}`. The contact form writes to `data/contact.jsonl` regardless. |

Model and Stripe credentials are the operator's responsibility: nothing in this
repository contains a key, and `.env.local`/`.env` are gitignored. Never put a key on a
command line — it lands in shell history and process listings.

## How scoring works

`server/lib/cv/score.js` scores a CV against one job description and is deterministic:
the same two texts always produce the same number. Five subscores carry fixed weights —
keywords 35, structure 20, achievements 20, readability 15, formatting 10 — and each
subscore's rule is documented in that module's own comments. There is no model call and no
network access in this path.

Every point is explained. The report returns `findings`, each with an `id`, a `severity`
(`high`, `medium` or `low`), a title, a detail that names the actual evidence ("Only 2 of
14 job keywords appear in your CV: …") and a `fix`, plus a short `advice` list.
`keywordCoverage` carries the `matched` and `missing` terms so a client can show them
rather than restate them.

`POST /api/analyse` also returns an `advisory` string: the rubric weights, a statement
that the score is not an employer's score and is sent to no employer, and that the
decision to apply is the user's. It is part of the response rather than the page so a
client cannot drop it silently.

Scores are stored with the CV and job they came from (`reports`), so a later comparison
is against the same inputs. `POST /api/tailor` also stores the score of the source CV
against that job on the application row.

## How tailoring stays grounded

`server/lib/cv/tailor.js` has two paths and one contract.

With `MODEL_API_KEY` set, it makes one JSON-mode completion that returns a summary,
rewritten bullets and a covering letter. The reply is schema-validated, and every
bullet's `original` must appear verbatim in the CV — a model that paraphrases the source
is editing the record, and is rejected. Each field is then checked by `assertGrounded`;
a field that fails is replaced by the rule-based output and the reason is recorded in
`warnings`. `mode` is `model` only when both the summary and the letter survive.

With no key, the rules path does real work rather than emitting a stub: it segments the
CV by heading, scores each bullet by keyword overlap with the description, orders them,
strips filler openers and "successfully", recasts a leading gerund as a past-tense verb,
builds a summary and a 150–220 word letter from the CV's own claims, and fills the four
screening answers.

Both paths run the same grounding check, and a final pass re-checks every bullet before
anything is returned. The rules are specific: a figure, percentage or currency amount
must appear in the bullet being rewritten (a metric belongs to the claim that earned it,
not to the CV as a whole); a new date range is refused; a named month must appear in the
CV or the job text; qualifications, job-title words and capitalised proper nouns are
checked against the CV. Placeholders that the profile cannot fill — notice period, right
to work, salary expectation — are returned as `to confirm` with a warning, never
invented.

Refinement uses the same discipline. `POST /api/applications/:id/refine` passes the pack
through `groundChanges`, which allows a rephrase, a re-order, a shortening or a
lengthening, and refuses a change that adds or loses a number, an employer, a title, a
date, a qualification or a name; a rejected change is reverted and named in `warnings`
rather than shipped.

## The pack

`server/lib/packs/build.js` turns the tailored output into a pack:

- `cvHtml` — a complete standalone document with inline print CSS: A4, 18 mm margins,
  one column, real headings and lists, no layout tables, no icon fonts, no images and
  no external URLs. It survives a copy-paste into Word and parses in an ATS.
  `GET /api/applications/:id/cv` serves it as `text/html` with `cache-control: no-store`.
- `cvTextPlain`, `coverLetterMd`, `answers` (the four screening questions in a fixed
  order) and `filenameBase`.

## Plans and quotas

The numbers below are `server/lib/billing/plans.js`, which is the table the server
enforces and `GET /api/billing/plans` returns. Prices exclude VAT, are charged in GBP, and
are reported in pence by the API.

| Plan | Price | CVs | Tailored packs / month | Alerts | Job feed | Declared features |
|---|---|---|---|---|---|---|
| Free | £0 | 1 | 3 | 1 | 40 results/day | — |
| Pro | £19 / month, £190 / year | 5 | 60 | 10 | unlimited | full ATS report, covering letters, pack history, daily digest |
| Scale | £49 / month, £490 / year | unlimited | unlimited | 50 | unlimited | all of Pro, plus API access, priority refresh, bulk export |

Annual is ten months for twelve. Cancel anytime; downgrading keeps existing packs
readable.

Four quotas are enforced — `cvs`, `packs`, `alerts` and `jobResultsPerDay` — and
exceeding one returns 402 `quota_exceeded` with the next plan in the body
(`error.upgrade`) and in an `upgrade` response header. The "declared features" column is
exactly that: declared. Those flags are returned by the API but nothing gates on them
today, so a covering letter is produced on every plan, `GET /api/export` is open to every
plan, and there is no separate API-key authentication behind "API access". See
[Limitations](#limitations).

## API summary

All routes live under `/api` except the RSS feed. Authentication is a cookie session
(`aw_session`, HttpOnly, `SameSite=Lax`, 30 days). Every mutation must come from the
same host: the `Origin` header, when sent, must match `Host`, or the request is refused
with 403. Errors are `{ "error": { "code", "message" } }`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | no | Create an account; sets the cookie. Password minimum 10 characters. |
| `POST` | `/api/auth/login` | no | Sign in; sets the cookie. |
| `POST` | `/api/auth/logout` | no | Delete the session row and clear the cookie. |
| `GET` | `/api/auth/me` | yes | User, plan, usage, entitlements and whether a model is live. |
| `GET` | `/api/cvs` | yes | The CV library, with a short preview of each. |
| `POST` | `/api/cvs` | yes | Add a CV from `text`, or from `filename` + `contentBase64`. |
| `GET` | `/api/cvs/:id` | yes | One CV including its text and segmented profile. |
| `PATCH` | `/api/cvs/:id` | yes | Rename, or make primary. |
| `DELETE` | `/api/cvs/:id` | yes | Delete a CV. |
| `POST` | `/api/analyse` | yes | Score a CV against `jobText` or `jobId`; stores a report and returns the advisory text. |
| `GET` | `/api/reports` | yes | Recent reports for the account. |
| `POST` | `/api/tailor` | yes | Build a pack; stores an application with status `pack_ready`. |
| `GET` | `/api/applications` | yes | The queue, with the status list. |
| `GET` | `/api/applications/:id` | yes | One application including its stored pack. |
| `PATCH` | `/api/applications/:id` | yes | Change status or notes. |
| `DELETE` | `/api/applications/:id` | yes | Delete an application. |
| `GET` | `/api/applications/:id/cv` | yes | The print-ready CV as `text/html`. |
| `POST` | `/api/applications/:id/refine` | yes | Apply one instruction ("shorter summary", "less formal") to a stored pack; rebuilds the printable CV and appends the change. |
| `GET` | `/api/connectors` | yes | The import connectors this build offers. |
| `POST` | `/api/connectors/linkedin` | yes | Parse LinkedIn profile text you paste — clipboard copy or a PDF you exported. |
| `POST` | `/api/cvs/from-profile` | yes | Turn a parsed profile into a CV; counts against the CV quota. |
| `GET` | `/api/style` | yes | Voice analysis of a CV, plus a 0–100 match badge against the latest tailored summary. |
| `GET` | `/api/jobs` | yes | Feed search: `query`, `location`, `remote=1`, `limit`. Returns `sources` errors and `cached`. |
| `POST` | `/api/jobs/capture` | yes | Parse a posting you paste (`url` plus `html` or `text`). LinkedIn, Indeed and Glassdoor URLs are refused with the reason. |
| `GET` | `/api/jobs/:id` | yes | One cached job. |
| `GET` | `/api/alerts` | yes | Saved searches. |
| `POST` | `/api/alerts` | yes | Create an alert (`name`, `keywords`, optional `locations`, `remoteOnly`, `minSalary`, `cadence`). |
| `PATCH` | `/api/alerts/:id` | yes | Edit or deactivate. |
| `DELETE` | `/api/alerts/:id` | yes | Delete. |
| `POST` | `/api/alerts/run` | yes | Run every active alert now, whatever its cadence, and create notifications for matches. |
| `GET` | `/api/notifications` | yes | Inbox; `?unread=1` filters. Also returns the RSS feed token. |
| `POST` | `/api/notifications/:id/read` | yes | Mark one read. |
| `GET` | `/feed/:token.rss` | token | RSS 2.0 of the account's notifications. |
| `GET` | `/api/billing/plans` | yes | Plans, prices and `stripeConfigured`. |
| `POST` | `/api/billing/checkout` | yes | Create a Stripe Checkout session; 501 when unconfigured. |
| `POST` | `/api/billing/portal` | yes | Create a Stripe customer-portal session; 501 when unconfigured. |
| `POST` | `/api/billing/webhook` | signature | Stripe events, verified against `STRIPE_WEBHOOK_SECRET`. |
| `GET` | `/api/export` | yes | Everything the account owns, as a JSON download. |
| `DELETE` | `/api/account` | yes | Hard delete; requires the password. |
| `GET` | `/api/health` | no | `status`, `version`, `provider` (`live`/`rules`), `sources`, `stripe`, job count, uptime. |
| `POST` | `/api/contact` | no | Contact form; appends to `data/contact.jsonl`. A filled `website` honeypot field is accepted and discarded. |

Import is bring-your-own-copy. `POST /api/connectors/linkedin` parses text you already
hold — the clipboard copy of your own profile, or the text layer of a PDF you exported. It
does not fetch a URL, is not presented as an OAuth integration, and imports nothing except
the string handed to it: LinkedIn's API does not return a member's career history to
third-party applications, and scraping breaches its terms. `POST
/api/applications/:id/refine` takes one instruction (3 to 500 characters), re-checks every
changed string against the CV, rebuilds the printable CV, and appends the instruction and
its changes to the application's `refinements` list. With no model key it applies the
deterministic rules in `server/lib/cv/refine.js` and reports `mode: "rules"`.

Job rows returned by `GET /api/jobs` carry an `attribution` field naming the board.
Remotive, Remote OK and Arbeitnow all make credit a condition of using their feed, so the
label travels with every job rather than being added by the client.

Rate limits are per IP: 10 requests a minute on `register`/`login`, 120 on everything
else. Every API response carries `x-ratelimit-limit` and `x-ratelimit-remaining`, and a
refused request carries `retry-after` with status 429.

## Tests and the static check

```bash
node --test tests/                       # HTTP and storage suites
node --test server/lib server/provider   # module suites beside the code
node scripts/check.js                    # static check over pages and server sources
```

`node --test` discovers two kinds of suite: the module tests beside the code
(`server/lib/**/*.test.mjs`, plus `server/provider/*.test.mjs`) and the HTTP and storage
suites in `tests/` — `spine.test.js` for the schema, store and password layer, plus one
`*.test.js` file per API area. The HTTP suites call `startServer()` with an ephemeral port,
a temporary SQLite file and a blank model key, so a run binds loopback, never reaches the
internet and never touches `data/`. The gate runs the two suites separately so a module
failure surfaces on its own; `node --test` with no argument runs both.

`node scripts/check.js` performs the checks the test suite cannot. It walks every page
under `public/` except the `public/partials/` includes and asserts: exactly one `<h1>` per
page, a `lang` attribute and a viewport meta, includes and asset references that resolve, no
inline script and no inline event handler (the CSP forbids both), no remote resource loaded
by an `img`, `script`, `link`, media or frame tag, no placeholder link and no TODO marker,
no hype vocabulary, no obvious literal credential and no `eval`. It exits non-zero on an
error; `--strict` also fails on warnings.

All three are fast enough to run on every change, and the exit code is the answer. This
file deliberately quotes no test count; the measured numbers at the last handoff, and the
commands to reproduce them, are in [docs/PROJECT-STATUS.md](docs/PROJECT-STATUS.md) §7.

## Seeding a demo account

With the server running on `http://127.0.0.1:3160`:

```bash
node scripts/seed.mjs
```

The script talks to the public HTTP API rather than writing the database, so it also
exercises the real endpoints. It creates (or signs in to) `demo@applywright.example` with
password `demo-password-123`, adds one CV, analyses it against a job description, builds
three tailored packs with different statuses, and creates one saved search. It prints
the score and `mode` of each pack as it goes.

Two overrides are useful:

```bash
node scripts/seed.mjs https://applywright.example.com
BASE_URL=http://127.0.0.1:3160 SEED_EMAIL=demo2@applywright.example node scripts/seed.mjs
```

In PowerShell, set the variables first instead of prefixing the command:

```powershell
$env:SEED_EMAIL = 'demo2@applywright.example'
node scripts/seed.mjs
```

The free plan allows three packs a month and the seed creates exactly three, so a second
run against the same account in the same month stops at the first tailor call with 402
`quota_exceeded`. Use a different `SEED_EMAIL`, or wait for the month to turn.

## Project layout

```
server/
  index.js            entry point: start, banner, SIGINT/SIGTERM shutdown
  app.js              routes, headers, rate limits, quotas, billing, webhook
  alerts-runner.js    alert execution, shared by the route and the scanner
  config.js           environment and .env.local/.env loading, clamping, defaults
  db.js               schema, forward-only migrate(), WAL and pragmas
  store.js            every SQL statement, prepared once
  auth.js             scrypt hashing, sessions, cookie, same-origin check
  model.js            OpenAI-compatible chat client; null when no key is set
  pages.js            small include/token renderer for public/*.html
  util.js             ids, error envelope, input assertions
  lib/
    text.js           tokenising, keyword extraction and coverage, sha256, slugs
    cv/extract.js     txt/md/docx parsing; PDF via pdftotext when present
    cv/score.js       the 0-100 report and its findings
    cv/tailor.js      grounding check, rules rewriter, model path
    cv/style.js       voice analysis and a match badge for a rewrite
    cv/refine.js      instruction-driven refinement, grounded by groundChanges
    connectors/       import registry and the LinkedIn text parser
    jobs/sources.js   Arbeitnow, Remotive and Remote OK normalisers and fetcher
    jobs/capture.js   JSON-LD and per-board parsers for a pasted posting
    jobs/match.js     alert rule matching and profile scoring
    packs/build.js    ATS-safe CV HTML, plain text, letter, screening answers
    billing/plans.js  plans, entitlements, prices, stripeConfigured()
public/
  index.html          marketing pages, one file per route in the PAGES map
  sign-in.html        auth pages, served from public/assets/auth.js
  partials/           nav and footer includes, expanded by server/pages.js
  assets/             tokens.css, theme.css, motion.css, site.css, auth.css, JS, the
                      bookmarklet (source + artifact) and the favicon
  app/                the signed-in single page: app.html, app.js, app.css
scripts/              check.js (static check), seed.mjs (demo), browser-preview.mjs
tests/                spine.test.js plus one HTTP suite per API area
screenshots/          PNGs written by scripts/browser-preview.mjs
docs/                 SPEC.md and the handoff set (PROJECT-STATUS.md,
                      IMPLEMENTATION-PLAN.md, PIPELINE.md, VAULT-PATCH.md),
                      DEPLOY/DOMAIN/SHARE/LINKEDIN-CAPTURE, design/ and research/ notes
data/                 SQLite database, WAL files, contact.jsonl (gitignored)
```

`docs/SPEC.md` is the product specification and the contract the modules were built
against. `docs/DEPLOY.md` is the hosting runbook.

## Browser preview

```bash
npm start                          # one shell: the server must be running
node scripts/browser-preview.mjs   # another
```

`scripts/browser-preview.mjs [baseUrl]` launches headless Chrome or Edge, signs in as the
demo account through the real API, walks the product routes (`/app`, `/app/cv`,
`/app/jobs`, `/app/applications`, `/app/alerts`, `/app/billing`), writes a PNG per route
into `screenshots/`, and reports console errors and horizontal overflow. It talks to the
browser over the DevTools protocol on port 9333 and needs no npm dependency, but it does
need a running server, the seeded demo account and a local Chrome or Edge install — it
probes the standard Windows paths. It is a local verification tool, not part of
`node --test`.

## Where the data lives

```
data/applywright.db        users, sessions, CVs, jobs, reports, applications, alerts,
                           notifications, usage, settings, schema version
data/applywright.db-wal    write-ahead log: recent commits live here until checkpoint
data/applywright.db-shm    shared-memory index for the WAL
data/contact.jsonl         one JSON line per contact-form submission
```

The database opens with `PRAGMA journal_mode = WAL`, `foreign_keys = ON` and
`busy_timeout = 5000`. WAL is why a backup must not be a bare copy of `applywright.db`
while the server is running: commits that have not been checkpointed are in the `-wal`
file, so copying only the database silently drops the most recent writes.

Two safe backups. The first runs against a live server and produces one database file; the
second archives the whole directory, which also captures `contact.jsonl`.

```bash
# while the server runs — SQLite's online backup API writes one consistent file
sqlite3 data/applywright.db ".backup '/var/backups/applywright/applywright-$(date +%F).db'"

# offline — stop the server, then archive the directory: database, WAL and contact.jsonl
tar -czf "/var/backups/applywright/data-$(date +%F).tar.gz" -C . data
```

On Windows, stop the server first and copy the whole `data` directory:

```powershell
Compress-Archive -Path .\data -DestinationPath "D:\backups\applywright-$(Get-Date -Format yyyy-MM-dd).zip"
```

To restore, stop the server, delete any `applywright.db-wal` and `applywright.db-shm`
left beside the target (a stale WAL applied to a restored database is how a restore
turns into data loss), put the backup in place, and start the server. `data/` is
gitignored and holds CV text and application history, so treat copies as personal data.

## Limitations

These are current, verified against the code, and worth knowing before you rely on
anything.

- **Rule-based tailoring without a model key.** With `MODEL_API_KEY` empty the rewriter
  is deterministic and conservative: it re-orders, tightens and reuses the CV's own
  wording. It will not produce a fluent rewrite of a clumsy bullet, and the covering
  letter is assembled from the CV's sentences rather than written. `mode` in the API
  response tells you which path ran.
- **No email delivery.** Alerts create rows in `notifications` and appear in the RSS
  feed. Nothing is sent by email or SMS, and no mail library is present.
- **The alert scan lives inside the web process.** `server/alerts-runner.js` starts one
  interval when the server boots and checks due alerts every `ALERTS_SCAN_MINUTES`
  (default 30); `manual`-cadence alerts never run on their own. Consequences worth
  knowing: the timer stops when the process stops, a restart re-arms it, and two
  instances would scan twice. `POST /api/alerts/run` runs every active alert immediately,
  whatever its cadence, which is what you want after a restart or a feed outage. The Pro
  "daily digest" flag is still declared only: there is no digest message.
- **No auto-submit and no scraping.** Deliberate, as described at the top. Statuses
  change only when you change them.
- **Single process.** Rate-limit buckets, the job-feed cache and the alert scanner all
  live in the process, and SQLite has one writer. Two instances behind a proxy would each
  enforce their own limits, pay for their own fetches and scan the same alerts. Run one.
- **`DATABASE_PATH` does not move the database.** The variable is documented in
  `.env.example` and ignored by `server/config.js`, which resolves `<repo>/data/applywright.db`.
  To relocate the data, move the whole checkout or use a bind mount at `data/`.
- **Plan features beyond the four quotas are declared, not enforced.** Covering letters,
  exports and the ATS report are produced on every plan; "API access" has no key
  authentication behind it.
- **PDF upload needs `pdftotext`.** Without Poppler on `PATH`, a PDF is refused with a
  warning rather than parsed.
- **Rate limits apply to mutations.** Every API response carries the limit headers, but
  the 429 is only returned for auth endpoints and non-GET requests; a plain GET is
  counted and never refused.
- **Stripe billing is untested against live Stripe here.** Checkout, the price mapping
  and the webhook signature check are implemented and refuse cleanly when unconfigured,
  but no live keys were used in this tree. Confirm both flows against your own account
  before charging anyone.
