/**
 * HTTP contract, part 1: authentication (SPEC section 6).
 *
 * The SPEC fixes the cookie name and flags, the 30-day lifetime, login, logout
 * and the `me` payload. It does not name error codes, so codes are checked for
 * presence; status codes come from the SPEC and from the brief.
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
  const dir = await mkdtemp(join(tmpdir(), "aw-test-auth-"));
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

const sessionCookie = (response) =>
  response.headers.getSetCookie().find((value) => value.startsWith("aw_session="));

const register = (call, email, extra = {}) =>
  call("POST", "/api/auth/register", { email, password: PASSWORD, name: "Ada Lovelace", ...extra });

test("register returns 201, the user and the 30-day aw_session cookie", async () => {
  const call = createClient();
  const response = await register(call, "Ada@Example.com");

  assert.equal(response.status, 201);
  assert.equal(response.json.user.email.toLowerCase(), "ada@example.com");
  assert.equal(response.json.user.name, "Ada Lovelace");
  assert.equal(response.json.user.plan, "free");
  assert.equal(response.json.user.pass_hash, undefined, "the password hash never leaves the server");
  assert.equal(response.json.user.pass_salt, undefined);

  const cookie = sessionCookie(response);
  assert.ok(cookie, "register must set the aw_session cookie");
  // The cookie name is fixed by the SPEC; its opaque value format is not.
  assert.match(cookie, /^aw_session=[^;\s]+;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=2592000/); // 30 days, per SPEC section 6

  const me = await call("GET", "/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.json.user.id, response.json.user.id);
  assert.equal(me.json.plan, "free");
  assert.equal(typeof me.json.usage, "object");
  assert.notEqual(me.json.usage, null);
});

test("a duplicate email is refused with 409", async () => {
  const call = createClient();
  assert.equal((await register(call, "dup@example.com")).status, 201);

  const again = await register(call, "dup@example.com");
  assert.equal(again.status, 409);
  assert.equal(typeof again.json.error.code, "string");
  assert.equal(typeof again.json.error.message, "string");
  assert.equal(again.json.user, undefined, "a refused registration must not return a user");
});

test("a password shorter than the minimum is refused with 400", async () => {
  const call = createClient();
  const response = await register(call, "short@example.com", { password: "ninechars" });
  assert.equal(response.status, 400);
  assert.equal(typeof response.json.error.code, "string");
  assert.match(response.json.error.message, /password/i);
});

test("login succeeds with the right password and starts a fresh session", async () => {
  const call = createClient();
  const created = await register(call, "login@example.com");

  const fresh = createClient();
  const login = await fresh("POST", "/api/auth/login", { email: "login@example.com", password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.id, created.json.user.id);
  assert.match(sessionCookie(login) ?? "", /HttpOnly/);

  const me = await fresh("GET", "/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.json.user.id, created.json.user.id);
});

test("login refuses a wrong password and an unknown email with 401", async () => {
  const call = createClient();
  await register(call, "bad-login@example.com");

  const wrong = await call("POST", "/api/auth/login", { email: "bad-login@example.com", password: "not the password" });
  assert.equal(wrong.status, 401);
  assert.equal(typeof wrong.json.error.code, "string");

  const unknown = await call("POST", "/api/auth/login", { email: "nobody@example.com", password: PASSWORD });
  assert.equal(unknown.status, 401);
  assert.equal(typeof unknown.json.error.code, "string");

  // Neither refusal may disclose whether the address exists.
  assert.equal(wrong.json.error.code, unknown.json.error.code);
  assert.equal(wrong.json.error.message, unknown.json.error.message);
  assert.ok(!JSON.stringify(unknown.json).includes("nobody@example.com"));
});

test("logout clears the cookie and ends the session", async () => {
  const call = createClient();
  await register(call, "logout@example.com");
  assert.equal((await call("GET", "/api/auth/me")).status, 200);

  const logout = await call("POST", "/api/auth/logout", {});
  assert.equal(logout.status, 200);
  assert.equal(logout.json.ok, true);

  const cleared = sessionCookie(logout);
  assert.ok(cleared, "logout must set a clearing aw_session cookie");
  assert.match(cleared, /Max-Age=0/);

  assert.equal((await call("GET", "/api/auth/me")).status, 401);
});

test("me needs a session", async () => {
  const anonymous = createClient();
  const me = await anonymous("GET", "/api/auth/me");
  assert.equal(me.status, 401);
  assert.equal(typeof me.json.error.code, "string");
  assert.equal(typeof me.json.error.message, "string");
});

test("email casing neither creates a second account nor blocks sign-in", async () => {
  const call = createClient();
  const first = await register(call, "Grace@Example.com", { name: "Grace Hopper" });
  assert.equal(first.status, 201);

  // SPEC section 3 makes the email UNIQUE; two spellings of one address must not
  // become two accounts, or an attacker can register around an existing user.
  const duplicate = await register(call, "grace@EXAMPLE.com");
  assert.equal(duplicate.status, 409);

  const fresh = createClient();
  const login = await fresh("POST", "/api/auth/login", { email: "GRACE@example.COM", password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.id, first.json.user.id);
});
