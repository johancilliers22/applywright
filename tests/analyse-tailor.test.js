/**
 * HTTP contract, part 3: analysis and tailoring (SPEC sections 2, 3, 6).
 *
 * Score shape comes from the `scoreCv` contract in SPEC section 5; the pack
 * allowance comes from the Free plan row in section 2 (three tailored packs a
 * month). The print route is the observable proof that a pack was stored.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { startServer } from "../server/app.js";

const PASSWORD = "correct horse battery staple";

const JOB_TEXT = [
  "Senior Backend Engineer",
  "",
  "We are hiring a senior backend engineer to own our Node.js payment platform.",
  "You will design REST APIs, work with PostgreSQL and TypeScript, run services on",
  "Kubernetes and AWS, and improve reliability through observability with OpenTelemetry.",
  "You will build CI/CD pipelines, write Jest tests, and use Redis and Kafka for event",
  "driven work. Experience with GraphQL and Terraform is welcome. You will mentor",
  "engineers and lead delivery of payment services. Salary GBP 65000 to 80000.",
].join("\n");

const STRONG_CV = [
  "Grace Hopper",
  "grace.hopper@example.com",
  "+44 7700 900123",
  "London, UK",
  "",
  "Summary",
  "Senior backend engineer with 9 years building Node.js services and PostgreSQL data",
  "platforms. I own reliability, observability and delivery.",
  "",
  "Experience",
  "Staff Platform Engineer, Northwind Systems, 2021-2026",
  "- Built a Node.js payments service handling 4 million requests per day, cutting p99 latency from 850ms to 120ms.",
  "- Led migration of 42 services to PostgreSQL 16 with zero downtime across 3 regions.",
  "- Introduced OpenTelemetry tracing and SLO dashboards, reducing incident mean time to repair by 46%.",
  "- Mentored 6 engineers and ran the hiring loop for backend and platform roles.",
  "",
  "Backend Engineer, Contoso Cloud, 2016-2021",
  "- Designed a TypeScript job scheduler processing 120,000 tasks per hour on Kubernetes.",
  "- Cut AWS spend by 31% by right-sizing 60 ECS services and adding spot capacity.",
  "- Wrote the Node.js REST API contract used by 9 product teams.",
  "",
  "Education",
  "BSc Computer Science, University of Manchester, 2012-2015",
  "",
  "Skills",
  "Node.js, TypeScript, PostgreSQL, SQL, Docker, Kubernetes, AWS, Terraform, REST APIs,",
  "GraphQL, Redis, Kafka, CI/CD, OpenTelemetry, Jest, Git",
].join("\n");

const WEAK_CV = [
  "Curriculum Vitae",
  "",
  "I am a hard working person who enjoys working with computers and helping people.",
  "I have done various jobs over the years and I learn quickly. I get on well with",
  "colleagues and I am reliable and punctual.",
  "",
  "Experience",
  "Various roles in offices and shops. I answered phones, filed paperwork and served",
  "customers.",
  "",
  "Education",
  "School.",
  "",
  "Skills",
  "Computing, communication.",
].join("\n");

let instance;
let base;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-test-tailor-"));
  instance = await startServer({
    dataDir: dir,
    databasePath: join(dir, "test.db"),
    PORT: 0,
    MODEL_API_KEY: "",
    JOB_FEED_CACHE_MINUTES: 0,
    AUTH_RATE_LIMIT_PER_MINUTE: 50,
    RATE_LIMIT_PER_MINUTE: 500,
  });
  base = instance.url;
});

after(async () => {
  await instance?.close();
});

/** A fetch client with its own cookie jar, so two users stay separate. */
function createClient() {
  const jar = new Map();

  return async function call(method, path, body, options = {}) {
    const headers = { ...(options.headers ?? {}) };
    if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    let payload;
    if (body !== undefined) {
      payload = typeof body === "string" ? body : JSON.stringify(body);
      if (!headers["content-type"]) headers["content-type"] = "application/json";
    }
    if (method !== "GET" && method !== "HEAD" && headers.origin === undefined) headers.origin = base;

    const response = await fetch(`${base}${path}`, { method, headers, body: payload, redirect: "manual" });
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

/** Register a throwaway account and store one CV on it. */
async function userWithCv(email, cvText) {
  const call = createClient();
  const registered = await call("POST", "/api/auth/register", { email, password: PASSWORD, name: "Test User" });
  assert.equal(registered.status, 201);
  const created = await call("POST", "/api/cvs", { text: cvText });
  assert.equal(created.status, 201);
  return { call, cvId: created.json.cv.id };
}

const isPoint = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

test("analyse returns a 0-100 score, five subscores and explained findings", async () => {
  const { call, cvId } = await userWithCv("analyse@example.com", STRONG_CV);

  const analysed = await call("POST", "/api/analyse", { cvId, jobText: JOB_TEXT });
  assert.equal(analysed.status, 200);

  const report = analysed.json.report;
  assert.ok(isPoint(report.score), `score must be 0-100, got ${report.score}`);
  assert.equal(Number.isInteger(report.score), true);

  // SPEC section 5 fixes the five subscores by name.
  assert.deepEqual(Object.keys(report.subscores).sort(), [
    "achievements",
    "formatting",
    "keywords",
    "readability",
    "structure",
  ]);
  for (const [name, value] of Object.entries(report.subscores)) {
    assert.ok(isPoint(value), `subscore ${name} must be 0-100, got ${value}`);
  }

  assert.ok(Array.isArray(report.keywordCoverage.matched));
  assert.ok(Array.isArray(report.keywordCoverage.missing));
  // SPEC section 4 defines pct() as a rounded 0-100 figure, and the keywords
  // subscore above is that ratio, so the ratio is a percentage, not a fraction.
  const keywordTotal = report.keywordCoverage.matched.length + report.keywordCoverage.missing.length;
  const expectedRatio = keywordTotal === 0 ? 0 : Math.round((report.keywordCoverage.matched.length / keywordTotal) * 100);
  assert.equal(report.keywordCoverage.ratio, expectedRatio);
  assert.ok(report.keywordCoverage.ratio >= 0 && report.keywordCoverage.ratio <= 100);

  assert.ok(Array.isArray(report.findings));
  assert.ok(report.findings.length > 0, "a scored CV is explained by at least one finding");
  for (const finding of report.findings) {
    assert.equal(typeof finding.id, "string");
    assert.ok(["high", "medium", "low"].includes(finding.severity), `severity was ${finding.severity}`);
    assert.ok(finding.title.length > 0);
    assert.ok(finding.detail.length > 0);
    assert.ok(finding.fix.length > 0);
  }
  assert.ok(Array.isArray(report.advice));
  assert.ok(report.advice.every((line) => typeof line === "string"));

  // SPEC section 6: the report is kept and listable.
  const listed = await call("GET", "/api/reports");
  assert.equal(listed.status, 200);
  assert.ok(listed.json.reports.some((entry) => entry.id === report.id));
});

test("a weak CV scores lower than a strong CV against the same job", async () => {
  const strong = await userWithCv("score-strong@example.com", STRONG_CV);
  const weak = await userWithCv("score-weak@example.com", WEAK_CV);

  const strongReport = await strong.call("POST", "/api/analyse", { cvId: strong.cvId, jobText: JOB_TEXT });
  const weakReport = await weak.call("POST", "/api/analyse", { cvId: weak.cvId, jobText: JOB_TEXT });

  assert.equal(strongReport.status, 200);
  assert.equal(weakReport.status, 200);
  assert.ok(isPoint(strongReport.json.report.score));
  assert.ok(isPoint(weakReport.json.report.score));
  assert.ok(
    strongReport.json.report.score > weakReport.json.report.score,
    `strong CV scored ${strongReport.json.report.score}, weak CV scored ${weakReport.json.report.score}`
  );
});

test("analyse needs a job to compare against", async () => {
  const { call, cvId } = await userWithCv("analyse-nojob@example.com", STRONG_CV);

  const response = await call("POST", "/api/analyse", { cvId });
  assert.equal(response.status, 400);
  assert.equal(typeof response.json.error.code, "string");
});

test("tailor stores an application with its pack, records usage and serves the print view", async () => {
  const { call, cvId } = await userWithCv("tailor@example.com", STRONG_CV);

  const tailored = await call("POST", "/api/tailor", {
    cvId,
    jobText: JOB_TEXT,
    title: "Senior Backend Engineer",
    company: "Acme Ltd",
    url: "https://acme.example.com/jobs/42",
  });
  assert.equal(tailored.status, 201);

  const application = tailored.json.application;
  assert.equal(typeof application.id, "string");
  assert.equal(application.title, "Senior Backend Engineer");
  assert.equal(application.company, "Acme Ltd");
  assert.equal(application.status, "pack_ready");
  assert.ok(isPoint(application.score));

  const listed = await call("GET", "/api/applications");
  assert.equal(listed.status, 200);
  assert.ok(
    listed.json.applications.some((entry) => entry.id === application.id),
    "the tailored application appears in the queue"
  );

  // SPEC section 2: the free plan allows three tailored packs a month, so one
  // pack must have been counted. SPEC section 6 fixes only that `usage` is
  // reported; the pack counter is the field that proves it.
  const me = await call("GET", "/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.json.usage.packsThisMonth, 1);

  // SPEC section 6: the pack is served as a print-ready HTML document.
  const print = await call("GET", `/api/applications/${application.id}/cv`);
  assert.equal(print.status, 200);
  assert.match(print.headers.get("content-type") ?? "", /^text\/html/);
  assert.match(print.text, /<html/i);
  assert.ok(print.text.includes("Grace Hopper"), "the print pack carries the candidate name");
});

test("the fourth tailored pack on the free plan is refused with 402 quota_exceeded", async () => {
  const { call, cvId } = await userWithCv("tailor-quota@example.com", STRONG_CV);

  for (let index = 1; index <= 3; index += 1) {
    const allowed = await call("POST", "/api/tailor", { cvId, jobText: JOB_TEXT, title: `Role ${index}` });
    assert.equal(allowed.status, 201, `pack ${index} of the three free packs was refused`);
  }

  const fourth = await call("POST", "/api/tailor", { cvId, jobText: JOB_TEXT, title: "Role 4" });
  assert.equal(fourth.status, 402);
  assert.equal(fourth.json.error.code, "quota_exceeded");
});

test("another user cannot read an application's print pack", async () => {
  const owner = await userWithCv("pack-owner@example.com", STRONG_CV);
  const stranger = await userWithCv("pack-stranger@example.com", STRONG_CV);

  const tailored = await owner.call("POST", "/api/tailor", { cvId: owner.cvId, jobText: JOB_TEXT, title: "Senior Backend Engineer" });
  assert.equal(tailored.status, 201);

  const stolen = await stranger.call("GET", `/api/applications/${tailored.json.application.id}/cv`);
  assert.equal(stolen.status, 404);
});
