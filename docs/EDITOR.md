# The CV editor

`/editor?cv=<id>` is the page where a CV becomes editable text: a section list on the left, the
document in the middle, and the AI agent plus the data sources on the right. It is deliberately
not part of the `/app` single-page bundle — the document is not re-rendered on every keystroke, it
has its own print stylesheet, and its three-pane layout has nothing in common with the library
screen.

| Piece | File |
|---|---|
| Page | `public/editor.html` |
| Layout, paper and print stylesheet | `public/assets/editor.css` |
| Document model, exports and page script | `public/assets/editor.js` |
| Server additions (two routes) | `server/app.js` — `GET /editor`, `POST /api/cvs/:id/assist` |
| Tests | `tests/editor.test.js` |

`public/assets/editor.js` is two modules in one file: everything above the "Browser layer" banner
is pure (no DOM, no network, no clock) and is imported by the browser, by `server/app.js` and by
the test suite. That is intentional — the text the browser saves, the preview the server composes
and the assertions in the tests have to be produced by one implementation, or a save would drift
from the preview. The cost is that the server now depends on a file under `public/`; if that file
moves, the server fails at boot rather than silently rendering a different document.

## 1. Routes

### `GET /editor?cv=<id>`

Serves the page. Nothing is authenticated here — like `/app`, the shell is public and the data is
not: the page calls `GET /api/cvs/:id` with the session cookie and shows an honest state when that
fails.

| Situation | What the page shows |
|---|---|
| `?cv=` missing | "No CV chosen", with a link to the CV library |
| 401 | "Sign in to edit", with `/sign-in?next=/editor?cv=…` |
| 404 | "That CV is not here" (deleted, or another account's id) |
| `profile.sections` missing | "This CV has no sections to edit" and a link to the library. Editing is refused rather than risking a rewrite of the stored text. |
| loaded | The three panes. The first save writes the reconstructed text; see §2. |

The CV library does not link here yet: `public/app/app.js` is outside this change's write scope.
The page links *back* to the library, and the URL is stable enough to bookmark. A one-line
`<a href="/editor?cv=…">` in the library's card actions is the follow-up.

### `POST /api/cvs/:id/assist`

The assistant. Proposes; never saves. Requires a session; the CV must belong to the caller.

Request:

```json
{ "instruction": "Make the summary shorter and plainer, and keep the phrase \"analytical engine\".",
  "scope": "summary" }
```

| Field | Rules |
|---|---|
| `instruction` | string, 3–500 characters. Free text; the vocabulary it understands is `lib/cv/refine.js`'s. |
| `scope` | optional, one of `cv` (default), `summary`, `experience`, `education`, `skills`, `other`. Anything else is `400 invalid_request`. |

Response (`200`):

```json
{
  "cvId": "cv_…",
  "scope": "summary",
  "mode": "rules",
  "proposed": {
    "text": "Ada Lovelace\nada@example.com\n…",
    "sections": { "summary": "…", "experience": "…", "education": "…", "skills": "…", "other": "" }
  },
  "changes": [
    { "field": "summary", "section": "summary",
      "before": "Analytical engine programmer … non-specialists.",
      "after": "Analytical engine programmer … to her name.",
      "why": "shorter: kept 1 of 3 sentences and dropped 2 without a figure" }
  ],
  "rejected": [],
  "warnings": ["no change was needed for: plainer wording"],
  "saved": false,
  "advisory": "This is a proposal and nothing has been saved. …"
}
```

- `changes` are the proposals the page offers as accept/reject hunks. Each carries the section it
  belongs to, the exact `before` text and the `after` text, so the page applies it by replacing
  that text and nothing else.
- `rejected` holds proposals that were refused, with `reasons`. Two things land here: a change that
  failed the grounding check, and a change to a field that is not part of this CV (for example a
  cover letter, which `refine` always offers and a CV document has no place for).
- Changes outside the requested `scope` are dropped rather than listed as refusals — being shown
  four bullet edits after asking for the summary is noise, not information.
- `mode` is `model` when the server has a model configured and its reply survived validation, else
  `rules` (deterministic rules in `lib/cv/refine.js`).
- `warnings` is `refine`'s own report: unmatched instructions, intents that made no difference, and
  model edits that were reverted. The page shows them under "What the refinement reported".
- `saved` is always `false`. The route writes nothing: no CV update, no usage row, no report.

Errors: `401 unauthorized`, `404 not_found` (unknown id or another account's CV), `400
invalid_request` (short instruction, unknown scope), `422` is not used here.

### Endpoints the page reuses

| Route | Used for |
|---|---|
| `GET /api/cvs/:id` | load the document |
| `PATCH /api/cvs/:id` `{ text }` | save; the server re-segments and returns the canonical `profile` |
| `POST /api/connectors/linkedin` `{ text }` | parse a pasted profile |
| `POST /api/cvs/from-profile` `{ profile }` | optional: create a *separate* CV from a parsed profile (counts against the CV quota) |
| `POST /api/analyse` `{ cvId, jobText }` | keyword coverage for a pasted advert |

## 2. The document model

A CV is stored as one text field. The editor is a structured *view* over it:

```
Ada Lovelace
ada@example.com
Phone: +44 7700 900456
linkedin.com/in/ada

Summary
…

Experience
Programmer, Analytical Engine, 1843-1850
- Wrote the first published algorithm for the analytical engine, 1843.

Education
…

Skills
…

Other
…
```

- Contact lines come first, then one recognised heading per non-empty section, in the order
  summary, experience, education, skills, other. All five headings are aliases
  `segmentSections` recognises, so the text reads back into the same five sections.
- **The round-trip is a fixed point.** `reconstructCvText(documentFromProfile(segmentSections(x)))`
  re-segments to the same document; the test suite asserts it across CVs with headings, with no
  headings, with a UK national number, and with a phone number that `segmentSections` had also
  copied into a section. Without that property, saving one word would shuffle the whole CV.
- **Two normalisations on the first save.** They are the price of a stable round-trip, and both are
  visible in the diff the page shows:
  1. A phone number is written with a `Phone:` label (or kept exactly as it is if it already has
     one). `cv/extract.js` only treats a line as contact when it carries an email, a URL or a phone
     label, so a bare number would fall out of the contact block and reappear inside `Other`.
  2. A contact line that `segmentSections` had also placed inside a section is removed from that
     section, because the contact block now prints it once.

  The save diff is measured against the **stored** text, not against the page's own baseline, so
  the normalisation appears in it instead of happening silently. (The baseline is still what decides
  whether there is anything to save, which is why pressing Save with no edits does nothing.)
- Loading a CV does **not** rewrite it. The baseline is what the page would write; pressing Save
  with no edits is a no-op, and the stored text is only replaced once something has actually
  changed.
- The page sends the whole reconstructed text on every save and re-reads the sections from the
  server's response. If the server's re-segmentation of the saved text ever differs from the
  sections on screen, the page says so instead of pretending.

## 3. Keyboard

| Keys | Action |
|---|---|
| `⌘/Ctrl + S` | Save. Works from any field, including the textareas. |
| `⌘/Ctrl + Enter` | Ask for a proposal (from the instruction box). |
| `Tab` / `Shift + Tab` | Move through the section list, the fields, the instruction, and each hunk's Accept/Reject buttons. |
| `Enter` / `Space` | Activate the focused button; a section-list link moves focus to that section's heading. |

Accepting a hunk is one button press; the focus then moves to the next undecided hunk, and to the
instruction box when every hunk is decided. Nothing is applied without that press, and a hunk that
has been decided cannot be pressed again. An unsaved document warns before the tab closes.

## 4. What each export produces

**One heading rule, in one place.** `documentTitle()` — exported by `public/assets/editor.js` —
decides the heading for every artefact: the candidate's name from the contact block, then the CV
record's name, then "Curriculum vitae". The print sheet, the Markdown export and the DOCX export all
call it, so a CV record called "Pasted CV" whose contact block says "Ada Lovelace" cannot export a
file headed "Pasted CV". The page's own header still shows the record's name, because that is the
library label for the CV, not the document's heading.

### Download .md

`markdownFor()`: one `#` heading from `documentTitle()`, a contact line joined with `·`, one `##`
per non-empty section, bullets as `- ` list items, other lines as paragraphs. Plain Markdown, no
HTML, single column. Filename: the CV record name slugified, e.g. `ada-cv.md`.

### Print / PDF

`window.print()` against a print-only sheet (`#ed-print-doc`) that the page builds at click time:
`h1` from `documentTitle()`, contact line, `h2` per section, `ul`/`li` for bullets, `p` for role
lines. The stylesheet mirrors `server/lib/packs/build.js`: `@page { size: A4; margin: 18mm }`, 10.5pt
body, 11pt section headings with a hairline, `break-inside: avoid` on headings and list items, and
every other element on the page hidden. It prints the light palette even when the screen is dark.
For a PDF file, use the browser's "Save as PDF" in the print dialogue; no PDF is generated on the
server.

### Download .docx

`buildDocx()` writes the zip in the browser: five stored (uncompressed) entries —
`[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/_rels/document.xml.rels`,
`word/styles.xml` — with a CRC-32 per entry and a fixed timestamp, so the same CV exports a
byte-identical file. The document is A4 with 18 mm margins, single column, no tables and no
numbering part: the heading is `documentTitle()` as a real `Heading 1`, each section heading a real
`Heading 2` (both defined in `word/styles.xml` with outline levels), and bullets are literal `- `
text, which every ATS reads. Filename: `ada-cv.docx` (from the record name — a filename may differ
from the heading; the heading is what the employer reads).

Verified structurally in `tests/editor.test.js` (zip central directory, CRC recomputation, XML
shape) and by opening an exported file with `python-docx` 1.2.0: 210 × 297 mm, 18 mm margins, one
`Heading 1`, four `Heading 2`, zero tables. It has not been opened in Microsoft Word itself.

## 5. Add data from sources

Nothing on the page is fetched for the user. Each source is text they paste or a file they pick.

- **Paste a LinkedIn profile.** `POST /api/connectors/linkedin` parses the paste and the page shows
  what was read — name, headline, role count, education count, skill count, confidence, warnings.
  Each section that has content becomes a checkbox: ticked by default when the section in this CV is
  empty, unticked (with the word count) when appending could duplicate a role. "Add the ticked
  sections and save" merges into the open document and saves it; empty contact fields are filled in,
  nothing is overwritten. "Create a separate CV instead" goes through
  `POST /api/cvs/from-profile` and respects the plan's CV quota (a 402 is explained in place).
  The copy states plainly that LinkedIn is never signed in to, has no OAuth, and is never fetched.
- **Paste an advert.** `POST /api/analyse` runs the same rubric as the CV library and the page
  shows keyword coverage (covered tags, missing tags), the rubric score out of 100 and the top
  three findings, followed by the server's own advisory text. This *does* store an analysis report
  against the CV, exactly as the library screen does — the page says so.
- **Upload a file.** Deep-links to `/app/cv?import=1#cv-ingest`, the existing ingest drawer, where a
  new CV is created. This page edits a CV that already exists, so it does not grow a second upload
  form.

## 6. Accessibility and layout

- Every field has a `<label>`; the section textareas are labelled for screen readers only (`sr-only`)
  because the visible heading names them. The skip link, focus rings and dark scheme come from
  `tokens.css` / `theme.css` / `site.css`.
- States are words, not colours: "saved 14:32", "unsaved changes", "not saved". Proposals are a
  list of hunks with their own Accept/Reject buttons; the diff marks additions and removals with a
  glyph and a background, not only a colour.
- Two polite live regions: `#ed-status` announces saves and acceptances, `#ed-assist-state` carries
  the proposal status. The diff panel and the rail are ordinary regions, not focus traps.
- Three panes at 1440 (200px / fluid / 400px), section list across the top and document plus rail at
  768, one column at 375. Measured with no horizontal overflow at all three widths, in Chrome, in
  both schemes.
- The document fields are auto-sized to their text, so the page reads as a document rather than a
  form.

## 7. Honest limits

1. **The library does not link here yet** (`public/app/app.js` is outside the write scope). The URL
   is `/editor?cv=<id>`.
2. **The assistant cannot edit the contact block.** A name, an email and a phone number are facts;
   `scope` has no `contact` value and the request is refused with 400.
3. **Precision varies by section.** Experience is edited bullet by bullet (a line that starts with
   `-`, `*` or a number). Education, skills and other are edited as one block, because a line there
   is usually a qualification or a list rather than a claim.
4. **The grounding check can refuse a good rewrite.** A proposal may not introduce a number,
   employer, job title, qualification or date, and may not *drop* a figure the original states. A
   model that shortens by deleting a percentage is rejected; the rules path then applies its own
   deterministic edit, or nothing.
5. **The rules path is narrow.** With no model configured it only understands the vocabulary in
   `lib/cv/refine.js` (shorter, longer, formal, plainer, senior, junior, technical, less jargon,
   first/third person, UK/US spelling, quoted wording). An instruction outside it returns no
   changes and a warning that names what it does understand.
6. **One save normalises the document** — canonical headings, section order, the `Phone:` label and
   the removed contact duplicate (§2). The diff shows it before anything else happens.
7. **Two tabs will fight.** There is no optimistic-concurrency token; the last save wins. The page
   reloads the canonical sections after every save, and refuses a hunk whose `before` text is no
   longer in the section.
8. **No undo stack of its own.** Undo is the browser's textarea undo until you save. After a save,
   the diff is the record.
9. **DOCX is generated in the browser**, so it is plain by design: no images, no tables, no columns,
   no list numbering (literal `- ` bullets). It is the ATS-safe artefact, not a design deliverable.
10. **Print is the browser's dialogue.** Page size comes from the stylesheet (`A4`, 18 mm), but
    margin and header/footer options in the dialogue can still override what the user sees.
11. **The advert check measures the *saved* CV.** If there are unsaved edits the page saves first and
    says so; if that save fails, no measurement is run rather than measuring stale text.

## 8. Verification ledger

Run from `projects/applywright` on 28 October 2026:

| Check | Command | Result |
|---|---|---|
| Unit and HTTP tests | `node --test tests/` | **141 tests, 141 pass, 0 fail** (29 of them in `tests/editor.test.js`) |
| Static self-check | `node scripts/check.js` | **10 pages, 24 server modules, 247 css classes — 0 errors, 0 warnings** |
| Editor in a real browser | headless Chrome over CDP (scratch server, ephemeral port, temp database) | **65/65 checks** — load, edit, `Ctrl+S`, diff, propose, reject-free accept, LinkedIn parse, advert coverage, `.md`, `.docx`, print sheet, `Page.printToPDF` A4, 1440/768/375 with no horizontal overflow, no console errors, light and dark schemes, the three error states |
| Export heading (`documentTitle`) | headless Chrome over CDP, CV record "Pasted CV" / contact "Ada Lovelace" | **15/15 checks** — the DOCX, the Markdown and the print sheet are all headed "Ada Lovelace"; the page header keeps "Pasted CV"; the DOCX bytes contain no "Pasted CV"; no console errors |
| Exported DOCX | `python-docx` 1.2.0 | opens; 210 × 297 mm, 18 mm margins, `Heading 1` = the candidate's name, 4 `Heading 2`, 0 tables |

The browser pass is not in the repository: it needs a Chrome install and a scratch server. The
behaviour it covers is asserted at the HTTP and pure-function level in `tests/editor.test.js`, which
is what runs in CI.
