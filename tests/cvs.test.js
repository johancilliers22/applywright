/**
 * HTTP contract, part 2: the CV library (SPEC section 6) and the free-plan CV
 * quota (SPEC section 2).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { startServer } from "../server/app.js";

const PASSWORD = "correct horse battery staple";

const CV_TEXT = [
  "Ada Lovelace",
  "ada@example.com",
  "+44 7700 900456",
  "London, UK",
  "",
  "Summary",
  "Analytical engine programmer with ten years of mathematical practice and a published",
  "algorithm to her name. Writes precise notation and explains it to non-specialists.",
  "",
  "Experience",
  "- Wrote the first published algorithm for the analytical engine, 1843.",
  "- Documented seven instruction sequences for computing Bernoulli numbers.",
  "- Corresponded with Charles Babbage on engine design, notation and scheduling.",
  "",
  "Education",
  "Mathematics, private tuition, 1840-1843.",
  "",
  "Skills",
  "Mathematics, algorithms, notation, technical writing, proofreading.",
].join("\n");

let instance;
let base;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-test-cvs-"));
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

/** Register a throwaway account and hand back its client. */
async function signedIn(email) {
  const call = createClient();
  const response = await call("POST", "/api/auth/register", { email, password: PASSWORD, name: "Test User" });
  assert.equal(response.status, 201, `registration failed for ${email}`);
  return call;
}

test("a CV created from pasted text is stored as text and becomes the primary CV", async () => {
  const call = await signedIn("cv-create@example.com");

  const created = await call("POST", "/api/cvs", { text: CV_TEXT });
  assert.equal(created.status, 201);
  assert.equal(typeof created.json.cv.id, "string");
  assert.equal(created.json.cv.format, "txt");
  assert.equal(typeof created.json.cv.name, "string");
  assert.ok(created.json.cv.name.length > 0);
  assert.equal(created.json.cv.primary, true, "the first CV is the primary one");

  const detail = await call("GET", `/api/cvs/${created.json.cv.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.cv.text, CV_TEXT, "CV text is stored and returned as text");
});

test("unreadable uploaded content is refused with 422", async () => {
  const call = await signedIn("cv-unreadable@example.com");

  // A .docx that is not a zip: the extractor finds no readable text.
  const binary = Buffer.from(Array.from({ length: 256 }, (_, index) => index)).toString("base64");
  const response = await call("POST", "/api/cvs", { filename: "cv.docx", contentBase64: binary });

  assert.equal(response.status, 422);
  assert.equal(typeof response.json.error.code, "string");
  assert.match(response.json.error.message, /no text could be read/i);
});

test("a second CV on the free plan is refused with 402 quota_exceeded", async () => {
  const call = await signedIn("cv-quota@example.com");
  assert.equal((await call("POST", "/api/cvs", { text: CV_TEXT })).status, 201);

  const second = await call("POST", "/api/cvs", { text: CV_TEXT });
  assert.equal(second.status, 402);
  assert.equal(second.json.error.code, "quota_exceeded");
});

test("the list returns the caller's CVs with their metadata", async () => {
  const call = await signedIn("cv-list@example.com");
  const created = await call("POST", "/api/cvs", { name: "Platform CV", text: CV_TEXT });

  const listed = await call("GET", "/api/cvs");
  assert.equal(listed.status, 200);
  assert.equal(listed.json.cvs.length, 1);
  const [entry] = listed.json.cvs;
  assert.equal(entry.id, created.json.cv.id);
  assert.equal(entry.name, "Platform CV");
  assert.equal(entry.format, "txt");
  assert.equal(entry.primary, true);
});

test("a CV can be renamed and made primary", async () => {
  const call = await signedIn("cv-patch@example.com");
  const created = await call("POST", "/api/cvs", { name: "Old name", text: CV_TEXT });

  const patched = await call("PATCH", `/api/cvs/${created.json.cv.id}`, { name: "New name", primary: true });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.cv.id, created.json.cv.id);
  assert.equal(patched.json.cv.name, "New name");
  assert.equal(patched.json.cv.primary, true);

  const detail = await call("GET", `/api/cvs/${created.json.cv.id}`);
  assert.equal(detail.json.cv.name, "New name");
  assert.equal(detail.json.cv.primary, true);
});

test("a CV can be deleted and then no longer exists", async () => {
  const call = await signedIn("cv-delete@example.com");
  const created = await call("POST", "/api/cvs", { text: CV_TEXT });

  const deleted = await call("DELETE", `/api/cvs/${created.json.cv.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.deleted, true);

  assert.equal((await call("GET", `/api/cvs/${created.json.cv.id}`)).status, 404);
  const listed = await call("GET", "/api/cvs");
  assert.equal(listed.json.cvs.length, 0);
});

test("another user's CV id is 404 for read, patch and delete", async () => {
  const owner = await signedIn("cv-owner@example.com");
  const stranger = await signedIn("cv-stranger@example.com");
  const created = await owner("POST", "/api/cvs", { text: CV_TEXT });
  const cvId = created.json.cv.id;

  assert.equal((await stranger("GET", `/api/cvs/${cvId}`)).status, 404);
  assert.equal((await stranger("PATCH", `/api/cvs/${cvId}`, { name: "Stolen" })).status, 404);
  assert.equal((await stranger("DELETE", `/api/cvs/${cvId}`)).status, 404);

  // The owner's CV survives the attempts.
  const detail = await owner("GET", `/api/cvs/${cvId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.cv.name, created.json.cv.name);
});
