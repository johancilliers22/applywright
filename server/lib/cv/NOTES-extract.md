# NOTES — `cv/extract.js`

The format comes from the extension first, the MIME type second and the bytes last;
when the bytes disagree with the name, the bytes win and `warnings` says so.
`extractText()` always resolves to `{ text, format, warnings }` and never throws: a
corrupt upload becomes a CV row with a reason, or a 422, never a 500. `format` is one
of `txt md docx odt rtf html pdf image doc unknown`; `doc` means "recognised and
refused", not "read".

| Upload | Route | Works on this machine |
|---|---|---|
| `.txt`, `.md` | decoded in-process (UTF-8, UTF-16 with a BOM) | yes |
| `.docx` | zip central directory + `inflateRawSync` of `word/document.xml` | yes |
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
PDF with no text layer says it is a scan, and now gives advice that actually works:
save the pages as PNG/JPEG and upload those, because OCR is available.

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
tesseract-ocr` in WSL — now appears only when neither route exists. Nothing is faked,
no dependency is added and no cloud service is called.

Paste path: plain text and Markdown stay the recommended route and the dashboard paste
box is the quickest way in. When extraction — OCR especially — gets a heading or a date
wrong, the fix is `PATCH /api/cvs/:id { text }` (`server/app.js`), which re-segments the
profile from the corrected text: editing, not re-uploading.

Known imperfections, deliberately not hidden: HTML ignores `<meta charset>` (UTF-8
unless a BOM is present, and cp1252 pages get replacement characters in `warnings`);
RTF decodes `\'hh` as cp1252 only, so other `\ansicpg` values are wrong; PDF text is
positional, so two-column layouts can interleave and `\cell`-style RTF tables flatten;
scanned PDFs are reported rather than rasterised, so a scan has to be exported as images
to reach OCR; embedded images in DOCX/ODT are not read, and ODT tracked changes are
dropped whole; Zip64 containers are still refused. The 4 MiB cap and the 20 s timeout
are enforced on the extractor, but no test trips them, because no cheap offline fixture
reaches either boundary. The dashboard's file picker (`public/app/app.js:1590`) still
offers only `.txt,.md,.docx,.pdf`, and `docs/SPEC.md:138` still lists the old format
vocabulary — both outside this file's edit surface, so `.odt`/`.rtf`/`.html`/images are
reachable through `POST /api/cvs` but awkward to select in the browser until those two
lines are widened.
