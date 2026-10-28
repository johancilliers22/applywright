# Applywright — Obsidian vault patch

**Why this file exists.** Missions cannot write the vault (`luna-vault/**` is sacred and
off-limits to every mission, including hub-fired ones). So the vault update is delivered
as this patch document for Johan to apply by hand. Nothing here has been written to
`Luna Vault/` — copied, not moved, and not committed anywhere.

**What to apply:** one note (a) and one optional row (b).

---

## (a) New note — `Luna Vault/projects/applywright/_index.md`

The vault's `projects/` folder uses one folder per project with an `_index.md`, linked
from `projects/_index.md`. Create the folder `projects/applywright/` and paste the block
below into `_index.md`. To keep it as a single loose note instead, save it as
`projects/applywright.md` — but then the MOC row in (b) needs that path.

````markdown
---
type: project-index
project: applywright
confidence: verified
last_verified: 2026-10-28
source: agent-mission
tags: [projects, product, applywright]
---

# Applywright — CV tailoring platform (intelligentartificial.net)

## What it is

A CV scoring and tailoring web product by **Intelligent Artificial**. One CV is scored
against a specific job description, rewritten using only facts the CV already contains,
packaged into a print-ready ATS-safe CV with a covering letter and four screening answers,
tracked through an application queue, and kept supplied by saved searches that poll three
public job boards and drop matches into an inbox plus an RSS feed.

Company Intelligent Artificial; tagline *Your CV, tailored for every job.* Built for people
who are serious about a search, not a spray-and-pray bot.

Three refusals by design, with code behind each: **no LinkedIn scraping or background
crawling** (capture refuses LinkedIn/Indeed/Glassdoor URLs and only reads the three public
job APIs plus Stripe), **no automated submission** (a pack ends at `pack_ready`; the human
clicks apply and records the outcome), **no fabricated experience** (a grounding check
rejects any rewrite that introduces a number, employer, title, date or qualification the
CV does not contain).

## Where the code and canon live

- Code: `C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright`
  — its **own git repo** (`main`; public `origin` at
  <https://github.com/johancilliers22/applywright>, pushed and in sync; 12 commits,
  `bc6731d` first).
- It is **not a hub package**: the agent-system hub gitignores `projects/*/`, so the hub
  cannot see it and a hub worktree does not provision it.
- Canon, in reading order:
  - `docs/PROJECT-STATUS.md` — the cold-start brief (what it is, stack, routes, modules,
    data model, verification, sharing, known gaps);
  - `docs/IMPLEMENTATION-PLAN.md` — phases with owners and acceptance checks;
  - `docs/PIPELINE.md` — branch, commit, gate commands, push instructions;
  - `docs/SPEC.md` — the product contract (data model, module signatures, decisions);
  - `docs/design/` — design synthesis plus three directions and four research files;
  - `docs/SHARE.md`, `docs/DOMAIN.md`, `docs/DEPLOY.md` — sharing and hosting.
- Hub-level stub: `agent-system/docs/diagnostics/APPLYWRIGHT-PROJECT-STATUS-20261028.md`.

## How to run and share it

Run (one process, no build step, no external service required):

```powershell
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
npm install
Copy-Item .env.example .env.local   # optional; defaults boot
node server/index.js                 # or: npm start
```

- `127.0.0.1:3160` by default. Node 22.5+ is required (`node:sqlite`).
- Empty environment is a supported state: tailoring falls back to deterministic rules,
  plans and quotas are visible, checkout answers 501.
- `REGISTRATION_OPEN=0` closes public sign-up while keeping sign-in working; the demo is
  currently public with registration open (Johan, 28 Oct).
- Share: `pwsh -NoProfile -File scripts/share.ps1 -Mode tailscale -WhatIf` (dry run), then
  `-Mode tailscale` (private, auto-picks https 8447 because 443 is taken on this host) or
  `-Mode cloudflare` (public, ephemeral quick tunnel). `scripts/share-stop.ps1` undoes only
  what it created.
- Target home `intelligentartificial.net` via a named Cloudflare tunnel — **not executed**:
  the domain is on GoDaddy nameservers, no record, tunnel, host or certificate exists.

## The design system, in one paragraph

Hand-written CSS on the **Meridian** token system: `public/assets/tokens.css` carries the
palette (ink, bone, paper, a green interaction accent), the serif/sans/mono trio and the
layout primitives; `theme.css` re-keys those tokens for the product and holds the dark
scheme, applied by `html[data-theme="dark"]` and `theme.js` in the head so there is no
flash; `motion.css` holds the permitted motion; `site.css` the marketing components and
`public/app/app.css` the product surface. There is no framework, no hosted font and no
build step — the files served are the files written. Two measured rules govern changes:
interactive green `--accent` is deliberately a different value from semantic `--ok`, and
the 48% ink rule is the only line allowed to identify a control (3:1 floor). The system is
specified in **`docs/design/SPEC-V2.md`** (shipped 28 October 2026; it supersedes
`docs/design/DESIGN-INPUTS.md` where they disagree, and `docs/SPEC.md` still wins on
product truth). Part of the component work is shipped: the hero is now the advert→CV proof
sheet (commit `342d621`) with the vernier gauge, and the old motion is retired. The
*Pressproof* folios from `docs/design/DIRECTION-gemini.md` (paper artefacts, margin-gutter
redlines with `[CV §n]` citations) are still queued, not shipped.

## Decisions taken

- **No scraping, no auto-submission, no invented experience.** These are the product, not
  a policy layer; the capture endpoint refuses the blocked hosts and the tailor refuses an
  ungrounded rewrite.
- **Bring-your-own-copy connectors.** Every import parses text the user already holds.
  There is no OAuth, no fetch, and **browser-cookie/session import is rejected by
  decision** — it is automated access by another name and the user cannot revoke it.
- **Rules fallback is a real path, not a stub.** With no `MODEL_API_KEY` the rewriter
  segments, scores, re-orders and reuses the CV's own wording, and `mode` says `rules`.
- **One process, local SQLite, no serverless.** In-process alert scanner, in-process rate
  limits, one writer; a function host would lose the database and the sessions.
- **Honest refusal over half-wired.** Stripe unconfigured means plans visible, checkout 501.
- **Enforce what you display.** Four quotas are enforced (`cvs`, `packs`, `alerts`, job
  results per day) and the capability flag list is exactly the three a handler gates
  (`fullAtsReport`, `coverLetter`, `packHistory`), with `FLAG_FEATURES` equal to
  `ENFORCED_FLAGS`. Scale is a quota tier — it adds unlimited CVs and packs and 50 saved
  alerts, not features. `GET /api/export` is deliberately open to every plan for data
  portability.
- **One bookmarklet artifact, two entry points.** Settings inside `/app` is the primary
  install; `/bookmarklet` is the same artifact made shareable to a signed-out person.
- **No data without an exit.** CV text is stored as text, export is one route, delete is
  hard and cascades.

## Open questions

- **VAT.** Prices are labelled "excluding VAT" and no VAT is modelled. Sell to UK consumers
  and this becomes a legal question: rate, inclusive-or-exclusive display, and one function
  that produces the line.
- **PDF and OCR tooling.** PDF reads through a local `pdftotext`: Poppler 26.09 is on the
  Windows user `PATH`, with the `wsl -e` fallback for a shell that lacks it. OCR is wired to
  Tesseract, which is not on the Windows `PATH` but is installed in WSL
  (`/usr/bin/tesseract`), so image uploads are read through the fallback; the capability
  probe is cached per process. Make Tesseract a Windows requirement, or keep it optional?
- **Bookmarklet vs extension.** The bookmarklet is shipped and compliant. An extension is
  only a different install path for the same user-initiated read — is it worth the review
  surface, and does it risk becoming a second capture implementation?
- **Hosting.** Keep the public quick-tunnel demo, move to a named tunnel behind Cloudflare
  Access, or a small VPS with Caddy — and who terminates TLS. Nothing is deployed; the
  registrar, Cloudflare account and certificate decisions are Johan's.
- **Password recovery delivery.** Recovery works without a mail server: an offline
  recovery code saved at sign-up, a single-use expiring reset link via `/reset`, and an
  operator CLI fallback (`scripts/reset-password.mjs`). The open question is delivery —
  today an operator passes the link on, so which path (transactional mail, magic link)
  before inviting strangers?
- **Scale shape.** Single-process SQLite is right for now. If multi-tenant growth arrives,
  move to a hosted Postgres and a real job runner — or accept one instance.
````

---

## (b) One row — `Luna Vault/projects/_index.md`

Add this row to the table under the heading *Projects MOC*, keeping the existing rows and
order untouched. It is a pure addition: one line in, nothing changed.

```markdown
| Applywright | applywright | active (MVP complete on the rules path; public repo, `main` pushed) | 2026-10-28 | [[projects/applywright/_index]] |
```

Place it after the *Brunel MSc AI (Online)* row so the table stays roughly in
last-touched order, or at the end if you prefer append-only.

---

## Applying it — checklist

1. In Obsidian, create `projects/applywright/` and its `_index.md`; paste block (a).
2. Open `projects/_index.md`; add the row from (b) to the table.
3. Confirm the row renders as a link (the note path must be exactly
   `projects/applywright/_index.md`).
4. Commit in the vault repo **from the `Luna Vault` subdirectory**, not `luna-vault/`:
   `cd "OpenClaw/luna-vault/Luna Vault"` then `git add projects/applywright/_index.md
   projects/_index.md` and commit. (`luna-vault/` is not the git root.)

**Not included on purpose:** there is no edit to `brain/_index.md`. This note is a project
record, not cross-cutting canon, so it belongs under `projects/`, reached from the Projects
MOC. If you decide it *is* canon, add the link to `brain/_index.md` yourself — that file is
brain canon and the ownership rules there are stricter than a project note.
