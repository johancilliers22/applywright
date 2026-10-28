> **Status, 28 Oct evening — this relay has been executed.** Claude's usage limit is exhausted, so the
> handover to Codex happened immediately rather than on Saturday: the Codex desktop chat is the
> orchestrator, DSH implements, T3 tracks and verifies. Run §2 once to confirm the handoff is true, then
> stop — the living-docs duty and the routing are in `CODEX-ORCHESTRATOR-HANDOFF.md` §10, which is now the
> operating brief. When the Claude limit resets, Claude returns as a reviewer child in T3, not as
> orchestrator.
# Applywright — Claude/Estate relay: validate the handoff, stand up the Codex chat

*For a Claude or Estate orchestrator whose job is to check this handoff and create the Codex chat
that takes it over — not to do the work. State: [`ESTATE-RELAY.md`](ESTATE-RELAY.md); T3:
[`T3-MISSIONS.md`](T3-MISSIONS.md); decisions: [`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md).*

Measured 2026-10-28 evening; §2 re-takes every number. **State when written:** HEAD `e5b04f0` (17:02Z;
baseline `34d23a6`), clean tree, `main` in sync, 332 tracked files; gates 150 HTTP / 337 module pass
with 1 expected skip; `check.js` 10 pages, 24 modules, 263 css classes, 0 errors; E2E 235/235.

## 1. The ask

Codex has usage again and becomes this project's **main orchestrator and validator**: it owns
decomposition, the dependency graph, the accept/reject decision and the T3 mission record. DSH
subagents keep doing most of the implementation — they have write access and already hold the
project context. T3 Mission Control tracks missions and supplies independent, read-only review
and test children. Claude's job now is narrow: validate that the handoff is true (§2), create the
Codex desktop chat and hand it these rules (§3), then stand back. Later, when the operator
re-enables the Claude route in T3, Claude returns as a reviewer child — not as orchestrator, and
not before `ROLES.json` says so (§4).

## 2. Validation checklist

Record each item pass or fail; note failures and hand the fix to DSH — do not create the mission on a failed handoff.

### 2.1 State and gates

```powershell
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
git log --oneline -1; git status --short; git status -sb; git rev-list --count 706b741..HEAD
node --test tests/; node --test server/lib server/provider; node scripts/check.js
```

**State pass:** HEAD descends from `34d23a6` (the handoff baseline; measured `e5b04f0`), empty status,
`## main...origin/main` with no ahead/behind, and `git rev-list` prints `10`. **Gates pass:** 150 pass /
0 fail; 337 pass / 0 fail /
1 skip, 12 suites; `applywright check — 10 pages, 24 server modules, 263 css classes` and `ok — 0
errors, 0 warning(s)`, exit 0. **Fail:** a dirty tree you did not create (leave it), ahead/behind, a
HEAD that does not descend from this one, any test failure, or a non-zero `check.js`. The one skip
is legitimate only when it reads *"a native pdftotext is on PATH, so the WSL fallback is not the route
this run would exercise"* — Poppler is at `%LOCALAPPDATA%\poppler\poppler-26.09.0\Library\bin\pdftotext.exe`;
a skip hiding a missing tool is a failure.

### 2.2 The model path is genuinely live

`"provider": "live"` is **not** proof — a wrong key reports the same
([`MODEL-CONFIG.md`](MODEL-CONFIG.md)). Proof is a response whose `mode` is `model`:

```powershell
$base = "http://127.0.0.1:3160"
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' `
  -Body '{"email":"demo@applywright.example","password":"demo-password-123"}' -WebSession $s | Out-Null
$cv = (Invoke-RestMethod "$base/api/cvs" -WebSession $s).cvs[0]
$r = Invoke-RestMethod "$base/api/cvs/$($cv.id)/assist" -Method Post -ContentType 'application/json' `
  -Body '{"instruction":"keep every number exactly as written; make the wording more formal","scope":"experience"}' -WebSession $s
$r.mode; $r.modelConfigured
```

**Pass:** `model` and `True` (verified here: 11 changes, 0 rejected); the login needs the seeded demo
account with a CV. **Fail:** `modelConfigured = False` — no key reached the process; reboot via
`scripts/model-boot.mjs` (key on stdin; `MODEL-CONFIG.md` has the form). `modelConfigured = True`
with every call returning `rules` plus a *"model request failed"* or timeout warning means a bad key
or endpoint. **A grounding revert is not a dead path** — retry the instruction above before failing.

### 2.3 The E2E journey passes at the recorded commit

```powershell
node scripts/e2e-flow.mjs
```

**Pass:** `PASS — the whole journey behaved as the product claims.`, 10 passed / 0 failed, 235
assertions / 0 failed, exit 0 (about 48 s; its own `PORT 0` instance and temp database). **Fail:**
any step; a missing prerequisite (Chrome/Edge, WSL `pdftotext`/`tesseract`, network to the three
boards) fails that step by name. **Record check:** [`E2E-VERIFICATION.md`](E2E-VERIFICATION.md) names
`706b741`; HEAD is 10 commits later, so re-record the commit (a DSH docs edit) rather than quoting the
old one against the new tree.

### 2.4 Docs agree with the code on the five decisions that have flip-flopped

| # | Decision | Command | Pass (truth on this tree) |
|---|---|---|---|
| D1 | **Licence** | `Get-Content LICENSE -TotalCount 1; Select-String package.json -Pattern '"license"'` | `MIT License`; `"license": "MIT"` |
| D2 | **Plan flags** | `node -e "import('./server/lib/billing/plans.js').then(m=>console.log(m.FLAG_FEATURES.join(','),'\|',m.ENFORCED_FLAGS.join(',')))"` | both `fullAtsReport,coverLetter,packHistory`; `dailyDigest`, `apiAccess`, `priorityRefresh`, `bulkExport` absent |
| D3 | **VAT wording** | `Select-String -Path public\pricing.html,public\app\app.js -Pattern 'VAT'` | one wording everywhere |
| D4 | **Model routing** | `Select-String -Path "C:\Users\johan\Desktop\Coding\t3-mission-control\ROLES.json" -Pattern 'claudeAgent' -Context 0,4` plus 2.2 | product path live (2.2); T3 `claudeAgent.enabled = false`; the two are separate |
| D5 | **Tunnel URL** | `Select-String -Path docs\SHARE.md -Pattern 'Current live URL' -Context 0,2`, then `Invoke-RestMethod https://bumper-naturals-raises-thickness.trycloudflare.com/api/health -TimeoutSec 15 \| Select-Object status` | `status = ok`; exactly one quick tunnel serves `127.0.0.1:3160` |

Known results — record, do not quietly fix. **D2 passes:** both arrays are the same three flags and
the withdrawn labels are gone from `plans.js`; `PROJECT-STATUS.md` §9 agrees, though the E2E doc's
"Related documents" line still cites the old `apiAccess` set. **D3 passes as of `34d23a6`,** which
closed the last contradiction: `pricing.html` and `public/app/app.js` now both say prices include any
applicable tax. Keep the check — this one has flipped twice, and VAT modelling is still Johan's open
decision. **D5 needs care:** two `cloudflared` processes are alive, a quick tunnel on `127.0.0.1:3160`
and a named tunnel with no `--url` (not this project's). Targets, without printing a token-bearing
line: `Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | ForEach-Object { [regex]::Match($_.CommandLine,'--url\s+(\S+)').Groups[1].Value }`
— pass is exactly one `http://127.0.0.1:3160`; `SHARE.md` § "Current live URL" must be replaced
whenever the tunnel restarts, since quick-tunnel hostnames do not survive one.

### 2.5 The vault note is current, and the T3 specs point at real files

```powershell
$note = "C:\Users\johan\Desktop\Coding\OpenClaw\luna-vault\Luna Vault\brain\applywright-platform.md"
(Get-Item $note).LastWriteTime.ToString('u'); Select-String -Path $note -Pattern 'Orchestration handover','trycloudflare'
Get-ChildItem docs\t3 -Filter *.json | ForEach-Object { $j = Get-Content $_.FullName -Raw | ConvertFrom-Json; foreach ($t in $j.tasks) { foreach ($p in $t.inputPaths) { $p } } } | Where-Object { -not (Test-Path ($_ -replace '^C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright/', '')) }
```

**Vault pass:** modified today (16:52Z, the minute `eb83c41` was committed), the "Orchestration
handover (28 Oct, evening)" section present, no hard-coded URL contradicting `SHARE.md` (it points
there). That note is the one vault file this project may write, under Johan's authorisation; a change
is a DSH edit plus a line in [`OVERNIGHT-LOG.md`](OVERNIGHT-LOG.md). **Specs pass:** no output from
the second command; **fail** is any path — it guards against a spec naming a doc renamed or never written.

## 3. Create the Codex desktop chat

The pack is `C:\Users\johan\Desktop\Coding\t3-mission-control`; the skill is a pointer at
`C:\Users\johan\.agents\skills\t3-mission-control\SKILL.md`, and picker discovery in a fresh
session is unverified — the explicit-file prompt below works without it. The chat's own operating
brief is [`CODEX-ORCHESTRATOR-HANDOFF.md`](CODEX-ORCHESTRATOR-HANDOFF.md); this section is the
procedure for creating it.

1. **New Codex desktop chat attached to the project**, workspace root `...\projects\applywright`.
   There is no `AGENTS.md` or `CLAUDE.md` in the repo (checked), so the prompt carries the rules.
2. **Keep the operator's model** in the composer. The `ROLES.json` coordinator preset (`codex`,
   `gpt-6-astra`, `xhigh`) is a routing choice and a prompt, not a model you may silently switch to.
3. **This chat is the orchestrator** — a role in the parent thread, not a separate process, and the
   sole ledger writer; children never touch the ledger. No parallel coordinator; `claude-*` waits (§4).
4. **Paste this starter prompt** (edit the thread id when you have it):

```text
You are the main orchestrator and validator for Applywright at
C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
(its own git repo, branch main; the hub gitignores projects/*).

Read first: docs/CODEX-ORCHESTRATOR-HANDOFF.md (your operating brief), docs/T3-MISSIONS.md,
docs/CLAUDE-ESTATE-RELAY.md, docs/PROJECT-STATUS.md, docs/ESTATE-RELAY.md, docs/SPEC.md,
docs/ORCHESTRATOR-HANDOFF.md, docs/MODEL-CONFIG.md, docs/E2E-VERIFICATION.md.

Use T3 Mission Control (C:\Users\johan\Desktop\Coding\t3-mission-control, its SKILL.md). DSH
subagents implement; you decompose, validate and accept, and you are the sole ledger writer.

Before touching code: (1) run the validation checklist in docs/CLAUDE-ESTATE-RELAY.md §2 and
report every item pass/fail with output; (2) create a T3 mission from docs/t3/ with parentThreadId
set to this thread's real id:
node "C:\Users\johan\Desktop\Coding\t3-mission-control\mission.cjs" create "C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright\docs\t3\applywright-plan-r1.json"
— a mission spec is the record, a conversation is not; (3) only then delegate to DSH in disjoint
scopes.

Rules: no scraping, no automated submission, never weaken grounding (assertGrounded /
groundChanges), no cookie import, named-path commits, never commit data/ or .env, no vault writes
except the authorised note, no computer use unattended. Show command output.
```

5. **Record the mission before touching code.** Replace `REPLACE_WITH_T3_THREAD_ID` with this
   thread's real T3 id (a placeholder records an untraceable mission), then check §2.5's spec inputs:
   then `node "$T3\mission.cjs" create "...\docs\t3\applywright-plan-r1.json"` with
   `$T3 = "C:\Users\johan\Desktop\Coding\t3-mission-control"`, and check it with
   `node "$T3\mission.cjs" show applywright-plan-r1`. Ledgers live in the pack's
   `missions/<id>/mission.json`, not in this repo.

## 4. T3 enablement boundary

`ROLES.json` sets `providerPolicy.claudeAgent.enabled = false` with the recorded reason *"Operator
selected Codex-only runtime checks on 2026-10-16. Claude role presets remain available for later
explicit enablement."* and `earliestRetryAt = 2026-10-17T19:00:00Z`.

**A reset date does not enable a provider.** `earliestRetryAt` is a note, not a switch, and it is
already past; `enabled` is still false, so Claude tasks will not run. To enable it, **Johan — and
only Johan —** edits `C:\Users\johan\Desktop\Coding\t3-mission-control\ROLES.json`, sets
`"enabled": true` and replaces the reason with why; `T3-MISSIONS.md`, `ESTATE-RELAY.md` and this file
are updated in the same commit. Agents do not edit it. The coordinator stays sole ledger writer, and
once enabled Claude returns as a `reviewer` / `claude-coordinator` preset — not a second orchestrator.

## 5. Hand back to DSH, and what is blocked on Johan

**Hand to DSH:** every write here — implementation, refactors, tests, docs, CSS, copy, gate runs,
the E2E run, defect fixes. Codex decomposes, checks evidence and accepts; the T3 children
(`codex-planner`, `codex-reviewer`, `tester`) are read-only or evidence-only, and **no T3 child
writes this repo until Johan assigns a Codex write surface** (`T3-MISSIONS.md`).

| Blocked item | Evidence now | What he decides |
|---|---|---|
| DNS + named Cloudflare tunnel | `DOMAIN.md` §0: nothing executed; zone at GoDaddy nameservers | Registrar/Cloudflare access, tunnel, TLS mode |
| Stripe keys | `/api/health` `"stripe": false`; no `.env.local`; checkout/portal/webhook 501 | Secret, webhook secret, four price IDs |
| VAT | `pricing.html` and `app.js` both inclusive since `34d23a6`; still no VAT modelled (§2.4 D3) | Inclusive or exclusive, and whether to model VAT |
| Scale tier | `plans.js`: "Scale is a quota tier, not a feature tier" | Sell a £49 quota-only tier, or fold it |
| Claude route in T3 | `ROLES.json` `claudeAgent.enabled = false` (§4) | Flip it and record why, with the doc update |

## 6. Supersession

- **This file wins on orchestration ownership and T3/Codex enablement** from 2026-10-28 evening:
  Codex orchestrates, DSH implements, T3 tracks and reviews, Claude validates then waits for its route.
- [`ESTATE-RELAY.md`](ESTATE-RELAY.md) wins on project state and the actions queue, except where
  stale; it was updated in place today (§2, §3, §4, §7) rather than left as a second truth.
- [`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) stays authoritative on product decisions and
  ownership; its §6 "what is left" table is behind the tree (billing, hero and editor shipped).
- [`CODEX-ORCHESTRATOR-HANDOFF.md`](CODEX-ORCHESTRATOR-HANDOFF.md) is the chat's own brief (`dcd754e`):
  it wins on what the chat does; this file wins on the validation and creation procedure.
- [`T3-MISSIONS.md`](T3-MISSIONS.md) wins on T3 mechanics; [`MODEL-CONFIG.md`](MODEL-CONFIG.md) wins
  on proof the model path works. Update a stale file in place, same commit; `git log` is truth.
