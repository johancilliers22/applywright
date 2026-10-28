# End-to-end verification — Applywright

**Date:** 2026-10-28 (Europe/London)
**Commit tested:** `1a0b17a` — "Stop selling API access and priority refresh, which the server does not implement",
detached HEAD in a throwaway git worktree (the main tree has moved on; the ledger is pinned so it stays
reproducible while other lanes edit). `HEAD` had advanced to `63cf0f0` by the time the pin was made; `1a0b17a`
is the commit the lead named and the one measured here.
**How the worktree was prepared:** `git worktree add --detach <temp> 1a0b17a`; the commit has no
`node_modules`, so the main tree's install was junctioned in
(`cmd /c mklink /J "<temp>\node_modules" "<repo>\node_modules"`), and the harness driver — which is not part
of the commit — was copied in from the main working tree: `scripts/e2e-flow.mjs`, SHA-256
`82d6db2ed081a47520ce09f33600d22d05f66f65d6a0f541e866ad7c4f0bd458`. That one untracked file is the
`+ 1 uncommitted path(s)` in the ledger's source line.
**Host:** Johan's Windows 11 PC. Node v26.12.1, Chrome `C:/Program Files/Google/Chrome/Application/chrome.exe`,
WSL Ubuntu with `pdftotext` and `tesseract` on PATH (the extractor's documented `wsl -e` fallback). Two
environment notes that change how the run is configured: the PDF and OCR imports need those WSL binaries, and
the scratch instance raises `RATE_LIMIT_PER_MINUTE` because a scripted journey makes ~200 API calls in under a
minute, more than the production cap of 120 (the limiter is real and was seen returning 429; it is not what
this journey measures).
**Result:** 9/9 steps PASS, 203/203 assertions PASS, exit code 0, 12.1 s. Re-run twice at the same commit with
the same result.

This is a real browser driving the real server: no API stubs, no mocked fetch in the page. The only test
double is the local OpenAI-compatible model in step 9, and the report says so (§ "What could not be
exercised").

## Reproducing the pinned run

```bash
# From the main checkout; <temp> must not already exist.
git worktree add --detach <temp> 1a0b17a
cmd /c mklink /J "<temp>\node_modules" "<repo>\node_modules"
copy scripts\e2e-flow.mjs <temp>\scripts\e2e-flow.mjs
cd <temp>
node scripts/e2e-flow.mjs        # exits 0; prints the ledger below
cd <repo>
git worktree remove <temp> --force
```

The driver is not in the commit, so a clean clone of `1a0b17a` carries `tests/e2e-static.test.js` without
`scripts/e2e-flow.mjs` and `npm test` there fails to import it. That is a committing slip, not a code defect:
commit `scripts/e2e-flow.mjs` (and keep `tests/e2e-static.test.js`) and `npm test` covers the helpers again.


## How to re-run

```bash
cd projects/applywright

# The journey. ~15 s. Starts and stops its own instance on PORT 0 with a temp
# DATABASE_PATH; never touches the :3160 dev server or data/applywright.db.
node scripts/e2e-flow.mjs

# Offline helpers the journey's assertions depend on (zip writer/reader, PDF
# page-box reader, invented-facts checker). No browser, no server.
node --test tests/e2e-static.test.js

# The whole suite and the static self-check.
npm test
npm run check
```

Flags: `--keep` keeps the temp workdir and downloaded files on failure (it is kept automatically on
failure and removed on success); `--no-model-stub` skips step 9; `--verbose` turns console warnings and
step notes into output.

Prerequisites, and how each one fails: Node ≥ 22.5 (global `WebSocket`), Chrome or Edge at one of the
usual Windows paths, WSL with `pdftotext` and `tesseract` for the PDF and OCR imports, and network access
to arbeitnow / remotive / remoteok for step 7. A missing prerequisite fails the step that needs it with the
reason; nothing is skipped silently, and no assertion is faked.

What the script starts and stops: one Express instance (`startServer({ PORT: 0, DATABASE_PATH: temp,
dataDir: temp, ALERTS_SCAN_MINUTES: 0 })`), headless Chrome with a throwaway profile, two one-shot Chrome
launches for the PDF and PNG fixtures, and — in step 9 — a second instance plus a local HTTP stub. All are
closed in `finally`; the temp directories are removed unless `--keep`.

## The ledger

Verbatim output of the run described above:

```text
Applywright — end-to-end journey
  base      http://127.0.0.1:49263   (ephemeral port, throwaway database)
  database  C:\Users\johan\AppData\Local\Temp\applywright-e2e-2Y5ZcW\data\applywright.db
  chrome    C:/Program Files/Google/Chrome/Application/chrome.exe
  source    HEAD @ 1a0b17a + 1 uncommitted path(s)
  workdir   C:\Users\johan\AppData\Local\Temp\applywright-e2e-2Y5ZcW

STEP 1 · sign-up: account, eight recovery codes, download ................. PASS 17/17
   ✓ POST /api/auth/register answers 201
   ✓ the registration response carries exactly 8 recovery codes
   ✓ the recovery panel is visible before anything else happens
   ✓ the registration form is hidden behind the panel
   ✓ the page renders 8 recovery codes
   ✓ every rendered code has the aw-XXXX-XXXX shape
   ✓ the rendered codes are the ones the API issued
   ✓ the page titles the panel as the recovery codes
   ✓ the panel says each code works once
   ✓ the download button writes applywright-recovery-codes.txt
   ✓ the downloaded file lists all 8 codes
   ✓ the downloaded file names the account's email
   ✓ the downloaded file explains that each code works once
   ✓ recoveryCodesFromFile() reads the 8 codes back out of the file
   ✓ the page confirms the download in its status line
   ✓ the new session can read /api/auth/me
   ✓ the dashboard renders for the new account

STEP 2 · import a CV: PDF, DOCX, OCR image and pasted text ................ PASS 46/46
   ✓ the PDF fixture is a real PDF produced by chrome --print-to-pdf
   ✓ the OCR fixture is a real PNG
   ✓ the DOCX fixture is a zip with a word/document.xml part
   ✓ PDF: POST /api/cvs answers 201
   ✓ PDF: the API reports format "pdf"
   ✓ PDF: the API returns a warnings array
   ✓ PDF: the stored text is long enough to score (>= 80 chars)
   ✓ PDF: GET /api/cvs/:id returns the extracted text
   ✓ PDF: the extracted text keeps the CV's own content
   ✓ PDF: the text is segmented into sections the editor can load
   ✓ PDF: the library shows the new CV with its format
   ✓ PDF: the text lands in the editor's sections
   ✓ the previous CV is removed so the Free plan's one-CV quota is not hit
   ✓ DOCX: POST /api/cvs answers 201
   ✓ DOCX: the API reports format "docx"
   ✓ DOCX: the API returns a warnings array
   ✓ DOCX: the stored text is long enough to score (>= 80 chars)
   ✓ DOCX: GET /api/cvs/:id returns the extracted text
   ✓ DOCX: the extracted text keeps the CV's own content
   ✓ DOCX: the text is segmented into sections the editor can load
   ✓ DOCX: the library shows the new CV with its format
   ✓ DOCX: the text lands in the editor's sections
   ✓ the previous CV is removed so the Free plan's one-CV quota is not hit
   ✓ OCR image: POST /api/cvs answers 201
   ✓ OCR image: the API reports format "image"
   ✓ OCR image: the API returns a warnings array
   ✓ OCR image: the stored text is long enough to score (>= 80 chars)
   ✓ OCR image: GET /api/cvs/:id returns the extracted text
   ✓ OCR image: the extracted text keeps the CV's own content
   ✓ OCR image: the text is segmented into sections the editor can load
   ✓ OCR image: the warning says the text was read with OCR
   ✓ OCR image: the library shows the new CV with its format
   ✓ OCR image: the text lands in the editor's sections
   ✓ the previous CV is removed so the Free plan's one-CV quota is not hit
   ✓ Pasted text: POST /api/cvs answers 201
   ✓ Pasted text: the API reports format "txt"
   ✓ Pasted text: the API returns a warnings array
   ✓ Pasted text: the stored text is long enough to score (>= 80 chars)
   ✓ Pasted text: GET /api/cvs/:id returns the extracted text
   ✓ Pasted text: the extracted text keeps the CV's own content
   ✓ Pasted text: the text is segmented into sections the editor can load
   ✓ Pasted text: the library shows the new CV with its format
   ✓ Pasted text: the text lands in the editor's sections
   ✓ the pasted CV has no extraction warnings to report
   ✓ the score panel is available once the CV screen is rendered with the CV on file
   ✓ the account holds exactly one CV at the end of the import step
   · PDF extraction warnings: []
   · DOCX extraction warnings: []
   · OCR warnings: ["The text was read with OCR via `wsl -e tesseract stdin stdout`; check numbers and section headings against the original, and correct them in the editor."]
   · defect D1 — after the first CV import the score panel does not exist until /app/cv is reloaded

STEP 3 · score a pasted advert: score, five subscores, Free truncation .... PASS 17/17
   ✓ POST /api/analyse answers 200
   ✓ the report carries a score of 0-100
   ✓ the page renders the same score the API returned
   ✓ the report carries all five subscores
   ✓ each subscore is on the 0-100 scale
   ✓ the five subscores are the published rubric
   ✓ a Free report sets fullAtsReport.included = false
   ✓ a Free report is cut to the top three findings
   ✓ the report says how many findings it is hiding
   ✓ a Free report hides the advice array
   ✓ the locked line names the plan the full report belongs to
   ✓ the advisory says the full report is locked on this plan
   ✓ the page renders exactly three findings
   ✓ the findings heading says 3, not the total
   ✓ the page shows the Free lock message where the full report would be
   ✓ the page does not render the advice block a Pro report would show
   ✓ the page renders the five subscore bars

STEP 4 · tailor a pack: covering letter locked, no invented fact .......... PASS 21/21
   ✓ POST /api/tailor answers 201
   ✓ the tailor response reports the deterministic rules mode (no model key)
   ✓ the tailor response locks the covering letter on Free
   ✓ the tailor response carries the lock message
   ✓ the pack has an application id
   ✓ the pack is queued as pack_ready
   ✓ the pack carries the score it was built at
   ✓ GET /api/applications/:id answers 200
   ✓ the stored pack has no covering letter markdown
   ✓ the stored tailored source has no covering letter either
   ✓ the stored pack keeps the lock message
   ✓ the stored pack has a printable CV
   ✓ the stored pack has screening answers
   ✓ the stored pack has no refinement trail yet
   ✓ the page says the pack carries no covering letter
   ✓ the page shows the lock message instead of a letter
   ✓ the page shows the screening answers
   ✓ no letter greeting leaked into the page
   ✓ no number in the pack is absent from the CV
   ✓ no employer or name in the pack is absent from the CV or advert
   ✓ the pack quotes the CV's own achievements

STEP 5 · editor: section edit, Ctrl+S diff, proposals, grounding .......... PASS 33/33
   ✓ the editor loads the CV named in ?cv=
   ✓ the editor shows a saved state before any edit
   ✓ the stored CV is the pasted text before the edit
   ✓ the editor marks the document dirty after a section edit
   ✓ Ctrl+S saves through PATCH /api/cvs/:id
   ✓ the saved text contains the edited sentence
   ✓ the editor reports saved, not dirty, after Ctrl+S
   ✓ saving shows a diff
   ✓ the diff says how many lines changed
   ✓ the diff lists the added sentence
   ✓ the diff lists the removed line it replaced
   ✓ POST /api/cvs/:id/assist answers 200
   ✓ the proposal route reports saved: false
   ✓ the proposal route reports the rules mode (no model key)
   ✓ a valid instruction produces at least one change
   ✓ every change stays inside the requested scope
   ✓ the preview contains the proposed text
   ✓ a proposal writes nothing to the CV
   ✓ the page renders one hunk per change
   ✓ the page says nothing is saved yet
   ✓ the fabricated-number instruction is refused, not saved
   ✓ no invented change is proposed
   ✓ the preview contains no invented figure
   ✓ the preview contains no invented employer or headcount
   ✓ the refusal is reported in the refinement's own notes
   ✓ the page says there is nothing to accept
   ✓ the page renders no hunk for the fabricated instruction
   ✓ a second valid proposal is offered
   ✓ accepting a hunk saves it through PATCH /api/cvs/:id
   ✓ the saved text is the accepted proposal
   ✓ the accepted hunk is marked accepted in the page
   ✓ the editor is clean after accepting
   ✓ the diff now describes the accepted change

STEP 6 · exports: Markdown, print-to-PDF (A4), DOCX ....................... PASS 18/18
   ✓ the Markdown link downloads a .md file
   ✓ the Markdown starts with the CV name as a level-1 heading
   ✓ the Markdown carries the section headings
   ✓ the Markdown carries the CV's own facts
   ✓ the print button builds a print-only document
   ✓ the print sheet heads the document with the candidate's name
   ✓ the print sheet has no editor controls in it
   ✓ the printed PDF is a PDF
   ✓ the printed PDF declares an A4 page box
   ✓ the printed PDF page is A4 (595.28 x 841.89 points)
   ✓ the print stylesheet really is @page size A4
   ✓ the DOCX link downloads a .docx file
   ✓ the downloaded DOCX starts with a zip signature
   ✓ the downloaded DOCX opens as a zip
   ✓ the DOCX carries the parts a Word document needs
   ✓ the DOCX document part is XML
   ✓ the DOCX document part carries the CV's own facts
   ✓ the DOCX Heading1 is the CV record's name
   · defect D2 — the DOCX heads the document "Pasted CV" (the CV record's name) while the print sheet heads it "Ada Lovelace" (the contact's name)

STEP 7 · tracking and alerts: status change, alert run, notification ...... PASS 28/28
   ✓ the tailored pack appears in the application queue
   ✓ the row has a status control
   ✓ the row starts at pack_ready
   ✓ PATCH /api/applications/:id answers 200
   ✓ the tracked status becomes submitted
   ✓ the queue recounts the statuses
   ✓ the row's status field shows the new status
   ✓ POST /api/alerts answers 201
   ✓ the alert keeps the keywords it was given
   ✓ the alert card shows its keywords
   ✓ a new alert has not run yet
   ✓ POST /api/alerts/run answers 200
   ✓ the run reports the alert it checked
   ✓ the run reports how many postings it checked
   ✓ the alert run creates at least one notification
   ✓ GET /api/notifications answers 200
   ✓ the notification is in the inbox
   ✓ the notification is unread
   ✓ the notification names the matched job
   ✓ the inbox also hands out an RSS feed token
   ✓ the alerts page lists the hit
   ✓ the alerts page offers the RSS feed
   ✓ marking a hit as read answers 200
   ✓ the unread count drops by exactly one
   ✓ the inbox records the notification as read
   ✓ the RSS feed answers 200 without a session
   ✓ the RSS feed is RSS 2.0
   ✓ the RSS feed lists the notification as an item

STEP 8 · recovery: sign out, spend a code on /reset, sign in again ........ PASS 8/8
   ✓ POST /api/auth/logout answers 200
   ✓ signing out lands on /sign-in
   ✓ POST /api/auth/recover answers 200
   ✓ the page confirms the password changed
   ✓ the spent code is refused the second time
   ✓ the new password signs in
   ✓ the session reads /api/auth/me after signing in
   ✓ the old password is refused

STEP 9 · model path (local stub): invented figure rejected, grounded change accepted ... PASS 15/15
   ✓ the model-path instance creates an account
   ✓ the model-path instance stores a CV
   ✓ the model-path assist call answers 200
   ✓ the stub model was actually called
   ✓ the invented figure never becomes a change
   ✓ the proposal is still marked saved: false
   ✓ the preview contains no invented figure
   ✓ the refusal names the invented figure
   ✓ the page reports the refusal rather than staying silent
   ✓ a grounded model reply is offered as a change
   ✓ the response reports the model mode
   ✓ the grounded change keeps the CV's own figures
   ✓ the page says a model produced it, then it was checked
   ✓ the grounded model change saves
   ✓ the saved CV carries the grounded rewrite
   · stub model instance at http://127.0.0.1:49931

LEDGER
  steps        9 passed, 0 failed, 9 run
  assertions   203 passed, 0 failed
  duration     12.1s

NOTES
  · STEP 2: PDF extraction warnings: []
  · STEP 2: DOCX extraction warnings: []
  · STEP 2: OCR warnings: ["The text was read with OCR via `wsl -e tesseract stdin stdout`; check numbers and section headings against the original, and correct them in the editor."]
  · STEP 2: defect D1 — after the first CV import the score panel does not exist until /app/cv is reloaded
  · STEP 6: defect D2 — the DOCX heads the document "Pasted CV" (the CV record's name) while the print sheet heads it "Ada Lovelace" (the contact's name)
  · STEP 9: stub model instance at http://127.0.0.1:49931

PASS — the whole journey behaved as the product claims.
```

## What each step actually proves

| Step | Proved in the browser, not just in code |
|---|---|
| 1 | A new account is created through the form, the API returns eight `aw-XXXX-XXXX` codes, the page renders exactly those eight, the download button writes `applywright-recovery-codes.txt` containing all eight and the email, and the page confirms it. |
| 2 | Four ingest paths each store a CV: a real PDF printed by `chrome --print-to-pdf`, a synthesised minimal DOCX (stored-zip with `word/document.xml`), a PNG read by Tesseract through the `wsl -e` fallback, and pasted text. Each reports its `format`, a `warnings` array (the OCR path carries the "read with OCR" warning), a section split, and the text loads into the editor's fields. The Free one-CV allowance is respected by deleting each CV before the next import. |
| 3 | Scoring is done from pasted advert text: 57/100 with all five subscores (`keywords 24, structure 100, achievements 20, readability 100, formatting 100`), and a Free report that is provably truncated — three findings on the page and in the JSON out of six, `fullAtsReport.included === false`, `shownFindings < totalFindings`, empty `advice`, and the "part of Pro" lock shown where the advice block would be. |
| 4 | A pack is tailored: `mode: "rules"`, `coverLetter === ""` with the lock message in the response, the stored pack and the page; the stored `tailored.coverLetter` is empty too (no back door); the printable CV and screening answers are present; and an independent fact check finds no number outside the CV and no name outside the CV or advert. |
| 5 | The editor loads `/editor?cv=<id>`, a section edit marks the document dirty, `Ctrl+S` (real key events over CDP) saves through `PATCH /api/cvs/:id`, the diff lists the added and removed lines, the save state returns to "saved". A proposal is `saved: false`, scoped to the summary, and writes nothing. A fabricated-number instruction ("cut costs by 37% and led 12 engineers at Initech") produces no change, no invented figure and no invented employer, and the refusal is visible. Accepting a valid hunk saves it and the diff updates. |
| 6 | `.md` downloads with the name, the section headings and the CV's facts; the print path builds the print-only sheet and `Page.printToPDF` produces a PDF whose `/MediaBox` is A4 (595.28 × 841.89 pt, within 1 pt); `.docx` downloads with a `PK` signature, opens as a zip with the four parts a Word document needs, and its `word/document.xml` carries the CV's facts. |
| 7 | The queued pack appears in the applications table, changing its status through the select issues `PATCH /api/applications/:id` and the counts/row update. An alert is created, `POST /api/alerts/run` polls the public boards, at least one real notification is created and listed in the alerts inbox, marking it read drops the unread count by exactly one, and the RSS feed serves it without a session. |
| 8 | Sign-out clears the session and lands on `/sign-in`; a recovery code on `/reset` sets a new password; the same code is refused the second time (400); the new password signs in; `/api/auth/me` confirms the account; the old password is refused (401). |
| 9 | With a local OpenAI-compatible stub (a test double, not a model) answering with an invented "37%", the assist route proposes no change, keeps `saved: false`, and names the refused figure in its warnings; with a grounded reply it proposes the change, reports `mode: "model"`, and accepting it saves. |

Every step also fails on any console error, uncaught exception or 4xx/5xx the step did not deliberately
provoke. Two refusals are deliberately provoked in step 8 (a spent code, an old password) and are declared
as expected for that step; everything else that was not 2xx would be a finding. The mechanism was proved
working during development: before those two were declared expected, the run failed step 8 on exactly the
400 from `/api/auth/recover` and the 401 from `/api/auth/login`.

## What could not be exercised, and why

Honest list — none of these is covered by the ledger above.

1. **Stripe / paid plans.** No `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` on this host, so
   `config.stripe.configured` is false: `POST /api/billing/checkout`, `/api/billing/portal` and
   `/api/billing/webhook` answer 501. A Free → Pro upgrade was therefore not performed, so the Pro side of
   the gates (full report, covering letter, pack history) is verified only by the unit tests, not in a
   browser. The Free side is what the ledger measures.
2. **A real model.** No model key. The product therefore ran its deterministic rules path, and `mode` is
   `rules` everywhere in steps 4 and 5. Step 9 exercises the model call path and the grounding gate against
   a local OpenAI-compatible stub — it proves the gate rejects an invented figure and accepts a grounded
   rewrite, but says nothing about a real model's wording quality, latency or failures.
3. **LinkedIn.** By design there is no OAuth or sign-in: the product never fetches LinkedIn. The
   `POST /api/connectors/linkedin` route, the bookmarklet capture (`/bookmarklet`,
   `public/assets/bookmarklet.js`) and the "Paste a LinkedIn profile" drawer were not driven; the journey
   uses file upload and plain paste. No live LinkedIn page was read by this verification.
4. **Email.** This build has no SMTP transport: `POST /api/auth/forgot` only records an operator request
   (`docs/PASSWORD-RECOVERY.md`). The emailed reset-link flow cannot exist here, so only the recovery-code
   path was verified. The operator-issued `?token=` reset page was not exercised either (it needs a token
   from `data/recovery-requests.jsonl`, which the harness does not read).
5. **Quota refusals (402).** The second CV, fourth pack and second alert were never attempted: the import
   step deletes each CV so the Free one-CV allowance is never exceeded, and the journey builds exactly one
   pack and one alert. The 402 copy and upgrade prompts are covered by the unit tests, not here.
6. **Pack history gate.** Free may read only its newest pack's covering letter. That needs two packs; the
   journey builds one.
7. **The rate limiter.** A scripted journey makes ~200 API calls in under a minute, more than the
   production per-IP ceiling of 120, so the scratch instance raises `RATE_LIMIT_PER_MINUTE`. The limiter is
   real and was seen firing (429) in a run before that; it is simply not what this journey measures.
8. **Layout and theming.** Desktop 1440 × 1000 only, light theme, no reduced-motion emulation. Narrow
   widths, dark mode and zoom are covered by the existing screenshot lanes (`scripts/browser-preview.mjs`,
   `screenshots/`, `docs/design/ACCESSIBILITY-AUDIT.md`).
9. **The OS print dialog and clipboard permissions.** `Page.printToPDF` stands in for the dialog's "Save as
   PDF"; the copy buttons were not clicked (the download buttons were).
10. **The job boards themselves.** Step 7 depends on arbeitnow / remotive / remoteok being reachable and on
    their current content matching a broad keyword; the run reports each source's errors in its notes and
    fails the notification assertion rather than inventing a match. The number of notifications created varies
    with the boards' content — 17 in one earlier run, one in another, at least one on every run that got that
    far — so the assertion is "at least one", not a count.
11. **What the pin does and does not cover.** The measured code is commit `1a0b17a`; the main tree has moved
    on (it was at `63cf0f0` when the pin was taken, and at `def3ebe` when this was written) and
    `public/assets/editor.js` was still being edited by another lane. A later run of the same script in the
    main tree may legitimately measure different code; re-pin and re-run for a fresh fingerprint. The one
    file the ledger counts as uncommitted is the harness driver, which is not in the commit (see
    "Reproducing the pinned run"). As a spot check, not a pinned ledger, the same script also passed 9/9 steps
    and 203/203 assertions on `main @ def3ebe + 8 uncommitted path(s)`, so the assertions are not tied to a
    single commit's markup.

## Defects found

Three real defects, all outside this task's write scope (`scripts/e2e-flow.mjs`, `docs/E2E-VERIFICATION.md`,
`tests/e2e-static.test.js`, and `server/app.js` only for a real bug). They are reported with the smallest fix
that would clear them, not patched. No defect was found in `server/app.js`: the Free report gate, the pack
gate, the covering-letter back-door removal, recovery-code single use, the RSS token lookup and the origin
check all behaved as documented — so no `app.js` patch was applied.

### D1 — the score panel is missing after the first CV import

`public/app/app.js:2060` (`renderCvScreen`, line numbers as at `1a0b17a`):

```js
mount.replaceChildren(...(cvs.length ? [librarySection, analyseSection, ingest] : [ingest, librarySection]));
```

`analyseSection` is built at `public/app/app.js:2041` but only mounted when the screen is first rendered with
a CV already on file. The upload/paste handlers call `renderLibrary()`, `renderSelect()`,
`refreshCvQuotaNote()` and `updateRail()` — never a re-mount — so on a brand-new account the score form does
not exist after the first import, and the library's "Analyse this" button (`byId("cv-analyse")?.scrollIntoView`)
scrolls to nothing until `/app/cv` is reloaded.

Reproduced on every clean run, including the pinned `1a0b17a` run; the ledger records it as a note in step 2
and then reloads the screen, which is how the rest of the journey proceeds.

Smallest fix: after a successful add, re-render the route (`await renderRoute({ focus: false })`) instead of
patching the pieces, or always mount `analyseSection` and hide it while `cvs.length === 0`. Not applied: it is
a shared SPA file outside this task's edit surface, and another lane was editing it.

### D2 — the exported DOCX is titled with the CV record's name, not the candidate's

`public/assets/editor.js:1590` (line numbers as at `1a0b17a`):

```js
const bytes = buildDocx({ contact: state.contact, sections: state.sections, title: state.cvName });
```

`buildDocx` (`public/assets/editor.js:635`) does `const title = text(source.title).trim() || contact.name ||
"Curriculum vitae"`, so `cvName` always wins. The print sheet (`public/assets/editor.js:1602`) does the
opposite — `state.contact.name || state.cvName` — so the same CV prints headed "Ada Lovelace" and downloads
as a DOCX headed "Pasted CV" (or, for a file import, the filename stem).

Reproduced by the DOCX assertion in step 6 at `1a0b17a` (the ledger notes it).

Smallest fix: `title: state.contact.name || state.cvName` at `:1590`. Not applied: outside the edit surface.

### D3 — a Pro covering letter can read "At Northwind Traders,," (double comma)

`server/lib/cv/tailor.js:1361` (`achievementSentence`, line numbers as at `1a0b17a`):

```js
return `At ${role.employer}, I ${lowerFirst(rewritten)}.`;
```

`roleFacts` (`server/lib/cv/tailor.js:284`–`293`) removes the year range first, then splits the remaining
header on `,\s+`. For the very common header form `Platform Engineer, Northwind Traders, 2019 to present`
the year range is replaced by a space, leaving `Platform Engineer, Northwind Traders,` — a trailing comma with
no following whitespace, so it stays glued to the employer and the template adds a second comma.

Not reachable in the Free journey (the letter is locked), so the harness cannot assert it; found while
building the pack fixtures, and reproduced against the `1a0b17a` worktree with the command below (run it from
the repo root of whichever checkout you are testing):

```bash
node --input-type=module -e '
import { tailorCv } from "./server/lib/cv/tailor.js";
import { segmentSections } from "./server/lib/cv/extract.js";
const cvText = "Ada Lovelace\nada@example.com\n\nSummary\nPayments engineer.\n\nExperience\nPlatform Engineer, Northwind Traders, 2019 to present\n- Reduced infrastructure cost by 32 percent across 14 services.\n\nEducation\nBSc Computer Science, University of Bristol, 2015\n\nSkills\nKubernetes, Terraform, Go";
const job = { title: "Platform Engineer", company: "Acme Robotics", url: null, description: "Platform engineer with Kubernetes and Terraform experience." };
const tailored = await tailorCv({ cvText, profile: segmentSections(cvText), job, model: null });
console.log(tailored.coverLetter.split("\n").filter((line) => line.startsWith("At ")));
'
```

prints `At Northwind Traders,, I reduced infrastructure cost by 32 percent across 14 services.`
Smallest fix: strip trailing punctuation from each `pieces` entry before choosing the employer
(`.map((piece) => piece.replace(/[,;:]+$/, "").trim())`). Not applied: `server/lib/cv/tailor.js` is outside the
edit surface (only `server/app.js` was in scope for a real bug).

## How the harness is put together

- **No dependencies.** `scripts/e2e-flow.mjs` uses Node's global `WebSocket` for CDP and `fetch` for the
  HTTP fixtures, the same pattern as `scripts/browser-preview.mjs`. Nothing is installed.
- **A scratch instance, never the dev server.** `startServer({ PORT: 0, DATABASE_PATH: temp, dataDir: temp,
  ALERTS_SCAN_MINUTES: 0, ANTHROPIC_ORG_API_KEY: "", MODEL_API_KEY: "" })` — an empty key set forces the
  rules path even if the host happens to have keys exported.
- **Real UI paths.** Forms are filled and submitted through `requestSubmit()`; files are attached through
  `DataTransfer` into the real `<input type=file>` so the page's own `readFileBase64` and API call run;
  `Ctrl+S` is a real `Input.dispatchKeyEvent` pair; downloads are written by Chrome into a directory the
  script owns and are asserted on their bytes.
- **Two assertions per contract where it matters.** Every contract is checked on the JSON the page used
  (captured from `Network.responseReceived`/`getResponseBody`) *and* on the DOM the page rendered, so a page
  that shows the right thing from the wrong data still fails.
- **Fixtures, not binary assets.** The PDF is printed by a one-shot `chrome --print-to-pdf`; the PNG is a
  one-shot screenshot of an HTML page set large for OCR; the DOCX is a stored-zip built in-process
  (`buildMinimalDocx`). The file's own `%PDF-`, PNG signature and `PK` signature are asserted before upload,
  so a broken fixture fails before it can look like a product failure.
- **Fact checking is independent.** `inventedFacts()` does not import the product's grounding code: it
  re-extracts figures and multi-word proper nouns from the pack and compares them with the CV (figures) and
  the CV plus advert (names), one line at a time so a word at the end of one block cannot pair with a word at
  the start of the next. `tests/e2e-static.test.js` proves that helper, the zip writer/reader and the
  MediaBox reader offline, including a PowerShell unzip of the bytes the journey uploads.
- **Failure artefacts.** On failure the script keeps the workdir: a screenshot of the failed step in
  `artifacts/`, plus any downloads and `editor-print.pdf` / `editor-export.docx` / `editor-export.md` from
  step 6. On success everything is removed.

## Related documents

- `docs/EDITOR.md` — the editor's contract (propose, never save; the document is the text).
- `docs/PIPELINE.md` — ingest → score → tailor → pack.
- `docs/PASSWORD-RECOVERY.md` — recovery codes vs. operator-issued reset links.
- `docs/PROJECT-STATUS.md` §9 — declared-but-unenforced flags (`apiAccess`, `priorityRefresh`, `bulkExport`).
- `scripts/browser-preview.mjs` — the screenshot/overflow pass this harness's CDP client is modelled on.
