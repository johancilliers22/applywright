# Contributing to Applywright

Applywright is Johan's project. Forks are welcome and encouraged — take it, run it, change
it, learn from it. Whether a change lands in the upstream repository is Johan's call, so
open a pull request rather than assuming a merge; a fork that stays a fork is a perfectly
good outcome.

This file covers how the code is actually written and how to get a change into a state
worth reviewing. It is short on ceremony on purpose. There is no CI, no lint step and no
type checker: the gate and a read of the diff are the review.

## Read first

- `docs/PROJECT-STATUS.md` — the cold-start brief: what exists, what is measured, what is
  broken.
- `README.md` — how to run it, every configuration variable, the limitations.
- `docs/SPEC.md` — the product contract: data model, module signatures, the three refusals.
  If a module and SPEC disagree, SPEC wins or the disagreement is a bug to report.
- `docs/design/SPEC-V2.md` — the design system, where the older design notes disagree with
  it.
- `docs/PIPELINE.md` — branch, commit and publish discipline.

## Conventions this codebase actually uses

- **ES modules throughout.** `package.json` sets `"type": "module"`, so every `.js` file is
  ESM. Entry scripts are `.mjs` or carry a shebang; module suites are `*.test.mjs` beside the
  code, and the HTTP suites are `tests/*.test.js`. No CommonJS, no transpiler.
- **One runtime dependency: Express.** No dev dependencies, no bundler, no client framework,
  no CSS framework. What is in `public/` is what the browser gets, so a commit is always the
  runnable artefact. Adding a dependency is a decision to discuss, not a detail.
- **Hand-written CSS on tokens.** `public/assets/tokens.css` defines the palette, the type
  scale and the primitives; `theme.css` re-keys them for the product and the dark scheme;
  `site.css`, `motion.css`, `auth.css` and `public/app/app.css` build on top. Use the tokens
  rather than literal colours.
- **`node:test` and `node:assert`.** Module tests live beside the code as
  `server/**/*.test.mjs`; HTTP and storage suites live in `tests/*.test.js` and start the
  server on an ephemeral port with a temporary SQLite file and a blank model key, so a run
  never reaches the internet and never touches `data/`.
- **Module headers explain the why.** Most files open with a short JSDoc block that states
  the contract and the trade-off. Follow that; a comment that restates the code is noise, a
  comment that records a decision is the point.
- **Errors are `{ error: { code, message } }`,** thrown as the shapes `server/util.js`
  provides. Status codes carry meaning here (402 `quota_exceeded`, 403
  `registration_closed`, 501 `not_configured`), so match an existing one before inventing a
  new code.
- **Migrations are forward-only.** `server/db.js` runs `migrate()` on every boot with
  `CREATE TABLE IF NOT EXISTS`; a release adds, it never rewrites. There is no down
  migration, so a schema change and the code that reads it go in the same commit.
- **Deterministic modules stay deterministic.** Scoring, keyword extraction and grouping are
  pure and offline. If a change would put a network call or a clock in one of those paths,
  that is a design conversation.

## The static check is a coding rulebook, not just a smoke test

`node scripts/check.js` walks every page under `public/` and asserts things the test suite
cannot see. It will fail your change if you:

- add a second `<h1>` to a page, or drop the `lang` attribute or viewport meta;
- reference an include or an asset that does not resolve, or load a remote resource from an
  `img`, `script`, `link`, media or frame tag;
- add inline JavaScript or an inline event handler — the CSP (`default-src 'self'`) forbids
  both, so wire behaviour through a file in `public/assets/`;
- leave a placeholder link (`href="#"`), a `TODO`/`FIXME` marker, or an obvious literal
  credential;
- use `eval`;
- write marketing copy containing hype vocabulary. The list is deliberate and enforced:
  "revolutionary", "game-changing", "unleash", "supercharge", "seamless", "cutting-edge",
  "world-class", "best-in-class", "empower", "leverage", "synergy", "next-generation",
  "state-of-the-art", "effortless", "magic". Plain claims survive this check; adjectives do
  not.

`--strict` also fails on warnings. Most contributors run the plain form; both are acceptable
before a commit as long as it exits 0.

## Branching

`main` is the trunk. For anything non-trivial, work on a branch named for the topic:

```bash
git switch -c feat/pdf-scan-warning
```

Use `feat/<topic>` for a feature and `wt/<topic>` when the branch is a throwaway worktree
you do not intend to keep in your history. Area prefixes are also fine where they read
better — `fix/`, `docs/`, `chore/`. Keep the slug short and lower-case.

Merge back with `--no-ff` (`git switch main && git merge --no-ff feat/pdf-scan-warning`) so
the branch survives in history, or fast-forward if it is a single tidy commit.

## The gate

Run all three from the repository root, and treat the exit code as the answer rather than
the count:

```bash
node --test tests/
node --test server/lib server/provider
node scripts/check.js
```

The two suites are run separately so a module failure surfaces on its own; `node --test`
with no argument discovers both, which is what `npm test` runs. `npm run check` is the static
check alone.

The numbers move between commits, and the tree is written by several people, so do not
treat a count in a document as a promise — run the command. If a change intentionally moves
a number the docs quote, update `docs/PROJECT-STATUS.md` §7 in the same commit.

Supplementary, not part of the gate, both needing a running server: `node scripts/seed.mjs`
(a demo account, a CV, a report, three packs and a saved search) and
`node scripts/browser-preview.mjs` (headless Chrome or Edge over the DevTools protocol,
writing PNGs into `screenshots/`).

## Commits

- **Stage named paths.** `git add path/to/file1 path/to/file2`. `git add -A` and
  `git add .` are banned here: they sweep up stray screenshots and, in a tree that holds a
  gitignored `data/`, encourage exactly the accident you do not want.
- **One concern per commit.** A subject line that says what changed, a body only when the
  why is not obvious.
- **Subject style:** `<area>: <what changed>`, sentence case, no shouting. The existing
  history is the reference:

  ```text
  Applywright: CV scoring, grounded tailoring, job tracking and alerts
  Design system, password recovery, wider CV ingestion and orchestrator docs
  Recovery UI, accessibility and theme refinements
  CV upload picker accepts images now that OCR is wired to WSL Tesseract
  ```

- **Never commit secrets or data.** `.env`, `.env.local`, `data/`, `*.db`, `*.db-wal` and
  `*.log` are gitignored. Do not force-add around it, and do not commit a key to make a test
  pass.
- **Leave the gate green.** If a change intentionally lands with a failing check, say so in
  the pull request rather than leaving it to be discovered.

## What a good pull request here looks like

- **Small and single-purpose**, with the *why* in the description and the gate output pasted
  in, not summarised. Two paragraphs and three command outputs beat a long narrative.
- **A test for behaviour that can regress.** A grounding refusal, a quota boundary, a status
  transition, an error code — those earn a test. A colour change does not.
- **A screenshot or a short description of what to look at** for any change to a page or the
  product shell, since there is no visual regression suite.
- **No data, no env files, no generated screenshots** unless the screenshot is the point.
- **Docs updated in the same change** when behaviour, configuration or a measured number
  moves. `README.md` §Configuration, `docs/PROJECT-STATUS.md` §7 and §9 and
  `docs/PIPELINE.md` are the ones that tend to go stale.
- **A note when you deliberately break a convention** — a new dependency, a network call in
  a pure module, a plan flag that is now enforced. Say so; it is a decision, not a detail.

Open issues with `.github/ISSUE_TEMPLATE.md`. For a bug, the most useful issue names the
route or module, the command or click path, what you expected, what happened, and the output
of the gate if it is relevant. Never paste a key, a real CV or anything from `data/` into an
issue.

## Licence

There is no `LICENSE` file in the repository yet, so the default rules apply: no permission
is granted to copy, modify or redistribute beyond what GitHub's terms allow for a public
repository (viewing and forking on GitHub). Treat redistribution and public deployment as
questions for Johan. Ask before you publish a modified copy, and ask before you point a
public domain at your deployment.
