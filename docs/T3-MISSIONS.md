# T3 Mission Control — Applywright setup

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

`ROLES.json` is the single source of truth for routing. As of this file it enables `codex` only, and its
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

Each spec has `parentThreadId` set to a placeholder — **replace it with the real T3 thread id** before
`create`, or the ledger records a mission that cannot be traced to a thread. `workspaceRoot` and
`parentWorkspaceRoot` are already this project and the hub.

**Codex write surface:** the operator must assign it before any child writes. That is why all three specs
here are read-only or evidence-only; nothing in T3 may edit this repo until Johan says which files a child
owns. Implementation goes to DSH, which already has write access under the rules in `AGENTS.md`.

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
