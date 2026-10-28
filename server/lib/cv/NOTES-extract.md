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
| `.png` `.jpg` `.gif` `.bmp` `.tif` `.webp` | `tesseract`, same native-then-WSL order | no — see OCR |
| `.doc` | refused with instructions; never decoded as mojibake | n/a |

PDF is the only ingest path that needs a tool on this box. `pdftotext` is absent from
the Windows PATH but present at `/usr/bin/pdftotext` in WSL, so the fallback is the
route that actually works: the PDF is written to `wsl -e pdftotext - -` on stdin and
the text read back from stdout. The native attempt is kept first (a Windows Poppler
install would be faster), the WSL capability is probed once per process and cached,
the call has a 20 s hard timeout, a 32 MiB pipe ceiling and a 4 MiB text cap, and a
failure names every route tried plus the paste path. Form feeds between pages become
blank lines. A PDF with no text layer says it is a scan and points at OCR.

Proven on this host, not assumed: the test builds a 665-byte PDF with an uncompressed
content stream and asserts `Ada Lovelace` and `Senior Engineer at Acme Payments` come
back with no warnings, and that a repeated call is identical. It first asserts that no
native `pdftotext` is on PATH and that WSL has one, and skips with a printed reason
otherwise, so it can never pass on the strength of a native binary it did not test.

OCR verdict: **not available on this machine**. `tesseract` is on neither the Windows
PATH nor inside WSL, so an image upload returns `format: "image"`, empty text and a
warning naming both routes and the install command —
`winget install UB-Mannheim.TesseractOCR` on Windows, `sudo apt install tesseract-ocr`
in WSL — or the paste box. Nothing is faked, no dependency is added and no cloud
service is called. The command that would run is `tesseract - stdout` with the image
on stdin; that form is unverified here because the binary is absent.

Paste path: plain text and Markdown stay the recommended route and the dashboard paste
box is the quickest way in. When extraction gets a heading or a date wrong, the fix is
`PATCH /api/cvs/:id { text }` (`server/app.js`), which re-segments the profile from the
corrected text — editing, not re-uploading.

Known imperfections, deliberately not hidden: HTML ignores `<meta charset>` (UTF-8
unless a BOM is present, and cp1252 pages get replacement characters in `warnings`);
RTF decodes `\'hh` as cp1252 only, so other `\ansicpg` values are wrong; PDF text is
positional, so two-column layouts can interleave and `\cell`-style RTF tables flatten;
scanned PDFs are reported rather than rasterised for OCR; embedded images in DOCX/ODT
are not read, and ODT tracked changes are dropped whole; Zip64 containers are still
refused. The 4 MiB cap and the 20 s timeout are enforced on the extractor, but no test
trips them, because no cheap offline fixture reaches either boundary. The dashboard's
file picker (`public/app/app.js:1590`) still offers only `.txt,.md,.docx,.pdf`, and
`docs/SPEC.md:138` still lists the old format vocabulary — both outside this file's
edit surface, so `.odt`/`.rtf`/`.html` are reachable through `POST /api/cvs` but
awkward to select in the browser until those two lines are widened.
