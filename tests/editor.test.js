/**
 * The CV editor: its document model, its three exports, and the assist route.
 *
 * Two kinds of test live here:
 *   1. pure functions from public/assets/editor.js — the same module the server
 *      imports, so a round-trip failure is a real save-drift bug, not a test
 *      fixture problem;
 *   2. the HTTP contract of `POST /api/cvs/:id/assist`, which must propose and
 *      never save, must refuse an invented number, and must be 401/404 rather
 *      than helpful when it should not answer at all.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { startServer } from "../server/app.js";
import { segmentSections } from "../server/lib/cv/extract.js";
import {
  applyChange,
  buildDocx,
  diffLines,
  documentFromProfile,
  documentTitle,
  exportFilename,
  markdownFor,
  parseNotice,
  PROPOSAL_ART,
  proposalEmptyStateVisible,
  reconstructCvText,
  SECTION_HEADINGS,
  sectionsFromProfile,
} from "../public/assets/editor.js";

const PASSWORD = "correct horse battery staple";

const CV_TEXT = [
  "Ada Lovelace",
  "ada@example.com",
  "+44 7700 900456",
  "linkedin.com/in/ada",
  "",
  "Summary",
  "Analytical engine programmer with ten years of mathematical practice and a published algorithm to her name.",
  "Writes precise notation and explains it to non-specialists.",
  "",
  "Experience",
  "Programmer, Analytical Engine, 1843-1850",
  "- Wrote the first published algorithm for the analytical engine, 1843.",
  "- Documented seven instruction sequences for computing Bernoulli numbers.",
  "",
  "Education",
  "Mathematics, private tuition, 1840-1843.",
  "",
  "Skills",
  "Mathematics, algorithms, notation, technical writing, proofreading.",
].join("\n");

const CV_WITH_JARGON = [
  "Ada Lovelace",
  "ada@example.com",
  "",
  "Summary",
  "Programmer of the analytical engine, ten years of mathematical practice.",
  "",
  "Experience",
  "- Documented seven instruction sequences for computing Bernoulli numbers.",
  "",
  "Skills",
  "Python, SQL, utilise dashboards, leverage reporting",
].join("\n");

/* ------------------------------------------------------------------------- *
 * Pure document model
 * ------------------------------------------------------------------------- */

describe("the document model", () => {
  /**
   * The property that makes a save safe: read the CV into sections, rebuild the
   * text, read it back, and get the identical document. If this fails, editing
   * one word would quietly rewrite the user's CV every time they pressed Save.
   */
  test("reconstructing a CV and segmenting it again is a fixed point", () => {
    const cases = {
      "headings and an international number": CV_TEXT,
      "a national number and a place": [
        "Grace Hopper",
        "grace.hopper@example.com",
        "07700 900123",
        "London, UK",
        "",
        "Summary",
        "Senior backend engineer with nine years building Node.js services and PostgreSQL data platforms.",
        "",
        "Experience",
        "Staff Platform Engineer, Northwind Systems, 2021-2026",
        "- Built a Node.js payments service handling 4 million requests per day.",
        "- Led migration of 42 services to PostgreSQL 16 with zero downtime.",
        "",
        "Education",
        "BSc Computer Science, University of Manchester, 2012-2015",
        "",
        "Skills",
        "Node.js, TypeScript, PostgreSQL, SQL, Docker, Kubernetes",
      ].join("\n"),
      "no headings at all": [
        "Curriculum Vitae",
        "",
        "I am a hard working person who enjoys working with computers and helping people. I have done various jobs over the years and I learn quickly.",
        "",
        "Experience",
        "Various roles in offices and shops. I answered phones, filed paperwork and served customers.",
        "",
        "Education",
        "School.",
        "",
        "Skills",
        "Computing, communication.",
      ].join("\n"),
    };

    for (const [label, source] of Object.entries(cases)) {
      const first = documentFromProfile(segmentSections(source));
      const rebuilt = reconstructCvText(first);
      const second = documentFromProfile(segmentSections(rebuilt));
      assert.deepEqual(second, first, `${label}: the document changed on a round trip`);
    }
  });

  test("a phone number that leaked into a section is not printed twice", () => {
    // `segmentSections` keeps a bare phone line in `contact` *and* in whichever
    // section the preamble heuristic picked. The editor removes the duplicate
    // once, so the saved text has one copy of the number.
    const profile = segmentSections(["Ada Lovelace", "+44 7700 900456", "", "Skills", "Notation, mathematics"].join("\n"));
    assert.ok(profile.sections.other.includes("+44 7700 900456"), "fixture expects the duplicate in the stored profile");

    const document = documentFromProfile(profile);
    assert.equal(document.contact.phone, "+44 7700 900456");
    assert.ok(!document.sections.other.includes("+44 7700 900456"));

    const text = reconstructCvText(document);
    assert.equal(text.split("+44 7700 900456").length - 1, 1, "the number appears exactly once");
  });

  test("reconstruction writes recognised headings in document order", () => {
    const document = documentFromProfile(segmentSections(CV_TEXT));
    const text = reconstructCvText(document);
    const present = Object.keys(SECTION_HEADINGS).filter((key) => document.sections[key]);
    const order = present.map((key) => text.indexOf(`\n${SECTION_HEADINGS[key]}\n`));
    assert.ok(
      order.every((index) => index > 0),
      `every non-empty section gets its own heading line: ${present.join(", ")}`
    );
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
      "headings appear in summary, experience, education, skills, other order"
    );
    assert.ok(text.startsWith("Ada Lovelace\nada@example.com\n"), "the contact block leads");
  });

  test("an empty section is left out of the text", () => {
    const document = {
      contact: { name: "Ada Lovelace", email: "ada@example.com", phone: "", links: [] },
      sections: { summary: "Years of notation.", experience: "", education: "", skills: "", other: "" },
    };
    const text = reconstructCvText(document);
    assert.equal(text, "Ada Lovelace\nada@example.com\n\nSummary\nYears of notation.");
    assert.ok(!text.includes("Experience"));
  });

  test("Markdown has one H1, real H2 headings and list items", () => {
    const document = documentFromProfile(segmentSections(CV_TEXT));
    const markdown = markdownFor({ contact: document.contact, sections: document.sections, title: "Ada Lovelace" });

    assert.ok(markdown.startsWith("# Ada Lovelace\n"));
    assert.equal([...markdown.matchAll(/^# /gm)].length, 1, "exactly one H1");
    assert.ok(markdown.includes("## Experience\n"));
    assert.ok(markdown.includes("- Wrote the first published algorithm for the analytical engine, 1843."));
    assert.ok(markdown.includes("- Documented seven instruction sequences for computing Bernoulli numbers."));
    assert.ok(!markdown.includes("<"), "plain Markdown, no HTML");
    assert.ok(markdown.endsWith("\n"), "ends in one newline");
  });

  test("applying a change keeps the bullet marker and refuses text that is not there", () => {
    const experience = "Programmer, Analytical Engine, 1843-1850\n- Wrote the first published algorithm for the analytical engine, 1843.";
    const next = applyChange(
      experience,
      "Wrote the first published algorithm for the analytical engine, 1843.",
      "Wrote the first published algorithm, 1843."
    );
    assert.equal(next, "Programmer, Analytical Engine, 1843-1850\n- Wrote the first published algorithm, 1843.");
    assert.equal(applyChange(experience, "not in this section", "anything"), null);
  });

  test("a whitespace-collapsed proposal still matches the line it came from", () => {
    // refine collapses whitespace before returning a bullet, so the matcher has
    // to tolerate it or a legitimately grounded rewrite would be dropped.
    const section = "- Cut   checkout  drop-off by 18% over two releases.";
    const next = applyChange(section, "Cut checkout drop-off by 18% over two releases.", "Cut checkout drop-off 18% over two releases.");
    assert.equal(next, "- Cut checkout drop-off 18% over two releases.");
  });

  test("the diff names added and removed lines", () => {
    const rows = diffLines("one\ntwo\nthree", "one\nTWO\nthree\nfour");
    assert.deepEqual(
      rows.filter((row) => row.kind !== "same").map((row) => `${row.kind}:${row.text}`),
      ["del:two", "add:TWO", "add:four"]
    );
    assert.ok(diffLines("same", "same").every((row) => row.kind === "same"));
  });

  test("download names are filesystem-safe", () => {
    assert.equal(exportFilename("Ada Lovelace — CV", "md"), "ada-lovelace-cv.md");
    assert.equal(exportFilename("", ".docx"), "cv.docx");
    assert.equal(exportFilename("../../etc/passwd", "md"), "etc-passwd.md");
  });

  test("a parsed profile becomes sections with the location kept, not dropped", () => {
    const { contact, sections } = sectionsFromProfile({
      name: "Ada Lovelace",
      headline: "Programmer",
      location: "London, England",
      about: "Analytical engine programmer.",
      contact: { email: "ada@example.com", phone: "+44 7700 900456", url: "https://linkedin.com/in/ada" },
      experience: [
        { title: "Programmer", company: "Analytical Engine", dates: "1843-1850", location: null, bullets: ["Wrote the first algorithm."] },
      ],
      education: [{ school: "Private tuition", degree: "Mathematics", dates: "1840-1843", details: null }],
      skills: ["Notation", "Mathematics"],
      certifications: [{ name: "Fellow", issuer: "Royal Society", date: "1843" }],
      languages: ["English", "French"],
    });

    assert.equal(contact.name, "Ada Lovelace");
    assert.equal(contact.email, "ada@example.com");
    assert.deepEqual(contact.links, ["https://linkedin.com/in/ada"]);
    assert.equal(sections.summary, "Analytical engine programmer.");
    assert.match(sections.experience, /^- Wrote the first algorithm\.$/m);
    assert.match(sections.experience, /Analytical Engine · 1843-1850/);
    assert.equal(sections.skills, "Notation, Mathematics");
    assert.match(sections.other, /London, England/);
    assert.match(sections.other, /Fellow — Royal Society/);
    assert.match(sections.other, /English, French/);
    // The headline is not silently lost when an about paragraph exists.
    assert.match(sections.other, /Programmer/);
  });
});

/* ------------------------------------------------------------------------- *
 * DOCX
 * ------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A minimal zip reader: enough to prove the writer's central directory is honest. */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  assert.notEqual(eocd, -1, "no end-of-central-directory record");

  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50, "central directory header signature");
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

    assert.equal(view.getUint32(localOffset, true), 0x04034b50, `local header for ${name}`);
    assert.equal(view.getUint16(localOffset + 8, true), 0, `${name} is stored, not deflated`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(start, start + size);

    assert.equal(crc32(data), crc, `CRC for ${name}`);
    entries.set(name, new TextDecoder().decode(data));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe("the DOCX export", () => {
  test("is a valid stored zip with real heading styles", () => {
    const document = documentFromProfile(segmentSections(CV_TEXT));
    const bytes = buildDocx({ contact: document.contact, sections: document.sections, title: "Ada Lovelace" });

    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04], "starts with a local file header");

    const entries = readZip(bytes);
    for (const name of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"]) {
      assert.ok(entries.has(name), `${name} is packaged`);
    }

    const xml = entries.get("word/document.xml");
    assert.ok(xml.includes('<w:pStyle w:val="Heading1"/>'), "the name is a real heading");
    assert.ok(xml.includes('<w:pStyle w:val="Heading2"/>'), "each section is a real heading");
    assert.ok(xml.includes("Summary") && xml.includes("Experience") && xml.includes("Skills"));
    assert.ok(xml.includes("Wrote the first published algorithm"), "bullets survive as text");
    assert.ok(!xml.includes("<w:tbl>"), "single column: no tables");
    assert.ok(xml.includes('<w:pgSz w:w="11906" w:h="16838"/>'), "A4 page size");

    assert.ok(entries.get("word/styles.xml").includes("heading 1"));
    assert.ok(entries.get("[Content_Types].xml").includes("wordprocessingml.styles+xml"));
  });

  test("the heading is the candidate's name, not the CV record's name", () => {
    // The bug this pins: a CV record called "Pasted CV" whose contact block says
    // "Ada Lovelace" exported a Word document headed "Pasted CV" — the one file
    // an employer sees carried the placeholder. The heading is now decided by
    // documentTitle() for the DOCX, the Markdown and the print sheet.
    const document = documentFromProfile(segmentSections(CV_TEXT));
    const bytes = buildDocx({ contact: document.contact, sections: document.sections, title: "Pasted CV" });
    const xml = readZip(bytes).get("word/document.xml");

    const headingBlock = xml.slice(xml.indexOf('<w:pStyle w:val="Heading1"/>'));
    const heading = (headingBlock.match(/<w:t xml:space="preserve">([^<]*)<\/w:t>/) ?? [])[1];
    assert.equal(heading, "Ada Lovelace", "the Heading 1 paragraph is the candidate's name");
    assert.ok(!xml.includes("Pasted CV"), "the record's label never becomes the document's heading");

    // The same rule, in the same place: the Markdown export and any future caller.
    assert.match(markdownFor({ contact: document.contact, sections: document.sections, title: "Pasted CV" }), /^# Ada Lovelace\n/);
    assert.equal(documentTitle({ contact: document.contact, title: "Pasted CV" }), "Ada Lovelace");

    // Precedence, all three branches: name, then record name, then generic.
    assert.equal(documentTitle({ contact: {}, title: "Pasted CV" }), "Pasted CV");
    assert.equal(documentTitle({}), "Curriculum vitae");
    assert.equal(documentTitle({ contact: { name: "Ada Lovelace" }, title: "" }), "Ada Lovelace");
  });

  test("escapes XML rather than producing a document Word refuses", () => {
    const bytes = buildDocx({
      contact: { name: "Ada & Charles <test>", email: "ada@example.com", phone: "", links: [] },
      sections: { summary: 'Ampersand & "quotes" <angles>', experience: "", education: "", skills: "", other: "" },
      title: "Ada & Charles",
    });
    const xml = readZip(bytes).get("word/document.xml");
    assert.ok(!xml.includes("<angles>"));
    assert.ok(xml.includes("Ampersand &amp; &quot;quotes&quot; &lt;angles&gt;"));
  });

  test("the same document exports byte-identical files", () => {
    const document = documentFromProfile(segmentSections(CV_TEXT));
    const first = buildDocx({ contact: document.contact, sections: document.sections, title: "Ada Lovelace" });
    const second = buildDocx({ contact: document.contact, sections: document.sections, title: "Ada Lovelace" });
    assert.deepEqual([...first], [...second]);
  });
});

/* ------------------------------------------------------------------------- *
 * HTTP: the page and the assist route
 * ------------------------------------------------------------------------- */

let instance;
let base;
let stubInstance;
let stubModel;
let stubRequests = 0;

/** A stub OpenAI-compatible endpoint that returns one fixed completion. */
async function startStubModel(reply) {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      stubRequests += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}/v1` };
}

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-test-editor-"));
  const common = {
    dataDir: dir,
    databasePath: join(dir, "test.db"),
    PORT: 0,
    AUTH_RATE_LIMIT_PER_MINUTE: 100,
    RATE_LIMIT_PER_MINUTE: 1000,
    ALERTS_SCAN_MINUTES: 0,
    JOB_FEED_CACHE_MINUTES: 0,
  };
  instance = await startServer({ ...common, MODEL_API_KEY: "", ANTHROPIC_ORG_API_KEY: "" });

  stubModel = await startStubModel({
    summary: "Analytical engine programmer with 37% faster notation.",
    bullets: [],
    coverLetter: "Not part of this CV.",
  });
  stubInstance = await startServer({
    ...common,
    dataDir: await mkdtemp(join(tmpdir(), "aw-test-editor-model-")),
    databasePath: join(dir, "stub.db"),
    MODEL_API_KEY: "stub-key-not-a-secret",
    MODEL_BASE_URL: stubModel.url,
    MODEL_NAME: "stub",
    MODEL_PROVIDER: "openai",
    ANTHROPIC_ORG_API_KEY: "",
    MODEL_TIMEOUT_MS: 5000,
  });
});

after(async () => {
  await instance?.close();
  await stubInstance?.close();
  await new Promise((resolve) => stubModel?.server.close(resolve));
});

/** A fetch client with its own cookie jar, mirroring tests/cvs.test.js. */
function createClient(origin) {
  const jar = new Map();

  return async function call(method, path, body, options = {}) {
    const headers = { ...(options.headers ?? {}) };
    if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    let payload;
    if (body !== undefined) {
      payload = typeof body === "string" ? body : JSON.stringify(body);
      if (!headers["content-type"]) headers["content-type"] = "application/json";
    }
    if (method !== "GET" && method !== "HEAD" && headers.origin === undefined) headers.origin = origin;

    const response = await fetch(`${origin}${path}`, { method, headers, body: payload, redirect: "manual" });
    const text = await response.text();
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index === -1) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value) jar.set(name, value);
      else jar.delete(name);
    }
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, headers: response.headers, text, json };
  };
}

async function signedIn(origin, email) {
  const call = createClient(origin);
  const response = await call("POST", "/api/auth/register", { email, password: PASSWORD, name: "Test User" });
  assert.equal(response.status, 201, `registration failed for ${email}: ${response.text}`);
  return call;
}

async function createCv(call, text = CV_TEXT) {
  const created = await call("POST", "/api/cvs", { name: "Ada — CV", text });
  assert.equal(created.status, 201, created.text);
  return created.json.cv;
}

describe("the proposal empty state", () => {
  test("the artwork is the file it claims to be, and is decorative", async () => {
    const svg = await readFile(new URL("../public/assets/art/empty-proposals.svg", import.meta.url), "utf8");
    const flatten = (value) => value.replace(/\s+/g, " ").trim();
    assert.equal(
      flatten(PROPOSAL_ART),
      flatten(svg),
      "public/assets/art/empty-proposals.svg changed: update PROPOSAL_ART in public/assets/editor.js so the page and the art set cannot drift"
    );
    assert.ok(PROPOSAL_ART.trim().startsWith("<svg"), "it parses as an SVG document element");
    assert.match(PROPOSAL_ART, /stroke="currentColor"/, "the drawing inherits the theme colour");
    assert.match(PROPOSAL_ART, /aria-hidden="true"/, "the drawing is decorative");
    assert.ok(!PROPOSAL_ART.includes("<script"), "no script in the artwork");
  });

  test("the drawing is absent whenever there is data, and when no CV is loaded", () => {
    // The rail's rule, asserted directly: a loaded document with no proposal
    // shows the empty state; a proposal of any kind — including one that
    // proposed nothing — removes it; a document that failed to load leaves the
    // "no CV chosen" state to lead.
    assert.equal(proposalEmptyStateVisible({ loaded: true, proposal: null }), true, "loaded, nothing proposed yet");
    assert.equal(proposalEmptyStateVisible({ loaded: true, proposal: { changes: [] } }), false, "a refusal is data too");
    assert.equal(proposalEmptyStateVisible({ loaded: true, proposal: { changes: [{ section: "summary" }] } }), false);
    assert.equal(proposalEmptyStateVisible({ loaded: false, proposal: null }), false, "no CV loads, so the document state leads");
    assert.equal(proposalEmptyStateVisible({}), false);
    assert.equal(proposalEmptyStateVisible(), false);
  });
});

describe("the editor page", () => {
  test("is served once and loads its own stylesheet and script", async () => {
    base = instance.url;
    const response = await fetch(`${base}/editor?cv=whatever`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.ok(html.includes("<title>CV editor · Applywright</title>"), "the page title");
    assert.ok(html.includes('href="/assets/editor.css"'));
    assert.ok(html.includes('src="/assets/editor.js"'));
    assert.equal([...html.matchAll(/<h1\b/gi)].length, 1, "exactly one H1");
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), "no inline script (CSP script-src 'self')");
  });
});

describe("POST /api/cvs/:id/assist", () => {
  test("proposes changes and never writes to the CV", async () => {
    const call = await signedIn(base, "assist-propose@example.com");
    const cv = await createCv(call);

    const response = await call("POST", `/api/cvs/${cv.id}/assist`, {
      instruction: "Make the summary shorter and plainer.",
      scope: "summary",
    });
    assert.equal(response.status, 200, response.text);

    const body = response.json;
    assert.equal(body.saved, false, "the route says it saved nothing");
    assert.equal(body.mode, "rules", "no model is configured on this instance");
    assert.equal(body.scope, "summary");
    assert.ok(typeof body.proposed?.text === "string" && body.proposed.text.length > 80);
    assert.ok(body.proposed.sections && typeof body.proposed.sections.summary === "string");
    assert.ok(Array.isArray(body.changes) && Array.isArray(body.rejected));

    assert.ok(body.changes.length >= 1, "a shorter summary was proposed");
    for (const change of body.changes) {
      assert.equal(change.section, "summary", "every change honours the requested scope");
      assert.equal(typeof change.before, "string");
      assert.equal(typeof change.after, "string");
      assert.equal(typeof change.why, "string");
      assert.ok(change.before.length > 0 && change.after.length > 0);
      assert.notEqual(change.before, change.after);
    }
    assert.ok(
      body.proposed.text.includes(body.changes[0].after),
      "the preview contains the proposal it just made"
    );

    // Nothing was stored: the CV text and its sections are exactly what they were.
    const after = await call("GET", `/api/cvs/${cv.id}`);
    assert.equal(after.status, 200);
    assert.equal(after.json.cv.text, CV_TEXT);
    assert.deepEqual(after.json.cv.profile.sections, segmentSections(CV_TEXT).sections);
  });

  test("drops changes outside the requested scope", async () => {
    const call = await signedIn(base, "assist-scope@example.com");
    const cv = await createCv(call);

    // "shorter" without a scope hint would touch the summary and every bullet.
    const everything = await call("POST", `/api/cvs/${cv.id}/assist`, { instruction: "Make it shorter." });
    assert.equal(everything.status, 200, everything.text);
    const sectionsUsed = new Set(everything.json.changes.map((change) => change.section));
    assert.ok(sectionsUsed.size >= 1);

    const summaryOnly = await call("POST", `/api/cvs/${cv.id}/assist`, {
      instruction: "Make it shorter.",
      scope: "summary",
    });
    assert.equal(summaryOnly.status, 200, summaryOnly.text);
    assert.ok(summaryOnly.json.changes.length >= 1);
    assert.deepEqual([...new Set(summaryOnly.json.changes.map((change) => change.section))], ["summary"]);
  });

  test("a non-experience section is proposed for its own scope", async () => {
    const call = await signedIn(base, "assist-skills@example.com");
    const cv = await createCv(call, CV_WITH_JARGON);

    const response = await call("POST", `/api/cvs/${cv.id}/assist`, { instruction: "Less jargon, please.", scope: "skills" });
    assert.equal(response.status, 200, response.text);
    assert.ok(response.json.changes.length >= 1, "a line-level unit outside experience can be proposed");

    for (const change of response.json.changes) {
      assert.equal(change.section, "skills");
      assert.ok(!/utilise|leverage/i.test(change.after), change.after);
      assert.ok(response.json.proposed.sections.skills.includes(change.after), "the preview applied the change");
    }
    assert.ok(!response.json.proposed.text.includes("utilise"));

    const after = await call("GET", `/api/cvs/${cv.id}`);
    assert.equal(after.json.cv.text, CV_WITH_JARGON, "the proposal is still not saved");
  });

  test("refuses a scope it does not have", async () => {
    const call = await signedIn(base, "assist-bad-scope@example.com");
    const cv = await createCv(call);
    const response = await call("POST", `/api/cvs/${cv.id}/assist`, { instruction: "Make it shorter.", scope: "contact" });
    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, "invalid_request");
  });

  test("refuses a one-word instruction", async () => {
    const call = await signedIn(base, "assist-short-instruction@example.com");
    const cv = await createCv(call);
    const response = await call("POST", `/api/cvs/${cv.id}/assist`, { instruction: "go" });
    assert.equal(response.status, 400);
  });

  test("is 401 without a session and 404 for an unknown or foreign CV", async () => {
    const anonymous = createClient(base);
    const unauthorised = await anonymous("POST", "/api/cvs/anything/assist", { instruction: "Make it shorter." });
    assert.equal(unauthorised.status, 401);
    assert.equal(unauthorised.json.error.code, "unauthorized");

    const owner = await signedIn(base, "assist-owner@example.com");
    const cv = await createCv(owner);

    const unknown = await owner("POST", "/api/cvs/cv_missing/assist", { instruction: "Make it shorter." });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.json.error.code, "not_found");

    const stranger = await signedIn(base, "assist-stranger@example.com");
    const foreign = await stranger("POST", `/api/cvs/${cv.id}/assist`, { instruction: "Make it shorter." });
    assert.equal(foreign.status, 404, "another user's CV is not found, not forbidden");
  });
});

describe("the grounding check in the assist route", () => {
  test("an invented number never reaches the proposal", async () => {
    stubRequests = 0;
    const call = await signedIn(stubInstance.url, "assist-invented@example.com");
    const cv = await createCv(call);

    // "Lead with the payments work" matches no rule, so the only thing that can
    // produce a change is the model — and its answer invents "37%".
    const response = await call("POST", `/api/cvs/${cv.id}/assist`, {
      instruction: "Lead with the payments work.",
      scope: "summary",
    });
    assert.equal(response.status, 200, response.text);
    assert.equal(stubRequests > 0, true, "the stub model was actually called");

    const body = response.json;
    assert.equal(body.saved, false);
    assert.deepEqual(body.changes, [], "the invented figure was not proposed");
    assert.ok(!body.proposed.text.includes("37%"), "the preview does not contain the invention");
    for (const change of body.changes) assert.ok(!String(change.after).includes("37%"));

    // The refusal is visible rather than silent: either the structured list or
    // the refinement's own notes must name it.
    const reported = JSON.stringify(body.rejected) + " " + (body.warnings ?? []).join(" ");
    assert.match(reported, /37%/, "the refusal names the invented figure");

    const after = await call("GET", `/api/cvs/${cv.id}`);
    assert.equal(after.json.cv.text, CV_TEXT, "the CV is untouched");
    assert.ok(!after.json.cv.text.includes("37%"));
  });

  test("a model proposal that keeps every fact is offered as a change", async () => {
    // Same instance, different route output: swap the stub's reply by starting
    // one more server with a grounded summary.
    const dir = await mkdtemp(join(tmpdir(), "aw-test-editor-grounded-"));
    const grounded = await startStubModel({
      summary: "Analytical engine programmer with ten years of mathematical practice.",
      bullets: [],
      coverLetter: "Not part of this CV.",
    });
    const server = await startServer({
      dataDir: dir,
      databasePath: join(dir, "grounded.db"),
      PORT: 0,
      AUTH_RATE_LIMIT_PER_MINUTE: 100,
      RATE_LIMIT_PER_MINUTE: 1000,
      ALERTS_SCAN_MINUTES: 0,
      MODEL_API_KEY: "stub-key-not-a-secret",
      MODEL_BASE_URL: grounded.url,
      MODEL_NAME: "stub",
      MODEL_PROVIDER: "openai",
      ANTHROPIC_ORG_API_KEY: "",
      MODEL_TIMEOUT_MS: 5000,
    });

    try {
      const call = await signedIn(server.url, "assist-grounded@example.com");
      const cv = await createCv(call);
      const response = await call("POST", `/api/cvs/${cv.id}/assist`, {
        instruction: "Lead with the payments work.",
        scope: "summary",
      });

      assert.equal(response.status, 200, response.text);
      const body = response.json;
      assert.equal(body.mode, "model");
      if (body.changes.length) {
        // The rewrite drops a sentence but keeps every figure it states. It is
        // the model's text, and it is only a proposal.
        assert.equal(body.changes[0].section, "summary");
        assert.equal(body.changes[0].after, "Analytical engine programmer with ten years of mathematical practice.");
        assert.ok(body.proposed.text.includes(body.changes[0].after));
      }
      const after = await call("GET", `/api/cvs/${cv.id}`);
      assert.equal(after.json.cv.text, CV_TEXT, "a model proposal is never saved");
    } finally {
      await server.close();
      await new Promise((resolve) => grounded.server.close(resolve));
    }
  });
});

/**
 * The warning that has to appear before a save, not in the diff afterwards.
 * `parseNotice` is pure: the page decides where to render it, these tests pin
 * when it fires and what it says.
 */
describe("the parse notice before a save", () => {
  test("says nothing about a CV that parsed into section placeholders", () => {
    assert.equal(
      parseNotice({
        sections: {
          summary: "Product engineer with eight years in UK fintech.",
          experience: "- Led a team of four engineers rebuilding the account-opening platform.",
          education: "BSc Computer Science, University of Manchester.",
          skills: "TypeScript, Node.js, PostgreSQL",
          other: "",
        },
      }),
      null
    );
  });

  test("a CV that came back entirely under Other is reported by word count", () => {
    const notice = parseNotice({ sections: { other: "word ".repeat(120) } });
    assert.ok(notice, "a notice is expected");
    assert.equal(notice.code, "nothing-placed");
    assert.match(notice.title, /No section headings were detected/);
    assert.match(notice.body, /All 120 words are under Other/);
    // The consequence, not just the symptom: a save writes this split back.
    assert.match(notice.body, /Saving after an edit writes it back/);
  });

  test("a blob in Summary with the other sections empty is called a guess from the raw text", () => {
    const notice = parseNotice({ sections: { summary: "word ".repeat(190) } });
    assert.ok(notice);
    assert.equal(notice.code, "all-in-summary");
    assert.match(notice.title, /Experience, Education or Skills/);
    assert.match(notice.body, /190 words are sitting in Summary/);
    assert.match(notice.body, /rewrites the stored CV in this split/);
  });

  test("roles stuck under Other are reported when Experience is empty", () => {
    const notice = parseNotice({
      sections: { summary: "Short summary.", other: "word ".repeat(80) },
    });
    assert.ok(notice);
    assert.equal(notice.code, "experience-in-other");
    assert.match(notice.title, /No Experience section/);
    assert.match(notice.body, /Other holds 80 words/);
  });

  test("a short summary with real Experience is not a parse failure", () => {
    assert.equal(
      parseNotice({
        sections: {
          summary: "Eight years in fintech.",
          experience: "- Rebuilt the account-opening platform for 2.4 million customers.",
          education: "",
          skills: "",
          other: "",
        },
      }),
      null
    );
  });

  test("an empty document, and a missing one, produce no notice", () => {
    assert.equal(parseNotice({ sections: {} }), null);
    assert.equal(parseNotice({}), null);
    assert.equal(parseNotice(), null);
  });
});
