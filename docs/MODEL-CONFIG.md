# Model configuration (how the AI editing gets a brain)

Applywright runs in one of two modes, and the difference is visible in the UI:

| Mode | When | What the agent can do |
|---|---|---|
| `rules` | no configured client, a failed/invalid model reply, or no model changes surviving the engine's checks | deterministic rewriting; inspect warnings to distinguish the cause |
| `model` | the refinement engine accepted model output internally | model-generated content passed the implemented predicate; assist may subsequently remove all accepted changes |

`GET /api/health` reports `"provider": "live"` when a client could be constructed. That is **not** proof a
call works — a wrong key reports the same. `mode: model` is evidence of the engine path, not proof that a change survived assist's final filters, that the UI applied it, or that every fact is supported. A useful-task receipt needs the accepted final changes and final content as well as mode/provider evidence. See the 28 Oct independent disposition below.

## Approved credential/runtime routes

The estate stores credentials in a selected-variable loader. Two profiles are relevant:

```bash
estate-env-run claude-org-api  -- ...   # ANTHROPIC_ORG_API_KEY   (direct API only, refuses Claude Code)
estate-env-run deepseek-api    -- ...   # DEEPSEEK_API_KEY        (OpenAI-compatible endpoint)
```

These are profile names, not permission to inspect their values. The existing product may consume its approved runtime environment. A future model launch must keep credential transfer inside the reviewed selected-variable adapter and use the shared **$190 org-API cycle guard** with honest spent/pending accounting; UNKNOWN is not zero. Do not read env/auth/store files, echo/print a key, inspect other-process argv/env, copy auth/config homes, or map an org key onto `ANTHROPIC_API_KEY`.

### Historical stdin bridge — unsafe recipes withdrawn

`scripts/model-boot.mjs` is a stdin bridge that spawns the server. Earlier documentation fed it by printing credential values from a WSL child. Johan's 28 Oct commission explicitly withdraws those key-to-stdout recipes; they must not be executed. No replacement Windows product launcher is qualified by this document. Preserve the healthy running site and obtain the current reviewed adapter/guard receipt before a future restart that changes its model route.

The org key is deliberately stored under its own name: mapping it to `ANTHROPIC_API_KEY` would flip Claude
Code onto API billing, which is why `config.js` reads `ANTHROPIC_ORG_API_KEY` and nothing else.

Defaults: `MODEL_BASE_URL=https://api.deepseek.com/v1`, `MODEL_NAME=deepseek-chat`. Override with those env
vars when a different OpenAI-compatible endpoint is wanted (Ollama, vLLM, Azure).

These product-client defaults are distinct from agent routing: DSH implementation uses its own qualified harness/profile and preserved Estate model defaults. Claude subscription/Code remains paused; direct org API is a separate authorised product/provider route and does not wake or re-enable Claude agents.

## 28 Oct independent validation — candidate REQUEST_CHANGES

Both native Sol 6.1/xhigh reviewers returned REQUEST_CHANGES on `86b74c3`. The orchestrator independently reproduced invented employer/technology/qualification/seniority/date/count and ownership claims passing `assertGrounded`/`groundChanges`, plus a currency swap passing refinement and ordinary-language false refusals. Full synthetic inputs/results: `verification/20261028-intake/grounding-repros.json`; original reports: `t3/receipts/20261028-intake/*FINDINGS.md`.

Every changed model field reaches a grounding predicate, but that predicate currently has demonstrated gaps. Additional source findings, not live-model proofs: empty summary validation can reject an otherwise valid edit; index coercion accepts null as zero; UI copy can misclassify transport/shape failures; assist can return `mode: model` after its second gate removes every change. These require scoped repairs and independent re-review. The historical successful example below is not a fresh validation or factuality guarantee. Current health returned provider live; no live model/API call was run by this intake.

## The bug this uncovered

`server/lib/cv/refine.js` demanded a `coverLetter` in every model reply. A CV-only edit has no business
rewriting a covering letter, so a perfectly good model reply was discarded and the server silently fell back
to the rules engine — which is why an instruction like "make this more professional for IT sales" appeared to
do nothing while `health` said `live`. The letter is now optional in the schema and the validator; the
prompt tells the model to include it only when the instruction concerns it.

## What it looks like when it works

Instruction: *"Make this formatted more professionally, displaying my skills off as well and tailoring
towards IT SALES jobs in the UK and abroad"* — 10.4 s, `mode: model`, **11 accepted changes, 0 rejected**,
and three model rewrites reverted by the grounding check with reasons:

- new name `"Results-driven"` is not in the original
- the rewrite claims `"drove"`, a stronger level of ownership than the original line supports
- a skills list (`React PostgreSQL Redis Kafka …`) is not in the original

That is the whole product promise in one response: it follows the instruction, and it refuses to invent.

## Restarting without a key

A plain `node server/index.js` reverts to `rules` mode and the UI says so. That is the intended fallback, not
a failure — but if the agent seems to ignore instructions, check `mode` in the response before anything else.
