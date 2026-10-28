/**
 * HTTP contract, part 4: user-initiated job capture (SPEC sections 3, 5, 6).
 *
 * No network: the capture route is fed an inline schema.org JobPosting JSON-LD
 * fixture, and the feed route (GET /api/jobs) is never called because it fetches
 * live job boards.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { startServer } from "../server/app.js";

const PASSWORD = "correct horse battery staple";
const POSTING_URL = "https://boards.greenhouse.io/acme/jobs/1234567";

const JOB_POSTING = {
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  title: "Senior Backend Engineer",
  description:
    "<p>We are hiring a senior backend engineer to own our Node.js payment platform.</p><ul><li>PostgreSQL</li><li>Kubernetes</li><li>TypeScript</li></ul>",
  datePosted: "2026-10-20",
  employmentType: "FULL_TIME",
  hiringOrganization: { "@type": "Organization", name: "Acme Ltd" },
  jobLocation: {
    "@type": "Place",
    address: { "@type": "PostalAddress", addressLocality: "London", addressCountry: "GB" },
  },
  baseSalary: {
    "@type": "MonetaryAmount",
    currency: "GBP",
    value: { "@type": "QuantitativeValue", minValue: 65000, maxValue: 80000, unitText: "YEAR" },
  },
};

const FIXTURE_HTML = `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8">
    <title>Senior Backend Engineer - Acme Ltd</title>
    <script type="application/ld+json">${JSON.stringify(JOB_POSTING)}</script>
  </head>
  <body>
    <h1>Senior Backend Engineer</h1>
  </body>
</html>`;

let instance;
let base;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-test-jobs-"));
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

async function signedIn(email) {
  const call = createClient();
  const response = await call("POST", "/api/auth/register", { email, password: PASSWORD, name: "Test User" });
  assert.equal(response.status, 201);
  return call;
}

/**
 * The outbound Job shape is camelCase, as established by GET /api/jobs. Storage
 * columns and internal keys (dedupe_hash, tags_json, fetched_at) must not leak.
 */
const INTERNAL_JOB_KEYS = ["salary_min", "salary_max", "posted_at", "dedupe_hash", "tags_json", "fetched_at"];

test("capturing a JSON-LD posting records title, company and salary", async () => {
  const call = await signedIn("capture@example.com");

  const captured = await call("POST", "/api/jobs/capture", { url: POSTING_URL, html: FIXTURE_HTML });
  assert.equal(captured.status, 201);

  const job = captured.json.job;
  assert.equal(typeof job.id, "string");
  assert.equal(job.title, "Senior Backend Engineer");
  assert.equal(job.company, "Acme Ltd");
  assert.match(job.location, /London/);
  assert.equal(job.url, POSTING_URL);
  assert.equal(job.source, "greenhouse", "the recognised board is recorded as the source");

  assert.equal(job.salaryMin, 65000);
  assert.equal(job.salaryMax, 80000);
  assert.equal(job.currency, "GBP");
  assert.equal(job.postedAt, "2026-10-20");
  for (const internal of INTERNAL_JOB_KEYS) {
    assert.equal(Object.hasOwn(job, internal), false, `${internal} must not reach a client`);
  }

  assert.ok(String(captured.json.supported).includes("greenhouse"), "the host is reported as supported");
  assert.equal(typeof captured.json.confidence, "number");
  assert.ok(captured.json.confidence >= 0 && captured.json.confidence <= 1);
  assert.ok(Array.isArray(captured.json.warnings));
});

test("garbage capture is refused with 422", async () => {
  const call = await signedIn("capture-garbage@example.com");

  const response = await call("POST", "/api/jobs/capture", { url: POSTING_URL, text: "hello there" });
  assert.equal(response.status, 422);
  assert.equal(typeof response.json.error.code, "string");
  assert.equal(typeof response.json.error.message, "string");
});

test("a non-http url is refused with 400", async () => {
  const call = await signedIn("capture-badurl@example.com");

  for (const url of ["ftp://example.com/job", "javascript:alert(1)", "example.com/job"]) {
    const response = await call("POST", "/api/jobs/capture", { url, text: "Senior Backend Engineer at Acme" });
    assert.equal(response.status, 400, `${url} should be refused`);
    assert.equal(typeof response.json.error.code, "string");
  }
});

test("a captured job can be read by id and unknown ids are 404", async () => {
  const call = await signedIn("capture-read@example.com");
  const captured = await call("POST", "/api/jobs/capture", { url: POSTING_URL, html: FIXTURE_HTML });
  assert.equal(captured.status, 201);

  const fetched = await call("GET", `/api/jobs/${captured.json.job.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.json.job.id, captured.json.job.id);
  assert.equal(fetched.json.job.title, "Senior Backend Engineer");

  const missing = await call("GET", "/api/jobs/j_does_not_exist");
  assert.equal(missing.status, 404);
  assert.equal(typeof missing.json.error.code, "string");
});

test("the captured job is a shared cache, readable by another account", async () => {
  const first = await signedIn("capture-shared-a@example.com");
  const second = await signedIn("capture-shared-b@example.com");

  const captured = await first("POST", "/api/jobs/capture", { url: POSTING_URL, html: FIXTURE_HTML });
  assert.equal(captured.status, 201);

  const fetched = await second("GET", `/api/jobs/${captured.json.job.id}`);
  assert.equal(fetched.status, 200, "SPEC section 3: jobs is a shared cache, not per-user");
  assert.equal(fetched.json.job.title, "Senior Backend Engineer");
});

test("capture accepts a pasted posting's text without the page HTML", async () => {
  const call = await signedIn("capture-text@example.com");
  const pasted = [
    "Senior Backend Engineer",
    "Acme Ltd",
    "London, UK (hybrid)",
    "",
    "We are hiring a senior backend engineer to own our Node.js payment platform. You will",
    "design REST APIs, work with PostgreSQL and TypeScript, run services on Kubernetes and",
    "AWS. Salary GBP 65000 to 80000 depending on experience. This is a permanent role with",
    "hybrid working from our London office.",
  ].join("\n");

  // SPEC section 6 documents `{ url, html?, text? }` as independently optional, and
  // section 5 gives the capture module the job of extracting title, company,
  // location and salary from that input. Text-only capture must therefore work.
  const captured = await call("POST", "/api/jobs/capture", { url: "https://acme.example.com/careers/42", text: pasted });
  assert.equal(captured.status, 201);
  assert.equal(captured.json.job.title, "Senior Backend Engineer");
  assert.equal(captured.json.job.company, "Acme Ltd");
  assert.match(captured.json.job.location ?? "", /London/);
  // "GBP 65000" is a stated salary; the HTML path parses the same currency code.
  assert.equal(captured.json.job.salaryMin, 65000);
  assert.equal(captured.json.job.salaryMax, 80000);
  assert.equal(captured.json.job.currency, "GBP");
});
