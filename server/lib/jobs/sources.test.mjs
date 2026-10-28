/**
 * Offline tests for the job sources. Fixtures mirror the live payloads probed on
 * 2026-10-28: Arbeitnow `{data:[…]}`, Remotive `{jobs:[…]}` and Remote OK's bare
 * array whose first element is a legal notice. No network, no clock: every
 * timestamp in this file is written into the fixture.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { STOPWORDS, sha256 } from "../text.js";
import {
  SOURCES,
  fetchJobs,
  normalizeArbeitnow,
  normalizeRemotive,
  normalizeRemoteok,
} from "./sources.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// 2026-01-01T00:00:00Z. Chosen so the assertion is readable and host-independent.
const EPOCH_2026 = 1_767_225_600;

function arbeitnowPayload(data) {
  return { data, links: { next: null }, meta: { current_page: 1 } };
}

function arbeitnowRow(overrides = {}) {
  return {
    slug: "team-lead-seo-geo-berlin-85222",
    company_name: "HelloFresh",
    title: "Team Lead, SEO & GEO",
    description:
      "&lt;h2&gt;&lt;strong&gt;The role&lt;/strong&gt;&lt;/h2&gt;\n&lt;p&gt;Lead the Organic Discovery team across markets.&lt;/p&gt;",
    remote: false,
    url: "https://www.arbeitnow.com/jobs/companies/hellofresh/team-lead-seo-geo-berlin-85222",
    tags: ["Marketing"],
    job_types: ["full_time"],
    location: "Berlin, Berlin",
    created_at: EPOCH_2026,
    ...overrides,
  };
}

function remotivePayload(jobs) {
  return {
    "00-warning": "Remotive main domain moved to remotive.com",
    "0-legal-notice": "Legal warning - please link back to the URL found on Remotive.",
    "job-count": jobs.length,
    "total-job-count": jobs.length,
    jobs,
  };
}

function remotiveRow(overrides = {}) {
  return {
    id: 2091161,
    url: "https://remotive.com/remote-jobs/artificial-intelligence/ai-trainer-2091161",
    title: "AI Trainer - Video Annotation",
    company_name: "iMerit Technology",
    category: "Artificial Intelligence",
    tags: ["video", "AI/ML"],
    job_type: "freelance",
    publication_date: "2026-10-22T18:40:19",
    candidate_required_location: "Worldwide",
    salary: "70K-80K",
    description: "<p>Annotate video for model training.</p>",
    ...overrides,
  };
}

const REMOTEOK_LEGAL = {
  last_updated: 1_793_001_612,
  legal:
    "API Terms of Service: Please link back (with follow) to the URL on Remote OK and mention Remote OK as a source.",
};

function remoteokRow(overrides = {}) {
  return {
    slug: "remote-account-executive-huzzle-1137573",
    id: "1137573",
    epoch: 1_793_001_612,
    date: "2026-10-26T08:00:12+00:00",
    company: "Huzzle",
    company_logo: "",
    position: "Account Executive",
    tags: ["saas", "sales", "digital nomad"],
    description: "About Huzzle<p>We place people in client teams.</p>",
    location: "",
    apply_url: "https://remoteOK.com/remote-jobs/remote-account-executive-huzzle-1137573",
    salary_min: 0,
    salary_max: 0,
    logo: "",
    url: "https://remoteOK.com/remote-jobs/remote-account-executive-huzzle-1137573",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fetch doubles
// ---------------------------------------------------------------------------

function jsonResponse(body, init = {}) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    statusText: init.statusText ?? "OK",
    json: async () => body,
  };
}

const SOURCE_URL = {
  arbeitnow: SOURCES.arbeitnow.requestUrl(),
  remotive: SOURCES.remotive.requestUrl(),
  remoteok: SOURCES.remoteok.requestUrl(),
};

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, options });
    const route = routes[url];
    if (route === undefined) throw new Error(`unexpected request to ${url}`);
    return typeof route === "function" ? route() : jsonResponse(route);
  };
  return { impl, calls };
}

function defaultRoutes(overrides = {}) {
  return {
    [SOURCE_URL.arbeitnow]: arbeitnowPayload([arbeitnowRow()]),
    [SOURCE_URL.remotive]: remotivePayload([remotiveRow()]),
    [SOURCE_URL.remoteok]: [REMOTEOK_LEGAL, remoteokRow()],
    ...overrides,
  };
}

/** Fail loudly if anything in this module reaches for the real network. */
async function withNoGlobalFetch(run) {
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("the tests must not touch the network");
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

test("SOURCES exposes the three boards with the documented endpoints", () => {
  assert.deepEqual(Object.keys(SOURCES), ["arbeitnow", "remotive", "remoteok"]);
  assert.equal(SOURCES.arbeitnow.url, "https://www.arbeitnow.com/api/job-board-api");
  assert.equal(SOURCES.remotive.url, "https://remotive.com/api/remote-jobs?limit=50");
  assert.equal(SOURCES.remoteok.url, "https://remoteok.com/api");
  for (const entry of Object.values(SOURCES)) {
    assert.equal(typeof entry.normalize, "function", `${entry.id} needs a normaliser`);
    assert.equal(typeof entry.requestUrl, "function", `${entry.id} needs a request URL`);
    assert.equal(typeof entry.expect, "function", `${entry.id} needs a shape check`);
    assert.ok(entry.attribution.length > 0, `${entry.id} needs an attribution line`);
  }
  assert.equal(SOURCES.remotive.normalize, normalizeRemotive);
  assert.equal(SOURCES.remoteok.normalize, normalizeRemoteok);
  assert.equal(SOURCES.arbeitnow.normalize, normalizeArbeitnow);
});

// ---------------------------------------------------------------------------
// Arbeitnow
// ---------------------------------------------------------------------------

test("normalizeArbeitnow maps a live payload row to the Job shape", () => {
  const [job] = normalizeArbeitnow(arbeitnowPayload([arbeitnowRow()]));

  assert.equal(job.source, "arbeitnow");
  assert.equal(job.external_id, "team-lead-seo-geo-berlin-85222");
  assert.equal(job.title, "Team Lead, SEO & GEO");
  assert.equal(job.company, "HelloFresh");
  assert.equal(job.location, "Berlin, Berlin");
  assert.equal(job.remote, 0);
  assert.equal(job.salary_min, null);
  assert.equal(job.salary_max, null);
  assert.equal(job.currency, null);
  assert.equal(job.posted_at, "2026-01-01T00:00:00.000Z");
  assert.equal(job.url, "https://www.arbeitnow.com/jobs/companies/hellofresh/team-lead-seo-geo-berlin-85222");
  assert.deepEqual(JSON.parse(job.tags_json), ["full_time", "marketing"]);
  assert.deepEqual(job.tags, ["full_time", "marketing"], "the array mirrors tags_json for the store");
  assert.equal(job.dedupe_hash, sha256("hellofresh|team lead, seo & geo|berlin, berlin"));
  assert.deepEqual(Object.keys(job).sort(), [
    "company",
    "currency",
    "dedupe_hash",
    "description",
    "external_id",
    "location",
    "posted_at",
    "remote",
    "salary_max",
    "salary_min",
    "source",
    "tags",
    "tags_json",
    "title",
    "url",
  ]);
});

test("normalizeArbeitnow turns escaped HTML into plain description text", () => {
  const [job] = normalizeArbeitnow(
    arbeitnowPayload([
      arbeitnowRow({
        description: "&lt;p&gt;Join SEO &amp;amp; GEO.&lt;/p&gt;\n&lt;ul&gt;&lt;li&gt;Own strategy&lt;/li&gt;&lt;/ul&gt;",
      }),
    ])
  );

  assert.ok(job.description.includes("Join SEO & GEO."), job.description);
  assert.ok(job.description.includes("Own strategy"));
  assert.ok(!job.description.includes("<"), "no tags survive");
  assert.ok(!job.description.includes("&amp;"), "no entities survive");
  assert.ok(!job.description.includes("\n\n\n"), "blank runs are collapsed");
});

test("normalizeArbeitnow reads the board's remote flag rather than the text", () => {
  const jobs = normalizeArbeitnow(
    arbeitnowPayload([
      arbeitnowRow({ slug: "a", title: "Onsite role", location: "Remote, OR", remote: false }),
      arbeitnowRow({ slug: "b", title: "Home role", location: "Berlin, Berlin", remote: true }),
    ])
  );
  assert.deepEqual(jobs.map((job) => job.remote), [0, 1]);
});

test("normalizeArbeitnow skips rows without a title and survives a broken payload", () => {
  assert.deepEqual(normalizeArbeitnow(arbeitnowPayload([{ slug: "no-title" }, null, "junk"])), []);
  assert.deepEqual(normalizeArbeitnow({}), []);
  assert.deepEqual(normalizeArbeitnow(null), []);
});

// ---------------------------------------------------------------------------
// Remotive
// ---------------------------------------------------------------------------

test("normalizeRemotive maps a live payload row, and every listing is remote", () => {
  const [job] = normalizeRemotive(remotivePayload([remotiveRow()]));

  assert.equal(job.source, "remotive");
  assert.equal(job.external_id, "2091161");
  assert.equal(job.title, "AI Trainer - Video Annotation");
  assert.equal(job.company, "iMerit Technology");
  assert.equal(job.location, "Worldwide");
  assert.equal(job.remote, 1);
  assert.equal(job.salary_min, 70_000);
  assert.equal(job.salary_max, 80_000);
  assert.equal(job.currency, null, "70K-80K states no currency");
  assert.equal(job.posted_at, "2026-10-22T18:40:19.000Z", "zoneless stamps are read as UTC");
  assert.deepEqual(JSON.parse(job.tags_json), ["ai/ml", "freelance", "video"]);
});

test("normalizeRemotive parses salary text it can trust and drops the rest", () => {
  const money = (salary) => {
    const [job] = normalizeRemotive(remotivePayload([remotiveRow({ salary })]));
    return [job.salary_min, job.salary_max, job.currency];
  };

  assert.deepEqual(money("$170k - $200k"), [170_000, 200_000, "USD"]);
  assert.deepEqual(money("£45,000 - £55,000"), [45_000, 55_000, "GBP"]);
  assert.deepEqual(money("€45k - €55k per year"), [45_000, 55_000, "EUR"]);
  assert.deepEqual(money("OTE $25k - $35k"), [25_000, 35_000, "USD"]);
  assert.deepEqual(money("$35,3k- $52k"), [35_300, 52_000, "USD"], "decimal comma");
  assert.deepEqual(money("$1000 per task"), [null, null, null], "per-task rates are not annual");
  assert.deepEqual(money("$50-$75 /hour"), [null, null, null], "hourly rates are not annualised");
  assert.deepEqual(money("£12 per hour"), [null, null, null]);
  assert.deepEqual(money("€5,000 /month"), [null, null, null], "monthly rates are not annualised");
  assert.deepEqual(money("£45k per annum"), [45_000, 45_000, "GBP"], "per annum is annual");
  assert.deepEqual(money("$90,000 annually"), [90_000, 90_000, "USD"], "annually is annual");
  assert.deepEqual(money(""), [null, null, null]);
  assert.deepEqual(money(undefined), [null, null, null]);
  assert.deepEqual(money("Competitive"), [null, null, null]);
  assert.deepEqual(money("£45"), [null, null, null], "implausibly small annual figures are refused");
});

test("normalizeRemotive handles numeric ids, missing ids and a broken payload", () => {
  const [byUrl] = normalizeRemotive(remotivePayload([remotiveRow({ id: undefined, url: "https://remotive.com/x" })]));
  assert.equal(byUrl.external_id, "https://remotive.com/x");
  assert.deepEqual(normalizeRemotive({}), []);
  assert.deepEqual(normalizeRemotive(remotivePayload([null, 7])), []);
});

// ---------------------------------------------------------------------------
// Remote OK
// ---------------------------------------------------------------------------

test("normalizeRemoteok skips the leading legal notice and maps the rest", () => {
  const jobs = normalizeRemoteok([REMOTEOK_LEGAL, remoteokRow()]);

  assert.equal(jobs.length, 1);
  const [job] = jobs;
  assert.equal(job.source, "remoteok");
  assert.equal(job.external_id, "1137573");
  assert.equal(job.title, "Account Executive");
  assert.equal(job.company, "Huzzle");
  assert.equal(job.location, "");
  assert.equal(job.remote, 1);
  assert.equal(job.salary_min, null, "0 means the salary is not stated");
  assert.equal(job.salary_max, null);
  assert.equal(job.currency, null);
  assert.equal(job.posted_at, "2026-10-26T08:00:12.000Z");
  assert.equal(job.url, "https://remoteOK.com/remote-jobs/remote-account-executive-huzzle-1137573");
  assert.deepEqual(JSON.parse(job.tags_json), ["digital nomad", "saas", "sales"]);
});

test("normalizeRemoteok keeps stated US-dollar salaries and falls back to epoch", () => {
  const [job] = normalizeRemoteok([
    REMOTEOK_LEGAL,
    remoteokRow({ salary_min: 120_000, salary_max: 160_000, date: "", epoch: 1_793_001_612 }),
  ]);
  assert.deepEqual([job.salary_min, job.salary_max, job.currency], [120_000, 160_000, "USD"]);
  assert.equal(job.posted_at, new Date(1_793_001_612 * 1000).toISOString());
});

test("normalizeRemoteok repairs mojibake from the live feed", () => {
  const [job] = normalizeRemoteok([
    REMOTEOK_LEGAL,
    remoteokRow({ description: "The company\u00e2\u0080\u0099s mission\u00c2\u00a0is stated." }),
  ]);
  assert.ok(job.description.includes("company\u2019s mission"), job.description);
  assert.ok(!job.description.includes("\u00e2"), "mojibake is gone");
});

test("normalizeRemoteok survives a broken payload", () => {
  assert.deepEqual(normalizeRemoteok(REMOTEOK_LEGAL), []);
  assert.deepEqual(normalizeRemoteok([null, "junk", {}]), []);
  assert.deepEqual(normalizeRemoteok(undefined), []);
});

// ---------------------------------------------------------------------------
// Description cap
// ---------------------------------------------------------------------------

test("descriptions are capped at 8000 characters", () => {
  const long = "<p>word</p>".repeat(3_000);
  const [arbeitnowJob] = normalizeArbeitnow(arbeitnowPayload([arbeitnowRow({ description: long })]));
  const [remoteJob] = normalizeRemoteok([REMOTEOK_LEGAL, remoteokRow({ description: long })]);

  for (const job of [arbeitnowJob, remoteJob]) {
    assert.ok(job.description.length <= 8_000, `got ${job.description.length}`);
    assert.ok(job.description.length > 7_000, "the useful part is kept");
    assert.ok(job.description.startsWith("word"));
    assert.ok(!job.description.endsWith(" "), "no trailing space after the cut");
  }
});

// ---------------------------------------------------------------------------
// Query filtering
// ---------------------------------------------------------------------------

test("query tokens filter on title, tags and description, and all tokens must match", () => {
  const payload = arbeitnowPayload([
    arbeitnowRow({ slug: "seo", title: "Team Lead, SEO & GEO" }),
    arbeitnowRow({ slug: "nurse", title: "Registered Nurse", company_name: "Klinik", company: "Klinik", description: "Ward work.", tags: ["health"], location: "Munich, Bavaria" }),
  ]);

  assert.deepEqual(normalizeArbeitnow(payload, "seo").map((job) => job.external_id), ["seo"]);
  assert.deepEqual(normalizeArbeitnow(payload, "team lead seo").map((job) => job.external_id), ["seo"]);
  assert.deepEqual(normalizeArbeitnow(payload, "seo nurse"), [], "AND, not OR");
  assert.deepEqual(normalizeArbeitnow(payload, "organic discovery").map((job) => job.external_id), ["seo"], "description counts");
  assert.deepEqual(normalizeArbeitnow(payload, "marketing").map((job) => job.external_id), ["seo"], "tags count");
  assert.deepEqual(normalizeArbeitnow(payload, "munich").map((job) => job.external_id), ["nurse"], "location counts");
  assert.equal(normalizeArbeitnow(payload, "javascript").length, 0);
  assert.equal(normalizeArbeitnow(payload, "").length, 2, "no query means no filter");
  assert.deepEqual(
    normalizeArbeitnow(payload, "team lead seo").map((job) => job.external_id),
    ["seo"],
    "the shared stopword list includes 'team' and 'lead', so an all-stopword query keeps the typed words"
  );
  assert.deepEqual(normalizeArbeitnow(payload, "team nurse").map((job) => job.external_id), ["nurse"]);
  assert.ok(STOPWORDS.has("lead"), "the fallback exists because 'lead' is a stopword");
  assert.deepEqual(normalizeArbeitnow(payload, "the").map((job) => job.external_id), ["seo"], "still applied");
});

test("query filtering applies to every normaliser", () => {
  const remotiveJobs = normalizeRemotive(
    remotivePayload([remotiveRow(), remotiveRow({ id: 2, title: "Sales Director", tags: [], description: "<p>Sell.</p>" })]),
    "annotation"
  );
  assert.deepEqual(remotiveJobs.map((job) => job.external_id), ["2091161"]);

  const remoteokJobs = normalizeRemoteok([REMOTEOK_LEGAL, remoteokRow(), remoteokRow({ id: "9", position: "Nurse" })], "nurse");
  assert.deepEqual(remoteokJobs.map((job) => job.external_id), ["9"]);
});

// ---------------------------------------------------------------------------
// fetchJobs
// ---------------------------------------------------------------------------

test("fetchJobs reads all three boards from the injected fetch only", async () => {
  const { impl, calls } = fakeFetch(defaultRoutes());
  const result = await withNoGlobalFetch(() => fetchJobs({ fetchImpl: impl, query: "annotation" }));

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.url).sort(), Object.values(SOURCE_URL).sort());
  for (const call of calls) {
    assert.match(call.options.headers["user-agent"], /Applywright/);
    assert.ok(call.options.signal instanceof AbortSignal, "each request gets an abort signal");
    assert.equal(call.options.signal.aborted, false);
  }

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.jobs.map((job) => job.source), ["remotive"], "only the annotation posting matches");
});

test("fetchJobs dedupes the same posting across two boards and keeps the richer record", async () => {
  const shared = { company: "HelloFresh", title: "Team Lead, SEO & GEO", location: "Berlin, Berlin" };
  const routes = defaultRoutes({
    [SOURCE_URL.arbeitnow]: arbeitnowPayload([
      arbeitnowRow({ ...shared, company_name: shared.company, title: shared.title }),
    ]),
    [SOURCE_URL.remotive]: remotivePayload([
      remotiveRow({
        id: 777,
        title: shared.title,
        company_name: shared.company,
        candidate_required_location: shared.location,
        salary: "€90k - €100k",
        description: `<p>${"Longer, richer posting. ".repeat(20)}</p>`,
      }),
    ]),
    [SOURCE_URL.remoteok]: [REMOTEOK_LEGAL],
  });

  const { impl } = fakeFetch(routes);
  const { jobs } = await fetchJobs({ fetchImpl: impl });

  assert.equal(jobs.length, 1, "one posting, not two");
  assert.equal(jobs[0].source, "remotive");
  assert.equal(jobs[0].salary_min, 90_000);
  assert.equal(jobs[0].dedupe_hash, sha256("hellofresh|team lead, seo & geo|berlin, berlin"));
});

test("fetchJobs sorts newest first and caps the result at the requested limit", async () => {
  const routes = defaultRoutes({
    [SOURCE_URL.arbeitnow]: arbeitnowPayload([
      arbeitnowRow({ slug: "old", title: "Old role", created_at: EPOCH_2026 }),
      arbeitnowRow({ slug: "new", title: "New role", created_at: EPOCH_2026 + 86_400 }),
    ]),
    [SOURCE_URL.remotive]: remotivePayload([remotiveRow({ publication_date: "2026-10-22T18:40:19" })]),
    [SOURCE_URL.remoteok]: [REMOTEOK_LEGAL, remoteokRow({ position: "Middle role", date: "2026-06-01T00:00:00+00:00" })],
  });

  const { impl } = fakeFetch(routes);
  const all = await fetchJobs({ fetchImpl: impl });
  assert.deepEqual(all.jobs.map((job) => job.title), [
    "AI Trainer - Video Annotation",
    "Middle role",
    "New role",
    "Old role",
  ]);

  const first = await fetchJobs({ fetchImpl: impl, limit: 1 });
  assert.deepEqual(first.jobs.map((job) => job.title), ["AI Trainer - Video Annotation"]);

  const asString = await fetchJobs({ fetchImpl: impl, limit: "2" });
  assert.equal(asString.jobs.length, 2, "string limits are tolerated");

  const wasteful = await fetchJobs({ fetchImpl: impl, limit: 0 });
  assert.equal(wasteful.jobs.length, 4, "a nonsensical limit falls back to the default");
});

test("fetchJobs holds the ceiling at 200 jobs", async () => {
  const rows = Array.from({ length: 210 }, (_unused, index) =>
    arbeitnowRow({ slug: `job-${index}`, title: `Role ${index}`, created_at: EPOCH_2026 + index })
  );
  const { impl } = fakeFetch({
    [SOURCE_URL.arbeitnow]: arbeitnowPayload(rows),
    [SOURCE_URL.remotive]: remotivePayload([]),
    [SOURCE_URL.remoteok]: [REMOTEOK_LEGAL],
  });

  const { jobs } = await fetchJobs({ fetchImpl: impl, limit: 1_000 });
  assert.equal(jobs.length, 200);
  assert.equal(jobs[0].title, "Role 209", "newest first");
});

test("fetchJobs applies remoteOnly", async () => {
  const routes = defaultRoutes({
    [SOURCE_URL.arbeitnow]: arbeitnowPayload([
      arbeitnowRow({ slug: "onsite", title: "Onsite role", remote: false }),
      arbeitnowRow({ slug: "home", title: "Home role", remote: true }),
    ]),
  });

  const { impl } = fakeFetch(routes);
  const all = await fetchJobs({ fetchImpl: impl });
  assert.deepEqual(all.jobs.map((job) => job.remote).sort(), [0, 1, 1, 1]);

  const remote = await fetchJobs({ fetchImpl: impl, remoteOnly: true });
  assert.equal(remote.jobs.length, 3);
  assert.ok(remote.jobs.every((job) => job.remote === 1));
  assert.ok(!remote.jobs.some((job) => job.title === "Onsite role"));
});

test("fetchJobs filters by location, treating an unstated location as remote-agnostic", async () => {
  const { impl } = fakeFetch(defaultRoutes());

  const berlin = await fetchJobs({ fetchImpl: impl, location: "berlin" });
  assert.deepEqual(berlin.jobs.map((job) => job.title), ["Team Lead, SEO & GEO"]);

  const nowhere = await fetchJobs({ fetchImpl: impl, location: "reykjavik" });
  assert.deepEqual(nowhere.jobs, [], "an unstated location is not a match without remoteOnly");

  // With remoteOnly the place is beside the point: Remote OK states no location
  // at all, and Remotive says "Worldwide". The Berlin role is not remote, so it
  // stays out.
  const remoteBerlin = await fetchJobs({ fetchImpl: impl, location: "berlin", remoteOnly: true });
  assert.deepEqual(remoteBerlin.jobs.map((job) => job.title), ["Account Executive"]);

  const remoteAnywhere = await fetchJobs({ fetchImpl: impl, location: "", remoteOnly: true });
  assert.equal(remoteAnywhere.jobs.length, 2, "the Remote OK row has no location but is remote");
});

test("one failing source is reported and the others still deliver", async () => {
  const routes = defaultRoutes({
    [SOURCE_URL.remotive]: () => jsonResponse({ error: "unavailable" }, { status: 503, statusText: "Service Unavailable" }),
  });
  const { impl } = fakeFetch(routes);

  const result = await fetchJobs({ fetchImpl: impl });
  assert.deepEqual(result.errors, [
    { source: "remotive", message: "Remotive responded 503 Service Unavailable." },
  ]);
  assert.deepEqual(result.jobs.map((job) => job.source).sort(), ["arbeitnow", "remoteok"]);
});

test("all sources failing returns no jobs, three errors in source order, and never throws", async () => {
  const failing = () => {
    throw new Error("fetch failed");
  };
  const { impl } = fakeFetch({
    [SOURCE_URL.arbeitnow]: failing,
    [SOURCE_URL.remotive]: failing,
    [SOURCE_URL.remoteok]: failing,
  });

  const result = await fetchJobs({ fetchImpl: impl });
  assert.deepEqual(result.jobs, []);
  assert.deepEqual(result.errors.map((error) => error.source), ["arbeitnow", "remotive", "remoteok"]);
  assert.equal(result.errors[0].message, "Arbeitnow request failed (fetch failed).");
  assert.equal(result.errors[2].message, "Remote OK request failed (fetch failed).");
});

test("a source returning the wrong shape or invalid JSON is an error, not an empty feed", async () => {
  const { impl } = fakeFetch(
    defaultRoutes({
      [SOURCE_URL.remotive]: {},
      [SOURCE_URL.remoteok]: () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      }),
    })
  );

  const result = await fetchJobs({ fetchImpl: impl });
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].message, /Remotive returned an unexpected response shape/);
  assert.match(result.errors[1].message, /Remote OK returned a response that is not valid JSON/);
  assert.deepEqual(result.jobs.map((job) => job.source), ["arbeitnow"]);
});

test("a cancelled caller signal is reported per source without throwing", async () => {
  const controller = new AbortController();
  controller.abort();
  const { impl } = fakeFetch({
    [SOURCE_URL.arbeitnow]: () => {
      throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    },
    [SOURCE_URL.remotive]: () => {
      throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    },
    [SOURCE_URL.remoteok]: () => {
      throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    },
  });

  const result = await fetchJobs({ fetchImpl: impl, signal: controller.signal });
  assert.deepEqual(result.jobs, []);
  assert.equal(result.errors.length, 3);
  assert.ok(result.errors.every((error) => /cancelled/.test(error.message)), JSON.stringify(result.errors));
});

test("fetchJobs reports a missing fetch implementation instead of throwing", async () => {
  const original = globalThis.fetch;
  // A non-function fetchImpl falls back to the global; remove it to prove the
  // degraded path rather than reaching for the network.
  globalThis.fetch = undefined;
  try {
    const result = await fetchJobs({ fetchImpl: "nope" });
    assert.deepEqual(result.jobs, []);
    assert.deepEqual(result.errors.map((error) => error.source), ["arbeitnow", "remotive", "remoteok"]);
    assert.ok(result.errors.every((error) => /No fetch implementation/.test(error.message)));
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchJobs is deterministic: two identical runs produce identical results", async () => {
  const routes = defaultRoutes();
  const first = await fetchJobs({ fetchImpl: fakeFetch(routes).impl, query: "lead" });
  const second = await fetchJobs({ fetchImpl: fakeFetch(routes).impl, query: "lead" });
  assert.deepEqual(second, first);
});

test("fetchJobs tolerates junk rows inside a good payload", async () => {
  const { impl } = fakeFetch(
    defaultRoutes({
      [SOURCE_URL.arbeitnow]: arbeitnowPayload([null, {}, arbeitnowRow()]),
      [SOURCE_URL.remoteok]: [REMOTEOK_LEGAL, {}, "junk", remoteokRow()],
    })
  );

  const { jobs, errors } = await fetchJobs({ fetchImpl: impl });
  assert.deepEqual(errors, []);
  assert.deepEqual(jobs.map((job) => job.source).sort(), ["arbeitnow", "remoteok", "remotive"]);
});
