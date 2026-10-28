# Overnight brief — Applywright (read this first in any fresh session)

Written 2026-10-28. Purpose: a cold agent can pick this up at 03:00 with no context and do
useful, safe work. Read `docs/PROJECT-STATUS.md` for the full brief, `docs/IMPLEMENTATION-PLAN.md`
for the queue, `docs/PIPELINE.md` for the repo rules. This file is the *operating contract*.

## Where things are

- Code: `projects/applywright` — its own git repo (the hub gitignores `projects/*`). Public:
  https://github.com/johancilliers22/applywright
- Server: `node server/index.js` → http://127.0.0.1:3160 (SQLite in `data/`, gitignored)
- Sharing: `scripts/share.ps1` (Tailscale :8447 or a Cloudflare quick tunnel); the public
  demo's quick tunnel is up while registration stays open (Johan, 28 Oct) — check
  `Get-Process cloudflared`
- Contracts: `docs/SPEC.md` (product/API), `docs/design/SPEC-V2.md` (design canon)

## Gates — run before and after every change

```powershell
cd projects/applywright
node --test tests/                        # HTTP contract suite (currently 113, measured 2026-10-28)
node --test server/lib server/provider    # module suites (currently 309, measured 2026-10-28)
node scripts/check.js                     # static: 10 pages, 24 modules, 253 css classes; expect 0 errors, 0 warnings
```

Those counts are measured-on-a-date: re-run the commands and update this line before
quoting a number.

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
   print-PDF and `.docx` exports actually produce files. It shipped in `4c5ace8` with
   `tests/editor.test.js`; verify the path against a running server rather than build it.
2. **Done** — the hero is the advert→CV proof sheet (`342d621`) and its CSS is complete;
   `check.js` is back to 0 warnings.
3. **Done** — the plan flags landed in `7b88acc`: `fullAtsReport` and `packHistory` are
   enforced, `dailyDigest` is removed, and `apiAccess` / `priorityRefresh` / `bulkExport`
   are named as declared-only.
4. **Done** — Stripe webhook idempotency landed in the same commit: `stripe_events` records
   each event id before applying it (schema v3), so a replay changes nothing.
5. Accessibility: audit `/app` and `/editor` (the marketing pages are done: the axe matrix
   went 44 → 16 nodes, all 16 best-practice `heading-order` and since fixed by the footer
   `<h3>` change; 0 WCAG-tagged failures remain).
6. Only then: new features.

## Definition of done for the night

- Gates green, tree committed and pushed, `origin/main` matches local
- The queue item you attempted is either shipped with a test or explicitly left with a dated note
- No regression in: PDF/OCR upload, `/bookmarklet` address, recovery flows, entitlement gates

## Reporting

Keep a short running log in `docs/OVERNIGHT-LOG.md` (append, newest last): timestamp, what you
verified, what you changed, what you left, and the exact gate output. Johan reads that, not the chat.

## Two decisions that are already made — do not relitigate

- Licence **MIT**: `LICENSE` (MIT, © 2026 Johan Cilliers / Intelligent Artificial) and
  `package.json` `"license": "MIT"` settle it. Do not add a second licence.
- The public demo stays **open**: quick tunnel up, `REGISTRATION_OPEN` left at 1 (Johan,
  28 Oct). If you restart the server, keep it that way unless the log says otherwise;
  `REGISTRATION_OPEN=0` closes sign-up and leaves sign-in working.

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