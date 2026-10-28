/**
 * The pure half of scripts/e2e-flow.mjs, proved offline.
 *
 * The journey itself needs Chrome and a live server, so it lives in
 * `scripts/e2e-flow.mjs` and is run by hand (or by CI with Chrome present). What
 * can be checked without a browser is checked here: the zip writer and reader the
 * DOCX assertions lean on, the PDF page-box reader the A4 assertion leans on, and
 * the fact-checking helper the tailoring step uses to decide that nothing was
 * invented. If one of these is wrong the journey can pass while measuring the
 * wrong thing, which is worse than failing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  A4_POINTS,
  buildMinimalDocx,
  buildStoredZip,
  crc32,
  inventedFacts,
  isZipSignature,
  pdfMediaBox,
  plainText,
  readZipEntries,
  recoveryCodesFromFile,
  textNumbers,
} from "../scripts/e2e-flow.mjs";

test("crc32 matches the published check value", () => {
  // The standard check value for "123456789" is 0xCBF43926.
  assert.equal(crc32("123456789"), 0xcbf43926);
  assert.equal(crc32("hello"), 0x3610a686);
  assert.equal(crc32(""), 0);
});

test("isZipSignature accepts a zip and rejects anything else", () => {
  assert.equal(isZipSignature(buildStoredZip([])), true);
  assert.equal(isZipSignature(Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0])), true, "an empty zip is a zip");
  assert.equal(isZipSignature(Buffer.from("PK")), false, "two bytes is not a header");
  assert.equal(isZipSignature(Buffer.from("%PDF-1.7")), false);
  assert.equal(isZipSignature(Buffer.alloc(0)), false);
});

test("a stored zip round-trips through the reader", () => {
  const entries = [
    { name: "a.txt", data: "hello" },
    { name: "dir/b.json", data: Buffer.from('{"ok":true}') },
    { name: "empty.txt", data: "" },
  ];
  const zip = buildStoredZip(entries);
  assert.equal(isZipSignature(zip), true);
  const read = readZipEntries(zip);
  assert.ok(Array.isArray(read));
  assert.deepEqual(
    read.map((entry) => entry.name),
    entries.map((entry) => entry.name)
  );
  for (const [index, entry] of read.entries()) {
    assert.equal(entry.method, 0, "stored, not deflated");
    assert.equal(entry.data.toString("utf8"), String(entries[index].data));
    assert.equal(entry.crc, crc32(Buffer.from(String(entries[index].data))));
  }
});

test("the reader refuses non-zips and truncated zips instead of guessing", () => {
  assert.equal(readZipEntries(Buffer.from("not a zip at all")), null);
  assert.equal(readZipEntries(Buffer.alloc(0)), null);
  const zip = buildStoredZip([{ name: "a.txt", data: "hello" }]);
  assert.equal(readZipEntries(zip.subarray(0, 20)), null, "no central directory, no answer");
});

test("buildMinimalDocx builds the parts a DOCX needs, with XML escaped", () => {
  const docx = buildMinimalDocx(["Ada Lovelace", "", "R&D <lead>", "- built 'things'"]);
  assert.equal(isZipSignature(docx), true);
  const entries = readZipEntries(docx);
  const names = entries.map((entry) => entry.name);
  for (const part of ["[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/styles.xml", "word/document.xml"]) {
    assert.ok(names.includes(part), `${part} is in the package`);
  }
  const document = entries.find((entry) => entry.name === "word/document.xml").data.toString("utf8");
  assert.match(document, /^<\?xml/, "the document part is XML");
  assert.match(document, /Ada Lovelace/);
  assert.match(document, /R&amp;D &lt;lead&gt;/, "ampersands and angle brackets are escaped");
  assert.ok(!document.includes("<lead>"), "no raw tag from user text");
  assert.match(document, /w:pgSz w:w="11906" w:h="16838"/, "A4 page size");
});

test("pdfMediaBox reads Chrome's A4 page box", () => {
  // The shape Chrome writes: an indirect-free /MediaBox with four numbers.
  const pdf = "%PDF-1.7\n1 0 obj << /Type /Page /MediaBox [0 0 595.28 841.89] >> endobj\n";
  assert.deepEqual(pdfMediaBox(pdf), { width: 595.28, height: 841.89 });
  assert.ok(Math.abs(pdfMediaBox(pdf).width - A4_POINTS.width) < 1);
  assert.ok(Math.abs(pdfMediaBox(pdf).height - A4_POINTS.height) < 1);
});

test("pdfMediaBox measures a box that does not start at the origin", () => {
  assert.deepEqual(pdfMediaBox("/MediaBox [10 20 605.28 861.89]"), { width: 595.28, height: 841.89 });
});

test("pdfMediaBox says null rather than guessing", () => {
  assert.equal(pdfMediaBox("%PDF-1.7 with no box"), null);
  assert.equal(pdfMediaBox(""), null);
  assert.equal(pdfMediaBox("not a pdf"), null);
});

test("textNumbers normalises money into comparable figures", () => {
  assert.deepEqual(textNumbers("GBP 95,000 to 115000 and £1,000,000"), ["95000", "115000", "1000000"]);
  assert.deepEqual(textNumbers("cut by 37% across 14 services, 9 minutes"), ["37", "14", "9"]);
  assert.deepEqual(textNumbers("no digits here"), []);
});

test("inventedFacts finds a figure the CV never earned", () => {
  const cv = "Reduced infrastructure cost by 32 percent across 14 services.";
  const result = inventedFacts("I cut infrastructure cost by 37% across 14 services.", { figures: [cv], names: [cv] });
  assert.deepEqual(result.figures, ["37"]);
});

test("inventedFacts allows figures and names the sources carry", () => {
  const cv = "Ada Lovelace led the payments platform migration at Northwind Traders in 2019, cutting deploy time to 9 minutes.";
  const job = "Senior Platform Engineer at Acme Robotics";
  const result = inventedFacts(
    "Ada Lovelace led the payments platform migration at Northwind Traders, cutting deploy time to 9 minutes. Tailored to the Senior Platform Engineer role at Acme Robotics.",
    { figures: [cv], names: [cv, job] }
  );
  assert.deepEqual(result.figures, []);
  assert.deepEqual(result.names, []);
});

test("inventedFacts finds an employer nobody mentioned", () => {
  const cv = "Platform Engineer at Northwind Traders.";
  const result = inventedFacts("I am applying for the role at Initech Systems.", { figures: [cv], names: [cv] });
  assert.deepEqual(result.names, ["Initech Systems"]);
});

test("inventedFacts does not join a word across a line break into a name", () => {
  // `plainText` keeps block boundaries as newlines; without that, "Skills" at the
  // end of one block and "Kubernetes" at the start of the next read as one name.
  const text = plainText("<p>Skills</p><p>Kubernetes and Go</p>");
  assert.ok(text.includes("\n"), "block boundaries survive plainText");
  const result = inventedFacts(text, { figures: ["Kubernetes and Go"], names: ["Kubernetes and Go"] });
  assert.deepEqual(result.names, []);
});

test("inventedFacts trims document words off a real name", () => {
  const cv = "Platform Engineer, Northwind Traders";
  const result = inventedFacts("Experience\nPlatform Engineer, Northwind Traders\nSkills", { figures: [cv], names: [cv] });
  assert.deepEqual(result.names, []);
});

test("plainText strips style and script blocks and keeps the words", () => {
  const html = '<style>p{color:red}</style><h1>Ada Lovelace</h1><p>Built the <b>billing</b> service.</p><script>alert(1)</script>';
  const text = plainText(html);
  assert.ok(text.includes("Ada Lovelace"));
  assert.ok(text.includes("billing"));
  assert.ok(!text.includes("color:red"));
  assert.ok(!text.includes("alert"));
});

test("recoveryCodesFromFile reads canonical codes and nothing else", () => {
  const text = "Applywright recovery codes for ada@example.com\r\n\r\naw-4F7Q-2M9X\r\nAW-ABCD-EFGH\r\nnot-a-code\r\naw-short\r\n";
  assert.deepEqual(recoveryCodesFromFile(text), ["aw-4F7Q-2M9X", "aw-ABCD-EFGH"], "the prefix is normalised, the rest is not");
  assert.deepEqual(recoveryCodesFromFile(""), []);
});

test("the zip the journey writes is a zip the system can open", async () => {
  // Not Chrome and not a judgement call: PowerShell's own zip reader against the
  // bytes this script produces for the DOCX fixture. PowerShell is present on the
  // target host; elsewhere the assertion is skipped rather than faked.
  if (process.platform !== "win32") return;
  const dir = await mkdtemp(join(tmpdir(), "aw-e2e-static-"));
  try {
    const path = join(dir, "fixture.docx");
    await writeFile(path, buildMinimalDocx(["Ada Lovelace", "Summary", "Built the billing service."]));
    const result = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${path}'); $names=$z.Entries.FullName; $z.Dispose(); $names -join ','`],
      { encoding: "utf8", timeout: 60_000 }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /word\/document\.xml/);
    assert.match(result.stdout, /\[Content_Types\]\.xml/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
