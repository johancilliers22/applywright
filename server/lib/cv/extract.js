/**
 * CV ingest: file bytes in, plain text plus a coarse section map out.
 *
 * Three rules shape this module:
 *   1. Nothing here throws on bad input. A corrupt upload must become a CV row
 *      with an honest warning, not a 500.
 *   2. Nothing here reaches the network, and nothing needs installing. DOCX and
 *      ODT are parsed locally by reading the zip central directory and
 *      inflating the document part; RTF and HTML are stripped in-process. PDF
 *      and image uploads are delegated to a local `pdftotext` / `tesseract`
 *      binary, tried on the Windows PATH first and then inside WSL (`wsl -e`),
 *      because this host has Poppler in WSL but not on the Windows PATH.
 *   3. Anything a parser cannot do is said out loud, with the next step. Plain
 *      text and Markdown are the reliable path, and the dashboard paste box
 *      plus `PATCH /api/cvs/:id { text }` is the correction path when an
 *      extractor gets a heading or a date wrong.
 *
 * The module is deliberately synchronous in its parsing and async only at the
 * public boundary, so callers cannot accidentally depend on timing.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants as fsConstants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { inflateRawSync } from "node:zlib";

/** Refuse to inflate an absurd document part (zip bomb guard). */
const MAX_ZIP_PART_BYTES = 64 * 1024 * 1024;
/** A hung extractor must not hold a request forever. */
const TOOL_TIMEOUT_MS = 20_000;
/** Ceiling on one extractor's raw stdout, so a pathological PDF cannot exhaust memory. */
const TOOL_MAX_BUFFER = 32 * 1024 * 1024;
/** Ceiling on the text we hand back, so one upload cannot bloat a CV row. */
const MAX_EXTRACTED_TEXT_BYTES = 4 * 1024 * 1024;
/** The first `wsl -e` of a session pays a VM start, so probe it a little longer. */
const WSL_PROBE_TIMEOUT_MS = 10_000;

/** Shared by the PDF and OCR paths: read stdin, write stdout. */
const STDIO_ARGS = ["-", "-"];
/** tesseract spells its stdout sink as a name, not a dash. */
const OCR_ARGS = ["-", "stdout"];

const LEGACY_DOC_WARNING =
  "Legacy binary Word (.doc) is not supported and no text was read. Open the file in Word or LibreOffice and save it as .docx, or paste the CV text instead.";

const OCR_INSTALL_HINT =
  "Install Tesseract OCR with `winget install UB-Mannheim.TesseractOCR` on Windows or `sudo apt install tesseract-ocr` in WSL";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_ID = 0x0001;
const ZIP64_SENTINEL = 0xffffffff;

const EXTENSION_FORMATS = new Map([
  ["txt", "txt"],
  ["text", "txt"],
  ["md", "md"],
  ["markdown", "md"],
  ["mdown", "md"],
  ["docx", "docx"],
  ["odt", "odt"],
  ["rtf", "rtf"],
  ["html", "html"],
  ["htm", "html"],
  ["xhtml", "html"],
  ["pdf", "pdf"],
  ["png", "image"],
  ["jpg", "image"],
  ["jpeg", "image"],
  ["gif", "image"],
  ["bmp", "image"],
  ["tif", "image"],
  ["tiff", "image"],
  ["webp", "image"],
  ["doc", "doc"],
]);

const MIME_FORMATS = new Map([
  ["text/plain", "txt"],
  ["text/markdown", "md"],
  ["text/x-markdown", "md"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/msword", "doc"],
  ["application/vnd.oasis.opendocument.text", "odt"],
  ["application/vnd.oasis.opendocument.text-template", "odt"],
  ["application/rtf", "rtf"],
  ["text/rtf", "rtf"],
  ["text/html", "html"],
  ["application/xhtml+xml", "html"],
  ["application/pdf", "pdf"],
  ["image/png", "image"],
  ["image/jpeg", "image"],
  ["image/gif", "image"],
  ["image/bmp", "image"],
  ["image/tiff", "image"],
  ["image/webp", "image"],
]);

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/**
 * Classify an upload from its name and MIME type alone.
 * The extension is the more specific signal: browsers send generic
 * `application/octet-stream` for plenty of files, but almost never invent a
 * misleading extension.
 *
 * `doc` is a deliberate dead end: legacy binary Word is detected and refused
 * with instructions rather than read as mojibake. `image` means "OCR this".
 *
 * @returns {'txt'|'md'|'docx'|'odt'|'rtf'|'html'|'pdf'|'image'|'doc'|'unknown'}
 */
export function detectFormat(filename, mime) {
  const name = typeof filename === "string" ? filename.trim().toLowerCase() : "";
  const dot = name.lastIndexOf(".");
  if (dot > -1) {
    const extension = name.slice(dot + 1);
    if (EXTENSION_FORMATS.has(extension)) return EXTENSION_FORMATS.get(extension);
  }
  const type = typeof mime === "string" ? mime.split(";")[0].trim().toLowerCase() : "";
  return MIME_FORMATS.get(type) ?? "unknown";
}

/** The first eight bytes of an OLE2 container: legacy .doc, .xls, .ppt. */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const IMAGE_MAGIC = [
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }, // PNG
  { bytes: [0xff, 0xd8, 0xff] }, // JPEG
  { bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { bytes: [0x49, 0x49, 0x2a, 0x00] }, // TIFF, little endian
  { bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // TIFF, big endian
];

function startsWithBytes(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (buffer[index] !== bytes[index]) return false;
  }
  return true;
}

/**
 * True only when the document *starts* like HTML, so a CV that merely mentions
 * a tag (or a Markdown file with an inline snippet) is not treated as a page.
 */
function looksLikeHtml(buffer) {
  const head = buffer.toString("utf8", 0, Math.min(buffer.length, 2048)).replace(/^\ufeff/, "").trimStart();
  return /^(?:<!doctype\s+html|<html[\s>]|<head[\s>]|<meta[\s>]|<body[\s>])/i.test(head);
}

/**
 * Magic-byte check. Returns null when the bytes are not a recognisable container.
 * A zip is reported as `zip`, not as DOCX, because ODT is a zip too.
 * @returns {'pdf'|'zip'|'rtf'|'html'|'image'|'doc'|'utf16'|null}
 */
function sniffFormat(buffer) {
  if (buffer.length >= 5 && buffer.toString("latin1", 0, 5) === "%PDF-") return "pdf";
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const third = buffer[2];
    const fourth = buffer[3];
    const zip =
      (third === 0x03 || third === 0x05 || third === 0x07) &&
      (fourth === 0x04 || fourth === 0x06 || fourth === 0x08);
    if (zip) return "zip";
  }
  if (buffer.length >= 5 && buffer.toString("latin1", 0, 5) === "{\\rtf") return "rtf";
  for (const magic of IMAGE_MAGIC) {
    if (startsWithBytes(buffer, magic.bytes)) return "image";
  }
  // "BM" alone would match prose like "BMW", so require a plausible BMP size field.
  if (buffer.length >= 6 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    const declaredSize = buffer.readUInt32LE(2);
    if (declaredSize === 0 || declaredSize === buffer.length) return "image";
  }
  if (buffer.length >= 12 && startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46])) {
    if (buffer.toString("latin1", 8, 12) === "WEBP") return "image";
  }
  if (startsWithBytes(buffer, OLE2_MAGIC)) return "doc";
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return "utf16";
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return "utf16";
  if (looksLikeHtml(buffer)) return "html";
  return null;
}

// ---------------------------------------------------------------------------
// Buffer helpers
// ---------------------------------------------------------------------------

function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (typeof input === "string") return Buffer.from(input, "utf8");
  return Buffer.alloc(0);
}

/**
 * Cheap "is this probably text?" test used for mislabelled uploads.
 * NUL bytes are decisive; other control characters are tolerated in small doses.
 */
function looksLikeText(buffer) {
  const sample = buffer.subarray(0, 8192);
  if (sample.length === 0) return false;
  for (const byte of sample) if (byte === 0) return false;
  let control = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 32) control += 1;
  }
  return control / sample.length < 0.02;
}

/** Decode UTF-8 (default) or UTF-16 with a byte-order mark. */
function decodeText(buffer, warnings) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le", 2);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2);
    const even = body.length % 2 === 0 ? body : body.subarray(0, body.length - 1);
    const copy = Buffer.from(even);
    copy.swap16();
    return copy.toString("utf16le");
  }
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (text.includes("\uFFFD")) {
    warnings.push("Some bytes were not valid UTF-8 and were replaced with the Unicode replacement character.");
  }
  return text;
}

// ---------------------------------------------------------------------------
// Zip containers: DOCX (word/document.xml) and ODT (content.xml)
// ---------------------------------------------------------------------------

/** Find the end-of-central-directory record, scanning back over the up-to-64 KiB comment. */
function findEndOfCentralDirectory(buffer) {
  if (buffer.length < 22) return -1;
  const minimum = Math.max(0, buffer.length - (22 + 0xffff));
  for (let cursor = buffer.length - 22; cursor >= minimum; cursor -= 1) {
    if (buffer.readUInt32LE(cursor) !== EOCD_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(cursor + 20);
    if (cursor + 22 + commentLength <= buffer.length) return cursor;
  }
  return -1;
}

/** Read the Zip64 extended information extra field for the sizes that need it. */
function readZip64Values(buffer, extraStart, extraLength, wanted) {
  const end = Math.min(extraStart + extraLength, buffer.length);
  let cursor = extraStart;
  while (cursor + 4 <= end) {
    const headerId = buffer.readUInt16LE(cursor);
    const length = buffer.readUInt16LE(cursor + 2);
    const bodyStart = cursor + 4;
    const bodyEnd = bodyStart + length;
    if (bodyEnd > end) return null;
    if (headerId === ZIP64_EXTRA_ID) {
      const values = [];
      let field = bodyStart;
      for (let index = 0; index < wanted.length; index += 1) {
        if (field + 8 > bodyEnd) return null;
        values.push(Number(buffer.readBigUInt64LE(field)));
        field += 8;
      }
      return values;
    }
    cursor = bodyEnd;
  }
  return null;
}

function readCentralEntry(buffer, cursor) {
  if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) return null;

  const flags = buffer.readUInt16LE(cursor + 8);
  const method = buffer.readUInt16LE(cursor + 10);
  let compressedSize = buffer.readUInt32LE(cursor + 20);
  let uncompressedSize = buffer.readUInt32LE(cursor + 24);
  const nameLength = buffer.readUInt16LE(cursor + 28);
  const extraLength = buffer.readUInt16LE(cursor + 30);
  const commentLength = buffer.readUInt16LE(cursor + 32);
  let localOffset = buffer.readUInt32LE(cursor + 42);

  const nameStart = cursor + 46;
  const nameEnd = nameStart + nameLength;
  const extraStart = nameEnd;
  const extraEnd = extraStart + extraLength;
  if (nameEnd > buffer.length || extraEnd + commentLength > buffer.length) return null;

  const name = buffer.toString("utf8", nameStart, nameEnd);

  if (
    compressedSize === ZIP64_SENTINEL ||
    uncompressedSize === ZIP64_SENTINEL ||
    localOffset === ZIP64_SENTINEL
  ) {
    // The extra field stores only the values flagged 0xffffffff, in this order.
    const wanted = [];
    if (uncompressedSize === ZIP64_SENTINEL) wanted.push(0);
    if (compressedSize === ZIP64_SENTINEL) wanted.push(1);
    if (localOffset === ZIP64_SENTINEL) wanted.push(2);
    const values = readZip64Values(buffer, extraStart, extraLength, wanted);
    if (!values) return null;
    for (let index = 0; index < wanted.length; index += 1) {
      if (wanted[index] === 0) uncompressedSize = values[index];
      else if (wanted[index] === 1) compressedSize = values[index];
      else localOffset = values[index];
    }
  }

  return {
    name,
    flags,
    method,
    compressedSize,
    uncompressedSize,
    localOffset,
    next: extraEnd + commentLength,
  };
}

function readDirectory(buffer, eocd) {
  const count = buffer.readUInt16LE(eocd + 10);
  const offset = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || offset === ZIP64_SENTINEL) {
    return { entries: [], error: "The zip container uses a Zip64 end-of-central-directory record, which this reader does not support." };
  }
  const entries = [];
  let warning = null;
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    const entry = readCentralEntry(buffer, cursor);
    if (!entry) {
      warning = "The zip central directory ends early; the file may be truncated.";
      break;
    }
    entries.push(entry);
    cursor = entry.next;
  }
  return { entries, warning };
}

/**
 * Inflate one zip entry that should hold a text document part.
 * @returns {{ text: string } | { error: string }}
 */
function inflateEntry(buffer, entry) {
  if (entry.flags & 0x0001) return { error: `${entry.name} is encrypted and cannot be read.` };
  if (entry.localOffset + 30 > buffer.length) {
    return { error: `The zip entry for ${entry.name} points outside the file.` };
  }
  if (buffer.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE) {
    return { error: `The zip entry for ${entry.name} has no local header.` };
  }
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) return { error: `The ${entry.name} data is truncated.` };
  const compressed = buffer.subarray(start, end);

  if (entry.method === 0) return { text: compressed.toString("utf8") };
  if (entry.method !== 8) {
    return { error: `${entry.name} uses unsupported zip compression method ${entry.method}.` };
  }
  try {
    const text = inflateRawSync(compressed, { maxOutputLength: MAX_ZIP_PART_BYTES });
    return { text: text.toString("utf8") };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "unknown error";
    return { error: `${entry.name} could not be inflated (${code}).` };
  }
}

const NAMED_ENTITIES = new Map(
  Object.entries({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "\u2013",
    mdash: "\u2014",
    hellip: "\u2026",
    lsquo: "\u2018",
    rsquo: "\u2019",
    ldquo: "\u201c",
    rdquo: "\u201d",
    copy: "\u00a9",
    reg: "\u00ae",
    trade: "\u2122",
    euro: "\u20ac",
    pound: "\u00a3",
    times: "\u00d7",
    middot: "\u00b7",
    bull: "\u2022",
    deg: "\u00b0",
  })
);

function decodeEntities(text) {
  return String(text ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1] !== undefined && entity[1].toLowerCase() === "x";
      const digits = entity.slice(hexadecimal ? 2 : 1);
      const code = Number.parseInt(digits, hexadecimal ? 16 : 10);
      const valid =
        Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES.get(entity.toLowerCase()) ?? match;
  });
}

/** Collapse layout whitespace and cap blank runs; used for DOCX output. */
function normaliseBlocks(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\u00a0\u2007\u202f ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Lighter normalisation for text and Markdown: keep deliberate spacing. */
function normalisePlain(text) {
  return String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Convert WordprocessingML to plain text.
 * Paragraph closes become newlines, tabs become spaces, breaks become newlines,
 * table rows become lines, tracked deletions and field instructions are dropped.
 * Tag stripping happens before entity decoding so an escaped `<w:p>` in the
 * author's text survives as text.
 */
function xmlToText(xml) {
  let text = String(xml ?? "");
  text = text.replace(/<\?xml[\s\S]*?\?>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/gi, " ");
  text = text.replace(/<w:moveFrom\b[^>]*>[\s\S]*?<\/w:moveFrom>/gi, " ");
  text = text.replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/gi, " ");
  text = text.replace(/<w:tab\b[^>]*\/?>/gi, " ");
  text = text.replace(/<w:(?:br|cr)\b[^>]*\/?>/gi, "\n");
  text = text.replace(/<\/w:tc>/gi, "  ");
  text = text.replace(/<\/w:tr>/gi, "\n");
  text = text.replace(/<\/w:p>/gi, "\n");
  text = text.replace(/<w:p\b[^>]*>/gi, "");
  text = text.replace(/<[^>]*>/g, "");
  text = decodeEntities(text);
  return normaliseBlocks(text);
}

/**
 * Convert OpenDocument text (content.xml) to plain text.
 * Paragraph and heading closes become newlines, `<text:s>` runs become spaces,
 * tabs become spaces, line breaks and table rows end a line, and table cells are
 * separated. Tag stripping happens before entity decoding, as for DOCX.
 */
function odtXmlToText(xml) {
  let text = String(xml ?? "");
  text = text.replace(/<\?xml[\s\S]*?\?>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<office:annotation\b[\s\S]*?<\/office:annotation>/gi, " ");
  text = text.replace(/<text:tracked-changes\b[\s\S]*?<\/text:tracked-changes>/gi, " ");
  text = text.replace(/<text:s\b([^>]*)\/>/g, (_match, attributes) => {
    const found = /(?:text:)?c\s*=\s*"(\d+)"/.exec(attributes);
    const count = found ? Number.parseInt(found[1], 10) : 1;
    const safe = Number.isFinite(count) && count > 0 ? Math.min(count, 64) : 1;
    return " ".repeat(safe);
  });
  text = text.replace(/<text:tab\b[^>]*\/?>/gi, " ");
  text = text.replace(/<text:line-break\b[^>]*\/?>/gi, "\n");
  text = text.replace(/<\/text:(?:p|h)>/gi, "\n");
  text = text.replace(/<\/table:table-cell>/gi, "  ");
  text = text.replace(/<\/table:table-row>/gi, "\n");
  text = text.replace(/<[^>]*>/g, "");
  text = decodeEntities(text);
  return normaliseBlocks(text);
}

/**
 * Open a zip and classify its document part.
 * DOCX and ODT are both zips, so the entry names decide; a `mimetype` entry is
 * read when present so an OpenDocument spreadsheet is not mistaken for a CV.
 * @returns {{ kind: 'docx'|'odt'|null, entry?: object, mimetype?: string|null, warnings: string[] } | { error: string }}
 */
function readZipDocument(buffer) {
  if (buffer.length < 22) return { error: "The zip archive is too short to hold a central directory." };
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) {
    return { error: "No zip end-of-central-directory record was found; the file may be truncated or not a zip archive." };
  }
  const directory = readDirectory(buffer, eocd);
  if (directory.error) return { error: directory.error };

  const entries = directory.entries;
  const entryNamed = (name) => entries.find((candidate) => candidate.name.toLowerCase() === name);
  const warnings = directory.warning ? [directory.warning] : [];

  const documentEntry = entryNamed("word/document.xml");
  if (documentEntry) return { kind: "docx", entry: documentEntry, warnings };

  const contentEntry = entryNamed("content.xml");
  if (contentEntry) {
    const mimetypeEntry = entryNamed("mimetype");
    let mimetype = null;
    if (mimetypeEntry) {
      const read = inflateEntry(buffer, mimetypeEntry);
      if (!read.error) mimetype = read.text.trim().toLowerCase();
    }
    return { kind: "odt", entry: contentEntry, mimetype, warnings };
  }

  return { kind: null, warnings };
}

/**
 * Turn zip-container bytes into text, reporting which format was actually found.
 * Always returns the `{ text, format, warnings }` shape so extractText can pass
 * it straight through.
 * @returns {{ text: string, format: string, warnings: string[] }}
 */
function readZipText(buffer, declared, warnings) {
  const fallbackFormat = declared === "docx" || declared === "odt" ? declared : "unknown";
  const opened = readZipDocument(buffer);
  if (opened.error) return { text: "", format: fallbackFormat, warnings: [...warnings, opened.error] };
  warnings.push(...opened.warnings);

  if (!opened.kind) {
    warnings.push("The zip archive contains neither word/document.xml (DOCX) nor content.xml (ODT), so no text could be read.");
    return { text: "", format: fallbackFormat, warnings };
  }
  if (opened.entry.uncompressedSize > MAX_ZIP_PART_BYTES) {
    warnings.push(`${opened.entry.name} is larger than 64 MiB; it was not read.`);
    return { text: "", format: opened.kind, warnings };
  }
  const inflated = inflateEntry(buffer, opened.entry);
  if (inflated.error) return { text: "", format: opened.kind, warnings: [...warnings, inflated.error] };

  if (opened.kind === "docx") {
    if (declared !== "docx") {
      warnings.push(
        "The file content is a zip archive holding word/document.xml, so it was read as a DOCX even though its name or MIME type suggested otherwise."
      );
    }
    return { text: xmlToText(inflated.text), format: "docx", warnings };
  }

  if (opened.mimetype && !opened.mimetype.startsWith("application/vnd.oasis.opendocument.text")) {
    warnings.push(`The OpenDocument file is not a text document (its mimetype is ${opened.mimetype}), so it was not read.`);
    return { text: "", format: "odt", warnings };
  }
  if (declared !== "odt") {
    warnings.push(
      "The file content is an OpenDocument text file, so it was read as an ODT even though its name or MIME type suggested otherwise."
    );
  }
  if (!opened.mimetype) {
    warnings.push("The OpenDocument archive has no mimetype entry; it was read as a text document.");
  }
  return { text: odtXmlToText(inflated.text), format: "odt", warnings };
}

/** Internal DOCX read: text plus the reasons any part failed. */
function readDocx(input) {
  const buffer = toBuffer(input);
  if (buffer.length === 0) return { text: "", warnings: ["The DOCX file is empty."] };
  const result = readZipText(buffer, "docx", []);
  if (result.format !== "docx") return { text: "", warnings: result.warnings };
  return { text: result.text, warnings: result.warnings };
}

/**
 * Extract text from a DOCX buffer.
 * Returns an empty string rather than throwing when the archive is unreadable;
 * use extractText() when the reason matters.
 */
export function docxToText(input) {
  return readDocx(input).text;
}

// ---------------------------------------------------------------------------
// RTF
// ---------------------------------------------------------------------------

/**
 * cp1252 code points for the 0x80-0x9f range, which a plain latin1 decode gets
 * wrong. Word writes smart quotes and dashes as `\'hh` escapes, so this is the
 * difference between "Ada's CV" and control characters in the output.
 */
const CP1252_HIGH = [
  "\u20ac", null, "\u201a", "\u0192", "\u201e", "\u2026", "\u2020", "\u2021",
  "\u02c6", "\u2030", "\u0160", "\u2039", "\u0152", null, "\u017d", null,
  null, "\u2018", "\u2019", "\u201c", "\u201d", "\u2022", "\u2013", "\u2014",
  "\u02dc", "\u2122", "\u0161", "\u203a", "\u0153", null, "\u017e", "\u0178",
];

/** Destinations whose whole group is metadata or binary, never CV text. */
const RTF_SKIP_DESTINATIONS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "objdata",
  "header", "headerl", "headerr", "headerf", "footer", "footerl", "footerr",
  "footerf", "footnote", "annotation", "datastore", "themedata", "colorschememapping",
  "latentstyles", "listtable", "listoverridetable", "rsidtbl", "generator",
  "xmlnstbl", "filetbl", "revtbl", "nonshppict", "panose", "falt",
]);

const RTF_WHITESPACE = new Set(["\r", "\n", " ", "\t"]);

/** Undo the cp1252 gap for one byte value from a `\'hh` escape. */
function cp1252Char(code) {
  if (code >= 0x80 && code <= 0x9f) return CP1252_HIGH[code - 0x80] ?? String.fromCharCode(code);
  return String.fromCharCode(code);
}

/**
 * Convert RTF to plain text: strip control words and destination groups, keep
 * the words. `\par` and `\line` become newlines, `\tab` a space, `\'hh` and
 * `\uN` are decoded, and formatting-only groups disappear.
 *
 * Deliberately cheap: this is a CV, not a desktop publisher. Object groups,
 * fonts, colours, styles, headers and footers are dropped whole.
 */
function rtfToText(source) {
  const rtf = String(source ?? "");
  const out = [];
  const groups = [];
  let skipDepth = 0;
  let index = 0;

  const markSkip = () => {
    const group = groups[groups.length - 1];
    if (!group || group.skip) return;
    group.skip = true;
    skipDepth += 1;
  };

  while (index < rtf.length) {
    const char = rtf[index];

    if (char === "{") {
      groups.push({ skip: false });
      index += 1;
      continue;
    }
    if (char === "}") {
      const group = groups.pop();
      if (group && group.skip) skipDepth -= 1;
      index += 1;
      continue;
    }

    if (char !== "\\") {
      if (skipDepth === 0) out.push(RTF_WHITESPACE.has(char) ? " " : char);
      index += 1;
      continue;
    }

    index += 1;
    const symbol = rtf[index];
    if (symbol === undefined) break;

    // Escaped literal characters.
    if (symbol === "\\" || symbol === "{" || symbol === "}") {
      if (skipDepth === 0) out.push(symbol);
      index += 1;
      continue;
    }
    // `\*` marks the rest of the group as an ignorable destination.
    if (symbol === "*") {
      markSkip();
      index += 1;
      if (rtf[index] === " ") index += 1;
      continue;
    }
    // `\'hh` is one byte in the document code page.
    if (symbol === "'") {
      const hex = rtf.slice(index + 1, index + 3);
      if (/^[0-9a-f]{2}$/i.test(hex)) {
        if (skipDepth === 0) out.push(cp1252Char(Number.parseInt(hex, 16)));
        index += 3;
      } else {
        index += 1;
      }
      continue;
    }
    // Control symbols that carry text.
    if (symbol === "~") {
      if (skipDepth === 0) out.push(" ");
      index += 1;
      continue;
    }
    if (symbol === "_") {
      if (skipDepth === 0) out.push("-");
      index += 1;
      continue;
    }
    if (symbol === "-") {
      index += 1;
      continue;
    }

    // A control word: letters, an optional numeric parameter, an optional
    // single trailing space that acts as the delimiter.
    const wordMatch = /^([a-z]+)/i.exec(rtf.slice(index, index + 32));
    if (!wordMatch) {
      index += 1;
      continue;
    }
    const word = wordMatch[1].toLowerCase();
    index += word.length;
    const parameterMatch = /^-?\d{1,6}/.exec(rtf.slice(index, index + 8));
    const parameter = parameterMatch ? Number.parseInt(parameterMatch[0], 10) : null;
    if (parameterMatch) index += parameterMatch[0].length;
    if (rtf[index] === " ") index += 1;

    if (word === "par" || word === "line" || word === "sect" || word === "page") {
      if (skipDepth === 0) out.push("\n");
      continue;
    }
    if (word === "tab") {
      if (skipDepth === 0) out.push(" ");
      continue;
    }
    // RTF CVs are often laid out in tables; keep the cells from running together.
    if (word === "cell") {
      if (skipDepth === 0) out.push("  ");
      continue;
    }
    if (word === "row") {
      if (skipDepth === 0) out.push("\n");
      continue;
    }
    if (word === "u" && parameter !== null) {
      const code = parameter < 0 ? parameter + 65536 : parameter;
      if (code > 0 && skipDepth === 0) out.push(String.fromCharCode(code));
      // The spec puts one ANSI fallback byte after \uN; swallow it.
      if (rtf[index] !== undefined && rtf[index] !== "\\" && rtf[index] !== "{") index += 1;
      continue;
    }
    if (RTF_SKIP_DESTINATIONS.has(word)) markSkip();
  }

  return normaliseBlocks(out.join(""));
}

function readRtf(bytes, warnings) {
  const text = rtfToText(decodeText(bytes, warnings));
  if (!text) warnings.push("The RTF contained no readable text.");
  return { text, format: "rtf", warnings };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const HTML_BLOCK_ENDS =
  /<\/(?:p|div|h[1-6]|li|ul|ol|dl|dt|dd|tr|table|thead|tbody|section|article|header|footer|main|nav|aside|blockquote|pre|figure|figcaption|form|fieldset|address)\s*>/gi;

/**
 * Convert an HTML CV (a Google Docs or Word "save as web page" export, or a
 * page saved from a portfolio) to plain text. Block ends and `<br>` become line
 * breaks, table cells are separated, and scripts, styles and the title are
 * dropped rather than read as prose.
 */
function htmlToText(source) {
  let text = String(source ?? "");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<(script|style|template|noscript|svg|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  text = text.replace(/<br\b[^>]*\/?>/gi, "\n");
  text = text.replace(/<hr\b[^>]*\/?>/gi, "\n");
  text = text.replace(HTML_BLOCK_ENDS, "\n");
  text = text.replace(/<\/(?:td|th)\s*>/gi, "  ");
  text = text.replace(/<[^>]*>/g, "");
  text = decodeEntities(text);
  return normaliseBlocks(text);
}

function readHtml(bytes, warnings) {
  const text = htmlToText(decodeText(bytes, warnings));
  if (!text) warnings.push("The HTML contained no readable text.");
  return { text, format: "html", warnings };
}

// ---------------------------------------------------------------------------
// External extractors: local binary first, WSL second
// ---------------------------------------------------------------------------
//
// PDF and image ingest need a real tool. Both are optional on this machine:
//   * Poppler's `pdftotext` lives at /usr/bin/pdftotext inside WSL, not on the
//     Windows PATH, so `wsl -e pdftotext - -` is the working route here.
//   * `tesseract` is not installed anywhere, so image uploads answer with the
//     install command instead of pretending to read them.
// The WSL capability probe runs once per process and is cached; the `wsl`
// binary itself is re-resolved each call, so a changed PATH is always honoured.

/** Locate an executable on PATH without spawning anything. */
function findOnPath(name) {
  const pathValue = process.env.PATH ?? process.env.Path ?? "";
  if (!pathValue) return null;
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, name + extension);
      try {
        if (!statSync(candidate).isFile()) continue;
        if (process.platform !== "win32") accessSync(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // Not in this directory.
      }
    }
  }
  return null;
}

function errorCode(error) {
  if (error && typeof error === "object" && "code" in error) return String(error.code);
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "unknown error";
}

/**
 * Run an extractor with the file on stdin and the text on stdout.
 * Bounded twice: a hard timeout so a hung binary cannot hold a request, and a
 * pipe ceiling so a pathological file cannot exhaust memory.
 * @returns {{ ok: true, text: string } | { ok: false, reason: string }}
 */
function runExtractor(binary, args, input, timeout = TOOL_TIMEOUT_MS) {
  let result;
  try {
    result = spawnSync(binary, args, {
      input,
      encoding: "utf8",
      timeout,
      maxBuffer: TOOL_MAX_BUFFER,
      windowsHide: true,
    });
  } catch (error) {
    return { ok: false, reason: `could not be started (${errorCode(error)})` };
  }

  if (result.error) {
    const code = errorCode(result.error);
    if (code === "ENOENT") return { ok: false, reason: "is not executable" };
    if (code === "ETIMEDOUT") return { ok: false, reason: `did not finish within ${Math.round(timeout / 1000)} seconds` };
    if (code === "ENOBUFS") return { ok: false, reason: "produced more than 32 MiB of output" };
    return { ok: false, reason: `failed (${code})` };
  }
  if (result.status !== 0) {
    const detail = String(result.stderr ?? "").trim().split(/\r?\n/).find(Boolean) ?? "";
    return { ok: false, reason: `exited with code ${result.status}${detail ? `: ${detail.slice(0, 160)}` : ""}` };
  }
  return { ok: true, text: String(result.stdout ?? "") };
}

/** Probe results for `wsl -e <tool>`, cached per tool for the life of the process. */
const wslToolCache = new Map();

/**
 * Can WSL run this tool? Probed once and cached.
 * A missing `wsl` on PATH is *not* cached: PATH is the caller's to change, and
 * the tests rely on hiding it.
 */
function wslHasTool(tool, probeArgs) {
  const cached = wslToolCache.get(tool);
  if (cached !== undefined) return cached;
  const wsl = findOnPath("wsl");
  if (!wsl) return false;
  const probe = runExtractor(wsl, ["-e", tool, ...probeArgs], Buffer.alloc(0), WSL_PROBE_TIMEOUT_MS);
  wslToolCache.set(tool, probe.ok);
  return probe.ok;
}

/**
 * Run a tool through WSL: `wsl -e <tool> <args>` with the file on stdin.
 * @returns {{ status: 'ok', text: string } | { status: 'unavailable'|'failed', reason: string }}
 */
function runInWsl(tool, args, input, probeArgs) {
  const wsl = findOnPath("wsl");
  if (!wsl) return { status: "unavailable", reason: "there is no `wsl` on the Windows PATH" };
  if (!wslHasTool(tool, probeArgs)) {
    return { status: "unavailable", reason: `WSL is installed but \`${tool}\` is not installed inside it` };
  }
  const attempt = runExtractor(wsl, ["-e", tool, ...args], input);
  if (attempt.ok) return { status: "ok", text: attempt.text };
  return { status: "failed", reason: `\`wsl -e ${tool} ${args.join(" ")}\` ${attempt.reason}` };
}

/** Join attempt descriptions the way the warnings read them. */
function joinAttempts(tried) {
  if (tried.length <= 1) return tried[0] ?? "no extractor is available";
  return `${tried.slice(0, -1).join(", ")} and ${tried[tried.length - 1]}`;
}

/**
 * Try an extractor on the Windows PATH, then inside WSL.
 * Returning `text: null` means both routes are exhausted and `tried` explains
 * each one, which is what the caller's warning quotes back to the user.
 * @returns {{ text: string, source: string } | { text: null, tried: string[] }}
 */
function runExtractorChain({ binary, args, input, probeArgs }) {
  const tried = [];
  const native = findOnPath(binary);
  if (native) {
    const attempt = runExtractor(native, args, input);
    if (attempt.ok) return { text: attempt.text, source: binary };
    tried.push(`the Windows ${binary} ${attempt.reason}`);
  } else {
    tried.push(`no ${binary} binary is on the Windows PATH`);
  }

  const viaWsl = runInWsl(binary, args, input, probeArgs);
  if (viaWsl.status === "ok") return { text: viaWsl.text, source: `wsl ${binary}` };
  tried.push(viaWsl.status === "failed" ? viaWsl.reason : `${viaWsl.reason} (\`wsl -e ${binary} ${probeArgs.join(" ")}\` did not run)`);
  return { text: null, tried };
}

/**
 * Keep at most MAX_EXTRACTED_TEXT_BYTES from one extractor.
 * The process pipe already caps raw stdout; this caps what reaches a CV row, so
 * one absurd PDF cannot bloat the database or the dashboard.
 */
function capExtractedText(text, warnings, label) {
  const value = String(text ?? "");
  if (Buffer.byteLength(value, "utf8") <= MAX_EXTRACTED_TEXT_BYTES) return value;
  const capped = Buffer.from(value, "utf8")
    .subarray(0, MAX_EXTRACTED_TEXT_BYTES)
    .toString("utf8")
    .replace(/\ufffd$/, "");
  warnings.push(`${label} produced more than 4 MiB of text; the rest was discarded.`);
  return capped;
}

/** True when OCR could actually run, so advice is only offered when it is actionable. */
function tesseractAvailable() {
  return Boolean(findOnPath("tesseract")) || wslHasTool("tesseract", ["--version"]);
}

/** What to tell someone whose PDF turned out to be a scan. */
function ocrAdvice() {
  if (tesseractAvailable()) return "Save each page as a PNG or JPEG and upload those instead, which can be read with OCR.";
  return `OCR would need Tesseract. ${OCR_INSTALL_HINT}.`;
}

function extractPdf(buffer, warnings) {
  const attempt = runExtractorChain({ binary: "pdftotext", args: STDIO_ARGS, input: buffer, probeArgs: ["-v"] });
  if (attempt.text === null) {
    warnings.push(
      `This PDF could not be read: ${joinAttempts(attempt.tried)}. Install Poppler's pdftotext, or paste the CV text instead.`
    );
    return { text: "", format: "pdf", warnings };
  }

  // pdftotext separates pages with a form feed; treat it as a paragraph break.
  const text = normalisePlain(capExtractedText(attempt.text.replace(/\f/g, "\n"), warnings, "pdftotext"));
  if (!text) {
    warnings.push(`pdftotext returned no text, so this PDF is a scan rather than real text. ${ocrAdvice()}`);
  }
  return { text, format: "pdf", warnings };
}

/**
 * Read an image with OCR, or say precisely why it could not be read.
 * There is no cloud call and no dependency: if Tesseract is absent, the upload
 * gets the install command and the paste path instead of a silent empty string.
 */
function extractImage(buffer, warnings) {
  const attempt = runExtractorChain({ binary: "tesseract", args: OCR_ARGS, input: buffer, probeArgs: ["--version"] });
  if (attempt.text === null) {
    warnings.push(
      `No OCR could be run on this image: ${joinAttempts(attempt.tried)}. ${OCR_INSTALL_HINT}, or paste the CV text instead.`
    );
    return { text: "", format: "image", warnings };
  }

  const text = normalisePlain(capExtractedText(attempt.text, warnings, "tesseract"));
  if (!text) warnings.push("OCR ran but found no text in that image; try a sharper, straight-on scan.");
  return { text, format: "image", warnings };
}

// ---------------------------------------------------------------------------
// Public ingest
// ---------------------------------------------------------------------------

/**
 * Turn an uploaded file into text.
 * Always resolves to `{ text, format, warnings }`; malformed input never throws.
 * The reported format can differ from the filename when the bytes disagree
 * (a zip named .txt, a PDF named .docx, a UTF-16 file with no extension), and
 * every such difference is explained in `warnings`.
 */
export async function extractText({ buffer, filename, mime } = {}) {
  const warnings = [];
  const supplied = buffer !== undefined && buffer !== null;
  const bytes = toBuffer(buffer);
  const declared = detectFormat(filename, mime);

  if (!supplied) return { text: "", format: declared, warnings: ["No file data was supplied."] };
  if (bytes.length === 0) return { text: "", format: declared, warnings: ["The file is empty."] };

  const sniffed = sniffFormat(bytes);

  // Content that is unmistakably itself wins over the filename, and every
  // disagreement between bytes and name is reported rather than silently accepted.
  if (sniffed === "pdf") {
    if (declared !== "pdf") {
      warnings.push("The file content is a PDF even though its name or MIME type suggested otherwise; it was read as a PDF.");
    }
    return extractPdf(bytes, warnings);
  }

  if (sniffed === "zip") return readZipText(bytes, declared, warnings);

  if (sniffed === "doc") {
    if (declared === "doc") {
      warnings.push(LEGACY_DOC_WARNING);
      return { text: "", format: "doc", warnings };
    }
    warnings.push(
      "The file content is a legacy OLE2 binary document (an old .doc, .xls or .ppt), which is not supported; save it in a modern format or paste the text."
    );
    return { text: "", format: "unknown", warnings };
  }

  if (sniffed === "rtf") {
    if (declared !== "rtf") {
      warnings.push("The file content is RTF even though its name or MIME type suggested otherwise; it was read as RTF.");
    }
    return readRtf(bytes, warnings);
  }

  if (sniffed === "html") {
    if (declared !== "html") {
      warnings.push("The file content is HTML even though its name or MIME type suggested otherwise; it was read as HTML with the tags removed.");
    }
    return readHtml(bytes, warnings);
  }

  if (sniffed === "image") {
    if (declared !== "image") {
      warnings.push("The file content is an image even though its name or MIME type suggested otherwise; it was read with OCR.");
    }
    return extractImage(bytes, warnings);
  }

  if (sniffed === "utf16") {
    if (declared !== "txt" && declared !== "md") {
      warnings.push("The file content is UTF-16 text; it was decoded as text rather than the format its name suggested.");
    }
    const decoded = normalisePlain(decodeText(bytes, warnings));
    if (!decoded) warnings.push("The file contained no text.");
    return { text: decoded, format: declared === "md" ? "md" : "txt", warnings };
  }

  // No recognisable magic bytes: trust the name, but never hand mojibake to the
  // segmenter just because an extension said so.
  if (declared === "pdf") return extractPdf(bytes, warnings);

  if (declared === "docx" || declared === "odt") {
    if (!looksLikeText(bytes)) return readZipText(bytes, declared, warnings);
    warnings.push(`The file is named as a ${declared.toUpperCase()} but its bytes are not a zip archive; it was read as plain text.`);
    return readTextLike(bytes, "txt", warnings);
  }

  if (declared === "doc") {
    if (looksLikeText(bytes)) {
      warnings.push("The file is named as a legacy .doc but its bytes are plain text; it was read as plain text.");
      return readTextLike(bytes, "txt", warnings);
    }
    warnings.push(LEGACY_DOC_WARNING);
    return { text: "", format: "doc", warnings };
  }

  if (declared === "rtf") {
    if (!looksLikeText(bytes)) {
      warnings.push("The file is named as RTF but its bytes are not RTF, so no text could be read.");
      return { text: "", format: "unknown", warnings };
    }
    warnings.push("The file is named as RTF but its bytes are plain text; it was read as plain text.");
    return readTextLike(bytes, "txt", warnings);
  }

  if (declared === "html") {
    if (looksLikeText(bytes)) {
      warnings.push("The file is named as HTML but its bytes are plain text; it was read as plain text.");
      return readTextLike(bytes, "txt", warnings);
    }
    return readHtml(bytes, warnings);
  }

  if (declared === "image") {
    if (looksLikeText(bytes)) {
      warnings.push("The file is named as an image but its bytes are plain text; it was read as plain text.");
      return readTextLike(bytes, "txt", warnings);
    }
    warnings.push("The file is named as an image but is not a PNG, JPEG, GIF, BMP, TIFF or WebP image, so no OCR could run on it.");
    return { text: "", format: "image", warnings };
  }

  if (declared === "txt" || declared === "md") return readTextLike(bytes, declared, warnings);

  if (looksLikeText(bytes)) {
    warnings.push("The file type was not recognised from its name or MIME type; the content was read as plain text.");
    return readTextLike(bytes, "txt", warnings);
  }

  warnings.push(
    "The file type was not recognised. Supported formats are .txt, .md, .docx, .odt, .rtf, .html and .pdf, plus .png/.jpg images when Tesseract OCR is installed. Legacy binary Word (.doc) must be saved as .docx first."
  );
  return { text: "", format: "unknown", warnings };
}

/**
 * Decode bytes that should be text: refuse binary, strip a BOM, normalise line
 * endings and trailing spaces. Shared by every "read it as text" route.
 * @returns {{ text: string, format: string, warnings: string[] }}
 */
function readTextLike(bytes, format, warnings) {
  if (!looksLikeText(bytes)) {
    warnings.push("The file contains binary data and could not be read as text.");
    return { text: "", format: "unknown", warnings };
  }
  const text = normalisePlain(decodeText(bytes, warnings));
  if (!text) warnings.push("The file contained no text.");
  return { text, format, warnings };
}

// ---------------------------------------------------------------------------
// Section segmentation
// ---------------------------------------------------------------------------

const SECTION_KEYS = ["summary", "experience", "education", "skills", "other"];

const EMAIL_SOURCE = "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}";
const EMAIL_PATTERN = new RegExp(EMAIL_SOURCE, "i");
const EMAIL_PATTERN_GLOBAL = new RegExp(EMAIL_SOURCE, "gi");

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>()"'`]+/gi;
const URL_TEST = /(?:https?:\/\/|www\.)/i;

// Bare domains are accepted only for hosts that are unmistakably profiles, so
// that "ASP.NET" in a skills line is not mistaken for a link.
const BARE_DOMAIN_PATTERN =
  /(?<![\w@.-])(?:[a-z0-9-]+\.)+(?:com|co\.uk|org|net|io|dev|me|ai|app|uk|ie|eu|de|fr|nl|se|no|es|it|ca|us|au|nz|in|xyz|tech|site|link|ly|gg)(?:\/[^\s<>()"'`]*)?/gi;
const KNOWN_LINK_HOST =
  /^(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|bitbucket\.org|medium\.com|stackoverflow\.com|kaggle\.com|behance\.net|dribbble\.com|huggingface\.co|orcid\.org|scholar\.google\.com|twitter\.com|x\.com|mastodon\.social|dev\.to|npmjs\.com|codepen\.io)$/i;

const PHONE_SOURCE =
  "(?:\\+\\d{1,3}[\\s.-]?)?(?:\\(\\d{2,5}\\)[\\s.-]?)?\\d{2,6}(?:[\\s.-]\\d{2,6}){1,4}(?!\\d)";
const PHONE_PATTERN = new RegExp(PHONE_SOURCE, "g");
const PHONE_LABEL = /\b(?:phone|tel|telephone|mobile|mob|cell|whatsapp)\b/i;

const DATE_RANGE_PATTERN =
  /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*)?(?:19|20)\d{2}\s*(?:[\u2013\u2014\u2212-]|to|until|through)\s*(?:(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*)?(?:19|20)\d{2}|present|current|now|ongoing)/i;

const EDUCATION_PATTERN =
  /\b(?:bachelor|master|bsc|msc|mba|mphil|phd|doctorate|diploma|degree|university|college|institute|polytechnic|a-levels?|gcses?|hnc|hnd|postgraduate|undergraduate)\b/i;

const SKILLS_VERB_PATTERN =
  /\b(?:built|led|managed|developed|designed|migrated|delivered|implemented|created|improved|reduced|increased|worked|responsible|launched|shipped|owned|scaled|automated|mentored|hired|negotiated|drove|cut|saved)\b/i;

const NAME_PARTICLES = new Set([
  "van", "von", "de", "der", "den", "da", "di", "du", "la", "le", "del", "della", "bin", "al", "el",
]);

/** Lowercase heading text with punctuation and ampersands normalised away. */
function normaliseHeadingText(line) {
  return String(line ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADING_ALIASES = new Map(
  (
    /** @type {[string, string[]][]} */ ([
      [
        "summary",
        [
          "summary", "professional summary", "personal summary", "career summary", "profile",
          "personal profile", "professional profile", "about", "about me", "overview", "objective",
          "career objective", "personal statement", "executive summary", "career profile",
        ],
      ],
      [
        "experience",
        [
          "experience", "work experience", "professional experience", "employment experience",
          "employment history", "work history", "career history", "professional history",
          "relevant experience", "professional background", "experience and achievements",
          "volunteer experience", "volunteering",
        ],
      ],
      [
        "education",
        [
          "education", "education and training", "qualifications", "academic qualifications",
          "academic background", "education and qualifications", "training", "training and education",
        ],
      ],
      [
        "skills",
        [
          "skills", "technical skills", "core skills", "key skills", "professional skills",
          "competencies", "core competencies", "technical competencies", "skills and competencies",
          "technical expertise", "areas of expertise", "expertise", "technologies",
          "tools and technologies", "technical proficiencies", "it skills", "software",
          "software and tools",
        ],
      ],
      [
        "other",
        [
          "projects", "personal projects", "selected projects", "side projects", "key projects",
          "notable projects", "portfolio", "certifications", "certificates", "certification",
          "licences", "licenses", "licences and certifications", "certifications and training",
          "professional certifications", "professional development", "courses", "awards",
          "awards and honours", "honours", "achievements", "publications", "languages",
          "interests", "hobbies", "references", "referees", "memberships",
          "professional memberships", "additional information", "other information", "other",
          "personal details", "additional", "volunteer work",
        ],
      ],
    ])
  ).flatMap(([key, aliases]) => aliases.map((alias) => [normaliseHeadingText(alias), key]))
);

/**
 * Classify a line as a section heading.
 * Accepts exact known aliases only, after stripping Markdown hashes, bullets,
 * numbering, emphasis and a trailing colon. Unknown headings stay in the body.
 */
function headingKey(line) {
  const raw = String(line ?? "").trim();
  if (!raw || raw.length > 64) return null;
  let candidate = raw.replace(/^#{1,6}\s+/, "");
  candidate = candidate.replace(/^[-*\u2022\u00b7]\s+/, "");
  candidate = candidate.replace(/^\d{1,2}[.)]\s+/, "");
  candidate = candidate.replace(/^[ivxlcdm]{1,4}[.)]\s+/i, "");
  candidate = candidate.replace(/[*_`]+/g, "");
  candidate = candidate.replace(/[:\uff1a]\s*$/, "").trim();
  if (!candidate || candidate.length > 48) return null;
  return HEADING_ALIASES.get(normaliseHeadingText(candidate)) ?? null;
}

function isDateSpan(value) {
  return DATE_RANGE_PATTERN.test(value);
}

/** First plausible phone number, preferring labelled and international forms. */
function findPhone(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const labelled = PHONE_LABEL.test(line);
    if (!labelled && index > 12) continue;

    const candidates = line.match(new RegExp(PHONE_SOURCE, "g")) ?? [];
    for (const raw of candidates) {
      const candidate = raw.trim();
      const digits = candidate.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) continue;
      if (isDateSpan(candidate)) continue;
      if (/[\u00a3$\u20ac]/.test(candidate)) continue;
      if (!labelled && !candidate.startsWith("+")) continue;
      return candidate;
    }
  }
  return null;
}

function looksLikeName(line) {
  if (line.length < 3 || line.length > 60) return false;
  if (/[@:0-9]|https?:\/\/|www\./i.test(line)) return false;
  if (/curriculum vitae|\bresume\b|\bcv\b/i.test(line)) return false;
  if (/[.!?]$/.test(line)) return false;
  if (/[,;\/]/.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((word) => {
    const clean = word.replace(/^[('"]+|[)'"]+$/g, "");
    if (!clean) return false;
    if (!/^[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff][A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff'\u2019.-]*$/.test(clean)) return false;
    if (NAME_PARTICLES.has(clean.toLowerCase())) return true;
    return /^[A-Z\u00c0-\u00d6\u00d8-\u00de]/.test(clean);
  });
}

/** A person name is the first name-shaped line in the page header. */
function guessName(lines) {
  for (const line of lines.filter(Boolean).slice(0, 8)) {
    const cleaned = line.replace(/^#{1,6}\s*/, "").replace(/[*_`]+/g, "").trim();
    if (!cleaned) continue;
    if (HEADING_ALIASES.has(normaliseHeadingText(cleaned))) continue;
    if (looksLikeName(cleaned)) return cleaned;
  }
  return null;
}

/** Collect links in reading order, removing duplicates where a URL contains a domain. */
function extractLinks(text) {
  const found = [];
  const add = (value, index, line) => {
    const clean = value.replace(/[.,;:!?)\]}'"]+$/, "");
    if (!clean) return;
    const lower = clean.toLowerCase();
    if (found.some((row) => row.lower.includes(lower) || lower.includes(row.lower))) return;
    found.push({ value: clean, lower, index, line });
  };

  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, lineIndex) => {
    for (const match of line.matchAll(new RegExp(URL_PATTERN.source, "gi"))) {
      add(match[0], match.index ?? 0, lineIndex);
    }
    if (lineIndex >= 12) return;
    for (const match of line.matchAll(new RegExp(BARE_DOMAIN_PATTERN.source, "gi"))) {
      const host = match[0].split("/")[0];
      if (!KNOWN_LINK_HOST.test(host)) continue;
      add(match[0], match.index ?? 0, lineIndex);
    }
  });

  return found.sort((a, b) => a.line - b.line || a.index - b.index).map((row) => row.value);
}

function extractContact(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim());
  const emailMatch = String(text ?? "").match(EMAIL_PATTERN);
  return {
    name: guessName(lines),
    email: emailMatch ? emailMatch[0] : null,
    phone: findPhone(lines),
    links: extractLinks(text),
  };
}

/** Known profile hosts appearing without a scheme, e.g. linkedin.com/in/ada. */
function knownBareLinks(line) {
  const matches = String(line).match(new RegExp(BARE_DOMAIN_PATTERN.source, "gi")) ?? [];
  return matches.filter((match) => KNOWN_LINK_HOST.test(match.split("/")[0]));
}

/** True when a line carries nothing but contact details or contact labels. */
function isContactOnlyLine(line, contact) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (contact.name) {
    const bare = trimmed.replace(/^#{1,6}\s*/, "").replace(/[*_`]+/g, "").trim();
    if (bare === contact.name) return true;
  }

  const hasEmail = EMAIL_PATTERN.test(trimmed);
  const hasUrl = URL_TEST.test(trimmed);
  const hasPhoneLabel = PHONE_LABEL.test(trimmed);
  const hasBareLink = knownBareLinks(trimmed).length > 0;
  if (!hasEmail && !hasUrl && !hasPhoneLabel && !hasBareLink) return false;

  let remainder = trimmed
    .replace(EMAIL_PATTERN_GLOBAL, " ")
    .replace(URL_PATTERN, " ")
    .replace(PHONE_PATTERN, " ");
  remainder = remainder.replace(new RegExp(BARE_DOMAIN_PATTERN.source, "gi"), (match) =>
    KNOWN_LINK_HOST.test(match.split("/")[0]) ? " " : match
  );
  remainder = remainder
    .replace(/\b(?:e-?mail|phone|tel|telephone|mobile|mob|cell|linkedin|github|gitlab|portfolio|website|web|blog|contact|whatsapp)\b/gi, " ");
  remainder = remainder.replace(/[|.,\\/:;()+*~\u2013\u2014-]/g, " ").replace(/\s+/g, " ").trim();
  return remainder.length === 0;
}

function isExplicitSkillsLine(line) {
  return /^\s*(?:key |core |technical |professional )?skills?\s*[:\u2013\u2014-]\s*\S/i.test(line);
}

/** A bare comma/slash list with no sentence and no achievement verb reads as skills. */
function isSkillsLikeLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 160) return false;
  if (/^(?:[-*\u2022\u25aa\u25e6\u2023\u00b7]|\d+[.)])\s+/.test(trimmed)) return false;
  if (DATE_RANGE_PATTERN.test(trimmed)) return false;
  if (EDUCATION_PATTERN.test(trimmed)) return false;
  if (SKILLS_VERB_PATTERN.test(trimmed)) return false;
  if (isExplicitSkillsLine(trimmed)) return true;
  if (/[.!?]$/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 24) return false;
  const items = trimmed.split(/\s*[,;|\/]\s*/).filter(Boolean);
  return items.length >= 3;
}

function looksLikeSummary(lines) {
  if (!lines.length) return false;
  if (lines.some((line) => DATE_RANGE_PATTERN.test(line))) return false;
  if (lines.some((line) => isSkillsLikeLine(line))) return false;
  const words = lines.join(" ").split(/\s+/).filter(Boolean);
  return words.length >= 10;
}

/**
 * Place lines that appeared before the first heading.
 * Contact lines are dropped (they are already in `contact`). Otherwise the
 * heuristics are: explicit "Skills:" lines, education lines, the first date
 * range starts experience, leading prose becomes the summary, everything else
 * is `other`.
 */
function assignPreamble(lines, contact, buffers) {
  const meaningful = lines
    .map((line) => line.trim())
    .filter((line) => line && !isContactOnlyLine(line, contact));
  if (!meaningful.length) return;

  const assigned = new Array(meaningful.length).fill(null);

  for (let index = 0; index < meaningful.length; index += 1) {
    if (isExplicitSkillsLine(meaningful[index])) assigned[index] = "skills";
    else if (EDUCATION_PATTERN.test(meaningful[index])) assigned[index] = "education";
  }

  let experienceStart = -1;
  for (let index = 0; index < meaningful.length; index += 1) {
    if (assigned[index]) continue;
    if (DATE_RANGE_PATTERN.test(meaningful[index])) {
      experienceStart = index;
      break;
    }
  }

  if (experienceStart >= 0) {
    for (let index = experienceStart; index < meaningful.length; index += 1) {
      if (assigned[index]) continue;
      assigned[index] = isSkillsLikeLine(meaningful[index]) ? "skills" : "experience";
    }
    const prose = [];
    for (let index = 0; index < experienceStart; index += 1) {
      if (assigned[index]) continue;
      if (DATE_RANGE_PATTERN.test(meaningful[index])) break;
      prose.push(index);
    }
    if (looksLikeSummary(prose.map((index) => meaningful[index]))) {
      for (const index of prose) assigned[index] = "summary";
    }
  } else {
    const leading = [];
    for (let index = 0; index < meaningful.length; index += 1) {
      if (assigned[index]) break;
      leading.push(index);
    }
    if (looksLikeSummary(leading.map((index) => meaningful[index]))) {
      for (const index of leading) assigned[index] = "summary";
    }
    for (let index = 0; index < meaningful.length; index += 1) {
      if (!assigned[index] && isSkillsLikeLine(meaningful[index])) assigned[index] = "skills";
    }
  }

  meaningful.forEach((line, index) => {
    buffers[assigned[index] ?? "other"].push(line);
  });
}

/**
 * Split CV text into contact details and coarse sections.
 *
 * `sections` always contains all five keys as strings (possibly empty).
 * Headings win when present; without headings the heuristics above apply.
 * `raw` is the original input, unchanged.
 *
 * @returns {{
 *   contact: { name: string|null, email: string|null, phone: string|null, links: string[] },
 *   sections: { summary: string, experience: string, education: string, skills: string, other: string },
 *   raw: string
 * }}
 */
export function segmentSections(text) {
  const raw = typeof text === "string" ? text : String(text ?? "");
  const normalised = normalisePlain(raw);
  const lines = normalised ? normalised.split("\n") : [];
  const contact = extractContact(normalised);

  const sections = { summary: "", experience: "", education: "", skills: "", other: "" };
  if (!lines.length) return { contact, sections, raw };

  const buffers = Object.fromEntries(SECTION_KEYS.map((key) => [key, []]));
  const preamble = [];

  let current = null;
  for (const line of lines) {
    if (!line.trim()) {
      if (current) buffers[current].push("");
      continue;
    }
    const key = headingKey(line);
    if (key) {
      current = key;
      continue;
    }
    if (current) buffers[current].push(line);
    else preamble.push(line);
  }

  assignPreamble(preamble, contact, buffers);

  for (const key of SECTION_KEYS) {
    sections[key] = normalisePlain(buffers[key].join("\n"));
  }
  return { contact, sections, raw };
}
