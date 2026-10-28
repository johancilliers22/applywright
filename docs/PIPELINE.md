# Applywright — git and delivery pipeline

*How this project is versioned, verified and published, as it actually is on 2026-10-28 —
not as it might be. Read after [`PROJECT-STATUS.md`](PROJECT-STATUS.md) and
[`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md).*

---

## 1. Repo identity

| Fact | Value |
|---|---|
| Path | `C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright` |
| Own git repository | **yes** — `.git` lives here; `git rev-parse --is-inside-work-tree` → `true` |
| Branch | `main` — the trunk; it tracks `origin/main` |
| First commit | `bc6731dfe734a5167a9579b8e4de98e5ef830629` — *"Applywright: CV scoring, grounded tailoring, job tracking and alerts"*; 12 commits at measurement |
| Current HEAD | `e5b04f0` (see `git log --oneline -1`; docs lag commits, the repo is authoritative) — previously `7b88accb27afa4b0c6e7f2fe5123988371035492` — *"Enforce what the plans sell; make the Stripe webhook idempotent"* |
| Commit author | Johan Cilliers `<johannes.cilliers1@gmail.com>`, Wed 28 Oct 2026 05:52:21 +0000 |
| Tracked files | **148** (`node_modules/` is ignored, not tracked) |
| Remotes | `origin` → <https://github.com/johancilliers22/applywright.git> (**public**); `backup` → `../applywright-remote.git`, a local bare copy last pushed at `eb6dd75` |
| Pushed anywhere | **yes** — `origin/main` is public and matched local `main` at measurement; `backup/main` is behind |

**It is not a hub package.** The hub repo
(`agent-system`) ignores every project directory with a single rule at `.gitignore:66`
(`projects/*/`); only `projects/_registry.toml` is tracked. Verify from the hub root:

```bash
git check-ignore -v projects/applywright/docs/SPEC.md
# .gitignore:66:projects/*/  projects/applywright/docs/SPEC.md
```

Consequences that matter to an orchestrator:

- **No hub commit is involved** in shipping this project, and **no checkout move was
  needed** to give it a history — it was initialised in place.
- The hub cannot see these files, so a hub worktree does **not** provision them. A fresh
  agent that only has the hub checkout has no Applywright sources; it needs this path on
  the same machine.
- The one hub-side artefact is the status stub at
  `agent-system/docs/diagnostics/APPLYWRIGHT-PROJECT-STATUS-20261028.md` plus its single
  `docs/DOC-INDEX.md` row. Those are committed by the hub process, under the hub's own
  rules — not by a project mission.

---

## 2. State of the tree at handoff

**Expect a dirty tree — that is normal here, not a problem to "fix" by staging
everything.** Several agents were writing at the same time as these documents, so the
working tree carried changes well beyond one handoff: modified server modules (`app.js`,
`server/lib/cv/extract.js`), modified assets and pages (`public/app/app.js`,
`public/app/app.css`, `public/index.html`, `public/assets/bookmarklet.js`, a marketing
partial), a modified static check (`scripts/check.js`), screenshot churn under
`screenshots/`, and new untracked files (the four handoff docs, `docs/design/SPEC-V2.md`,
`scripts/reset-password.mjs`). At one earlier point `git status --short` showed
`M public/app/app.js` and an untracked `.ui-settings.png`; the PNG is gone, and the
modified set has since grown.

The rule that does not move:

```bash
git status --short        # read it yourself, immediately before you stage anything
```

Stage named paths, never a wildcard. Uncommitted work from another agent is not yours to
commit, revert or judge — leave it in place and work around it.

---

## 3. Branch and commit here

`main` is the trunk and is currently the only branch. For any non-trivial change:

```bash
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
git switch -c feat/<short-slug>          # or fix/, docs/, chore/
# ...work...
git status --short                        # look before you stage
git add path/to/file1 path/to/file2       # named paths only
git commit -m "Tailoring: refuse a rewrite that adds a date range"
```

Rules for this repo:

1. **Stage named paths.** `git add -A` / `git add .` is banned across this estate; here
   it would also sweep up stray screenshots like `.ui-settings.png`. Name the files.
2. **One concern per commit**, with a subject line that says what changed and a body only
   when the *why* is not obvious. The existing commit is a good shape: `Applywright: …`.
3. **Never commit secrets or data.** `.gitignore` already covers `node_modules/`,
   `data/`, `*.db`, `*.db-wal`, `.env`, `.env.local`, `*.log`. Do not force-add around it.
   `data/` holds CV text and application history — personal data.
4. **Leave the gate green** (§4) before you commit. If a change intentionally moves a
   number, update `PROJECT-STATUS.md` §7 in the same commit.
5. **Merge back with `--no-ff`** (`git switch main && git merge --no-ff feat/slug`) so
   the branch survives in history, or fast-forward if the branch is a single tidy commit.
   There is no CI and no PR requirement today; the gate and a read of the diff are the
   review. Push `main` when it is green (§5).

---

## 4. The gate

Run all three from the project root. This is the whole verification regime; there is no
CI, no lint step and no type checker.

```bash
node --test tests/
node --test server/lib server/provider
node scripts/check.js
```

| Command | Proves | Expected (measured 2026-10-28) |
|---|---|---|
| `node --test tests/` | HTTP, storage, auth, isolation, billing, errors | **150 pass, 0 fail** |
| `node --test server/lib server/provider` | Pure-module behaviour, provider routing, fixtures instead of network | **337 pass, 0 fail**, 12 suites |
| `node scripts/check.js` | Page structure, includes/assets resolve, CSP compliance, no remote resources, no placeholder/TODO, no hype vocabulary, no literal credential, no `eval` | `10 pages, 24 server modules, 263 css classes` then `ok — 0 errors, 0 warning(s)`, exit 0 |

Notes:

- `node --test` with no argument discovers both suites; the split above is the gate
  because module failures then surface on their own.
- The HTTP suites bind an ephemeral loopback port, use a temporary SQLite file and a
  blank model key: a run never reaches the internet and never touches `data/`.
- `node scripts/check.js --strict` also fails on warnings.
- Supplementary (needs a running server): `node scripts/seed.mjs` and
  `node scripts/browser-preview.mjs`. Neither is part of the gate.

The exit code is the answer. If a command fails, fix it or report it — do not summarise
around it.

---

## 5. Publishing — the public remote is live

**Current state: `origin` is <https://github.com/johancilliers22/applywright.git>, it is
public, and `main` is pushed.** A second remote, `backup`, points at
`../applywright-remote.git` — a local bare copy — and is one push behind. Credentials are
not stored in this checkout; a push uses the machine's Git credential helper, and an agent
must not hold, paste or echo a token.

### 5.1 What is already done (do not repeat)

The repository exists on GitHub, empty at creation, and received this tree's history with
`git push -u origin main`. Authentication was set up once by Johan (`gh auth login` or a
credential helper). Nothing else is needed before a push.

### 5.2 Pushing now

```bash
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright

git push origin main            # the trunk
git push origin feat/<slug>     # a branch, while it is being reviewed
git push backup main            # the local bare copy, after origin
```

Do not put a token in a remote URL or on a command line; if the push is refused, the fix
is the credential helper, not the URL.

### 5.3 After a push

- Add a `.github/workflows/` job only if you also accept the maintenance: it must run the
  three gate commands on Node 22.5+ (for `node:sqlite`) with no network access, or it will
  fail on the first feed test that expects fixtures. `.github/` holds only
  `ISSUE_TEMPLATE.md` today.
- The repo is public: commits and contents leave this machine. Do not commit a key, a
  `.env.local`, or anything under `data/` — the history is not private.
- There is no deploy pipeline: deployment is `pm2 restart applywright --update-env` on
  this machine, or the runbook in [`DEPLOY.md`](DEPLOY.md) for a host. See
  `PROJECT-STATUS.md` §8 and `DOMAIN.md`.

---

## 6. Shipped-code rules that affect the pipeline

- **No build step.** What is in `public/` is what the browser gets. There is no bundler
  output to rebuild, so a commit is always the runnable artefact — and a broken CSS or JS
  file is live immediately. Run `check.js` and load the page.
- **The bookmarklet is generated.** `public/assets/bookmarklet.src.js` is the readable
  source; `public/assets/bookmarklet.js` is the artifact two pages read. If you edit the
  source, regenerate the artifact in the same commit, or the served bookmarklet is stale.
- **`data/` is never committed** and must not be copied into a commit to "make it work".
  It is created on first boot.
- **Do not commit `.env.local`**, even to a private remote: it may hold a model key or a
  Stripe secret.

---

## 7. The one-minute version for a cold orchestrator

```bash
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright
git status --short                 # see what is dirty before you touch it
git switch -c feat/<slug>
# read docs/PROJECT-STATUS.md, then docs/IMPLEMENTATION-PLAN.md
# work, then:
node --test tests/ && node --test server/lib server/provider && node scripts/check.js
git add <named paths> && git commit -m "<area>: <what changed>"
# merge to main when green, then push origin (and backup) — see §5
```
