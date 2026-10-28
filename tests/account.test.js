/**
 * HTTP contract, part 9: export and account deletion (SPEC sections 1 and 6).
 *
 * SPEC section 1: "No silent data retention. CV text is stored as text (never
 * the raw binary), and export/delete must work."
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { startServer } from "../server/app.js";

const PASSWORD = "correct horse battery staple";

const CV_TEXT = [
  "Grace Hopper",
  "grace.hopper@example.com",
  "+44 7700 900123",
  "London, UK",
  "",
  "Summary",
  "Senior backend engineer with nine years building Node.js services and PostgreSQL",
  "platforms. Owns reliability, observability and delivery.",
  "",
  "Experience",
  "- Built a Node.js payments service handling 4 million requests per day.",
  "- Led migration of 42 services to PostgreSQL 16 with zero downtime.",
  "",
  "Education",
  "BSc Computer Science, University of Manchester.",
  "",
  "Skills",
  "Node.js, TypeScript, PostgreSQL, Kubernetes, AWS, OpenTelemetry.",
].join("\n");

const JOB_TEXT = [
  "Senior Backend Engineer",
  "",
  "Own our Node.js payment platform. You will design REST APIs, work with PostgreSQL and",
  "TypeScript, run services on Kubernetes and AWS. Salary GBP 65000 to 80000.",
].join("\n");

let instance;
let base;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-test-account-"));
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

async function account(email) {
  const call = createClient();
  const registered = await call("POST", "/api/auth/register", { email, password: PASSWORD, name: "Grace Hopper" });
  assert.equal(registered.status, 201);
  return { call, user: registered.json.user };
}

test("export returns the account's CVs, applications and supporting rows", async () => {
  const { call, user } = await account("export@example.com");

  const cv = await call("POST", "/api/cvs", { name: "Platform CV", text: CV_TEXT });
  assert.equal(cv.status, 201);
  await call("POST", "/api/analyse", { cvId: cv.json.cv.id, jobText: JOB_TEXT });
  const tailored = await call("POST", "/api/tailor", { cvId: cv.json.cv.id, jobText: JOB_TEXT, title: "Senior Backend Engineer" });
  assert.equal(tailored.status, 201);

  const exported = await call("GET", "/api/export");
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-type") ?? "", /^application\/json/);

  const data = exported.json;
  assert.equal(data.user.email, user.email);
  assert.equal(data.cvs.length, 1);
  assert.equal(data.cvs[0].id, cv.json.cv.id);
  assert.equal(data.cvs[0].name, "Platform CV");
  assert.equal(data.cvs[0].text, CV_TEXT, "export carries the CV text, not a binary");

  assert.equal(data.applications.length, 1);
  assert.equal(data.applications[0].id, tailored.json.application.id);
  assert.equal(data.applications[0].title, "Senior Backend Engineer");

  assert.equal(data.reports.length, 1);
  for (const key of ["cvs", "applications", "reports", "alerts", "notifications", "usage"]) {
    assert.ok(Array.isArray(data[key]), `export should carry ${key}`);
  }
});

test("export never includes another account's data", async () => {
  const first = await account("export-owner@example.com");
  const second = await account("export-stranger@example.com");
  assert.equal((await first.call("POST", "/api/cvs", { text: CV_TEXT })).status, 201);

  const exported = await second.call("GET", "/api/export");
  assert.equal(exported.status, 200);
  assert.equal(exported.json.user.email, "export-stranger@example.com");
  assert.equal(exported.json.cvs.length, 0);
  assert.equal(exported.json.applications.length, 0);
});

test("deleting the account requires the password", async () => {
  const { call } = await account("delete-wrong@example.com");

  const noPassword = await call("DELETE", "/api/account", {});
  assert.equal(noPassword.status, 400);
  assert.equal(typeof noPassword.json.error.code, "string");

  const wrong = await call("DELETE", "/api/account", { password: "not the password" });
  assert.equal(wrong.status, 401);
  assert.equal(typeof wrong.json.error.code, "string");

  // The account still works after the refused attempts.
  assert.equal((await call("GET", "/api/auth/me")).status, 200);
});

test("deleting the account with the right password destroys the session", async () => {
  const { call } = await account("delete-right@example.com");
  assert.equal((await call("POST", "/api/cvs", { text: CV_TEXT })).status, 201);

  const deleted = await call("DELETE", "/api/account", { password: PASSWORD });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.deleted, true);
  assert.match(
    deleted.headers.getSetCookie().find((value) => value.startsWith("aw_session=")) ?? "",
    /Max-Age=0/
  );

  // The old cookie is dead: the session row went with the account.
  assert.equal((await call("GET", "/api/auth/me")).status, 401);
  assert.equal((await call("GET", "/api/export")).status, 401);

  const relogin = await call("POST", "/api/auth/login", { email: "delete-right@example.com", password: PASSWORD });
  assert.equal(relogin.status, 401, "a deleted account cannot sign in again");
});
