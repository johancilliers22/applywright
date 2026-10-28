/**
 * HTTP contract, part 8: the error envelope, routing failures, security
 * headers, request ids and the auth rate limit (SPEC section 6).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { startServer } from "../server/app.js";

const PASSWORD = "correct horse battery staple";

const overrides = (dir, extra = {}) => ({
  dataDir: dir,
  databasePath: join(dir, "test.db"),
  PORT: 0,
  MODEL_API_KEY: "",
  JOB_FEED_CACHE_MINUTES: 0,
  AUTH_RATE_LIMIT_PER_MINUTE: 50,
  RATE_LIMIT_PER_MINUTE: 500,
  ...extra,
});

let main;
let strict;
let base;
let strictBase;

before(async () => {
  const mainDir = await mkdtemp(join(tmpdir(), "aw-test-errors-"));
  main = await startServer(overrides(mainDir));
  base = main.url;

  // A second instance with a deliberately tiny auth limit, so the 429 path can be
  // reached without fifty attempts.
  const strictDir = await mkdtemp(join(tmpdir(), "aw-test-errors-rate-"));
  strict = await startServer(overrides(strictDir, { AUTH_RATE_LIMIT_PER_MINUTE: 3 }));
  strictBase = strict.url;
});

after(async () => {
  await main?.close();
  await strict?.close();
});

/** A fetch client with its own cookie jar, so two users stay separate. */
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

async function signedIn(email) {
  const call = createClient(base);
  const response = await call("POST", "/api/auth/register", { email, password: PASSWORD, name: "Test User" });
  assert.equal(response.status, 201);
  return call;
}

const assertEnvelope = (response) => {
  assert.equal(typeof response.json?.error, "object");
  assert.equal(typeof response.json.error.code, "string");
  assert.ok(response.json.error.code.length > 0);
  assert.equal(typeof response.json.error.message, "string");
  assert.ok(response.json.error.message.length > 0);
  assert.equal(response.json.stack, undefined, "no stack trace may leak");
  assert.deepEqual(Object.keys(response.json), ["error"], "the error body is exactly {error: {code, message}}");
};

test("a 401 uses the error envelope", async () => {
  const anonymous = createClient(base);
  const response = await anonymous("GET", "/api/auth/me");
  assert.equal(response.status, 401);
  assertEnvelope(response);
});

test("a 400 uses the error envelope", async () => {
  const anonymous = createClient(base);
  const response = await anonymous("POST", "/api/auth/register", { email: "not-an-email", password: PASSWORD });
  assert.equal(response.status, 400);
  assertEnvelope(response);
});

test("a 404 uses the error envelope", async () => {
  const call = await signedIn("errors-404@example.com");
  const response = await call("GET", "/api/cvs/cv_missing");
  assert.equal(response.status, 404);
  assertEnvelope(response);
});

test("an unknown /api route answers 404 as JSON", async () => {
  const call = createClient(base);

  const read = await call("GET", "/api/there-is-no-such-route");
  assert.equal(read.status, 404);
  assert.match(read.headers.get("content-type") ?? "", /^application\/json/);
  assertEnvelope(read);

  const write = await call("POST", "/api/there-is-no-such-route", {});
  assert.equal(write.status, 404);
  assert.match(write.headers.get("content-type") ?? "", /^application\/json/);
  assertEnvelope(write);
});

test("malformed JSON is refused with 400", async () => {
  const call = createClient(base);

  const response = await call("POST", "/api/auth/login", "{not json at all", {
    headers: { "content-type": "application/json" },
  });
  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assertEnvelope(response);
});

test("security headers are set on API responses and on pages", async () => {
  const call = createClient(base);

  for (const path of ["/api/health", "/sign-in"]) {
    const response = await call("GET", path);
    assert.equal(response.status, 200, `${path} should be served`);
    const csp = response.headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.ok((response.headers.get("permissions-policy") ?? "").length > 0);
    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(response.headers.get("x-powered-by"), null, "Express must not advertise itself");
  }
});

test("every response carries a unique x-request-id", async () => {
  const call = createClient(base);

  const first = await call("GET", "/api/health");
  const second = await call("GET", "/api/health");
  const firstId = first.headers.get("x-request-id");
  const secondId = second.headers.get("x-request-id");

  assert.equal(typeof firstId, "string");
  assert.ok(firstId.length > 0);
  assert.equal(typeof secondId, "string");
  assert.notEqual(firstId, secondId, "a request id identifies one request");
});

test("a cross-origin mutation is refused with 403", async () => {
  const anonymous = createClient(base);

  const response = await anonymous(
    "POST",
    "/api/auth/login",
    { email: "cross-origin@example.com", password: PASSWORD },
    { headers: { origin: "https://attacker.example" } }
  );
  assert.equal(response.status, 403);
  assertEnvelope(response);
});

test("repeated failed logins are rate limited with 429", async () => {
  const call = createClient(strictBase);
  const statuses = [];
  let limited = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await call("POST", "/api/auth/login", { email: "rate@example.com", password: "wrong password" });
    statuses.push(response.status);
    if (response.status === 429) limited = response;
  }

  assert.deepEqual(statuses.slice(0, 3), [401, 401, 401], "the configured allowance is honoured");
  assert.equal(statuses[3], 429);
  assert.equal(statuses[4], 429);
  assert.ok(limited);
  assert.match(limited.headers.get("content-type") ?? "", /^application\/json/);
  assertEnvelope(limited);
  const retryAfter = Number(limited.headers.get("retry-after"));
  assert.ok(Number.isFinite(retryAfter) && retryAfter >= 1, "a Retry-After header is given");
});
