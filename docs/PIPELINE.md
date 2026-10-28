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
| Branch | `master` |
| Initial (and only) commit | `bc6731dfe734a5167a9579b8e4de98e5ef830629` — *"Applywright: CV scoring, grounded tailoring, job tracking and alerts"* |
| Commit author | Johan Cilliers `<johannes.cilliers1@gmail.com>`, Wed 28 Oct 2026 05:52:21 +0000 |
| Tracked files | **126** (`node_modules/` is ignored, not tracked) |
| Remotes | **none** (`git remote` is empty) |
| Pushed anywhere | **no** — nothing has left this machine |

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

`master` is the trunk and is currently the only branch. For any non-trivial change:

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
5. **Merge back with `--no-ff`** (`git switch master && git merge --no-ff feat/slug`) so
   the branch survives in history, or fast-forward if the branch is a single tidy commit.
   There is no CI and no PR requirement today; the gate and a read of the diff are the
   review.

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
| `node --test tests/` | HTTP, storage, auth, isolation, billing, errors | **80 pass, 0 fail** |
| `node --test server/lib server/provider` | Pure-module behaviour, provider routing, fixtures instead of network | **303 pass, 0 fail**, 12 suites |
| `node scripts/check.js` | Page structure, includes/assets resolve, CSP compliance, no remote resources, no placeholder/TODO, no hype vocabulary, no literal credential, no `eval` | `9 pages, 24 server modules, 175 css classes` then `ok — 0 errors, 0 warning(s)`, exit 0 |

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

## 5. Publishing — nothing has been pushed, and there is no remote

**Current state: no remote, no push, no GitHub repository linked from this checkout.**
The push below needs credentials only Johan can supply; an agent must not hold, paste or
echo a token.

### 5.1 What Johan does (account steps)

1. Create an empty repository on GitHub (no README, no licence — this tree already has a
   first commit). Suggested name: `applywright`.
2. Authenticate the machine once, either:
   - `gh auth login` (interactive; choose HTTPS and the browser or device flow), or
   - create a personal access token and let git's credential helper store it — **never by
     putting it in a remote URL or on a command line**, where it lands in shell history
     and process listings.

### 5.2 What then runs (safe to script once auth exists)

```bash
cd C:\Users\johan\Desktop\Coding\OpenClaw\agent-system\projects\applywright

git remote add origin https://github.com/<owner>/applywright.git
git push -u origin master
```

For further branches: `git push -u origin feat/<slug>`.

If `gh` is authenticated, the first two steps collapse to:

```bash
gh repo create applywright --private --source . --remote origin --push
```

Do not paste a token into either command. If the push is refused, the fix is the
credential helper, not the URL.

### 5.3 After the first push

- Add a `.github/workflows/` job only if you also accept the maintenance: it must run the
  three gate commands on Node 22.5+ (for `node:sqlite`) with no network access, or it will
  fail on the first feed test that expects fixtures.
- The repo will still be the origin of truth on this PC. There is no deploy pipeline:
  deployment is `pm2 restart applywright --update-env` on this machine, or the runbook in
  [`DEPLOY.md`](DEPLOY.md) for a host. See `PROJECT-STATUS.md` §8 and `DOMAIN.md`.

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
# merge to master when green; push only once a remote exists and Johan has supplied auth
```
