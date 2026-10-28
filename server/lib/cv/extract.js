/**
 * CV ingest: file bytes in, plain text plus a coarse section map out.
 *
 * Two rules shape this module:
 *   1. Nothing here throws on bad input. A corrupt upload must become a CV row
 *      with an honest warning, not a 500.
 *   2. Nothing here reaches the network. DOCX is parsed locally by reading the
 *      zip central directory and inflating word/document.xml; PDF is delegated
 *      to `pdftotext` only when that binary is already on PATH.
 *
 * The module is deliberately synchronous in its parsing and async only at the
 * public boundary, so callers cannot accidentally depend on timing.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants as fsConstants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { inflateRawSync } from "node:zlib";

/** Refuse to inflate an absurd word/document.xml (zip bomb guard). */
const MAX_DOCX_XML_BYTES = 64 * 1024 * 1024;
const PDFTOTEXT_TIMEOUT_MS = 20_000;
const PDFTOTEXT_MAX_BUFFER = 32 * 1024 * 1024;

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
  ["pdf", "pdf"],
]);

const MIME_FORMATS = new Map([
  ["text/plain", "txt"],
  ["text/markdown", "md"],
  ["text/x-markdown", "md"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/pdf", "pdf"],
]);

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/**
 * Classify an upload from its name and MIME type alone.
 * The extension is the more specific signal: browsers send generic
 * `application/octet-stream` for plenty of files, but almost never invent a
 * misleading extension.
 * @returns {'txt'|'md'|'docx'|'pdf'|'unknown'}
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

/** Magic-byte check. Returns null when the bytes are not a recognisable container. */
function sniffFormat(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const third = buffer[2];
    const fourth = buffer[3];
    const zip =
      (third === 0x03 || third === 0x05 || third === 0x07) &&
      (fourth === 0x04 || fourth === 0x06 || fourth === 0x08);
    if (zip) return "docx";
  }
  if (buffer.length >= 5 && buffer.toString("latin1", 0, 5) === "%PDF-") return "pdf";
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return "utf16";
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return "utf16";
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
// DOCX (zip + WordprocessingML)
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
    return { entries: [], error: "The DOCX uses a Zip64 end-of-central-directory record, which this reader does not support." };
  }
  const entries = [];
  let warning = null;
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    const entry = readCentralEntry(buffer, cursor);
    if (!entry) {
      warning = "The DOCX central directory ends early; the file may be truncated.";
      break;
    }
    entries.push(entry);
    cursor = entry.next;
  }
  return { entries, warning };
}

function inflateEntry(buffer, entry) {
  if (entry.flags & 0x0001) return { error: "word/document.xml is encrypted and cannot be read." };
  if (entry.localOffset + 30 > buffer.length) {
    return { error: "The zip entry for word/document.xml points outside the file." };
  }
  if (buffer.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE) {
    return { error: "The zip entry for word/document.xml has no local header." };
  }
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) return { error: "The word/document.xml data is truncated." };
  const compressed = buffer.subarray(start, end);

  if (entry.method === 0) return { xml: compressed.toString("utf8") };
  if (entry.method !== 8) {
    return { error: `word/document.xml uses unsupported zip compression method ${entry.method}.` };
  }
  try {
    const xml = inflateRawSync(compressed, { maxOutputLength: MAX_DOCX_XML_BYTES });
    return { xml: xml.toString("utf8") };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "unknown error";
    return { error: `word/document.xml could not be inflated (${code}).` };
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

/** Internal DOCX read: text plus the reasons any part failed. */
function readDocx(input) {
  const buffer = toBuffer(input);
  if (buffer.length === 0) return { text: "", warnings: ["The DOCX file is empty."] };
  if (buffer.length < 22) {
    return { text: "", warnings: ["The DOCX file is too short to be a zip archive."] };
  }
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) {
    return {
      text: "",
      warnings: ["No zip end-of-central-directory record was found; the DOCX may be truncated or not a zip file."],
    };
  }
  const directory = readDirectory(buffer, eocd);
  if (directory.error) return { text: "", warnings: [directory.error] };

  const entry = directory.entries.find((candidate) => candidate.name.toLowerCase() === "word/document.xml");
  if (!entry) {
    return { text: "", warnings: ["The DOCX archive does not contain word/document.xml."] };
  }
  if (entry.uncompressedSize > MAX_DOCX_XML_BYTES) {
    return { text: "", warnings: ["word/document.xml is larger than 64 MiB; it was not read."] };
  }
  const inflated = inflateEntry(buffer, entry);
  if (inflated.error) return { text: "", warnings: [inflated.error] };

  const warnings = directory.warning ? [directory.warning] : [];
  return { text: xmlToText(inflated.xml), warnings };
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
// PDF via pdftotext
// ---------------------------------------------------------------------------

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

function extractPdf(buffer, warnings) {
  const binary = findOnPath("pdftotext");
  if (!binary) {
    warnings.push(
      "No pdftotext binary was found on PATH, so this PDF could not be read. Install Poppler (pdftotext) or paste the CV text instead."
    );
    return { text: "", format: "pdf", warnings };
  }

  let result;
  try {
    result = spawnSync(binary, ["-", "-"], {
      input: buffer,
      encoding: "utf8",
      timeout: PDFTOTEXT_TIMEOUT_MS,
      maxBuffer: PDFTOTEXT_MAX_BUFFER,
      windowsHide: true,
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "unknown error";
    warnings.push(`pdftotext could not be started (${code}). The PDF was not read.`);
    return { text: "", format: "pdf", warnings };
  }

  if (result.error) {
    const code = result.error.code ?? result.error.message;
    warnings.push(`pdftotext could not be run (${code}). The PDF was not read.`);
    return { text: "", format: "pdf", warnings };
  }
  if (result.status !== 0) {
    const detail = String(result.stderr ?? "").trim().split(/\r?\n/).find(Boolean) ?? "";
    const suffix = detail ? `: ${detail.slice(0, 200)}` : ".";
    warnings.push(`pdftotext exited with code ${result.status}${suffix} The PDF may be scanned or encrypted.`);
    return { text: "", format: "pdf", warnings };
  }

  const text = normalisePlain(result.stdout ?? "");
  if (!text) {
    warnings.push("pdftotext returned no text; the PDF is probably a scan, which needs OCR.");
  }
  return { text, format: "pdf", warnings };
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

  if (sniffed === "pdf") {
    if (declared !== "pdf") {
      warnings.push("The file content is a PDF even though its name or MIME type suggested otherwise; it was read as a PDF.");
    }
    return extractPdf(bytes, warnings);
  }

  if (sniffed === "docx") {
    if (declared !== "docx") {
      warnings.push("The file content is a zip archive, so it was read as a DOCX even though its name or MIME type suggested otherwise.");
    }
    const result = readDocx(bytes);
    warnings.push(...result.warnings);
    if (!result.text && result.warnings.length === 0) {
      warnings.push("The DOCX contained no readable text.");
    }
    return { text: result.text, format: "docx", warnings };
  }

  if (sniffed === "utf16") {
    if (declared !== "txt" && declared !== "md") {
      warnings.push("The file content is UTF-16 text; it was decoded as text rather than the format its name suggested.");
    }
    const decoded = normalisePlain(decodeText(bytes, warnings));
    if (!decoded) warnings.push("The file contained no text.");
    return { text: decoded, format: declared === "md" ? "md" : "txt", warnings };
  }

  if (declared === "pdf") return extractPdf(bytes, warnings);

  if (declared === "docx") {
    if (!looksLikeText(bytes)) {
      const result = readDocx(bytes);
      return { text: "", format: "docx", warnings: [...warnings, ...result.warnings] };
    }
    warnings.push("The file is named as a DOCX but its bytes are not a zip archive; it was read as plain text.");
    const text = normalisePlain(decodeText(bytes, warnings));
    if (!text) warnings.push("The file contained no text.");
    return { text, format: "txt", warnings };
  }

  if (declared === "txt" || declared === "md") {
    if (!looksLikeText(bytes)) {
      warnings.push("The file contains binary data and could not be read as text.");
      return { text: "", format: "unknown", warnings };
    }
    const text = normalisePlain(decodeText(bytes, warnings));
    if (!text) warnings.push("The file contained no text.");
    return { text, format: declared, warnings };
  }

  if (looksLikeText(bytes)) {
    warnings.push("The file type was not recognised from its name or MIME type; the content was read as plain text.");
    const text = normalisePlain(decodeText(bytes, warnings));
    if (!text) warnings.push("The file contained no text.");
    return { text, format: "txt", warnings };
  }

  warnings.push("The file type was not recognised. Supported formats are .txt, .md, .docx and .pdf.");
  return { text: "", format: "unknown", warnings };
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
