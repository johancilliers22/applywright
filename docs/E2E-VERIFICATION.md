# End-to-end verification — Applywright

**Date:** 2026-10-28 (Europe/London)

**New Codex intake, 19:37 UTC:** the three mandatory non-browser gates were rerun on `86b74c3a1869255ce276cfe961474193d6080ca0`: HTTP 150/150, modules 346 pass/1 skip/0 fail, static 0 errors/0 warnings. See `verification/20261028-intake/gates.json`. `scripts/e2e-flow.mjs` and live-model calls are **NOT RUN** by this intake. The driver launches headless Chrome with a temporary profile and external job-board reads; fresh source/safety review and browser admission are required before invoking it. The records below are historical, not a rerun at current HEAD.

**Historical authoritative E2E record:** measured on `main` at `f50ef22` ("Contact data: stop mining it from prose,
and stop letting it block rewrites"), the commit that landed the `server/lib/cv/` contact-data work two other
lanes had in flight during the earlier runs. The tree was clean apart from this document. **10/10 steps,
235/235 assertions, exit 0**, on two consecutive runs back to back. The ledger below is one of those two; its
source line reads `+ 1 uncommitted path(s)` because this report was the only uncommitted file.

**Intermediate record:** two earlier runs at `1c94483` — while that lane's edits to
`server/lib/cv/extract.js`, `refine.js` and their tests were still uncommitted — were also 10/10 steps,
235/235 assertions, exit 0. That work then landed as `f50ef22`, so the authoritative ledger above measures it
as committed code instead of as an in-flight edit.

**Prior record:** product code `706b741`, measured on `bdf167c` — 10/10 steps, 235/235 assertions. Kept below
as the previous authoritative ledger; only docs and the visual/editor lanes changed product behaviour since.

**Before the three defect fixes:** `1a0b17a` — 9/9 steps, 203/203 assertions, run in a throwaway git
worktree. Kept under "The ledger — historical" because it is the record of the defects as they were: that
run's harness *recorded* D1 and D2 as notes rather than asserting the fixed behaviour, and D3 was not
reachable at all.

**Driver:** `scripts/e2e-flow.mjs`, committed in the repo; the revision that produced the current ledger is
SHA-256 `caf619b0ea87de2eae943f224ca71f30557fe825f79a443f3425c1dbdb2bebe1`, and `git status` reports no
modification to it.

**Host:** Johan's Windows 11 PC. Node v26.12.1, Chrome `C:/Program Files/Google/Chrome/Application/chrome.exe`.
Two environment notes that change how the run is configured: the PDF and OCR imports delegate to
`pdftotext`/`tesseract` in WSL Ubuntu (the extractor's documented `wsl -e` fallback, present on this host), and
the scratch instance raises `RATE_LIMIT_PER_MINUTE` because a scripted journey makes ~200 API calls in under a
minute, more than the production cap of 120. The limiter is real and was seen returning 429 at the default cap;
it is not what this journey measures.

This is a real browser driving the real server: no API stubs, no mocked `fetch` in the page. The only test
double is the local OpenAI-compatible model in step 9, and the report says so. One piece of state is set
directly on the scratch database rather than through the UI — the Pro plan in step 4b — because Stripe has no
keys here; § "What could not be exercised" is explicit about what that does and does not prove.

## How to re-run

A clean clone works: the driver is in the repo. The journey runs against the working tree, so any uncommitted
edit in it is part of what is measured — check `git status` before trusting a ledger.

```bash
cd projects/applywright

# The journey, twice. ~13 s each. Starts and stops its own instance on PORT 0
# with a temp DATABASE_PATH; never touches a :3160 dev server or data/.
node scripts/e2e-flow.mjs
node scripts/e2e-flow.mjs

# Offline helpers the journey's assertions depend on (zip writer/reader, PDF
# page-box reader, invented-facts checker). No browser, no server.
node --test tests/e2e-static.test.js

# The whole suite and the static self-check.
npm test
npm run check
```

Flags: `--keep` keeps the temp workdir and downloads on failure (it is kept automatically on failure and
removed on success); `--no-model-stub` skips step 9; `--verbose` prints console warnings and step notes.

Prerequisites, and how each one fails: Node ≥ 22.5 (global `WebSocket`), Chrome or Edge at one of the usual
Windows paths, WSL with `pdftotext` and `tesseract` for the PDF and OCR imports, and network access to
arbeitnow / remotive / remoteok for step 7. A missing prerequisite fails the step that needs it with the
reason; nothing is skipped silently and no assertion is faked.

What the script starts and stops: one Express instance (`startServer({ PORT: 0, DATABASE_PATH: temp,
dataDir: temp, ALERTS_SCAN_MINUTES: 0 })`), headless Chrome with a throwaway profile, two one-shot Chrome
launches for the PDF and PNG fixtures, and — in step 9 — a second instance plus a local HTTP stub. All are
closed in `finally`; the temp directories are removed unless `--keep`.

For the historical `1a0b17a` record the driver was not in that commit, so it had to be copied in; that is why
its source line says `HEAD @ 1a0b17a + 1 uncommitted path(s)`:

```bash
git worktree add --detach <temp> 1a0b17a
cmd /c mklink /J "<temp>\node_modules" "<repo>\node_modules"
copy scripts\e2e-flow.mjs <temp>\scripts\e2e-flow.mjs
cd <temp> && node scripts/e2e-flow.mjs
git worktree remove <temp> --force
```

## The tree the runs actually measured

The instruction was to record the commit, not to quote the old one. So the record names what was in the tree
while each ledger was produced:

- **HEAD for the authoritative ledger:** `f50ef22`. The only uncommitted path was this document; the source
  line says `+ 1 uncommitted path(s)` for that reason, not because product code was dirty.
- **Earlier, at `1c94483`:** `server/lib/cv/extract.js` and `server/lib/cv/refine.js` (with their `.test.mjs`
  files) were uncommitted and another lane was still editing them — mtimes `17:04:52` and `17:03:49`. A fifth
  path appeared between that run 1 and run 2, none of them under `public/` or `server/app.js`.
- **Did the in-flight modules affect the runs?** Both modules were syntax-valid at import, their SHA-256
  hashes were identical immediately before and after each run, and each run was green (10/10, 235/235) with no
  console error or 5xx. A mid-write file would either fail the module import outright or produce an error the
  ledger attributes to the step that hit it; neither happened. That is evidence the edits did not disturb the
  journey — it is not a claim that those edits were reviewed or are correct.
- **Then they landed.** The lane committed exactly those paths as `f50ef22`, and the two authoritative runs
  were repeated against the clean tree. Same 10 steps, same 235 assertions, so the commit changed nothing the
  journey measures.

## The ledger — current state, `f50ef22` (authoritative)

```text
Applywright — end-to-end journey
  base      http://127.0.0.1:61858   (ephemeral port, throwaway database)
  database  C:\Users\johan\AppData\Local\Temp\applywright-e2e-aHL4ng\data\applywright.db
  chrome    C:/Program Files/Google/Chrome/Application/chrome.exe
  source    main @ f50ef22 + 1 uncommitted path(s)
  workdir   C:\Users\johan\AppData\Local\Temp\applywright-e2e-aHL4ng

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

STEP 2 · import a CV: PDF, DOCX, OCR image and pasted text ................ PASS 52/52
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
   ✓ PDF: the library lists the new CV by name
   ✓ PDF: the library shows the format it was read as
   ✓ PDF: the text lands in the editor's sections
   ✓ the previous CV is removed so the Free plan's one-CV quota is not hit
   ✓ DOCX: POST /api/cvs answers 201
   ✓ DOCX: the API reports format "docx"
   ✓ DOCX: the API returns a warnings array
   ✓ DOCX: the stored text is long enough to score (>= 80 chars)
   ✓ DOCX: GET /api/cvs/:id returns the extracted text
   ✓ DOCX: the extracted text keeps the CV's own content
   ✓ DOCX: the text is segmented into sections the editor can load
   ✓ DOCX: the library lists the new CV by name
   ✓ DOCX: the library shows the format it was read as
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
   ✓ OCR image: the library lists the new CV by name
   ✓ OCR image: the library shows the format it was read as
   ✓ OCR image: the text lands in the editor's sections
   ✓ the previous CV is removed so the Free plan's one-CV quota is not hit
   ✓ the score panel is absent before the first CV is imported
   ✓ the score panel is mounted straight after the first CV import (D1 guard)
   ✓ the score panel has its form ready to use
   ✓ Pasted text: POST /api/cvs answers 201
   ✓ Pasted text: the API reports format "txt"
   ✓ Pasted text: the API returns a warnings array
   ✓ Pasted text: the stored text is long enough to score (>= 80 chars)
   ✓ Pasted text: GET /api/cvs/:id returns the extracted text
   ✓ Pasted text: the extracted text keeps the CV's own content
   ✓ Pasted text: the text is segmented into sections the editor can load
   ✓ Pasted text: the library lists the new CV by name
   ✓ Pasted text: the library shows the format it was read as
   ✓ Pasted text: the text lands in the editor's sections
   ✓ the pasted CV has no extraction warnings to report
   ✓ the account holds exactly one CV at the end of the import step
   · PDF extraction warnings: []
   · DOCX extraction warnings: []
   · OCR warnings: ["The text was read with OCR via `wsl -e tesseract stdin stdout`; check numbers and section headings against the original, and correct them in the editor."]

STEP 3 · score a pasted advert: score, five subscores, Free truncation .... PASS 20/20
   ✓ POST /api/analyse answers 200
   ✓ the report carries a score of 0-100
   ✓ the rendered score equals the API's score
   ✓ the gauge's aria-label names the score
   ✓ the gauge's aria-label names the strong-fit threshold
   ✓ the gauge shows the threshold beside the value
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

STEP 4b · Pro behaviour (plan set on the scratch database): full report and a clean covering letter ... PASS 20/20
   ✓ the session names the account whose plan is being set
   ✓ the scratch account is on the pro plan
   ✓ pro entitlements include the full ATS report
   ✓ pro entitlements include the covering letter
   ✓ a Pro analyse answers 200
   ✓ a Pro report sets fullAtsReport.included = true
   ✓ a Pro report is not truncated to three findings
   ✓ a Pro report carries the advice array
   ✓ the page renders every finding on Pro
   ✓ the page renders 'What to change first' on Pro
   ✓ a Pro tailor answers 201
   ✓ a Pro tailor response carries a covering letter
   ✓ a Pro tailor response carries no cover-letter lock
   ✓ GET /api/applications/:id answers 200 for the Pro pack
   ✓ the stored Pro pack has covering-letter markdown
   ✓ the stored Pro pack carries no cover-letter lock
   ✓ the covering letter never doubles a comma (D3 guard)
   ✓ the covering letter never leaves a dangling 'At'
   ✓ the covering letter names the CV's own employer cleanly
   ✓ no number in the covering letter is absent from the CV

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

STEP 6 · exports: Markdown, print-to-PDF (A4), DOCX ....................... PASS 21/21
   ✓ the Markdown link downloads a .md file
   ✓ the Markdown is headed with the candidate's name (D2 guard)
   ✓ the Markdown is not headed with the CV record's name
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
   ✓ the DOCX Heading1 is the candidate's name (D2 guard)
   ✓ the DOCX does not carry the CV record's name as its title
   ✓ the DOCX, the Markdown and the print sheet agree on the heading

STEP 7 · tracking and alerts: status change, alert run, notification ...... PASS 28/28
   ✓ the tailored pack appears in the application queue
   ✓ the row has a status control
   ✓ the row starts at pack_ready
   ✓ PATCH /api/applications/:id answers 200
   ✓ the tracked status becomes submitted
   ✓ the queue recounts the statuses
   ✓ the row's status control shows the new status
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
   · stub model instance at http://127.0.0.1:53102

LEDGER
  steps        10 passed, 0 failed, 10 run
  assertions   235 passed, 0 failed
  duration     12.8s

NOTES
  · STEP 2: PDF extraction warnings: []
  · STEP 2: DOCX extraction warnings: []
  · STEP 2: OCR warnings: ["The text was read with OCR via `wsl -e tesseract stdin stdout`; check numbers and section headings against the original, and correct them in the editor."]
  · STEP 9: stub model instance at http://127.0.0.1:53102

PASS — the whole journey behaved as the product claims.
```

## The ledger — prior record, product code `706b741`

The run before the document refreshes; same 10 steps and the same 235 assertions.

```text
Applywright — end-to-end journey
  base      http://127.0.0.1:61924   (ephemeral port, throwaway database)
  database  C:\Users\johan\AppData\Local\Temp\applywright-e2e-zQ7AJe\data\applywright.db
  chrome    C:/Program Files/Google/Chrome/Application/chrome.exe
  source    main @ bdf167c + 1 uncommitted path(s)
  workdir   C:\Users\johan\AppData\Local\Temp\applywright-e2e-zQ7AJe

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

STEP 2 · import a CV: PDF, DOCX, OCR image and pasted text ................ PASS 52/52
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
   ✓ PDF: the library lists the new CV by name
   ✓ PDF: the library shows the format it was read as
   ✓ PDF: the text lands in the editor's sections
   ✓ the previous CV is removed so the Free plan's one-CV quota is not hit
   ✓ DOCX: POST /api/cvs answers 201
   ✓ DOCX: the API reports format "docx"
   ✓ DOCX: the API returns a warnings array
   ✓ DOCX: the stored text is long enough to score (>= 80 chars)
   ✓ DOCX: GET /api/cvs/:id returns the extracted text
   ✓ DOCX: the extracted text keeps the CV's own content
   ✓ DOCX: the text is segmented into sections the editor can load
   ✓ DOCX: the library lists the new CV by name
   ✓ DOCX: the library shows the format it was read as
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
   ✓ OCR image: the library lists the new CV by name
   ✓ OCR image: the library shows the format it was read as
   ✓ OCR image: the text lands in the editor's sections
   ✓ the previous CV is removed so the Free plan's one-CV quota is not hit
   ✓ the score panel is absent before the first CV is imported
   ✓ the score panel is mounted straight after the first CV import (D1 guard)
   ✓ the score panel has its form ready to use
   ✓ Pasted text: POST /api/cvs answers 201
   ✓ Pasted text: the API reports format "txt"
   ✓ Pasted text: the API returns a warnings array
   ✓ Pasted text: the stored text is long enough to score (>= 80 chars)
   ✓ Pasted text: GET /api/cvs/:id returns the extracted text
   ✓ Pasted text: the extracted text keeps the CV's own content
   ✓ Pasted text: the text is segmented into sections the editor can load
   ✓ Pasted text: the library lists the new CV by name
   ✓ Pasted text: the library shows the format it was read as
   ✓ Pasted text: the text lands in the editor's sections
   ✓ the pasted CV has no extraction warnings to report
   ✓ the account holds exactly one CV at the end of the import step
   · PDF extraction warnings: []
   · DOCX extraction warnings: []
   · OCR warnings: ["The text was read with OCR via `wsl -e tesseract stdin stdout`; check numbers and section headings against the original, and correct them in the editor."]

STEP 3 · score a pasted advert: score, five subscores, Free truncation .... PASS 20/20
   ✓ POST /api/analyse answers 200
   ✓ the report carries a score of 0-100
   ✓ the rendered score equals the API's score
   ✓ the gauge's aria-label names the score
   ✓ the gauge's aria-label names the strong-fit threshold
   ✓ the gauge shows the threshold beside the value
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

STEP 4b · Pro behaviour (plan set on the scratch database): full report and a clean covering letter ... PASS 20/20
   ✓ the session names the account whose plan is being set
   ✓ the scratch account is on the pro plan
   ✓ pro entitlements include the full ATS report
   ✓ pro entitlements include the covering letter
   ✓ a Pro analyse answers 200
   ✓ a Pro report sets fullAtsReport.included = true
   ✓ a Pro report is not truncated to three findings
   ✓ a Pro report carries the advice array
   ✓ the page renders every finding on Pro
   ✓ the page renders 'What to change first' on Pro
   ✓ a Pro tailor answers 201
   ✓ a Pro tailor response carries a covering letter
   ✓ a Pro tailor response carries no cover-letter lock
   ✓ GET /api/applications/:id answers 200 for the Pro pack
   ✓ the stored Pro pack has covering-letter markdown
   ✓ the stored Pro pack carries no cover-letter lock
   ✓ the covering letter never doubles a comma (D3 guard)
   ✓ the covering letter never leaves a dangling 'At'
   ✓ the covering letter names the CV's own employer cleanly
   ✓ no number in the covering letter is absent from the CV

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

STEP 6 · exports: Markdown, print-to-PDF (A4), DOCX ....................... PASS 21/21
   ✓ the Markdown link downloads a .md file
   ✓ the Markdown is headed with the candidate's name (D2 guard)
   ✓ the Markdown is not headed with the CV record's name
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
   ✓ the DOCX Heading1 is the candidate's name (D2 guard)
   ✓ the DOCX does not carry the CV record's name as its title
   ✓ the DOCX, the Markdown and the print sheet agree on the heading

STEP 7 · tracking and alerts: status change, alert run, notification ...... PASS 28/28
   ✓ the tailored pack appears in the application queue
   ✓ the row has a status control
   ✓ the row starts at pack_ready
   ✓ PATCH /api/applications/:id answers 200
   ✓ the tracked status becomes submitted
   ✓ the queue recounts the statuses
   ✓ the row's status control shows the new status
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
   · stub model instance at http://127.0.0.1:51280

LEDGER
  steps        10 passed, 0 failed, 10 run
  assertions   235 passed, 0 failed
  duration     13.2s

NOTES
  · STEP 2: PDF extraction warnings: []
  · STEP 2: DOCX extraction warnings: []
  · STEP 2: OCR warnings: ["The text was read with OCR via `wsl -e tesseract stdin stdout`; check numbers and section headings against the original, and correct them in the editor."]
  · STEP 9: stub model instance at http://127.0.0.1:51280

PASS — the whole journey behaved as the product claims.
```

## The ledger — historical, `1a0b17a` (before the three fixes)

Produced by the harness as it stood then: D1 and D2 appear as `·` notes because the screen was reloaded and
the DOCX heading was asserted at its buggy value, and step 4b did not exist, so no covering letter was
reached. Keep it as the "before" picture.

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

## When the visual work moved, the harness followed the product

The product's visuals are allowed to change; a browser test that encodes the old drawing is the thing that
goes stale. That happened here, and it is worth recording exactly how it was handled.

Commit `0f9175a` (`app-ui-aw`) deleted the 108px donut score ring (`.aw-ring`, `role="img"`,
`aria-label="Score N out of 100"`) and replaced it with the marketing vernier gauge: `.aw-gauge` with
`role="img"`, `aria-label="Rubric score: N out of 100. Strong fit starts at 70."`, a visible legend reading
`N / 100` plus `strong fit from 70`, and a threshold marker. Nothing about the *claim* changed — the page
shows the score the API returned — but the harness still waited for `.aw-ring`, so step 3 failed:
9 passed, 1 failed, 213/214 assertions, exit 1, with `timed out waiting for the score ring to show the API's
score`.

That was a harness defect, not a product one. The fix, in step 3:

1. Wait for `.aw-gauge__value` and require its text to match `N / 100`, then assert the rendered number
   **equals the API's score** (`report.score`). The claim is the equality, not the element.
2. Assert the gauge's `aria-label` names the score and the strong-fit threshold. The visible legend is
   `aria-hidden`, so the label is what a reader using assistive tech actually gets — it is the accessible
   equivalent of the ring's old label, and the right thing to pin.
3. Assert the visible threshold note (`strong fit from 70`) as text.

The rule that follows, now stated in the harness header: **assert rendered text and ARIA wherever the claim
can be expressed that way, and fall back to a class name only when there is no text equivalent.** Other
class-coupled assertions found while auditing the harness for this change:

| Where | Was coupled to | Now |
|---|---|---|
| Step 3 score | `.aw-ring` (deleted) | `.aw-gauge__value` text + `.aw-gauge` `aria-label` |
| Step 2 library card | `article.aw-cv` + `.aw-card__title` | `#app-view` text contains the CV name and its format |
| Step 7 status recount | `button.chip` text nodes | `#app-view` text contains `Submitted (1)` |
| Step 7 row status | `.aw-status-field[data-status]` | the status `<select aria-label="Status for …">` value |
| Steps 3/4b findings count | `.aw-finding` count | still a class name — there is no text equivalent to a count of blocks; the heading text `Findings (3)` is asserted separately |
| Step 3 subscores | `.aw-subscore__row` count | still a class name — same reason; the values themselves are asserted from the API |
| Steps 5/9 proposals | `.ed-hunk` count and `data-state` | still class names — the editor's own contract, no text equivalent |
| Step 6 print sheet | `#ed-print-doc h1` | still an id, but the heading *text* is what is asserted |

Not asserted anywhere, so untouched by the visual work: the empty-state artwork (`.aw-empty__art`), the
dashboard's two-tier metrics (`aw-metrics`), and the status pills' new shape marks (`.aw-pip` is read nowhere).

## What each step actually proves

| Step | Proved in the browser, not just in code |
|---|---|
| 1 | A new account is created through the form, the API returns eight `aw-XXXX-XXXX` codes, the page renders exactly those eight, the download button writes `applywright-recovery-codes.txt` containing all eight and the email, and the page confirms it. |
| 2 | Four ingest paths each store a CV: a real PDF printed by `chrome --print-to-pdf`, a synthesised minimal DOCX (a stored-zip with `word/document.xml`), a PNG read by Tesseract through the `wsl -e` fallback, and pasted text. Each reports its `format`, a `warnings` array (the OCR path carries the "read with OCR" warning), a section split, and the text loads into the editor's fields. The Free one-CV allowance is respected by deleting each CV before the next import. **D1 guard:** on the empty account the score panel does not exist before the paste import, and after it is mounted and usable with no navigation — the failure mode of `1a0b17a`. |
| 3 | Scoring is done from pasted advert text: 57/100 with all five subscores (`keywords 24, structure 100, achievements 20, readability 100, formatting 100`), and a Free report that is provably truncated — three findings on the page and in the JSON out of six, `fullAtsReport.included === false`, `shownFindings < totalFindings`, empty `advice`, and the "part of Pro" lock shown where the advice block would be. The rendered `N / 100` equals the API's score, and the gauge's `aria-label` names both the score and the threshold. |
| 4 | A Free pack is tailored: `mode: "rules"`, `coverLetter === ""` with the lock message in the response, the stored pack and the page; the stored `tailored.coverLetter` is empty too (no back door); the printable CV and screening answers are present; and an independent fact check finds no number outside the CV and no name outside the CV or advert. |
| 4b | The other side of the same gates, with the Pro plan set on the scratch database (the effect a Stripe webhook would have): the analyse response sets `fullAtsReport.included === true`, returns six findings and the advice array, the page renders all six and "What to change first", and the tailor response and stored pack carry a covering letter with no lock. **D3 guard:** the stored letter contains no `,,`, no dangling `At`, names the CV's own employer cleanly (`At Northwind Traders, I …`) and adds no figure the CV does not have. |
| 5 | The editor loads `/editor?cv=<id>`, a section edit marks the document dirty, `Ctrl+S` (real key events over CDP) saves through `PATCH /api/cvs/:id`, the diff lists the added and removed lines, the save state returns to "saved". A proposal is `saved: false`, scoped to the summary, and writes nothing. A fabricated-number instruction ("cut costs by 37% and led 12 engineers at Initech") produces no change, no invented figure and no invented employer, and the refusal is visible. Accepting a valid hunk saves it and the diff updates. |
| 6 | `.md` downloads with the section headings and the CV's facts; the print path builds the print-only sheet and `Page.printToPDF` produces a PDF whose `/MediaBox` is A4 (595.28 × 841.89 pt, within 1 pt); `.docx` downloads with a `PK` signature, opens as a zip with the four parts a Word document needs, and `word/document.xml` carries the CV's facts. **D2 guard:** the Markdown, the DOCX and the print sheet are all headed with the candidate's name ("Ada Lovelace"), the DOCX does not carry the CV record's name as its title, and the three artefacts agree. |
| 7 | The queued pack appears in the applications table, changing its status through the select issues `PATCH /api/applications/:id` and the queue text and row control update. An alert is created, `POST /api/alerts/run` polls the public boards, at least one real notification is created and listed in the alerts inbox, marking it read drops the unread count by exactly one, and the RSS feed serves it without a session. |
| 8 | Sign-out clears the session and lands on `/sign-in`; a recovery code on `/reset` sets a new password; the same code is refused the second time (400); the new password signs in; `/api/auth/me` confirms the account; the old password is refused (401). |
| 9 | With a local OpenAI-compatible stub (a test double, not a model) answering with an invented "37%", the assist route proposes no change, keeps `saved: false`, and names the refused figure in its warnings; with a grounded reply it proposes the change, reports `mode: "model"`, and accepting it saves. |

Every step also fails on any console error, uncaught exception or 4xx/5xx the step did not deliberately
provoke. Two refusals are deliberately provoked in step 8 (a spent code, an old password) and are declared as
expected for that step; everything else that was not 2xx would be a finding. The mechanism is not decorative:
before those two were declared expected, the run failed step 8 on exactly the 400 from `/api/auth/recover` and
the 401 from `/api/auth/login`.

## What could not be exercised, and why

Honest list — none of these is covered by the ledgers above.

1. **Stripe and the payment path.** No `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` on this host, so
   `config.stripe.configured` is false and `POST /api/billing/checkout`, `/api/billing/portal` and
   `/api/billing/webhook` answer 501. **What step 4b does instead:** it sets the plan on the scratch database
   directly, which is the state change a verified webhook would make, and then measures Pro behaviour. So the
   Pro *gates* are exercised in a browser, but the checkout, the signature check, the webhook and the upgrade
   itself are not.
2. **A live model.** No model key is configured, so the product ran its deterministic rules path and `mode` is
   `rules` everywhere in steps 4, 4b and 5. Step 9 exercises the model call path and the grounding gate
   **only through the local OpenAI-compatible stub** — a test double, not a model. It proves the gate rejects
   an invented figure and accepts a grounded rewrite; it says nothing about a real model's wording quality,
   latency, rate limits or failures.
3. **LinkedIn.** By design there is no OAuth or sign-in: the product never fetches LinkedIn. The
   `POST /api/connectors/linkedin` route, the bookmarklet capture (`/bookmarklet`,
   `public/assets/bookmarklet.js`) and the "Paste a LinkedIn profile" drawer were not driven; the journey uses
   file upload and plain paste. No live LinkedIn page was read by this verification.
4. **Email.** This build has no SMTP transport: `POST /api/auth/forgot` only records an operator request
   (`docs/PASSWORD-RECOVERY.md`). The emailed reset-link flow cannot exist here, so only the recovery-code path
   was verified. The operator-issued `?token=` reset page was not exercised either (it needs a token from
   `data/recovery-requests.jsonl`, which the harness does not read).
5. **Quota refusals (402).** The second CV, fourth pack and second alert were never attempted: the import step
   deletes each CV so the Free one-CV allowance is never exceeded, and the journey builds one Free pack + one
   Pro pack and one alert. The 402 copy and upgrade prompts are covered by the unit tests, not here.
6. **The pack-history gate.** Free may read only its newest pack's covering letter. The journey does create a
   second pack, but only after upgrading to Pro, where the gate no longer applies — so the Free "older pack is
   locked" branch is covered by the unit tests only, not by this journey.
7. **The rate limiter.** See the environment note above: the scratch instance raises the ceiling, so a 429 is
   not part of the current ledger. It was observed at the default ceiling earlier and is real.
8. **Layout and theming.** Desktop 1440 × 1000 only, light theme, no reduced-motion emulation. Narrow widths,
   dark mode and zoom are covered by the existing screenshot lanes (`scripts/browser-preview.mjs`,
   `screenshots/`, `docs/design/ACCESSIBILITY-AUDIT.md`). The visual rework that removed the donut is covered
   by its own lane; here it matters only because step 3 reads the gauge.
9. **The OS print dialog and clipboard permissions.** `Page.printToPDF` stands in for the dialog's "Save as
   PDF"; the copy buttons were not clicked (the download buttons were).
10. **The job boards themselves.** Step 7 depends on arbeitnow / remotive / remoteok being reachable and on
    their current content matching a broad keyword; the run reports each source's errors in its notes and fails
    the notification assertion rather than inventing a match. The number of notifications created varies with
    the boards' content, so the assertion is "at least one", not a count.
11. **Tree state.** The authoritative ledger's source line names `f50ef22 + 1 uncommitted path(s)`; that path
    is this document and nothing else. The earlier two runs at `1c94483` carried the other lanes' in-flight
    `server/lib/cv/` edits, which then landed as `f50ef22`. See "The tree the runs actually measured".

## Defects found — all three fixed

**None of the three reproduces at the commit in this record.** Each is a regression trap now rather than a
live bug: the fixed behaviour is **guarded by the assertions named under it**, all of them green in the
current ledger, so a return of the defect fails step 2 (D1), step 6 (D2) or step 4b (D3). The "was" text
below is the historical description of the failure at `1a0b17a`, kept because a bug report is only useful if
the next person can see what went wrong; the repro lines are kept for the same reason, and D3's now prints
the fixed output.

Each was found by this verification at `1a0b17a`, reported with a reproduction, and has since been fixed and
committed.

### D1 — the score panel was missing after the first CV import — fixed in `f6a3913`

Was: `renderCvScreen` only mounted the analyse section when the screen was first rendered with a CV already on
file, so on a new account the first import left no score panel and the library's "Analyse this" button scrolled
to nothing until `/app/cv` was reloaded. Evidence: the `1a0b17a` ledger's step 2 note.

Fixed by "Fix the score panel never mounting after a first CV import": the screen is derived from state
(`renderScreen()`) and re-derived after every mutation (`refreshScreen()`), so the panel mounts in-session.

Guard (step 2): *"the score panel is absent before the first CV is imported"* and *"the score panel is mounted
straight after the first CV import (D1 guard)"* plus *"the score panel has its form ready to use"* — there is no
navigation between the submit and the wait, so a fix that merely reloaded would still fail.

### D2 — the exported DOCX was titled with the CV record's name — fixed in `3f59cee`

Was: `downloadDocx` passed `title: state.cvName`, and `buildDocx` preferred that over `contact.name`, so the
same CV printed headed "Ada Lovelace" and downloaded as a DOCX headed "Pasted CV". Evidence: the `1a0b17a`
ledger's step 6 note.

Fixed by "One heading rule for every CV artefact": `documentTitle()` (contact name → record name →
"Curriculum vitae") is used by the DOCX, the Markdown and the print sheet.

Guard (step 6): *"the Markdown is headed with the candidate's name (D2 guard)"*, *"the Markdown is not headed
with the CV record's name"*, *"the DOCX Heading1 is the candidate's name (D2 guard)"*, *"the DOCX does not
carry the CV record's name as its title"* and *"the DOCX, the Markdown and the print sheet agree on the
heading"*.

### D3 — a Pro covering letter could read "At Northwind Traders,," — fixed in `73e42ec`

Was: `roleFacts` stripped the year range first and then split on `,\s+`, leaving a trailing comma glued to the
employer for the common header `Platform Engineer, Northwind Traders, 2019 to present`; the letter template
then added a second comma. Not reachable on Free, where the covering letter is locked — which is why the fix
needs a Pro step here as well as the unit tests.

Fixed by "Fix trailing punctuation on a parsed employer, and read 'Engineer at Northwind'": separators are
trimmed from every piece and the "<title> at <employer>" shape is read directly.

Guard (step 4b, against the stored Pro covering letter): *"the covering letter never doubles a comma (D3
guard)"*, *"the covering letter never leaves a dangling 'At'"*, *"the covering letter names the CV's own
employer cleanly"* (`At Northwind Traders, I …`) and *"no number in the covering letter is absent from the
CV"*. The fix commit also pins four header shapes in the tailor unit tests; that part is the fix author's
evidence, not this harness — the harness asserts the one header shape in its own fixture CV.

The one-line reproduction used to report D3 still works, and now prints the fixed sentence:

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

prints `At Northwind Traders, I reduced infrastructure cost by 32 percent across 14 services.`

## How the harness is put together

- **No dependencies.** `scripts/e2e-flow.mjs` uses Node's global `WebSocket` for CDP and `fetch` for the HTTP
  fixtures, the same pattern as `scripts/browser-preview.mjs`. Nothing is installed.
- **A scratch instance, never a dev server.** `startServer({ PORT: 0, DATABASE_PATH: temp, dataDir: temp,
  ALERTS_SCAN_MINUTES: 0, ANTHROPIC_ORG_API_KEY: "", MODEL_API_KEY: "", RATE_LIMIT_PER_MINUTE: 100000 })` — an
  empty key set forces the rules path even if the host happens to have keys exported, and the raised limit
  keeps a scripted run from tripping the production 120/min cap.
- **Real UI paths.** Forms are filled and submitted through `requestSubmit()`; files are attached through
  `DataTransfer` into the real `<input type=file>` so the page's own `readFileBase64` and API call run;
  `Ctrl+S` is a real `Input.dispatchKeyEvent` pair; downloads are written by Chrome into a directory the script
  owns and are asserted on their bytes.
- **Two assertions per contract where it matters.** Every contract is checked on the JSON the page used
  (captured from `Network.responseReceived`/`getResponseBody`) *and* on the DOM the page rendered, so a page
  that shows the right thing from the wrong data still fails.
- **Text and ARIA before class names.** The product's drawings are allowed to change (see "When the visual
  work moved…"): the harness reads rendered text and `aria-label` where the claim can be expressed that way,
  and uses a class name only where there is no text equivalent.
- **Defect guards are shaped against the failure.** D1's guard never navigates between the import and the
  assertion; D2's guard compares three artefacts head-to-head; D3's guard reads the covering letter out of the
  stored pack, not out of the DOM, so a rendering accident cannot hide a bad sentence.
- **One direct database write, and only one.** Step 4b calls `store.updateUserPlan(userId, "pro")` on the
  scratch instance to reach the Pro gates without Stripe. Everything else goes through the HTTP API or the UI.
- **Fixtures, not binary assets.** The PDF is printed by a one-shot `chrome --print-to-pdf`; the PNG is a
  one-shot screenshot of an HTML page set large for OCR; the DOCX is a stored-zip built in-process
  (`buildMinimalDocx`). The file's own `%PDF-`, PNG signature and `PK` signature are asserted before upload, so
  a broken fixture fails before it can look like a product failure.
- **Fact checking is independent.** `inventedFacts()` does not import the product's grounding code: it
  re-extracts figures and multi-word proper nouns and compares them with the CV (figures) and the CV plus
  advert (names), one line at a time so a word at the end of one block cannot pair with the start of the next.
  `tests/e2e-static.test.js` proves that helper, the zip writer/reader and the MediaBox reader offline,
  including a PowerShell unzip of the bytes the journey uploads.
- **Failure artefacts.** On failure the script keeps the workdir: a screenshot of the failed step in
  `artifacts/`, plus any downloads and `editor-print.pdf` / `editor-export.docx` / `editor-export.md` from
  step 6. On success everything is removed.

## Related documents

- `docs/EDITOR.md` — the editor's contract (propose, never save; the document is the text).
- `docs/PIPELINE.md` — ingest → score → tailor → pack.
- `docs/PASSWORD-RECOVERY.md` — recovery codes vs. operator-issued reset links.
- `docs/PROJECT-STATUS.md` §9 — Known gaps. For the capability flags it records the **withdrawn** set:
  `apiAccess`, `priorityRefresh` and `bulkExport` were removed from `plans.js` and from the pricing copy
  (nothing implemented them), `FLAG_FEATURES` and `ENFORCED_FLAGS` are now the same three flags —
  `fullAtsReport`, `coverLetter`, `packHistory` — and the in-app billing screen still carries three unreachable
  `FLAG_LABELS` for the withdrawn ones. This document previously described the withdrawn flags as
  "declared-but-unenforced"; that was stale and is corrected here.
- `scripts/browser-preview.mjs` — the screenshot/overflow pass this harness's CDP client is modelled on.
