# Applywright — orchestrator handoff

For a Claude, Codex, Estate or projects orchestrator picking this up cold: what the project
is, which decisions are closed, which files belong to whom, how work is delegated here, and
what actually remains. It assumes you will delegate rather than write, and it says where to
look instead of repeating what is already written.

Read these; this file does not restate them.

- [`PROJECT-STATUS.md`](PROJECT-STATUS.md) — cold-start brief: stack, routes, modules, data model.
- [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) — phases P0–P7, owners, acceptance checks.
- [`OVERNIGHT-BRIEF.md`](OVERNIGHT-BRIEF.md) — the unattended operating contract.
- [`PIPELINE.md`](PIPELINE.md) — branch, commit, gate, publish.
- [`SPEC.md`](SPEC.md) §1 and §6 — product boundaries and the HTTP contract.
- [`design/SPEC-V2.md`](design/SPEC-V2.md) §1–2 — concept and slogan; the design canon.
- [`../FORK-AND-RUN.md`](../FORK-AND-RUN.md) — the public-facing version of the same rules.

---

## 1. Where it is

| Fact | Value |
|---|---|
| Path | `C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright` |
| Repository | its own git repo, branch `main`; `.git` lives here, not in the hub |
| Public remote | `origin` → `https://github.com/johancilliers22/applywright.git` (public) |
| Licence | MIT (`../LICENSE`); friends work by fork only |
| Written by | Johan, with a short-lived multi-agent team against [`SPEC.md`](SPEC.md) |
| Vault note | `luna-vault/Luna Vault/brain/applywright-platform.md` — the only vault file this project may write |

- **The hub does not see it.** `.gitignore:66` (`projects/*/`) in `agent-system` matches every
  project directory, so **no hub commit is involved** in shipping this project and **no
  worktree isolation is needed** for a hub mission: the repo is already isolated. The corollary
  matters more: the hub checkout does not provision these files, so an agent that only has the
  hub tree has no Applywright sources at all (`PIPELINE.md` §1).
- The one hub-side artefact is the status stub `agent-system/docs/diagnostics/APPLYWRIGHT-PROJECT-STATUS-20261028.md`
  plus its `DOC-INDEX.md` row; the hub process commits that, not a project mission.
- **Vault writes are authorised for this one note** (Johan, 28 Oct) and nothing else: do not
  edit `_index.md`, do not create another note. Log every vault write in
  [`OVERNIGHT-LOG.md`](OVERNIGHT-LOG.md).
- There is no `AGENTS.md` or `CLAUDE.md` in this repo. The estate rules in the hub
  `AGENTS.md` bind anyway: named-path commits, no secret reads, PID-scoped process kills,
  no computer use in unattended runs.
- Measured at handoff: `HEAD` = `4c5ace8` *"CV editor: section editing, grounded AI proposals,
  md/PDF/docx exports"*; `main` in sync with `origin/main`; tree clean except this file.
  That commit shipped the CV editor surface (`public/editor.html`,
  `public/assets/editor.{css,js}`, `tests/editor.test.js`, [`EDITOR.md`](EDITOR.md)) — a
  surface [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) does not list. **Expect the tree
  to be dirty again** while several agents work: that is normal here, not a defect to stage
  away ([`PIPELINE.md`](PIPELINE.md) §2).

---

## 2. Read the gates as the contract

From the project root, all three, every turn that changes code:

```bash
node --test tests/                       # HTTP, storage, auth, isolation, billing, errors
node --test server/lib server/provider   # pure modules and provider routing
node scripts/check.js                    # pages, includes, assets, CSP, secrets, bookmarklet
```

Measured on 2026-10-28 while writing this: **102 pass / 0 fail**, **309 pass / 0 fail**
(12 suites), and `applywright check — 10 pages, 24 server modules, 253 css classes` /
`ok — 0 errors, 0 warning(s)`, exit 0. Treat every number as measured-on-a-date: the tree is
written by several agents, so re-run before quoting.

- **Green means exactly two things:** 0 failures from both `node --test` runs, and 0 errors
  from `check.js`. The exit code is the answer; a summary around a non-zero exit is not.
- **Warnings are only acceptable from a file another agent is actively writing right now**
  (`OVERNIGHT-BRIEF.md`). Never silence a warning to look green: `check.js --strict` fails on
  warnings, which is the setting to use before a commit you want to defend.
- **A check that cannot print its verdict is indistinguishable from a passing one.** This is
  not hypothetical: a partial copy of the project (only `scripts/` and `public/`) made
  `checkServer()` throw before the summary line, so no `FAIL` appeared and a deliberately
  broken bookmarklet "passed" — a false green that produced one wrong conclusion already
  (`IMPLEMENTATION-PLAN.md` §P7, footnote to 7.8). Rule for you and for any harness you
  delegate: a check must print a machine-readable verdict line, and if you cannot see that
  line, the check failed.
- **There is no CI.** No workflow, no lint, no type checker (`PIPELINE.md` §4;
  `.github/` holds only `ISSUE_TEMPLATE.md`). The gate and a read of the diff are the entire
  review. Nothing enforces that but you.

---

## 3. Settled decisions — do not relitigate

| Decision | Encoded in |
|---|---|
| Product is **Applywright**; company and site are **Intelligent Artificial** at `intelligentartificial.net` | [`DOMAIN.md`](DOMAIN.md) §0, vault note |
| Slogan **"Your numbers stay. The wording moves."**, proof line **"Nothing invented."**, never the old tagline as a heading | [`design/SPEC-V2.md`](design/SPEC-V2.md) §2; shipped in `public/index.html` |
| Design language **Pressproof**: Working Proof is the promise, Pressproof the mechanism; paper for artefacts, desk for controls | [`design/SPEC-V2.md`](design/SPEC-V2.md) §1 |
| Licence **MIT** | `../LICENSE`, `package.json` `"license": "MIT"` |
| Collaboration is **fork-only**; no collaborator invites, no push access for friends | [`../FORK-AND-RUN.md`](../FORK-AND-RUN.md) §2, [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| **No LinkedIn OAuth** and **no automated submission** — capture is user-initiated, a pack ends at `pack_ready` | [`SPEC.md`](SPEC.md) §1 hard boundaries; `BLOCKED_CAPTURE_HOSTS` in `server/app.js` |
| **Grounding is non-negotiable**: `assertGrounded` / `groundChanges` may never be weakened to make a rewrite pass | `server/lib/cv/tailor.js`, `server/lib/cv/refine.js`, [`SPEC.md`](SPEC.md) §5 |
| **Recovery without email**: single-use recovery codes at sign-up, expiring reset tokens, operator CLI | `server/app.js` auth routes, `scripts/reset-password.mjs`, `tests/auth-recovery.test.js` |
| The **demo stays publicly open** (`REGISTRATION_OPEN=1`); close it only if the log says so | [`OVERNIGHT-BRIEF.md`](OVERNIGHT-BRIEF.md) "Decisions recorded" |

Two more that are structural rather than product: **one process per database** (rate limits, the
feed cache and the alert scanner are in-process; SQLite has one writer) and **no build step**
(what is in `public/` is what the browser gets). Encoded in [`PROJECT-STATUS.md`](PROJECT-STATUS.md)
§2 and [`PIPELINE.md`](PIPELINE.md) §6.

---

## 4. File ownership map

One writer per file, disjoint scopes per agent. Contracts are read-only unless changing them is
the task: [`SPEC.md`](SPEC.md) §5 (product truth, Lead-owned), [`design/SPEC-V2.md`](design/SPEC-V2.md)
(design truth). `SPEC.md` wins a disagreement about behaviour; report it rather than quietly
follow the other file.

| Surface | Files | Rule |
|---|---|---|
| Server spine | `server/index.js`, `app.js`, `config.js`, `db.js`, `store.js`, `auth.js`, `model.js`, `pages.js`, `util.js`, `alerts-runner.js`, `server/provider/anthropic.js` | One writer. Routes are the HTTP contract in `SPEC.md` §6; never break a shape a test asserts |
| Library modules | `server/lib/text.js`, `server/lib/cv/*`, `server/lib/jobs/*`, `server/lib/packs/build.js`, `server/lib/billing/plans.js` | One agent per module against its `SPEC.md` §5 signature; unit suite beside the code |
| Marketing pages | `public/*.html`, `public/partials/**`, `public/assets/site.css`, `site.js` | Site owner; `check.js` fails on an undefined class, so ship the rule with the class |
| Product SPA | `public/app/app.html`, `app.css`, `app.js` | App owner; hardcoded colours must survive the dark scheme |
| CV editor | `public/editor.html`, `public/assets/editor.{css,js}`, `tests/editor.test.js` | Editor owner. `server/app.js` imports `public/assets/editor.js`, so moving that file breaks boot |
| Theme layer | `public/assets/tokens.css`, `theme.css`, `motion.css`, `theme.js` | Design owner; semver-safe tokens (no rename, no delete) |
| Tests | `tests/*.test.js`, `server/lib/**/*.test.mjs` | One owner at a time; suites must never touch the network or `data/` |
| Static and tooling | `scripts/check.js`, `scripts/seed.mjs`, `scripts/browser-preview.mjs`, `scripts/reset-password.mjs`, `scripts/share*.ps1` | Change only with the gate re-run and a full copy of the project for any self-test |
| Docs | `docs/*.md`, `README.md`, `FORK-AND-RUN.md`, `CONTRIBUTING.md` | Docs claim only what a command or file shows |

**Two files are still contested. Finish the cleanup deliberately; do not inherit it as drift.**

1. **`public/assets/tokens.css` — a dead `.reveal` block** (lines 534–550, five rules,
   `reveal-on` / `is-visible`). `public/assets/site.js` records at line 54 that the scroll
   reveal, its observer and those classes were retired with the rest of the old motion; no
   HTML in `public/` carries `class="reveal"` any more; `motion.css` mentions it only in a
   prose comment. Delete the block, then re-run `check.js` (its class census will move) and
   the two `node --test` runs.
2. **`public/assets/theme.css` — the `--mark` overrides at lines 73–114.** Their own comment
   says they exist so `site.css` can migrate the ink-on-paper components to `var(--mark)` and
   then be "deleted without changing a pixel". `site.css` has since migrated
   (eight `var(--mark)` uses: brand mark, nav current-page rule, nav toggle bars, card icon,
   featured plan border, `.btn--light`, the pill, `.btn--primary`). Verify pixels in both
   schemes, delete what is now redundant, and leave the `.mock__who`, `.nav` fallback,
   `.section--dark`, `.bento` and `.hero__grad` rules that are still doing work. Deleting
   without the pixel check is the failure mode; leaving them is the other.

---

## 5. How to delegate here

- **DSH subagents and swarms, with disjoint scopes.** Split by file, not by phase prose: one
  module per agent against its `SPEC.md` §5 contract, or one surface from §4 above. Workers
  edit; the orchestrator commits named paths and pushes. A worker that reports "done" without
  the three commands' output has not reported.
- **Keep the append-only files serialised.** `docs/OVERNIGHT-LOG.md`, `docs/PROJECT-STATUS.md`
  §7 counts and `docs/IMPLEMENTATION-PLAN.md` markers are shared append surfaces: one writer
  at a time, or hand them back to the orchestrator.
- **Gemini for vision and long-context review.** It reads the 429-line `SPEC-V2.md`, the 66-pair
  contrast table and the 22 screenshots in `screenshots/` in one pass — use it to check a design
  change against the canon, and to review a rendered page rather than a diff.
- **Grok for market, legal and live-web questions.** Blocked-host terms, job-board API terms,
  VAT treatment for UK consumer sales, competitor claims. Ask for sources; the estate's rule is
  that an external claim needs a citable primary source, and `design/SPEC-V2.md` §2 already
  records one claim (the "75% rejected by ATS" figure) as unsourced and therefore banned.
- **Claude and Codex harnesses are not in use for delegation right now** (Johan's 28 Oct
  decision, [`OVERNIGHT-BRIEF.md`](OVERNIGHT-BRIEF.md)). Codex is acceptable for design only;
  do not route implementation or review through either.
- **No computer use unattended.** `estate-cua` is for interactive sessions only; estate policy
  keeps headless runs closed until B6.4. For browser checks use headless Chrome over the
  DevTools protocol: `scripts/browser-preview.mjs` is the pattern (no npm package, no
  Playwright), `scripts/seed.mjs` gives you the demo account, and `screenshots/` is the
  artefact to review.
- **Restart the server by port owner, not by name.** `node server/index.js` on
  `127.0.0.1:3160`, one instance only. Find the PID that owns 3160
  (`Get-NetTCPConnection -LocalPort 3160`) and kill that PID.
- **Never read a secret store.** Keys arrive through the environment or the tool's own
  sign-in; `data/` holds CV text and is personal data.

---

## 6. What is genuinely left

Take the queue from [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md) and
[`OVERNIGHT-BRIEF.md`](OVERNIGHT-BRIEF.md) — not from memory, and not from this table alone.
**Then reconcile against `git log --oneline`:** three items are already behind the tree
at handoff. P3.6 (hero) is marked QUEUED but `342d621` rebuilt it as a proof sheet and no
`.mock__*` or `.hero__grad` class survives in `public/index.html`; P3.7 (motion) is marked
QUEUED but `site.js` records the reveal retired; the CV editor (`4c5ace8`) is a whole surface
the plan does not list. Read the plan as intent, the tree as truth.

Not blocked — ordered by value per hour:

| Item | Plan ref | What it actually is |
|---|---|---|
| Enforce or withdraw `fullAtsReport`, `packHistory`, `dailyDigest` | 5.1 | Three features sold on the pricing page, gated nowhere. Either gate them or delete the copy |
| Stripe webhook idempotency | 5.4 | Record the event id and check it before the plan write; Stripe retries, today a replay re-applies |
| Contrast assertions inside `check.js` | 2.3 / 7.4 | The 66-pair table is measured by hand and rots on the next token edit |
| `axe-core` as a dev dependency over the pages | 2.4 / 7.5 | The audit exists ([`design/ACCESSIBILITY-AUDIT.md`](design/ACCESSIBILITY-AUDIT.md)) but is not a gate; keep it out of the served bundle |
| Finish the keyboard and focus pass | 2.1, 2.5, 2.6 | `/app` and `/editor` are not covered by the marketing audit; live regions for score and capture state |
| `.aw-folio` / `.aw-proof` component and the redline trace | 3.3, 3.4 | The grounding promise is still copy in most places; this is where it becomes visible |
| Consume the bookmarklet's `title`, `company`, `blocked` in the SPA | 4.3 | Parsed metadata is currently dropped |
| `pm2` supervision and backups | 6.7, 6.8 | A reboot leaves the app down; a bare copy of the WAL database drops recent writes |
| Regression test for the bookmarklet guard | 7.8 | The guard is verified by hand only (three mutation probes). The test needs a full project copy, see §2 |
| Reconcile the stale docs | none — queued nowhere | `README.md` still carries the old tagline; `PIPELINE.md` and `PROJECT-STATUS.md` still say branch `master`, no remote; `PROJECT-STATUS.md` §9 still says Tesseract is absent; counts in §7 have moved. `FORK-AND-RUN.md` §5 already lists part of this drift |

**Blocked on Johan, and only Johan:**

- **Stripe keys** (5.5) — no live or test-mode call has ever been made; checkout, portal and
  webhook signature need real keys before 5.4 can be verified rather than reasoned about.
- **Domain DNS at GoDaddy and the Cloudflare tunnel** (6.5, 6.6) — registrar access, the
  Cloudflare account, tunnel creation and the SSL mode are account actions. `DOMAIN.md` §0 is
  explicit that nothing has been executed. Do not plan work that assumes a hostname exists.
- **VAT** (5.3) — the rate and whether displayed prices are inclusive is a legal decision, not
  an engineering one. Prices are labelled "excluding VAT" with no VAT anywhere.
- **Licence of any vendored asset** — nothing hosted or vendored is in the tree today
  (`design/SPEC-V2.md` §10: no webfont, no icon set, no framework). If an agent proposes to add
  one, that is a Johan decision, including a dev-only dependency with a copyleft licence.

Not planned work: the tunnel state. A quick tunnel may be live from an earlier session
(`Get-Process cloudflared`); confirm before telling anyone the demo is reachable.

---

## 7. Five mistakes already made here

Each cost time and is cheap to avoid. They are recorded because the same shapes recur.

1. **Killing the server by command-line guess instead of by port-owner PID.** Two debugging
   rounds were spent reading stale code from a process nobody had actually restarted
   ([`OVERNIGHT-BRIEF.md`](OVERNIGHT-BRIEF.md), "What may be changed freely"). Find the PID that
   owns 3160, kill that PID, confirm the banner's port and mode on the next start.
2. **Trusting `node --check` on the bookmarklet.** Syntax-valid is not a URL: a banner-first
   line, a doubled scheme or a line break makes a `javascript:` bookmarklet inert while
   `node --check` exits 0. `scripts/check.js` now asserts the artifact parses as a
   `javascript:` URL, carries exactly one scheme and one `__ORIGIN__`, is a single line and
   makes no network call (`checkBookmarklet`, and the comment at line 126 says why). Never
   verify that artifact by syntax alone.
3. **A `git add -A` sweeping another agent's in-flight files into an unrelated commit.** The
   tree is routinely shared with concurrent writers — the CV editor surface was uncommitted in
   it for part of the night this file was written. `PIPELINE.md` §2 and `OVERNIGHT-BRIEF.md`
   both state the rule: `git status --short` immediately before staging, then stage named
   paths only. Uncommitted work from another agent is not yours to commit, revert or judge.
4. **`/app` redirecting because `express.static` defaults to directory redirects.** Mounting
   `public/app` as static made `/app` 301 to `/app/` before the SPA shell was served;
   `server/app.js` now mounts it with `redirect: false` and a comment saying so. The general
   form: a framework default is a bug until you have watched the request.
5. **Documenting behaviour before verifying it.** Several docs described features that did not
   exist — six design citations pointed at a file that was not there until it was written
   (`IMPLEMENTATION-PLAN.md` 3.8), a false-green check produced a confident wrong conclusion
   (§P7), and the same drift runs the other way now, with shipped code that the plan still
   calls QUEUED. Rule: a doc sentence needs a command, a route or a file read behind it on the
   day it is written; "DONE" means the check passes, not that the code looks finished.

## Postscript (28 Oct, after this was written)

Two things above are historical rather than current, kept so you can see what changed:

- The drift list (branch/remote, licence, Tesseract, README tagline, gate counts, plan-vs-tree) was
  reconciled at its source in **`01c4c23`** — the docs now match the code. If a line above still says
  "QUEUED" or "no remote", treat the repo as authoritative and trust `git log`.
- The hero (P3.6), motion (P3.7) and the CV editor are shipped (`342d621`, `4c5ace8`), and the plan
  marks them done.

Everything else — the settled decisions, the ownership map, the delegation advice and the five
mistakes — stands as written.