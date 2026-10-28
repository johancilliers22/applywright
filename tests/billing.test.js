/**
 * HTTP contract, part 7: plans and billing (SPEC sections 2 and 6).
 *
 * Prices are exact pence, exclusive of VAT: Free 0, Pro 1900 a month and 19000 a
 * year, Scale 4900 a month and 49000 a year.
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
  const dir = await mkdtemp(join(tmpdir(), "aw-test-billing-"));
  instance = await startServer({
    dataDir: dir,
    databasePath: join(dir, "test.db"),
    PORT: 0,
    MODEL_API_KEY: "",
    JOB_FEED_CACHE_MINUTES: 0,
    AUTH_RATE_LIMIT_PER_MINUTE: 50,
    RATE_LIMIT_PER_MINUTE: 500,
    // Force the unconfigured Stripe path regardless of the host environment.
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
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

test("the three plans carry the exact SPEC prices in pence", async () => {
  const call = await signedIn("billing-plans@example.com");
  const plans = await call("GET", "/api/billing/plans");
  assert.equal(plans.status, 200);

  assert.equal(plans.json.plans.length, 3);
  assert.deepEqual(
    plans.json.plans.map((plan) => plan.id),
    ["free", "pro", "scale"]
  );

  const prices = Object.fromEntries(plans.json.plans.map((plan) => [plan.id, plan.prices]));
  assert.deepEqual(prices.free, { month: 0, year: 0 });
  assert.deepEqual(prices.pro, { month: 1900, year: 19000 });
  assert.deepEqual(prices.scale, { month: 4900, year: 49000 });

  for (const plan of plans.json.plans) assert.equal(plan.currency, "GBP");
});

test("the plan quotas match the SPEC table", async () => {
  const call = await signedIn("billing-quotas@example.com");
  const plans = await call("GET", "/api/billing/plans");
  const quotas = Object.fromEntries(plans.json.plans.map((plan) => [plan.id, plan.quotas]));

  // Unlimited is reported as null, because JSON has no Infinity.
  assert.deepEqual(quotas.free, { cvs: 1, packs: 3, alerts: 1, jobResultsPerDay: 40 });
  assert.deepEqual(quotas.pro, { cvs: 5, packs: 60, alerts: 10, jobResultsPerDay: null });
  assert.deepEqual(quotas.scale, { cvs: null, packs: null, alerts: 50, jobResultsPerDay: null });
});

test("the current plan is reported for the signed-in account", async () => {
  const call = await signedIn("billing-current@example.com");
  const plans = await call("GET", "/api/billing/plans");

  assert.equal(plans.json.current, "free");
  assert.ok(plans.json.plans.some((plan) => plan.id === plans.json.current));
});

test("checkout returns 501 when Stripe is not configured", async () => {
  const call = await signedIn("billing-checkout@example.com");

  const checkout = await call("POST", "/api/billing/checkout", { plan: "pro", interval: "month" });
  assert.equal(checkout.status, 501);
  assert.equal(typeof checkout.json.error.code, "string");
  assert.match(checkout.json.error.message, /not configured/i);
  assert.equal(checkout.json.url, undefined, "no checkout URL may be issued while unconfigured");
});

test("the webhook returns 501 when Stripe is not configured", async () => {
  const call = await signedIn("billing-webhook@example.com");

  const webhook = await call("POST", "/api/billing/webhook", { type: "checkout.session.completed" });
  assert.equal(webhook.status, 501);
  assert.equal(typeof webhook.json.error.code, "string");
});
