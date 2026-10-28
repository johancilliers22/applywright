# Applywright — notes for a Claude Code or Codex session

*Practical orientation for a harness that edits files directly, rather than an orchestrator
that delegates. Companion to [`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) (read that
for settled decisions, ownership detail and the long form of the five mistakes) and
[`ESTATE-RELAY.md`](ESTATE-RELAY.md) (current state).*

Delegation changed on 28 Oct evening: **Codex is now the main orchestrator and validator**
(see `CODEX-ORCHESTRATOR-HANDOFF.md`), **DSH/DeepSeek does the bulk of implementation**, and
**T3 Mission Control** tracks missions and supplies independent review/test children
(`T3-MISSIONS.md`). The T3 Claude-agent route is disabled in `ROLES.json` until Johan enables it
and records why. The product's own AI editing is a separate thing entirely — it calls the Claude
org key directly (`MODEL-CONFIG.md`). The estate rules in the hub `AGENTS.md` bind regardless: named-path
commits, no secret reads, PID-scoped process kills, no computer use in unattended runs.

Measured 2026-10-28. Re-run the gate before trusting any number below.

---

## 1. Read order

| # | File | Why, in one line |
|---|---|---|
| 1 | [`PROJECT-STATUS.md`](PROJECT-STATUS.md) | what the product is, its stack, routes, modules, data model |
| 2 | [`README.md`](../README.md) | run, configure, limitations |
| 3 | [`SPEC.md`](SPEC.md) | the product contract: boundaries, module signatures, HTTP surface |
| 4 | [`OVERNIGHT-BRIEF.md`](OVERNIGHT-BRIEF.md) | the operating contract: what is free to change, what needs Johan |
| 5 | [`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) | settled decisions, ownership map, delegation pattern |
| 6 | [`PIPELINE.md`](PIPELINE.md) | branch, commit, gate, push |
| 7 | the file you are about to change, and its test | never edit blind |

Skip 5 when you are only making a small, well-specified change; read it before you decide
what to work on. `design/SPEC-V2.md` is the design canon and wins over older design notes
on design questions; `SPEC.md` wins over everything on product behaviour. If code and
`SPEC.md` disagree, say so rather than quietly following either.

---

## 2. The gate — three commands, two families, one answer

```bash
node --test tests/                       # HTTP and storage suite
node --test server/lib server/provider   # module suites beside the code
node scripts/check.js                    # pages, includes, assets, CSP, secrets, bookmarklet
```

Measured 2026-10-28: **113 pass / 0 fail**, **309 pass / 0 fail** (12 suites), and
`applywright check — 10 pages, 24 server modules, 253 css classes` / `ok — 0 errors,
0 warning(s)`, exit 0.

- **Green means 0 failures from both `node --test` runs and 0 errors from `check.js`.** The
  exit code is the answer. A sentence that summarises a non-zero exit is not a result.
- **Warnings are acceptable only from a file another agent is writing right now.** Never
  silence one to look green; `node scripts/check.js --strict` fails on warnings and is the
  setting to use before a commit you plan to defend.
- **A check that cannot print its verdict is indistinguishable from a passing one.** This
  has already produced one wrong conclusion: a partial copy of the project made
  `checkServer()` throw before the summary line, so a deliberately broken bookmarklet
  "passed". If you cannot see the verdict line, the check failed.
- **There is no CI**, no lint step and no type checker. `.github/` holds only
  `ISSUE_TEMPLATE.md`. The gate and a read of the diff are the whole review.
- Supplementary and not part of the gate: `node scripts/seed.mjs` (needs a running server),
  `node scripts/browser-preview.mjs` (needs the server, the demo account and Chrome/Edge).

---

## 3. File ownership map

One writer per surface. Contracts (`SPEC.md` §5, `design/SPEC-V2.md`) are read-only unless
changing them is the task. Long form with the two contested CSS cleanups:
[`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) §4.

| Surface | Files | Watch for |
|---|---|---|
| Server spine | `server/index.js`, `app.js`, `config.js`, `db.js`, `store.js`, `auth.js`, `model.js`, `pages.js`, `util.js`, `alerts-runner.js`, `server/provider/anthropic.js` | routes are the HTTP contract in `SPEC.md` §6 |
| Library modules | `server/lib/text.js`, `server/lib/cv/*`, `server/lib/jobs/*`, `server/lib/packs/build.js`, `server/lib/billing/plans.js` | one agent per module, against its `SPEC.md` §5 signature; unit suite beside the code |
| Marketing pages | `public/*.html`, `public/partials/**`, `public/assets/site.css`, `site.js` | `check.js` warns on an undefined class: ship the rule with the class |
| Product SPA | `public/app/app.html`, `app.css`, `app.js` | hardcoded colours must survive the dark scheme |
| CV editor | `public/editor.html`, `public/assets/editor.{css,js}`, `tests/editor.test.js` | `server/app.js` imports `public/assets/editor.js`; moving it breaks boot |
| Theme layer | `public/assets/tokens.css`, `theme.css`, `motion.css`, `theme.js` | tokens are semver-safe: no rename, no delete |
| Tests | `tests/*.test.js`, `server/lib/**/*.test.mjs` | never touch the network or `data/`; fixtures instead |
| Scripts | `scripts/check.js`, `seed.mjs`, `browser-preview.mjs`, `reset-password.mjs`, `share*.ps1` | change only with the gate re-run; a self-test needs a full project copy |
| Docs | `docs/*.md`, `README.md`, `FORK-AND-RUN.md`, `CONTRIBUTING.md` | claim only what a command or file shows |

---

## 4. Five mistakes already made here

Short form; the reasoning is in [`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) §7.

1. **Killing the server by command-line guess instead of the port-owner PID.** Two
   debugging rounds were spent reading stale code from a process nobody had restarted.
   Rule: find the owner of 3160, kill that PID, confirm the banner on restart.

   ```powershell
   Get-NetTCPConnection -LocalPort 3160 -State Listen | Select-Object LocalAddress,OwningProcess
   Stop-Process -Id <pid>          # the PID printed above, not a guess from Get-Process node
   ```

2. **Trusting `node --check` on the bookmarklet.** Syntax is not a URL. A banner-first line,
   a doubled scheme or a line break makes the `javascript:` bookmarklet inert while
   `node --check` exits 0. `scripts/check.js` now asserts the artifact parses as a
   `javascript:` URL, carries exactly one scheme and one `__ORIGIN__`, is a single line and
   makes no network call (`checkBookmarklet`). Edit `bookmarklet.src.js`, regenerate
   `bookmarklet.js` in the same change, and never verify the artifact by syntax alone.

3. **A `git add -A` sweeping another agent's in-flight files into an unrelated commit.** The
   tree is routinely shared. Rule: `git status --short` immediately before staging, then
   named paths. Uncommitted work from another agent is not yours to commit, revert or judge.

4. **`/app` redirecting because `express.static` defaults to directory redirects.** Mounting
   `public/app` as static made `/app` 301 to `/app/` before the SPA shell was served;
   `server/app.js` now mounts it with `redirect: false` and a comment. General form: a
   framework default is a bug until you have watched the request.

5. **Documenting behaviour before verifying it.** Docs described features that did not
   exist (six design citations pointed at a missing `SPEC-V2.md`; a false-green check
   produced a confident wrong conclusion). Rule: a doc sentence needs a command, a route or a
   file read behind it on the day it is written, and "DONE" means the check passes.

---

## 5. Conventions

- **ESM throughout.** `package.json` has `"type": "module"`: `import`/`export`, no
  `require`, and top-level `await` is fine (`server/index.js` uses it).
- **One runtime dependency: Express 5.** No dev dependencies, no bundler, no transpiler, no
  client framework, no type checker. Adding a dependency is a Johan decision.
- **Hand-written CSS on the token system.** `tokens.css` (palette, type, primitives) →
  `theme.css` (product re-key, dark scheme) → `motion.css` → `site.css` (marketing) /
  `public/app/app.css` (product). Dark mode keys off `html[data-theme="dark"]`. There is no
  build step: the file you save is what the browser gets.
- **CSP is `script-src 'self'`.** No inline `<script>`, no inline `on…` handler, no remote
  asset, no external font. Put behaviour in a served `.js` file. `check.js` fails on all
  three (lines 83, 84 and 94 say why).
- **`node:test`, two places.** `tests/*.test.js` for HTTP and storage; `*.test.mjs` beside a
  module for pure units. Fixtures and an injected `fetchImpl` instead of the network; an
  ephemeral port and a temporary SQLite file instead of `data/`.
- **Language.** British English, plain, specific, no hype. `check.js` carries a banned
  vocabulary list (`seamless`, `leverage`, `empower`, …) and fails a page that uses one.
- **Commits.** Named paths after reading `git status`; one concern per commit; subject
  `<area>: <what changed>` in sentence case, e.g. `Tailoring: refuse a rewrite that adds a
  date range`. This project repo may use `git add -u` plus explicit new files, but only when
  `git status` shows nothing that belongs to someone else. Never commit `data/`, `.env*` or
  a key; the remote is public.
- **One process per database.** The rate limits, job-feed cache and alert scanner are
  in-process, and SQLite has one writer. Do not run two instances against one `data/`.
- **Secrets.** Environment only. Never read or print `~/.ruflo/secrets.env`, any `.env`, or
  a token file; never put a key on a command line.

---

## 6. A prompt to paste

Written for this repository and the estate rules; the public-fork version is in
[`../FORK-AND-RUN.md`](../FORK-AND-RUN.md) §6.

```text
You are working in Applywright, a small Node 22+ application at
C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
(its own git repo, branch main; the hub repo gitignores projects/* and is not
involved). One Express process, SQLite through node:sqlite, hand-written CSS,
no build step, no client framework.

Read, in this order, before touching anything:
  docs/PROJECT-STATUS.md      what it is and how it is put together
  docs/OVERNIGHT-BRIEF.md     what is free to change and what needs Johan
  docs/ORCHESTRATOR-HANDOFF.md settled decisions, ownership, five mistakes
  docs/SPEC.md                the product and HTTP contract
  docs/design/SPEC-V2.md      the design canon
  the file you intend to change, and its test

The gate is three commands and the exit code is the answer. Run all three
before you report anything done:
  node --test tests/
  node --test server/lib server/provider
  node scripts/check.js
Show the output; do not summarise around a failure. If check.js cannot print
its verdict line, treat the check as failed. Never silence a warning to look
green; use --strict before a commit you expect to defend.

Hard rules:
- Grounding is the product. assertGrounded (server/lib/cv/tailor.js) and
  groundChanges (server/lib/cv/refine.js) reject a rewrite that invents a
  number, employer, title, date, qualification or name. Do not weaken, bypass
  or delete that check, and do not delete the test that asserts the refusal.
- No scraping, no automated submission, no cookie or session import. Capture
  refuses LinkedIn, Indeed and Glassdoor URLs by design.
- CSP is script-src 'self': no inline script, no inline event handler, no
  remote asset. Behaviour goes in a served .js file.
- Express is the only runtime dependency. Ask before adding another.
- British English, plain and specific. check.js fails hype vocabulary.
- Stage named paths (git add <path>) after reading git status --short. Never
  git add -A. Leave another agent's uncommitted files alone.
- Never commit data/, .env or .env.local, and never read or print a secret.
- Restart the server by the PID that owns port 3160, not by guessing a
  process name.
- One process per database.

Work on one concern, keep the tree green, commit with a subject like
"<area>: <what changed>", and push with git push origin main (and
git push backup main). If a task needs Stripe keys, DNS, VAT or a model key,
stop and say so: those are Johan's.
```
