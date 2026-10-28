# Applywright — Estate relay

**28 Oct current ownership:** the new Codex orchestrator is chat `01a183ff-e374-7d32-ae0e-1938714e813c`; do not create another. Native T3 review broker `46ac76de-4e76-42b4-a2b1-9f6d4e09c559` is live on JohansPC for the assigned finite reviews. Fresh candidate/gates: `86b74c3`, HTTP 150 pass, modules 346 pass/1 skip, static 0 errors/0 warnings (`verification/20261028-intake/gates.json`). E2E/live model NOT RUN. Estate remains the sole shared publisher and Hermes owner; Root's heartbeat remains with Root. Current commission and `CODEX-ORCHESTRATOR-HANDOFF.md` supersede older recipes and ownership wording below.

*For an Estate orchestrator taking this project over. Codex usage has returned and the Codex
desktop chat is now the main orchestrator and validator — see
[`CLAUDE-ESTATE-RELAY.md`](CLAUDE-ESTATE-RELAY.md) for the handover, the validation checklist
and how to create that chat. This file remains the project-state relay: what changed since
[`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) was written, what is in flight, and the
first four actions. It assumes you will delegate rather than write.*

Measured 2026-10-28 (evening, Europe/London) against the tree itself. Re-measure before
quoting anything — the tree moves under several writers.

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
| HEAD | `e5b04f0` *"Handoff finals, and three corrections the handoff review found"* (committed 2026-10-28 17:02Z); the handoff baseline it descends from is `34d23a6` |
| Sync | `## main...origin/main` — no ahead/behind, so `origin` matches local |
| Tree | **clean when measured**; several writers are still active, so re-check `git status --short` before staging |
| Tracked files | **332** |
| Node / npm | `v26.12.1` / `12.2.1` (floor is 22.5, for `node:sqlite`) |
| Gate: `node --test tests/` | **150 pass, 0 fail, 0 skipped** |
| Gate: `node --test server/lib server/provider` | **338 tests: 337 pass, 0 fail, 1 skipped**, 12 suites. The skip is the WSL-`pdftotext` fallback case, skipped because native Poppler is now on `PATH` |
| Gate: `node scripts/check.js` | `applywright check — 10 pages, 24 server modules, 263 css classes` / `ok — 0 errors, 0 warning(s)`, exit 0 |
| E2E | `node scripts/e2e-flow.mjs` → **10/10 steps, 235/235 assertions, exit 0** (about 48 s, its own `PORT 0` instance and temp database), re-verified at `34d23a6` |
| Running server | listener `127.0.0.1:3160`, PID `64064`; `/api/health` → `status ok`, `provider "live"`, `stripe false`, 84 cached jobs |
| Tunnel | **two** `cloudflared` processes: one quick tunnel serving `http://127.0.0.1:3160`, one named tunnel with no `--url`. The current public URL is `docs/SHARE.md` § "Current live URL" (`https://bumper-naturals-raises-thickness.trycloudflare.com` when measured, `/api/health` 200) |
| Vault | `brain/applywright-platform.md` exists and was refreshed 16:52Z with the orchestration handover |
| Keys | no `.env`, no `.env.local` and no key in this shell; the **running** server holds a model key injected on stdin by `scripts/model-boot.mjs`, which is why health says `live` and an assist call returns `mode: model` |

Docs lag this tree, so trust the run rather than the prose:

- `PIPELINE.md` §1 records HEAD `24eb0e7` and 148 tracked files; §4 records 113 / 309 / 253.
  Today: `e5b04f0`, 332 files, 150 / 337+1 skip / 263. Its repo and remote sections are right.
- `PROJECT-STATUS.md` §7 still records 113 / 309 / 253 css classes. Its §9 does correctly say
  the `apiAccess` / `priorityRefresh` / `bulkExport` flags were removed, not left unenforced.
- The hub stubs in `agent-system/docs/diagnostics/` are older still (branch `master`, 126 files,
  "no remote", 80/303 gates). `APPLYWRIGHT-RELAY-ESTATE-20261028.md` is the newer of the two;
  neither is committed to the hub.
- `E2E-VERIFICATION.md` records product commit `706b741`; HEAD is 10 commits past it. The harness
  passes today (see the E2E row above), but the recorded commit needs re-recording — a docs edit,
  not a behaviour change.

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

**Delivered since this file was first written — all four ledgers now exist:**

| Owner | Result | File |
|---|---|---|
| `flow-aw` | End-to-end browser journey: 10 steps, 235 assertions, exit 0; recorded at product commit `706b741` | `docs/E2E-VERIFICATION.md` |
| `motion-aw` | Motion inventory and measurements: 0 frames over 32 ms at 6× CPU, 0 long tasks | `docs/MOTION.md` |
| `design-lead` | UX review of `/editor`, `/app`, `/sign-in`, `/sign-up`, `/reset`, with screenshots and fixes | `docs/design/UX-REVIEW-20261028.md` |
| Gemini 4 Argon subagent | SOTA research; 13 marketing copy claims corrected against the code | `docs/research/SOTA-20261028.md` |

**Landed after that:** the visual release (`bc9eba9`..`706b741`), grounding fixes (`bdbc927`),
the T3 mission setup (`eb83c41`), the Codex handoff pair (`dcd754e`: `CODEX-ORCHESTRATOR-HANDOFF.md`
plus `CLAUDE-ESTATE-RELAY.md`), the VAT copy close (`34d23a6`), handoff finals (`e5b04f0`), and new
docs `T3-MISSIONS.md`, `MODEL-CONFIG.md`, `ARTWORK.md`, `PAGE-COMPOSITION.md`. Codex is now the main
orchestrator; DSH implements; T3 tracks. See `CLAUDE-ESTATE-RELAY.md`.

---

## 4. Blocked on Johan, and only Johan

Measured state for each, so you can tell "blocked" from "nobody got to it".

| Item | Evidence it is blocked | What to ask for |
|---|---|---|
| **Stripe keys** | `/api/health` reports `"stripe": false`; `STRIPE_SECRET_KEY` unset; no `.env.local`. Checkout, portal and webhook answer 501. Idempotency shipped in `7b88acc` but has never seen a real event | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the four `STRIPE_PRICE_*` IDs; a test-mode account is enough to verify 5.4/5.5 |
| **DNS at GoDaddy + Cloudflare tunnel** | `DOMAIN.md` §0 states nothing has been executed: no record, tunnel, host or certificate; the zone is delegated to GoDaddy nameservers | Registrar access to switch/confirm nameservers, the Cloudflare account, tunnel creation, and the TLS-mode decision. Do not plan work that assumes a hostname exists |
| **VAT** | Copy is now consistent on "include any applicable tax" (`34d23a6` closed the last `/app` contradiction), but no VAT is modelled anywhere and the scale/copy decision is still open | The rate, inclusive-or-exclusive policy, and whether to model a VAT line at all. A legal decision, not an engineering one |
| **Model key** | **No longer blocked.** The running server was booted with a key through the estate loader (`scripts/model-boot.mjs`, key on stdin, never on a command line); `/api/health` says `provider "live"` and an assist call returns `mode: model`. No key sits in this shell, `.env` or any file | Nothing, unless the process is restarted with a plain `node server/index.js` — that reverts to `rules` mode by design, and the UI says so |

Never put a key on a command line, in a remote URL, or in a document; it lands in shell
history and process listings. Keys go in `.env.local` (gitignored) or the service
manager's env file and need a restart because config is read once at boot.

Also not planned work: the **tunnel state**. Two `cloudflared` processes are alive — a quick
tunnel serving `127.0.0.1:3160` and a named tunnel that is not this project's. `SHARE.md`
§ "Current live URL" is the one to trust, and it must be replaced whenever the quick tunnel
restarts, because quick-tunnel hostnames do not survive a restart.

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
  `coverLetter` and `packHistory`, and made the webhook idempotent via `stripe_events`
  (schema v3). `64edb96` cut the declared flag list to that enforced set, so `FLAG_FEATURES`
  equals `ENFORCED_FLAGS`: Scale is a quota tier — it adds unlimited CVs and packs and 50
  saved alerts, not features. That is deliberate, not drift.
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

Expect `e5b04f0` or a descendant, a clean tree, and `## main...origin/main` with no ahead/behind. If the
tree is dirty, that is another agent's work in progress — do not stage it; read it and
work around it (`PIPELINE.md` §2).

### 2. Re-measure the gate

```powershell
node --test tests/
node --test server/lib server/provider
node scripts/check.js
```

Expect **150 pass**, **337 pass with the one documented skip** (338 tests, 12 suites), and
`10 pages, 24 server modules, 263 css classes` / `ok — 0 errors, 0 warning(s)`, exit 0.
If a number differs, the tree moved — trust the run, and update
`PROJECT-STATUS.md` §7 if it is a lasting change. A non-zero exit is a failure; a summary
without the output is not a result.

### 3. Read the contract and check what the in-flight agents produced

```powershell
Get-Content docs\OVERNIGHT-BRIEF.md
Get-Content docs\ORCHESTRATOR-HANDOFF.md
Get-ChildItem docs -Filter *.md | Select-Object Name
```

Read `IMPLEMENTATION-PLAN.md` next for the queue. The four ledgers this file once listed as
pending now exist — read `docs/E2E-VERIFICATION.md`, `docs/MOTION.md` and
`docs/design/UX-REVIEW-20261028.md` before choosing work. Then read
`docs/CLAUDE-ESTATE-RELAY.md`: Codex now orchestrates and validates, DSH implements, and T3
tracks, so the queue is executed through that handover rather than started here.
`node scripts/e2e-flow.mjs` confirms the journey still passes (about 48 s).

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
CLAUDE-ESTATE-RELAY    Codex handover: validation checklist, create the Codex chat, T3 boundary
CLAUDE-CODEX-NOTES     harness-specific orientation and a paste-ready prompt
FRIEND-COPY            how a friend copies the repo (fork, zip, bundle)
```

Related: `docs/EDITOR.md`, `docs/PASSWORD-RECOVERY.md`, `docs/LINKEDIN-CAPTURE.md`,
`docs/design/SPEC-V2.md`, `docs/design/ACCESSIBILITY-AUDIT.md`, `FORK-AND-RUN.md`,
`CONTRIBUTING.md`. Hub-side stub:
`agent-system/docs/diagnostics/APPLYWRIGHT-RELAY-ESTATE-20261028.md`. Vault:
`brain/applywright-platform.md`.
