# Overnight brief — Applywright (read this first in any fresh session)

Written 2026-10-28. Purpose: a cold agent can pick this up at 03:00 with no context and do
useful, safe work. Read `docs/PROJECT-STATUS.md` for the full brief, `docs/IMPLEMENTATION-PLAN.md`
for the queue, `docs/PIPELINE.md` for the repo rules. This file is the *operating contract*.

## Where things are

- Code: `projects/applywright` — its own git repo (the hub gitignores `projects/*`). Public:
  https://github.com/johancilliers22/applywright
- Server: `node server/index.js` → http://127.0.0.1:3160 (SQLite in `data/`, gitignored)
- Sharing: `scripts/share.ps1` (Tailscale :8447 or a Cloudflare quick tunnel); a quick tunnel
  may be live from a previous session — check `Get-Process cloudflared`
- Contracts: `docs/SPEC.md` (product/API), `docs/design/SPEC-V2.md` (design canon)

## Gates — run before and after every change

```powershell
cd projects/applywright
node --test tests/                        # HTTP contract suite (currently 101)
node --test server/lib server/provider    # module suites (currently 309)
node scripts/check.js                     # static: pages, includes, assets, secrets, bookmarklet
```

Green means 0 failures and `check.js` **0 errors**. Warnings are only acceptable when they come
from another agent's file that is actively being written — never silence a warning to look green.

## Repo discipline

- Commit **named paths**, never `git add -A` in the hub repo. This project repo may use `git add -u`
  plus explicit new files; verify `git status` shows only what you intend.
- Commit message: one line, imperative, then a body explaining *why*.
- Push with `git push origin main`. Credentials are in Git Credential Manager; no token in env needed.
- Never commit: `data/`, `.env*`, any key, any screenshot that contains a real CV.

## What may be changed freely

Code, tests, docs in `projects/applywright/**`, marketing pages, CSS, the plan files.
You may restart the server: find the PID that owns port 3160 (`Get-NetTCPConnection -LocalPort 3160`)
and kill **that** PID — never by command-line guess, that mistake cost two stale-code debugging rounds.

## What requires Johan (do not do unattended)

1. **Vault writes: AUTHORISED FOR THIS PROJECT ONLY (Johan, 28 Oct).** One note exists at
   `luna-vault/Luna Vault/brain/applywright-platform.md`. You may update *that* note as the project
   changes. Do not create other vault notes, do not edit other notes, and do not touch `_index.md`
   without asking. Every vault write gets a line in `docs/OVERNIGHT-LOG.md`.
2. **Never touch the hub repo's tracked files** (commit only inside `projects/applywright`).
3. **Never import cookies or browser sessions** from LinkedIn or job boards, and never add
   LinkedIn scraping or auto-submission. This is the product's stated boundary.
4. **Never weaken grounding** (`assertGrounded`, `groundChanges`): a rewrite may not introduce a
   number, employer, title, qualification or date absent from the CV.
5. **Never read or print secret stores** (`~/.ruflo/secrets.env`, any `.env`, token files). Keys
   arrive through the environment or a tool's own sign-in.
6. **`estate-cua` / computer use is for interactive sessions only** — headless/unattended runs are
   closed by estate policy until B6.4. Use headless Chrome over CDP for browser checks.

## Decisions recorded 28 Oct (don't relitigate overnight)

- Licence **MIT**, friends work by **fork only** (no collaborator invites).
- The public demo stays **open**: quick tunnel up, `REGISTRATION_OPEN` left at 1. If you restart the
  server, keep it that way unless the log says otherwise.
- Claude/Codex harnesses are **not** used for delegation right now; DSH agents, Gemini and Grok are.

## Tonight's queue (highest value first)

1. Verify the CV editor end to end: `/editor` load → edit → save (PATCH re-segments) → AI assist
   returns proposals only → a fabricated number appears in `rejected`, never applied → `.md`,
   print-PDF and `.docx` exports actually produce files. Add tests for anything untested.
2. Close the hero work: `polish-aw`'s `hero-proof` markup was landing without CSS (30 warnings in
   `public/index.html`). Finish the CSS or revert the markup; `check.js` back to 0 warnings.
3. Enforce the remaining plan flags (`fullAtsReport`, `packHistory`, `dailyDigest`) or remove them
   from the pricing copy — a promise the code doesn't keep is worse than no promise.
4. Stripe webhook idempotency (record event ids), because replay currently re-applies changes.
5. Accessibility: audit `/app` and `/editor` (the marketing pages are done — axe 44 → 0).
6. Only then: new features.

## Definition of done for the night

- Gates green, tree committed and pushed, `origin/main` matches local
- The queue item you attempted is either shipped with a test or explicitly left with a dated note
- No regression in: PDF/OCR upload, `/bookmarklet` address, recovery flows, entitlement gates

## Reporting

Keep a short running log in `docs/OVERNIGHT-LOG.md` (append, newest last): timestamp, what you
verified, what you changed, what you left, and the exact gate output. Johan reads that, not the chat.

## Two questions that are NOT yours to answer

- Licence for the public repo (none chosen yet — do not add one)
- Whether the public tunnel stays up overnight (it exposes open registration; `REGISTRATION_OPEN=0`
  closes sign-up, sign-in keeps working)

## Handoff deliverables (Johan asked for these explicitly)

| File | Audience | State |
|---|---|---|
| `FORK-AND-RUN.md` | the friend, on GitHub | shipped, MIT, fork-only |
| `CONTRIBUTING.md` + `.github/ISSUE_TEMPLATE.md` | anyone forking | shipped |
| `docs/HANDOFF-FOR-A-FRIEND.md` | the friend, five steps | shipped |
| `docs/PROJECT-STATUS.md` | any cold agent | shipped |
| `docs/ORCHESTRATOR-HANDOFF.md` | **Claude / Codex / Estate / projects orchestrators** | **TO WRITE — next shift** |

`docs/ORCHESTRATOR-HANDOFF.md` must state: where the project sits and that it is an independent repo
(hub ignores `projects/*`); the gates and how to read the exit codes; the file-ownership map; which
decisions are settled (MIT, slogan, Pressproof, no OAuth, recovery-without-email) so an orchestrator
does not relitigate them; the do-not list; how to hand work to DSH/Gemini/Grok agents with disjoint
write scopes; and the estate conventions that still apply (named-path commits, no secret reads, no
vault writes beyond `brain/applywright-platform.md`, no computer use unattended).