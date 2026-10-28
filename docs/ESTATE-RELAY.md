# Applywright — Estate relay

*For an Estate orchestrator taking this project over when Claude or Codex usage returns.
This is a relay, not a second brief: it records what changed since
[`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) was written, what is in flight right
now, and the first four actions to take. It assumes you will delegate rather than write.*

Measured 2026-10-28 (late morning, Europe/London) against the tree itself. Re-measure
before quoting anything — several agents are still writing.

---

## 0. Read order

1. [`PROJECT-STATUS.md`](PROJECT-STATUS.md) — what the product is, stack, routes, modules.
2. [`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) — settled decisions, file
   ownership, the five mistakes, the delegation pattern. **Still accurate; start there.**
3. [`OVERNIGHT-BRIEF.md`](OVERNIGHT-BRIEF.md) — the unattended operating contract.
4. [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) — the queue, with owners and
   acceptance checks.
5. [`PIPELINE.md`](PIPELINE.md) — branch, commit, gate, push.
6. This file, then [`CLAUDE-CODEX-NOTES.md`](CLAUDE-CODEX-NOTES.md) if a Claude Code or
   Codex session will do the writing.

---

## 1. Where it is, and why isolation is already solved

| Fact | Value |
|---|---|
| Path | `C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright` |
| Kind | its own git repository; `.git` lives here, not in the hub |
| Branch | `main`, tracking `origin/main` |
| Public remote | `origin` → `https://github.com/johancilliers22/applywright.git` |
| Local backup remote | `backup` → `../applywright-remote.git` (bare copy on this machine) |
| Licence | MIT (`LICENSE`, `package.json`) — fork-only collaboration, see [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Vault note | `luna-vault/Luna Vault/brain/applywright-platform.md` — the only vault file this project may write |

- **Not a hub package.** The hub's `.gitignore:66` (`projects/*/`) matches every project
  directory, so the hub cannot see these files: **no hub commit is involved**, and **no
  worktree isolation is needed** for a hub mission — the repo is already isolated.
- **The hub checkout does not provision it.** An agent that only has the hub tree has no
  Applywright sources. The project path must exist on the machine.
- **Parallel work, if you ever want it**, is ordinary git inside `projects/`:

  ```powershell
  cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects
  git -C applywright worktree add ../applywright--<slug> -b wt/<slug>
  ```

  Each worktree is a separate checkout: it needs its own `npm install`, gets its own
  `data/` (so its own SQLite file), and if you boot two at once give them different
  `PORT`s — port 3160 is one instance per database. Do not share one checkout between
  Windows and WSL (`node_modules` is platform-specific; `FORK-AND-RUN.md` §2).
- There is **no `AGENTS.md` and no `CLAUDE.md` in this repository** (checked). The estate
  rules in the hub's `AGENTS.md` bind anyway: named-path commits, no secret reads,
  PID-scoped process kills, no computer use in unattended runs.

---

## 2. State measured at relay

```powershell
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
git log --oneline -1
git status --short
git status -sb
```

| Fact | Measured 2026-10-28 |
|---|---|
| HEAD | `24eb0e7` *"Remove the dead dailyDigest label from the SPA; mark the handoff's historical lines"* |
| Sync | `## main...origin/main` — no ahead/behind, so `origin` matches local |
| Tree | **clean when measured**; within minutes the in-flight agents began writing (`docs/OVERNIGHT-LOG.md`, `docs/SHARE.md`, new `screenshots/`). Re-check `git status --short` before staging |
| Tracked files | **148** |
| Node / npm | `v26.12.1` / `12.2.1` (floor is 22.5, for `node:sqlite`) |
| Gate: `node --test tests/` | **113 pass, 0 fail, 0 skipped** |
| Gate: `node --test server/lib server/provider` | **309 pass, 0 fail**, 12 suites |
| Gate: `node scripts/check.js` | `applywright check — 10 pages, 24 server modules, 253 css classes` / `ok — 0 errors, 0 warning(s)`, exit 0 |
| Running server | listener `127.0.0.1:3160`, PID `13520`; `/api/health` → `status ok`, `provider "rules"`, `stripe false`, 44 cached jobs |
| Tunnel | one `cloudflared` process (PID `38788`); **confirm its target before telling anyone the demo is reachable** |
| Vault | `brain/applywright-platform.md` exists |
| Keys | no `.env`, no `.env.local`; `MODEL_API_KEY`, `ANTHROPIC_ORG_API_KEY` and `STRIPE_SECRET_KEY` all unset in the environment |

Two documents are stale on this point, so trust the run rather than the prose:

- `PIPELINE.md` §1 records HEAD `7b88acc`; two commits landed after it (`01c4c23`,
  `24eb0e7`). Its repo/remote/gate sections are otherwise right.
- The sibling hub stub `agent-system/docs/diagnostics/APPLYWRIGHT-PROJECT-STATUS-20261028.md`
  still says branch `master`, 126 files, "no remote", and 80/303 gates. That was true when
  it was written; the relay stub
  `APPLYWRIGHT-RELAY-ESTATE-20261028.md` carries the current state.

---

## 3. Workstreams: who did what, and what is in flight

Workers edit; the orchestrator commits named paths and pushes, so **every commit is
authored by Johan's account**. Attribution below is by the session's assigned scopes, not
by commit author. Evidence commits are from `git log --oneline`.

| Workstream | Surface | Evidence (commit or file) |
|---|---|---|
| `site-aw` | marketing pages `public/*.html`, `site.css`, `site.js` | `342d621` (hero as proof sheet); the pages are present under `public/` |
| `app-ui-aw` | product SPA `public/app/{app.html,app.js,app.css}` | `24eb0e7`; the three SPA files are present |
| `security-aw` | `/security` compliance page | `public/security.html`; `/security` in the `PAGES` map |
| `bookmarklet-aw` | `public/assets/bookmarklet.{src.,}js`, `GET /bookmarklet`, Settings block | both assets present; `GET /bookmarklet` in `server/app.js`; `checkBookmarklet` in `scripts/check.js` |
| `share-aw` | `scripts/share.ps1`, `scripts/share-stop.ps1`, `SHARE.md` | all three files present |
| `domain-aw` | `DOMAIN.md`, `intelligentartificial.net` brand prep | `docs/DOMAIN.md`; the `site` block in `server/config.js` |
| `design-lead` | `tokens.css`, `theme.css`, `motion.css`, `theme.js`, `design/SPEC-V2.md`, Pressproof | `342d621`, `6cb8d47` |
| `extract-aw` | `server/lib/cv/extract.js` (pdf/odt/rtf/html, native→WSL chain), `extract.test.mjs` | `a35020e`; the dedicated suite in `server/lib/cv/extract.test.mjs` (42 tests when measured) |
| `a11y-aw` | `design/ACCESSIBILITY-AUDIT.md`, marketing a11y pass | `0f19177` (44 → 0 WCAG-tagged violations) |
| `auth-aw` | recovery codes, reset tokens, change-password, `PASSWORD-RECOVERY.md` | `6cb8d47`, `tests/auth-recovery.test.js` |
| `editor-aw` | `public/editor.html`, `public/assets/editor.{css,js}`, `tests/editor.test.js`, `EDITOR.md` | `4c5ace8` |
| `flags-aw` | entitlement enforcement, `stripe_events` idempotency (schema v3) | `7b88acc` |
| `docs-reconcile-aw` | reconciled `README.md`, `PIPELINE.md`, `PROJECT-STATUS.md`, plan | `01c4c23` |
| `friend-handoff-aw` | `FORK-AND-RUN.md`, `docs/HANDOFF-FOR-A-FRIEND.md`, `CONTRIBUTING.md` | `20ae5b7` |
| `orchestrator-handoff-aw` | `docs/ORCHESTRATOR-HANDOFF.md` | `3254214` |
| `handoff-aw` | `PROJECT-STATUS.md`, `IMPLEMENTATION-PLAN.md`, `PIPELINE.md`, `VAULT-PATCH.md`, hub stub; now this relay | earlier handoff commits |
| `polish-aw` | motion and marketing accessibility polish | folded into `0f19177`, `6cb8d47` |

**In flight at relay time — three agents plus one research subagent.** Their ledgers did
not exist yet when this file was written; check before citing them.

| Owner | Task | Expected file (not present yet) |
|---|---|---|
| `flow-aw` | End-to-end browser verification: sign-up → upload PDF/DOCX/OCR → score → tailor → editor proposals → exports → tracking → alerts → recovery | `docs/E2E-VERIFICATION.md` |
| `motion-aw` | Motion inventory, interaction feedback, reduced-motion, CPU-throttled jank numbers | `docs/MOTION.md` |
| `design-lead` | UX review of `/editor`, `/app`, `/sign-in`, `/sign-up`, `/reset`, with screenshots and fixes | `docs/design/UX-REVIEW-20261028.md` |
| Gemini 4 Argon subagent | SOTA research: ATS reality, competitor teardown, grounded-rewrite gap, pricing, distribution | `docs/research/SOTA-20261028.md` |

---

## 4. Blocked on Johan, and only Johan

Measured state for each, so you can tell "blocked" from "nobody got to it".

| Item | Evidence it is blocked | What to ask for |
|---|---|---|
| **Stripe keys** | `/api/health` reports `"stripe": false`; `STRIPE_SECRET_KEY` unset; no `.env.local`. Checkout, portal and webhook answer 501. Idempotency shipped in `7b88acc` but has never seen a real event | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the four `STRIPE_PRICE_*` IDs; a test-mode account is enough to verify 5.4/5.5 |
| **DNS at GoDaddy + Cloudflare tunnel** | `DOMAIN.md` §0 states nothing has been executed: no record, tunnel, host or certificate; the zone is delegated to GoDaddy nameservers | Registrar access to switch/confirm nameservers, the Cloudflare account, tunnel creation, and the TLS-mode decision. Do not plan work that assumes a hostname exists |
| **VAT** | `plans.js` states prices are exclusive of VAT and computes no VAT (`VAT` appears twice, both in comments) | The rate, and whether displayed prices are inclusive. A legal decision, not an engineering one |
| **Model key** | `MODEL_API_KEY` and `ANTHROPIC_ORG_API_KEY` unset; no `.env`/`.env.local`; health says `provider "rules"`; seed packs report `mode: rules` | One key and the provider choice (DeepSeek/OpenAI-compatible, or `ANTHROPIC_ORG_API_KEY`). The product works without it; `mode` is honest |

Never put a key on a command line, in a remote URL, or in a document; it lands in shell
history and process listings. Keys go in `.env.local` (gitignored) or the service
manager's env file and need a restart because config is read once at boot.

Also not planned work: the **tunnel state**. One `cloudflared` is alive; find out what it
serves before describing the demo as public.

---

## 5. Settled decisions — do not relitigate

Full reasoning and file evidence: [`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) §3.
The short form:

- Product **Applywright**; company and site **Intelligent Artificial** at
  `intelligentartificial.net` (`DOMAIN.md` §0).
- Slogan **"Your numbers stay. The wording moves."**, proof line **"Nothing invented."**
  Never the old tagline as a heading (`design/SPEC-V2.md` §2).
- Design language **Pressproof**: paper for artefacts, desk for controls
  (`design/SPEC-V2.md` §1).
- Licence **MIT**; collaboration **fork-only**, no collaborator invites.
- **No LinkedIn OAuth, no scraping, no automated submission.** Capture is user-initiated;
  a pack ends at `pack_ready` (`SPEC.md` §1; `BLOCKED_CAPTURE_HOSTS` in `server/app.js`).
- **Grounding is non-negotiable.** `assertGrounded` (`server/lib/cv/tailor.js`) and
  `groundChanges` (`server/lib/cv/refine.js`) may never be weakened to make a rewrite pass.
- **Recovery without email**: recovery codes at sign-up, single-use expiring reset tokens,
  operator CLI (`scripts/reset-password.mjs`).
- The **public demo stays open** (`REGISTRATION_OPEN=1`) unless the log says otherwise.
- **Billing integrity is no longer an open item.** `7b88acc` enforced `fullAtsReport`,
  `coverLetter` and `packHistory`, removed `dailyDigest`, and made the webhook idempotent
  via `stripe_events` (schema v3). `apiAccess`, `priorityRefresh` and `bulkExport` remain
  declared and returned, not gated — that is deliberate, not drift.
- Structural: **one process per database** (in-process rate limits, feed cache, alert
  scanner; SQLite has one writer) and **no build step** (what is in `public/` is what the
  browser gets).

Because of the billing work, the queue in `IMPLEMENTATION-PLAN.md` and the "genuinely
left" table in `ORCHESTRATOR-HANDOFF.md` §6 are partly behind the tree: items 5.1 and 5.4
shipped. Read the plan as intent and `git log` as truth.

---

## 6. Do not

- **Do not write the vault except the one authorised note** —
  `Luna Vault/brain/applywright-platform.md`. No `_index.md` edits, no second note. Log
  every vault write in [`OVERNIGHT-LOG.md`](OVERNIGHT-LOG.md).
- **Do not import cookies or browser sessions**, and do not add scraping, crawling or
  automated submission. The blocked hosts are blocked because their terms forbid it, not
  because nobody got round to it.
- **Never weaken grounding** or delete a test that asserts the refusal. The refusal is the
  product.
- **Never read or print secret stores** (`~/.ruflo/secrets.env`, any `.env`, token files).
  Use the environment or the tool's own sign-in.
- **No computer use unattended.** `estate-cua` is for interactive sessions; headless runs
  stay closed until B6.4. For browser checks use headless Chrome over CDP — the pattern is
  `scripts/browser-preview.mjs`, with `scripts/seed.mjs` for the demo account.
- **Do not touch hub tracked files.** Commit only inside `projects/applywright`.
- **Never `git add -A`.** Stage named paths after reading `git status --short`; another
  agent's uncommitted work is not yours to commit, revert or judge.
- **Do not commit `data/`, `.env`, `.env.local` or any key.** All are gitignored; the
  remote is public, so history is not private.
- **Do not restart the server by command-line guess.** Find the PID that owns 3160 and
  kill that PID — a stale process cost two debugging rounds already.

---

## 7. First four actions, in order

Run from the project root unless a step says otherwise.

### 1. Establish ground truth

```powershell
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
git log --oneline -1
git status --short
git fetch origin
git status -sb
```

Expect `24eb0e7`, a clean tree, and `## main...origin/main` with no ahead/behind. If the
tree is dirty, that is another agent's work in progress — do not stage it; read it and
work around it (`PIPELINE.md` §2).

### 2. Re-measure the gate

```powershell
node --test tests/
node --test server/lib server/provider
node scripts/check.js
```

Expect **113 pass**, **309 pass** (12 suites), and
`10 pages, 24 server modules, 253 css classes` / `ok — 0 errors, 0 warning(s)`, exit 0.
If a number differs, the tree moved — trust the run, and update
`PROJECT-STATUS.md` §7 if it is a lasting change. A non-zero exit is a failure; a summary
without the output is not a result.

### 3. Read the contract and check what the in-flight agents produced

```powershell
Get-Content docs\OVERNIGHT-BRIEF.md
Get-Content docs\ORCHESTRATOR-HANDOFF.md
Get-ChildItem docs -Filter *.md | Select-Object Name
```

Read `IMPLEMENTATION-PLAN.md` next for the queue. Then check whether
`docs/E2E-VERIFICATION.md`, `docs/MOTION.md` and `docs/design/UX-REVIEW-20261028.md`
exist yet; if they do, read them before choosing work, because each may have found a
defect that outranks the queue.

### 4. Take exactly one queue item

```powershell
git switch -c <area>/<short-slug>
# work, then:
node --test tests/
node --test server/lib server/provider
node scripts/check.js
git status --short
git add <named paths>
git commit -m "<area>: <what changed>"
git push origin main
git push backup main
```

Pick from `IMPLEMENTATION-PLAN.md`, reconciled against `git log`. Highest value per hour
at relay time: contrast assertions inside `check.js` (2.3/7.4), `axe-core` over the pages
(2.4/7.5), the `.aw-folio`/redline trace (3.3/3.4), consuming the bookmarklet's `title`,
`company` and `blocked` in the SPA (4.3), `pm2` supervision and backups (6.7/6.8), and the
bookmarklet-guard regression test (7.8 — it needs a full project copy, not a partial one).
If the item you want is in §4, stop and report instead of starting.

---

## 8. Handoff chain

```text
PROJECT-STATUS.md      what it is
ORCHESTRATOR-HANDOFF   decisions, ownership, mistakes, delegation
OVERNIGHT-BRIEF        operating contract for an unattended session
IMPLEMENTATION-PLAN    the queue with owners and acceptance checks
PIPELINE               git, gates, push
ESTATE-RELAY           this file: current state, in flight, first four actions
CLAUDE-CODEX-NOTES     harness-specific orientation and a paste-ready prompt
FRIEND-COPY            how a friend copies the repo (fork, zip, bundle)
```

Related: `docs/EDITOR.md`, `docs/PASSWORD-RECOVERY.md`, `docs/LINKEDIN-CAPTURE.md`,
`docs/design/SPEC-V2.md`, `docs/design/ACCESSIBILITY-AUDIT.md`, `FORK-AND-RUN.md`,
`CONTRIBUTING.md`. Hub-side stub:
`agent-system/docs/diagnostics/APPLYWRIGHT-RELAY-ESTATE-20261028.md`. Vault:
`brain/applywright-platform.md`.
