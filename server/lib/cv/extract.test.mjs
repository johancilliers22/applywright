import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { crc32, deflateRawSync } from "node:zlib";

import { detectFormat, docxToText, extractText, segmentSections, setToolOverridesForTesting } from "./extract.js";

// ---------------------------------------------------------------------------
// A hand-written zip, so the DOCX fixture is a real OOXML package rather than a
// mock of one. Everything here follows the PKZIP 2.0 layout: local headers,
// central directory, end-of-central-directory.
// ---------------------------------------------------------------------------

function zipPart(name, data, { store = false } = {}) {
  const nameBuffer = Buffer.from(name, "utf8");
  const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const compressed = store ? raw : deflateRawSync(raw);
  return {
    nameBuffer,
    raw,
    compressed,
    method: store ? 0 : 8,
    crc: crc32(raw),
  };
}

function buildZip(parts) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const part of parts) {
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(part.method, 8);
    local.writeUInt16LE(0, 10); // modification time
    local.writeUInt16LE(0x21, 12); // modification date: 1980-01-01
    local.writeUInt32LE(part.crc, 14);
    local.writeUInt32LE(part.compressed.length, 18);
    local.writeUInt32LE(part.raw.length, 22);
    local.writeUInt16LE(part.nameBuffer.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    localChunks.push(local, part.nameBuffer, part.compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(part.method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(part.crc, 16);
    central.writeUInt32LE(part.compressed.length, 20);
    central.writeUInt32LE(part.raw.length, 24);
    central.writeUInt16LE(part.nameBuffer.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, part.nameBuffer);

    offset += 30 + part.nameBuffer.length + part.compressed.length;
  }

  const localBuffer = Buffer.concat(localChunks);
  const centralBuffer = Buffer.concat(centralChunks);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // central directory disk
  eocd.writeUInt16LE(parts.length, 8);
  eocd.writeUInt16LE(parts.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(localBuffer.length, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localBuffer, centralBuffer, eocd]);
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>Ada Lovelace</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">She said &quot;ship it&quot; &amp; then left \u2014 the tab</w:t><w:tab/><w:t>here.</w:t></w:r></w:p>
<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p>
<w:p><w:r><w:t>Fran&#231;ois &apos;F!&apos; O&apos;Brien</w:t></w:r></w:p>
<w:p><w:del w:id="1"><w:r><w:delText>Old title</w:delText></w:r></w:del><w:r><w:t>Current title</w:t></w:r></w:p>
<w:p><w:r><w:instrText>HYPERLINK "https://example.com"</w:instrText><w:t>Portfolio</w:t></w:r></w:p>
<w:p><w:r><w:tab/><w:t>Skills</w:t></w:r></w:p>
<w:p><w:r><w:t>JavaScript, Node.js, SQL</w:t></w:r></w:p>
</w:body>
</w:document>`;

function buildDocx({ store = false, withDocument = true } = {}) {
  const parts = [
    zipPart("[Content_Types].xml", CONTENT_TYPES, { store }),
    zipPart("_rels/.rels", ROOT_RELS, { store }),
  ];
  if (withDocument) parts.push(zipPart("word/document.xml", DOCUMENT_XML, { store }));
  return buildZip(parts);
}

// ---------------------------------------------------------------------------
// A hand-written single-page PDF with real text in an uncompressed content
// stream, built here rather than committed as a fixture, so the PDF test is
// deterministic and needs no PDF-writing library.
// ---------------------------------------------------------------------------

function buildPdf(lines) {
  const escape = (value) => String(value).replace(/[\\()]/g, (character) => `\\${character}`);
  const content = [
    "BT",
    "/F1 16 Tf",
    "72 720 Td",
    ...lines.flatMap((line, index) => (index === 0 ? [] : ["0 -24 Td"]).concat([`(${escape(line)}) Tj`])),
    "ET",
    "",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// ---------------------------------------------------------------------------
// Host capability probes. The PDF fallback and OCR tests are skipped, with a
// reason, on a machine that cannot exercise them, so the suite stays green
// everywhere while still proving the WSL route on this one.
// ---------------------------------------------------------------------------

/** Is this binary a file on the current PATH? Checks file presence only. */
function nativeBinaryOnPath(name) {
  const pathValue = process.env.PATH ?? process.env.Path ?? "";
  const extensions =
    process.platform === "win32" ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      try {
        if (statSync(join(directory, name + extension)).isFile()) return true;
      } catch {
        // Not in this directory.
      }
    }
  }
  return false;
}

/** Run a probe command quietly and report whether it succeeded. */
function probeSucceeds(binary, args) {
  const result = spawnSync(binary, args, {
    input: Buffer.alloc(0),
    encoding: "utf8",
    timeout: 20_000,
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

// ---------------------------------------------------------------------------
// ODT fixture: a real OpenDocument text package (stored mimetype + content.xml)
// ---------------------------------------------------------------------------

const ODT_MIMETYPE = "application/vnd.oasis.opendocument.text";

const ODT_CONTENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">
<office:body><office:text>
<text:h text:outline-level="1">Ada Lovelace</text:h>
<text:p>Mathematician &amp; writer<text:s text:c="3"/>based in London.</text:p>
<text:p>Skills: <text:span text:style-name="T1">JavaScript</text:span>, SQL<text:tab/>AWS</text:p>
<text:p>Line one<text:line-break/>Line two</text:p>
<text:p>Fran&#231;ois O&apos;Brien</text:p>
<table:table><table:table-row><table:table-cell><text:p>2021 - 2024</text:p></table:table-cell><table:table-cell><text:p>Senior Engineer</text:p></table:table-cell></table:table-row></table:table>
</office:text></office:body>
</office:document-content>`;

function buildOdt({ mimetype = ODT_MIMETYPE, content = ODT_CONTENT_XML } = {}) {
  const parts = [zipPart("mimetype", mimetype, { store: true })];
  if (content !== null) parts.push(zipPart("content.xml", content));
  return buildZip(parts);
}

// ---------------------------------------------------------------------------
// RTF fixture: fonts, colours, an ignorable destination, a field, cp1252
// escapes, a unicode escape, escaped braces and \par/\tab formatting.
// ---------------------------------------------------------------------------

const RTF_CV = String.raw`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\froman Times New Roman;}}
{\colortbl;\red0\green0\blue0;}
{\*\generator Riched20 10.0.19041;}\viewkind4\uc1\pard\f0\fs22 Ada Lovelace\par
She said \'93ship it\'94 and then left.\par
Skills\tab JavaScript, SQL, AWS\par
Fran\'e7ois O\'92Brien \u8212? and a brace \{here\}\par
{\field{\*\fldinst{HYPERLINK "https://example.com"}}{\fldrslt{Portfolio}}}\par
}`;

// ---------------------------------------------------------------------------
// HTML fixture: the shape a "save as web page" export has, including markup that
// must not be read as CV text.
// ---------------------------------------------------------------------------

const HTML_CV = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Ada Lovelace CV</title>
<style>body { font-family: serif; }</style><script>console.log("nope")</script></head>
<body>
<h1>Ada Lovelace</h1>
<p>Mathematician &amp; writer.<br>Based in London.</p>
<ul><li>Built a difference engine</li><li>Wrote the 1843 notes</li></ul>
<table><tr><td>2021 - 2024</td><td>Senior Engineer</td></tr></table>
<p>Email: ada@example.com &nbsp;|&nbsp; +44 7700 900123</p>
</body></html>`;

// ---------------------------------------------------------------------------
// Image fixtures. A PNG header is enough for the routing tests; the live OCR
// test needs a real decodable image, so it gets a hand-built 24-bit BMP with
// blocky glyphs drawn from a 5x7 font — no encoder, no dependency, no fixture.
// ---------------------------------------------------------------------------

const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

const GLYPHS_5X7 = {
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
};

/** Uncompressed 24-bit BMP, white by default, black where `isBlack` says so. */
function buildBmp({ width, height, isBlack = () => false }) {
  const rowBytes = (width * 3 + 3) & ~3;
  const size = 54 + rowBytes * height;
  const buffer = Buffer.alloc(size, 0);
  buffer.write("BM", 0, "latin1");
  buffer.writeUInt32LE(size, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(rowBytes * height, 34);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = isBlack(x, y) ? 0x00 : 0xff;
      const at = 54 + (height - 1 - y) * rowBytes + x * 3;
      buffer[at] = value;
      buffer[at + 1] = value;
      buffer[at + 2] = value;
    }
  }
  return buffer;
}

/** Render a short uppercase word large enough for Tesseract to read. */
function buildWordBmp(word, { scale = 14, padding = 20 } = {}) {
  const glyphWidth = 8 * scale;
  const glyphHeight = 7 * scale;
  return buildBmp({
    width: padding * 2 + word.length * glyphWidth,
    height: padding * 2 + glyphHeight,
    isBlack: (x, y) => {
      const gx = x - padding;
      const gy = y - padding;
      if (gx < 0 || gy < 0 || gy >= glyphHeight) return false;
      const index = Math.floor(gx / glyphWidth);
      if (index >= word.length) return false;
      const glyph = GLYPHS_5X7[word[index]];
      if (!glyph) return false;
      const column = Math.floor((gx - index * glyphWidth) / scale);
      const row = Math.floor(gy / scale);
      if (column > 4 || row > 6) return false;
      return glyph[row][column] === "1";
    },
  });
}

// ---------------------------------------------------------------------------
// detectFormat
// ---------------------------------------------------------------------------

test("detectFormat reads extensions first and MIME types second", () => {
  assert.equal(detectFormat("cv.txt", ""), "txt");
  assert.equal(detectFormat("CV.MD", "text/plain"), "md");
  assert.equal(detectFormat("cv.markdown", undefined), "md");
  assert.equal(
    detectFormat("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "docx"
  );
  assert.equal(detectFormat("cv.pdf", "application/pdf"), "pdf");
  assert.equal(detectFormat("cv", "text/plain"), "txt");
  assert.equal(detectFormat("cv", "application/pdf"), "pdf");
  assert.equal(detectFormat("", "text/markdown; charset=utf-8"), "md");
  assert.equal(detectFormat(null, null), "unknown");
  assert.equal(detectFormat(undefined, "application/octet-stream"), "unknown");

  // Legacy binary Word is detected so it can be refused with instructions.
  assert.equal(detectFormat("cv.doc", "application/msword"), "doc");
  assert.equal(detectFormat("cv.DOC"), "doc");

  // The formats added alongside the OCR path.
  assert.equal(detectFormat("cv.odt"), "odt");
  assert.equal(detectFormat("cv", "application/vnd.oasis.opendocument.text"), "odt");
  assert.equal(detectFormat("cv.rtf"), "rtf");
  assert.equal(detectFormat("cv", "application/rtf"), "rtf");
  assert.equal(detectFormat("cv.html"), "html");
  assert.equal(detectFormat("cv.HTM"), "html");
  assert.equal(detectFormat("cv", "text/html; charset=utf-8"), "html");
  assert.equal(detectFormat("scan.png"), "image");
  assert.equal(detectFormat("scan.JPG"), "image");
  assert.equal(detectFormat("scan.jpeg", "application/octet-stream"), "image");
  assert.equal(detectFormat("scan.tiff"), "image");
  assert.equal(detectFormat("scan.webp"), "image");
  assert.equal(detectFormat("scan.bmp"), "image");
  assert.equal(detectFormat("scan.gif"), "image");
  assert.equal(detectFormat("scan", "image/png"), "image");
});

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

test("docxToText keeps quoted text, entities, tabs and paragraph breaks", async () => {
  const buffer = buildDocx();
  const text = docxToText(buffer);

  assert.ok(text.startsWith("Ada Lovelace"), `unexpected start: ${JSON.stringify(text.slice(0, 40))}`);
  assert.ok(text.includes('She said "ship it" & then left \u2014 the tab here.'), "quoted text and entities were not preserved");
  assert.ok(text.includes("Line one\nLine two"), "a <w:br/> did not become a line break");
  assert.ok(text.includes("Fran\u00e7ois 'F!' O'Brien"), "numeric or apostrophe entities were not decoded");
  assert.ok(text.includes("Current title"), "live text was lost");
  assert.ok(!text.includes("Old title"), "tracked deletion text leaked into the CV");
  assert.ok(!text.includes("HYPERLINK"), "field instructions leaked into the CV");
  assert.ok(!text.includes("<w:"), "XML tags leaked into the CV");
  assert.ok(!text.includes("&amp;"), "entities were not decoded");

  const result = await extractText({ buffer, filename: "cv.docx", mime: "application/octet-stream" });
  assert.equal(result.format, "docx");
  assert.equal(result.text, text);
  assert.deepEqual(result.warnings, []);
  assert.equal(docxToText(buffer), text, "DOCX extraction is not deterministic");
});

test("docxToText also reads stored (uncompressed) zip entries", () => {
  const text = docxToText(buildDocx({ store: true }));
  assert.ok(text.includes('She said "ship it"'));
  assert.ok(!text.includes("Old title"));
});

test("extractText explains a DOCX with no word/document.xml", async () => {
  const buffer = buildDocx({ withDocument: false });
  assert.equal(docxToText(buffer), "");

  const result = await extractText({ buffer, filename: "cv.docx" });
  assert.equal(result.format, "docx");
  assert.equal(result.text, "");
  assert.ok(result.warnings.some((warning) => warning.includes("word/document.xml")));
});

test("extractText explains a truncated DOCX without throwing", async () => {
  const buffer = buildDocx();
  const truncated = buffer.subarray(0, buffer.length - 10);
  const result = await extractText({ buffer: truncated, filename: "cv.docx" });
  assert.equal(result.format, "docx");
  assert.equal(result.text, "");
  assert.ok(result.warnings.some((warning) => warning.includes("end-of-central-directory")));
});

test("a text file named .docx is read as text, with a warning", async () => {
  const result = await extractText({ buffer: Buffer.from("Ada Lovelace\nada@example.com"), filename: "cv.docx" });
  assert.equal(result.format, "txt");
  assert.equal(result.text, "Ada Lovelace\nada@example.com");
  assert.ok(result.warnings.some((warning) => warning.includes("not a zip archive")));
});

// ---------------------------------------------------------------------------
// ODT (zip + OpenDocument text)
// ---------------------------------------------------------------------------

test("an ODT keeps paragraph breaks, spans, tabs and entity text", async () => {
  const result = await extractText({ buffer: buildOdt(), filename: "cv.odt", mime: ODT_MIMETYPE });

  assert.equal(result.format, "odt");
  assert.deepEqual(result.warnings, [], `unexpected warnings: ${JSON.stringify(result.warnings)}`);
  assert.ok(result.text.startsWith("Ada Lovelace"), `unexpected start: ${JSON.stringify(result.text.slice(0, 40))}`);
  assert.ok(result.text.includes("Mathematician & writer based in London."), "paragraph text or entities were lost");
  assert.ok(result.text.includes("Skills: JavaScript, SQL AWS"), "spans, tabs or <text:s> runs were mishandled");
  assert.ok(result.text.includes("Line one\nLine two"), "a <text:line-break/> did not become a line break");
  assert.ok(result.text.includes("Fran\u00e7ois O'Brien"), "numeric or apostrophe entities were not decoded");
  assert.ok(result.text.includes("2021 - 2024"), "table cell text was lost");
  assert.ok(result.text.includes("Senior Engineer"), "table cell text was lost");
  assert.ok(!result.text.includes("<text:"), "XML tags leaked into the CV");
  assert.ok(!result.text.includes("&amp;"), "entities were not decoded");

  const again = await extractText({ buffer: buildOdt(), filename: "cv.odt" });
  assert.equal(again.text, result.text, "ODT extraction is not deterministic");
});

test("an ODT named .docx is read as an ODT, with a warning", async () => {
  const result = await extractText({ buffer: buildOdt(), filename: "cv.docx" });
  assert.equal(result.format, "odt");
  assert.ok(result.text.includes("Ada Lovelace"));
  assert.ok(result.warnings.some((warning) => warning.includes("OpenDocument")));
});

test("an OpenDocument text package with no mimetype entry is read with a warning", async () => {
  const buffer = buildZip([zipPart("content.xml", ODT_CONTENT_XML)]);
  const result = await extractText({ buffer, filename: "cv.odt" });
  assert.equal(result.format, "odt");
  assert.ok(result.text.includes("Ada Lovelace"));
  assert.ok(result.warnings.some((warning) => warning.includes("mimetype")));
});

test("an OpenDocument spreadsheet is refused rather than read as a CV", async () => {
  const buffer = buildOdt({ mimetype: "application/vnd.oasis.opendocument.spreadsheet" });
  const result = await extractText({ buffer, filename: "cv.ods" });
  assert.equal(result.format, "odt");
  assert.equal(result.text, "");
  assert.ok(
    result.warnings.some((warning) => warning.includes("not a text document")),
    `warnings were ${JSON.stringify(result.warnings)}`
  );
});

test("a zip holding neither document part is explained, not guessed at", async () => {
  const buffer = buildZip([zipPart("hello.txt", "not a CV")]);
  const result = await extractText({ buffer, filename: "cv.odt" });
  assert.equal(result.text, "");
  assert.ok(result.warnings.some((warning) => warning.includes("content.xml")));
  assert.ok(result.warnings.some((warning) => warning.includes("word/document.xml")));
});

// ---------------------------------------------------------------------------
// RTF
// ---------------------------------------------------------------------------

test("RTF keeps the words and drops fonts, colours, fields and control words", async () => {
  const result = await extractText({ buffer: Buffer.from(RTF_CV, "latin1"), filename: "cv.rtf", mime: "application/rtf" });

  assert.equal(result.format, "rtf");
  assert.deepEqual(result.warnings, [], `unexpected warnings: ${JSON.stringify(result.warnings)}`);
  assert.ok(result.text.startsWith("Ada Lovelace"), `unexpected start: ${JSON.stringify(result.text.slice(0, 40))}`);
  assert.ok(result.text.includes("She said \u201cship it\u201d and then left."), "cp1252 escapes were decoded wrongly");
  assert.ok(result.text.includes("Skills JavaScript, SQL, AWS"), "\\tab did not become a space");
  assert.ok(result.text.includes("Fran\u00e7ois O\u2019Brien \u2014 and a brace {here}"), "escaping was mishandled");
  assert.ok(result.text.includes("Portfolio"), "the visible text of a field was lost");
  assert.ok(!result.text.includes("HYPERLINK"), "field instructions leaked into the CV");
  assert.ok(!result.text.includes("Times New Roman"), "the font table leaked into the CV");
  assert.ok(!result.text.includes("fonttbl"), "control words leaked into the CV");
  assert.ok(!result.text.includes("Riched20"), "an ignorable destination leaked into the CV");
  assert.ok(!result.text.includes("\\par"), "control words leaked into the CV");
});

test("a .doc that is really RTF is read as RTF", async () => {
  const result = await extractText({ buffer: Buffer.from(RTF_CV, "latin1"), filename: "cv.doc", mime: "application/msword" });
  assert.equal(result.format, "rtf");
  assert.ok(result.text.includes("Ada Lovelace"));
  assert.ok(result.warnings.some((warning) => warning.includes("RTF")));
});

test("a text file named .rtf is read as text, with a warning", async () => {
  const result = await extractText({ buffer: Buffer.from("Ada Lovelace\nEngineer"), filename: "cv.rtf" });
  assert.equal(result.format, "txt");
  assert.equal(result.text, "Ada Lovelace\nEngineer");
  assert.ok(result.warnings.some((warning) => warning.includes("plain text")));
});

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

test("HTML is stripped to its text, with scripts, styles and the title dropped", async () => {
  const result = await extractText({ buffer: Buffer.from(HTML_CV), filename: "cv.html", mime: "text/html" });

  assert.equal(result.format, "html");
  assert.deepEqual(result.warnings, [], `unexpected warnings: ${JSON.stringify(result.warnings)}`);
  assert.ok(result.text.startsWith("Ada Lovelace"), `unexpected start: ${JSON.stringify(result.text.slice(0, 40))}`);
  assert.ok(result.text.includes("Mathematician & writer."), "entities or paragraph text were lost");
  assert.ok(result.text.includes("Based in London."), "a <br> did not become a line break");
  assert.ok(result.text.includes("Built a difference engine"), "list item text was lost");
  assert.ok(result.text.includes("Wrote the 1843 notes"), "list item text was lost");
  assert.ok(result.text.includes("2021 - 2024") && result.text.includes("Senior Engineer"), "table text was lost");
  assert.ok(result.text.includes("ada@example.com"), "contact text was lost");
  assert.ok(!result.text.includes("<"), "a tag leaked into the CV");
  assert.ok(!result.text.includes("&amp;"), "entities were not decoded");
  assert.ok(!result.text.includes("console.log"), "a script leaked into the CV");
  assert.ok(!result.text.includes("font-family"), "a stylesheet leaked into the CV");
});

test("a page saved as .txt is read as HTML, with a warning", async () => {
  const result = await extractText({ buffer: Buffer.from(HTML_CV), filename: "cv.txt" });
  assert.equal(result.format, "html");
  assert.ok(result.text.includes("Ada Lovelace"));
  assert.ok(result.warnings.some((warning) => warning.includes("HTML")));
});

// ---------------------------------------------------------------------------
// Legacy binary Word
// ---------------------------------------------------------------------------

test("a legacy binary .doc is refused with a clear next step", async () => {
  const ole2 = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(512),
  ]);
  const result = await extractText({ buffer: ole2, filename: "cv.doc", mime: "application/msword" });

  assert.equal(result.format, "doc");
  assert.equal(result.text, "");
  const warning = result.warnings.join(" ");
  assert.match(warning, /not supported/i);
  assert.match(warning, /\.docx/);
  assert.match(warning, /paste/i);
  assert.ok(!warning.includes("tesseract"), "the OCR advice has nothing to do with a .doc");
});

// ---------------------------------------------------------------------------
// Images and OCR
// ---------------------------------------------------------------------------

test("an image upload with no OCR anywhere names the install command and the paste path", async () => {
  const directory = mkdtempSync(join(tmpdir(), "applywright-ocr-"));
  const savedPath = process.env.PATH;
  try {
    // An empty directory guarantees neither tesseract nor wsl is found, whatever the host has.
    process.env.PATH = directory;
    const result = await extractText({ buffer: PNG_BYTES, filename: "cv.png", mime: "image/png" });

    assert.equal(result.format, "image");
    assert.equal(result.text, "");
    const warning = result.warnings.join(" ");
    assert.match(warning, /tesseract/i);
    assert.match(warning, /winget install UB-Mannheim\.TesseractOCR/);
    assert.match(warning, /sudo apt install tesseract-ocr/);
    assert.match(warning, /paste/i);
    assert.ok(!warning.includes("read with OCR"), "a refusal must not claim OCR ran");
  } finally {
    process.env.PATH = savedPath;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("OCR uses a native tesseract on PATH with stdin/stdout argv", async () => {
  const calls = [];
  setToolOverridesForTesting({
    findOnPath: (name) => (name === "tesseract" ? "C:\\fake\\tesseract.exe" : null),
    run: (binary, args) => {
      calls.push({ binary, args });
      return { ok: true, text: "Ada Lovelace\n2021 - 2024 Senior Engineer" };
    },
  });
  try {
    const result = await extractText({ buffer: PNG_BYTES, filename: "cv.png", mime: "image/png" });

    assert.equal(result.format, "image");
    assert.equal(result.text, "Ada Lovelace\n2021 - 2024 Senior Engineer");
    assert.equal(calls.length, 1, `expected one extractor call, saw ${JSON.stringify(calls)}`);
    assert.equal(calls[0].binary, "C:\\fake\\tesseract.exe");
    assert.deepEqual(calls[0].args, ["stdin", "stdout"], "tesseract must read stdin and write stdout");
    const warning = result.warnings.join(" ");
    assert.match(warning, /read with OCR/);
    assert.match(warning, /check numbers and section headings/, "the accuracy caveat is missing");
  } finally {
    setToolOverridesForTesting(null);
  }
});

test("OCR falls back to WSL tesseract, and the WSL probe is cached across uploads", async () => {
  const calls = [];
  setToolOverridesForTesting({
    findOnPath: (name) => (name === "wsl" ? "C:\\Windows\\System32\\wsl.exe" : null),
    run: (_binary, args) => {
      calls.push(args);
      if (args.includes("--version")) return { ok: true, text: "tesseract 5.3.4" };
      return { ok: true, text: "TEST" };
    },
  });
  try {
    const first = await extractText({ buffer: PNG_BYTES, filename: "cv.png" });
    const second = await extractText({ buffer: PNG_BYTES, filename: "cv.png" });

    assert.equal(first.text, "TEST");
    assert.equal(second.text, "TEST");
    const probes = calls.filter((args) => args.includes("--version"));
    assert.equal(probes.length, 1, `the WSL probe must be cached, not repeated; saw ${probes.length}`);
    const conversions = calls.filter((args) => !args.includes("--version"));
    assert.equal(conversions.length, 2);
    assert.deepEqual(conversions[0], ["-e", "tesseract", "stdin", "stdout"]);
    assert.match(first.warnings.join(" "), /wsl -e tesseract stdin stdout/, "the warning must name the route that ran");
  } finally {
    setToolOverridesForTesting(null);
  }
});

test("OCR with no route at all names both routes and both install commands", async () => {
  setToolOverridesForTesting({
    findOnPath: () => null,
    run: () => ({ ok: false, reason: "must not be called when no binary resolves" }),
  });
  try {
    const result = await extractText({ buffer: PNG_BYTES, filename: "cv.png" });
    assert.equal(result.format, "image");
    assert.equal(result.text, "");
    const warning = result.warnings.join(" ");
    assert.match(warning, /no tesseract binary is on the Windows PATH/);
    assert.match(warning, /there is no `wsl` on the Windows PATH/);
    assert.match(warning, /winget install UB-Mannheim\.TesseractOCR/);
    assert.match(warning, /sudo apt install tesseract-ocr/);
    assert.ok(!warning.includes("read with OCR"));
  } finally {
    setToolOverridesForTesting(null);
  }
});

test("OCR that finds nothing says so instead of claiming a read", async () => {
  setToolOverridesForTesting({
    findOnPath: (name) => (name === "wsl" ? "C:\\Windows\\System32\\wsl.exe" : null),
    run: (_binary, args) => (args.includes("--version") ? { ok: true, text: "" } : { ok: true, text: " \n\n " }),
  });
  try {
    const result = await extractText({ buffer: PNG_BYTES, filename: "cv.png" });
    assert.equal(result.format, "image");
    assert.equal(result.text, "");
    const warning = result.warnings.join(" ");
    assert.match(warning, /found no text/);
    assert.ok(!warning.includes("check numbers"), "an empty read must not carry the accuracy caveat");
  } finally {
    setToolOverridesForTesting(null);
  }
});

test("OCR on an image that decodes but is not a CV still returns text, with the caveat", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  setToolOverridesForTesting({
    findOnPath: (name) => (name === "tesseract" ? "/usr/bin/tesseract" : null),
    run: () => ({ ok: true, text: "  2021 - 2024\n  Senior  Engineer " }),
  });
  try {
    const result = await extractText({ buffer: png, filename: "cv.png" });
    assert.equal(result.text, "2021 - 2024\n  Senior  Engineer");
    assert.match(result.warnings.join(" "), /check numbers/);
  } finally {
    setToolOverridesForTesting(null);
  }
});

test("binary bytes named as an image are refused without pretending OCR ran", async () => {
  const result = await extractText({ buffer: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00]), filename: "cv.jpg" });
  assert.equal(result.format, "image");
  assert.equal(result.text, "");
  assert.ok(result.warnings.some((warning) => warning.includes("not a PNG, JPEG, GIF, BMP, TIFF or WebP image")));
});

test("live OCR: WSL tesseract reads a synthesised image end to end", async (t) => {
  // This host has Tesseract in WSL and nothing on the Windows PATH, which is the
  // situation the fallback exists for. Anything else skips loudly, with a reason,
  // rather than passing on the strength of a binary it never exercised.
  if (nativeBinaryOnPath("tesseract")) {
    t.diagnostic("SKIP: native tesseract is on PATH, so this run would not exercise the WSL OCR route");
    t.skip("native tesseract on PATH; the WSL route is covered by the injected-runner test");
    return;
  }
  if (!probeSucceeds("wsl", ["-e", "tesseract", "--version"])) {
    t.diagnostic("SKIP: no tesseract on the Windows PATH and none inside WSL, so no OCR can run live");
    t.skip("no tesseract on the Windows PATH or in WSL");
    return;
  }

  const result = await extractText({ buffer: buildWordBmp("TEST"), filename: "scan.bmp", mime: "image/bmp" });

  assert.equal(result.format, "image");
  assert.match(result.text, /T\s*E\s*S\s*T/i, `live OCR returned ${JSON.stringify(result.text)}`);
  const warning = result.warnings.join(" ");
  assert.match(warning, /wsl -e tesseract stdin stdout/, "the warning must name the WSL route");
  assert.match(warning, /check numbers and section headings/);

  // A blank page must not invent text.
  const blank = await extractText({ buffer: buildBmp({ width: 200, height: 60 }), filename: "blank.bmp" });
  assert.equal(blank.text, "");
  assert.match(blank.warnings.join(" "), /found no text/);
});

// ---------------------------------------------------------------------------
// Plain text, Markdown, empty and binary input
// ---------------------------------------------------------------------------

test("extractText reads plain text, strips a BOM and normalises CRLF", async () => {
  const result = await extractText({
    buffer: Buffer.from("\uFEFFPriya Raman\r\npriya@example.com\r\n", "utf8"),
    filename: "cv.txt",
    mime: "text/plain",
  });
  assert.equal(result.format, "txt");
  assert.equal(result.text, "Priya Raman\npriya@example.com");
  assert.deepEqual(result.warnings, []);
});

test("extractText reads Markdown and leaves its syntax alone", async () => {
  const markdown = "# Ada Lovelace\n\n## Experience\n\n- Built a difference engine\n";
  const result = await extractText({ buffer: Buffer.from(markdown), filename: "cv.md", mime: "text/markdown" });
  assert.equal(result.format, "md");
  assert.equal(result.text, markdown.trim());
});

test("extractText decodes UTF-16 text", async () => {
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Ada Lovelace", "utf16le")]);
  const result = await extractText({ buffer, filename: "cv.txt" });
  assert.equal(result.format, "txt");
  assert.equal(result.text, "Ada Lovelace");
});

test("extractText returns a warning for empty input", async () => {
  const empty = await extractText({ buffer: Buffer.alloc(0), filename: "cv.txt", mime: "text/plain" });
  assert.equal(empty.format, "txt");
  assert.equal(empty.text, "");
  assert.equal(empty.warnings.length, 1);

  const missing = await extractText();
  assert.equal(missing.format, "unknown");
  assert.equal(missing.text, "");
  assert.ok(missing.warnings[0].includes("No file data"));
});

test("extractText rejects binary bytes as unknown instead of throwing", async () => {
  const bytes = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x13, 0x37, 0x00, 0x42, 0x99, 0x7f, 0x00, 0x00]);
  const result = await extractText({ buffer: bytes, filename: "cv.bin", mime: "application/octet-stream" });
  assert.equal(result.format, "unknown");
  assert.equal(result.text, "");
  assert.ok(result.warnings.some((warning) => warning.includes("not recognised")));
});

test("unrecognised text is read as plain text, with a warning", async () => {
  const result = await extractText({ buffer: Buffer.from("Ada Lovelace\nEngineer"), filename: "cv.rtf" });
  assert.equal(result.format, "txt");
  assert.equal(result.text, "Ada Lovelace\nEngineer");
  assert.ok(result.warnings.some((warning) => warning.includes("read as plain text")));
});

test("extractText never throws on odd input", async () => {
  await assert.doesNotReject(() => extractText({ buffer: "not really a buffer", filename: 42 }));
  await assert.doesNotReject(() => extractText({ buffer: null }));
  assert.doesNotThrow(() => docxToText(null));
  assert.equal(docxToText(null), "");
  assert.doesNotThrow(() => segmentSections(undefined));
});

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

test("a PDF with no pdftotext anywhere names both routes and the paste path", async () => {
  const directory = mkdtempSync(join(tmpdir(), "applywright-extract-"));
  const savedPath = process.env.PATH;
  try {
    // An empty directory guarantees neither pdftotext nor wsl is found, whatever the host has.
    process.env.PATH = directory;
    const result = await extractText({
      buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "latin1"),
      filename: "cv.pdf",
      mime: "application/pdf",
    });
    assert.equal(result.format, "pdf");
    assert.equal(result.text, "");
    const warning = result.warnings.join(" ");
    assert.ok(warning.includes("pdftotext"));
    assert.ok(warning.includes("wsl"), "the warning must name the WSL route that was tried");
    assert.ok(warning.includes("paste"), "the warning must name the correction path");
  } finally {
    process.env.PATH = savedPath;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an unreadable PDF reports every route it tried instead of failing silently", async () => {
  const result = await extractText({
    buffer: Buffer.from("%PDF-1.7\nthis claims to be a PDF but has no trailer\n", "latin1"),
    filename: "cv.pdf",
    mime: "application/pdf",
  });
  assert.equal(result.format, "pdf");
  assert.equal(result.text, "");
  const warning = result.warnings.join(" ");
  assert.match(warning, /could not be read/i);
  assert.match(warning, /pdftotext/);
  assert.match(warning, /paste/);
  // Whichever host this runs on, the WSL route is part of the story.
  assert.match(warning, /wsl/i);
});

test("a PDF with real text is read through the WSL pdftotext fallback", async (t) => {
  // This host has Poppler in WSL and nothing on the Windows PATH, which is the
  // exact situation the fallback exists for. Any other host skips with a reason
  // rather than passing on the strength of a native binary.
  if (nativeBinaryOnPath("pdftotext")) {
    t.skip("a native pdftotext is on PATH, so the WSL fallback is not the route this run would exercise");
    return;
  }
  if (!probeSucceeds("wsl", ["-e", "pdftotext", "-v"])) {
    t.skip("no `wsl` with pdftotext on this host, so the WSL fallback cannot be exercised");
    return;
  }

  const buffer = buildPdf(["Ada Lovelace", "Senior Engineer at Acme Payments", "ada@example.com"]);
  const result = await extractText({ buffer, filename: "cv.pdf", mime: "application/pdf" });

  assert.equal(result.format, "pdf");
  assert.deepEqual(result.warnings, [], `unexpected warnings: ${JSON.stringify(result.warnings)}`);
  assert.match(result.text, /Ada Lovelace/, `extracted text was ${JSON.stringify(result.text)}`);
  assert.match(result.text, /Senior Engineer at Acme Payments/);
  assert.match(result.text, /ada@example\.com/);
  assert.ok(!result.text.includes("\f"), "a page break leaked into the text");

  const again = await extractText({ buffer, filename: "cv.pdf" });
  assert.equal(again.text, result.text, "PDF extraction is not deterministic");

  // The extracted text must be usable end to end, not merely present.
  const profile = segmentSections(result.text);
  assert.equal(profile.contact.name, "Ada Lovelace", `name was ${JSON.stringify(profile.contact.name)}`);
  assert.equal(profile.contact.email, "ada@example.com", "the extracted PDF text did not segment");
});

// ---------------------------------------------------------------------------
// segmentSections
// ---------------------------------------------------------------------------

const HEADED_MARKDOWN = `# Ada Lovelace
ada@example.com | +44 7700 900123 | https://ada.example

## Summary
Mathematician and writer, best known for the 1843 notes on the Analytical Engine.

## Experience
2021 - 2024 Senior Engineer, Acme Payments
Built a settlement service handling £4m monthly.
2020 - 2021 Engineer, Beta Ltd
Migrated the reporting stack to Postgres.

## Education
BSc Mathematics, University of London, 2015

## Skills
JavaScript, Node.js, SQL, AWS`;

test("segmentSections follows headings and extracts contact details", () => {
  const result = segmentSections(HEADED_MARKDOWN);

  assert.equal(result.contact.name, "Ada Lovelace");
  assert.equal(result.contact.email, "ada@example.com");
  assert.ok(result.contact.phone.includes("7700 900123"), `phone was ${result.contact.phone}`);
  assert.deepEqual(result.contact.links, ["https://ada.example"]);
  assert.equal(result.raw, HEADED_MARKDOWN);

  assert.ok(result.sections.summary.includes("Mathematician and writer"));
  assert.ok(result.sections.experience.includes("Acme Payments"));
  assert.ok(result.sections.experience.includes("Beta Ltd"));
  assert.ok(result.sections.education.includes("BSc Mathematics"));
  assert.ok(result.sections.skills.includes("JavaScript"));
  assert.equal(result.sections.other, "", `unexpected other section: ${JSON.stringify(result.sections.other)}`);
  assert.ok(!result.sections.experience.includes("## Experience"), "heading text leaked into the section body");
});

const UNHEADED_CV = `Priya Raman
priya@example.com | +44 20 7946 0958 | https://example.com/priya

Software engineer with eight years building payment systems. Comfortable with Node.js and PostgreSQL.

2019 - 2024 Senior Engineer, Acme Payments
Built a settlement service handling £4m monthly.
2021 - 2024 Engineer, Beta Ltd
Migrated the reporting stack to Postgres.
BSc Computer Science, University of Leeds, 2015
JavaScript, TypeScript, SQL, AWS`;

test("segmentSections copes with a CV that has no headings", () => {
  const result = segmentSections(UNHEADED_CV);

  assert.equal(result.contact.name, "Priya Raman");
  assert.equal(result.contact.email, "priya@example.com");
  assert.ok(result.contact.phone.includes("7946 0958"), `phone was ${result.contact.phone}`);
  assert.deepEqual(result.contact.links, ["https://example.com/priya"]);

  assert.ok(result.sections.summary.includes("payment systems"), "the leading prose was not treated as a summary");
  assert.ok(result.sections.experience.includes("Acme Payments"));
  assert.ok(result.sections.experience.includes("Beta Ltd"));
  assert.ok(result.sections.education.includes("BSc Computer Science"));
  assert.ok(result.sections.skills.includes("JavaScript"));
  assert.ok(!result.sections.experience.includes("BSc"), "an education line was filed under experience");
});

test("segmentSections loses no content when there are no headings", () => {
  const result = segmentSections(UNHEADED_CV);
  const body = Object.values(result.sections).join("\n");
  for (const line of UNHEADED_CV.split("\n").map((line) => line.trim()).filter(Boolean)) {
    if (line === result.contact.name) continue;
    if (line.includes("@") || line.includes("+44")) continue; // contact lines live in `contact`
    assert.ok(body.includes(line), `line was dropped: ${JSON.stringify(line)}`);
  }
});

test("segmentSections keeps a bare profile link in contact, not in a section", () => {
  const cv = "Ada Lovelace\nada@example.com\nlinkedin.com/in/ada\n\nSkills\nJavaScript, SQL, AWS";
  const result = segmentSections(cv);
  assert.deepEqual(result.contact.links, ["linkedin.com/in/ada"]);
  assert.ok(!result.sections.other.includes("linkedin.com"), "a contact line leaked into the body");
});

test("segmentSections is conservative about headings", () => {
  const cv = `Sam Lee
sam@example.com

Experienced engineer with ten years building payment systems and leading small teams.

Skills
JavaScript, SQL, AWS`;
  const result = segmentSections(cv);
  assert.ok(result.sections.summary.includes("Experienced engineer"));
  assert.ok(result.sections.skills.includes("JavaScript"));
});

test("segmentSections accepts numbered and colon-suffixed headings", () => {
  const result = segmentSections("1. Summary:\nEngineer.\n2. Education:\nBSc Mathematics");
  assert.equal(result.sections.summary, "Engineer.");
  assert.equal(result.sections.education, "BSc Mathematics");
});

test("segmentSections has an honest empty shape", () => {
  const result = segmentSections("");
  assert.deepEqual(result.contact, { name: null, email: null, phone: null, links: [] });
  assert.deepEqual(result.sections, { summary: "", experience: "", education: "", skills: "", other: "" });
  assert.equal(result.raw, "");
});
