# RESEARCH — open-source repos worth borrowing from, and their licences

Scope: what Applywright's redesign should lift from existing open-source work, under what
licence, and what to leave alone. Read against `docs/SPEC.md`, `public/assets/tokens.css`,
`public/assets/site.css` and `public/assets/theme.css`.

Two constraints shape every row. First, the design system is already a system: `theme.css`
re-keys eight Meridian tokens (`--accent`, `--accent-ink`, `--accent-soft`, `--ember`,
`--lime`, `--ok`, `--warn`, `--err`) and nothing else. Anything borrowed has to ride on those
tokens, or it is a parallel system by definition. Second, the marketing pages refuse borrowed
credibility in writing — "There are no customer logos on this page and no user counts"
(`public/index.html`). Borrow mechanics, never social proof.

Licences below were read on 28 October 2026 from each project's `package.json`, `pyproject.toml`
or GitHub licence metadata. Re-read the `LICENSE` at the tag you actually copy from.

## 1. Product references — closest prior art

| Repo | Licence | What to borrow | What not to take |
|---|---|---|---|
| [srbhr/Resume-Matcher](https://github.com/srbhr/Resume-Matcher) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | The shape of the score screen: one number, then keyword coverage as matched/missing lists, then per-finding detail. Its topics list (`ats`, `text-similarity`, `resume-parser`) describes exactly the /app/cv job. | Its vector-similarity scoring path. `score.js` must stay deterministic and model-free (SPEC §5). |
| [reactive-resume/reactive-resume](https://github.com/reactive-resume/reactive-resume) | MIT | Side-by-side editor and print preview; a command bar plus a published [keyboard-shortcut page](https://docs.rxresu.me/guides/keyboard-shortcuts) for the authenticated app. | The template gallery. The pack is single-column and ATS-safe (SPEC §5), so one good template, not twelve. |
| [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) | MIT ([pyproject](https://github.com/speedyapply/JobSpy/blob/main/pyproject.toml)) | One normalised job schema across heterogeneous boards, and per-source error reporting rather than one aggregate failure. Both map onto `jobs` and `fetchJobs({ errors })`. | Its LinkedIn and Indeed coverage. SPEC §1 rules that out for legal and account-safety reasons. |
| [rendercv/rendercv](https://github.com/rendercv/rendercv) | MIT ([pyproject](https://github.com/rendercv/rendercv/blob/main/pyproject.toml)) | A typed content model rendered deterministically, and a separate `scripts/ats_proof` test workspace — the right shape for `packs/build.js` tests. | Typst and PDF rendering. Applywright prints from inline HTML/CSS. |

## 2. System and component sources

| Repo | Licence | What to borrow | What not to take |
|---|---|---|---|
| [argyleink/open-props](https://github.com/argyleink/open-props) | MIT | The custom-media breakpoint layer and the `tokens.json` export format. Applywright currently hardcodes 15 width-based `@media` queries across `tokens.css`, `site.css` and `auth.css`. | Its colour scales. `theme.css` already owns the palette, and duplication would fork it. |
| [alphagov/govuk-frontend](https://github.com/alphagov/govuk-frontend) | MIT | The error summary pattern and field-level error wiring (`aria-describedby`, error text tied to the input) for sign-up, CV paste and alert forms. Correct British register, no framework. | Its type scale, spacing scale and palette. |
| [picocss/pico](https://github.com/picocss/pico) | MIT | Classless defaults for `table`, `fieldset`, `select` and `details`, so `/app` screens stay readable before component CSS exists. | Loading it beside `site.css`; the specificity fights are not worth it. Copy the rules, not the file. |
| [lucide-icons/lucide](https://github.com/lucide-icons/lucide) | ISC | Inline SVG at a 24px grid, one stroke weight, for finding severities and status marks. | Icon fonts or sprites. SPEC §5 requires the pack to survive copy-paste and print with no icon fonts. |

## 3. Verification and ingest tooling

| Repo | Licence | What to borrow | What not to take |
|---|---|---|---|
| [dequelabs/axe-core](https://github.com/dequelabs/axe-core) | MPL-2.0 | Automated contrast, label and landmark checks over every screen, run in the existing test pass. Extends the hand-measured contrast notes already in `site.css` (lines 1385–1422). | Editing its source. MPL-2.0 copyleft is per-file; keep it a dev dependency and its `LICENSE` intact. |
| [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js) | BSD-2-Clause | The `styleMap` idea — Word style names mapped to semantic sections — as a heuristic for `segmentSections`. | The dependency. SPEC §5 allows `node:zlib` and no others. |

## 4. How to borrow without contaminating the build

Permissive licences (MIT, ISC, BSD-2-Clause, Apache-2.0) let you copy CSS and adapt markup,
provided the copyright notice travels with the copied file. Record the source repo, tag and
licence in a comment at the top of the borrowed block, the way `tokens.css` already documents
its own intent. Apache-2.0 adds a patent grant and a `NOTICE` obligation — the safer choice for
anything algorithmic you lift from Resume-Matcher.

MPL-2.0 is different: copying axe-core's code into `public/assets/` would put those files under
MPL. Run it as a tool instead, and Applywright's licence is untouched.

Do not vendor a GPL or AGPL component into the served bundle. Nothing in these tables is
copyleft at that strength today. Pin a tag rather than a branch, so a later change upstream
cannot silently change the terms of what you copied.

Two notes on fit. First, `.code` in `site.css` hardcodes five colours (`#e6e7ea`, `#7f8794`,
`#9fb4ff`, `#b9e79a`, `#ffb59a`) outside the token set; fix that first, or the token seam stops
being a seam. Second, the system's existing habit of
recording measured ratios in comments is its best quality — axe-core in the test run turns that
habit into a gate rather than a courtesy.

## 5. Next actions

1. Add a `--bp-*` custom-media layer to `tokens.css` (Open Props' `media` layer, MIT) and
   replace the 15 hardcoded width queries in `tokens.css`, `site.css` and `auth.css`.
2. Build the `/app/cv` score screen as one number plus matched/missing keyword lists plus
   findings, following Resume-Matcher's layout (Apache-2.0, note it in a header comment).
3. Copy GOV.UK Frontend's error-summary and field-error markup into `site.css` as
   `.form-error` / `.error-summary`, recoloured with `--err` and no new tokens.
4. Add `axe-core` (MPL-2.0, dev dependency only) to the test pass with a failing threshold on
   contrast and label rules, then re-measure the five hardcoded `.code` colours against it.
5. Write `packs/build.js` self-tests the way `rendercv`'s `scripts/ats_proof` workspace is
   shaped: assert no `<table>`, no external URLs, headings as real text, and one column at A4.
