/**
 * HTTP contract, part 6: notifications and the RSS feed (SPEC section 6).
 *
 * SPEC section 6 says `GET /feed/:token.rss` serves RSS 2.0 but does not say
 * where the token comes from; it is issued in the notifications payload. The
 * feed is fetched without a session, as an RSS reader would.
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
  const dir = await mkdtemp(join(tmpdir(), "aw-test-notifications-"));
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

test("a new account has no notifications and is told its feed token", async () => {
  const call = await signedIn("notifications-empty@example.com");

  const listed = await call("GET", "/api/notifications");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.json.notifications, []);
  assert.equal(listed.json.unread, 0);

  // The token is the only published way to reach /feed/:token.rss.
  assert.equal(typeof listed.json.feedToken, "string");
  assert.ok(listed.json.feedToken.length >= 16);
});

test("marking an unknown notification as read is 404", async () => {
  const call = await signedIn("notifications-unknown@example.com");

  const response = await call("POST", "/api/notifications/n_does_not_exist/read", {});
  assert.equal(response.status, 404);
  assert.equal(typeof response.json.error.code, "string");
  assert.equal(typeof response.json.error.message, "string");
});

test("the feed serves RSS 2.0 for a valid token without a session", async () => {
  const call = await signedIn("feed-valid@example.com");
  const listed = await call("GET", "/api/notifications");
  const token = listed.json.feedToken;

  // No cookie: an RSS reader holds the token, not a session.
  const feed = await fetch(`${base}/feed/${token}.rss`);
  const body = await feed.text();

  assert.equal(feed.status, 200);
  assert.match(feed.headers.get("content-type") ?? "", /^application\/rss\+xml/);
  assert.match(body, /^<\?xml version="1.0" encoding="utf-8"\?>/);
  assert.match(body, /<rss version="2.0">/);
  assert.match(body, /<channel>/);
  assert.match(body, /<title>Applywright job alerts<\/title>/);
});

test("the feed refuses an unknown token with 404", async () => {
  const response = await fetch(`${base}/feed/not-a-real-token.rss`);
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(typeof body.error.code, "string");
  assert.equal(typeof body.error.message, "string");
});

test("one account's token does not open another account's feed", async () => {
  const caller = await signedIn("feed-owner@example.com");
  const listed = await caller("GET", "/api/notifications");
  const token = listed.json.feedToken;

  const wrongSuffix = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
  const response = await fetch(`${base}/feed/${wrongSuffix}.rss`);
  assert.equal(response.status, 404);
});
