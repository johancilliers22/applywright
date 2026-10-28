# Fork and run Applywright

This is the handoff for a competent developer who has never seen this project. By the end
of it you will have a fork, a running copy on `http://127.0.0.1:3160`, a seeded demo
account, a branch carrying your first change, and a map of where the interesting code
lives.

Every command below was run against this tree on 28 October 2026. Where Windows and
Linux/WSL differ, both are shown. Nothing here needs a key, an account or a network
connection except the three public job boards and `npm install`.

---

## 1. What it is

Applywright turns one CV into a tailored application for each job worth applying to. It
scores a CV against a specific job description, rewrites the summary, bullets and letter
using only facts the CV already contains, and builds a print-ready, ATS-safe pack — CV,
covering letter, four screening answers. It tracks each application through its statuses
and polls three public job boards against saved searches, dropping matches into an inbox
and an RSS feed. It is one Node process with a SQLite file on disk: no build step, no
container, and no external service that has to be reachable for it to start.

The three things it deliberately refuses to do, each with code behind the refusal:

- **No LinkedIn scraping and no background crawling.** `POST /api/jobs/capture` refuses
  `linkedin.com`, `indeed.com` and `glassdoor` URLs outright, with the reason in the
  response (`BLOCKED_CAPTURE_HOSTS` in `server/app.js`). Capture is always user-initiated:
  you paste the URL and the page text or HTML. The only outbound reads are the three public
  job APIs (`arbeitnow.com`, `remotive.com`, `remoteok.com`) and Stripe, if you configure
  billing. The LinkedIn connector parses text you already hold; there is no OAuth and no
  fetch.
- **No automated submission.** Nothing in the codebase posts an application or fills in an
  employer's form. A pack ends at status `pack_ready`; you approve it, click apply on the
  employer's own page, and record the outcome. Statuses change only when a person changes
  them.
- **No fabricated experience.** Tailoring is grounded rewriting. `assertGrounded` in
  `server/lib/cv/tailor.js` rejects a rewrite that introduces a number, a currency amount,
  an employer, a job title, a date range, a qualification or a proper noun the CV does not
  contain; the bullet is replaced with the CV's own wording and the reason is returned in
  `warnings`. Refinement runs the same discipline through `groundChanges` in
  `server/lib/cv/refine.js`.

The same discipline covers retention: CV text is stored as text and never as the raw
uploaded binary, `GET /api/export` returns everything the account owns, and
`DELETE /api/account` hard-deletes the user and cascades through their rows.

---

## 2. Get it

### Fork, then clone your fork

Fork `https://github.com/johancilliers22/applywright` on GitHub (the *Fork* button, keep
the name, keep the branch `main`), then clone **your** fork and add Johan's repository as a
second remote called `upstream`. The fork is where you push; `upstream` is how you pull
future changes.

Windows PowerShell:

```powershell
cd $HOME\Code
git clone https://github.com/<your-account>/applywright.git
cd applywright
git remote add upstream https://github.com/johancilliers22/applywright.git
git remote -v
```

Linux or WSL:

```bash
mkdir -p ~/Code && cd ~/Code
git clone https://github.com/<your-account>/applywright.git
cd applywright
git remote add upstream https://github.com/johancilliers22/applywright.git
git remote -v
```

`git remote -v` should print four lines: `origin` pointing at your fork (fetch and push)
and `upstream` pointing at `johancilliers22/applywright`.

Pulling later, when Johan lands something:

```bash
git fetch upstream
git switch main
git merge upstream/main
git push origin main
```

GitHub's *Sync fork* button does the same thing in the browser.

Two things to know before you clone twice:

- **Do not share one checkout between Windows and WSL.** `node_modules` is
  platform-specific; a copy installed under Windows can misbehave when Node runs under
  WSL. Clone once per environment, or keep one clone per machine.
- **In WSL, clone onto the Linux filesystem (`~/Code`), not `/mnt/c`.** A checkout under
  `/mnt/c` works, but every file read crosses the Windows/Linux boundary and the test
  suites slow down noticeably.

The default branch is `main`. Some of the repository's own documents still say `master`
because they were written before the first push; `main` is what exists.

---

## 3. Prerequisites

**Required.**

- **Node 22.5 or newer**, because the database layer is `node:sqlite` (`DatabaseSync`),
  which arrived in 22.5.0. Earlier releases cannot load the server module at all. No flag
  is needed on current releases; an early 22.x build that refuses to resolve `node:sqlite`
  needs `--experimental-sqlite`. The tree was built and tested on Node 26.12.1.
- **npm**, which ships with Node.

Check both, and check the reason for the version floor:

```powershell
node --version
npm --version
node -e "require('node:sqlite'); console.log('node:sqlite loads')"
```

```bash
node --version
npm --version
node -e "require('node:sqlite'); console.log('node:sqlite loads')"
```

The last command must print `node:sqlite loads`. If it throws, the Node build is too old or
needs the flag — move to a current release rather than fighting it.

**Optional, for richer CV ingestion.** Text CVs (`.txt`, `.md`, `.docx`, `.odt`, `.rtf`,
`.html`) parse with no external tool at all. PDFs need Poppler's `pdftotext`, and image
uploads and scanned PDFs need Tesseract. Without them the upload is refused with an
explanation naming the install command, rather than half-read — the app still runs.

The extractor in `server/lib/cv/extract.js` tries the **native binary on `PATH` first**,
then falls back to `wsl -e <tool>` on Windows. So a Windows install of Poppler and Tesseract
is the fast path; WSL installs work too and cost a VM round trip on the first call per
process.

Windows, via winget:

```powershell
winget install --id oschwartz10612.Poppler -e
winget install --id UB-Mannheim.TesseractOCR -e
```

Then open a new shell and check that the binaries answer:

```powershell
pdftotext -v
tesseract --version
```

`pdftotext -v` prints its version to standard error and exits non-zero on some builds; what
matters is that the command is found. If it is not, the portable Poppler package did not
land on `PATH` — add its `Library\bin` directory to `PATH`, or rely on the WSL fallback
below. Tesseract's normal installer does add itself to `PATH`.

Linux or WSL, via apt:

```bash
sudo apt update
sudo apt install -y poppler-utils tesseract-ocr
```

`poppler-utils` supplies `/usr/bin/pdftotext`; `tesseract-ocr` supplies
`/usr/bin/tesseract`. Both names are the Debian/Ubuntu packages for those binaries.

The Windows fallback, for the record: `wsl -e pdftotext - -` and
`wsl -e tesseract stdin stdout`. It needs `wsl` on `PATH` and the tool installed inside the
distribution. The capability probe is cached per process, so the first PDF of a session is
slower than the rest.

---

## 4. Run it

Install the one runtime dependency, then boot the server. Windows PowerShell:

```powershell
cd $HOME\Code\applywright
npm install
Copy-Item .env.example .env.local   # optional: every value may stay empty
node server/index.js
```

Linux or WSL:

```bash
cd ~/Code/applywright
npm install
cp .env.example .env.local
node server/index.js
```

`npm start` runs exactly the same command (`node server/index.js`); `npm run dev` adds
`--watch`. There is nothing to build and nothing to migrate — the schema is created on first
boot.

The banner tells you what you are running:

```text
  Applywright  ·  your CV, tailored for every job.

  URL        http://127.0.0.1:3160
  tailoring  deterministic rules (no MODEL_API_KEY)
  database   .../applywright/data/applywright.db
  jobs       arbeitnow, remotive, remoteok
  billing    not configured (plans visible, checkout disabled)

  Ctrl+C to stop.
```

Open `http://127.0.0.1:3160/` for the marketing pages, `/sign-up` to create an account, and
`/app` for the product once you are signed in. `Ctrl+C` closes the listener and then the
database.

**Seed a demo account.** With the server still running, in a second shell:

```powershell
cd $HOME\Code\applywright
node scripts/seed.mjs
```

```bash
cd ~/Code/applywright
node scripts/seed.mjs
```

The script talks to the public HTTP API rather than writing the database directly, so it
also exercises the real endpoints. It creates (or signs in to)
`demo@applywright.example` with password `demo-password-123`, adds one CV, scores it
against a job description, builds three tailored packs at different statuses, and creates
one saved search. It prints the score and `mode` of each pack as it goes, and finishes with
the credentials:

```text
ready — sign in with demo@applywright.example / demo-password-123
```

Sign in at `http://127.0.0.1:3160/sign-in`. The free plan allows three packs a month and the
seed creates exactly three, so a second run against the same account in the same month stops
at the first tailor call with 402 `quota_exceeded`. Use a different address
(`$env:SEED_EMAIL = 'demo2@applywright.example'` in PowerShell, or
`BASE_URL=... SEED_EMAIL=... node scripts/seed.mjs` in bash) or wait for the month to turn.

### If you lock yourself out

There is no email transport in this build, so recovery is a local operator action. Run these
from the checkout that holds the database; you can run them while the server is up, because
the script opens the same SQLite file the server uses.

```powershell
cd $HOME\Code\applywright
node scripts/reset-password.mjs --list
node scripts/reset-password.mjs --email you@example.com --generate
```

```bash
cd ~/Code/applywright
node scripts/reset-password.mjs --list
node scripts/reset-password.mjs --email you@example.com --generate
```

`--list` prints every account with its plan and creation date. The second command prints
`password reset for <address>`, a fresh generated password (about 32 characters, prefixed
`aw-`), and how many sessions it revoked. Sign in with that password at `/sign-in`, then
change it in Settings.

The other forms of the same tool, all verified:

```powershell
node scripts/reset-password.mjs --email you@example.com --password 'a password you choose'
node scripts/reset-password.mjs --pending          # unexpired "forgot password" links
node scripts/reset-password.mjs --database .\data\applywright.db --list
```

`--pending` is the forgot-password queue: it prints each unexpired reset link with the
address it belongs to and when it expires. Those links come from `POST /api/auth/forgot`,
which records the token on the host because no mail is sent — a user requests a reset and
you pass the link on by hand.

Two in-app routes also exist and are worth knowing: `/reset` accepts a recovery code saved
at sign-up (`POST /api/auth/recover`, works once per code), and a signed-in session can
change its own password from Settings. `scripts/reset-password.mjs` is the last resort when
neither is available.

---

## 5. Configuration

Settings come from three places, in this order of precedence:

1. an `overrides` object passed to `loadConfig()` — tests only;
2. the process environment, **but only when the variable is set to a non-empty value**;
3. `.env.local`, then `.env` in the project root — the first file that exists is used, and
   the two are never merged.

Two consequences worth knowing before they cost you an hour. An empty environment variable
does not erase a value from `.env.local`, so `FOO=` on the command line leaves the file's
value in place. And number settings are clamped to their permitted range rather than
refused, so an out-of-range value silently becomes the nearest limit.

The table below is every variable that changes behaviour. Defaults are read from
`server/config.js`. The full list, including the rate limits, body caps, feed cache and model
timeouts, is in `README.md` §Configuration.

| Variable | Default | What breaks if it is wrong |
|---|---|---|
| `PORT` | `3160` | The port it listens on, clamped 0–65535. `0` asks the OS for a free port, so the banner URL changes. A port already in use fails at boot with `EADDRINUSE`. |
| `HOST` | `127.0.0.1` | Loopback only: nothing on the network can reach the app. `0.0.0.0` exposes it directly with no TLS and no proxy in front — do that only when something you control terminates TLS. |
| `DATABASE_PATH` | `./data/applywright.db` in `.env.example` | **Ignored.** `server/config.js` resolves `<repo>/data/applywright.db` regardless, so setting this moves nothing and silently leaves you on the old path. To relocate the data, move the checkout or bind-mount `data/`. |
| `PUBLIC_URL` | `http://127.0.0.1:3160` | Scheme and host, no trailing slash. Read once at boot for the RSS feed's self-link and the Stripe success, cancel and portal return URLs. Wrong here means `127.0.0.1` links escaping through your tunnel and paying customers returned to the wrong site. |
| `TRUST_PROXY` | `0` | `0` treats `req.ip` as the socket address and ignores `X-Forwarded-For`. `1` (or `true`/`yes`/`on`) trusts exactly one proxy hop and lets `X-Forwarded-Proto` decide `req.protocol`. Leave it `0` with no proxy; behind a proxy, `0` makes every client look like the proxy to the rate limiter, so one abuser throttles everyone. |
| `SECURE_COOKIES` | `0` | `1` adds `Secure` to the `aw_session` cookie. Correct behind TLS; on plain `http://` the browser never returns the cookie and every authenticated call answers 401. |
| `REGISTRATION_OPEN` | `1` | `0` (or `false`/`no`/`off`) refuses `POST /api/auth/register` with 403 `registration_closed`. Sign-in, sessions and everything else keep working. Set it to `0` before exposing the app publicly. |
| `MODEL_PROVIDER` | inferred | `anthropic` when `ANTHROPIC_ORG_API_KEY` is set, `openai` when `MODEL_API_KEY` is, `none` when neither is. Set it to force a route; any value other than `anthropic` falls through to the OpenAI-compatible client when a key is present. |
| `ANTHROPIC_ORG_API_KEY` | empty | Routes tailoring through `server/provider/anthropic.js`. Deliberately a separate variable: the loader never reads or maps `ANTHROPIC_API_KEY`. Setting that name instead does nothing. |
| `MODEL_API_KEY` | empty | Empty leaves tailoring on the deterministic rules rewriter — a supported state, not a failure. Set, it enables one JSON-mode completion per pack. A wrong key does not break the product: each pack falls back to rules and says why in `warnings`. |
| `MODEL_BASE_URL` | `https://api.deepseek.com/v1` | The OpenAI-compatible base; `/chat/completions` is appended and trailing slashes are stripped. Wrong endpoint means every pack quietly falls back to rules. |
| `MODEL_NAME` | `deepseek-chat` | Sent as the `model` field. A wrong name gets a 4xx from the provider and the same rules fallback. |
| `STRIPE_SECRET_KEY` | empty | Billing counts as configured only when this and `STRIPE_WEBHOOK_SECRET` are both present. Otherwise checkout and the portal answer 501 and `/api/health` reports `"stripe": false`. |
| `STRIPE_WEBHOOK_SECRET` | empty | Verifies the `stripe-signature` header. A wrong value makes every webhook answer 400 `invalid_signature`, so no plan is ever upgraded. |
| `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`, `STRIPE_PRICE_SCALE_MONTHLY`, `STRIPE_PRICE_SCALE_YEARLY` | empty | Checkout for that plan and interval answers 501 naming the missing price. |
| `CONTACT_EMAIL` | `hello@applywright.example` | Substituted into pages as `{{CONTACT_EMAIL}}`. It changes no behaviour; the contact form writes to `data/contact.jsonl` either way. |
| `ALERTS_SCAN_MINUTES` | `30` | The interval of the in-process alert scan, clamped 0–1440. `0` disables the scan entirely; `manual`-cadence alerts never run on their own regardless. |

**Keys are supplied through the environment and are never committed.** `.env` and
`.env.local` are gitignored (`git check-ignore -v .env.local` proves it), `data/` is
gitignored, and nothing in the repository contains a key. On a server the values live in the
service manager's environment file outside the checkout, not in a file a web server could
serve — `docs/DEPLOY.md` §3 shows the shape. Do not put a key on a command line: it lands in
your shell history and in process listings. Put it in `.env.local` (local) or the env file
(server) and restart the process, which reads its environment once at boot.

Behind a TLS proxy the four that matter are `HOST=127.0.0.1`, `TRUST_PROXY=1`,
`SECURE_COOKIES=1` and a `PUBLIC_URL` matching the proxy's origin.

### Where the existing docs are behind the code

Three drifts a reader will hit, verified on 28 October 2026:

- `docs/PIPELINE.md` and `docs/PROJECT-STATUS.md` describe a repository with no remote and
  branch `master`. The public repository is `main`, `origin` is set, and it is public.
- `docs/SHARE.md` §6 states there is no switch to close registration. There is:
  `REGISTRATION_OPEN` (`server/config.js`, enforced at `POST /api/auth/register` in
  `server/app.js`). Do not patch the app to add one.
- `docs/PROJECT-STATUS.md` §9 says Tesseract is not installed anywhere on Johan's machine
  and image uploads are refused. Tesseract is now present at `/usr/bin/tesseract` in WSL, so
  the `wsl -e tesseract` route is live; the newest commit is the one that wired it up.

---

## 6. Working on it with an AI agent locally

Two different things get called "using DeepSeek", and they are worth separating before you
start, because they are configured in different places and do different work:

- **the model the product calls** when it tailors a CV — configured through the app's
  environment, used at request time by `server/lib/cv/tailor.js`;
- **the model that writes your code** — a coding agent in your terminal, editing the same
  files you would edit by hand.

Neither implies the other. Setting `MODEL_NAME` does not change which model reviews your
diff, and pointing a coding agent at the repository does not enable model-backed tailoring.

### With Claude Code

Run `claude` in the repository root (install it however its own documentation says). There
is **no `AGENTS.md` and no `CLAUDE.md` in this repository** today, so the equivalent is the
status brief — point the agent at it explicitly. A first message that works:

> Read `docs/PROJECT-STATUS.md`, then `README.md`, then `docs/SPEC.md`. Summarise the
> architecture and the three things the product refuses to do before touching anything.

Give it the two gates that are cheap enough to run on every turn, and tell it to keep the
tree green:

```bash
node --test tests/
node scripts/check.js
```

The full gate adds the module suites, which are the ones that catch a broken grounding check
or a changed score. Run all three before you commit:

```bash
node --test tests/ && node --test server/lib server/provider && node scripts/check.js
```

Two habits keep an agent honest here. Ask it to show the command output rather than
summarise it — the exit code is the answer. And because `scripts/check.js` enforces page
rules the tests cannot see (one `<h1>` per page, no inline script, no remote asset, no
placeholder link, no hype vocabulary), a passing agent that added a marketing word like
"seamless" has still broken the check; let it see the failure rather than argue about it.

### With DeepSeek, or any OpenAI-compatible model

**(a) Point the app at it, so tailoring runs in model mode.** This is configuration, not
code. In `.env.local`:

```ini
MODEL_PROVIDER=openai
MODEL_BASE_URL=https://api.deepseek.com/v1
MODEL_API_KEY=sk-your-key-here
MODEL_NAME=deepseek-chat
```

Restart the server and check what the process believes:

```powershell
(Invoke-WebRequest http://127.0.0.1:3160/api/health -UseBasicParsing).Content
```

```bash
curl -s http://127.0.0.1:3160/api/health
```

`"provider":"live"` means a model client was constructed from a key being present. It is
**not** proof that a call succeeded: the health route only checks that the client exists.
The stronger signal is a pack's own `mode`. Run the seed and read the lines it prints:

```bash
node scripts/seed.mjs
```

```text
  pack: Senior Backend Engineer — Payments @ Ledgerline — 78/100, model
```

`model` means the completion came back, passed schema validation and survived the grounding
check; `rules` means it did not (or no key is set), and the pack is still grounded and
usable — just less fluent. `POST /api/tailor` returns the same field as `pack.mode`, and
falls back with the reason in `warnings`.

Any OpenAI-compatible endpoint works the same way, because `server/model.js` speaks
`/chat/completions` with `response_format: {"type":"json_object"}`. That includes OpenAI
itself, Azure, a local vLLM or Ollama server, or a proxy. The Anthropic route is different:
set `ANTHROPIC_ORG_API_KEY` and `MODEL_PROVIDER=anthropic`, and `server/provider/anthropic.js`
speaks `/v1/messages` instead. DeepSeek is the default on purpose — the base URL and model
name are its values.

**(b) Use a DeepSeek coding harness for the code itself.** DeepSeek's own harness, or any
agent runner that can drive a DeepSeek model, works against this repository the same way
Claude Code does: it reads files, edits them, runs the gate, and commits. The prompt block
below is written to be pasted into either. Nothing in (a) applies to (b); the app has no
opinion about which model edits its source.

### A prompt to paste

```text
You are working in a fork of Applywright, a small Node 22+ application: one
Express process, SQLite through node:sqlite, hand-written CSS, no build step,
no client framework.

Read, in this order: docs/PROJECT-STATUS.md (the cold-start brief),
README.md (run, configure, limitations), docs/SPEC.md (the product
contract: data model, module signatures, the three refusals) and
docs/design/SPEC-V2.md (the design system). Where SPEC-V2 and the older
design notes disagree, SPEC-V2 wins on the design; where code and SPEC.md
disagree, say so rather than quietly following the code. docs/PIPELINE.md
covers branch and commit discipline.

The gate is three commands, and the exit code is the answer — run all three
before you report anything done, and keep them green:
  node --test tests/
  node --test server/lib server/provider
  node scripts/check.js

Hard rules for this repository:
- Tailoring must stay grounded. assertGrounded in server/lib/cv/tailor.js and
  groundChanges in server/lib/cv/refine.js exist to reject a rewrite that
  invents a number, an employer, a title, a date, a qualification or a name.
  Do not weaken, bypass or "improve" that check, and do not delete a test that
  asserts the refusal — the refusal is the product.
- No scraping and no automated submission. Capture refuses LinkedIn, Indeed
  and Glassdoor URLs by design; nothing posts an application.
- Never commit a key, a .env file or anything under data/. Keys arrive
  through the environment. .env.local is gitignored.
- Stage named paths only: git add <path>. Never git add -A or git add .
- One concern per commit, subject "<area>: <what changed>", sentence case, no
  shouting. Example: "Tailoring: refuse a rewrite that adds a date range".
- Express is the only runtime dependency. Do not add another without asking.
- No build step and no CSS framework: styles are hand-written CSS built on
  public/assets/tokens.css and theme.css.
- If you change a number the docs quote, update docs/PROJECT-STATUS.md §7 in
  the same commit.

Before you change behaviour, find the test that covers it and read it. When
you finish, show the gate output, not a summary of it.
```

---

## 7. Where to change things

| What you want to change | Where | What to know |
|---|---|---|
| Brand, company name, slogan | `server/config.js` — the `site` block (`brand`, `company`, `tagline`, `contactEmail`) — plus `public/partials/nav.html` and `footer.html`, and the product shell `public/app/app.html` | The parts render `{{BRAND}}`, `{{YEAR}}` and `{{CONTACT_EMAIL}}`; the wordmark in the partials is written out, so change both. `site.tagline` is currently not rendered anywhere — the phrase users actually see is hard-coded in the `server/index.js` banner and in `public/app/app.html`. |
| Palettes, type scale, spacing | `public/assets/tokens.css` (palette, type scale, primitives) and `theme.css` (the product re-key and the dark scheme) | No CSS framework and no build step: edit the file, reload the page. `motion.css` holds transitions, `site.css` the marketing pages, `public/app/app.css` the product. Dark mode keys off `html[data-theme="dark"]`. |
| A page or its copy | `public/*.html` for the eight marketing and auth pages, `public/partials/` for the shared nav and footer, `public/app/` for the signed-in SPA | Routes come from the `PAGES` map in `server/app.js`; a page whose HTML file is missing does not error, it falls through to the 404 handler, so a wrong filename looks like a missing route. `scripts/check.js` enforces one `<h1>`, a `lang` and a viewport meta, no inline script or handler (the CSP forbids both) and no remote asset. |
| The printable CV | `server/lib/packs/build.js` | It produces a standalone document with inline print CSS: A4, 18 mm margins, one column, real headings and lists, no layout tables, no icon fonts, no images, no external URLs. Keep it that way — that is what survives an ATS and a copy-paste into Word. `GET /api/applications/:id/cv` serves it. |
| Scoring weights and findings | `server/lib/cv/score.js` | Deterministic and offline: keywords 35, structure 20, achievements 20, readability 15, formatting 10, and every point is explained by a named finding with a fix. Change a weight and the advisory sentence in `server/app.js` (`ADVISORY`, which quotes the same numbers) must move with it. |
| Job sources | `server/lib/jobs/sources.js` | Arbeitnow, Remotive and Remote OK fetchers and normalisers, with a 6 s timeout per source, one source allowed to fail, and dedupe by `sha256(company\|title\|location)`. Attribution is a condition of using those feeds, so keep the source label on every row. Adding a board means adding its attribution string too. |
| Plans, prices, quotas | `server/lib/billing/plans.js` | One table. The server's quota and feature gates read it directly (`can`, `entitlements`), and the product UI renders whatever `GET /api/billing/plans` returns — so change this file, not the pages. Only four quotas are enforced (`cvs`, `packs`, `alerts`, `jobResultsPerDay`); the declared feature flags are returned but not gated, except the covering-letter flag. |

Two more that repay a read early: `server/lib/cv/extract.js` (what formats ingest, and the
native-then-WSL extractor chain) and `server/app.js` (every route, the security headers, the
rate limits and the quotas).

---

## 8. Your own deployment

The app is one long-lived process with in-process state and a SQLite file; run exactly one
instance. Serverless hosting does not fit — the filesystem is ephemeral and the sessions
and database would not survive — so the options are a machine you own with a tunnel, or a
VPS with a TLS proxy.

**Quick share from your own machine.** Two shapes:

```bash
# private: only devices on your tailnet, over HTTPS with a real certificate
tailscale serve --bg --https=8443 http://127.0.0.1:3160
tailscale serve status
```

```bash
# public and ephemeral: anyone with the URL, no account
cloudflared tunnel --url http://127.0.0.1:3160 --no-autoupdate
```

The first needs Tailscale installed and signed in, with HTTPS certificates enabled for the
tailnet; pick a port that is not already served (443 is the default and collides with
anything else you have mapped). The second prints a random `*.trycloudflare.com` URL and
dies with the process. On Windows, the repository's `scripts/share.ps1` wraps both:
`-WhatIf` is a read-only dry run, and `-WriteEnv` writes `TRUST_PROXY=1`,
`SECURE_COOKIES=1` and `PUBLIC_URL` into `.env.local`. `scripts/share-stop.ps1` removes only
the mapping its own state file records.

Whatever fronts the app, the env changes are the same, and they matter: `HOST=127.0.0.1`,
`TRUST_PROXY=1`, `SECURE_COOKIES=1`, `PUBLIC_URL=https://<your-origin>`. Do not expose port
3160 directly, and set `REGISTRATION_OPEN=0` before a public URL is live unless you want
strangers creating accounts.

**A VPS with Caddy, systemd or pm2.** Follow `docs/DEPLOY.md` — it is a complete runbook
(Node install, a dedicated user, the env file outside the checkout, the Caddyfile, the
systemd unit or the pm2 commands, backup and restore, a pre-flight checklist and rollback).
`docs/DOMAIN.md` covers DNS, TLS and cutover for a real hostname. `docs/SHARE.md` covers the
tunnel and the Windows scripts in more depth, including the security posture while the app
is exposed.

---

## 9. Boundaries to keep

- **Do not add scraping.** The three blocked hosts in `BLOCKED_CAPTURE_HOSTS` are blocked
  because their terms forbid automated access and re-publication, not because nobody got
  round to it. Capture stays user-initiated.
- **Do not add auto-submission.** A pack ends at `pack_ready`; a person applies. A change
  that sends an application on the user's behalf is a different product with a different
  liability.
- **Do not weaken the grounding check.** `assertGrounded` and `groundChanges` are the thing
  that makes the output safe to send. A test that asserts a fabricated number is refused is
  a feature, not friction.
- **Do not commit keys, data or env files.** `.env`, `.env.local`, `data/` and `*.db` are
  gitignored; do not force-add around it. `data/` holds CV text and application history, so
  treat copies as personal data.
- **Run one process per database.** Rate-limit buckets, the job-feed cache and the alert
  scanner all live in the process, and SQLite has one writer. Cluster mode would double
  every fetch and every scan.
- **Know what is enforced.** Four quotas are enforced; several advertised features
  (full ATS report, pack history, daily digest, "API access") are declared in the plans API
  and not gated. `docs/PROJECT-STATUS.md` §9 is the honest list; keep it honest if you
  change one.
- **The licence is not settled.** There is no `LICENSE` file in the repository yet. If you
  plan to redistribute or publish a modified copy, ask Johan first.

For the two-minute path from "I have the link" to a running copy, see
[`docs/HANDOFF-FOR-A-FRIEND.md`](docs/HANDOFF-FOR-A-FRIEND.md). For how to contribute a
change back, see [`CONTRIBUTING.md`](CONTRIBUTING.md).
