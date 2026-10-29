> NIGHT CLOSEOUT29October: read [TOMORROW](closeout/20261029/TOMORROW.md) and
> actual delivery receipt first. E2E:38mocks+2race+4realWindows controlsPASS,
> isolatedChrome10steps235assertionsPASS; integrated209tests+4native skips,
> 349modules+1environment skip,static58pairsPASS. G1combined100units+211cases
> PASS remains unreviewed/notmerged. Gemini is source-only design proposal;
> no new visual/animation implementation. No new work/automatic WSL tonight.
> Older dated checkpoints below are historical.

> Current operational status29October: [operator continuation](OPERATOR-CONTINUATION-PLAN.md) and [implementation register](IMPLEMENTATION-REGISTER.json) supersede historical intake checkpoints. Every product row below is retained. G1R5 REQUEST_CHANGES and E2ER4 unreviewed/unexecuted remain incomplete; concurrent main source must reconcile before integration. Contrast token checks accepted7d40425; full rendered/native/browser guarantees remain separate.
# Applywright — implementation plan

**22:36 UTC checkpoint:** contrastM1 R4 independently reviewed PASS_SOURCE, exactly integrated and accepted after all3gates: HTTP171PASS, modules346PASS/1SKIP, static58comparisons/0errors0warnings. Plan2.3/7.4 closed for the bounded token contract. G1R3 passes80units/all131independent cases but still needs NEW independent Sol review/integration/gates. E2EDSHR2 remains active after seven R1findings; native qualifier/browser journey unproved. Live site preserved, no deployment. Actual receipt index: [`verification/20261028-intake/CURRENT-CHECKPOINT.md`](verification/20261028-intake/CURRENT-CHECKPOINT.md).

*The durable plan: what is done, what is next, who owns it, and how you will know it
worked. Read [`PROJECT-STATUS.md`](PROJECT-STATUS.md) first, then this, then
[`PIPELINE.md`](PIPELINE.md).*

Last revised: 2026-10-28. Status markers:

**19:37 UTC intake:** current candidate `86b74c3`; HTTP 150/150, modules 346 pass/1 skip/0 fail, static 0 errors/0 warnings. Evidence: `verification/20261028-intake/gates.json`. The grounding/model-path independent review mission is commissioned through native T3 parent `46ac76de-4e76-42b4-a2b1-9f6d4e09c559`; actual dispatch/result receipts are pending. No product item starts before that ledger registration. Then prioritize 2.3/7.4 (contrast assertions), with DSH in an assigned separate worktree and independent review. Historical IN PROGRESS labels below are unclaimed until reconciled against code and evidence; they do not identify live writers. DNS/Stripe/VAT/Scale choices remain Johan's.

**19:47 UTC correctness priority:** both initial reviews are terminal REQUEST_CHANGES; the orchestrator reproduced their P1 grounding bypasses. G1 repair owns only tailor/refine and their tests in a NEW admitted DSH worktree, with independent Sol review before integration. Commission: `t3/APPLYWRIGHT-GROUNDING-G1-COMMISSION.md`; actual IDs/route/worktree go to `t3/receipts/20261028-grounding-g1/`. This corrects 0.3/0.4, whose original DONE markers are historical baseline claims. Contrast M1 is disjoint. Later model-schema/index/route/UI reporting repair follows G1 because it overlaps refine.js. No product acceptance yet.

| Marker | Meaning |
|---|---|
| **DONE** | Shipped in the tree and covered by a passing check. |
| **IN PROGRESS** | Being written right now by a named owner; the tree may be mid-change. |
| **QUEUED** | Agreed, not started. |
| **BLOCKED** | Cannot proceed without Johan (credentials, an account, a decision). |

Acceptance checks are commands, files or observable states — not opinions. If an item's
check cannot be run yet, the item is not done.

**`DONE` means the change is in the working tree and its check passes; it may still be
uncommitted at handoff.** The tree was actively being written while this plan was
compiled, so re-run the gate (§P7) before relying on a marker, and expect the
`git status` in [`PIPELINE.md`](PIPELINE.md) §2 to have moved.

---

## P0 — Shipped product surface

The product works end to end today on the rules path with no external services.

| # | Item | Owner (module/file) | Acceptance check | Why it matters |
|---|---|---|---|---|
| 0.1 | **DONE** — CV library, ingestion from text and `.txt`/`.md`/`.docx`, segmentation into contact/summary/experience/education/skills | `server/lib/cv/extract.js`, `POST /api/cvs` | `node --test server/lib` passes; upload each format through `/app/cv` | Everything downstream depends on a clean, segmented CV. |
| 0.2 | **DONE** — Deterministic 0–100 scoring with five weighted subscores and named, actionable findings | `server/lib/cv/score.js`, `POST /api/analyse` | Score the same CV and job twice; identical number and findings. `node --test server/lib` | A score nobody can explain is worse than no score. |
| 0.3 | **DONE** — Grounded tailoring, rules path and model path, with `assertGrounded` and a final re-check | `server/lib/cv/tailor.js`, `POST /api/tailor` | With no `MODEL_API_KEY` and with one: no bullet in the response introduces a number/employer/title/date the CV does not contain; `warnings` names anything replaced | The product's central promise; a regression here is a fraudulent application. |
| 0.4 | **DONE** — Instruction-driven refinement on a stored pack, grounded by `groundChanges` | `server/lib/cv/refine.js`, `POST /api/applications/:id/refine` | Refine with "shorter summary"; rejected changes appear in `warnings`, not in the pack | Editing must not become a back door around the grounding rule. |
| 0.5 | **DONE** — ATS-safe pack: standalone CV HTML (A4, 18 mm, one column, real headings), plain text, covering letter, four screening answers | `server/lib/packs/build.js`, `GET /api/applications/:id/cv` | Tests assert no `<table>`, no external URL, escaped user text; paste the CV into Word and check the layout holds | This is what the user actually sends; ATS parsing failure silently loses the application. |
| 0.6 | **DONE** — Job feed from three public boards, dedupe, per-source error reporting, cache | `server/lib/jobs/sources.js`, `GET /api/jobs` | One board stubbed to fail: the other two still return jobs and the failed source is named | A dead board must degrade honestly, not break the feed. |
| 0.7 | **DONE** — Pasted-posting capture (JSON-LD first, then Greenhouse/Lever/Workable/Ashby/Workday), blocked hosts refused | `server/lib/jobs/capture.js`, `POST /api/jobs/capture` | LinkedIn/Indeed/Glassdoor URLs return the refusal reason; a Greenhouse or JSON-LD page parses with `confidence` | The compliant alternative to scraping. |
| 0.8 | **DONE** — Saved searches, in-process scan, notifications inbox, RSS feed | `server/lib/jobs/match.js`, `server/alerts-runner.js`, `GET /api/notifications`, `GET /feed/:token.rss` | `POST /api/alerts/run` creates notifications for matching jobs; the feed validates as RSS 2.0 | The search has to keep running between sessions. |
| 0.9 | **DONE** — Plans, prices, four enforced quotas, 402 with upgrade path | `server/lib/billing/plans.js`, `GET /api/billing/plans` | Exceed `packs` on Free: `402 quota_exceeded` with `error.upgrade` and the `upgrade` header | Displayed numbers must come from the code that enforces them. |
| 0.10 | **DONE** — Accounts, sessions, scrypt passwords, export, hard delete, same-origin mutation check, CSP and response headers | `server/auth.js`, `server/app.js`, `/api/export`, `/api/account` | `node --test tests/` passes; register → export → delete → sign-in fails | This app holds CV text: export and delete are product features, not extras. |
| 0.11 | **DONE** — Marketing pages, auth pages (including `/reset`), the `/app` SPA, `/bookmarklet` page | `public/*.html`, `public/app/`, `server/pages.js` | `node scripts/check.js` → 0 errors (10 pages) | The product has to be explainable before it is usable. |
| 0.12 | **DONE** — Verification regime in place and green | `tests/`, `server/lib/**/*.test.mjs`, `scripts/check.js` | 113 / 309 / 0 errors (see §P7) | Every claim below is checked against these. |
| 0.13 | **DONE** — CV editor: `/editor?cv=<id>`, section editing, grounded AI proposals, `.md` / print-PDF / `.docx` exports | `public/editor.html`, `public/assets/editor.css`, `public/assets/editor.js`, `tests/editor.test.js`; `GET /editor` and `POST /api/cvs/:id/assist` in `server/app.js` | `node --test tests/editor.test.js` passes; load → edit → save (PATCH re-segments) → assist returns proposals only → a fabricated number appears in `rejected`, never applied → the three exports produce files | A CV as editable text is the surface the grounding promise is checked against. |

---

## P1 — CV ingestion backlog

**Owner: `extract-aw`. Contract: `docs/SPEC.md` §5 `cv/extract.js`.** This phase landed
in the working tree during the handoff (uncommitted at the time of writing): `detectFormat`
now returns `'txt' | 'md' | 'docx' | 'odt' | 'rtf' | 'html' | 'pdf' | 'image' | 'doc'`,
and `node --test server/lib/cv/extract.test.mjs` passes **35 tests with 0 skipped**, which
means the capability-dependent PDF/OCR cases were exercised on this host, not skipped.

| # | Item | Owner (module/file) | Acceptance check | Why it matters |
|---|---|---|---|---|
| 1.1 | **DONE** — PDF via a local `pdftotext`, native `PATH` first and `wsl -e` second | `server/lib/cv/extract.js` (`runExtractorChain`, `wslHasTool`, cached probe) | A real PDF returns text. On this PC Poppler 26.09 is on the Windows user `PATH` (`%LOCALAPPDATA%\poppler\poppler-26.09.0\Library\bin`), so the native route runs; a shell that predates that `PATH` change still falls back to `/usr/bin/pdftotext` through WSL | PDF is the format most people actually have. |
| 1.2 | **DONE** — ODT support | `server/lib/cv/extract.js` (zip central directory + `content.xml`, no dependency) | `detectFormat("cv.odt")` → `'odt'`; a real ODT package parses to paragraphs; fixture test passes | LibreOffice and government portals emit ODT. |
| 1.3 | **DONE** — RTF support | `server/lib/cv/extract.js` (control words stripped in-process, `cp1252` handled, fields kept) | Fixture RTF parses; hyperlink field text survives; test passes | Older CVs and some recruitment portals still use RTF. |
| 1.4 | **DONE** — HTML support | `server/lib/cv/extract.js` (`htmlToText`: block ends and `<br>` to breaks, cells separated, script/style/title dropped, entities decoded) | A "save as web page" export parses; no markup appears as prose; test passes | People export profiles and portfolios as HTML. |
| 1.5 | **DONE** — OCR through Tesseract, with an honest absence path | `server/lib/cv/extract.js` (image formats, `ocrAdvice()`, Tesseract probe native then WSL) | Image uploads are read through `wsl -e tesseract` here (Tesseract 5.3.4 is in WSL, not on the Windows `PATH`); with no Tesseract at all they are refused with the exact install command, and a scanned PDF advises uploading page images | Detection without a false success is the honest minimum; Tesseract stays optional. |
| 1.6 | **DONE** — DOCX with no dependency | `server/lib/cv/extract.js` (`node:zlib`, central directory parsed by hand) | Fixture `.docx` parses; no new `package.json` entry | Proves DOCX support does not need a zip library. |
| 1.7 | **DONE** — Legacy binary `.doc` refused precisely | `server/lib/cv/extract.js` | Uploading a `.doc` names `.docx` as the fix instead of returning mojibake | A wrong-looking result is worse than a clear refusal. |

**Remaining risk in this phase:** the WSL fallback costs a process round trip per upload
and depends on `wsl` being on `PATH`; the capability probe is cached per process, so
installing a tool mid-run needs a restart to be picked up. Poppler is now installed for
Windows, so the PDF caveats only affect a shell with a stale `PATH`; Tesseract is still
reached through WSL.

**Rule for all of P1:** never throw on malformed input — return
`{ text, format, warnings }`. A failed extraction must be explainable in the UI.

---

## P2 — Accessibility

**Owner: `a11y-aw`. Contract: `docs/SPEC.md` §9 (labels, focus, keyboard, 4.5:1
contrast, no colour-only status, responsive 375/768/1440).** The measured colour pairs
and the three failing ones are already written down in
[`design/DESIGN-INPUTS.md`](design/DESIGN-INPUTS.md) §2. The shipped audit is
[`design/ACCESSIBILITY-AUDIT.md`](design/ACCESSIBILITY-AUDIT.md) (28 October 2026): the
axe matrix over the marketing pages went **44 → 16 violation nodes**, all 16 the
best-practice `heading-order` rule and **since fixed by the footer `<h3>` change**, with
**0 WCAG-tagged failures**. It covers the marketing pages, not `/app` or `/editor`, and
it is a document, not a gate.

| # | Item | Owner (module/file) | Acceptance check | Why it matters |
|---|---|---|---|---|
| 2.1 | **IN PROGRESS** — Keyboard paths and visible focus on every interactive surface | `public/assets/site.css`, `motion.css`, `public/app/app.css` | Tab through `/`, `/pricing`, `/sign-up`, `/app` and every action is reachable with a visible focus ring; the menu, dialogs and the SPA routes are operable without a mouse | The audience is applying for jobs, often on a laptop with a trackpad and a deadline. |
| 2.2 | **IN PROGRESS** — Contrast: fix the measured failing pairs | `public/assets/theme.css`, `site.css` | `--line-strong` on an input boundary moves to `--line-meaning` (3:1 floor); `.btn--primary` foreground uses `--on-accent`; `--mark` replaces `--ink` in ink-on-paper parts; ratios in `DESIGN-INPUTS.md` §2 recomputed and passing | 1.65:1 on a field boundary is not a decorative issue; it is an unusable form. |
| 2.3 | **DONE** — Executable contrast gate, independent Sol R4 PASS_SOURCE and operator integration | `scripts/check.js`, `scripts/contrast.js`, `tests/check-contrast.test.js` | 29pairs/scheme;21focused testsPASS; integratedHTTP171/modules346+1skip/static58PASS. `verification/20261028-intake/CONTRAST-ACCEPTANCE.md` | Bounded token contract; rendered/axe coverage remains separate. |
| 2.4 | **QUEUED** — axe-core as a dev dependency, run over all ten pages | `package.json`, a new audit script | `npx` run over the ten pages reports zero serious or critical violations; the dependency never ships in `public/` | Catches the machine-checkable 60% so review can spend attention on the rest. |
| 2.5 | **IN PROGRESS** — Status never carried by colour alone | `public/app/app.js`, `app.css` | Status chips carry a word or mark; a colour-blind or monochrome check still distinguishes them | Status is the core of the tracking surface. |
| 2.6 | **QUEUED** — State changes announced | `public/app/app.js` | Score replacement, capture success and errors land in a live region; the evidence trace renders complete when motion is reduced | Silent state change is a WCAG failure and a usability failure. |

**Note:** 2.3 uses existing Node built-ins and needs no dependency/package edit. 2.4 is a separate axe-core proposal; keep it out of the served bundle.

---

## P3 — Design system

**Owner: `design-lead`. Shipped base: `public/assets/tokens.css` (Meridian tokens and
reset), `theme.css` (the product re-key and the dark scheme), `motion.css`, `site.css`,
and `theme.js`.** The chosen aesthetic direction, the measured pairs and the eight
ordered changes are in [`design/DESIGN-INPUTS.md`](design/DESIGN-INPUTS.md).

| # | Item | Owner (module/file) | Acceptance check | Why it matters |
|---|---|---|---|---|
| 3.1 | **DONE** — Meridian tokens, light and dark, with `html[data-theme]` and a no-flash head script | `tokens.css`, `theme.css`, `theme.js`, every page head | Toggle the theme on all ten pages; no flash, `theme-color` meta follows the scheme, preference persists | The product is read for long stretches; a second palette cannot be an afterthought. |
| 3.2 | **DONE** — Product re-key: interactive green split from semantic status | `theme.css` `:root` | `--accent` (`#0f5c43`) and `--ok` (`#1d7d46`) are different values and both pass on `--paper`; a link and a "verified" tick are distinguishable | At the previous shared value a link and a status tick were the same colour. |
| 3.3 | **QUEUED** — *Pressproof* folio component (`.aw-folio`) | `public/app/app.css`, `app.js`; spec in `design/DIRECTION-gemini.md` §3 | `.aw-folio` exists in CSS (it does not today): paper surface, 2 px corners, hairline, stacked-sheet offset shadow, mono registration stamp; used for CV and pack artefacts | Makes the site look like the thing it produces, and marks which surfaces are user artefacts rather than chrome. |
| 3.4 | **QUEUED** — Ruled margin-gutter redlines with `[CV §n]` citations | `app.css`, `app.js` | A tailored bullet shows source → rewrite with the surviving fact cited; the trace renders complete with reduced motion | The grounding promise is currently a claim in copy; this is how it becomes visible. |
| 3.5 | **DONE — previously shipped, source reverified** — Vernier gauge instead of the donut ring; no duplicate implementation | `public/app/app.css:682`, `public/app/app.js:937`; shipped `0f9175a14073b7c554b7e50595eb40ed059d31b8` | Existing source renders `.aw-gauge`, threshold70, `n / 100` and accessible score/threshold text; historical f50ef22 E2E already measures the gauge. Source reverified28Oct21:40; current browser rerun remains separate/PENDING | A precision instrument matches the product; a donut is generic SaaS. |
| 3.6 | **DONE** — Hero recomposition: the chatbot mock is replaced by an advert→CV proof sheet | `public/index.html`, `site.css`, `theme.css` | `.mock`, `.mock__msg`, `.mock__bubble` and `.hero__grad` are gone from `public/index.html`; the hero is a proof sheet pairing advert lines with cited CV §2 facts, over the 75/100 rubric gauge (commit `342d621`) | A product with no chat was illustrated with a chat mock. |
| 3.7 | **DONE** — Motion cut to the permitted rows | `motion.css`, `public/assets/site.js` | `site.js` records the scroll reveal, its observer and `reveal-on`/`is-visible` retired; the ring draw, card lift and infinite `.pill--live` pulse are gone; the dead `.reveal` block still in `tokens.css` is cleanup, not live motion | The pulse ran with no pause control; the rest delayed the reading it decorated. |
| 3.8 | **DONE** — The design canon exists, so the `SPEC-V2.md` citations resolve | `docs/design/SPEC-V2.md`, cited from `tokens.css`, `theme.css` | The file is present (29 KB, "shipped, 28 October 2026") and the six CSS citations resolve; it supersedes `DESIGN-INPUTS.md` where they disagree, with `docs/SPEC.md` still winning on product truth | Six citations previously pointed at a file that did not exist. |
| 3.9 | **DONE** — Design docs that exist and are the reference | `docs/design/` | `SPEC-V2.md`, `DESIGN-INPUTS.md`, `DIRECTION-codex.md`, `DIRECTION-gemini.md`, `DIRECTION-grok.md`, four `RESEARCH-*.md` all present | A cold agent must not be told a doc is missing when it is there. |

**Discipline:** new classes ship with their rule in the stylesheet, or `check.js` reports
them as undefined. No hosted fonts; the pack's own rule is system fonts.

---

## P4 — Connectors

**Owner: `bookmarklet-aw` (capture), `server/lib/connectors/`. Contract: `SPEC.md` §1
and `docs/LINKEDIN-CAPTURE.md`.** Every connector is user-initiated: paste text you
already hold. There is no OAuth, no fetch and no background crawl.

| # | Item | Owner (module/file) | Acceptance check | Why it matters |
|---|---|---|---|---|
| 4.1 | **DONE** — LinkedIn profile text parser (clipboard copy or your own PDF export) | `server/lib/connectors/linkedin.js`, `POST /api/connectors/linkedin` | Paste a profile: sections parse; a missing section warns instead of saving a thin profile | The compliant path to reusing a profile you already own. |
| 4.2 | **DONE** — Browser-capture bookmarklet, **one artifact, two entry points** | `public/assets/bookmarklet.js` (generated from `bookmarklet.src.js`), `GET /bookmarklet`, `/app` → Settings | `/bookmarklet` answers 200 with `__ORIGIN__` substituted and no placeholder left; the Settings block substitutes `location.origin` in the browser; both yield a working `javascript:` bookmark; zero network calls from the artifact | One deliverable, so the two surfaces cannot drift. Settings is the **primary** path; `/bookmarklet` is the **shareable** one for someone not signed in. |
| 4.3 | **QUEUED** — Consume the bookmarklet's extra metadata in the SPA | `public/app/app.js` (posting-capture handoff) | The bookmarklet's `title`, `company` and `blocked` fields reach the capture form instead of being dropped; a blocked source shows why the URL is blank | Today the SPA reads only `sourceUrl` and `text`, so parsed metadata is thrown away. |
| 4.4 | **QUEUED** — Browser extension | not started; `docs/LINKEDIN-CAPTURE.md` | A decision first: an extension that only reads the page the user is on and posts text to the app is the same behaviour with a different install path. Scope it against LinkedIn's prohibition on extensions that "scrape, modify the appearance of, or automate activity" | A candidate, not a commitment. It must not become a second capture implementation. |
| 4.5 | **REJECTED** — Cookie / session-token import | — | — | Reusing the user's LinkedIn session to read data would be automated access by another name: it breaches the same terms, cannot be revoked by the user, and turns the product into the scraper it refuses to be. Do not build it, and do not describe it as "import". |
| 4.6 | **DONE** — Blocked-host refusal with the reason in the response | `server/lib/jobs/capture.js` | Capturing a LinkedIn/Indeed/Glassdoor URL returns the refusal code and message | Refusing without an explanation looks like a bug. |

---

## P5 — Billing gaps

**Owner: Lead (`server/app.js` billing block), `server/lib/billing/plans.js`,
`public/app/app.js` billing view.** The rules are in `SPEC.md` §2; the honest limits are
in `billing/NOTES-plans.md`.

| # | Item | Owner (module/file) | Acceptance check | Why it matters |
|---|---|---|---|---|
| 5.1 | **DONE** — `fullAtsReport` and `packHistory` enforced; the capability list cut to what a handler gates | `plans.js` (`ENFORCED_FLAGS`, and `FLAG_FEATURES` equal to it), `/api/analyse` and `GET /api/applications/:id` handlers, `app.js` billing copy, `public/index.html` | Free gets the top three findings and only its most recent covering letter, with the lock reason in the response; `FLAG_FEATURES` equals `ENFORCED_FLAGS` and a test pins that equality; no plan sells a capability that no handler gates; Scale is a quota tier (unlimited CVs and packs, 50 saved alerts), not a feature tier; `node --test tests/flags-webhook.test.js server/lib/billing/plans.test.mjs` passes | Features were sold on the pricing page with nothing enforcing them. |
| 5.2 | **DONE** — `coverLetter` is enforced | `server/app.js` `/api/tailor` and the refine rebuild | On a fresh Free account the stored pack has empty `coverLetterMd` and the lock message; Pro gets the letter | This was the one flag with a bypass; the refine path re-gates the rebuilt pack before it is stored. |
| 5.3 | **QUEUED** — VAT | `plans.js` (prices), checkout creation, pricing copy | Decide the rate and whether prices are VAT-inclusive at display; a single function returns the VAT line; the pricing page and the API agree | Prices now say they are in GBP and include any applicable tax, but no VAT line, rate, calculation or invoice exists. Selling to consumers in the UK makes this a legal question, not a cosmetic one. |
| 5.4 | **DONE** — Stripe webhook idempotency | `server/app.js` `/api/billing/webhook`, `server/db.js` (`stripe_events`, schema v3), `server/store.js` | A redelivered event answers `{received: true, duplicate: true}` and changes nothing; an older `current_period_end` is ignored; a bad signature writes nothing, not even an event row | Stripe retries, so replay safety is correctness, not polish. |
| 5.5 | **QUEUED** — Live Stripe verification | env only | Checkout, the portal and the webhook signature all pass against a real test-mode account; the price IDs are set | Nothing here has touched live or test-mode Stripe. |
| 5.6 | **DONE** — Password recovery without a mail server | `server/app.js` (`/api/auth/recover`, `/forgot`, `/forgot-username`, `/reset`, `/change-password`), `public/reset.html`, `store.js`, `tests/auth-recovery.test.js` | An offline recovery code saved at sign-up signs in once; a reset link is single-use and expiring; a used or expired token is refused with a distinct message; `node --test tests/` covers it | Recovery that needs a mail server would be no recovery at all on this host. |
| 5.7 | **DONE** — Operator recovery fallback | `scripts/reset-password.mjs` (list / generate / set; prints only the email and the new password, never a hash or token) | `node scripts/reset-password.mjs --list` lists accounts; `--email … --generate` resets one; that account can sign in with the new password | Last resort when the user still has a recovery code and cannot use it. |
| 5.8 | **QUEUED** — Email delivery for the reset link | a mail path; `server/app.js` | A `POST /api/auth/forgot` request reaches the user without an operator passing the link on | Today the link is recorded on the host and handed over by the operator. Which delivery (transactional mail service, magic link) is an open question, not a missing mechanism. |
| 5.9 | **DONE** — Honest degraded path | `plans.js` `stripeConfigured()`, checkout/portal/webhook | Unconfigured: plans visible, checkout/portal/webhook answer 501 | A half-wired integration would be worse than a clean refusal. |

---

## P6 — Deployment and sharing

**Owner: `share-aw` (scripts, live exposure), `domain-aw` (brand and domain).
Runbooks: `docs/SHARE.md`, `docs/DOMAIN.md`, `docs/DEPLOY.md`.**

| # | Item | Owner (module/file) | Acceptance check | Why it matters |
|---|---|---|---|---|
| 6.1 | **DONE** — Tailscale Serve sharing | `scripts/share.ps1 -Mode tailscale`, `scripts/share-stop.ps1` | `-WhatIf` runs end to end and changes nothing; a real serve maps 8447 → `127.0.0.1:3160`; stop removes only that mapping | Private, HTTPS, survives reboot, no router ports. The fastest way to show one trusted person. |
| 6.2 | **DONE** — Cloudflare quick tunnel | `scripts/share.ps1 -Mode cloudflare` | Prints a `*.trycloudflare.com` URL; refuses to start a second tunnel when one it did not start is already on 3160; state under `%LOCALAPPDATA%\Applywright\share\` | The only option for someone who cannot install Tailscale. It is public, so the demo pairs it with `REGISTRATION_OPEN` control. |
| 6.3 | **DONE** — Security posture documented with the exposure path | `docs/SHARE.md` §6 | `TRUST_PROXY`, `SECURE_COOKIES`, `PUBLIC_URL` explained; registration switch documented | Exposure without the proxy flags produces wrong client IPs and cookie-less sessions. |
| 6.4 | **DONE** — `REGISTRATION_OPEN` exists | `server/config.js`, `server/app.js` | `REGISTRATION_OPEN=0` makes register answer 403 `registration_closed`; sign-in still works | Public sign-up was previously uncloseable without a code change. |
| 6.5 | **BLOCKED** — Named Cloudflare tunnel + `intelligentartificial.net` | operator, with `docs/DOMAIN.md` | `https://apply.intelligentartificial.net/api/health` answers 200 through the tunnel; the RSS self-link shows the public origin; the certificate is Cloudflare's and the zone is on Cloudflare nameservers | **Blocked on Johan:** registrar access (GoDaddy), Cloudflare account, tunnel creation and the ACME/Universal-SSL decision are account actions no agent can hold. |
| 6.6 | **BLOCKED** — Pointer the domain | operator | Apex `intelligentartificial.net` serves the app (or 301s to it) | Same blocker as 6.5. `docs/DOMAIN.md` §0 is explicit that nothing has been executed. |
| 6.7 | **QUEUED** — Process supervision for the PC | `docs/DEPLOY.md` §6, `docs/DOMAIN.md` §5.2 | `pm2 start server/index.js --name applywright`, `pm2 startup`, one instance only | A reboot currently leaves the app down. One instance, never cluster mode. |
| 6.8 | **QUEUED** — Backups | `docs/DEPLOY.md` §9 | A scheduled online `.backup` plus a periodic `data/` archive; a restore has been rehearsed | WAL means a bare file copy drops recent writes; a restore that applies a stale WAL loses data. |

---

## P7 — Test and verification regime

**Owner: `test-author` (suites), Lead (gate).** The rule: every claim in this file names
a command that re-runs green.

| # | Item | Owner (module/file) | Acceptance check | Why it matters |
|---|---|---|---|---|
| 7.1 | **DONE** — HTTP and storage suites | `tests/*.test.js` | `node --test tests/` → **150 pass, 0 fail, 0 skip** (measured 28 Oct 19:37 UTC) | Covers auth, password recovery, CVs, analyse/tailor, jobs, alerts, notifications, billing, account, errors and isolation. |
| 7.2 | **DONE** — Module unit suites | `server/lib/**/*.test.mjs`, `server/provider/*.test.mjs` | `node --test server/lib server/provider` → **347 tests, 346 pass, 0 fail, 1 skip**, 12 suites (28 Oct 19:37 UTC) | Pure functions, fixtures instead of network, no database. |
| 7.3 | **DONE — baseline measured** — Static check; new contrast candidate acceptance pending | `scripts/check.js` | Fresh baseline28Oct19:37: `10 pages, 24 server modules, 263 css classes` / `ok — 0 errors, 0 warning(s)`, exit0. Candidate contrast integration still requires independent review and fresh execution | Catches the CSP, include, asset, honesty and secret mistakes tests cannot see. |
| 7.4 | **DONE with2.3** — Contrast assertions in the real checker | Exact reviewed DSH R4 three-file source | Independent SolPASS_SOURCE; all3integrated gatesPASS22:36, source unchanged. Acceptance receipt linked above. | Token mutations cause nonzero errors; no rendered accessibility claim. |
| 7.5 | **QUEUED** — axe-core audit in the regime | `package.json`, new script | Zero serious/critical violations over the ten pages | Accessibility becomes a gate, not a review note. |
| 7.6 | **QUEUED** — Seeded demo + browser preview used routinely | `scripts/seed.mjs`, `scripts/browser-preview.mjs` | `node scripts/seed.mjs` then `node scripts/browser-preview.mjs` writes `screenshots/` and reports no console errors or horizontal overflow | The only end-to-end look at the real UI. Needs a running server, the demo account and Chrome/Edge — so it is supplementary, never the gate. |
| 7.7 | **Ongoing** — Keep the counts honest | whoever changes the tree | Re-run all three gate commands and update `PROJECT-STATUS.md` §7 if a number moved | Stale numbers are worse than no numbers. |
| 7.8 | **QUEUED** — Regression-test the static check's bookmarklet guard | `scripts/check.js` (the guard, written), `tests/` (the missing regression case) | A `tests/` case copies the project to a temp root, mutates **only** `public/assets/bookmarklet.js` — banner-first, doubled scheme, two lines, `fetch(` — runs the copy's own `check.js` as a subprocess, and asserts a non-zero exit plus the specific expected message per case | `check.js` now asserts the artifact parses as a `javascript:` URL, carries exactly one scheme and exactly one `__ORIGIN__`, is a single line, and makes no network calls. That guard is verified **only by hand** today (three independent mutation probes, all of which correctly failed); a hand check does not survive the next edit to either file. |

Two footnotes for 7.8, recorded because they cost time:

- **Copy the whole project, not just the guarded parts.** The temp root needs `server/`,
  `public/`, `scripts/` and `package.json`. Copying only `scripts/` and `public/` makes
  `checkServer()` throw before the summary prints, so no `FAIL` line appears and a broken
  artifact looks clean — a false green that produced one wrong conclusion already.
- **Owner:** whoever owns `tests/` (currently no active owner). Not blocking anything.

---

## Sequenced next steps (what a cold orchestrator should do tomorrow)

1. **P1 is done** — PDF takes the native `pdftotext` route on this PC and OCR reads through
   WSL. Re-run the gate and update the counts before starting anything new.
2. **Finish P2** — add the contrast assertions and axe-core (2.3, 2.4) so accessibility
   stops depending on memory, then work the keyboard and focus pass against that gate.
3. **P3.3 folio** next: the hero proved the proof-sheet idea (P3.6 and P3.7 are done),
   but the product's CV and pack artefacts still render without the `.aw-folio` component.
4. **P5.1 and P5.4 are done** (`7b88acc`). The next correctness item in P5 is P5.3 (VAT),
   which is a decision for Johan, not an engineering task.
5. **P6.5** stays blocked until Johan does the registrar and Cloudflare steps; do not
   start work that assumes a hostname exists.
6. **P4.3** is a small SPA change that stops the bookmarklet's parsed metadata being
   discarded.
