/**
 * Tests for server/lib/jobs/match.js — saved-search matching and profile scoring.
 *
 * node --test server/lib/jobs/match.test.mjs
 *
 * Everything here is offline, clock-free and file-free: both functions are pure.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  explainJobScore,
  matchRule,
  scoreJobForProfile,
  SCORE_WEIGHTS
} from "./match.js";

const job = {
  title: "Senior Data Engineer",
  company: "Northwind Analytics",
  location: "London, UK",
  remote: false,
  salaryMin: 65000,
  salaryMax: 80000,
  currency: "GBP",
  description:
    "Build and run batch and streaming data pipelines in Python and SQL. Airflow, dbt and warehouse modelling experience is welcome."
};

const profile = {
  titles: ["Data Engineer"],
  skills: ["Python", "SQL"],
  location: "London",
  seniority: "mid"
};

/* ------------------------------------------------------------------ *
 * matchRule — keywords
 * ------------------------------------------------------------------ */

test("a keyword in the title and description matches, and says so", () => {
  const result = matchRule({ keywords: ["data engineer"] }, job);
  assert.equal(result.matched, true);
  assert.deepEqual(result.reasons, ['title or description contains "data engineer"']);
});

test("a keyword found only in the title still matches", () => {
  const titleOnly = { title: "Senior Data Engineer", description: "Build pipelines in Python." };
  assert.equal(titleOnly.description.toLowerCase().includes("senior"), false);

  const result = matchRule({ keywords: ["senior"] }, titleOnly);
  assert.equal(result.matched, true);
  assert.deepEqual(result.reasons, ['title or description contains "senior"']);
});

test("a multi-word keyword needs every one of its words", () => {
  assert.equal(matchRule({ keywords: ["data engineer"] }, job).matched, true);

  const miss = matchRule({ keywords: ["data scientist"] }, job);
  assert.equal(miss.matched, false);
  assert.ok(miss.reasons[0].startsWith('title or description does not contain "data scientist"'));
  assert.ok(miss.reasons[0].includes('missing "scientist"'));
});

test("a keyword that appears nowhere rejects with a plain reason", () => {
  const result = matchRule({ keywords: ["kubernetes"] }, job);
  assert.equal(result.matched, false);
  assert.deepEqual(result.reasons, ['title or description does not contain "kubernetes"']);
});

test("keyword matching ignores case", () => {
  assert.equal(matchRule({ keywords: ["PYTHON"] }, job).matched, true);
  assert.equal(matchRule({ keywords: ["Python"] }, job).matched, true);
});

test("listed keywords are alternatives, so one is enough", () => {
  const result = matchRule({ keywords: "kubernetes, python" }, job);
  assert.equal(result.matched, true);
  assert.deepEqual(result.reasons, [
    'title or description does not contain "kubernetes"',
    'title or description contains "python"'
  ]);
});

test("only the title and description are searched, never the company", () => {
  assert.equal(matchRule({ keywords: ["northwind"] }, job).matched, false);
});

/* ------------------------------------------------------------------ *
 * matchRule — locations
 * ------------------------------------------------------------------ */

test("a location matches as a case-insensitive substring", () => {
  const hit = matchRule({ locations: ["london"] }, job);
  assert.equal(hit.matched, true);
  assert.deepEqual(hit.reasons, ['job location "London, UK" contains "london"']);

  const miss = matchRule({ locations: ["Leeds"] }, job);
  assert.equal(miss.matched, false);
  assert.deepEqual(miss.reasons, ['job location "London, UK" does not contain "Leeds"']);
});

test("location alternatives are OR-ed", () => {
  assert.equal(matchRule({ locations: ["Leeds", "London"] }, job).matched, true);
});

test("an unknown job location never satisfies a location", () => {
  const anonymous = { title: "Data Engineer", description: "Python and SQL." };
  const result = matchRule({ locations: ["London"] }, anonymous);
  assert.equal(result.matched, false);
  assert.deepEqual(result.reasons, ['job location is unknown, so it cannot meet "London"']);
});

/* ------------------------------------------------------------------ *
 * matchRule — remote only
 * ------------------------------------------------------------------ */

test("remoteOnly rejects an on-site job and accepts a remote one", () => {
  const onSite = matchRule({ remoteOnly: true }, job);
  assert.equal(onSite.matched, false);
  assert.deepEqual(onSite.reasons, ["job is not marked remote"]);

  const remote = matchRule({ remoteOnly: true }, { ...job, remote: true });
  assert.equal(remote.matched, true);
  assert.deepEqual(remote.reasons, ["job is marked remote"]);
});

test("remoteOnly reads the SQLite 1/0 flag and the underscored column name", () => {
  assert.equal(matchRule({ remote_only: true }, { ...job, remote: 1 }).matched, true);
  assert.equal(matchRule({ remoteOnly: true }, { ...job, remote: 0 }).matched, false);
});

/* ------------------------------------------------------------------ *
 * matchRule — salary floor
 * ------------------------------------------------------------------ */

test("a stated salary at or above the floor matches", () => {
  const hit = matchRule({ minSalary: 45000 }, job);
  assert.equal(hit.matched, true);
  assert.deepEqual(hit.reasons, ["stated salary band 65000\u201380000 meets the 45000 floor"]);

  assert.equal(matchRule({ minSalary: 65000 }, job).matched, true, "the floor itself counts");
  assert.equal(matchRule({ minSalary: 65001 }, job).matched, false);
});

test("an unknown salary never meets a floor, and the reason says so", () => {
  const unpriced = { title: "Data Engineer", description: "Python and SQL." };
  const result = matchRule({ minSalary: 45000 }, unpriced);
  assert.equal(result.matched, false);
  assert.deepEqual(result.reasons, ["salary unknown, so it cannot meet the 45000 floor"]);
});

test("a band that starts below the floor does not meet it", () => {
  const wide = { ...job, salaryMin: 40000, salaryMax: 90000 };
  const result = matchRule({ minSalary: 45000 }, wide);
  assert.equal(result.matched, false);
  assert.deepEqual(result.reasons, ["stated salary band 40000\u201390000 starts below the 45000 floor"]);
});

test("a job that states only a maximum uses that one figure", () => {
  const maxOnly = { ...job, salaryMin: null, salaryMax: 70000 };
  const result = matchRule({ minSalary: 60000 }, maxOnly);
  assert.equal(result.matched, true);
  assert.deepEqual(result.reasons, ["stated salary 70000 meets the 60000 floor"]);
});

test("a zero floor still requires a stated salary", () => {
  assert.equal(matchRule({ minSalary: 0 }, job).matched, true);
  const unpriced = { title: "Data Engineer", description: "Python and SQL." };
  assert.equal(matchRule({ minSalary: 0 }, unpriced).matched, false);
});

test("a floor sent as text with separators is still a number", () => {
  assert.equal(matchRule({ minSalary: "45,000" }, job).matched, true);
  assert.equal(matchRule({ minSalary: "\u00a390,000" }, job).matched, false);
  assert.equal(matchRule({ minSalary: "not a number" }, job).matched, true, "unusable floor is no test");
});

/* ------------------------------------------------------------------ *
 * matchRule — combining the dimensions
 * ------------------------------------------------------------------ */

test("every dimension the rule sets must pass, and every test gets a reason", () => {
  const result = matchRule(
    { keywords: ["python"], locations: ["Leeds"], remoteOnly: true, minSalary: 45000 },
    job
  );
  assert.equal(result.matched, false);
  assert.deepEqual(result.reasons, [
    'title or description contains "python"',
    'job location "London, UK" does not contain "Leeds"',
    "job is not marked remote",
    "stated salary band 65000\u201380000 meets the 45000 floor"
  ]);
});

test("a rule with no criteria matches everything and says why", () => {
  const empty = matchRule({}, job);
  assert.equal(empty.matched, true);
  assert.deepEqual(empty.reasons, ["the rule sets no criteria, so every job matches"]);

  // A null alert row must not throw.
  assert.equal(matchRule(null, job).matched, true);
});

test("matching is deterministic", () => {
  const rule = { keywords: "python, airflow", locations: ["London"], remoteOnly: false, minSalary: 45000 };
  assert.deepEqual(matchRule(rule, job), matchRule(rule, job));
});

/* ------------------------------------------------------------------ *
 * scoreJobForProfile
 * ------------------------------------------------------------------ */

test("a job that fits on every dimension scores 100", () => {
  const perfect = {
    title: "Data Engineer",
    description: "Python and SQL.",
    location: "London",
    salaryMin: 40000
  };
  assert.equal(scoreJobForProfile(perfect, profile), 100);
});

test("a clearly worse job scores lower, and low", () => {
  const good = {
    title: "Senior Data Engineer",
    description: "Python, SQL and Airflow.",
    location: "London",
    salaryMin: 60000
  };
  const poor = {
    title: "Warehouse Operative",
    description: "Pick and pack customer orders in a busy warehouse. Forklift licence preferred.",
    location: "Leeds, UK",
    salaryMin: null
  };

  const better = scoreJobForProfile(good, profile);
  const worse = scoreJobForProfile(poor, profile);
  assert.ok(better > worse, `${better} should beat ${worse}`);
  assert.ok(worse < 30, `a warehouse role should be well under 30, got ${worse}`);
});

test("a stated salary is worth exactly the salary weight", () => {
  const base = { title: "Data Engineer", description: "Python and SQL.", location: "London" };
  const withSalary = { ...base, salaryMin: 50000 };
  assert.equal(
    scoreJobForProfile(withSalary, profile) - scoreJobForProfile(base, profile),
    SCORE_WEIGHTS.salary
  );
});

test("seniority sanity separates a near miss from a three-level gap", () => {
  const mid = { ...profile, seniority: "mid", location: "London" };
  const seniorJob = { title: "Senior Data Engineer", description: "Python and SQL.", location: "London" };
  const seniorPart = explainJobScore(seniorJob, mid).parts.find((part) => part.id === "seniority");
  assert.equal(seniorPart.ratio, 0.6);

  const junior = { titles: ["Engineer"], skills: ["Python"], seniority: "junior", location: "London" };
  const leadJob = { title: "Head of Engineering", description: "Python and SQL.", location: "London" };
  const leadPart = explainJobScore(leadJob, junior).parts.find((part) => part.id === "seniority");
  assert.equal(leadPart.ratio, 0);
  assert.ok(leadPart.detail.includes("lead"));
});

test("a remote profile accepts a remote job wherever it is", () => {
  const remoteProfile = { ...profile, location: "London", remote: true };
  const remoteJob = { title: "Data Engineer", description: "Python and SQL.", remote: true, location: "Remote (EU)" };
  const part = explainJobScore(remoteJob, remoteProfile).parts.find((row) => row.id === "location");
  assert.equal(part.ratio, 1);

  const onSite = { ...remoteJob, remote: false };
  const onSitePart = explainJobScore(onSite, remoteProfile).parts.find((row) => row.id === "location");
  assert.equal(onSitePart.ratio, 0);
});

test("the breakdown accounts for the score and uses the documented weights", () => {
  assert.equal(
    Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0),
    100
  );

  const { score, parts } = explainJobScore(job, profile);
  assert.deepEqual(
    parts.map((part) => part.id),
    ["keywords", "title", "location", "seniority", "salary"]
  );
  assert.equal(
    parts.reduce((sum, part) => sum + part.weight, 0),
    100
  );
  assert.equal(Math.round(parts.reduce((sum, part) => sum + part.points, 0)), score);
  for (const part of parts) assert.ok(part.detail.length > 0, `${part.id} needs a detail`);
});

test("scores are whole numbers between 0 and 100, and empty input scores 0", () => {
  const samples = [
    {},
    { title: "Data Engineer" },
    job,
    { title: "Head of Everything", description: "x".repeat(500) },
    { title: "Data Engineer", description: null, salaryMin: 0 }
  ];
  for (const sample of samples) {
    const score = scoreJobForProfile(sample, profile);
    assert.ok(Number.isInteger(score), `expected an integer, got ${score}`);
    assert.ok(score >= 0 && score <= 100, `expected 0-100, got ${score}`);
  }

  assert.equal(scoreJobForProfile({}, {}), 0);
  assert.equal(scoreJobForProfile(undefined, undefined), 0);
});

test("scoring is deterministic", () => {
  assert.deepEqual(explainJobScore(job, profile), explainJobScore(job, profile));
  assert.equal(scoreJobForProfile(job, profile), scoreJobForProfile(job, profile));
});
