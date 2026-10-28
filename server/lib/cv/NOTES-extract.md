# NOTES — `cv/extract.js`

The format comes from the extension first, the MIME type second and the bytes last;
when the bytes disagree with the name, the bytes win and `warnings` says so.
`extractText()` always resolves to `{ text, format, warnings, layout }` and never
throws: a corrupt upload becomes a CV row with a reason, or a 422, never a 500. `format`
is one of `txt md docx odt rtf html pdf image doc unknown`; `doc` means "recognised and
refused", not "read".

| Upload | Route | Works on this machine |
|---|---|---|
| `.txt`, `.md` | decoded in-process (UTF-8, UTF-16 with a BOM) | yes |
| `.docx` | zip central directory + `inflateRawSync` of `word/document.xml`, plus `word/header*.xml` and `word/footer*.xml` | yes |
| `.odt` | same zip reader on `content.xml`; `mimetype` is checked, so a spreadsheet is refused | yes |
| `.rtf` | control words and destination groups stripped in-process | yes |
| `.html`, `.htm` | tags stripped, entities decoded, script/style/title dropped | yes |
| `.pdf` | `pdftotext`, Windows PATH first, then `wsl -e pdftotext - -` | yes, through WSL |
| `.png` `.jpg` `.gif` `.bmp` `.tif` `.webp` | `tesseract`, same native-then-WSL order | yes, through WSL |
| `.doc` | refused with instructions; never decoded as mojibake | n/a |

Two ingest paths need a real tool, and neither tool is on the Windows PATH on this box,
so WSL is the working route: `pdftotext` at `/usr/bin/pdftotext` and `tesseract` at
`/usr/bin/tesseract`. Both files are written to the process on stdin and the text read
back from stdout — `wsl -e pdftotext - -` and `wsl -e tesseract stdin stdout`. The
native Windows attempt is kept first (a Windows install would be faster and needs no
VM), each tool's WSL capability is probed once per process and cached, and every call
has a 20 s hard timeout, a 32 MiB pipe ceiling and a 4 MiB text cap. A failure names
every route tried plus the paste path. Form feeds between pages become blank lines. A
PDF with no text layer says it is a scan, and gives advice that actually works: save the
pages as PNG/JPEG and upload those, because OCR is available.

DOCX is more than one part. `word/document.xml` holds the body, but Word puts a CV's
name, phone, email and links in `word/header1.xml` / `word/footer1.xml` just as often,
and reading the body alone loses that block with no trace. Every `word/header*.xml` and
`word/footer*.xml` entry is therefore read, its text placed in page order (header, body,
footer) and page furniture such as `Page 1 of 2` dropped; a warning names the exact
part(s) that contributed, so the user knows why the name or email appeared. Entry names
decide this, not `document.xml.rels`: nothing else may live at those paths, so no
relationship lookup is needed. Footer-only names are still missed by the segmenter,
which reads a name from the first eight lines — noted below.

Proven on this host, not assumed. The PDF test builds a 665-byte PDF with an
uncompressed content stream and asserts `Ada Lovelace` and `Senior Engineer at Acme
Payments` come back with no warnings and byte-identical on a repeat call. The OCR test
is a real end-to-end read: a hand-built 24-bit BMP with `TEST` drawn from a 5x7 glyph
font goes through `wsl -e tesseract stdin stdout`, and the test requires the word back,
requires the warning to name the WSL route, and requires a blank image to produce no
text at all. Both tests first check the tool really is where they assume (no native
binary, WSL has one) and skip with a printed `#` line *and* an `ℹ SKIP:` diagnostic
otherwise, so neither can pass on the strength of a binary it did not exercise.

OCR verdict: **works, through WSL only** — tesseract 5.3.4 at `/usr/bin/tesseract`,
nothing on the Windows PATH. Routing, argv and the cached probe are covered offline by
injected-runner tests (`setToolOverridesForTesting` in this module is a test seam,
null in production); the live test covers the real read. On a successful read the
upload carries one warning naming the route that ran and the accuracy caveat: OCR
mangles numerals, sometimes merges two headings into one and occasionally invents one,
so numbers and section headings need checking against the original. That caveat is
exactly why `PATCH /api/cvs/:id { text }` and the dashboard editor exist. The honest
refusal — naming both routes and both install commands,
`winget install UB-Mannheim.TesseractOCR` on Windows or `sudo apt install
tesseract-ocr` in WSL — appears only when neither route exists. Nothing is faked, no
dependency is added and no cloud service is called.

Layout is the second thing plain text cannot carry. A table cell, a `<w:cols
w:num="2"/>` section and a `<w:txbxContent>` text box all flatten to spaces, so the
plain text of a two-column CV is indistinguishable from a clean single-column one and
`score.js` was reporting "No layout risks in the plain text" and 10/10 formatting about
a document an ATS reads out of order. Extraction therefore counts those constructs
before flattening — `layout: { tables, columns, textBoxes }`, columns defaulting to 1,
always present, zeros for formats with no layout to lose — and appends a warning naming
what was found. Cell text still arrives; it is its order and shape that cannot be
trusted. ODT (`<table:table>`), RTF (`\trowd`) and HTML (`<table>`) count tables the same
way. `hasLayoutRisk(layout)` is exported as the single predicate for consumers, so the
rule lives in one place. **This signal is not yet consumed by scoring**: `score.js` reads
`cvText` and `profile`, not the extraction result, so a table CV still scores formatting
100/100 with "No layout risks". The upload route returns `warnings`, so the user is told
at import time; docking the marks needs `layout` carried on the profile and one branch
in `score.js` (see the coordination note below).

Paste path: plain text and Markdown stay the recommended route and the dashboard paste
box is the quickest way in. When extraction — OCR especially — gets a heading or a date
wrong, the fix is `PATCH /api/cvs/:id { text }` (`server/app.js`), which re-segments the
profile from the corrected text: editing, not re-uploading.

Known imperfections, deliberately not hidden. DOCX shapes still unhandled or only
partly handled: text box content is counted but also *duplicated* when Word emits both
`mc:Choice` and `mc:Fallback` copies of the shape; `altChunk` (HTML/RTF embedded by
`altChunk`) is ignored entirely because the referenced part is never opened; `.dotx` and
`.docm` open fine as zips but their macro/`vbaProject.bin` parts are simply not read;
SmartArt and charts (`word/charts/*.xml`) hold their labels outside
`word/document.xml` and are lost; `w:instrText` field instructions are dropped, so a
mail-merge style CV loses the field rather than its result; and footnotes/endnotes/
comments are not read, only headers and footers. RTF skips its own header/footer
destinations, so the equivalent RTF defect remains. PDF text is positional, so
two-column PDFs can interleave and are not measured as layout risks at all; scanned PDFs
are reported rather than rasterised, so a scan must be exported as images to reach OCR;
ODT multi-column sections and frames are counted as text boxes but not as columns. HTML
ignores `<meta charset>` (UTF-8 unless a BOM is present, and cp1252 pages get replacement
characters in `warnings`) and CSS `column-count`. RTF decodes `\'hh` as cp1252 only.
Embedded images in DOCX/ODT are not read, ODT tracked changes are dropped whole, and
Zip64 containers are still refused. Footer-only contact names are missed because the
segmenter only looks at the first eight lines for a name. The 4 MiB cap and the 20 s
timeout are enforced on the extractor, but no test trips them, because no cheap offline
fixture reaches either boundary. The dashboard's file picker (`public/app/app.js:1590`)
still offers only `.txt,.md,.docx,.pdf`, and `docs/SPEC.md:138` still lists the old
format vocabulary — both outside this file's edit surface, so `.odt`/`.rtf`/`.html`/
images are reachable through `POST /api/cvs` but awkward to select in the browser.

Coordination note for `score.js` (not edited here, by agreement). Two changes, plus one
in `server/app.js` to carry the signal, because scoring never sees the extraction result:

1. `server/app.js`, upload branch: `const profile = { ...segmentSections(text), layout:
   extracted.layout };` so `profile_json` stores it. The PATCH branch may keep the old
   `cv.profile.layout` if the edit is a correction of the same document.
2. `score.js`: `import { hasLayoutRisk } from "./extract.js";`, then in `measure()` add
   `layout: prof.layout ?? null` to the returned facts, and beside the existing
   `facts.pipeLines.length >= 2 || facts.tabLines > 0` check (the penalty at
   `computeFormatting` and the `layoutRisks`/`formatting-tables-columns` branch in
   `buildFindings`) treat `hasLayoutRisk(facts.layout)` as the same condition — as one
   `||` there, not an extra branch, so a table CV is docked `FORMATTING.table` once, not
   twice.
