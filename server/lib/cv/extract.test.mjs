import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crc32, deflateRawSync } from "node:zlib";

import { detectFormat, docxToText, extractText, segmentSections } from "./extract.js";

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
  assert.equal(detectFormat("cv.doc", "application/msword"), "unknown");
  assert.equal(detectFormat(null, null), "unknown");
  assert.equal(detectFormat(undefined, "application/octet-stream"), "unknown");
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

test("a PDF without pdftotext returns the format and a clear warning", async () => {
  const directory = mkdtempSync(join(tmpdir(), "applywright-extract-"));
  const savedPath = process.env.PATH;
  try {
    // An empty directory guarantees the binary is not found, whatever the host has.
    process.env.PATH = directory;
    const result = await extractText({
      buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n", "latin1"),
      filename: "cv.pdf",
      mime: "application/pdf",
    });
    assert.equal(result.format, "pdf");
    assert.equal(result.text, "");
    assert.ok(result.warnings.some((warning) => warning.includes("pdftotext")));
  } finally {
    process.env.PATH = savedPath;
    rmSync(directory, { recursive: true, force: true });
  }
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
