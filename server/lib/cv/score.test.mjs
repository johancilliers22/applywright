import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { extractKeywords, keywordCoverage } from "../text.js";
import { WEIGHTS, scoreCv } from "./score.js";

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const STRONG_CV = `Ada Whitfield
Leeds, United Kingdom | ada.whitfield@example.com | 07700 900412 | linkedin.com/in/adawhitfield

PROFESSIONAL SUMMARY
Backend engineer with 9 years building Go services and Kubernetes platforms for payments and logistics. I have led migrations from virtual machines to Kubernetes, cut p99 latency by 38% and reduced cloud spend by £240,000 a year.

WORK EXPERIENCE

Senior Backend Engineer, Northgate Payments, Leeds - March 2021 to present
- Led the migration of 14 payment services from virtual machines to Kubernetes, cutting deploy time from 45 minutes to 6.
- Cut p99 checkout latency from 820 ms to 505 ms (38%) by adding Redis caching and rewriting the PostgreSQL query path.
- Reduced cloud spend by £240,000 a year by right-sizing 60 workloads and moving batch jobs to spot instances.
- Built an observability stack on Prometheus and Grafana with 24 alerts, cutting mean time to detect from 22 minutes to 4.
- Mentored 4 engineers; 2 were promoted within 18 months.

Backend Engineer, Latch Logistics, Manchester - July 2017 to February 2021
- Wrote 9 Go services for route planning, handling 1.4 million requests a day at p99 of 120 ms.
- Introduced Terraform for 100% of infrastructure, removing 3 days of manual setup per environment.
- Automated regression tests in GitHub Actions, raising coverage from 41% to 86% across 23 services.
- Ran Docker builds for 31 services and moved the CI/CD pipeline to trunk-based delivery in 6 weeks.

EDUCATION
BSc (Hons) Computer Science, University of Sheffield, 2013 - 2016

SKILLS
Go, Kubernetes, PostgreSQL, Terraform, Docker, Prometheus, Grafana, Redis, AWS, Linux, gRPC, CI/CD
`;

const SPECIALIST_JOB = `Senior Backend Engineer

We are hiring a senior backend engineer to own our Kubernetes platform and payment services.

You will write Go services, design gRPC interfaces and keep our PostgreSQL layer fast. You will own Terraform for all infrastructure, run Docker and CI/CD on Linux, and build observability with Prometheus and Grafana. Experience with Redis caching and AWS is expected. You will reduce latency and cloud spend, and mentor engineers on distributed systems and Kubernetes. Terraform, Kubernetes, Go, PostgreSQL, Prometheus and Grafana are used daily.
`;

const WEAK_CV = `I am a hard working professional with experience in many areas of business. I have worked in several companies and I am looking for a new role where I can use my skills. I am a team player and I learn quickly. I enjoy working with people and I am good at solving problems. My previous employers would describe me as reliable and organised. I would like to work for a company that values its staff and offers training.
I have used computers and I am comfortable learning new software. I have helped customers and I have worked in a team. I am looking for an opportunity to grow and to contribute.
`;

/** Well structured, but every layout risk in the book. */
const RISKY_CV = `Jordan Blake
jordan.blake@example.com | 07700 900777

EXPERIENCE
Senior Analyst, Vantage Group, 2019 - 2023
- Spent the year working across three teams on a reporting programme that touched every part of the finance function, including the monthly close, the quarterly forecast, the annual budget cycle and the board pack, coordinating with six stakeholders in three countries, migrating the old spreadsheet model into the new warehouse, documenting the assumptions for the audit committee and training four analysts on the replacement process so that the team could run it without me.
Role | 2019 | 2023
Team | 6 | 2
RESPONSIBLE FOR MANAGING THE TEAM BUDGET AND THE QUARTERLY REPORTING PACKAGE

The reporting programme was the largest piece of work in the finance function that year and it touched every part of the monthly close process, the quarterly forecast, the annual budget cycle, the board pack, the audit committee papers, the treasury reconciliation, the expense review, the headcount plan, the capital request list and the supplier register. It also involved six stakeholders in three countries, four analysts who needed training, an old spreadsheet model that had to be migrated into the new warehouse, a set of assumptions that had to be documented for the audit committee, and a replacement process that had to run without me afterwards. The work took eleven months and it changed how the team reported every month after that.
`;

/** Structure and contact, but no dates anywhere in the experience section. */
const UNDATED_CV = `Sam Okafor
sam.okafor@example.com | 07700 900321 | linkedin.com/in/samokafor

SUMMARY
Operations manager with eight years in fulfilment, running three sites and a team of forty people across two shifts.

EXPERIENCE
Operations Manager, Meridian Fulfilment, Bristol
- Ran three sites with 40 staff, cutting pick errors from 2.1% to 0.6% in nine months.
- Moved the night shift onto a new rota, saving 240 hours of overtime a quarter.
- Introduced barcode scanning at goods-in, reducing mis-picks on intake by 31%.

EDUCATION
BA Business Management, University of the West of England

SKILLS
Warehouse management, rota planning, health and safety, stock control, SAP
`;

/** Strong CV with the contact block removed, for the profile fallback test. */
const NO_CONTACT_CV = STRONG_CV.replace(
  "Leeds, United Kingdom | ada.whitfield@example.com | 07700 900412 | linkedin.com/in/adawhitfield\n",
  "Leeds, United Kingdom\n"
);

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const ids = (report) => report.findings.map((finding) => finding.id);
const finding = (report, id) => report.findings.find((row) => row.id === id);

function weightedScore(subscores) {
  const total = Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const sum = Object.entries(WEIGHTS).reduce((acc, [key, weight]) => acc + subscores[key] * weight, 0);
  return Math.round(sum / total);
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

test("a strong CV against a matching job scores 80 or more", () => {
  const report = scoreCv({ cvText: STRONG_CV, jobText: SPECIALIST_JOB });
  assert.ok(report.score >= 80, `expected 80+, got ${report.score}`);
  assert.ok(report.score <= 100);
  assert.ok(report.keywordCoverage.ratio >= 70, `coverage was ${report.keywordCoverage.ratio}`);
});

test("every section of the strong CV scores well", () => {
  const report = scoreCv({ cvText: STRONG_CV, jobText: SPECIALIST_JOB });
  for (const [section, value] of Object.entries(report.subscores)) {
    assert.ok(value >= 70, `${section} scored ${value}`);
  }
});

test("a weak generic CV against a specialist job scores low", () => {
  const strong = scoreCv({ cvText: STRONG_CV, jobText: SPECIALIST_JOB });
  const weak = scoreCv({ cvText: WEAK_CV, jobText: SPECIALIST_JOB });
  assert.ok(weak.score <= 40, `expected 40 or less, got ${weak.score}`);
  assert.ok(strong.score - weak.score >= 30, `strong ${strong.score} vs weak ${weak.score}`);
  assert.ok(weak.subscores.keywords < strong.subscores.keywords);
  assert.ok(weak.subscores.structure < strong.subscores.structure);
});

test("empty job text degrades gracefully instead of collapsing", () => {
  const report = scoreCv({ cvText: STRONG_CV, jobText: "" });
  assert.deepEqual(report.keywordCoverage, { matched: [], missing: [], ratio: 0 });
  assert.ok(Number.isInteger(report.score));
  assert.ok(report.score >= 70, `a strong CV without a job should still score well, got ${report.score}`);
  assert.ok(report.score <= 100);
  assert.ok(ids(report).includes("no-job-description"));
  assert.ok(finding(report, "no-job-description").detail.includes("35"));
  // The published weights still explain the total.
  assert.equal(report.score, weightedScore(report.subscores));
});

test("keyword coverage maths is exact", () => {
  const everything = scoreCv({ cvText: "Kubernetes Terraform Linux", jobText: "Kubernetes Terraform Linux" });
  assert.equal(everything.keywordCoverage.ratio, 100);
  assert.equal(everything.subscores.keywords, 100);
  assert.equal(everything.keywordCoverage.missing.length, 0);
  assert.ok(everything.keywordCoverage.matched.length >= 3);

  const partial = scoreCv({ cvText: "Kubernetes", jobText: "Kubernetes Terraform Linux" });
  const total = extractKeywords("Kubernetes Terraform Linux", { limit: 25 }).length;
  assert.equal(partial.keywordCoverage.matched.length + partial.keywordCoverage.missing.length, total);
  assert.equal(partial.keywordCoverage.matched.length, 1);
  assert.equal(partial.keywordCoverage.missing.length, total - 1);
  assert.equal(partial.keywordCoverage.ratio, Math.round((1 / total) * 100));
  assert.equal(partial.subscores.keywords, partial.keywordCoverage.ratio);
});

test("the total is the weighted average of the five published subscores", () => {
  for (const report of [
    scoreCv({ cvText: STRONG_CV, jobText: SPECIALIST_JOB }),
    scoreCv({ cvText: WEAK_CV, jobText: SPECIALIST_JOB }),
    scoreCv({ cvText: STRONG_CV, jobText: "" }),
    scoreCv({}),
  ]) {
    assert.deepEqual(Object.keys(report.subscores), ["keywords", "structure", "achievements", "readability", "formatting"]);
    for (const value of Object.values(report.subscores)) {
      assert.ok(Number.isInteger(value) && value >= 0 && value <= 100, `bad subscore ${value}`);
    }
    assert.equal(report.score, weightedScore(report.subscores));
    assert.ok(report.score >= 0 && report.score <= 100);
  }
});

test("findings are well formed and specific", () => {
  for (const report of [
    scoreCv({ cvText: STRONG_CV, jobText: SPECIALIST_JOB }),
    scoreCv({ cvText: WEAK_CV, jobText: SPECIALIST_JOB }),
    scoreCv({ cvText: RISKY_CV, jobText: SPECIALIST_JOB }),
  ]) {
    assert.ok(report.findings.length > 0);
    const seen = new Set();
    for (const row of report.findings) {
      assert.match(row.id, /^[a-z0-9-]+$/, `bad id ${row.id}`);
      assert.ok(!seen.has(row.id), `duplicate id ${row.id}`);
      seen.add(row.id);
      assert.ok(["high", "medium", "low"].includes(row.severity), `bad severity on ${row.id}`);
      assert.ok(row.title.length >= 10, `short title on ${row.id}`);
      assert.ok(/\d/.test(row.detail), `detail on ${row.id} quotes no number: ${row.detail}`);
      assert.ok(row.fix.length >= 40, `fix on ${row.id} is too thin: ${row.fix}`);
      assert.ok(!/!/.test(row.title + row.detail + row.fix), `exclamation mark on ${row.id}`);
    }
  }
});

test("a weak CV produces non-empty findings that quote real numbers", () => {
  const report = scoreCv({ cvText: WEAK_CV, jobText: SPECIALIST_JOB });
  assert.ok(report.findings.length >= 4);
  assert.ok(report.findings.some((row) => row.severity === "high"));
  assert.ok(ids(report).includes("keywords-low"));
  assert.ok(ids(report).includes("structure-no-headings"));
  assert.ok(ids(report).includes("structure-no-contact"));
  const keywords = finding(report, "keywords-low");
  assert.match(keywords.title, /^\D*\d+ of \d+ job keywords/);
  assert.ok(keywords.detail.includes(`${report.keywordCoverage.ratio}%`));
  assert.ok(report.advice.length >= 1);
});

test("layout risks are detected from the plain text", () => {
  const report = scoreCv({ cvText: RISKY_CV, jobText: SPECIALIST_JOB });
  assert.ok(ids(report).includes("formatting-long-paragraph"));
  assert.ok(ids(report).includes("formatting-long-bullet"));
  assert.ok(ids(report).includes("formatting-all-caps"));
  assert.ok(ids(report).includes("formatting-tables-columns"));

  const paragraph = finding(report, "formatting-long-paragraph");
  assert.match(paragraph.detail, /Line \d+/);
  const words = Number(paragraph.detail.match(/run of (\d+) words/)[1]);
  assert.ok(words > 120, `paragraph counted ${words} words`);

  const bullet = finding(report, "formatting-long-bullet");
  const bulletWords = Number(bullet.title.match(/(\d+)-word bullet/)[1]);
  assert.ok(bulletWords > 45, `bullet counted ${bulletWords} words`);

  const table = finding(report, "formatting-tables-columns");
  assert.equal(table.severity, "high");
  assert.ok(!ids(report).includes("formatting-sound"));
  assert.ok(report.subscores.formatting < 70);
});

test("missing dates and missing contact are flagged with evidence", () => {
  const report = scoreCv({ cvText: UNDATED_CV, jobText: SPECIALIST_JOB });
  assert.ok(ids(report).includes("structure-undated-experience"));
  const dates = finding(report, "structure-undated-experience");
  assert.match(dates.detail, /0 of \d+ experience lines/);
  assert.equal(dates.severity, "high");

  const noContact = scoreCv({ cvText: NO_CONTACT_CV, jobText: SPECIALIST_JOB });
  assert.ok(ids(noContact).includes("structure-no-contact"));
  assert.ok(noContact.subscores.structure < scoreCv({ cvText: STRONG_CV, jobText: SPECIALIST_JOB }).subscores.structure);
});

test("contact details supplied by the profile suppress the missing-contact finding", () => {
  const report = scoreCv({
    cvText: NO_CONTACT_CV,
    jobText: SPECIALIST_JOB,
    profile: { contact: { email: "ada@example.com", phone: "07700 900412", links: ["linkedin.com/in/ada"] } },
  });
  assert.ok(!ids(report).includes("structure-no-contact"));
});

test("missing input is handled without throwing", () => {
  for (const input of [undefined, {}, { cvText: null, jobText: null }, { cvText: "", jobText: "" }, { cvText: 42 }]) {
    const report = scoreCv(input);
    assert.equal(typeof report.score, "number");
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.equal(typeof report.subscores.keywords, "number");
    assert.ok(Array.isArray(report.findings) && report.findings.length > 0);
    assert.ok(Array.isArray(report.advice) && report.advice.length > 0);
    assert.deepEqual(report.keywordCoverage.matched, []);
    assert.deepEqual(report.keywordCoverage.missing, []);
  }
  const empty = scoreCv({ cvText: "", jobText: SPECIALIST_JOB });
  assert.ok(empty.score <= 10, `an empty CV scored ${empty.score}`);
  assert.ok(ids(empty).includes("cv-too-short"));
  assert.ok(!ids(empty).includes("formatting-long-paragraph"));
});

test("scoring is deterministic", () => {
  const first = scoreCv({ cvText: STRONG_CV, jobText: SPECIALIST_JOB });
  const second = scoreCv({ cvText: STRONG_CV, jobText: SPECIALIST_JOB });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("a strong CV against a different job scores lower on keywords alone", () => {
  const matched = scoreCv({ cvText: STRONG_CV, jobText: SPECIALIST_JOB });
  const other = scoreCv({
    cvText: STRONG_CV,
    jobText: "Registered Veterinary Nurse. Small animal practice, anaesthesia monitoring, radiography, client care and dispensing. RCVS registration required.",
  });
  assert.ok(other.subscores.keywords < matched.subscores.keywords);
  assert.equal(other.subscores.structure, matched.subscores.structure);
  assert.equal(other.subscores.formatting, matched.subscores.formatting);
});

test("advice is specific, unique and free of exclamation marks", () => {
  for (const report of [
    scoreCv({ cvText: WEAK_CV, jobText: SPECIALIST_JOB }),
    scoreCv({ cvText: RISKY_CV, jobText: SPECIALIST_JOB }),
    scoreCv({ cvText: STRONG_CV, jobText: SPECIALIST_JOB }),
    scoreCv({}),
  ]) {
    assert.ok(report.advice.length >= 1 && report.advice.length <= 6);
    assert.equal(new Set(report.advice).size, report.advice.length);
    for (const line of report.advice) {
      assert.ok(line.length >= 40, `advice too thin: ${line}`);
      assert.ok(!line.includes("!"), `exclamation mark in advice: ${line}`);
    }
  }
});

test("the scorer reads no clock, no randomness and no dependency but the shared text layer", () => {
  const source = readFileSync(new URL("./score.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bDate\.now\b/);
  assert.doesNotMatch(source, /\bnew Date\b/);
  assert.doesNotMatch(source, /Math\.random/);
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(imports, ["../text.js"]);
});

test("the shared weights match the spec", () => {
  assert.deepEqual(WEIGHTS, { keywords: 35, structure: 20, achievements: 20, readability: 15, formatting: 10 });
  assert.equal(Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0), 100);
});
