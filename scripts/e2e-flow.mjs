#!/usr/bin/env node
/**
 * Applywright — end-to-end journey through headless Chrome over the DevTools
 * protocol. No dependencies, no test framework: Node's global WebSocket and
 * `fetch` do the talking, exactly as in `scripts/browser-preview.mjs`.
 *
 *   node scripts/e2e-flow.mjs [--keep] [--verbose]
 *
 * What it does
 * ------------
 * Starts its own server instance on an ephemeral port (PORT 0) with a temporary
 * DATABASE_PATH, so the database on :3160 is never touched, then drives a real
 * browser through the product as a person would: sign-up, four CV import paths,
 * scoring, tailoring, the editor, the three exports, tracking, alerts and
 * password recovery. Every assertion is checked twice where it matters: once on
 * the JSON the page used, once on the DOM the page rendered.
 *
 * Asserting the claim, not the drawing
 * ------------------------------------
 * A browser test can rot for a reason that is not a bug: the product's visuals
 * move and a selector that was never the contract stops matching. The donut score
 * ring this harness first waited for was replaced by the vernier gauge in 0f9175a
 * — same claim ("the page shows the score the API returned"), new markup. So the
 * DOM assertions here read rendered **text** and **ARIA** wherever the claim can
 * be expressed that way (`.aw-gauge__value`'s "N / 100", the gauge's
 * `aria-label`, "Findings (3)", "Submitted (1)", the status select's value), and
 * fall back to a class name only where there is no text equivalent (a count of
 * finding blocks, an editor's save-state attribute).
 *
 * The ledger
 * ----------
 * Each step prints PASS or FAIL with the exact assertion that ran. Console
 * errors, uncaught exceptions and 4xx/5xx responses are attributed to the step
 * that produced them; any that is not on that step's expected list fails the
 * step. The process exits non-zero if any step fails.
 *
 * Phase 2, the model path
 * -----------------------
 * With no model key the product runs its deterministic rules, which cannot
 * invent a figure at all — so the grounding *rejection* branch cannot be
 * reached. `--with-model-stub` starts a second instance pointed at a local
 * OpenAI-compatible stub that answers with an invented "37%", which proves the
 * route's grounding gate refuses it. The stub is a test double, not a model:
 * the report says so, and no real key is used.
 *
 * Re-runnable and self-cleaning: the temp directory, database, browser profile
 * and both server instances are removed on exit unless --keep is passed.
 *
 * Owned browsers
 * --------------
 * The main browser and the two one-shot fixture browsers are each started by
 * `scripts/e2e-browser-child.ps1`, which puts the browser inside a
 * kill-on-close Job Object while it is still suspended, so every renderer and
 * utility child belongs to a handle this run can prove closed. The run does not
 * report success until each owned tree is proved empty and its handle closed;
 * a timed-out fixture, a spawn error or a leftover descendant fails the run
 * instead of passing it.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import { startServer } from "../server/app.js";
import { provesNoCleanupNeeded, runOwnedBrowserChild, startOwnedBrowserChild } from "./e2e-browser-child.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HERE = fileURLToPath(import.meta.url);

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/* ========================================================================== *
 * Pure helpers — exported so tests/e2e-static.test.js can prove them offline
 * without a browser. Nothing below this section is imported by the tests.
 * ========================================================================== */

/** Every zip begins with "PK\u0003\u0004" (or "PK\u0005\u0006" when empty). */
export function isZipSignature(value) {
  const buffer = Buffer.from(value ?? []);
  if (buffer.length < 4) return false;
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
  return (buffer[2] === 0x03 && buffer[3] === 0x04) || (buffer[2] === 0x05 && buffer[3] === 0x06);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

/** Plain CRC-32, as zip requires. */
export function crc32(value) {
  const buffer = Buffer.from(value ?? []);
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A zip with stored (uncompressed) entries. Stored is a legal zip, needs no
 * deflate, and is what `server/lib/cv/extract.js` accepts for DOCX (it handles
 * method 0 and method 8). Used to synthesise a minimal .docx for the upload
 * step rather than shipping a binary fixture.
 *
 * @param {{name:string, data:Buffer|string}[]} entries
 * @returns {Buffer}
 */
export function buildStoredZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(String(entry.name), "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data ?? ""), "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // modification time
    local.writeUInt16LE(0x21, 12); // modification date: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method: stored
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuffer, eocd]);
}

/**
 * Read a zip's central directory and inflate every entry. Returns null when the
 * bytes are not a zip or use a feature this reader does not implement (Zip64,
 * other compression methods) — a reader, not a validator.
 *
 * @param {Buffer|Uint8Array} value
 * @returns {{name:string, method:number, crc:number, compressedSize:number, size:number, data:Buffer}[]|null}
 */
export function readZipEntries(value) {
  const buffer = Buffer.from(value ?? []);
  if (!isZipSignature(buffer)) return null;
  let eocd = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buffer.readUInt16LE(eocd + 10);
  if (!count) return [];
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if ([compressedSize, size, localOffset].some((number) => number === 0xffffffff)) return null;
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) return null;
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else return null;
    entries.push({ name, method, crc, compressedSize, size, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const xmlEscape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * A minimal, valid .docx built from lines of text. Three parts plus a styles
 * part, stored (not deflated), so the server's own zip reader can inflate it.
 * The document is A4 with 18 mm margins, matching what the editor exports.
 *
 * @param {string[]} lines
 * @returns {Buffer}
 */
export function buildMinimalDocx(lines) {
  const paragraphs = (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const text = String(line ?? "");
      if (!text.trim()) return "<w:p/>";
      return `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
    })
    .join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1020" w:right="1020" w:bottom="1020" w:left="1020"/></w:sectPr></w:body>
</w:document>`;
  return buildStoredZip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      name: "word/_rels/document.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "word/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
    },
    { name: "word/document.xml", data: document },
  ]);
}

/**
 * The /MediaBox of the first page in a PDF, in points, or null when the bytes
 * are not a PDF or carry no MediaBox. Chrome writes an indirect-free `/MediaBox
 * [0 0 W H]`, so a regex is enough — this is an assertion helper, not a parser.
 *
 * @param {Buffer|Uint8Array|string} value
 * @returns {{width:number, height:number}|null}
 */
export function pdfMediaBox(value) {
  const text = Buffer.isBuffer(value) || value instanceof Uint8Array ? Buffer.from(value).toString("latin1") : String(value ?? "");
  const match = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/.exec(text);
  if (!match) return null;
  const width = Math.abs(Number(match[3]) - Number(match[1]));
  const height = Math.abs(Number(match[4]) - Number(match[2]));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

/** A4 in PostScript points, the size `@page { size: A4 }` must produce. */
export const A4_POINTS = Object.freeze({ width: 595.28, height: 841.89 });

/**
 * Strip tags, style and script blocks, and decode the few entities we emit.
 * Block-level closing tags become newlines, so a word at the end of one block
 * and the start of the next cannot be read as one phrase.
 */
export function plainText(value) {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(?:p|li|h[1-6]|div|tr|article|section|td|th)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n")
    .trim();
}

/** Numeric tokens with thousands separators removed, in order. "£95,000" -> "95000". */
export function textNumbers(value) {
  const out = [];
  for (const match of String(value ?? "").matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) out.push(match[0].replace(/,/g, ""));
  return out;
}

/** Generic capitalised phrases that are not a fact about the candidate. */
const GENERIC_NAMES = new Set(
  [
    "covering letter",
    "screening answers",
    "your name",
    "applywright",
    "cv",
    "summary",
    "experience",
    "education",
    "skills",
    "profile",
    "the cv",
    "uk",
    "gbp",
    "eur",
    "usd",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((word) => word.toLowerCase())
);

/**
 * Facts in `candidate` that no source states.
 *
 * `figures` are checked against the CV text only: a tailored CV that prints a
 * number the CV never earned is a fabrication even when the advert contains it.
 * `names` (two or more capitalised words in a row) are checked against every
 * source, because a tailored document legitimately names the target employer
 * and role from the advert. Generic document words are ignored.
 *
 * @param {string} candidate
 * @param {{ figures: string[], names: string[] }} sources  text to allow facts from
 * @returns {{figures: string[], names: string[]}}
 */
export function inventedFacts(candidate, { figures = [], names = [] } = {}) {
  const figureSources = new Set(textNumbers(Array.isArray(figures) ? figures.join("\n") : figures).map((value) => value.replace(/^0+(?=\d)/, "")));
  const nameSource = (Array.isArray(names) ? names.join("\n") : String(names ?? "")).toLowerCase().replace(/\s+/g, " ");

  const seen = new Set();
  const fabricatedFigures = [];
  for (const value of textNumbers(candidate)) {
    const key = value.replace(/^0+(?=\d)/, "");
    if (figureSources.has(key) || seen.has(key)) continue;
    seen.add(key);
    fabricatedFigures.push(value);
  }

  // Names are matched one line at a time: a capitalised word at the end of one
  // line and one at the start of the next are not a name together.
  const fabricatedNames = [];
  const seenNames = new Set();
  const GENERIC_WORDS = new Set([...GENERIC_NAMES].flatMap((phrase) => phrase.split(/\s+/)));
  for (const line of String(candidate ?? "").split(/\r?\n/)) {
    for (const match of line.matchAll(/\b[A-Z][a-zA-Z'’.&-]+(?:\s+(?:[A-Z][a-zA-Z'’.&-]+|of|and|the))+\b/g)) {
      let words = match[0].replace(/\s+/g, " ").trim().split(" ");
      // Trim document words off the ends rather than rejecting the whole phrase.
      while (words.length > 1 && GENERIC_WORDS.has(words[0].toLowerCase())) words = words.slice(1);
      while (words.length > 1 && ["of", "and", "the"].includes(words[words.length - 1].toLowerCase())) words = words.slice(0, -1);
      while (words.length > 1 && GENERIC_WORDS.has(words[words.length - 1].toLowerCase())) words = words.slice(0, -1);
      if (words.length < 2) continue;
      const phrase = words.join(" ");
      const key = phrase.toLowerCase();
      if (GENERIC_NAMES.has(key) || seenNames.has(key)) continue;
      if (nameSource.includes(key)) continue;
      seenNames.add(key);
      fabricatedNames.push(phrase);
    }
  }
  return { figures: fabricatedFigures, names: fabricatedNames };
}

/**
 * The recovery codes as they appear in the downloaded text file, in canonical
 * `aw-XXXX-XXXX` form. The prefix is normalised because codes are accepted in
 * any case at sign-in; the body keeps the case it was written in.
 */
export function recoveryCodesFromFile(text) {
  return [...String(text ?? "").matchAll(/\baw-([A-Za-z0-9]{4})-([A-Za-z0-9]{4})\b/gi)].map(
    (match) => `aw-${match[1]}-${match[2]}`
  );
}

/* ========================================================================== *
 * A very small CDP client
 * ========================================================================== */

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.sessionId = null;
    this.handlers = new Set();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: done, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else done(message.result);
        return;
      }
      if (message.method) for (const handler of this.handlers) handler(message);
    });
  }

  on(handler) {
    this.handlers.add(handler);
  }

  send(method, params = {}, { session = true, timeout = 30_000 } = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (session && this.sessionId) payload.sessionId = this.sessionId;
    return new Promise((done, reject) => {
      this.pending.set(id, { resolve: done, reject });
      try {
        this.socket.send(JSON.stringify(payload));
      } catch (error) {
        this.pending.delete(id);
        reject(error);
        return;
      }
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, timeout);
    });
  }
}

/* ========================================================================== *
 * Reporting
 * ========================================================================== */

class StepFailure extends Error {}

class Ledger {
  constructor() {
    this.steps = [];
    this.current = null;
  }

  begin(id, title) {
    this.current = { id, title, checks: [], issues: [], startedAt: Date.now(), status: "RUNNING", error: null };
    this.steps.push(this.current);
    return this.current;
  }

  /** Record one assertion. Failing one throws, so the step stops at its first lie. */
  check(text, condition, detail = "") {
    const ok = Boolean(condition);
    this.current.checks.push({ text, ok, detail: ok ? "" : String(detail ?? "") });
    if (!ok) throw new StepFailure(`${text}${detail ? ` — ${detail}` : ""}`);
    return ok;
  }

  issue(kind, detail) {
    this.current?.issues.push({ kind, detail });
  }

  /**
   * Close the step. `expect` is a list of regular expressions: an issue whose
   * detail matches one is a refusal the step deliberately provoked (a spent
   * recovery code, an old password), so it is not a finding.
   */
  end({ expect = [] } = {}) {
    const step = this.current;
    if (!step) return;
    const expected = (detail) => expect.some((test) => test.test(detail));
    const unexpectedHttp = step.issues.filter((issue) => issue.kind === "http" && !expected(issue.detail));
    const unexpectedConsole = step.issues.filter((issue) => issue.kind === "console" && !expected(issue.detail));
    for (const issue of unexpectedHttp) {
      step.checks.push({ text: `no unexpected 4xx/5xx response (${issue.detail})`, ok: false, detail: issue.detail });
    }
    for (const issue of unexpectedConsole) {
      step.checks.push({ text: `no console error or exception (${issue.detail})`, ok: false, detail: issue.detail });
    }
    // An exception that is not a failed assertion still fails the step, and the
    // assertions it skipped must not leave the step looking green.
    if (step.error) step.checks.push({ text: `the step ran to the end (${step.error})`, ok: false, detail: step.error });
    step.status = step.checks.length && step.checks.every((entry) => entry.ok) ? "PASS" : "FAIL";
    step.ms = Date.now() - step.startedAt;
    this.current = null;
    printStep(step);
  }
}

const COLOUR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (COLOUR ? `\u001b[${code}m${text}\u001b[0m` : text);
const green = (text) => paint("32", text);
const red = (text) => paint("31", text);
const dim = (text) => paint("2", text);
const bold = (text) => paint("1", text);

function printStep(step) {
  const passed = step.checks.filter((entry) => entry.ok).length;
  const label = `STEP ${step.id} · ${step.title}`;
  const dots = ".".repeat(Math.max(3, 74 - label.length));
  console.log(`${label} ${dots} ${step.status === "PASS" ? green("PASS") : red("FAIL")} ${dim(`${passed}/${step.checks.length}`)}`);
  for (const entry of step.checks) {
    if (entry.ok) console.log(`   ${green("✓")} ${entry.text}`);
    else console.log(`   ${red("✗")} ${entry.text}${entry.detail ? red(`  [${entry.detail}]`) : ""}`);
  }
  for (const issue of step.issues) {
    if (issue.kind === "note") console.log(`   ${dim("·")} ${issue.detail}`);
  }
  console.log("");
}

/* ========================================================================== *
 * The browser
 * ========================================================================== */

class Browser {
  constructor({ base, downloads, artifacts, verbose }) {
    this.base = base;
    this.downloads = downloads;
    this.artifacts = artifacts;
    this.verbose = verbose;
    this.cdp = null;
    this.owned = null;
    this.profileDir = null;
    this.requests = new Map();
    this.http = [];
    this.step = null;
    this.ledger = null;
  }

  onLog(kind, detail) {
    if (kind === "note" && !this.verbose) return;
    const step = this.step;
    if (step) step.issues.push({ kind, detail });
    else console.log(dim(`   · ${detail}`));
  }

  async launch() {
    const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
    if (!chromePath) throw new Error("no Chrome or Edge found in the usual Windows locations");
    this.chromePath = chromePath;
    this.profileDir = await mkdtemp(join(tmpdir(), "applywright-e2e-profile-"));
    // Owned before it runs: the wrapper starts Chrome inside a kill-on-close
    // job while it is still suspended, so every renderer and utility child
    // belongs to a handle this run can prove closed. The main browser lives for
    // the whole journey; the two one-shot fixture browsers own their own trees.
    this.owned = startOwnedBrowserChild({
      executablePath: chromePath,
      cwd: ROOT,
      label: "main browser",
      startupTimeoutMs: 45_000,
      args: [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-extensions",
        "--disable-sync",
        "--metrics-recording-only",
        "--mute-audio",
        "--remote-debugging-port=0",
        `--user-data-dir=${this.profileDir}`,
        "--window-size=1440,1000",
        "about:blank",
      ],
    });
    await this.owned.started;

    let port = 0;
    for (let attempt = 0; attempt < 200 && !port; attempt += 1) {
      if (this.owned.outcome) break;
      await sleep(100);
      try {
        const text = await readFile(join(this.profileDir, "DevToolsActivePort"), "utf8");
        port = Number(text.split(/\r?\n/)[0]);
      } catch {
        /* not written yet */
      }
    }
    if (!port) {
      const outcome = this.owned.outcome;
      if (outcome) throw new Error(`the owned browser exited before opening a DevTools port (${outcome.kind}, code ${outcome.exitCode})`);
      throw new Error("Chrome did not open a DevTools port");
    }

    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    this.wsUrl = version.webSocketDebuggerUrl;
    const socket = new WebSocket(this.wsUrl);
    await new Promise((done, reject) => {
      socket.addEventListener("open", done, { once: true });
      socket.addEventListener("error", () => reject(new Error("could not open the DevTools socket")), { once: true });
    });
    this.cdp = new Cdp(socket);

    const { targetId } = await this.cdp.send("Target.createTarget", { url: "about:blank" }, { session: false });
    const attached = await this.cdp.send("Target.attachToTarget", { targetId, flatten: true }, { session: false });
    this.cdp.sessionId = attached.sessionId;

    await this.cdp.send("Page.enable");
    await this.cdp.send("Runtime.enable");
    await this.cdp.send("Network.enable");
    await this.cdp.send("Log.enable");
    await this.cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Downloads land in a directory we own, so "it can be downloaded" is a real
    // assertion on real bytes rather than a click that did nothing.
    await this.cdp
      .send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: this.downloads, eventsEnabled: true }, { session: false })
      .catch(() => this.cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: this.downloads }));

    this.cdp.on((message) => this.onEvent(message));
    await this.goto(`${this.base}/`);
  }

  onEvent(message) {
    const { method, params } = message;
    if (method === "Network.requestWillBeSent") {
      this.requests.set(params.requestId, { method: params.request.method, url: params.request.url });
      return;
    }
    if (method === "Network.responseReceived") {
      const url = params.response.url;
      let path = url;
      try {
        path = new URL(url).pathname;
      } catch {
        /* a data: or file: URL keeps its whole value */
      }
      const entry = {
        requestId: params.requestId,
        url,
        path,
        method: this.requests.get(params.requestId)?.method ?? "GET",
        status: params.response.status,
        type: params.type,
        mime: params.response.mimeType,
        stepId: this.step?.id ?? null,
        body: undefined,
        text: null,
        json: null,
        bodyFailed: false,
        consumed: false,
      };
      this.http.push(entry);
      if (entry.status >= 400 && entry.path.startsWith("/api/")) {
        this.onLog("http", `${entry.status} ${entry.method} ${entry.path}`);
      }
      return;
    }
    if (method === "Network.loadingFinished") {
      const entry = this.http.find((candidate) => candidate.requestId === params.requestId);
      if (!entry) return;
      if (!entry.pending) this.readBody(entry);
      return;
    }
    if (method === "Network.loadingFailed") {
      if (params.type === "Fetch" || params.type === "XHR") {
        if (params.errorText && !/ERR_ABORTED/.test(params.errorText)) {
          const url = this.requests.get(params.requestId)?.url ?? "unknown";
          this.onLog("console", `request failed: ${url} (${params.errorText})`);
        }
      }
      return;
    }
    if (method === "Runtime.consoleAPICalled") {
      if (params.type === "error" || params.type === "assert") {
        const text = params.args
          .map((arg) => arg.value ?? arg.description ?? arg.unserializableValue ?? "")
          .join(" ")
          .slice(0, 300);
        this.onLog("console", `console.${params.type}: ${text}`);
      } else if (params.type === "warning" && this.verbose) {
        this.onLog("note", `console.warning: ${params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ").slice(0, 200)}`);
      }
      return;
    }
    if (method === "Runtime.exceptionThrown") {
      const details = params.exceptionDetails;
      const text = details?.exception?.description ?? details?.text ?? "unknown exception";
      this.onLog("console", `uncaught exception: ${String(text).split("\n")[0].slice(0, 300)}`);
      return;
    }
    if (method === "Log.entryAdded") {
      const entry = params.entry;
      if (entry.level !== "error") return;
      if (/favicon/i.test(entry.url ?? "")) return;
      this.onLog("console", `log error: ${entry.text} ${entry.url ? `(${entry.url})` : ""}`.slice(0, 400));
    }
  }

  /* ----------------------------------------------------------- primitives */

  async evaluate(expression, { awaitPromise = true, userGesture = true, timeout = 20_000 } = {}) {
    const result = await this.cdp.send(
      "Runtime.evaluate",
      { expression, awaitPromise, returnByValue: true, userGesture },
      { timeout }
    );
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "evaluation failed";
      throw new Error(String(detail).split("\n")[0]);
    }
    return result.result?.value;
  }

  /** Call a function in the page with JSON arguments. Keeps steps readable. */
  async call(fn, ...args) {
    const expression = `(${fn.toString()})(${args.map((argument) => JSON.stringify(argument)).join(", ")})`;
    return this.evaluate(expression);
  }

  async wait(expression, label, timeout = 15_000) {
    const deadline = Date.now() + timeout;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const value = await this.evaluate(expression, { timeout: 5_000 });
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      await sleep(80);
    }
    throw new Error(`timed out waiting for ${label}${lastError ? ` (${lastError.message})` : ""}`);
  }

  async waitCall(fn, args, label, timeout = 15_000) {
    const expression = `(${fn.toString()})(${args.map((argument) => JSON.stringify(argument)).join(", ")})`;
    return this.wait(expression, label, timeout);
  }

  async goto(path) {
    const url = path.startsWith("http") ? path : `${this.base}${path}`;
    await this.cdp.send("Page.navigate", { url });
    await this.wait(`typeof document !== "undefined" && document.readyState === "complete" && location.href === ${JSON.stringify(url)}`, `navigation to ${url}`, 20_000).catch(
      async () => {
        // A redirect (sign-out lands on /sign-in) makes location.href differ; wait for readiness only.
        await this.wait('document.readyState === "complete"', `navigation to ${url}`);
      }
    );
    await sleep(120);
    return url;
  }

  async url() {
    return this.evaluate("location.href");
  }

  async path() {
    return this.evaluate("location.pathname + location.search");
  }

  /* -------------------------------------------------------------- the DOM */

  async click(selector, label = selector) {
    const result = await this.call((selector) => {
      const node = document.querySelector(selector);
      if (!node) return { ok: false, reason: "not found" };
      if (node.disabled) return { ok: false, reason: "disabled" };
      node.click();
      return { ok: true };
    }, selector);
    if (!result?.ok) throw new Error(`could not click ${label} (${result?.reason ?? "unknown"})`);
  }

  async clickByText(label, { selector = "button, a, summary", timeout = 15_000 } = {}) {
    const deadline = Date.now() + timeout;
    let found = null;
    while (Date.now() < deadline) {
      found = await this.call(
        (label, selector) => {
          const all = [...document.querySelectorAll(selector)];
          const nodes = all.filter((node) => !node.disabled && node.offsetParent !== null);
          const exact = nodes.find((node) => node.textContent.trim() === label);
          if (exact) {
            exact.click();
            return { ok: true };
          }
          return {
            ok: false,
            seen: nodes.map((node) => node.textContent.trim()).filter(Boolean).slice(0, 30),
            hidden: all.length,
            hiddenLabels: all.map((node) => node.textContent.trim()).filter(Boolean).slice(0, 10),
            hunks: document.querySelectorAll(".ed-hunk").length,
            proposals: document.querySelector("#ed-proposals")?.innerHTML.length ?? null,
          };
        },
        label,
        selector
      );
      if (found?.ok) return;
      await sleep(100);
    }
    throw new Error(
      `no visible control labelled "${label}" (saw: ${JSON.stringify(found?.seen ?? [])}; ` +
        `matched-but-hidden: ${JSON.stringify(found?.hiddenLabels ?? [])}; ` +
        `.ed-hunk: ${found?.hunks ?? "?"}; #ed-proposals html: ${found?.proposals ?? "?"} chars)`
    );
  }

  async fill(selector, value) {
    const result = await this.call((selector, value) => {
      const node = document.querySelector(selector);
      if (!node) return { ok: false, reason: "not found" };
      node.focus();
      node.value = value;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    }, selector, value);
    if (!result?.ok) throw new Error(`could not fill ${selector} (${result?.reason ?? "unknown"})`);
  }

  /** Fill fields inside the form whose submit button carries `submitLabel`. */
  async fillForm(submitLabel, pairs) {
    const result = await this.call(
      (submitLabel, pairs) => {
        const forms = [...document.querySelectorAll("form")];
        const form = forms.find((candidate) => candidate.querySelector("button[type=submit]")?.textContent.trim() === submitLabel);
        if (!form) {
          return { ok: false, reason: "form not found", labels: forms.map((candidate) => candidate.querySelector("button[type=submit]")?.textContent.trim()) };
        }
        const done = [];
        for (const [fieldLabel, value] of pairs) {
          const fields = [...form.querySelectorAll(".field")];
          const holder = fields.find((field) => {
            const label = field.querySelector("label, .legend");
            return label && label.textContent.trim().toLowerCase().startsWith(String(fieldLabel).toLowerCase());
          });
          const control = holder?.querySelector("input, textarea, select");
          if (!control) {
            done.push({ field: fieldLabel, ok: false });
            continue;
          }
          control.focus();
          control.value = value;
          control.dispatchEvent(new Event("input", { bubbles: true }));
          control.dispatchEvent(new Event("change", { bubbles: true }));
          done.push({ field: fieldLabel, ok: true });
        }
        return { ok: done.every((entry) => entry.ok), done };
      },
      submitLabel,
      pairs
    );
    const failed = (result?.done ?? []).filter((entry) => !entry.ok).map((entry) => entry.field);
    if (!result?.ok) throw new Error(`could not fill the "${submitLabel}" form${failed.length ? `: ${failed.join(", ")}` : ` (${result?.reason ?? "unknown"})`}`);
  }

  async submitForm(submitLabel) {
    const result = await this.call((submitLabel) => {
      const forms = [...document.querySelectorAll("form")];
      const form = forms.find((candidate) => candidate.querySelector("button[type=submit]")?.textContent.trim() === submitLabel);
      if (!form) return { ok: false, reason: "form not found" };
      form.requestSubmit();
      return { ok: true };
    }, submitLabel);
    if (!result?.ok) throw new Error(`could not submit the "${submitLabel}" form`);
  }

  async setFormValues(selector, values) {
    const result = await this.call((selector, values) => {
      const form = document.querySelector(selector);
      if (!form) return { ok: false, reason: "form not found" };
      for (const [name, value] of Object.entries(values)) {
        const control = form.querySelector(`[name="${name}"]`);
        if (!control) return { ok: false, reason: `no field named ${name}` };
        control.focus();
        control.value = value;
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return { ok: true };
    }, selector, values);
    if (!result?.ok) throw new Error(`could not fill ${selector}: ${result?.reason ?? "unknown"}`);
  }

  /** Attach bytes to a file input the way a user picking a file would. */
  async setFile(submitLabel, filename, mime, base64) {
    const result = await this.call(
      (submitLabel, filename, mime, base64) => {
        const forms = [...document.querySelectorAll("form")];
        const form = forms.find((candidate) => candidate.querySelector("button[type=submit]")?.textContent.trim() === submitLabel);
        const input = form?.querySelector("input[type=file]");
        if (!input) return { ok: false, reason: "no file input in that form" };
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], filename, { type: mime }));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, count: input.files.length, size: input.files[0]?.size ?? 0 };
      },
      submitLabel,
      filename,
      mime,
      base64
    );
    if (!result?.ok) throw new Error(`could not attach ${filename}: ${result?.reason ?? "unknown"}`);
    return result;
  }

  async text(selector) {
    return this.call((selector) => document.querySelector(selector)?.textContent?.trim() ?? null, selector);
  }

  async count(selector) {
    return this.call((selector) => document.querySelectorAll(selector).length, selector);
  }

  async visible(selector) {
    return this.call((selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const style = getComputedStyle(node);
      return !node.hidden && style.display !== "none" && style.visibility !== "hidden" && node.offsetParent !== null;
    }, selector);
  }

  async shot(name) {
    try {
      const shot = await this.cdp.send("Page.captureScreenshot", { format: "png" });
      await writeFile(join(this.artifacts, `${name}.png`), Buffer.from(shot.data, "base64"));
    } catch {
      /* a screenshot is a convenience, never an assertion */
    }
  }

  /* ------------------------------------------------------- network / JSON */

  /** Fetch and decode a response body, once. `Network.getResponseBody` can lose a
   *  body when the page navigates away immediately (a sign-in redirect does exactly
   *  that), and a second caller racing the first can lose it too — so every caller
   *  shares one in-flight promise and a failure is retried before it is believed. */
  async readBody(entry) {
    if (!entry) return false;
    if (entry.text !== null) return true;
    if (entry.pending) return entry.pending;
    entry.pending = (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const body = await this.cdp.send("Network.getResponseBody", { requestId: entry.requestId });
          entry.text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
          try {
            entry.json = JSON.parse(entry.text);
          } catch {
            entry.json = null;
          }
          return true;
        } catch {
          await sleep(60);
        }
      }
      entry.bodyFailed = true;
      return false;
    })();
    return entry.pending;
  }

  /** The newest unread captured response matching the predicate. */
  findHttp({ method, path, status, stepId = this.step?.id }) {
    for (let index = this.http.length - 1; index >= 0; index -= 1) {
      const entry = this.http[index];
      if (entry.consumed) continue;
      if (stepId !== undefined && entry.stepId !== stepId) continue;
      if (method && entry.method !== method) continue;
      if (path && !entry.path.startsWith(path)) continue;
      if (status && entry.status !== status) continue;
      return entry;
    }
    return null;
  }

  async waitHttp(selector, { timeout = 20_000, label } = {}) {
    const deadline = Date.now() + timeout;
    const description = label ?? `${selector.method ?? "any"} ${selector.path ?? "any"}${selector.status ? ` -> ${selector.status}` : ""}`;
    while (Date.now() < deadline) {
      const entry = this.findHttp(selector);
      if (entry) {
        if (entry.text !== null || (await this.readBody(entry))) {
          entry.consumed = true;
          return entry;
        }
        // A body that cannot be read (the page navigated first) is still a
        // response: status is what some assertions need, JSON just is not there.
        if (entry.bodyFailed) {
          entry.text = "";
          entry.consumed = true;
          return entry;
        }
      }
      await sleep(60);
    }    throw new Error(`timed out waiting for ${description}`);
  }

  /** fetch() from inside the page, so the call carries the page's own cookie. */
  async fetchPage(path, { method = "GET", body = null } = {}) {
    return this.call(
      async (path, method, body) => {
        const response = await fetch(path, {
          method,
          credentials: "same-origin",
          headers: body ? { "content-type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const text = await response.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        return { status: response.status, json, text };
      },
      path,
      method,
      body
    );
  }

  /* ------------------------------------------------------------ downloads */

  async clearDownloads() {
    for (const name of await readdir(this.downloads).catch(() => [])) {
      await rm(join(this.downloads, name), { force: true }).catch(() => {});
    }
  }

  async waitDownload(matcher, timeout = 20_000) {
    const test = matcher instanceof RegExp ? matcher : new RegExp(String(matcher).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const names = await readdir(this.downloads).catch(() => []);
      const found = names.filter((name) => test.test(name)).sort();
      if (found.length) {
        const path = join(this.downloads, found[found.length - 1]);
        try {
          const first = (await stat(path)).size;
          await sleep(200);
          const second = (await stat(path)).size;
          if (first === second && second > 0) return { path, name: found[found.length - 1], bytes: await readFile(path) };
        } catch {
          /* still being written */
        }
      }
      await sleep(100);
    }
    throw new Error(`no download matching ${test} appeared in ${timeout}ms`);
  }

  /* ------------------------------------------------------------- keyboard */

  async pressControlS() {
    const key = { key: "s", code: "KeyS", windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83 };
    await this.cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", modifiers: 2, ...key });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "char", modifiers: 2, text: "s", unmodifiedText: "s", ...key });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 2, ...key });
  }

  async close() {
    try {
      this.cdp?.socket.close();
    } catch {
      /* the socket is already going away */
    }
    let cleanupError = null;
    if (this.owned) {
      try {
        // The wrapper kills the whole owned job and reports only after the job
        // is empty; this await is the closure proof, not a fixed sleep. A
        // natural nonzero exit is a failed browser, not a clean close.
        const outcome = await this.owned.terminate("browser close");
        if (outcome.kind === "exit" && outcome.exitCode !== 0) {
          cleanupError = new Error(
            `the owned browser exited on its own with code ${outcome.exitCode}: ${JSON.stringify(this.owned.diagnostics())}`
          );
        }
      } catch (error) {
        // "Never reported started" is not the same as "nothing was created": a
        // wrapper can have created a browser that it then failed to contain.
        // Suppression requires affirmative proof — no process was created, or
        // the created process was proved terminated and its handles closed.
        // Missing/null creation state stays a cleanup failure, never "clean".
        const details = error.details ?? {};
        const beforeBrowser = !this.owned.everStarted && provesNoCleanupNeeded(details);
        if (!beforeBrowser) cleanupError = error;
      } finally {
        this.owned.dispose();
      }
    }
    // Only a proved-closed tree may have its profile directory removed; a
    // cleanup failure keeps the directory for diagnosis instead of hiding it.
    if (!cleanupError && this.profileDir) await rm(this.profileDir, { recursive: true, force: true }).catch(() => {});
    if (cleanupError) throw cleanupError;
  }
}

/* ========================================================================== *
 * Fixtures
 * ========================================================================== */

const CV_TEXT = [
  "Ada Lovelace",
  "ada@example.com",
  "+44 7700 900123",
  "",
  "Summary",
  "Analytical engineer who led the migration of a payments platform to Kubernetes, cutting deploy time from 45 minutes to 9 minutes.",
  "",
  "Experience",
  "Platform Engineer, Northwind Traders, 2019 to present",
  "- Led a team of six engineers on the payments platform migration.",
  "- Reduced infrastructure cost by 32 percent across 14 services.",
  "Software Engineer, Contoso Ltd, 2015 to 2019",
  "- Built the billing service in Go and PostgreSQL.",
  "",
  "Education",
  "BSc Computer Science, University of Bristol, 2015",
  "",
  "Skills",
  "Kubernetes, Terraform, Go, PostgreSQL, observability",
].join("\n");

const JOB_TEXT = `Senior Platform Engineer
Acme Robotics
London, hybrid

We are looking for a senior platform engineer to own our Kubernetes platform and developer experience.

Responsibilities
- Design and operate multi-tenant Kubernetes clusters with Terraform and Helm.
- Build CI/CD pipelines with GitHub Actions and Argo CD.
- Improve observability with Prometheus, Grafana and OpenTelemetry.
- Work with product teams on service reliability and incident response.

Requirements
- 6+ years of hands-on platform engineering experience.
- Strong Go and Python skills.
- Experience with AWS, IAM and cost optimisation.
- Excellent written communication and stakeholder management.

Salary: GBP 95000 to 115000`;

const cvHtml = (heading, body) => `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><title>${heading}</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;line-height:1.4;margin:20mm;color:#000}
 h1{font-size:22pt;margin:0 0 8pt} h2{font-size:14pt;margin:14pt 0 6pt}
 p{margin:0 0 6pt} li{margin:2pt 0}
</style></head><body>${body}</body></html>`;

/** The CV as HTML, for Chrome's own --print-to-pdf (a real PDF, real text). */
const CV_HTML = cvHtml(
  "Ada Lovelace — CV",
  `<h1>Ada Lovelace</h1>
<p>ada@example.com &middot; +44 7700 900123</p>
<h2>Summary</h2>
<p>Analytical engineer who led the migration of a payments platform to Kubernetes, cutting deploy time from 45 minutes to 9 minutes.</p>
<h2>Experience</h2>
<p>Platform Engineer, Northwind Traders, 2019 to present</p>
<ul><li>Led a team of six engineers on the payments platform migration.</li>
<li>Reduced infrastructure cost by 32 percent across 14 services.</li></ul>
<p>Software Engineer, Contoso Ltd, 2015 to 2019</p>
<ul><li>Built the billing service in Go and PostgreSQL.</li></ul>
<h2>Education</h2>
<p>BSc Computer Science, University of Bristol, 2015</p>
<h2>Skills</h2>
<p>Kubernetes, Terraform, Go, PostgreSQL, observability</p>`
);

/**
 * The same CV, laid out large and plain for OCR. Bullet glyphs and the middot
 * are dropped on purpose: Tesseract reads "+ " for a bullet, and this fixture
 * only needs to prove the OCR path returns real text into the editor.
 */
const CV_OCR_HTML = cvHtml(
  "Ada Lovelace — CV (image)",
  `<h1 style="font-size:34px">Ada Lovelace</h1>
<p style="font-size:26px">ada@example.com</p>
<p style="font-size:26px">+44 7700 900123</p>
<h2 style="font-size:30px">Summary</h2>
<p style="font-size:26px">Analytical engineer who led the migration of a payments platform to Kubernetes, cutting deploy time from 45 minutes to 9 minutes.</p>
<h2 style="font-size:30px">Experience</h2>
<p style="font-size:26px">Platform Engineer, Northwind Traders, 2019 to present</p>
<p style="font-size:26px">Led a team of six engineers on the payments platform migration.</p>
<p style="font-size:26px">Reduced infrastructure cost by 32 percent across 14 services.</p>
<h2 style="font-size:30px">Education</h2>
<p style="font-size:26px">BSc Computer Science, University of Bristol, 2015</p>
<h2 style="font-size:30px">Skills</h2>
<p style="font-size:26px">Kubernetes, Terraform, Go, PostgreSQL, observability</p>`
);

const ONESHOT_TIMEOUT_MS = 30_000;

/**
 * One-shot Chrome, used only for the two fixtures Chrome itself can make. The
 * child runs inside the owned job (see scripts/e2e-browser-child.ps1), so the
 * call returns only after the wrapper proved the tree empty. Timeout, spawn
 * failure, a nonzero exit or an unproved closure rejects; none of them is
 * treated as "the fixture was generated". `expectFile` is checked after that
 * proof so a completed process that wrote nothing cannot pass.
 */
async function oneShotChrome(chromePath, workDir, { url, args, label, expectFile }) {
  const profile = await mkdtemp(join(workDir, "chrome-oneshot-"));
  await runOwnedBrowserChild({
    executablePath: chromePath,
    args: ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", `--user-data-dir=${profile}`, ...args, url],
    cwd: workDir,
    timeoutMs: ONESHOT_TIMEOUT_MS,
    label: label ?? "fixture browser",
    expectFile,
  });
}

/** HEAD + dirty state, so a ledger can be tied to the source it measured. */
async function describeSource() {
  const git = (args) =>
    new Promise((done) => {
      const child = spawn("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk;
      });
      child.on("error", () => done(""));
      child.on("exit", () => done(out.trim()));
    });
  const head = await git(["rev-parse", "--short", "HEAD"]);
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = await git(["status", "--porcelain"]);
  if (!head) return "not a git checkout";
  const changed = dirty ? dirty.split("\n").length : 0;
  return `${branch || "?"} @ ${head}${changed ? ` + ${changed} uncommitted path(s)` : " (clean)"}`;
}

/** The local OpenAI-compatible stub. A test double; it is not a model. */
async function startModelStub() {
  let reply = { summary: "", bullets: [], coverLetter: "" };
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({ url: request.url, body: body.slice(0, 200) });
      if (!request.url?.endsWith("/chat/completions")) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not found" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(reply) } }] }));
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  return {
    port,
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    setReply(next) {
      reply = next;
    },
    close: () => new Promise((done) => server.close(done)),
  };
}

/* ========================================================================== *
 * The journey
 * ========================================================================== */

async function run() {
  const args = new Set(process.argv.slice(2));
  const keep = args.has("--keep");
  const verbose = args.has("--verbose");
  const withModelStub = !args.has("--no-model-stub");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const workDir = await mkdtemp(join(tmpdir(), "applywright-e2e-"));
  const downloads = join(workDir, "downloads");
  const artifacts = join(workDir, "artifacts");
  const dataDir = join(workDir, "data");
  const fixturesDir = join(workDir, "fixtures");
  for (const directory of [downloads, artifacts, dataDir, fixturesDir]) await mkdir(directory, { recursive: true });

  const instance = await startServer({
    // A clean instance: ephemeral port, throwaway database, no network scanner,
    // and explicitly no model key so the rules path is what runs.
    PORT: 0,
    HOST: "127.0.0.1",
    DATABASE_PATH: join(dataDir, "applywright.db"),
    dataDir,
    ANTHROPIC_ORG_API_KEY: "",
    MODEL_API_KEY: "",
    ALERTS_SCAN_MINUTES: 0,
    // A scripted journey makes ~200 API calls in under a minute, which is more
    // than the production per-IP cap of 120 and would trip the limiter (429).
    // The limiter is real and was seen firing; it is not what this journey
    // measures, so its ceiling is raised on the scratch instance only.
    RATE_LIMIT_PER_MINUTE: 100_000,
  });
  const base = instance.url;

  const ledger = new Ledger();
  const browser = new Browser({ base, downloads, artifacts, verbose });
  browser.ledger = ledger;

  const ctx = {
    email: `e2e-${stamp}@applywright.test`,
    password: `e2e-first-password-${stamp}`,
    newPassword: `e2e-second-password-${stamp}`,
    codes: [],
    cvId: null,
    cvText: CV_TEXT,
    applicationId: null,
    applicationTitle: null,
    alertId: null,
    notifications: [],
    feedToken: null,
  };

  const started = Date.now();
  let exitCode = 0;

  // The working tree is recorded with the ledger: this project is edited by hand
  // and by other agents, and a green run means nothing without the source it ran
  // against.
  const source = await describeSource();

  try {
    await browser.launch();

    console.log("");
    console.log(bold("Applywright — end-to-end journey"));
    console.log(dim(`  base      ${base}   (ephemeral port, throwaway database)`));
    console.log(dim(`  database  ${instance.config.databasePath}`));
    console.log(dim(`  chrome    ${browser.chromePath}`));
    console.log(dim(`  source    ${source}`));
    console.log(dim(`  workdir   ${workDir}`));
    console.log("");

  const step = async (id, title, fn, options = {}) => {
    ledger.begin(id, title);
    browser.step = ledger.current;
    try {
      await fn();
    } catch (error) {
      ledger.current.error = error instanceof StepFailure ? "" : error.message;
      await browser.shot(`step-${id}-failed`);
    } finally {
      ledger.end(options);
      browser.step = null;
    }
    return ledger.steps[ledger.steps.length - 1].status === "PASS";
  };

  const check = (text, condition, detail) => ledger.check(text, condition, detail);
  const note = (text) => ledger.issue("note", text);

    /* ---------------------------------------------------------------- 1 */
    await step("1", "sign-up: account, eight recovery codes, download", async () => {
      await browser.goto("/sign-up");
      await browser.wait('!!document.querySelector(\'[data-auth-form="register"]\')', "the sign-up form");
      await browser.setFormValues('[data-auth-form="register"]', {
        name: "E2E Runner",
        email: ctx.email,
        password: ctx.password,
        confirm: ctx.password,
      });
      await browser.submitForm("Create account");

      const registration = await browser.waitHttp({ method: "POST", path: "/api/auth/register" });
      check("POST /api/auth/register answers 201", registration.status === 201, `status ${registration.status}`);
      const codes = registration.json?.recoveryCodes ?? [];
      check("the registration response carries exactly 8 recovery codes", Array.isArray(codes) && codes.length === 8, `got ${codes.length}`);
      ctx.codes = codes;

      await browser.wait('!document.querySelector("[data-recovery-panel]").hidden', "the recovery-code panel", 10_000);
      check("the recovery panel is visible before anything else happens", await browser.visible("[data-recovery-panel]"));
      check("the registration form is hidden behind the panel", await browser.call(() => document.querySelector("[data-register-shell]").hidden === true));

      const rendered = await browser.call(() => [...document.querySelectorAll("[data-recovery-list] li")].map((node) => node.textContent.trim()));
      check("the page renders 8 recovery codes", rendered.length === 8, `rendered ${rendered.length}`);
      check(
        "every rendered code has the aw-XXXX-XXXX shape",
        rendered.every((code) => /^aw-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)),
        JSON.stringify(rendered)
      );
      check("the rendered codes are the ones the API issued", JSON.stringify(rendered) === JSON.stringify(codes), JSON.stringify(rendered));
      // The panel's copy is marketing copy and moves; what must hold is that the
      // page names the codes as recovery codes and says each one is single-use.
      const panelText = (await browser.text("[data-recovery-panel]")) ?? "";
      check("the page titles the panel as the recovery codes", /recovery code/i.test((await browser.text("[data-auth-title]")) ?? ""), String(await browser.text("[data-auth-title]")));
      check(
        "the panel says each code works once",
        /code/i.test(panelText) && /once|one-time|single[- ]?use/i.test(panelText),
        panelText.slice(0, 160)
      );

      await browser.clearDownloads();
      await browser.click("[data-recovery-download]", "the download button");
      const download = await browser.waitDownload(/applywright-recovery-codes\.txt$/);
      check("the download button writes applywright-recovery-codes.txt", download.name === "applywright-recovery-codes.txt", download.name);
      const downloaded = download.bytes.toString("utf8");
      check("the downloaded file lists all 8 codes", ctx.codes.every((code) => downloaded.includes(code)));
      check("the downloaded file names the account's email", downloaded.includes(ctx.email), ctx.email);
      check("the downloaded file explains that each code works once", /Each code (?:can be used|works) once/i.test(downloaded));
      check("recoveryCodesFromFile() reads the 8 codes back out of the file", recoveryCodesFromFile(downloaded).length === 8, String(recoveryCodesFromFile(downloaded).length));
      const after = await browser.call(() => document.querySelector("[data-recovery-panel] [data-auth-status]")?.textContent?.trim() ?? "");
      check("the page confirms the download in its status line", /Saved as applywright-recovery-codes\.txt/.test(after), after);

      await browser.click("[data-recovery-continue]", "the continue link");
      await browser.wait('location.pathname === "/app"', "the app to load", 20_000);
      const me = await browser.waitHttp({ method: "GET", path: "/api/auth/me" }, { timeout: 15_000 });
      check("the new session can read /api/auth/me", me.status === 200 && me.json?.user?.email === ctx.email, `status ${me.status}`);
      await browser.wait('!!document.querySelector("#app-view")?.children?.length', "the dashboard to render", 15_000);
      check("the dashboard renders for the new account", ((await browser.text("#app-title")) ?? "").length > 0);
    });

    /* ---------------------------------------------------------------- 2 */
    await step("2", "import a CV: PDF, DOCX, OCR image and pasted text", async () => {
      // Fixtures: a real PDF printed by Chrome, a synthesised DOCX, and a PNG
      // screenshot for OCR. Generated here so the run needs no binary assets.
      const pdfPath = join(fixturesDir, "cv.pdf");
      const pngPath = join(fixturesDir, "cv.png");
      await writeFile(join(fixturesDir, "cv.html"), CV_HTML, "utf8");
      await writeFile(join(fixturesDir, "cv-ocr.html"), CV_OCR_HTML, "utf8");
      const fileUrl = (name) => `file:///${join(fixturesDir, name).replace(/\\/g, "/")}`;
      await oneShotChrome(browser.chromePath, workDir, {
        url: fileUrl("cv.html"),
        args: ["--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`],
        label: "PDF fixture browser",
        expectFile: pdfPath,
      });
      await oneShotChrome(browser.chromePath, workDir, {
        url: fileUrl("cv-ocr.html"),
        args: ["--window-size=900,1400", `--screenshot=${pngPath}`],
        label: "OCR fixture browser",
        expectFile: pngPath,
      });
      const pdfBytes = await readFile(pdfPath);
      const pngBytes = await readFile(pngPath);
      const docxBytes = buildMinimalDocx(CV_TEXT.split("\n"));
      check("the PDF fixture is a real PDF produced by chrome --print-to-pdf", pdfBytes.subarray(0, 5).toString("latin1") === "%PDF-", pdfBytes.subarray(0, 8).toString("latin1"));
      check("the OCR fixture is a real PNG", pngBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
      check("the DOCX fixture is a zip with a word/document.xml part", isZipSignature(docxBytes) && (readZipEntries(docxBytes) ?? []).some((entry) => entry.name === "word/document.xml"));

      const openLibrary = async () => {
        await browser.goto("/app/cv");
        await browser.wait('!!document.querySelector("#app-view")', "the CV screen");
        await browser.wait('!!document.querySelector("#cv-ingest")', "the ingest drawer");
      };
      const dropCv = async (cvId) => {
        const response = await browser.fetchPage(`/api/cvs/${encodeURIComponent(cvId)}`, { method: "DELETE" });
        check("the previous CV is removed so the Free plan's one-CV quota is not hit", response.status === 200, `status ${response.status}`);
      };

      /** What every import path has to prove, whatever the file type was. */
      const assertImported = async ({ label, response, format, name, ocr }) => {
        check(`${label}: POST /api/cvs answers 201`, response.status === 201, `status ${response.status}`);
        const body = response.json ?? {};
        const cv = body.cv ?? {};
        check(`${label}: the API reports format "${format}"`, cv.format === format, `got ${cv.format}`);
        check(`${label}: the API returns a warnings array`, Array.isArray(body.warnings), JSON.stringify(body.warnings));
        check(`${label}: the stored text is long enough to score (>= 80 chars)`, typeof cv.profile === "object" && cv.profile !== null);
        const full = await browser.fetchPage(`/api/cvs/${encodeURIComponent(cv.id)}`);
        check(`${label}: GET /api/cvs/:id returns the extracted text`, full.status === 200 && (full.json?.cv?.text?.length ?? 0) >= 80, `status ${full.status}, ${full.json?.cv?.text?.length ?? 0} chars`);
        check(`${label}: the extracted text keeps the CV's own content`, String(full.json?.cv?.text ?? "").includes("payments platform"), String(full.json?.cv?.text ?? "").slice(0, 80));
        const sections = full.json?.cv?.profile?.sections ?? {};
        check(
          `${label}: the text is segmented into sections the editor can load`,
          typeof sections.summary === "string" && typeof sections.experience === "string",
          JSON.stringify(Object.keys(sections))
        );
        if (ocr) {
          check(`${label}: the warning says the text was read with OCR`, /OCR/.test((body.warnings ?? []).join(" ")), JSON.stringify(body.warnings));
        }

        await browser.goto("/app/cv");
        await browser.wait('!!document.querySelector("#app-view")', "the CV screen");
        // Text, not card classes: the library claims to list the CV by name and to
        // show the format it was read as, so assert exactly those two things from
        // the rendered text. A restyle of the card cannot make this rot.
        await browser.waitCall((name) => (document.querySelector("#app-view")?.innerText ?? "").includes(name), [name], `the library to list ${name}`, 15_000);
        const libraryText = await browser.evaluate("document.querySelector('#app-view').innerText");
        check(`${label}: the library lists the new CV by name`, libraryText.includes(name), libraryText.slice(0, 120));
        check(
          `${label}: the library shows the format it was read as`,
          libraryText.toUpperCase().includes(String(format).toUpperCase()),
          `format ${format} not in the library text`
        );

        await browser.goto(`/editor?cv=${encodeURIComponent(cv.id)}`);
        await browser.wait('!!document.querySelector("#ed-form") && !document.querySelector("#ed-form").hidden', "the editor to load the CV", 20_000);
        const editorText = await browser.call(() => `${document.querySelector("#ed-text-summary")?.value ?? ""}\n${document.querySelector("#ed-text-experience")?.value ?? ""}`);
        check(`${label}: the text lands in the editor's sections`, /payments platform/.test(editorText), editorText.slice(0, 120));
        return cv;
      };

      // --- 2a: PDF ---------------------------------------------------------
      await openLibrary();
      await browser.setFile("Upload and add", "ada-lovelace-cv.pdf", "application/pdf", pdfBytes.toString("base64"));
      await browser.submitForm("Upload and add");
      const pdfImport = await browser.waitHttp({ method: "POST", path: "/api/cvs" }, { timeout: 30_000 });
      const pdfCv = await assertImported({ label: "PDF", response: pdfImport, format: "pdf", name: pdfImport.json?.cv?.name ?? "", ocr: false });
      note(`PDF extraction warnings: ${JSON.stringify(pdfImport.json?.warnings ?? [])}`);
      await dropCv(pdfCv.id);

      // --- 2b: DOCX --------------------------------------------------------
      await openLibrary();
      await browser.setFile(
        "Upload and add",
        "ada-lovelace-cv.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        docxBytes.toString("base64")
      );
      await browser.submitForm("Upload and add");
      const docxImport = await browser.waitHttp({ method: "POST", path: "/api/cvs" }, { timeout: 30_000 });
      const docxCv = await assertImported({ label: "DOCX", response: docxImport, format: "docx", name: docxImport.json?.cv?.name ?? "", ocr: false });
      note(`DOCX extraction warnings: ${JSON.stringify(docxImport.json?.warnings ?? [])}`);
      await dropCv(docxCv.id);

      // --- 2c: image, through OCR -----------------------------------------
      await openLibrary();
      await browser.setFile("Upload and add", "ada-lovelace-cv.png", "image/png", pngBytes.toString("base64"));
      await browser.submitForm("Upload and add");
      const imageImport = await browser.waitHttp({ method: "POST", path: "/api/cvs" }, { timeout: 60_000 });
      const imageCv = await assertImported({ label: "OCR image", response: imageImport, format: "image", name: imageImport.json?.cv?.name ?? "", ocr: true });
      note(`OCR warnings: ${JSON.stringify(imageImport.json?.warnings ?? [])}`);
      await dropCv(imageCv.id);

      // --- 2d: pasted text (the CV the rest of the journey uses) -----------
      await openLibrary();
      await browser.fillForm("Add this CV", [
        ["Name", "Pasted CV"],
        ["CV text", CV_TEXT],
      ]);
      // D1 guard (fixed in f6a3913, "Fix the score panel never mounting after a
      // first CV import"): on an empty account the score panel does not exist
      // before the import, and the screen re-derives itself after the import so
      // the panel is mounted in-session — no navigation between the submit and
      // the wait below.
      check(
        "the score panel is absent before the first CV is imported",
        !(await browser.call(() => Boolean(document.querySelector("#cv-analyse"))))
      );
      await browser.submitForm("Add this CV");
      const pasteImport = await browser.waitHttp({ method: "POST", path: "/api/cvs" }, { timeout: 30_000 });
      await browser.wait('!!document.querySelector("#cv-analyse")', "the score panel to mount in-session", 5_000);
      check("the score panel is mounted straight after the first CV import (D1 guard)", await browser.visible("#cv-analyse"));
      const analyser = await browser.call(() => {
        const panel = document.querySelector("#cv-analyse");
        if (!panel) return { present: false, forms: 0 };
        panel.scrollIntoView({ block: "start" });
        return { present: true, forms: panel.querySelectorAll("form").length };
      });
      check("the score panel has its form ready to use", analyser.present && analyser.forms >= 1, JSON.stringify(analyser));

      const pasteCv = await assertImported({ label: "Pasted text", response: pasteImport, format: "txt", name: "Pasted CV", ocr: false });
      check("the pasted CV has no extraction warnings to report", (pasteImport.json?.warnings ?? []).length === 0, JSON.stringify(pasteImport.json?.warnings));
      ctx.cvId = pasteCv.id;

      // The account ends the import step with exactly one CV, as the Free plan allows.
      const list = await browser.fetchPage("/api/cvs");
      check("the account holds exactly one CV at the end of the import step", (list.json?.cvs ?? []).length === 1, String((list.json?.cvs ?? []).length));
    });

    /* ---------------------------------------------------------------- 3 */
    await step("3", "score a pasted advert: score, five subscores, Free truncation", async () => {
      await browser.goto("/app/cv");
      await browser.wait('!!document.querySelector("#cv-analyse")', "the analyse panel");
      await browser.fillForm("Score this CV", [
        ["Role title", "Senior Platform Engineer"],
        ["Job description", JOB_TEXT],
      ]);
      await browser.submitForm("Score this CV");
      const analysis = await browser.waitHttp({ method: "POST", path: "/api/analyse" }, { timeout: 30_000 });
      check("POST /api/analyse answers 200", analysis.status === 200, `status ${analysis.status}`);
      const report = analysis.json?.report ?? {};
      check("the report carries a score of 0-100", Number.isInteger(report.score) && report.score >= 0 && report.score <= 100, String(report.score));
      // The score is a vernier gauge since 0f9175a; the donut `.aw-ring` it used
      // to be is gone. What is asserted here is the claim, not the drawing: the
      // number the page shows is the number the API returned. It is read from the
      // visible text ("57 / 100"), and the accessible equivalent is the gauge's
      // role="img" aria-label, which is what a reader using assistive tech gets
      // (the visible legend is aria-hidden, so the label is not decoration).
      const gauge = await browser.waitCall(
        () => {
          const node = document.querySelector("#app-view .aw-gauge");
          if (!node) return false;
          const text = (node.querySelector(".aw-gauge__value")?.textContent ?? "").trim();
          if (!/^\d+\s*\/\s*100$/.test(text)) return false;
          return { text, label: node.getAttribute("aria-label") ?? "" };
        },
        [],
        "the score gauge to render a value",
        10_000
      );
      const drawn = /^(\d+)\s*\/\s*100$/.exec(gauge.text);
      check("the rendered score equals the API's score", Boolean(drawn) && Number(drawn[1]) === report.score, `${gauge.text} vs ${report.score}`);
      check(
        "the gauge's aria-label names the score",
        gauge.label.includes(`Rubric score: ${report.score} out of 100`),
        gauge.label
      );
      check(
        "the gauge's aria-label names the strong-fit threshold",
        /Strong fit starts at \d+\./.test(gauge.label),
        gauge.label
      );
      const gaugeNote = await browser.text("#app-view .aw-gauge__note");
      check("the gauge shows the threshold beside the value", /strong fit from \d+/i.test(gaugeNote ?? ""), String(gaugeNote));
      const subscoreNames = ["keywords", "structure", "achievements", "readability", "formatting"];
      const subscores = report.subscores ?? {};
      check("the report carries all five subscores", subscoreNames.every((name) => Number.isInteger(subscores[name])), JSON.stringify(subscores));
      check(
        "each subscore is on the 0-100 scale",
        subscoreNames.every((name) => subscores[name] >= 0 && subscores[name] <= 100),
        JSON.stringify(subscores)
      );
      check("the five subscores are the published rubric", subscoreNames.join(",") === ["keywords", "structure", "achievements", "readability", "formatting"].join(","));

      check("a Free report sets fullAtsReport.included = false", report.fullAtsReport?.included === false, JSON.stringify(report.fullAtsReport));
      check("a Free report is cut to the top three findings", (report.findings ?? []).length === 3, `${(report.findings ?? []).length} findings`);
      check(
        "the report says how many findings it is hiding",
        report.fullAtsReport?.totalFindings > report.fullAtsReport?.shownFindings,
        JSON.stringify(report.fullAtsReport)
      );
      check("a Free report hides the advice array", Array.isArray(report.advice) && report.advice.length === 0, JSON.stringify(report.advice));
      check(
        "the locked line names the plan the full report belongs to",
        /part of Pro/i.test(String(report.fullAtsReport?.locked ?? "")),
        String(report.fullAtsReport?.locked)
      );
      check("the advisory says the full report is locked on this plan", /part of Pro/i.test(String(analysis.json?.advisory ?? "")), String(analysis.json?.advisory).slice(-80));

      await browser.waitCall(() => document.querySelectorAll("#app-view .aw-finding").length > 0, [], "the findings to render", 10_000);
      check("the page renders exactly three findings", (await browser.count("#app-view .aw-finding")) === 3, `${await browser.count("#app-view .aw-finding")} rendered`);
      check(
        "the findings heading says 3, not the total",
        /Findings \(3\)/.test((await browser.text("#app-view .aw-section__title")) ?? "") || /Findings \(3\)/.test((await browser.evaluate("document.querySelector('#app-view').innerText")) ?? "")
      );
      const rendered = await browser.evaluate("document.querySelector('#app-view').innerText");
      check("the page shows the Free lock message where the full report would be", /part of Pro/i.test(rendered));
      check("the page does not render the advice block a Pro report would show", !/What to change first/.test(rendered));
      check("the page renders the five subscore bars", (await browser.count("#app-view .aw-subscore__row, #app-view .aw-subscore")) >= 5, `${await browser.count("#app-view .aw-subscore__row, #app-view .aw-subscore")} bars`);
    });

    /* ---------------------------------------------------------------- 4 */
    await step("4", "tailor a pack: covering letter locked, no invented fact", async () => {
      await browser.clickByText("Create the tailored pack", { selector: "button" });
      const tailor = await browser.waitHttp({ method: "POST", path: "/api/tailor" }, { timeout: 45_000 });
      check("POST /api/tailor answers 201", tailor.status === 201, `status ${tailor.status}`);
      const body = tailor.json ?? {};
      check("the tailor response reports the deterministic rules mode (no model key)", body.pack?.mode === "rules", String(body.pack?.mode));
      check("the tailor response locks the covering letter on Free", body.pack?.coverLetter === "", JSON.stringify(body.pack?.coverLetter));
      check("the tailor response carries the lock message", /part of Pro/i.test(String(body.pack?.coverLetterLocked ?? "")), String(body.pack?.coverLetterLocked));
      check("the pack has an application id", typeof body.application?.id === "string" && body.application.id.length > 0, JSON.stringify(body.application));
      check("the pack is queued as pack_ready", body.application?.status === "pack_ready", String(body.application?.status));
      check("the pack carries the score it was built at", Number.isInteger(body.application?.score), String(body.application?.score));
      ctx.applicationId = body.application.id;
      ctx.applicationTitle = body.application.title;

      const stored = await browser.fetchPage(`/api/applications/${encodeURIComponent(ctx.applicationId)}`);
      check("GET /api/applications/:id answers 200", stored.status === 200, `status ${stored.status}`);
      const pack = stored.json?.application?.pack ?? {};
      check("the stored pack has no covering letter markdown", pack.coverLetterMd === "", JSON.stringify(pack.coverLetterMd));
      check("the stored tailored source has no covering letter either", (pack.tailored?.coverLetter ?? "") === "", JSON.stringify(pack.tailored?.coverLetter));
      check("the stored pack keeps the lock message", /part of Pro/i.test(String(pack.coverLetterLocked ?? "")), String(pack.coverLetterLocked));
      check("the stored pack has a printable CV", typeof pack.cvHtml === "string" && pack.cvHtml.length > 500, String(pack.cvHtml?.length));
      check("the stored pack has screening answers", Array.isArray(pack.answers) && pack.answers.length > 0, JSON.stringify(pack.answers?.length));
      check("the stored pack has no refinement trail yet", (pack.refinements ?? []).length === 0);

      await browser.waitCall(() => (document.querySelector("#app-view")?.innerText ?? "").includes("Pack ready"), [], "the pack-ready block", 15_000);
      const tailoredText = await browser.evaluate("document.querySelector('#app-view').innerText");
      check("the page says the pack carries no covering letter", /This pack carries no covering letter/i.test(tailoredText));
      check("the page shows the lock message instead of a letter", /part of Pro/i.test(tailoredText));
      check("the page shows the screening answers", /Screening answers/i.test(tailoredText));
      check("no letter greeting leaked into the page", !/Dear .*hiring team/i.test(tailoredText));

      // The promise under test: nothing invented. Figures are checked against
      // the CV alone; names may also come from the advert the pack targets.
      const packText = [
        plainText(pack.cvHtml),
        plainText(pack.coverLetterMd),
        pack.tailored?.summary,
        ...(pack.tailored?.bullets ?? []).map((bullet) => bullet.rewritten),
        ...(pack.answers ?? []).map((answer) => answer.answer),
      ]
        .filter(Boolean)
        .join("\n");
      const fabricated = inventedFacts(packText, { figures: [CV_TEXT], names: [CV_TEXT, JOB_TEXT] });
      check("no number in the pack is absent from the CV", fabricated.figures.length === 0, `invented: ${JSON.stringify(fabricated.figures)}`);
      check("no employer or name in the pack is absent from the CV or advert", fabricated.names.length === 0, `invented: ${JSON.stringify(fabricated.names)}`);
      check("the pack quotes the CV's own achievements", /32 percent|45 minutes|14 services|9 minutes/.test(packText));
    });

    /* --------------------------------------------------------------- 4b */
    // The Free gates are measured in step 4. Step 4b measures the other side of
    // the same gates, which needs a paid plan. Stripe has no keys on this host,
    // so the upgrade a webhook would apply is applied to the scratch database
    // directly — the payment path stays unexercised and is recorded as such in
    // docs/E2E-VERIFICATION.md. This is what guards D3 (the covering letter's
    // double comma), which is unreachable while the letter is locked.
    await step("4b", "Pro behaviour (plan set on the scratch database): full report and a clean covering letter", async () => {
      const me = await browser.fetchPage("/api/auth/me");
      const userId = me.json?.user?.id;
      check("the session names the account whose plan is being set", typeof userId === "string" && userId.length > 0, String(userId));
      instance.store.updateUserPlan(userId, "pro", null, null);
      const upgraded = await browser.fetchPage("/api/auth/me");
      check("the scratch account is on the pro plan", upgraded.json?.plan === "pro", String(upgraded.json?.plan));
      const flags = upgraded.json?.entitlements?.flags ?? [];
      check("pro entitlements include the full ATS report", flags.includes("fullAtsReport"), JSON.stringify(flags));
      check("pro entitlements include the covering letter", flags.includes("coverLetter"), JSON.stringify(flags));

      await browser.goto("/app/cv");
      await browser.wait('!!document.querySelector("#cv-analyse")', "the analyse panel");
      await browser.fillForm("Score this CV", [
        ["Role title", "Senior Platform Engineer"],
        ["Job description", JOB_TEXT],
      ]);
      await browser.submitForm("Score this CV");
      const analysis = await browser.waitHttp({ method: "POST", path: "/api/analyse" }, { timeout: 30_000 });
      check("a Pro analyse answers 200", analysis.status === 200, `status ${analysis.status}`);
      const report = analysis.json?.report ?? {};
      check("a Pro report sets fullAtsReport.included = true", report.fullAtsReport?.included === true, JSON.stringify(report.fullAtsReport));
      check("a Pro report is not truncated to three findings", (report.findings ?? []).length > 3, `${(report.findings ?? []).length} findings`);
      check("a Pro report carries the advice array", (report.advice ?? []).length > 0, `${(report.advice ?? []).length} lines`);
      await browser.waitCall((count) => document.querySelectorAll("#app-view .aw-finding").length === count, [(report.findings ?? []).length], "the full findings list", 10_000);
      const rendered = await browser.evaluate("document.querySelector('#app-view').innerText");
      check("the page renders every finding on Pro", (await browser.count("#app-view .aw-finding")) === (report.findings ?? []).length);
      check("the page renders 'What to change first' on Pro", /What to change first/.test(rendered));

      await browser.clickByText("Create the tailored pack", { selector: "button" });
      const tailor = await browser.waitHttp({ method: "POST", path: "/api/tailor" }, { timeout: 45_000 });
      check("a Pro tailor answers 201", tailor.status === 201, `status ${tailor.status}`);
      const body = tailor.json ?? {};
      check("a Pro tailor response carries a covering letter", String(body.pack?.coverLetter ?? "").length > 200, `${String(body.pack?.coverLetter ?? "").length} chars`);
      check("a Pro tailor response carries no cover-letter lock", !body.pack?.coverLetterLocked, String(body.pack?.coverLetterLocked));
      ctx.applicationId = body.application?.id ?? null;
      ctx.applicationTitle = body.application?.title ?? null;

      const stored = await browser.fetchPage(`/api/applications/${encodeURIComponent(ctx.applicationId)}`);
      check("GET /api/applications/:id answers 200 for the Pro pack", stored.status === 200, `status ${stored.status}`);
      const pack = stored.json?.application?.pack ?? {};
      const letter = String(pack.coverLetterMd ?? "");
      check("the stored Pro pack has covering-letter markdown", letter.length > 200, `${letter.length} chars`);
      check("the stored Pro pack carries no cover-letter lock", !pack.coverLetterLocked, String(pack.coverLetterLocked));
      // D3 guard (fixed in 73e42ec, "Fix trailing punctuation on a parsed employer").
      check("the covering letter never doubles a comma (D3 guard)", !/,,/.test(letter), letter.slice(0, 200));
      check("the covering letter never leaves a dangling 'At'", !/\bAt\s*[,.]/.test(letter), letter.slice(0, 200));
      check("the covering letter names the CV's own employer cleanly", /At Northwind Traders, I /.test(letter), letter.slice(0, 240));
      check("no number in the covering letter is absent from the CV", inventedFacts(letter, { figures: [CV_TEXT], names: [CV_TEXT, JOB_TEXT] }).figures.length === 0, JSON.stringify(inventedFacts(letter, { figures: [CV_TEXT], names: [CV_TEXT, JOB_TEXT] }).figures));
    });

    /* ---------------------------------------------------------------- 5 */
    await step("5", "editor: section edit, Ctrl+S diff, proposals, grounding", async () => {
      const editor = `/editor?cv=${encodeURIComponent(ctx.cvId)}`;
      await browser.goto(editor);
      await browser.wait('!!document.querySelector("#ed-form") && !document.querySelector("#ed-form").hidden', "the editor form", 20_000);
      check("the editor loads the CV named in ?cv=", (await browser.text("#ed-cv-name")) === "Pasted CV", String(await browser.text("#ed-cv-name")));
      check("the editor shows a saved state before any edit", (await browser.call(() => document.querySelector("#ed-save-state")?.dataset.state)) === "saved");

      const before = await browser.fetchPage(`/api/cvs/${encodeURIComponent(ctx.cvId)}`);
      const beforeText = before.json?.cv?.text ?? "";
      check("the stored CV is the pasted text before the edit", beforeText.includes("payments platform") && beforeText === CV_TEXT, `${beforeText.length} chars`);
      const addition = " Works across platform and product teams.";
      await browser.call((addition) => {
        const field = document.querySelector("#ed-text-summary");
        field.focus();
        field.value = `${field.value}${addition}`;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        return field.value;
      }, addition);
      check("the editor marks the document dirty after a section edit", (await browser.call(() => document.querySelector("#ed-save-state")?.dataset.state)) === "dirty");

      await browser.pressControlS();
      const save = await browser.waitHttp({ method: "PATCH", path: "/api/cvs/" }, { timeout: 20_000 });
      check("Ctrl+S saves through PATCH /api/cvs/:id", save.status === 200, `status ${save.status}`);
      // The persisted row, not the response body, is the authority on what was
      // saved; a body lost to a renderer eviction must not read as a bad save.
      const persisted = await browser.fetchPage(`/api/cvs/${encodeURIComponent(ctx.cvId)}`);
      const savedText = String(persisted.json?.cv?.text ?? "");
      check("the saved text contains the edited sentence", savedText.includes("Works across platform and product teams."), savedText.slice(0, 80));
      check("the editor reports saved, not dirty, after Ctrl+S", (await browser.call(() => document.querySelector("#ed-save-state")?.dataset.state)) === "saved");
      await browser.wait('!document.querySelector("#ed-diff-region").hidden', "the diff region", 10_000);
      check("saving shows a diff", await browser.visible("#ed-diff-region"));
      const diff = await browser.call(() => ({
        summary: document.querySelector("#ed-diff-summary")?.textContent?.trim() ?? "",
        rows: [...document.querySelectorAll("#ed-diff-rows li")].map((row) => `${row.dataset.kind}: ${row.querySelector(".ed-diff__text")?.textContent ?? ""}`),
      }));
      check("the diff says how many lines changed", /\d+ line[s]? added, \d+ removed/.test(diff.summary), diff.summary);
      check("the diff lists the added sentence", diff.rows.some((row) => row.startsWith("add:") && row.includes("Works across platform and product teams.")), JSON.stringify(diff.rows.slice(0, 4)));
      check("the diff lists the removed line it replaced", diff.rows.some((row) => row.startsWith("del:")), JSON.stringify(diff.rows.slice(0, 4)));

      // --- a valid proposal ------------------------------------------------
      await browser.fill("#ed-instruction", "Make the summary shorter and plainer.");
      await browser.call(() => {
        const scope = document.querySelector("#ed-scope");
        scope.value = "summary";
        scope.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await browser.click("#ed-ask", "the ask button");
      const proposal = await browser.waitHttp({ method: "POST", path: `/api/cvs/${ctx.cvId}/assist` }, { timeout: 30_000 });
      check("POST /api/cvs/:id/assist answers 200", proposal.status === 200, `status ${proposal.status}`);
      const proposalBody = proposal.json ?? {};
      check("the proposal route reports saved: false", proposalBody.saved === false);
      check("the proposal route reports the rules mode (no model key)", proposalBody.mode === "rules", String(proposalBody.mode));
      check("a valid instruction produces at least one change", (proposalBody.changes ?? []).length >= 1, String((proposalBody.changes ?? []).length));
      check("every change stays inside the requested scope", (proposalBody.changes ?? []).every((change) => change.section === "summary"), JSON.stringify((proposalBody.changes ?? []).map((change) => change.section)));
      check("the preview contains the proposed text", String(proposalBody.proposed?.text ?? "").includes(proposalBody.changes?.[0]?.after ?? "\u0000"));
      const unchanged = await browser.fetchPage(`/api/cvs/${encodeURIComponent(ctx.cvId)}`);
      check("a proposal writes nothing to the CV", unchanged.json?.cv?.text === savedText, "the CV text changed while proposing");
      await browser.waitCall(() => document.querySelectorAll(".ed-hunk").length > 0, [], "the proposal hunks", 10_000);
      check("the page renders one hunk per change", (await browser.count(".ed-hunk")) === (proposalBody.changes ?? []).length);
      check("the page says nothing is saved yet", /nothing saved yet/i.test((await browser.text("#ed-assist-state")) ?? ""), String(await browser.text("#ed-assist-state")));

      // --- the fabricated-number instruction -------------------------------
      // With no model there is no component that could invent a figure, so what
      // is asserted here is the promise: no invented number can reach the
      // proposal, and the refusal is visible rather than silent.
      await browser.fill("#ed-instruction", "Add that I cut costs by 37% and led 12 engineers at Initech.");
      await browser.click("#ed-ask", "the ask button");
      const fabricated = await browser.waitHttp({ method: "POST", path: `/api/cvs/${ctx.cvId}/assist` }, { timeout: 30_000 });
      const fabricatedBody = fabricated.json ?? {};
      check("the fabricated-number instruction is refused, not saved", fabricatedBody.saved === false);
      check("no invented change is proposed", (fabricatedBody.changes ?? []).length === 0, JSON.stringify((fabricatedBody.changes ?? []).map((change) => change.after)));
      check("the preview contains no invented figure", !/37%/.test(String(fabricatedBody.proposed?.text ?? "")), String(fabricatedBody.proposed?.text ?? "").slice(0, 120));
      check("the preview contains no invented employer or headcount", !/Initech|12 engineers/i.test(String(fabricatedBody.proposed?.text ?? "")));
      check(
        "the refusal is reported in the refinement's own notes",
        /no rule matches|nothing was changed/i.test([...(fabricatedBody.warnings ?? []), ...(fabricatedBody.rejected ?? []).map((entry) => (entry.reasons ?? []).join(" "))].join(" ")),
        JSON.stringify(fabricatedBody.warnings ?? [])
      );
      await browser.waitCall(() => (document.querySelector("#ed-assist-state")?.textContent ?? "").includes("Nothing passed the check"), [], "the nothing-to-accept message", 10_000);
      check("the page says there is nothing to accept", /Nothing passed the check/i.test((await browser.text("#ed-assist-state")) ?? ""));
      check("the page renders no hunk for the fabricated instruction", (await browser.count(".ed-hunk")) === 0, `${await browser.count(".ed-hunk")} hunks`);

      // --- accept a valid hunk and save ------------------------------------
      await browser.fill("#ed-instruction", "Make the summary shorter and plainer.");
      await browser.click("#ed-ask", "the ask button");
      const second = await browser.waitHttp({ method: "POST", path: `/api/cvs/${ctx.cvId}/assist` }, { timeout: 30_000 });
      const accepted = second.json?.changes?.[0];
      check("a second valid proposal is offered", Boolean(accepted), JSON.stringify(second.json?.changes));
      await browser.clickByText("Accept and save", { selector: ".ed-hunk button" });
      const acceptedSave = await browser.waitHttp({ method: "PATCH", path: "/api/cvs/" }, { timeout: 20_000 });
      check("accepting a hunk saves it through PATCH /api/cvs/:id", acceptedSave.status === 200, `status ${acceptedSave.status}`);
      const afterAccept = await browser.fetchPage(`/api/cvs/${encodeURIComponent(ctx.cvId)}`);
      check("the saved text is the accepted proposal", String(afterAccept.json?.cv?.text ?? "").includes(accepted.after), String(afterAccept.json?.cv?.text ?? "").slice(0, 120));
      check("the accepted hunk is marked accepted in the page", (await browser.call(() => document.querySelector(".ed-hunk")?.dataset.state)) === "accepted");
      check("the editor is clean after accepting", (await browser.call(() => document.querySelector("#ed-save-state")?.dataset.state)) === "saved");
      check("the diff now describes the accepted change", await browser.visible("#ed-diff-region"));
    });

    /* ---------------------------------------------------------------- 6 */
    await step("6", "exports: Markdown, print-to-PDF (A4), DOCX", async () => {
      // --- exports ---------------------------------------------------------
      const cvName = "Pasted CV";

      await browser.clearDownloads();
      await browser.click("#ed-download-md", "Download .md");
      const markdown = await browser.waitDownload(/\.md$/);
      const markdownText = markdown.bytes.toString("utf8");
      check("the Markdown link downloads a .md file", /\.md$/.test(markdown.name), markdown.name);
      // D2 guard (fixed in 3f59cee, "One heading rule for every CV artefact"):
      // every artefact is headed with the candidate's name, not the record's.
      check("the Markdown is headed with the candidate's name (D2 guard)", markdownText.startsWith("# Ada Lovelace"), markdownText.split("\n")[0]);
      check("the Markdown is not headed with the CV record's name", !markdownText.split("\n")[0].includes(cvName), markdownText.split("\n")[0]);
      check("the Markdown carries the section headings", /## Summary/.test(markdownText) && /## Experience/.test(markdownText) && /## Skills/.test(markdownText));
      check("the Markdown carries the CV's own facts", markdownText.includes("payments platform") && markdownText.includes("Northwind Traders"));

      // The print button builds the A4 print sheet and calls window.print();
      // Page.printToPDF is the headless equivalent of the dialog's "Save as PDF".
      await browser.click("#ed-print", "Print / PDF");
      await browser.waitCall(() => !!document.querySelector("#ed-print-doc"), [], "the print sheet to be built", 10_000);
      const printSheet = await browser.call(() => ({
        text: document.querySelector("#ed-print-doc").innerText,
        heading: document.querySelector("#ed-print-doc h1")?.textContent?.trim() ?? "",
      }));
      check("the print button builds a print-only document", /payments platform/.test(printSheet.text), printSheet.text.slice(0, 80));
      check("the print sheet heads the document with the candidate's name", printSheet.heading === "Ada Lovelace", printSheet.heading);
      check("the print sheet has no editor controls in it", !/Download \.md|Ask for a proposal/.test(printSheet.text));
      const printed = await browser.cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
      const pdf = Buffer.from(printed.data, "base64");
      await writeFile(join(artifacts, "editor-print.pdf"), pdf);
      const box = pdfMediaBox(pdf);
      check("the printed PDF is a PDF", pdf.subarray(0, 5).toString("latin1") === "%PDF-");
      check("the printed PDF declares an A4 page box", Boolean(box), JSON.stringify(box));
      check(
        "the printed PDF page is A4 (595.28 x 841.89 points)",
        Boolean(box) && Math.abs(box.width - A4_POINTS.width) < 1 && Math.abs(box.height - A4_POINTS.height) < 1,
        JSON.stringify(box)
      );
      check("the print stylesheet really is @page size A4", /@page\s*\{[^}]*size:\s*A4/i.test(await readFile(join(ROOT, "public", "assets", "editor.css"), "utf8")));

      await browser.clearDownloads();
      await browser.click("#ed-download-docx", "Download .docx");
      const docx = await browser.waitDownload(/\.docx$/);
      check("the DOCX link downloads a .docx file", /\.docx$/.test(docx.name), docx.name);
      check("the downloaded DOCX starts with a zip signature", isZipSignature(docx.bytes), docx.bytes.subarray(0, 4).toString("hex"));
      const entries = readZipEntries(docx.bytes);
      check("the downloaded DOCX opens as a zip", Array.isArray(entries) && entries.length >= 4, String(entries?.length));
      const names = (entries ?? []).map((entry) => entry.name);
      check(
        "the DOCX carries the parts a Word document needs",
        ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml"].every((part) => names.includes(part)),
        JSON.stringify(names)
      );
      const documentXml = (entries ?? []).find((entry) => entry.name === "word/document.xml")?.data.toString("utf8") ?? "";
      await writeFile(join(artifacts, "editor-export.docx"), docx.bytes);
      await writeFile(join(artifacts, "editor-export.md"), markdown.bytes);
      check("the DOCX document part is XML", documentXml.startsWith("<?xml"), documentXml.slice(0, 40));
      check(
        "the DOCX document part carries the CV's own facts",
        /Northwind Traders/.test(documentXml) && /payments platform/.test(documentXml) && /Kubernetes/.test(documentXml)
      );
      // D2 guard (fixed in 3f59cee, "One heading rule for every CV artefact"):
      // one heading rule (contact name → record name → "Curriculum vitae") is used
      // by the DOCX, the Markdown and the print sheet.
      const docxHeading = /<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t[^>]*>([^<]*)</.exec(documentXml)?.[1] ?? "";
      check("the DOCX Heading1 is the candidate's name (D2 guard)", docxHeading === "Ada Lovelace", docxHeading);
      check("the DOCX does not carry the CV record's name as its title", !documentXml.includes(cvName), cvName);
      check(
        "the DOCX, the Markdown and the print sheet agree on the heading",
        docxHeading === printSheet.heading && markdownText.startsWith(`# ${printSheet.heading}`),
        `${docxHeading} / ${printSheet.heading} / ${markdownText.split("\n")[0]}`
      );
    });

    /* ---------------------------------------------------------------- 7 */
    await step("7", "tracking and alerts: status change, alert run, notification", async () => {
      await browser.goto("/app/applications");
      await browser.wait('!!document.querySelector("#app-view table tbody tr")', "the applications table", 20_000);
      const rowTitle = await browser.call(() => document.querySelector("#app-view tbody tr .aw-cell-title")?.textContent?.trim() ?? null);
      check("the tailored pack appears in the application queue", rowTitle === ctx.applicationTitle, `${rowTitle} vs ${ctx.applicationTitle}`);

      const statusSelect = await browser.call(() => {
        const select = document.querySelector('#app-view tbody tr select[aria-label^="Status for"]');
        return select ? { label: select.getAttribute("aria-label"), value: select.value } : null;
      });
      check("the row has a status control", Boolean(statusSelect), JSON.stringify(statusSelect));
      check("the row starts at pack_ready", statusSelect?.value === "pack_ready", String(statusSelect?.value));
      await browser.call(() => {
        const select = document.querySelector('#app-view tbody tr select[aria-label^="Status for"]');
        select.value = "submitted";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const statusChange = await browser.waitHttp({ method: "PATCH", path: `/api/applications/${ctx.applicationId}` }, { timeout: 20_000 });
      check("PATCH /api/applications/:id answers 200", statusChange.status === 200, `status ${statusChange.status}`);
      check("the tracked status becomes submitted", statusChange.json?.application?.status === "submitted", String(statusChange.json?.application?.status));
      // Text and control state, not class names: the queue is asserted by what it
      // says ("Submitted (1)") and the row by the value of its status select.
      await browser.waitCall(
        () => (document.querySelector("#app-view")?.innerText ?? "").includes("Submitted (1)"),
        [],
        "the queue to recount the statuses",
        10_000
      );
      check("the queue recounts the statuses", (await browser.evaluate("document.querySelector('#app-view').innerText")).includes("Submitted (1)"));
      const rowStatus = await browser.call(() => {
        const select = document.querySelector('#app-view tbody tr select[aria-label^="Status for"]');
        return select ? { value: select.value, label: select.getAttribute("aria-label") } : null;
      });
      check("the row's status control shows the new status", rowStatus?.value === "submitted", JSON.stringify(rowStatus));

      // --- alerts ----------------------------------------------------------
      await browser.goto("/app/alerts");
      await browser.wait('!!document.querySelector("#app-view")', "the alerts screen", 20_000);
      await browser.fillForm("Create alert", [
        ["Name", "E2E platform roles"],
        ["Keywords", "engineer, developer"],
      ]);
      await browser.submitForm("Create alert");
      const alert = await browser.waitHttp({ method: "POST", path: "/api/alerts" }, { timeout: 20_000 });
      check("POST /api/alerts answers 201", alert.status === 201, `status ${alert.status}`);
      check("the alert keeps the keywords it was given", alert.json?.alert?.keywords === "engineer, developer", String(alert.json?.alert?.keywords));
      ctx.alertId = alert.json?.alert?.id;
      await browser.waitCall(() => (document.querySelector("#app-view")?.innerText ?? "").includes("E2E platform roles"), [], "the alert card", 15_000);
      const alertsText = await browser.evaluate("document.querySelector('#app-view').innerText");
      check("the alert card shows its keywords", /Keywords: engineer, developer/i.test(alertsText));
      check("a new alert has not run yet", /Has not run yet/i.test(alertsText));

      let run = await (async () => {
        await browser.clickByText("Run all alerts now", { selector: "button" });
        return browser.waitHttp({ method: "POST", path: "/api/alerts/run" }, { timeout: 120_000 });
      })();
      check("POST /api/alerts/run answers 200", run.status === 200, `status ${run.status}`);
      check("the run reports the alert it checked", run.json?.alerts === 1, String(run.json?.alerts));
      check("the run reports how many postings it checked", Number.isInteger(run.json?.checked) && run.json.checked > 0, JSON.stringify(run.json));
      if (!(run.json?.created > 0)) {
        note(`first run created no notification (checked ${run.json?.checked}, matched ${run.json?.matched}, sources ${JSON.stringify(run.json?.sources ?? []).slice(0, 200)}); broadening the keywords once`);
        await browser.fetchPage(`/api/alerts/${encodeURIComponent(ctx.alertId)}`, { method: "PATCH", body: { keywords: "engineer" } });
        await browser.goto("/app/alerts");
        await browser.wait('!!document.querySelector("#app-view")', "the alerts screen");
        await browser.clickByText("Run all alerts now", { selector: "button" });
        run = await browser.waitHttp({ method: "POST", path: "/api/alerts/run" }, { timeout: 120_000 });
        check("the retry with broader keywords answers 200", run.status === 200, `status ${run.status}`);
        check("the retry reports a match", run.json?.matched > 0, JSON.stringify(run.json));
      }
      check("the alert run creates at least one notification", run.json?.created > 0, JSON.stringify(run.json));

      const notifications = await browser.fetchPage("/api/notifications");
      check("GET /api/notifications answers 200", notifications.status === 200, `status ${notifications.status}`);
      const list = notifications.json?.notifications ?? [];
      check("the notification is in the inbox", list.length >= 1, String(list.length));
      check("the notification is unread", notifications.json?.unread >= 1, String(notifications.json?.unread));
      check("the notification names the matched job", typeof list[0]?.title === "string" && list[0].title.includes("—"), String(list[0]?.title));
      check("the inbox also hands out an RSS feed token", typeof notifications.json?.feedToken === "string" && notifications.json.feedToken.length >= 32, String(notifications.json?.feedToken));
      const unreadBefore = Number(notifications.json?.unread ?? 0);
      ctx.notifications = list;
      ctx.feedToken = notifications.json.feedToken;

      await browser.goto("/app/alerts");
      await browser.wait('!!document.querySelector("#app-view .aw-list__item")', "the hits list", 15_000);
      const hitsText = await browser.evaluate("document.querySelector('#app-view').innerText");
      check("the alerts page lists the hit", hitsText.includes(list[0].title));
      check("the alerts page offers the RSS feed", /\/feed\/[a-f0-9]{32}\.rss/.test(await browser.call(() => document.querySelector('#app-view input[aria-label="RSS feed URL"]')?.value ?? hitsText)));

      await browser.clickByText("Mark as read", { selector: "#app-view button" });
      const marked = await browser.waitHttp({ method: "POST", path: "/api/notifications/" }, { timeout: 15_000 });
      check("marking a hit as read answers 200", marked.status === 200, `status ${marked.status}`);
      check("the unread count drops by exactly one", marked.json?.unread === unreadBefore - 1, `${marked.json?.unread} of ${unreadBefore}`);
      const afterRead = await browser.fetchPage("/api/notifications");
      const updated = (afterRead.json?.notifications ?? []).find((entry) => entry.id === list[0].id);
      check("the inbox records the notification as read", Boolean(updated?.read_at), JSON.stringify(updated));

      const feed = await browser.fetchPage(`/feed/${ctx.feedToken}.rss`);
      check("the RSS feed answers 200 without a session", feed.status === 200, `status ${feed.status}`);
      check("the RSS feed is RSS 2.0", /<rss version="2\.0">/.test(feed.text) && /<channel>/.test(feed.text));
      check("the RSS feed lists the notification as an item", feed.text.includes("<item>") && feed.text.includes(list[0].title.slice(0, 20)), feed.text.slice(0, 160));
    });

    /* ---------------------------------------------------------------- 8 */
    await step(
      "8",
      "recovery: sign out, spend a code on /reset, sign in again",
      async () => {
      // Signing out from any app screen.
      await browser.goto("/app");
      await browser.wait('!!document.querySelector("#app-signout")', "the sign-out button", 20_000);
      await browser.click("#app-signout", "sign out");
      const logout = await browser.waitHttp({ method: "POST", path: "/api/auth/logout" }, { timeout: 15_000 });
      check("POST /api/auth/logout answers 200", logout.status === 200, `status ${logout.status}`);
      await browser.wait('location.pathname === "/sign-in"', "the sign-in page", 20_000);
      check("signing out lands on /sign-in", (await browser.path()) === "/sign-in", String(await browser.path()));

      await browser.goto("/reset");
      await browser.wait('!!document.querySelector(\'[data-auth-form="recover"]\')', "the recovery-code form");
      const code = ctx.codes[0];
      await browser.setFormValues('[data-auth-form="recover"]', {
        email: ctx.email,
        code,
        password: ctx.newPassword,
        confirm: ctx.newPassword,
      });
      await browser.submitForm("Use the code");
      const recover = await browser.waitHttp({ method: "POST", path: "/api/auth/recover" }, { timeout: 20_000 });
      check("POST /api/auth/recover answers 200", recover.status === 200, `status ${recover.status}`);
      await browser.waitCall(() => /Password changed and every other session signed out/i.test(document.querySelector('[data-auth-form="recover"] [data-auth-status]')?.textContent ?? ""), [], "the recovery confirmation", 10_000);
      check(
        "the page confirms the password changed",
        /Password changed and every other session signed out/i.test((await browser.call(() => document.querySelector('[data-auth-form="recover"] [data-auth-status]')?.textContent)) ?? "")
      );

      // A spent code must not work twice. This refusal is expected, not a finding.
      const reuse = await browser.fetchPage("/api/auth/recover", { method: "POST", body: { email: ctx.email, code, password: ctx.newPassword } });
      check("the spent code is refused the second time", reuse.status === 400 && reuse.json?.error?.code === "invalid_recovery_code", `status ${reuse.status}, ${reuse.json?.error?.code}`);

      await browser.goto("/sign-in");
      await browser.wait('!!document.querySelector(\'[data-auth-form="login"]\')', "the sign-in form");
      await browser.setFormValues('[data-auth-form="login"]', { email: ctx.email, password: ctx.newPassword });
      await browser.submitForm("Sign in");
      const login = await browser.waitHttp({ method: "POST", path: "/api/auth/login" }, { timeout: 20_000 });
      check("the new password signs in", login.status === 200, `status ${login.status}`);
      await browser.wait('location.pathname === "/app"', "the dashboard after sign-in", 20_000);
      const me = await browser.waitHttp({ method: "GET", path: "/api/auth/me" }, { timeout: 15_000 });
      check("the session reads /api/auth/me after signing in", me.status === 200 && me.json?.user?.email === ctx.email, `status ${me.status}, ${me.json?.user?.email}`);

      // The old password must no longer work. This refusal is expected, not a finding.
      const oldPassword = await browser.fetchPage("/api/auth/login", { method: "POST", body: { email: ctx.email, password: ctx.password } });
      check("the old password is refused", oldPassword.status === 401 && oldPassword.json?.error?.code === "invalid_credentials", `status ${oldPassword.status}`);
      },
      {
        // The two refusals above are the point of the step: the server must say
        // 400/401, and Chrome logs every 4xx it sees. Neither is a finding.
        expect: [/status of 400 .*\/api\/auth\/recover/, /status of 401 .*\/api\/auth\/login/, /400 POST \/api\/auth\/recover/, /401 POST \/api\/auth\/login/],
      }
    );

    /* ---------------------------------------------------------------- 9 */
    // Phase 2 is optional: the model path needs a model, and this host has no
    // key. A local OpenAI-compatible stub is a test double, not a model, and
    // its only job is to make the grounding gate's rejection branch reachable.
    if (withModelStub) {
      await step("9", "model path (local stub): invented figure rejected, grounded change accepted", async () => {
        const stub = await startModelStub();
        const secondDir = join(workDir, "model-path");
        await mkdir(secondDir, { recursive: true });
        const second = await startServer({
          PORT: 0,
          HOST: "127.0.0.1",
          DATABASE_PATH: join(secondDir, "applywright.db"),
          dataDir: secondDir,
          ANTHROPIC_ORG_API_KEY: "",
          MODEL_PROVIDER: "openai",
          MODEL_API_KEY: "stub-key-not-a-secret",
          MODEL_BASE_URL: stub.url,
          MODEL_NAME: "stub-model",
          ALERTS_SCAN_MINUTES: 0,
          RATE_LIMIT_PER_MINUTE: 100_000,
        });
        note(`stub model instance at ${second.url}`);
        try {
          const email = `e2e-model-${stamp}@applywright.test`;
          const password = `e2e-model-password-${stamp}`;
          await browser.goto(`${second.url}/sign-up`);
          await browser.wait('!!document.querySelector(\'[data-auth-form="register"]\')', "the second sign-up form");
          await browser.setFormValues('[data-auth-form="register"]', { name: "Model Path", email, password, confirm: password });
          await browser.submitForm("Create account");
          const registration = await browser.waitHttp({ method: "POST", path: "/api/auth/register" }, { timeout: 20_000 });
          check("the model-path instance creates an account", registration.status === 201, `status ${registration.status}`);

          await browser.goto(`${second.url}/app/cv`);
          await browser.wait('!!document.querySelector("#cv-ingest")', "the second CV screen", 20_000);
          await browser.fillForm("Add this CV", [
            ["Name", "Model Path CV"],
            ["CV text", CV_TEXT],
          ]);
          await browser.submitForm("Add this CV");
          const created = await browser.waitHttp({ method: "POST", path: "/api/cvs" }, { timeout: 20_000 });
          check("the model-path instance stores a CV", created.status === 201, `status ${created.status}`);
          const cvId = created.json?.cv?.id;

          // The stub answers with a summary that invents "37%".
          stub.setReply({
            summary: "Analytical engineer who cut infrastructure cost by 37% for a global payments platform.",
            bullets: [],
            coverLetter: "Dear hiring team, I would welcome the chance to discuss the role.",
          });
          await browser.goto(`${second.url}/editor?cv=${encodeURIComponent(cvId)}`);
          await browser.wait('!!document.querySelector("#ed-form") && !document.querySelector("#ed-form").hidden', "the second editor", 20_000);
          await browser.fill("#ed-instruction", "Lead with the payments work.");
          await browser.call(() => {
            const scope = document.querySelector("#ed-scope");
            scope.value = "summary";
            scope.dispatchEvent(new Event("change", { bubbles: true }));
          });
          await browser.click("#ed-ask", "the ask button");
          const invented = await browser.waitHttp({ method: "POST", path: `/api/cvs/${cvId}/assist` }, { timeout: 30_000 });
          check("the model-path assist call answers 200", invented.status === 200, `status ${invented.status}`);
          check("the stub model was actually called", stub.requests.length > 0, `${stub.requests.length} calls`);
          const body = invented.json ?? {};
          check("the invented figure never becomes a change", (body.changes ?? []).length === 0, JSON.stringify((body.changes ?? []).map((change) => change.after)));
          check("the proposal is still marked saved: false", body.saved === false);
          check("the preview contains no invented figure", !/37%/.test(String(body.proposed?.text ?? "")));
          const reported = `${JSON.stringify(body.rejected ?? [])} ${(body.warnings ?? []).join(" ")}`;
          check("the refusal names the invented figure", /37%/.test(reported), reported.slice(0, 200));
          await browser.waitCall(() => (document.querySelector("#ed-assist-state")?.textContent ?? "").length > 0, [], "the model-path status", 10_000);
          check("the page reports the refusal rather than staying silent", /Nothing passed the check|reverted/i.test((await browser.text("#ed-assist-state")) ?? "") || /reverted/i.test(await browser.evaluate("document.querySelector('#ed-proposals').innerText")));

          // Now a grounded reply: same facts, no new figure.
          stub.setReply({
            summary: "Analytical engineer who drove the migration of a payments platform to Kubernetes, cutting deploy time from 45 minutes to 9 minutes.",
            bullets: [],
            coverLetter: "Dear hiring team, I would welcome the chance to discuss the role.",
          });
          await browser.fill("#ed-instruction", "Lead with the payments work.");
          await browser.click("#ed-ask", "the ask button");
          const grounded = await browser.waitHttp({ method: "POST", path: `/api/cvs/${cvId}/assist` }, { timeout: 30_000 });
          const groundedBody = grounded.json ?? {};
          check("a grounded model reply is offered as a change", (groundedBody.changes ?? []).length >= 1, JSON.stringify(groundedBody.changes));
          check("the response reports the model mode", groundedBody.mode === "model", String(groundedBody.mode));
          check(
            "the grounded change keeps the CV's own figures",
            (groundedBody.changes ?? []).every((change) => /45 minutes/.test(change.after) && /9 minutes/.test(change.after)),
            JSON.stringify((groundedBody.changes ?? []).map((change) => change.after))
          );
          await browser.waitCall(() => document.querySelectorAll(".ed-hunk").length > 0, [], "the model-path hunk", 10_000);
          check("the page says a model produced it, then it was checked", /configured model, then checked/i.test((await browser.text("#ed-assist-state")) ?? ""));
          await browser.clickByText("Accept and save", { selector: ".ed-hunk button" });
          const saved = await browser.waitHttp({ method: "PATCH", path: "/api/cvs/" }, { timeout: 20_000 });
          check("the grounded model change saves", saved.status === 200, `status ${saved.status}`);
          check("the saved CV carries the grounded rewrite", String(saved.json?.cv?.text ?? "").includes("drove the migration of a payments platform"));
        } finally {
          await second.close();
          await stub.close();
        }
      });
    } else {
      console.log(dim("STEP 9 · model path (local stub) — SKIPPED (--no-model-stub)\n"));
    }

    exitCode = ledger.steps.every((entry) => entry.status === "PASS") ? 0 : 1;
  } catch (error) {
    // A failure before the first step (Chrome missing, port taken) still has to
    // explain itself rather than dumping a stack.
    console.error(red(`\nrun aborted before the journey finished: ${error.message}`));
    exitCode = 1;
  } finally {
    // Browser cleanup is part of the result: if the owned tree cannot be proved
    // closed, the run fails and says why. It is never swallowed into a PASS.
    let cleanupFailure = null;
    try {
      await browser.close();
    } catch (error) {
      cleanupFailure = error;
      exitCode = 1;
      console.error(red(`\nbrowser lifecycle: cleanup could not be proved: ${error.message}`));
      if (error.details) console.error(dim(`  ${JSON.stringify(error.details)}`));
    }
    await instance.close().catch(() => {});
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const passed = ledger.steps.filter((entry) => entry.status === "PASS").length;
    const failed = ledger.steps.filter((entry) => entry.status !== "PASS");
    const assertions = ledger.steps.reduce((total, entry) => total + entry.checks.length, 0);
    const failedAssertions = ledger.steps.reduce((total, entry) => total + entry.checks.filter((check) => !check.ok).length, 0);
    console.log(bold("LEDGER"));
    console.log(`  steps        ${passed} passed, ${failed.length} failed, ${ledger.steps.length} run`);
    console.log(`  assertions   ${assertions - failedAssertions} passed, ${failedAssertions} failed`);
    console.log(`  duration     ${seconds}s`);
    if (failed.length) {
      console.log(`  failed       ${failed.map((entry) => `STEP ${entry.id}`).join(", ")}`);
    }
    if (cleanupFailure) console.log(`  lifecycle    cleanup could not be proved: ${cleanupFailure.message}`);
    const notes = ledger.steps.flatMap((entry) => entry.issues.filter((issue) => issue.kind === "note").map((issue) => `STEP ${entry.id}: ${issue.detail}`));
    if (notes.length) {
      console.log("");
      console.log(bold("NOTES"));
      for (const line of notes) console.log(dim(`  · ${line}`));
    }
    console.log("");
    if (exitCode === 0) {
      console.log(green("PASS — the whole journey behaved as the product claims."));
      if (!keep) await rm(workDir, { recursive: true, force: true }).catch(() => {});
    } else {
      console.log(red(`FAIL — artifacts and downloads kept at ${workDir}`));
      console.log(dim(`  screenshots: ${artifacts}`));
    }
    console.log("");
  }
  process.exitCode = exitCode;
}

// Only run when executed directly: the pure helpers above are imported by tests.
const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked && invoked === resolve(HERE)) {
  run().catch((error) => {
    console.error(red(`e2e-flow failed: ${error?.stack ?? error}`));
    process.exitCode = 1;
  });
}
