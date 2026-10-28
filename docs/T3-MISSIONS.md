# T3 Mission Control — Applywright setup

**22:36 UTC checkpoint:** contrastM1 R4 independently reviewed PASS_SOURCE, exactly integrated and accepted after all3gates: HTTP171PASS, modules346PASS/1SKIP, static58comparisons/0errors0warnings. Plan2.3/7.4 closed for the bounded token contract. G1R3 passes80units/all131independent cases but still needs NEW independent Sol review/integration/gates. E2EDSHR2 remains active after seven R1findings; native qualifier/browser journey unproved. Live site preserved, no deployment. Actual receipt index: [`verification/20261028-intake/CURRENT-CHECKPOINT.md`](verification/20261028-intake/CURRENT-CHECKPOINT.md).

**Live binding, 28 Oct:** sole project orchestrator/final validator is Codex chat `01a183ff-e374-7d32-ae0e-1938714e813c`. The one native T3 parent is **Applywright Native Review Broker**, thread `46ac76de-4e76-42b4-a2b1-9f6d4e09c559`, environment `c9887cd0-5164-44d0-a8c0-acc6c583ca42` (JohansPC), project/root Applywright. Observed native configuration: `codex / gpt-6.1-sol`, `reasoningEffort=xhigh`, `serviceTier=default` (Standard/fast off), `full-access`; numeric effective context and served identity UNKNOWN. The broker is the sole operational pack-ledger writer on this chat's behalf; this chat independently accepts. Receipts: `t3/receipts/20261028-intake/`; UI delivery/driver release: `verification/20261028-intake/GUI-RECEIPT.json`.

Native capability exposes DeepSeek harness routes; the Windows picker specifically showed **DeepSeek Harness - Windows**. Root previously dispatched `acpRegistry_deepseek_ubuntu` in Estate. These are separate from the unchanged standalone pack's Codex/Claude-only role schema. Native `orchestrator_capabilities` now returns option `values`; the pack expects `options[].id/type` and its first prepare failed. The broker preserved the native receipt and documented a lossless local projection in `CAPABILITY-COMPATIBILITY.json`, without editing the shared pack or roster. A prepared payload is not a dispatched task; actual handles must come from dispatch receipts.

The initial grounding/model-path tasks are now both actually dispatched: `review-grounding-r1.dispatch.native.json` and `review-model-path-r1.dispatch.native.json` record native Sol 6.1/xhigh/default tier. Their exact handles and live state are in the broker checkpoint. A later same-parent commission, `APPLYWRIGHT-CONTRAST-M1-COMMISSION.md`, authorises ONE native Windows DSH worktree implementation and then ONE independent Sol candidate review, writing only its new `receipts/20261028-contrast-m1/` manifest/receipts. This is a native provider mission, not an invented standalone pack DSH role. No code integration or acceptance is delegated. Windows fits this Node/CSS-only task; use ext4 for later substantial WSL work, with separate current provider/home proof.

**19:47 checkpoint:** both initial review tasks are terminal REQUEST_CHANGES with findings consumed; source candidate is unaccepted. The orchestrator's independent synthetic reproduction/disposition is under `verification/20261028-intake/`. Contrast DSH was actually dispatched with request `applywright-contrast-m1-dsh-r1-33be343f-3799-449e-abbe-19dc494ac556`, native worktree `C:/Users/johan/.t3/worktrees/applywright/t3-551ab369`, branch `t3/contrast-gate`, Flash/high/Full access. Its exact task ID is in `receipts/20261028-contrast-m1/dsh-writer.dispatch.native.json`. G1 repair brief `APPLYWRIGHT-GROUNDING-G1-COMMISSION.md` is prepared but NOT SENT/DISPATCHED pending fresh RAM/driver admission; it has no task handle. No schema/index/UI writer may overlap G1's refine.js scope.

**Later update:** contrast DSH is terminal and grants candidate inspection; its report says 10 focused tests passed and 29 token pairs per scheme were checked. Source hash/diff scope and independent Sol review remain required before integration; see `dsh-writer.terminal.native.json` and `dsh-writer.FINDINGS.md`. G1's existing queued commission was consumed with Send now into the parent conversation, snapshot `s0000004c:149`; composer empty at `s0000004d:161`. This supersedes NOT SENT above. Actual G1 task/worktree remains unproved until native dispatch receipt. Foreground typing was interrupted twice; the exact owned partial draft was verified and completed through the same driver's background UIA ValuePattern, then delivered once. No permission/guard denial was bypassed. GUI lifecycle ended and driver released.

T3 is the **tracking and validation** runtime for this project. It is not where the bulk of the code is
written: DSH (DeepSeek) subagents implement, Codex orchestrates, and T3 records missions with provider
routing, receipts and acceptance. This file is the operating procedure; the machine-readable specs live in
`docs/t3/`.

The pack: `C:\Users\johan\Desktop\Coding\t3-mission-control` (`SKILL.md`, `ROLES.json`, `mission.cjs`,
`mission.example.json`). Ledgers live in that pack's `missions/<id>/mission.json`; they are **not** in this
repo, because they are coordination state, not product code.

## Who does what

| Work | Owner | Why |
|---|---|---|
| Implementation, refactors, tests, docs in this repo | **DSH subagents** (this chat, or a new DSH session) | cheapest per unit of work, full tool access, and the session already holds the project context |
| Orchestration, task decomposition, final acceptance | **Codex** (new desktop chat) | it owns the plan, the dependency graph and the accept/reject decision |
| Independent review and test verification | **T3 child tasks** — `codex-planner`, `codex-reviewer`, `tester` | T3 gives them visible receipts and a separate context, which is the point of an independent check |
| Claude review | **paused** by policy — see below | `ROLES.json` `providerPolicy.claudeAgent.enabled=false` |

`ROLES.json` is the standalone pack's source of truth for role routing, not the native T3 provider catalogue. It enables `codex` only, and its
Claude entry carries a recorded reason plus an `earliestRetryAt`. **A reset date does not enable a provider.**
To re-enable Claude, Johan edits `ROLES.json`, sets `enabled: true`, and records the reason; the handoff docs
must then be updated in the same commit. The `claude-*` role presets (`claude-coordinator`,
`claude-builder`, `planner`, `reviewer`) are already defined and will work once enabled.

The model routing that matters for the *product* is separate and documented in `docs/MODEL-CONFIG.md`:
the site's AI editing runs on the Claude org key through the estate loader, not on T3.

## The flow, exactly

The coordinator is the **sole ledger writer**. Children never touch the ledger.

```powershell
$T3 = "C:\Users\johan\Desktop\Coding\t3-mission-control"

# 1. create the mission from a spec in this repo
node "$T3\mission.cjs" create "C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright\docs\t3\applywright-review-r1.json"

# 2. save the current T3 capabilities structuredContent to a file, then prepare the task
node "$T3\mission.cjs" prepare <mission-id> <task-key> <capabilities.json>
#    -> prints the exact delegate_task arguments

# 3. call T3's delegate_task with exactly those arguments, save its structuredContent,
#    add clientRequestId from the dispatched payload, then record it
node "$T3\mission.cjs" record <mission-id> <task-key> <receipt.json>

# 4. read the ledger; when the child finishes, record the status receipt
node "$T3\mission.cjs" show <mission-id>

# 5. review the result yourself, then accept with a concrete evidence file
node "$T3\mission.cjs" accept <mission-id> <evidence.md>
```

Other commands: `add` (new round), `supersede` (replace a failed attempt), `task_cancel` through T3 for
cancellation. Two outstanding children by default; workers are leaf agents and must not delegate.

## The three specs in `docs/t3/`

| Spec | Role | Access | Purpose |
|---|---|---|---|
| `applywright-plan-r1.json` | `codex-planner` | read-only | produce the next-sprint plan against the current tree, with acceptance checks and ownership |
| `applywright-review-r1.json` | `codex-reviewer` | read-only | independent review of the two modules where correctness is product-critical: grounding (`tailor.js`/`refine.js`) and the model path (`model.js`, `provider/anthropic.js`) |
| `applywright-test-r1.json` | `tester` | shared, no owned paths | run the three gates plus `scripts/e2e-flow.mjs` and report commands, results and NOT RUN items |

All three specs bind the real native parent above and use the independent Applywright root for both `workspaceRoot` and `parentWorkspaceRoot`. Only the review mission is commissioned in the first intake. Plan/test specs are later inputs, not dispatched work. Verify current native identity and absence of equivalent active tasks before any new create/dispatch; never use the Codex desktop chat ID as a T3 parent handle.

**Assigned surfaces:** this chat owns living project docs and coordinator evidence. The native broker owns only `docs/t3/applywright-review-r1.json`, `docs/t3/receipts/20261028-intake/**`, and the new review mission ledger/receipts under the pack. Review children own no files. DSH implementation requires a named disjoint file scope in a separate mission worktree; children never commit, self-merge, write the ledger or accept themselves.

## Rules that bite

- Reading a builder's worktree is allowed only with its owner's permission; a read-only reviewer never sees
  another worktree's uncommitted changes, so the candidate must be committed or arranged in the reviewer's
  checkout first.
- `isolation: worktree` is only for children that write code — and none of these three do.
- A transport error after dispatch is an **unknown outcome**: keep the request id, inspect the task, retry
  only that request id. Never generate a fresh duplicate.
- A completed task is not an accepted mission. Acceptance needs an evidence file written by the coordinator.
- Do not create polling daemons; read `task_status` when a result is needed or after a notification.

## Definition of a good T3 mission here

1. Objective is one sentence and observable.
2. Every task has a bounded brief with `inputPaths`, `ownedPaths`, `dependsOn` and acceptance checks that a
   stranger could run.
3. The coordinator has read the project's gates and can accept or reject on evidence, not on a child's
   self-report.
4. The mission's outcome lands in this repo as a commit or a dated note — otherwise it happened only in the
   ledger.
