## What happened

<!-- One or two sentences. Name the route, page or module if you know it. -->

## How to reproduce

1.
2.
3.

## What you expected

## What actually happened

<!-- Error code and message if there is one, e.g. 402 quota_exceeded, 403 registration_closed, 501 not_configured. -->

## Environment

- Operating system and whether you are in WSL:
- `node --version`:
- Commit or branch:
- Model mode: `rules` or `model` (the `mode` field on a pack, or `provider` from `/api/health`):

## Does the gate pass?

```text
node --test tests/
node --test server/lib server/provider
node scripts/check.js
```

<!-- Paste the output, not a summary. -->

## Please do not include

API keys, `.env` files, real CV text, or anything copied out of `data/`. Those are personal
data and a public issue is the wrong place for them.
