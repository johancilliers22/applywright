# Applywright — project status (cold-start brief)

*Canonical brief. If you read one file before touching this project, read this one.*
Last verified: 2026-10-28 against this checkout. Every number here was measured, and
the commands to measure it again are in §7. The tree is being written by several agents
in parallel, so re-run those commands before trusting a number.

---

## 0. Where it is, and what kind of thing it is

- **Path:** `C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright`
- **It is its own git repository** — `master`, initial commit
  `bc6731dfe734a5167a9579b8e4de98e5ef830629` ("Applywright: CV scoring, grounded
  tailoring, job tracking and alerts"), 126 tracked files, **no remote and nothing
  pushed**. Git and delivery detail: [`PIPELINE.md`](PIPELINE.md).
- **It is NOT a hub package.** The hub `.gitignore:66` ignores `projects/*/`; `git
  check-ignore -v projects/applywright/docs/SPEC.md` in the hub returns that rule, so
  the project is invisible to the hub repo. No hub commit is involved and no checkout
  move was needed.
- **Owner:** Johan. Built by a short-lived multi-agent team against
  [`SPEC.md`](SPEC.md); several agents were still active when this brief was written.

**Reading order for a cold orchestrator:**
this file → [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) (what is done, what is
next) → [`PIPELINE.md`](PIPELINE.md) (branch, commit, verify, push). The product
contract is [`SPEC.md`](SPEC.md). Hosting is [`DEPLOY.md`](DEPLOY.md),
[`DOMAIN.md`](DOMAIN.md) and [`SHARE.md`](SHARE.md).

---

## 1. What the product is

Applywright turns one CV into a tailored application for every job worth applying to,
and keeps the paperwork straight while you do it.

Company **Intelligent Artificial**; tagline *Your CV, tailored for every job.*
Positioning: an application workspace for people who are serious about a search, not a
spray-and-pray bot.

The loop: ingest a CV → score it against one job description → rewrite the summary,
bullets and skills line using only facts already in the CV → build a print-ready,
ATS-safe pack (CV, covering letter, four screening answers) → track each application
through its statuses → poll saved searches against three public job boards and drop
matches into an inbox plus an RSS feed.

### The three things it refuses to do

These are design decisions with code behind them, not omissions.

| Refusal | What the code actually does | Why |
|---|---|---|
| **No LinkedIn scraping, no background crawling** | `POST /api/jobs/capture` refuses `linkedin.com`, `indeed.com` and `glassdoor` URLs with the reason in the response. Capture is always user-initiated: you paste the URL and the page text or HTML. The only outbound reads are the three public job APIs and Stripe, if configured. The connector parses text you already hold; there is no OAuth and no fetch. | Those sites' terms forbid automated access and re-publication; scraping gets accounts restricted and yields data the site did not intend to publish. |
| **No automated submission** | No code posts an application or fills an employer's form. A pack ends at status `pack_ready`; the human clicks apply on the employer's own page and records the outcome. Statuses change only when a person changes them. | An application is a statement in your name. Third-party submission is what produces fraudulent applications at scale. |
| **No fabricated experience** | Tailoring is grounded rewriting. `assertGrounded` in `cv/tailor.js` rejects a rewrite that introduces an unverified number, currency amount, employer, job title, date range, qualification or proper noun; the bullet is replaced with the CV's own wording and the reason is returned in `warnings`. Refinement runs the same discipline through `groundChanges` in `cv/refine.js`. | An invented metric is a false claim, and it is the first thing a careful interviewer checks. |

The same discipline covers retention: CV text is stored as text and never as the raw
uploaded binary; `GET /api/export` returns everything the account owns; `DELETE
/api/account` hard-deletes and cascades.

---

## 2. Stack

- **Node 22.5 or newer** — required, because the database layer is `node:sqlite`
  (`DatabaseSync`). This tree was tested on **v26.12.1**. No flag is needed on current
  releases; an early 22.x build that refuses to resolve `node:sqlite` needs
  `--experimental-sqlite`.
- **Express 5** (`express@^5.1.0`) — the only runtime dependency.
- **SQLite via `node:sqlite`** — one file at `data/applywright.db`, WAL mode.
- **Hand-written CSS, zero build step, zero frameworks.** No bundler, no transpiler,
  no CSS framework, no client framework. Files are served as written:
  `public/assets/tokens.css`, `theme.css`, `site.css`, `motion.css`, `auth.css`; the
  product SPA is `public/app/app.html` + `app.css` + `app.js` (vanilla).
- **Server-side sessions** in SQLite; `aw_session` cookie, `HttpOnly`, `SameSite=Lax`,
  30 days; scrypt password hashing (N=16384), minimum 10 characters.
- **One process.** Rate-limit buckets, the job-feed cache and the alert scanner all
  live in process; SQLite has one writer. Run exactly one instance.
- **126 tracked files**, no `devDependencies` (no axe-core, no Playwright in
  `package.json`; `browser-preview.mjs` drives Chrome over the DevTools protocol with no
  npm package).

---

## 3. How to run it

```powershell
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
npm install
Copy-Item .env.example .env.local   # optional; the app runs on defaults
npm start                            # = node server/index.js
```

```bash
# Linux / WSL, from the same checkout
npm install && cp .env.example .env.local && npm start
```

- **Port 3160 on `127.0.0.1` only** by default (`PORT`, `HOST`). The banner prints the
  URL, the tailoring mode (`live model` / `deterministic rules`), the database path and
  whether Stripe is configured.
- **Configuration precedence:** an `overrides` object passed to `loadConfig()` (tests
  only) → the process environment, but only when the variable is non-empty →
  `.env.local`, then `.env` in the project root (the first file that exists is used;
  the two are **never merged**).
- **Nothing is required to boot.** With an empty environment: tailoring falls back to
  the deterministic rules rewriter, plans and quotas are visible, checkout answers 501,
  and job feeds work without a key.
- **Optional model.** Set `MODEL_API_KEY` (OpenAI-compatible: `MODEL_BASE_URL`,
  `MODEL_NAME`, defaults point at DeepSeek) to turn on the model tailoring path. Set
  `ANTHROPIC_ORG_API_KEY` to route through `server/provider/anthropic.js` instead;
  `MODEL_PROVIDER` forces the choice. With neither, `mode` is `rules`.
- **`REGISTRATION_OPEN`** (`server/config.js`, enforced at `POST /api/auth/register`) —
  defaults to `1`/open. Set `REGISTRATION_OPEN=0` when the app is exposed publicly and
  only invited accounts should exist: sign-in keeps working, new sign-ups are refused
  with `403 registration_closed`. This is the switch that closes public sign-up.
- **Optional external extractors.** Format coverage is `.txt`, `.md`, `.docx`, `.odt`,
  `.rtf`, `.html`/`.htm`/`.xhtml`, `.pdf`, and images for OCR; legacy binary `.doc` is
  refused with "save as `.docx` first". PDF and image text need a real tool, and
  `server/lib/cv/extract.js` tries the native `PATH` first, then falls back to
  `wsl -e <tool>`. **On this PC the working PDF route is the WSL fallback**: `pdftotext`
  is at `/usr/bin/pdftotext` and absent from the Windows `PATH`, so PDFs are read through
  `wsl -e pdftotext`. **Tesseract is not installed anywhere on this machine**, so image
  uploads are refused with the install command rather than half-read. See §9.
- **First screens:** `/` public pages, `/sign-up` to create an account, `/app` the
  product once signed in, `/bookmarklet` the browser-capture install page.

The full environment table, with defaults and clamping ranges, is in
[`README.md`](../README.md#configuration) and `.env.example`. One trap worth knowing
here: **`DATABASE_PATH` is listed in `.env.example` but is not read** —
`server/config.js` always resolves `<repo>/data/applywright.db`.

---

## 4. Route map

All routes except the RSS feed live under `/api`. Errors are
`{ error: { code, message } }`. Every mutation requires the `Origin` host to match
`Host`. Rate limits are per IP: 10/min on `register`+`login`, 120/min elsewhere, with
`x-ratelimit-*` headers and `retry-after` on 429. `Auth` below means the `aw_session`
cookie.

### Auth

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | no | Create an account; sets the cookie; 403 when `REGISTRATION_OPEN=0` |
| `POST` | `/api/auth/login` | no | Sign in; sets the cookie |
| `POST` | `/api/auth/logout` | no | Delete the session row and clear the cookie |
| `GET` | `/api/auth/me` | yes | User, plan, usage, entitlements, whether a model is live |
| `POST` | `/api/auth/change-password` | yes | Change the password from a signed-in session; clears pending resets |
| `POST` | `/api/auth/recover` | no | Sign in with a recovery code saved at sign-up (works offline, once per code) |
| `POST` | `/api/auth/forgot` | no | Request a reset link; recorded for the operator because there is no mail transport |
| `POST` | `/api/auth/forgot-username` | no | Recover the account's email/username; same operator-side delivery |
| `POST` | `/api/auth/reset` | token | Consume a single-use, expiring reset token and set a new password |

### CVs

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/cvs` | yes | The library, with a short preview of each |
| `POST` | `/api/cvs` | yes | Add from `text`, or `filename` + `contentBase64` |
| `GET` | `/api/cvs/:id` | yes | One CV including its text and segmented profile |
| `PATCH` | `/api/cvs/:id` | yes | Rename, or make primary |
| `DELETE` | `/api/cvs/:id` | yes | Delete |
| `POST` | `/api/cvs/from-profile` | yes | Turn a parsed connector profile into a CV; counts against the CV quota |

### Analyse and tailor

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/analyse` | yes | Score a CV against `jobText` or `jobId`; stores a report; returns the advisory text |
| `GET` | `/api/reports` | yes | Recent reports for the account |
| `POST` | `/api/tailor` | yes | Build a pack; stores an application at status `pack_ready` |
| `POST` | `/api/applications/:id/refine` | yes | Apply one instruction (3–500 chars) to a stored pack; rebuilds the printable CV; logged in `refinements` |

### Jobs

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/jobs` | yes | Feed search: `query`, `location`, `remote=1`, `limit`; returns `sources` errors and `cached` |
| `POST` | `/api/jobs/capture` | yes | Parse a pasted posting (`url` + `html`/`text`); refuses LinkedIn, Indeed and Glassdoor |
| `GET` | `/api/jobs/:id` | yes | One cached job |

### Applications

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/applications` | yes | The queue, with the status list |
| `GET` | `/api/applications/:id` | yes | One application including its stored pack |
| `PATCH` | `/api/applications/:id` | yes | Change status or notes |
| `DELETE` | `/api/applications/:id` | yes | Delete |
| `GET` | `/api/applications/:id/cv` | yes | The print-ready CV as `text/html`, `cache-control: no-store` |

### Connectors and style

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/connectors` | yes | The import connectors this build offers |
| `POST` | `/api/connectors/linkedin` | yes | Parse LinkedIn profile text you paste (clipboard copy or your own PDF export) |
| `GET` | `/api/style` | yes | Voice analysis of a CV plus a 0–100 match badge against the latest tailored summary |

### Alerts, notifications and feed

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/alerts` | yes | Saved searches |
| `POST` | `/api/alerts` | yes | Create one (`name`, `keywords`, optional `locations`, `remoteOnly`, `minSalary`, `cadence`) |
| `PATCH` | `/api/alerts/:id` | yes | Edit or deactivate |
| `DELETE` | `/api/alerts/:id` | yes | Delete |
| `POST` | `/api/alerts/run` | yes | Run every active alert now, whatever its cadence |
| `GET` | `/api/notifications` | yes | Inbox; `?unread=1` filters; also returns the RSS feed token |
| `POST` | `/api/notifications/:id/read` | yes | Mark one read |
| `GET` | `/feed/:token.rss` | token | RSS 2.0 of the account's notifications; self-link built from `PUBLIC_URL` |

### Billing

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/billing/plans` | yes | Plans, prices in pence, `stripeConfigured` |
| `POST` | `/api/billing/checkout` | yes | Create a Checkout session; 501 when unconfigured |
| `POST` | `/api/billing/portal` | yes | Stripe customer-portal session; 501 when unconfigured |
| `POST` | `/api/billing/webhook` | signature | Stripe events, verified against `STRIPE_WEBHOOK_SECRET` |

### Account, health, contact

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/export` | yes | Everything the account owns, as a JSON download |
| `DELETE` | `/api/account` | yes | Hard delete; requires the password |
| `GET` | `/api/health` | no | `status`, `version`, `provider` (`live`/`rules`), `sources`, `stripe`, job count, uptime |
| `POST` | `/api/contact` | no | Contact form; appends to `data/contact.jsonl`; `website` honeypot accepted and discarded |

### Pages and static

| Route | Serves |
|---|---|
| `/`, `/how-it-works`, `/pricing`, `/about`, `/security`, `/sign-in`, `/sign-up`, `/reset` | `public/*.html` through the include/token renderer in `server/pages.js` |
| `/bookmarklet` | Server-rendered install page; substitutes `__ORIGIN__` with `PUBLIC_URL` and serves the bookmarklet as selectable text. 200, no sign-in required |
| `/app/*` | The signed-in SPA shell: `public/app/app.html` + `app.js` + `app.css` |
| `/assets/*` | Static CSS/JS/favicon, `cache-control: no-cache` |
| `/favicon.ico` | 301 to `/assets/favicon.svg` |

There are **two bookmarklet install surfaces reading the same single artifact**
`public/assets/bookmarklet.js` (no network calls of its own). They are one deliverable
with two entry points, not duplication:

1. **In-product (primary):** `/app` → Settings → *Browser capture · Install once; no
   sign-in* — substitutes `__ORIGIN__` with `location.origin` in the browser.
2. **Shareable:** `GET /bookmarklet` — substitutes `__ORIGIN__` with `PUBLIC_URL`
   server-side, for someone who is not signed in.

---

## 5. Module map

`docs/SPEC.md` is the contract; it names each module's exported signature and its
acceptance requirements (§5), and `server/lib/text.js` (§4) is the shared vocabulary
every module imports. Per `SPEC.md` §8 the Lead owned `server/*` and each `lib` module
was built by a named agent against its SPEC section. **If a module and SPEC disagree,
SPEC wins** — or the disagreement is a bug to report, not to quietly follow.

| Module | One line | Contract |
|---|---|---|
| `server/lib/text.js` | Tokenise, normalise, extract weighted keywords, keyword coverage, `sha256`, `slugify`, `pct`. Deterministic. | SPEC §4 |
| `server/lib/cv/extract.js` | `extractText`/`segmentSections`/`detectFormat`: `.txt`, `.md`, `.docx` and `.odt` (zip central directory parsed with `node:zlib`, no dependency), `.rtf` and HTML stripped in-process, PDF via `pdftotext` and images via `tesseract` — native `PATH` first, then `wsl -e`. Returns warnings, never throws on malformed input. | SPEC §5 `cv/extract.js` |
| `server/lib/cv/score.js` | Deterministic 0–100 score against one job description. Five fixed subscores: keywords 35, structure 20, achievements 20, readability 15, formatting 10. Every point is explained by a named finding with a fix. | SPEC §5 `cv/score.js` |
| `server/lib/cv/tailor.js` | Two paths, one contract: one JSON-mode model call, or the deterministic rules rewriter. Both run `assertGrounded`; a field that fails is replaced with the CV's own wording and the reason is recorded. Returns `mode: 'model' \| 'rules'`. | SPEC §5 `cv/tailor.js` |
| `server/lib/cv/refine.js` | One instruction applied to a stored pack. `groundChanges` allows a rephrase, re-order, shortening or lengthening and refuses a change that adds or loses a number, employer, title, date, qualification or name; rejected changes are reverted and named. | SPEC §5 (tailoring discipline) |
| `server/lib/cv/style.js` | Voice analysis of a CV plus a 0–100 match badge for a rewrite. | SPEC §5 (style) |
| `server/lib/connectors/index.js` | Connector registry: `linkedin-paste`, `linkedin-export`, `cv-file`, `profile-manual`, `job-paste`, `job-link`. Every connector is user-initiated; no OAuth. | SPEC §5 (connectors) |
| `server/lib/connectors/linkedin.js` | Parser for LinkedIn profile text the user pastes. No fetch. Warns when a section is missing rather than saving a thin profile quietly. | SPEC §5 (connectors) |
| `server/lib/jobs/sources.js` | Arbeitnow, Remotive and Remote OK fetchers plus normalisers. 6 s timeout per source, one source may fail, dedupe by `sha256(company\|title\|location)`, description capped at 8 000 chars, injectable `fetchImpl` so tests use fixtures. | SPEC §5 `jobs/sources.js` |
| `server/lib/jobs/capture.js` | Parses a pasted posting: schema.org `JobPosting` JSON-LD first (the reliable path), then Greenhouse, Lever, Workable, Ashby, Workday. Returns `confidence` and `warnings`. Refuses the blocked hosts. | SPEC §5 `jobs/capture.js` |
| `server/lib/jobs/match.js` | `matchRule` for saved searches (keywords, locations, `remoteOnly`, `minSalary`) and `scoreJobForProfile`. Unknown salary does not match, and says so. | SPEC §5 `jobs/match.js` |
| `server/lib/packs/build.js` | `buildPack`: standalone ATS-safe CV HTML (A4, 18 mm margins, one column, real headings, no layout tables, no icon fonts, no images, no external URLs, inline print CSS), plain text, covering-letter Markdown, four screening answers. | SPEC §5 `packs/build.js` |
| `server/lib/billing/plans.js` | `PLANS`, `entitlements`, `can`, `priceFor`, `stripeConfigured()`. Four quotas are enforced (`cvs`, `packs`, `alerts`, `jobResultsPerDay`); the capability flags are declared only (§9). | SPEC §5 `billing/plans.js` |
| `server/provider/anthropic.js` | Anthropic Messages client for the `ANTHROPIC_ORG_API_KEY` route, alongside the OpenAI-compatible client in `server/model.js`. Never maps the org key onto `ANTHROPIC_API_KEY`. | SPEC §5 (model path) |

Supporting server files, all Lead-owned: `index.js` (entry, banner, signals),
`app.js` (routes, headers, limits, billing, webhook), `config.js` (env loading and
clamping), `db.js` (schema, forward-only `migrate()`), `store.js` (every SQL statement,
prepared once), `auth.js` (scrypt, sessions, cookie, same-origin check), `model.js`,
`pages.js`, `util.js`, `alerts-runner.js` (shared by the route and the in-process
scanner).

---

## 6. Data model

SQLite, one file `data/applywright.db` (plus `-wal` and `-shm`), `PRAGMA journal_mode =
WAL`, `foreign_keys = ON`, `busy_timeout = 5000`. Schema version 1, forward-only and
idempotent on every boot (`server/db.js`).

Eleven tables: `users`, `sessions`, `cvs`, `jobs`, `reports`, `applications`, `alerts`,
`notifications`, `usage`, `settings`, and `meta` (schema version). Every table carries
`user_id` except `users` and `jobs` — `jobs` is a shared cache keyed by a UNIQUE
`dedupe_hash`. Deleting a user cascades through their rows.

- Application statuses: `pack_ready` → `approved` → `submitted` → `interview` →
  `rejected` → `offer`, plus `withdrawn`.
- The pack is stored as JSON on the application row (`pack_json`); a refinement history
  accumulates beside it. Reports store the score with the CV and job they came from.
- Indexes: `jobs(fetched_at)`, `jobs(source)`, `applications(user_id, updated_at)`,
  `notifications(user_id, read_at)`, `usage(user_id, feature, at)`,
  `sessions(expires_at)`, `reports(user_id, created_at)`, `cvs(user_id, created_at)`.
- `data/contact.jsonl` is one JSON line per contact-form submission. `data/` is
  gitignored and holds CV text and application history — treat copies as personal data.
- **Backups:** WAL means a bare copy of `applywright.db` while the server runs silently
  drops recent writes. Use SQLite's online `.backup`, or stop the server and archive the
  whole `data/` directory. See `README.md` § "Where the data lives".

---

## 7. Verification

Three commands are the gate. Run all three from the project root.

| Command | What it covers | Measured 2026-10-28 |
|---|---|---|
| `node --test tests/` | The HTTP and storage suites: `spine.test.js` (schema, store, passwords) plus one file per API area; ephemeral port, temporary SQLite file, blank model key, no network, never touches `data/` | **80 tests, 80 pass, 0 fail** |
| `node --test server/lib server/provider` | Module unit suites beside the code, including provider routing | **303 tests, 303 pass, 0 fail** (12 suites) |
| `node scripts/check.js` | What the tests cannot see: one `<h1>` per page, `lang` + viewport, includes and asset references resolve, no inline script or handler (CSP), no remote resources, no placeholder link or TODO, no hype vocabulary, no literal credential, no `eval` | **`applywright check — 9 pages, 24 server modules, 175 css classes` / `ok — 0 errors, 0 warning(s)`, exit 0** |

Both counts moved while this brief was being written, as the handoff team landed tests:
`tests/` from 64 to 80 (adding `auth-recovery.test.js`) and the module suites from 288 to
303 (`server/lib/cv/extract.test.mjs` alone runs 35). Treat any number here as
measured-on-a-date, not as a promise — re-run the command.

Supplementary, not part of the gate:

```bash
node scripts/seed.mjs              # with the server running: demo account, one CV, one report, three packs, one alert
node scripts/browser-preview.mjs   # needs the server, the seeded demo account and Chrome/Edge; writes screenshots/
```

`--strict` on `check.js` also fails on warnings. `node --test` with no argument
discovers both suites; the two commands above are the split used as the gate because the
module suites fail fast on their own.

---

## 8. Sharing and deployment

Two PowerShell scripts, self-contained, no npm install and no git needed:

- [`scripts/share.ps1`](../scripts/share.ps1) — `-Mode tailscale` (recommended) or
  `-Mode cloudflare`; `-WhatIf` is a read-only dry run; `-WriteEnv` writes
  `TRUST_PROXY=1`, `SECURE_COOKIES=1` and `PUBLIC_URL` into `.env.local`.
- [`scripts/share-stop.ps1`](../scripts/share-stop.ps1) — removes only the mapping its
  own state file records; `-RevertEnv` restores the security flags.

**Tailscale Serve** (private, survives reboot). The script auto-picks **https 8447**
because port 443 is already taken on this host by five other mappings, and it never runs
`tailscale serve reset`. The URL is `https://johans-pc.tailf64125.ts.net:8447`. The
bystander's tailnet invite is Johan's step, not the script's.

**Cloudflare quick tunnel** (public, ephemeral) — `scripts/share.ps1 -Mode cloudflare`
runs the Windows `cloudflared` binary beside the app and prints a random
`*.trycloudflare.com` URL; state and log live under
`%LOCALAPPDATA%\Applywright\share\`. Anyone with the URL can register an account:
close it with `REGISTRATION_OPEN=0`, keep the window short, or use the named tunnel with
Cloudflare Access.

**The real home: `intelligentartificial.net`.** Registered and delegated to GoDaddy
nameservers (`ns59`/`ns60.domaincontrol.com`); the apex currently has GoDaddy parking A
records and `apply.intelligentartificial.net` does not exist. **Nothing has been
executed** — no record, tunnel, host or certificate exists. The target shape is a
**named Cloudflare tunnel** pointing `apply.intelligentartificial.net` (or the apex) at
`http://127.0.0.1:3160`, with the app env set to `TRUST_PROXY=1`, `SECURE_COOKIES=1`,
`PUBLIC_URL=https://…`. The full DNS/TLS/cutover runbook is
[`DOMAIN.md`](DOMAIN.md); the ordered version with the app-side env is
[`SHARE.md`](SHARE.md) §7. Serverless hosting does not fit: the app is one long-lived
process with in-process state and a local SQLite file.

**Do not** expose 3160 directly, run two instances against one database, put SQLite on a
network share, or use Cloudflare "Flexible" SSL.

---

## 9. Known gaps

Current, verified against the code. Each is a real limitation, not a typo.

- **PDF extraction depends on a local `pdftotext`, reached through WSL here.**
  `cv/extract.js` tries the native `PATH` first, then `wsl -e pdftotext - -`. On this PC
  `pdftotext` is **at `/usr/bin/pdftotext` and absent from the Windows `PATH`**, so PDFs
  are read through the WSL fallback: it works, but it costs a WSL round trip per upload,
  depends on `wsl` being on `PATH`, and its capability probe is cached per process.
  Install Poppler on Windows to take the direct route.
- **Image OCR needs Tesseract, which is not installed anywhere on this machine.** Image
  uploads (`.png`, `.jpg`, `.gif`, `.bmp`, `.tif`, `.webp`) and image-only PDFs are
  detected, and refused with the exact install command
  (`winget install UB-Mannheim.TesseractOCR` / `sudo apt install tesseract-ocr`) rather
  than half-read. A scanned PDF now advises uploading page images instead.
- **Legacy binary Word (`.doc`) is refused**, with "save as `.docx` first". Modern
  `.docx`, `.odt`, `.rtf` and HTML all parse locally with no dependency.
- **Unenforced plan flags.** `fullAtsReport`, `packHistory` and `dailyDigest` are
  returned by the plans API but **nothing gates on them**; `plans.js` calls
  `fullAtsReport` a presentation hint. Only four quotas are enforced (`cvs`, `packs`,
  `alerts`, `jobResultsPerDay`); "API access" has no key authentication behind it.
  (The covering-letter flag *is* enforced, in `/api/tailor` and in the refine rebuild.)
- **VAT is not modelled.** Prices are stated and charged "excluding VAT"; there is no
  VAT line, rate or calculation anywhere.
- **Password recovery has no email transport.** A recovery flow exists — an offline
  recovery code saved at sign-up (`POST /api/auth/recover`), and a single-use, expiring
  reset link (`POST /api/auth/forgot` → `/reset` → `POST /api/auth/reset`) — but with no
  mail library the link is recorded on the host and passed on by the operator. Last resort:
  `node scripts/reset-password.mjs --list` / `--email … --generate`.
- **Stripe is unconfigured and untested live.** With `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET` both set, checkout, the portal and signature verification are
  wired and refuse cleanly when unset — but no live keys were used in this tree. The
  webhook is also **not idempotent**: events are applied as they arrive with no
  event-id dedupe, so a redelivered event re-applies the same plan change.
- **Mobile nav needs JavaScript.** The `.nav__toggle` button is driven by `site.js`
  (`aria-expanded`, removing `.no-js`); with JS off the mobile menu is not operable.
- **Bookmarklet metadata not consumed by the SPA.** The bookmarklet emits `title`,
  `company` and `blocked` alongside `sourceUrl` and `text`; the SPA's posting-capture
  handoff reads only `sourceUrl` and `text`, so those fields are dropped.
- **`DATABASE_PATH` does not move the database** — documented in `.env.example` and not
  read by `server/config.js`, which resolves `<repo>/data/applywright.db`.
- **The marketing hero is still a chatbot mock** (`.mock__*`, `.hero__grad`) — the
  recomposition to an A4 proof sheet is queued; see `IMPLEMENTATION-PLAN.md`.
- **No accessibility tooling wired.** `scripts/check.js` has no contrast assertions and
  `package.json` has no `axe-core`; the ratios in `DESIGN-INPUTS.md` were computed by
  hand. A11y work is in progress.
- **One process only.** Rate limits, feed cache and the alert scanner are in process;
  two instances behind a proxy would enforce their own limits and double-scan alerts.
- **Rate limits apply to mutations.** Every response carries the limit headers, but the
  429 is only returned for auth endpoints and non-GET requests.

---

## 10. Where the rest of it lives

| Need | File |
|---|---|
| Product contract — data model, module signatures, decisions, refusals | [`docs/SPEC.md`](SPEC.md) |
| What is done, what is next, with owners and acceptance checks | [`docs/IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) |
| Branch, commit, gate commands, pushing to a remote | [`docs/PIPELINE.md`](PIPELINE.md) |
| Local run, full configuration table, API summary, limitations | [`README.md`](../README.md) |
| Host install: Caddy, systemd, pm2, backups, pre-flight, rollback | [`docs/DEPLOY.md`](DEPLOY.md) |
| DNS, TLS and cutover for `intelligentartificial.net` | [`docs/DOMAIN.md`](DOMAIN.md) |
| Sharing today: Tailscale, quick tunnel, security posture | [`docs/SHARE.md`](SHARE.md) |
| LinkedIn capture: what the bookmarklet does and does not do | [`docs/LINKEDIN-CAPTURE.md`](LINKEDIN-CAPTURE.md) |
| Design system canon — shipped 28 Oct, supersedes DESIGN-INPUTS where they disagree; `docs/SPEC.md` still wins on product truth | [`docs/design/SPEC-V2.md`](design/SPEC-V2.md) |
| Design synthesis: the chosen direction, measured contrast pairs, eight changes (research; superseded on the system itself by SPEC-V2) | [`docs/design/DESIGN-INPUTS.md`](design/DESIGN-INPUTS.md) |
| Design directions (all exist) | [`docs/design/DIRECTION-codex.md`](design/DIRECTION-codex.md), [`DIRECTION-gemini.md`](design/DIRECTION-gemini.md) (*Pressproof*), [`DIRECTION-grok.md`](design/DIRECTION-grok.md) |
| Design research | [`docs/design/RESEARCH-aesthetic.md`](design/RESEARCH-aesthetic.md), [`RESEARCH-communities.md`](design/RESEARCH-communities.md), [`RESEARCH-darkmode.md`](design/RESEARCH-darkmode.md), [`RESEARCH-repos.md`](design/RESEARCH-repos.md) |
| Product research: ATS reality, CV craft, job-data legality, market | [`docs/research/`](research/) |
| Obsidian note to apply by hand (missions cannot write the vault) | [`docs/VAULT-PATCH.md`](VAULT-PATCH.md) |
| Hub-level stub | `agent-system/docs/diagnostics/APPLYWRIGHT-PROJECT-STATUS-20261028.md` |
