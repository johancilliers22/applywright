/**
 * HTTP contract, part 5: saved searches (SPEC sections 2, 3, 6).
 *
 * The Free plan allows one alert and three packs; only the alert quota is
 * exercised here.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { startServer } from "../server/app.js";

const PASSWORD = "correct horse battery staple";

let instance;
let base;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-test-alerts-"));
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

const ALERT = {
  name: "Backend roles in London",
  keywords: "backend, node, postgres",
  locations: "London",
  remoteOnly: true,
  minSalary: 60000,
  cadence: "daily",
};

test("an alert can be created and listed", async () => {
  const call = await signedIn("alert-create@example.com");

  const created = await call("POST", "/api/alerts", ALERT);
  assert.equal(created.status, 201);
  const alert = created.json.alert;
  assert.equal(typeof alert.id, "string");
  assert.equal(alert.name, ALERT.name);
  assert.equal(alert.keywords, ALERT.keywords);
  assert.equal(alert.cadence, "daily");
  assert.equal(alert.active, 1, "a new alert is active");

  const listed = await call("GET", "/api/alerts");
  assert.equal(listed.status, 200);
  assert.equal(listed.json.alerts.length, 1);
  assert.equal(listed.json.alerts[0].id, alert.id);
});

test("an alert can be paused and edited", async () => {
  const call = await signedIn("alert-patch@example.com");
  const created = await call("POST", "/api/alerts", ALERT);

  const paused = await call("PATCH", `/api/alerts/${created.json.alert.id}`, {
    active: false,
    name: "Paused backend roles",
    minSalary: 70000,
  });
  assert.equal(paused.status, 200);
  assert.equal(paused.json.alert.id, created.json.alert.id);
  assert.equal(paused.json.alert.active, 0);
  assert.equal(paused.json.alert.name, "Paused backend roles");

  const resumed = await call("PATCH", `/api/alerts/${created.json.alert.id}`, { active: true });
  assert.equal(resumed.json.alert.active, 1);
});

test("a second alert on the free plan is refused with 402 quota_exceeded", async () => {
  const call = await signedIn("alert-quota@example.com");
  assert.equal((await call("POST", "/api/alerts", ALERT)).status, 201);

  const second = await call("POST", "/api/alerts", { name: "Second", keywords: "data" });
  assert.equal(second.status, 402);
  assert.equal(second.json.error.code, "quota_exceeded");
});

test("an alert can be deleted", async () => {
  const call = await signedIn("alert-delete@example.com");
  const created = await call("POST", "/api/alerts", ALERT);

  const deleted = await call("DELETE", `/api/alerts/${created.json.alert.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.deleted, true);

  const listed = await call("GET", "/api/alerts");
  assert.equal(listed.json.alerts.length, 0);

  const again = await call("DELETE", `/api/alerts/${created.json.alert.id}`);
  assert.equal(again.status, 404);
});

test("another user cannot patch or delete an alert", async () => {
  const owner = await signedIn("alert-owner@example.com");
  const stranger = await signedIn("alert-stranger@example.com");
  const created = await owner("POST", "/api/alerts", ALERT);

  assert.equal((await stranger("PATCH", `/api/alerts/${created.json.alert.id}`, { active: false })).status, 404);
  assert.equal((await stranger("DELETE", `/api/alerts/${created.json.alert.id}`)).status, 404);
  assert.equal((await owner("GET", "/api/alerts")).json.alerts[0].active, 1);
});

test("the alert run reports checked, matched and created", async () => {
  const call = await signedIn("alert-run@example.com");
  const created = await call("POST", "/api/alerts", ALERT);

  // /api/alerts/run calls the live job feeds for each active alert. Pausing the
  // only alert keeps this test off the network: the run then has nothing to
  // fetch and still returns the documented shape.
  await call("PATCH", `/api/alerts/${created.json.alert.id}`, { active: false });

  const run = await call("POST", "/api/alerts/run", {});
  assert.equal(run.status, 200);
  assert.equal(typeof run.json.checked, "number");
  assert.equal(typeof run.json.matched, "number");
  assert.equal(typeof run.json.created, "number");
  assert.equal(run.json.alerts, 0, "no alert was active");
  assert.equal(run.json.checked, 0);
  assert.ok(Array.isArray(run.json.sources));
});
