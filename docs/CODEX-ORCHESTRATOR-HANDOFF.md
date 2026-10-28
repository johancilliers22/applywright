# Applywright — Codex orchestrator handoff

**22:36 UTC checkpoint:** contrastM1 R4 independently reviewed PASS_SOURCE, exactly integrated and accepted after all3gates: HTTP171PASS, modules346PASS/1SKIP, static58comparisons/0errors0warnings. Plan2.3/7.4 closed for the bounded token contract. G1R3 passes80units/all131independent cases but still needs NEW independent Sol review/integration/gates. E2EDSHR2 remains active after seven R1findings; native qualifier/browser journey unproved. Live site preserved, no deployment. Actual receipt index: [`verification/20261028-intake/CURRENT-CHECKPOINT.md`](verification/20261028-intake/CURRENT-CHECKPOINT.md).

For a **Codex desktop chat that has never seen this project** and is now its main orchestrator and
validator. Johan's 28 Oct decision: Codex owns the plan, routing and accept/reject call; DSH
(DeepSeek) implements; T3 Mission Control tracks and delegates. Read
[`T3-MISSIONS.md`](T3-MISSIONS.md) (T3 procedure), [`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md)
(decisions and ownership in full), [`MODEL-CONFIG.md`](MODEL-CONFIG.md) (the product's model path),
[`PROJECT-STATUS.md`](PROJECT-STATUS.md), [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md),
[`PIPELINE.md`](PIPELINE.md) and [`../FORK-AND-RUN.md`](../FORK-AND-RUN.md).

## 1. What this is and where it lives

| Fact | Value |
|---|---|
| Product | Applywright — one CV, scored and tailored per job advert, grounded in facts already in the CV |
| Path | `C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright` |
| Kind | its own git repository, branch `main`; `.git` here, not in the hub |
| Public remote | `origin` → `https://github.com/johancilliers22/applywright.git` (public, MIT) |
| Backup remote | `backup` → `../applywright-remote.git` (bare copy on this machine) |
| Stack | Node 22.5+ (tested v26.12.1), Express 5 only, SQLite via `node:sqlite`, hand-written CSS, no build step |
| Vault note | `luna-vault/Luna Vault/brain/applywright-platform.md` — the only vault file this project may write |
| Live locally | `node server/index.js` → `http://127.0.0.1:3160` (one process per database) |
| Live publicly | quick tunnel `https://bumper-naturals-raises-thickness.trycloudflare.com` ([`SHARE.md`](SHARE.md) §"Current live URL") |

- **No hub commit, no worktree isolation.** The hub's `.gitignore:66` (`projects/*/`) hides every
  project directory, so `agent-system` cannot see these files and a hub mission needs no worktree. A
  session with only the hub tree has **no Applywright sources**.
- **Measured at handoff** (2026-10-28, late afternoon; commands in §8). HEAD moves as agents commit
  and the tree may be dirty — re-measure before quoting.

  ```text
  HEAD 34d23a6 "Close the last VAT contradiction: the /app billing copy said 'excluding VAT'";
  main == origin/main; 332 tracked files · 150 pass / 0 fail · 337 pass, 0 fail, 1 skipped, 12 suites
  check.js 0 errors, 0 warnings · E2E 10/10 steps, 235/235 assertions, exit 0, 19.8 s
  server 127.0.0.1:3160 PID 64064, health provider "live", stripe false, 84 cached jobs
  tunnel /api/health 200; no .env or .env.local in the tree
  ```

  The tunnel is a quick tunnel whose hostname dies on restart, and two `cloudflared` processes may
  be alive — confirm which serves 3160 before calling the demo public, and update
  [`SHARE.md`](SHARE.md).

## 2. The delegation model Johan has chosen

| Role | Who | Note |
|---|---|---|
| Orchestrator and validator | **Codex desktop chat** (this one) | owns decomposition, provider/model choice, evidence and accept/reject |
| Bulk implementation | **DSH (DeepSeek harness) subagents** | cheapest per unit of work, full tool access, write access under the estate rules |
| Mission tracking and independent review | **T3 Mission Control** | ledger, receipts, routing, delegated `codex-*` review/test children |
| Product's own AI editing | **Claude org credits, direct API** | `ANTHROPIC_ORG_API_KEY` through the estate loader — the *product* calling a model, not a delegation route |

- **The T3 Claude-agent route is disabled by policy.** `ROLES.json` carries
  `providerPolicy.claudeAgent.enabled=false` with a recorded reason and `earliestRetryAt`, and
  `mission.cjs` refuses a paused provider (`mission.cjs:141`). Do not flip it silently. The
  `claude-*` presets are defined and work once Johan sets `enabled: true` and records why; a reset
  date enables nothing and schedules nothing.
- **Native T3 capability and the standalone pack schema are separate.** Root's commission records an actual estate dispatch through `acpRegistry_deepseek_ubuntu`; the universal claim that T3 cannot dispatch DSH was stale. This project's fresh Windows picker exposes DeepSeek Harness - Windows. Use the broker's current `orchestrator_capabilities` receipt for exact provider IDs/options. The unchanged pack roster defines Codex/Claude roles only; do not silently edit it or invent a DSH pack role.
- **Codex's write surface is not granted by the pack** — the operator assigns it, which is why the
  three specs in `docs/t3/` are read-only or evidence-only.

## 3. The gates as a contract

```powershell
node --test tests/                       # HTTP, storage, auth, isolation, billing, errors
node --test server/lib server/provider   # pure modules and provider routing
node scripts/check.js                    # pages, includes, assets, CSP, secrets, bookmarklet
```

- **Green means exactly two things:** 0 failures from both `node --test` runs, 0 errors from
  `check.js`. The exit code is the answer; a summary around a non-zero exit is not a result. There is
  **no CI**, no lint and no type checker — `.github/` holds only `ISSUE_TEMPLATE.md` — so the gate
  and a read of the diff are the whole review.
- **Warnings are acceptable only from a file another agent is writing right now.** Never silence one
  to look green; `node scripts/check.js --strict` fails on warnings and is the setting for a commit
  you plan to defend.
- **A check that cannot print its verdict is indistinguishable from a passing one.** A partial copy
  of the project (only `scripts/` and `public/`) made `checkServer()` throw before the summary line,
  so no `FAIL` appeared and a deliberately broken bookmarklet "passed" — a false green that produced
  one wrong conclusion already ([`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) §P7, footnote to
  7.8). Any delegated harness must print a machine-readable verdict; if you cannot see it, the check
  failed.
- **A child's "done" is not a gate result.** Demand the three commands' output; a completed T3 task
  is not an accepted mission.

## 4. How work is routed here

| Task type | Owner | Route and surface |
|---|---|---|
| Implementation, refactors, components, docs edits | **DSH subagent** | one disjoint write scope per run via the DSH launcher (below) |
| Plan, decomposition, acceptance | **Codex (you)** | this thread; the plan goes to `docs/` or a T3 evidence file, not into the product |
| Independent review of a correctness-critical module | **`codex-reviewer`** | `docs/t3/applywright-review-r1.json`, read-only, committed candidate |
| Test verification (gates + E2E) | **`tester`** | `docs/t3/applywright-test-r1.json`; reports results and NOT RUN items |
| Next-sprint planning against the tree | **`codex-planner`** | `docs/t3/applywright-plan-r1.json` |
| Product model path | **DSH**, with the §8 proof | `server/model.js`, `server/provider/anthropic.js`, `server/lib/cv/refine.js` |
| Verification scripts | whoever owns the file | `scripts/check.js`, `scripts/e2e-flow.mjs`, `scripts/seed.mjs`; gate re-run required |

**T3 entry points.** Pack at `C:\Users\johan\Desktop\Coding\t3-mission-control`: `SKILL.md` (workflow
and rules), `ROLES.json` (routing and `providerPolicy`), `mission.cjs` (ledger CLI),
`mission.example.json` (spec shape). Ledgers live in that pack's `missions/<id>/mission.json`, not in
this repo.

```powershell
$T3 = "C:\Users\johan\Desktop\Coding\t3-mission-control"
node "$T3\mission.cjs" create "C:\...\applywright\docs\t3\applywright-plan-r1.json"   # replace the placeholder parentThreadId first
node "$T3\mission.cjs" prepare <mission-id> <task-key> <capabilities.json>            # save T3's capabilities structuredContent first
# call T3 delegate_task with exactly the emitted arguments, save its structuredContent,
# add clientRequestId from the dispatched payload, then record it:
node "$T3\mission.cjs" record <mission-id> <task-key> <receipt.json>
node "$T3\mission.cjs" show <mission-id>                   # read the ledger; record the status receipt when the child finishes
node "$T3\mission.cjs" accept <mission-id> <evidence.md>   # review yourself, then accept on evidence
```

- **The coordinator is the sole ledger writer.** Children never touch it; `add` starts a round,
  `supersede` replaces a settled failed attempt, cancellation goes through T3's `task_cancel`. A
  transport error after dispatch is an **unknown outcome**: keep the request id, retry only that.
- **DSH launcher** (one write scope per run; the receipt directory must not exist yet):

  ```powershell
  wsl -e /home/johan/.local/bin/estate-dsh-run --runtime wsl `
    --task-file /mnt/c/.../brief.md --receipt-dir /mnt/c/.../receipts/<slug> `
    --cwd /mnt/c/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright `
    --mode write --slots 2 --timeout 1800
  ```

  The task file is the brief (objective, owned files, acceptance check, constraints); the wrapper
  injects the DeepSeek key, so never put a key on the command line. Parallel runs need separate
  worktrees — two DSH runs in one checkout race: `git -C "...\projects\applywright" worktree add
  ..\applywright--<slug> -b wt/<slug>`.

## 5. File ownership map

One writer per surface; contracts are read-only unless changing them is the task ([`SPEC.md`](SPEC.md)
§5 wins on behaviour, [`design/SPEC-V2.md`](design/SPEC-V2.md) on design).

| Surface | Files | Watch for |
|---|---|---|
| Server spine | `server/index.js`, `app.js`, `config.js`, `db.js`, `store.js`, `auth.js`, `model.js`, `pages.js`, `util.js`, `alerts-runner.js`, `provider/anthropic.js` | routes are the contract in `SPEC.md` §6 |
| Library modules | `server/lib/text.js`, `server/lib/cv/*`, `server/lib/jobs/*`, `server/lib/packs/build.js`, `server/lib/billing/plans.js` | one agent per module against its `SPEC.md` §5 signature |
| Marketing pages | `public/*.html`, `public/partials/**`, `public/assets/site.css`, `site.js` | `check.js` fails on an undefined class: ship the rule with the class |
| Product SPA | `public/app/app.html`, `app.css`, `app.js` | hardcoded colours must survive the dark scheme |
| CV editor | `public/editor.html`, `public/assets/editor.{css,js}`, `tests/editor.test.js` | `server/app.js` imports `public/assets/editor.js`; moving it breaks boot |
| Theme layer | `public/assets/tokens.css`, `theme.css`, `motion.css`, `theme.js` | tokens are semver-safe: no rename, no delete |
| Tests, scripts | `tests/*.test.js`, `server/lib/**/*.test.mjs`, `scripts/check.js`, `e2e-flow.mjs`, `seed.mjs`, `model-boot.mjs`, `browser-preview.mjs`, `reset-password.mjs`, `share*.ps1` | fixtures, never the network or `data/`; a self-test needs a full project copy |
| Docs and T3 state | `docs/*.md`, `docs/t3/*.json`, `README.md`, `FORK-AND-RUN.md`, `CONTRIBUTING.md` | claim only what a command or file shows |

**Two CSS seams, and the rule that will tempt you.** The earlier handoff listed both as cleanup; one
is done and one is a trap.

1. **`tokens.css` — the dead `.reveal` block is gone.** `site.js` records the retirement of the
   scroll reveal, its observer and the `reveal-on` / `is-visible` classes, and `tokens.css` no longer
   carries them (**0 `reveal` matches**, 546 lines). Do not reintroduce the block, and do not delete
   `motion.css`'s page entrance thinking it is the same thing.
2. **`theme.css:103–111` — two rules that look redundant and are not.** They were deleted in the
   cleanup, a pixel diff caught it, and they were restored ([`OVERNIGHT-LOG.md`](OVERNIGHT-LOG.md)
   11:35 entry; `theme.css:62–91` explains why). `.brand__mark .m-ring` keeps the footer and auth
   aside ring at `#e8e6e1` instead of `#f5f2ea`, and `.btn--primary`'s `color` is load-bearing:
   site.css's `.section--dark a` outranks `.btn`'s colour, so without it the hero CTA paints
   `#f5f2ea` on the jade accent — **1.86:1** against **9.12:1** with it. The gate stays green either
   way; only a contrast assertion or a browser catches it.

## 6. Settled decisions — do not relitigate

| Decision | Encoded in |
|---|---|
| Product **Applywright**; company/site **Intelligent Artificial**, `intelligentartificial.net` | [`DOMAIN.md`](DOMAIN.md) §0; vault note |
| Slogan **"Your numbers stay. The wording moves."**; proof line **"Nothing invented."** | [`design/SPEC-V2.md`](design/SPEC-V2.md) §2; `public/index.html` |
| Design language **Pressproof** — paper for artefacts, desk for controls | [`design/SPEC-V2.md`](design/SPEC-V2.md) §1 |
| Licence **MIT**; collaboration **fork-only**, no collaborator invites | `../LICENSE`; [`../FORK-AND-RUN.md`](../FORK-AND-RUN.md) §2 |
| **No LinkedIn OAuth, no scraping, no automated submission**; a pack ends at `pack_ready` | [`SPEC.md`](SPEC.md) §1; `BLOCKED_CAPTURE_HOSTS` in `server/app.js` |
| **Grounding is non-negotiable** — `assertGrounded` / `groundChanges` are never weakened | `server/lib/cv/tailor.js`, `server/lib/cv/refine.js` |
| **Recovery without email** — recovery codes, expiring reset tokens, operator CLI | `server/app.js` auth routes, `scripts/reset-password.mjs` |
| **Open demo** — `REGISTRATION_OPEN=1` unless the log says otherwise | [`OVERNIGHT-BRIEF.md`](OVERNIGHT-BRIEF.md) |
| **Model routing** — Codex orchestrates and validates, DSH implements, T3 tracks, product calls Claude org credits directly, T3 Claude route paused | `ROLES.json`; [`T3-MISSIONS.md`](T3-MISSIONS.md) |
| **Scale is a quota tier, not a feature tier**; `FLAG_FEATURES` equals `ENFORCED_FLAGS` | `server/lib/billing/plans.js`; [`PROJECT-STATUS.md`](PROJECT-STATUS.md) §9 |

Structural and not up for redesign without Johan: **one process per database**, **no build step**; a
new runtime dependency is a Johan decision ([`PIPELINE.md`](PIPELINE.md) §6).

## 7. Five mistakes already made here

1. **Killing the server by command-line guess instead of the port-owner PID.** Two debugging rounds
   were spent reading stale code from a process nobody had restarted
   ([`OVERNIGHT-BRIEF.md`](OVERNIGHT-BRIEF.md)). Find the owner of 3160, kill that PID, confirm the
   banner on the next start.
2. **Trusting `node --check` on the bookmarklet.** Syntax is not a URL: a banner-first line, a
   doubled scheme or a line break makes a `javascript:` bookmarklet inert while `node --check` exits
   0. `check.js` now asserts it parses as a `javascript:` URL, carries one scheme and one
   `__ORIGIN__`, is one line and makes no network call. Edit `bookmarklet.src.js` and regenerate the
   artifact in the same change.
3. **A `git add -A` sweeping another agent's in-flight files into an unrelated commit.** The tree is
   routinely shared; `git status --short` before staging, then named paths only. Another agent's
   uncommitted work is not yours to commit, revert or judge.
4. **`/app` redirecting because `express.static` defaults to directory redirects.** Mounting
   `public/app` as static made `/app` 301 to `/app/` before the SPA shell was served;
   `server/app.js` mounts it with `redirect: false`. A framework default is a bug until you have
   watched the request.
5. **Documenting behaviour before verifying it.** Docs described features that did not exist (six
   design citations pointed at a missing `SPEC-V2.md`), a false-green check produced a confident
   wrong conclusion, and the drift runs the other way too — the plan still marks shipped work QUEUED
   (§8). A doc sentence needs a command, a route or a file read behind it.

## 8. First six actions, in order

### 1. Verify state — never trust this file

```powershell
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
git log --oneline -1; git status --short; git fetch origin; git status -sb
node --test tests/
node --test server/lib server/provider
node scripts/check.js
```

Expect the §1 numbers. A dirty tree is another agent's work in progress: read it, do not stage it; a
number that differs means the tree moved — trust the run.

### 2. Verify the model path — `mode: model` is the proof, `health: live` is not

`GET /api/health` reporting `"provider": "live"` only says a client could be constructed; a wrong key
reports the same ([`MODEL-CONFIG.md`](MODEL-CONFIG.md)). The proof is an assist response whose `mode`
is `model`; the response also carries `modelConfigured` so a refusal is distinguishable from a
missing key (`server/app.js:1575-1580`).

```powershell
$s = $null
$null = Invoke-WebRequest -Uri http://127.0.0.1:3160/api/auth/login -Method POST `
  -ContentType 'application/json' -SessionVariable s -UseBasicParsing `
  -Body '{"email":"demo@applywright.example","password":"demo-password-123"}'
$id = (Invoke-RestMethod -Uri http://127.0.0.1:3160/api/cvs -WebSession $s).cvs[0].id
$a = Invoke-RestMethod -Uri "http://127.0.0.1:3160/api/cvs/$id/assist" -Method POST `
  -ContentType 'application/json' -WebSession $s -TimeoutSec 180 `
  -Body (@{ instruction = 'Make this more professional for IT sales roles in the UK.'; scope = 'cv' } | ConvertTo-Json)
"mode=$($a.mode) modelConfigured=$($a.modelConfigured)"; $a.warnings
```

Measured at handoff: `mode=model modelConfigured=True`, one warning naming a rewrite reverted for
dropping a figure. A `mode=rules` result carrying *"the model reply changed nothing that passed the
grounding check, so the deterministic rules were used"* is a **grounding refusal, not a broken key** —
repro measured with `Shorten the summary by one sentence.` → `mode=rules`, *"figure 95 was dropped"*.
Only `modelConfigured=False` (or no warning at all) means no key. To supply one, pipe the loader into
`scripts/model-boot.mjs` as [`MODEL-CONFIG.md`](MODEL-CONFIG.md) shows; never export it.

### 3. Run the E2E harness

```powershell
node scripts/e2e-flow.mjs              # ~20 s; starts and stops its own instance on PORT 0
node --test tests/e2e-static.test.js   # offline helpers the journey asserts on
```

A real browser against a real server: sign-up → PDF/DOCX/OCR upload → score → tailor → editor
proposals → exports → tracking → alerts → recovery. Measured: **10/10 steps, 235/235 assertions, exit
0**. `--keep` retains the temp workdir on failure; `--no-model-stub` skips the stub-model step. It
never touches a `:3160` instance or `data/`.

### 4. Read the open queue — from the files, not memory

```powershell
Select-String -Path docs/IMPLEMENTATION-PLAN.md -Pattern 'QUEUED|IN PROGRESS|BLOCKED' | Select-Object LineNumber,Line
Get-Content docs/OVERNIGHT-LOG.md; git log --oneline -12
```

Reconcile the plan against `git log`: it still marks **3.5** (vernier gauge) QUEUED though `.aw-gauge`
shipped (`public/app/app.css:682`), **2.2** IN PROGRESS though the design pass shipped its measured
pairs, and **2.1/2.5** IN PROGRESS with no owner named. Genuinely open as measured: 2.3/7.4 (contrast
assertions in `check.js`), 2.4/7.5 (`axe-core` as a dev dependency), 2.6 (live regions), 3.3/3.4
(`.aw-folio` and the redline trace), 4.3 (bookmarklet metadata in the SPA), 5.8 (email delivery), 6.7
(pm2), 6.8 (backups), 7.6 (routine seed and preview), 7.8 (bookmarklet-guard regression test). Re-run
the log's two repros (`D2` `.docx` heading, `D3` trailing comma) before calling them open or fixed.

### 5. Pick the first mission — one item, one write scope

Default: run the three ready T3 specs (`docs/t3/`) so the routing proves itself, then hand **one**
implementation item to a DSH run with named owned paths. Highest value per hour at handoff: 2.3/7.4
contrast assertions (it stops the palette rotting and would have caught the 9.12:1 → 1.86:1
regression), then 3.3 `.aw-folio`, then 7.8. Do not start 5.3, 5.5, 6.5 or 6.6 — they are Johan's
(§9). Give the DSH run its own worktree, not the shared checkout:

```powershell
git -C "...\projects\applywright" worktree add ..\applywright--<slug> -b wt/<slug>
# write the brief to a file, then invoke estate-dsh-run as in §4 with --cwd <that worktree>
```

### 6. Record it in T3 before any code moves

Create the mission, write its ledger as the coordinator, and state the write surface and acceptance
check up front ([`T3-MISSIONS.md`](T3-MISSIONS.md)). Acceptance needs an evidence file you wrote after
reading the result: a completed task is not an accepted mission, and *"a mission's outcome lands in
this repo as a commit or a dated note — otherwise it happened only in the ledger."* Log the shift in
[`OVERNIGHT-LOG.md`](OVERNIGHT-LOG.md).

```powershell
node "$T3\mission.cjs" create "C:\...\applywright\docs\t3\applywright-plan-r1.json"
node "$T3\mission.cjs" show <mission-id>                    # through the mission
node "$T3\mission.cjs" accept <mission-id> <evidence.md>    # only after you have read the result
```

## 9. Blocked on Johan, and only Johan

| Item | Why it is blocked | Evidence |
|---|---|---|
| **DNS at GoDaddy + Cloudflare tunnel** | registrar, account, tunnel and TLS-mode decisions; nothing has been executed | `DOMAIN.md` §0; plan 6.5, 6.6 |
| **Stripe keys** | no `STRIPE_SECRET_KEY`, webhook secret or price IDs; checkout and portal answer 501 and no real event has ever been seen | `/api/health` → `"stripe": false`; plan 5.5 |
| **VAT machinery** | the rate and whether displayed prices are inclusive is a legal decision; the copy now says prices include applicable tax, but there is no VAT line, calculation or invoice | `plans.js`; `PROJECT-STATUS.md` §9; `SOTA-20261028.md` §5 |
| **Scale-tier decision** | Scale was left a quota tier after the unenforceable flags were withdrawn; whether it earns a real differentiator or is repriced is a product decision | `PROJECT-STATUS.md` §9; `SOTA-20261028.md` §5 |
| **Claude-agent route in T3** | disabled by `ROLES.json`, and since 28 Oct the usage limit is exhausted anyway; re-enabling needs Johan's edit, a recorded reason and the same-commit doc update | `ROLES.json` `providerPolicy`; `mission.cjs:141`; §10 |

Never put a key on a command line, in a remote URL or in a document. Keys arrive through the estate
loader or the service environment; the remote is public, so history is not private.

## 10. Live status — you are the orchestrator now, not later

Johan's message on 28 Oct evening: **Claude usage limit hit, so the relay to Codex is happening now.**
Treat everything below as current, not prospective.

- **Claude is unavailable** for orchestration and review until its limit resets (Johan's estimate:
  Saturday). The T3 `claudeAgent` route is disabled in `ROLES.json`, which now matches reality rather than
  merely policy — so nothing here waits on Claude, and no work should be parked for it.
- **`ROLES.json`'s recorded reason is stale** ("Operator selected Codex-only runtime checks on
  2026-10-16"). Do not edit the file yourself: ask Johan to replace that reason with the usage-limit one,
  in the same commit as any role change he makes.
- **The product's model path is unaffected.** The site's AI editing calls the Claude *org API key*
  directly through the estate loader (`MODEL-CONFIG.md`), which is a product dependency, not a Claude
  Code session. It was verified live this evening (`mode: model`, one accepted change, contact-data
  warning). Leave it alone unless it breaks, and never read or print the key.
- **Root's existing two-hour Estate continuity belongs to Root `01a183f2-68ec-7223-bb5b-0705764b0734`.** Do not adopt, retarget or duplicate it. Applywright has no commissioned scheduler. A Saturday reset neither transfers ownership nor wakes Claude.

### The living-docs contract

This Codex chat owns the project documents from now on. The native T3 broker alone performs the assigned pack-ledger writes on its behalf; this chat writes final acceptance. Estate remains sole shared hub/A/B publisher. A session that changes the product without updating the project documents has
left the next agent a lie, and that has already happened twice on this project (a handoff describing
master/no-remote, and a CSS cleanup that looked safe and was a contrast regression).

| File | Update when | What to write |
|---|---|---|
| `docs/OVERNIGHT-LOG.md` | every working session | what you verified, what changed, what you left, the exact gate output |
| `docs/PROJECT-STATUS.md` | a route, module, schema version or gate count moves | the new fact, marked measured with the date |
| `docs/IMPLEMENTATION-PLAN.md` | an item starts or finishes | status plus the commit; never leave a done item reading QUEUED |
| `docs/E2E-VERIFICATION.md` | the harness runs | the ledger and the commit it measured |
| `docs/CODEX-ORCHESTRATOR-HANDOFF.md` (this file) | routing or ownership changes | the change and why |
| `docs/T3-MISSIONS.md` and `docs/t3/*.json` | the flow or a spec changes | keep the specs runnable |
| `docs/ESTATE-RELAY.md`, `docs/CLAUDE-ESTATE-RELAY.md` | superseded facts | correct or point here; do not leave two truths; never replay unsafe argv/env or key-output recipes |
| vault `brain/applywright-platform.md` | the project's shape changes | this is the only vault file this project may write |

### Delegation, at the scale Johan has authorised

- **DSH (DeepSeek) implements.** One worktree per mission (`git -C <repo> worktree add ..\applywright--<slug> -b wt/<slug>`), disjoint owned paths, and the brief written to a file before launching. The Lead commits named paths; DSH never merges.
- **T3 records and verifies.** The commissioned native broker writes only its assigned spec/receipts/new ledger. Read-only review children write no project files. This chat alone accepts results; parent completion and model-selection receipts are not acceptance or served-identity proof.
- **Cross-CLI is allowed.** Gemini (vision, long-context) and Grok (live web, legal/market) through their own sign-ins; a research note with citations lands in `docs/research/`. Never paste a key anywhere, and never route a provider through another provider's billing.
- **"Unlimited agents" is capacity, not permission to skip gates.** Every claim ends with a command's output or a screenshot; the three gates and the E2E harness are cheap enough to run every session.

### If Claude comes back on Saturday

Johan re-enables the route (superseding `ROLES.json`'s reason) and Claude returns as a **reviewer child** in T3, not as the orchestrator. Do not hand control back silently: record the switch in `OVERNIGHT-LOG.md` and in this file's §2 table.
