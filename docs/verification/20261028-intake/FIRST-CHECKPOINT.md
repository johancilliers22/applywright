# First Applywright orchestrator checkpoint — 28 October 2026

Orchestrator/final validator: Codex `01a183ff-e374-7d32-ae0e-1938714e813c`. Shared Estate coordinator/publisher and Hermes installed owner remain T3 Estate `3e09eb96-365d-4610-adfe-9de6d68ce445`; Root's existing heartbeat stays with Root. No project scheduler or goal was created.

Native T3 parent **Applywright Native Review Broker** is `46ac76de-4e76-42b4-a2b1-9f6d4e09c559`, project `52d7ab92-2c81-44ec-b5a3-a014fa65c6d6`, environment `c9887cd0-5164-44d0-a8c0-acc6c583ca42` / JohansPC, Windows x64 backend `0.1.4-nightly.20261028.3824`. Its actual workspace is this independent Applywright repo. Source: `docs/t3/receipts/20261028-intake/CHECKPOINT.json`.

Both actual review tasks were dispatched, with full handles preserved in the named native dispatch receipts:

| Task | Request binding | Receipt |
|---|---|---|
| Grounding review | `t3mc-applywright-review-r1-review-grounding-r1-8a96140d-8d17-4adb-a076-7180a3a6cdf0` | `docs/t3/receipts/20261028-intake/review-grounding-r1.dispatch.native.json` |
| Model-path review | `t3mc-applywright-review-r1-review-model-path-r1-9e79b5c4-2b81-49fc-829f-57140d4ceace` | `docs/t3/receipts/20261028-intake/review-model-path-r1.dispatch.native.json` |

Parent and BOTH child receipts select `codex / gpt-6.1-sol / reasoningEffort=xhigh / serviceTier=default` (Standard, fast off). Parent `full-access` is observed in native configuration; the children are prompt-scoped read-only, not OS-confined. No numeric context override was introduced. Effective context, served backend identity and cost remain UNKNOWN. The native option schema drift required a clearly labelled lossless local projection for the unchanged standalone pack; raw capability and first failed prepare receipts remain preserved. Native DSH availability is distinct from the pack's Codex/Claude roster.

Initial Git state: independent repo root `C:/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright`, clean `main == origin/main`, HEAD `86b74c3a1869255ce276cfe961474193d6080ca0`, 62 commits, 332 tracked files. Subsequent changes are coordinator docs/spec/evidence only. Product sources remain untouched at this checkpoint. No hub Git writes or publication.

Fresh required gates, Windows Node `C:/Program Files/nodejs/node.exe` `v26.12.1`, 19:37:44–19:37:48 UTC:

```text
node --test tests/                       exit 0; tests 150; pass 150; fail 0; skipped 0
node --test server/lib server/provider   exit 0; tests 347; pass 346; fail 0; skipped 1
node scripts/check.js                    exit 0; 10 pages, 24 server modules, 263 css classes
ok — 0 errors, 0 warning(s)
```

The skip is the WSL pdftotext fallback test because native pdftotext is available. An earlier runner attempt completed HTTP output but stopped before receipt hashing because its PowerShell lacked Get-FileHash; the log is preserved as `http-pre-receipt-attempt1.log`. The repaired evidence runner uses .NET SHA256 and the successful three-command run is bound in `gates.json`. The runner held `/tmp/redline-heavy.lock` exclusively for its full lifetime and cleared named provider/billing variables only in its child process; no env files were present and no secret values were read. It used scratch databases and fixtures.

Live site readback only: listener `127.0.0.1:3160`, PID `43828`; `/api/health` returned status ok/version 0.1.0/provider live/Stripe false/84 cached jobs. This is NOT a live-model or useful-task proof. No site restart or data mutation. E2E, live-model invocation, Stripe, DNS/cutover and numeric model capacity are NOT RUN/unproved.

Root's ONE Estate relay was first queued, then consumed via the existing Send now control. Snapshot `s0000003b:184` shows it in the conversation, and `s0000003c:196` shows an empty composer. Estate execution/acknowledgement is separate. GUI session `applywright-20261028` ended and the single driver is released to Root; no further GUI input while Root holds it. See `GUI-RECEIPT.json`.

Owned surfaces: this chat owns project plan/living docs/coordinator evidence and final acceptance; the T3 broker is the sole operational writer for the assigned new review ledger/spec/receipts. Review children own no files. Future DSH missions receive separate worktrees and disjoint named scopes; no child commits, self-merges, edits the ledger or accepts itself. Only the named vault note may be considered after coordinating with Estate; no vault write has occurred.

Next: consume independent review results and record disposition; implement the disjoint P2.3/P7.4 contrast gate via admitted DSH, then obtain independent candidate review before integration. Do not weaken grounding. MODEL-CONFIG's unsafe key-output recipes are explicitly withdrawn by the commission and relay; remove those current recipes after the model-path reviewer finishes reading the historical document. No work depends on Claude. Human decisions remain DNS, Stripe/VAT and Scale-tier product choices.
