# DSH scheduler restore sheet — 29 October 2026 (tonight-only pause, manual restore)

Johan's correction: the four scheduler deletions are a **tonight-only temporary pause** and must be restorable by
hand tomorrow. **No job has been activated or recreated.** Nothing here runs automatically; this is metadata for
manual reconstruction after an explicit Johan request.

## 1. Was an exact undelete-as-disabled possible?

**No.** The scheduler surface I have is `schedule_list`, `schedule_create`, `schedule_update`, `schedule_delete`.
There is **no undelete**, no `enabled`/disabled flag, and no way to re-create an item under its original id —
`schedule_create` mints a new id. The only reversible-looking lever (`schedule_update`) requires an existing id,
and the ids are gone. Deleting returned `{"deleted": true}` for each.

So per the instruction: **metadata only**. Nothing was recreated in a disabled state, because the tool cannot
express that state, and re-creating under a new id would silently change identity.

**Identity caveat for tomorrow:** a manual rebuild will produce **four new schedule ids**. The ids below are the
original identity and should be recorded against the rebuild (e.g. in a note or the new titles) so nobody later
believes the originals were resumed.

## 2. Captured definitions — exactly as `schedule_list` returned them at 02:30Z

Common fields on all four: `timeZone: "Europe/London"`, `state: "scheduled"`, `deliveryMode: "host"`.
There was **no `WasEnabled` key** in the listing — the equivalent evidence of "was enabled" is `state: "scheduled"`
(an active, host-delivered reminder). If a literal `WasEnabled` value is required, it is **UNKNOWN as a field**;
it was functionally **enabled** at delete time. `scheduledAt` is the **next occurrence as listed at 02:30Z**, not a
creation timestamp.

### 2.1 `schedule-1fe58d8f-b66a-42cf-8843-b93370066c28`

| Field | Value |
|---|---|
| kind | `daily` |
| title | `Applywright nightly health check` |
| time | `03:10:00.000` |
| timeZone | `Europe/London` |
| scheduledAt (next run at delete) | `2026-10-29T03:10:00.000Z` |
| state | `scheduled` |
| deliveryMode | `host` |

Prompt, verbatim:

```text
Nightly Applywright health check. In projects/applywright: run `node --test tests/`, `node --test server/lib server/provider` and `node scripts/check.js`; confirm the server answers /api/health on 3160 (restart it only if it is down, killing by the PID that owns port 3160 — never by command-line guess). Then report one short block: pass/fail counts, check result, server uptime, and any new failure with the file and assertion. Do not start new work; if everything is green, say so in two lines.
```

### 2.2 `schedule-9a329064-b0cb-44cc-9ebb-8bb87bcbe7a3`

| Field | Value |
|---|---|
| kind | `weekly` |
| title | `Applywright weekly improvement sweep` |
| time | `09:00:00.000` |
| weekdays | `[1]` (Monday, ISO) |
| timeZone | `Europe/London` |
| scheduledAt (next run at delete) | `2026-11-02T09:00:00.000Z` |
| state | `scheduled` |
| deliveryMode | `host` |

Prompt, verbatim:

```text
Weekly Applywright improvement sweep. Read projects/applywright/docs/SPEC.md, docs/reviews/ (Gemini architecture review, Grok legal-market review if present) and the open gaps I have recorded: unenforced plan flags (fullAtsReport, packHistory, dailyDigest), VAT not modelled, mobile nav depends on JS, no password reset, fragile paste-parser duplicated between app.js and capture.js, and the Stripe webhook having no event idempotency. Pick the three highest-value items, dispatch subagents for the ones with disjoint write scopes, land them with tests, and report: what shipped, exact verification (test counts and check output), what was deliberately deferred and why. Keep the suite green at every step.
```

### 2.3 `schedule-c3b0655a-b6a6-43fd-9c81-2bcc2e6063ce`

| Field | Value |
|---|---|
| kind | `cron` |
| title | `Applywright overnight shift` |
| expression | `15 0-6/2 * * *` (00:15, 02:15, 04:15, 06:15 daily) |
| timeZone | `Europe/London` |
| scheduledAt (next run at delete) | `2026-10-29T04:15:00.000Z` |
| state | `scheduled` |
| deliveryMode | `host` |

Prompt, verbatim:

```text
Overnight Applywright shift. Read projects/applywright/docs/OVERNIGHT-BRIEF.md first, then docs/OVERNIGHT-LOG.md for what the previous shift did. Take the highest-value unfinished item from the brief's queue, verify it live (headless Chrome over CDP, real API calls), run all three gates (node --test tests/, node --test server/lib server/provider, node scripts/check.js), commit named paths and push origin main, and append one entry to OVERNIGHT-LOG.md with the gate output. If everything in the queue is done, stop and say so in two lines rather than inventing work. Respect the brief's do-not list absolutely.
```

### 2.4 `schedule-09377803-05fd-4949-952e-cbb11fb1277c`

| Field | Value |
|---|---|
| kind | `cron` |
| title | `Applywright overnight shift, second lane` |
| expression | `45 1-5/2 * * *` (01:45, 03:45, 05:45 daily) |
| timeZone | `Europe/London` |
| scheduledAt (next run at delete) | `2026-10-29T03:45:00.000Z` |
| state | `scheduled` |
| deliveryMode | `host` |

Prompt, verbatim:

```text
Overnight Applywright shift (second lane). Read projects/applywright/docs/OVERNIGHT-BRIEF.md and the tail of docs/OVERNIGHT-LOG.md. Pick a queue item the previous shift did NOT touch, so the two lanes never collide; if everything is taken, work on tests or the accessibility audit of /app and /editor instead. Verify live, run all three gates, commit named paths only (never git add -A), push origin main, and append one entry to OVERNIGHT-LOG.md with the exact gate output. Respect the brief's do-not list absolutely, including the vault rule (only brain/applywright-platform.md, logged).
```

## 3. Reconstruction notes for tomorrow (manual, after explicit Johan request)

- **No catch-up.** Every `scheduledAt` above is now in the past; a rebuild must be created so it fires at its next
  *future* slot only. `schedule_create` with `after_seconds` would fire immediately — do not use that to rebuild
  these. Rebuild with `daily`, `weekly` or `cron` timing so the missed occurrences are simply skipped.
- **Time zone:** all four were `Europe/London`; pass it explicitly.
- **Delivery:** all four were `deliveryMode: "host"`. Rebuild by name (`schedule_create`) and expect a new id.
- **Behaviour changes worth considering before rebuilding:**
  - Both overnight-shift prompts still instruct committing and pushing to `origin main`. That **contradicts**
    `projects/applywright/AGENTS.md` (operator-only integration, commits and pushes) — rewrite them to produce
    evidence/proposals for the Codex operator instead, or they will fight the operator on the first run.
  - Both also instruct live browser/real-API verification; execution admission is operator-controlled now.
  - The nightly health check instructs restarting the server "only if it is down". Restarts are operator-owned
    under the current rules, and today's OCR/WSL fallback can auto-start Ubuntu — so the restart clause should be
    removed or gated on an explicit operator decision.
  - The weekly sweep's gap list is the October state; several items have since shipped (plan flags, webhook
    idempotency, password recovery), so its prompt is stale on arrival.

## 4. What this file does not contain

No credential values, lengths, or loading recipes; no hidden reasoning; no expired-occurrence replay; no code,
Git, WSL or model action. Only the four definitions and the reconstruction caveats.
