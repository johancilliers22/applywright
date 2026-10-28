/**
 * Account recovery: change-password, single-use recovery codes (the no-email
 * path), and the operator-issued reset token.
 *
 * The contract this file pins down is as much about what is NOT revealed as what
 * is: a wrong code, a spent code and an address with no account must be
 * indistinguishable, and no response may carry a reset token. Where a behaviour
 * can only be observed on the host — the token ledger the operator prints, or an
 * expiry that has to pass — the test reads the database and the host files the
 * server writes, because that is exactly what the operator does.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { startServer } from "../server/app.js";

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a different horse battery";
const RECOVERY_SHAPE = /^aw-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

let instance;
let base;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "aw-test-recovery-"));
  instance = await startServer({
    dataDir,
    databasePath: join(dataDir, "test.db"),
    PORT: 0,
    MODEL_API_KEY: "",
    JOB_FEED_CACHE_MINUTES: 0,
    // These routes share the auth bucket on purpose; the test drives many of them.
    AUTH_RATE_LIMIT_PER_MINUTE: 500,
    RATE_LIMIT_PER_MINUTE: 500,
  });
  base = instance.url;
});

after(async () => {
  await instance?.close();
});

/** A fetch client with its own cookie jar, so sessions stay separate. */
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

const register = async (call, email, extra = {}) =>
  call("POST", "/api/auth/register", { email, password: PASSWORD, name: "Ada Lovelace", ...extra });

const login = (email, password) => createClient()("POST", "/api/auth/login", { email, password });

const anonymous = () => createClient();

/** The host-side ledger the operator reads with `scripts/reset-password.mjs --pending`. */
async function ledger() {
  const text = await readFile(join(dataDir, "pending-resets.jsonl"), "utf8").catch(() => "");
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function requestReset(email) {
  const response = await anonymous()("POST", "/api/auth/forgot", { email });
  assert.equal(response.status, 200, "asking for a reset always answers 200");
  const rows = (await ledger()).filter((row) => row.email === email.toLowerCase());
  assert.ok(rows.length, `no reset link was recorded on the host for ${email}`);
  return rows.at(-1).token;
}

const userIdByEmail = (email) =>
  instance.db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase())?.id;

const resetRows = (email) =>
  instance.db
    .prepare("SELECT token_hash, created_at, expires_at, used_at FROM password_resets WHERE user_id = ? ORDER BY created_at")
    .all(userIdByEmail(email));

const expireReset = (email) =>
  instance.db
    .prepare("UPDATE password_resets SET expires_at = ? WHERE user_id = ? AND used_at IS NULL")
    .run(new Date(Date.now() - 60_000).toISOString(), userIdByEmail(email));

// ---------------------------------------------------------------- new account

test("registration hands back eight single-use recovery codes and stores only digests", async () => {
  const call = createClient();
  const response = await register(call, "codes@example.com");

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store", "a one-time secret must not be cached");

  const codes = response.json.recoveryCodes;
  assert.ok(Array.isArray(codes), "the register response carries recoveryCodes once");
  assert.equal(codes.length, 8);
  for (const code of codes) assert.match(code, RECOVERY_SHAPE);
  assert.equal(new Set(codes).size, 8, "codes must not repeat");
  // 0/O and 1/I are excluded because these get read off a screen and typed back.
  for (const code of codes) assert.doesNotMatch(code, /[01OI]/, `ambiguous character in ${code}`);

  const stored = instance.db.prepare("SELECT code_hash FROM recovery_codes WHERE user_id = ?").all(response.json.user.id);
  assert.equal(stored.length, 8);
  for (const row of stored) {
    assert.match(row.code_hash, /^[a-f0-9]{64}$/);
    assert.ok(!codes.includes(row.code_hash), "the plaintext code must never be stored");
  }
});

// ------------------------------------------------------------ change-password

test("change-password keeps this session, ends the others, and swaps the password", async () => {
  const call = createClient();
  const created = await register(call, "change@example.com");
  const elsewhere = createClient();
  assert.equal((await elsewhere("POST", "/api/auth/login", { email: "change@example.com", password: PASSWORD })).status, 200);

  const changed = await call("POST", "/api/auth/change-password", {
    currentPassword: PASSWORD,
    newPassword: NEW_PASSWORD,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.json.ok, true);
  assert.equal(changed.json.revokedSessions, 1);

  assert.equal((await call("GET", "/api/auth/me")).status, 200, "the session that changed the password stays signed in");
  assert.equal((await elsewhere("GET", "/api/auth/me")).status, 401, "the other session is revoked");

  assert.equal((await login("change@example.com", PASSWORD)).status, 401, "the old password no longer works");
  const fresh = await login("change@example.com", NEW_PASSWORD);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.json.user.id, created.json.user.id);
});

test("change-password refuses a wrong current password and a short new one", async () => {
  const call = createClient();
  await register(call, "change-refused@example.com");

  const wrong = await call("POST", "/api/auth/change-password", {
    currentPassword: "not the password at all",
    newPassword: NEW_PASSWORD,
  });
  assert.equal(wrong.status, 401);
  assert.match(wrong.json.error.message, /current password/i);

  const weak = await call("POST", "/api/auth/change-password", { currentPassword: PASSWORD, newPassword: "ninechars" });
  assert.equal(weak.status, 400);
  assert.match(weak.json.error.message, /password/i);

  // Nothing changed: the original password still signs in.
  assert.equal((await login("change-refused@example.com", PASSWORD)).status, 200);
  assert.equal((await login("change-refused@example.com", NEW_PASSWORD)).status, 401);
});

// ------------------------------------------------------------- recovery codes

test("a recovery code sets a new password and ends every session", async () => {
  const call = createClient();
  const created = await register(call, "recover@example.com");
  const elsewhere = createClient();
  await elsewhere("POST", "/api/auth/login", { email: "recover@example.com", password: PASSWORD });

  const recovered = await anonymous()("POST", "/api/auth/recover", {
    email: "recover@example.com",
    code: created.json.recoveryCodes[0],
    password: NEW_PASSWORD,
  });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.json.ok, true);

  assert.equal((await call("GET", "/api/auth/me")).status, 401, "recovery revokes the session that created the account");
  assert.equal((await elsewhere("GET", "/api/auth/me")).status, 401);

  assert.equal((await login("recover@example.com", PASSWORD)).status, 401);
  assert.equal((await login("recover@example.com", NEW_PASSWORD)).status, 200);
});

test("a recovery code is single use", async () => {
  const call = createClient();
  const created = await register(call, "single-use@example.com");
  const code = created.json.recoveryCodes[3];

  const first = await anonymous()("POST", "/api/auth/recover", { email: "single-use@example.com", code, password: NEW_PASSWORD });
  assert.equal(first.status, 200);

  const again = await anonymous()("POST", "/api/auth/recover", {
    email: "single-use@example.com",
    code,
    password: "a third horse battery staple",
  });
  assert.equal(again.status, 400);
  assert.equal(again.json.error.code, "invalid_recovery_code");
  // The refused second attempt must not have changed the password the first set.
  assert.equal((await login("single-use@example.com", NEW_PASSWORD)).status, 200);
});

test("a wrong code and an address with no account answer identically", async () => {
  const call = createClient();
  await register(call, "wrong-code@example.com");

  const wrongCode = await anonymous()("POST", "/api/auth/recover", {
    email: "wrong-code@example.com",
    code: "aw-AAAA-AAAA",
    password: NEW_PASSWORD,
  });
  const unknownAddress = await anonymous()("POST", "/api/auth/recover", {
    email: "no-such-account@example.com",
    code: "aw-AAAA-AAAA",
    password: NEW_PASSWORD,
  });

  assert.equal(wrongCode.status, 400);
  assert.equal(unknownAddress.status, 400);
  assert.equal(wrongCode.json.error.code, "invalid_recovery_code");
  assert.deepEqual(wrongCode.json, unknownAddress.json, "the two refusals must be indistinguishable");
  assert.ok(!JSON.stringify(unknownAddress.json).includes("no-such-account@example.com"));
});

test("a password that is too short does not spend the recovery code", async () => {
  const call = createClient();
  const created = await register(call, "retry-code@example.com");
  const code = created.json.recoveryCodes[5];

  const weak = await anonymous()("POST", "/api/auth/recover", { email: "retry-code@example.com", code, password: "short" });
  assert.equal(weak.status, 400);
  assert.match(weak.json.error.message, /password/i);

  const good = await anonymous()("POST", "/api/auth/recover", { email: "retry-code@example.com", code, password: NEW_PASSWORD });
  assert.equal(good.status, 200, "the code is still unused after a rejected password");
});

test("recovery accepts the code as a person types it", async () => {
  const call = createClient();
  const created = await register(call, "typed@example.com");
  const canonical = created.json.recoveryCodes[1];
  const typed = canonical.replace(/-/g, " ").toUpperCase().slice(0, 2) + canonical.slice(2).replace(/-/g, "");

  const recovered = await anonymous()("POST", "/api/auth/recover", {
    email: "TYPED@example.com",
    code: typed,
    password: NEW_PASSWORD,
  });
  assert.equal(recovered.status, 200);
});

// ------------------------------------------------------- forgot (no SMTP here)

test("forgot answers 200 for a known and an unknown address with no difference", async () => {
  const call = createClient();
  await register(call, "forgot-known@example.com");

  const known = await anonymous()("POST", "/api/auth/forgot", { email: "forgot-known@example.com" });
  const unknown = await anonymous()("POST", "/api/auth/forgot", { email: "forgot-nobody@example.com" });

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.json, { ok: true });
  assert.deepEqual(unknown.json, { ok: true });
  assert.ok(!("token" in known.json), "the token is never returned by the API");
  assert.ok(!known.text.includes("forgot-known@example.com"), "the response must not echo the address");
});

test("forgot stores only the token digest and leaves the plaintext on the host alone", async () => {
  const call = createClient();
  const created = await register(call, "digest@example.com");
  const token = await requestReset("digest@example.com");

  assert.match(token, /^[a-f0-9]{64}$/, "a reset token is 32 random bytes in hex");

  const rows = resetRows("digest@example.com");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, createHash("sha256").update(token).digest("hex"));
  assert.notEqual(rows[0].token_hash, token, "the database never holds the usable token");
  assert.equal(rows[0].used_at, null);

  const minutes = (Date.parse(rows[0].expires_at) - Date.now()) / 60_000;
  assert.ok(minutes > 50 && minutes <= 60, `expiry should be about an hour out, not ${minutes} minutes`);

  // The token is on the host ledger, which no route serves.
  const served = await anonymous()("GET", "/pending-resets.jsonl");
  assert.equal(served.status, 404);
  assert.ok(!served.text.includes(token));
  assert.equal(created.status, 201);
});

test("a second reset request withdraws the first link", async () => {
  const call = createClient();
  await register(call, "rotate@example.com");
  const first = await requestReset("rotate@example.com");
  const second = await requestReset("rotate@example.com");
  assert.notEqual(first, second);

  const stale = await anonymous()("POST", "/api/auth/reset", { token: first, password: NEW_PASSWORD });
  assert.equal(stale.status, 400, "an older link must not work once a new one is issued");
  assert.equal(resetRows("rotate@example.com").length, 1);
});

// ------------------------------------------------------------------ reset

test("a reset token sets the password and revokes every session", async () => {
  const call = createClient();
  const created = await register(call, "reset@example.com");
  const elsewhere = createClient();
  await elsewhere("POST", "/api/auth/login", { email: "reset@example.com", password: PASSWORD });

  const token = await requestReset("reset@example.com");
  const reset = await anonymous()("POST", "/api/auth/reset", { token, password: NEW_PASSWORD });
  assert.equal(reset.status, 200);
  assert.equal(reset.json.ok, true);

  assert.equal((await call("GET", "/api/auth/me")).status, 401);
  assert.equal((await elsewhere("GET", "/api/auth/me")).status, 401);
  assert.equal((await login("reset@example.com", PASSWORD)).status, 401);
  const fresh = await login("reset@example.com", NEW_PASSWORD);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.json.user.id, created.json.user.id);

  assert.notEqual(resetRows("reset@example.com")[0].used_at, null, "the token is consumed");
});

test("an expired reset token is refused with a message that says so", async () => {
  const call = createClient();
  await register(call, "expired@example.com");
  const token = await requestReset("expired@example.com");
  expireReset("expired@example.com");

  const reset = await anonymous()("POST", "/api/auth/reset", { token, password: NEW_PASSWORD });
  assert.equal(reset.status, 400);
  assert.equal(reset.json.error.code, "invalid_reset_token");
  assert.match(reset.json.error.message, /expired/i);
  assert.equal((await login("expired@example.com", PASSWORD)).status, 200, "the password is untouched");
});

test("a used reset token is refused with a message that says so", async () => {
  const call = createClient();
  await register(call, "used@example.com");
  const token = await requestReset("used@example.com");

  assert.equal((await anonymous()("POST", "/api/auth/reset", { token, password: NEW_PASSWORD })).status, 200);
  const again = await anonymous()("POST", "/api/auth/reset", { token, password: "yet another horse battery" });
  assert.equal(again.status, 400);
  assert.equal(again.json.error.code, "invalid_reset_token");
  assert.match(again.json.error.message, /already been used/i);
});

test("an unknown reset token is refused", async () => {
  const reset = await anonymous()("POST", "/api/auth/reset", { token: "f".repeat(64), password: NEW_PASSWORD });
  assert.equal(reset.status, 400);
  assert.equal(reset.json.error.code, "invalid_reset_token");
  assert.match(reset.json.error.message, /not valid/i);
});

// --------------------------------------------------------------- username

test("forgot-username answers 200 without returning the address", async () => {
  const call = createClient();
  await register(call, "username@example.com");

  const known = await anonymous()("POST", "/api/auth/forgot-username", { email: "username@example.com" });
  const unknown = await anonymous()("POST", "/api/auth/forgot-username", { email: "username-nobody@example.com" });

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.json, { ok: true });
  assert.deepEqual(known.json, unknown.json);
  assert.ok(!JSON.stringify(known.json).includes("username@example.com"), "the username must not be returned");

  // "The operator has been notified" has to mean something on a host with no SMTP:
  // the request is recorded where only the operator can read it.
  const log = await readFile(join(dataDir, "recovery-requests.jsonl"), "utf8");
  const lines = log
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  assert.ok(
    lines.some((row) => row.kind === "forgot-username" && row.email === "username@example.com"),
    "a username request is recorded for the operator"
  );
  assert.ok(
    lines.some((row) => row.kind === "forgot-username" && row.email === "username-nobody@example.com" && row.account === false),
    "an unknown address is recorded too, so the log is not an oracle the operator is missing"
  );
});
