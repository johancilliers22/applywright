# Model configuration (how the AI editing gets a brain)

Applywright runs in one of two modes, and the difference is visible in the UI:

| Mode | When | What the agent can do |
|---|---|---|
| `rules` | no key in the server's environment | deterministic rephrasing only: shorten, formalise, strip filler, tighten a bullet. It cannot follow an instruction like "point this at IT sales roles" |
| `model` | a key is present | real rewriting that follows the instruction — still every changed string is checked against the CV and reverts if it invents a fact |

`GET /api/health` reports `"provider": "live"` when a client could be constructed. That is **not** proof a
call works — a wrong key reports the same. The proof is an assist/refine response whose `mode` is `model`.

## Keys come from the loader, never from a file

The estate stores credentials in a selected-variable loader. Two profiles are relevant:

```bash
estate-env-run claude-org-api  -- ...   # ANTHROPIC_ORG_API_KEY   (direct API only, refuses Claude Code)
estate-env-run deepseek-api    -- ...   # DEEPSEEK_API_KEY        (OpenAI-compatible endpoint)
```

`scripts/model-boot.mjs` starts the server with a key that arrives on **stdin**, so the value is never
printed, written, or pasted into a config or a prompt. It reads stdin, refuses on an empty stream, and
spawns `server/index.js` detached.

### Claude (org credits, recommended for quality)

```bash
wsl -e bash -lc 'cd /mnt/c/Users/johan/Desktop/Coding/OpenClaw/agent-system/projects/applywright \
  && estate-env-run claude-org-api -- bash -lc "printf %s \"\$ANTHROPIC_ORG_API_KEY\""' \
  | BOOT_PROVIDER=anthropic node scripts/model-boot.mjs
```

The org key is deliberately stored under its own name: mapping it to `ANTHROPIC_API_KEY` would flip Claude
Code onto API billing, which is why `config.js` reads `ANTHROPIC_ORG_API_KEY` and nothing else.

### DeepSeek (OpenAI-compatible, cheap bulk work)

```bash
wsl -e bash -lc '... estate-env-run deepseek-api -- bash -lc "printf %s \"\$DEEPSEEK_API_KEY\""' \
  | node scripts/model-boot.mjs
```

Defaults: `MODEL_BASE_URL=https://api.deepseek.com/v1`, `MODEL_NAME=deepseek-chat`. Override with those env
vars when a different OpenAI-compatible endpoint is wanted (Ollama, vLLM, Azure).

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
