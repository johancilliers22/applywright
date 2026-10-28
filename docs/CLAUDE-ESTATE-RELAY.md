# Applywright — Claude/Estate relay: validate the handoff, stand up the Codex chat

*For a Claude or Estate orchestrator whose job is to check this handoff and create the Codex
desktop chat that takes it over — not to do the work. Read [`ESTATE-RELAY.md`](ESTATE-RELAY.md)
for project state, [`T3-MISSIONS.md`](T3-MISSIONS.md) for T3 mechanics, and
[`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) for settled decisions and ownership.*

Measured 2026-10-28 (evening, Europe/London). The tree moves; every number below is a
measurement, not a promise. The commands to re-take each one are in §2.

---

## 1. The ask

Codex has usage again and becomes this project's **main orchestrator and validator**: it owns
decomposition, the dependency graph, the accept/reject decision and the T3 mission record.
DSH/DeepSeek subagents keep doing most of the implementation, because they have write access and
already hold the project context. T3 Mission Control tracks missions and supplies independent,
read-only review and test children. Claude's job now is narrow: validate that the handoff is true
(§2), create the Codex desktop chat and hand it these rules (§3), then stand back. Later, when the
operator re-enables the Claude route in T3, Claude returns as a reviewer child — not as the
orchestrator, and not before `ROLES.json` says so (§4).

**State when this was written:** HEAD `eb83c41`, clean tree, `main` in sync with `origin/main`,
330 tracked files; gates 150 HTTP / 337 module pass with 1 expected skip / `check.js` 10 pages,
24 modules, 263 css classes, 0 errors; `/api/health` `provider: "live"`; E2E journey 10/10 steps,
235/235 assertions, exit 0; T3 `ROLES.json` Codex-only.

---

## 2. Validation checklist

Run each check and record pass or fail. A failure is not a reason to fix things mid-validation —
record it, hand the fix to DSH, and do not create the mission on a failed handoff.

### 2.1 State matches the handoff

```powershell
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
git log --oneline -1
git status --short
git status -sb
git rev-list --count 706b741..HEAD
```

- **Pass:** `eb83c41` *"T3 mission setup: who does what, and three ready missions"* (or a
  descendant), `git status --short` prints nothing, and `## main...origin/main` has no
  ahead/behind. The last command prints **7** — the number of commits since the E2E record.
- **Fail:** a dirty tree you did not create (another writer's work; leave it), or ahead/behind.
  If HEAD is not `eb83c41`, check whether it descends from it and whether the E2E record (2.3)
  still names a commit you can defend.

### 2.2 The gates

```powershell
node --test tests/
node --test server/lib server/provider
node scripts/check.js
```

- **Pass:** **150 pass, 0 fail**; **337 pass, 0 fail, 1 skipped**, 12 suites; and
  `applywright check — 10 pages, 24 server modules, 263 css classes` / `ok — 0 errors,
  0 warning(s)`, exit 0.
- **Fail:** any failure or a non-zero `check.js`. The one skip is legitimate only when its reason
  is host capability — it reads *"a native pdftotext is on PATH, so the WSL fallback is not the
  route this run would exercise"*, because Poppler is installed at
  `%LOCALAPPDATA%\poppler\poppler-26.09.0\Library\bin\pdftotext.exe`. A skip that hides a missing
  tool is a failure.

### 2.3 The model path is genuinely live

`/api/health` reporting `"provider": "live"` **is not proof**: a wrong key reports the same
([`MODEL-CONFIG.md`](MODEL-CONFIG.md)). The proof is a response whose `mode` is `model`.

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

- **Pass:** `model` and `True`. Verified on this host: `mode = model`, 11 changes, 0 rejected.
- **Fail:** `modelConfigured = False` — no key reached the process; reboot it with the loader
  (`scripts/model-boot.mjs`, never a key on the command line; `MODEL-CONFIG.md` has the
  piped-standard-input form). If `modelConfigured = True` but every call returns `rules` with a
  *"model request failed"* or timeout warning, the key or endpoint is bad. **A grounding revert is
  not a dead path** — the check did its job; retry with the instruction above before declaring a
  failure.
- **Note:** the login assumes the seeded demo account, which exists here (`demo@applywright.example`,
  Pro). No CVs in it means the seed has not been run against this database: run
  `node scripts/seed.mjs` with the server up.

### 2.4 The E2E journey passes at the recorded commit

```powershell
node scripts/e2e-flow.mjs
```

- **Pass:** `PASS — the whole journey behaved as the product claims.`, `10 passed, 0 failed`,
  `235 passed, 0 failed`, exit 0 (about 48 s; it starts its own server on `PORT 0` with a temp
  database and never touches `:3160` or `data/`).
- **Fail:** any step. Missing prerequisites — Chrome/Edge, WSL `pdftotext`/`tesseract`, network to
  the three job boards — fail the step that needs them by name; they are not skipped silently.
- **Record check:** [`E2E-VERIFICATION.md`](E2E-VERIFICATION.md) says *"product code at commit
  `706b741`"*, and HEAD is `eb83c41`, **7 commits later**. The harness passes today, so the
  behaviour is current but the record's commit is stale: re-record it (a DSH docs edit) rather than
  quoting the old commit against the new tree.

### 2.5 Docs agree with the code on the five decisions that have flip-flopped

Run the command, compare with the pass column. These five have each been wrong at least once.

| # | Decision | Command | Pass (truth on this tree) |
|---|---|---|---|
| D1 | **Licence** | `Get-Content LICENSE -TotalCount 1; Select-String package.json -Pattern '"license"'` | `MIT License` and `"license": "MIT"` |
| D2 | **Plan flags** | `node -e "import('./server/lib/billing/plans.js').then(m=>console.log(m.FLAG_FEATURES.join(','),'\|',m.ENFORCED_FLAGS.join(',')))"` | both read `fullAtsReport,coverLetter,packHistory`; `dailyDigest`, `apiAccess`, `priorityRefresh`, `bulkExport` appear nowhere |
| D3 | **VAT wording** | `Select-String -Path public\pricing.html,public\app\app.js -Pattern 'VAT'` | one wording everywhere |
| D4 | **Model routing** | `Get-Content "C:\Users\johan\Desktop\Coding\t3-mission-control\ROLES.json" \| Select-String 'claudeAgent' -Context 0,4` plus 2.3 | product model path live (2.3); T3 `claudeAgent.enabled = false`; the two are separate |
| D5 | **Tunnel URL** | `Select-String -Path docs\SHARE.md -Pattern 'Current live URL' -Context 0,2` then `Invoke-RestMethod https://bumper-naturals-raises-thickness.trycloudflare.com/api/health -TimeoutSec 15 \| Select-Object status` | `status = ok`; exactly one quick tunnel serves `127.0.0.1:3160` |

Known failures on this tree, to record rather than quietly fix:

- **D2 passes.** `FLAG_FEATURES` and `ENFORCED_FLAGS` are both the same three flags, and the
  withdrawn labels are gone from `plans.js`. `PROJECT-STATUS.md` §9 agrees; the E2E doc's
  "Related documents" line still cites the old `apiAccess` set — stale prose, harmless.
- **D3 fails today.** `public/pricing.html` says prices **include** tax ("no tax is added at
  checkout"), `PROJECT-STATUS.md` §9 says the same, and `public/app/app.js` (the `/app` billing
  note, around line 3613) still says **"excluding VAT"**. One surface is wrong; the policy decision
  belongs to Johan (VAT is one of the open items), the one-sentence copy fix belongs to DSH.
- **D5 needs care.** Two `cloudflared` processes are alive: one quick tunnel with
  `--url http://127.0.0.1:3160`, one named tunnel with no `--url` (not Applywright's). To see the
  targets without printing a token-bearing command line:

  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
    ForEach-Object { [regex]::Match($_.CommandLine, '--url\s+(\S+)').Groups[1].Value }
  ```

  Pass is exactly one `http://127.0.0.1:3160`. Fail is none (tunnel down) or an ambiguous set;
  `SHARE.md` § "Current live URL" must be replaced whenever the tunnel restarts, because
  quick-tunnel hostnames do not survive a restart.
- **D4 passes**, provided you do not use `health: live` as the proof.

### 2.6 The vault note is current

```powershell
$note = "C:\Users\johan\Desktop\Coding\OpenClaw\luna-vault\Luna Vault\brain\applywright-platform.md"
(Get-Item $note).LastWriteTime.ToString('u')
Select-String -Path $note -Pattern 'Orchestration handover','Current live URL','trycloudflare'
```

- **Pass:** modified today (measured 16:52Z, the same minute as `eb83c41`), the
  "Orchestration handover (28 Oct, evening)" section present, and no hard-coded tunnel URL that
  contradicts `SHARE.md` — the note points at that file instead.
- **Fail:** an older mtime, or the note asserting a URL, gate count or owner that the run above
  contradicts. The note is the one vault file this project may write, under Johan's authorisation;
  a change is a DSH edit plus a line in [`OVERNIGHT-LOG.md`](OVERNIGHT-LOG.md), never a mission's
  free write.

### 2.7 The T3 mission specs point at real files

```powershell
Get-ChildItem docs\t3 -Filter *.json | ForEach-Object {
  $j = Get-Content $_.FullName -Raw | ConvertFrom-Json
  foreach ($t in $j.tasks) { foreach ($p in $t.inputPaths) { $p } }
} | Where-Object { -not (Test-Path ($_ -replace '^C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright/', '')) }
```

- **Pass:** no output.
- **Fail:** any path. Today `docs/t3/applywright-plan-r1.json` lists
  `docs/CODEX-ORCHESTRATOR-HANDOFF.md`, **which does not exist** — replace it with
  `docs/ESTATE-RELAY.md` (or create the missing doc deliberately) before `mission.cjs create`,
  or the planner is handed a dangling path.

---

## 3. Create the Codex desktop chat

The pack is at `C:\Users\johan\Desktop\Coding\t3-mission-control`; the skill is installed as a
pointer at `C:\Users\johan\.agents\skills\t3-mission-control\SKILL.md`, and picker discovery in a
fresh session has not been verified. The explicit-file prompt below works without the picker.

1. **Open a new Codex desktop chat attached to the project** — workspace root
   `C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright`. There is no
   `AGENTS.md` or `CLAUDE.md` in this repository (checked), so the prompt carries the rules.
2. **Keep the operator's model selection** in the composer. `ROLES.json`'s coordinator preset
   (`codex`, `gpt-6-astra`, `xhigh`) is a routing choice for new missions and a prompt, not a
   model you may silently switch to — `SKILL.md` says keep the user's selected model.
3. **This chat is the orchestrator.** The coordinator is a role in the parent thread, not a
   separate process. It is the sole ledger writer; children never touch the ledger
   (`ROLES.json`, `SKILL.md` §2).
4. **Paste this starter prompt** (edit the mission id and thread id when you have them):

```text
You are the main orchestrator and validator for Applywright, a CV scoring and
grounded-tailoring web app at
C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
(its own git repo, branch main; the hub gitignores projects/*).

Read these before anything else:
  docs/PROJECT-STATUS.md        what the product is: stack, routes, modules, data model
  docs/ESTATE-RELAY.md          current state, in-flight work, do-not list
  docs/CLAUDE-ESTATE-RELAY.md   this handover and the validation duty you inherit
  docs/T3-MISSIONS.md           T3 mechanics for this project; do not duplicate it
  docs/SPEC.md                  the product contract and the three refusals
  docs/ORCHESTRATOR-HANDOFF.md  settled decisions, ownership map, five mistakes
  docs/MODEL-CONFIG.md          what "the model works" actually means
  docs/E2E-VERIFICATION.md      the browser journey and its recorded commit

Use T3 Mission Control (pack at C:\Users\johan\Desktop\Coding\t3-mission-control,
its SKILL.md) for tracking and independent review. DSH subagents implement;
you decompose, validate and accept, and you are the sole ledger writer.

Before you touch code:
1. Run the validation checklist in docs/CLAUDE-ESTATE-RELAY.md §2 and report
   every item pass or fail with the command output.
2. Create a T3 mission from a spec in docs/t3/ — replace parentThreadId with this
   thread's real id first:
   node "C:\Users\johan\Desktop\Coding\t3-mission-control\mission.cjs" create "C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright\docs\t3\applywright-plan-r1.json"
   A mission spec is the record; a conversation is not.
3. Only then delegate implementation to DSH, in disjoint file scopes.

Rules that do not move: no scraping, no automated submission, never weaken
grounding (assertGrounded / groundChanges), no cookie import, named-path
commits, never commit data/ or .env, no vault writes except the authorised note,
no computer use unattended. Show command output, not a summary of it.
```

5. **Record the mission before touching code.** This is the one mandatory act: replace
   `REPLACE_WITH_T3_THREAD_ID` in the spec with this thread's real T3 id, then:

   ```powershell
   $T3 = "C:\Users\johan\Desktop\Coding\t3-mission-control"
   node "$T3\mission.cjs" create "C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright\docs\t3\applywright-plan-r1.json"
   node "$T3\mission.cjs" show applywright-plan-r1
   ```

   A placeholder id records a mission that cannot be traced to a thread. Fix §2.7's missing input
   path first. Ledgers live in the pack's `missions/<id>/mission.json`, not in this repo.
6. **Confirm it is the orchestrator, not a second one.** `claude-coordinator` and the other
   `claude-*` presets stay unused while the route is disabled (§4). Do not start a parallel
   coordinator in another thread; stop on the parent stops its children.

---

## 4. T3 enablement boundary

`ROLES.json` is the single source of truth and currently reads:

```json
"claudeAgent": {
  "enabled": false,
  "reason": "Operator selected Codex-only runtime checks on 2026-10-16. Claude role presets remain available for later explicit enablement.",
  "earliestRetryAt": "2026-10-17T19:00:00Z"
}
```

**A reset date does not enable a provider.** `earliestRetryAt` is a note, not a switch, and it is
already in the past; `enabled` is still `false` and Claude tasks will not run. To enable it, Johan
— and only Johan — edits `C:\Users\johan\Desktop\Coding\t3-mission-control\ROLES.json`, sets
`"enabled": true` and replaces the reason with why it was re-enabled; the handoff docs
(`T3-MISSIONS.md`, `ESTATE-RELAY.md`, this file) must be updated in the same commit so there are
not two truths. Agents do not edit that file.

The coordinator stays the sole ledger writer whichever provider holds the role; children read and
report, never write the ledger. Once enabled, Claude returns as `reviewer` / `claude-coordinator`
presets — a reviewer child first, not a second orchestrator.

Check it, do not assume it:

```powershell
Select-String -Path "C:\Users\johan\Desktop\Coding\t3-mission-control\ROLES.json" -Pattern 'claudeAgent' -Context 0,4
```

---

## 5. Hand back to DSH, and what is blocked on Johan

**Hand to DSH:** every write in this repository — implementation, refactors, tests, docs, CSS,
copy, gate runs, the E2E run, local defect fixes. Codex decomposes, checks evidence and accepts;
the T3 children (`codex-planner`, `codex-reviewer`, `tester`) are read-only or evidence-only.
**No T3 child writes this repo until Johan assigns a Codex write surface** (`T3-MISSIONS.md`).
Codex's own writes, if any, are the mission ledger in the T3 pack, not product code.

**Blocked on Johan, with evidence:**

| Item | Evidence now | What Johan decides |
|---|---|---|
| DNS + named Cloudflare tunnel | `DOMAIN.md` §0: nothing executed; zone at GoDaddy nameservers | Registrar/Cloudflare access, tunnel, TLS mode. Do not plan against a hostname that does not exist |
| Stripe keys | `/api/health` `"stripe": false`; no `.env.local`; checkout/portal/webhook 501 | Secret + webhook secret + four price IDs; a test account is enough |
| VAT | `pricing.html` inclusive, `app.js` exclusive (§2.5 D3); no VAT is modelled | The policy: inclusive or exclusive, and whether to model a VAT line at all |
| Scale tier | `plans.js`: "Scale is a quota tier, not a feature tier" — unlimited CVs/packs, 50 alerts, nothing unique | Whether to sell a £49 tier that differs only by quota, or fold it |
| Claude route in T3 | `ROLES.json` `claudeAgent.enabled = false` (§4) | Flip it and record why, in the same commit as the doc updates |

---

## 6. Supersession

- **This file wins on orchestration ownership and on T3/Codex enablement** for Applywright from
  2026-10-28 evening: Codex orchestrates, DSH implements, T3 tracks and reviews, Claude validates
  and then waits for Johan to re-enable its T3 route.
- [`ESTATE-RELAY.md`](ESTATE-RELAY.md) wins on project state and the next-actions queue, except
  where it is stale; it was updated in place today (§2 state, §3 in-flight, §4 model key, §7
  expectations) rather than left with a second version of the truth.
- [`ORCHESTRATOR-HANDOFF.md`](ORCHESTRATOR-HANDOFF.md) stays authoritative on product decisions,
  file ownership and the five mistakes. Its §6 "what is left" table is behind the tree — billing
  enforcement, the hero and the editor shipped in `7b88acc`, `342d621` and `4c5ace8` — and its own
  postscript says so.
- [`T3-MISSIONS.md`](T3-MISSIONS.md) is authoritative for T3 mechanics; if this file and it
  disagree about how T3 works, T3-MISSIONS wins. [`MODEL-CONFIG.md`](MODEL-CONFIG.md) is
  authoritative on what counts as proof that the model path works.
- If a contradiction turns up later: update the stale file in place, in the same commit as the
  change that made it stale. Do not leave two truths. When in doubt, `git log` is the truth.
