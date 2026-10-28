/**
 * Spine tests: database schema, store queries and password/session handling,
 * with no HTTP layer involved. Fast, isolated, in-memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { openDatabase, SCHEMA_VERSION } from "../server/db.js";
import { createStore } from "../server/store.js";
import { hashPassword, publicUser, verifyPassword } from "../server/auth.js";

function fixture() {
  const db = openDatabase(":memory:");
  const store = createStore(db);
  const { hash, salt } = hashPassword("correct horse battery staple");
  const user = store.createUser({ email: "Ada@Example.com", passwordHash: hash, passwordSalt: salt, name: "Ada" });
  return { db, store, user, hash, salt };
}

test("schema reports its version", () => {
  const db = openDatabase(":memory:");
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
  assert.equal(Number(row.value), SCHEMA_VERSION);
  db.close();
});

test("passwords hash, verify and reject", () => {
  const { hash, salt } = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("correct horse battery staple", hash, salt), true);
  assert.equal(verifyPassword("wrong password entirely", hash, salt), false);
  assert.equal(verifyPassword("", hash, salt), false);
  assert.notEqual(hash, "correct horse battery staple");
});

test("users are stored case-insensitively and never expose the hash", () => {
  const { store, user } = fixture();
  assert.equal(user.email, "ada@example.com");
  assert.equal(store.userByEmail("ADA@example.com").id, user.id);
  assert.equal(publicUser(user).pass_hash, undefined);
  assert.equal(publicUser(user).pass_salt, undefined);
});

test("sessions authenticate, expire and delete", () => {
  const { store, user } = fixture();
  const session = store.createSession({ userId: user.id, userAgent: "test", ip: "127.0.0.1" });
  assert.equal(store.sessionUser(session.id).id, user.id);
  assert.equal(store.sessionUser("not-a-session"), null);

  const expired = store.createSession({ userId: user.id, days: -1 });
  assert.equal(store.sessionUser(expired.id), null);

  store.deleteSession(session.id);
  assert.equal(store.sessionUser(session.id), null);
});

test("a user owns cvs, applications, alerts, notifications and usage", () => {
  const { store, user } = fixture();
  const cv = store.createCv({ userId: user.id, name: "CV", format: "txt", text: "x".repeat(200), profile: { contact: {} }, primary: true });
  assert.equal(cv.primary_flag, 1);
  assert.equal(store.countCvs(user.id), 1);

  const application = store.createApplication({
    userId: user.id,
    cvId: cv.id,
    title: "Platform Engineer",
    company: "Acme",
    status: "pack_ready",
    score: 72,
    pack: { cvHtml: "<html></html>" },
  });
  const submitted = store.updateApplication(application.id, user.id, { status: "submitted" });
  assert.equal(submitted.status, "submitted");
  assert.ok(submitted.applied_at, "submitting records applied_at");

  const alert = store.createAlert({ userId: user.id, name: "Backend", keywords: "node", remoteOnly: true });
  assert.equal(alert.remote_only, 1);

  const notification = store.createNotification({ userId: user.id, alertId: alert.id, title: "New role" });
  assert.equal(store.countUnread(user.id), 1);
  assert.equal(store.markNotificationRead(notification, user.id), true);
  assert.equal(store.countUnread(user.id), 0);

  store.recordUsage(user.id, "pack", 2);
  assert.equal(store.countUsage(user.id, "pack", new Date(Date.now() - 86_400_000).toISOString()), 2);
});

test("jobs dedupe on the hash and search filters work", () => {
  const { store } = fixture();
  const jobId = store.upsertJob({
    source: "arbeitnow",
    title: "Senior Backend Engineer",
    company: "Acme",
    location: "London",
    remote: true,
    dedupe_hash: "hash-1",
    tags: ["node"],
  });
  const again = store.upsertJob({ source: "remotive", title: "Senior Backend Engineer", company: "Acme", location: "London", dedupe_hash: "hash-1" });
  assert.equal(again, jobId);
  assert.equal(store.countJobs(), 1);
  assert.equal(store.searchJobs({ query: "backend" }).length, 1);
  assert.equal(store.searchJobs({ query: "zzz" }).length, 0);
  assert.equal(store.searchJobs({ remoteOnly: true }).length, 1);
});

test("one user cannot read another user's rows", () => {
  const { db, store, user } = fixture();
  const { hash, salt } = hashPassword("another good password");
  const other = store.createUser({ email: "grace@example.com", passwordHash: hash, passwordSalt: salt });
  const cv = store.createCv({ userId: user.id, name: "Private", format: "txt", text: "x".repeat(200) });

  assert.equal(store.cvById(cv.id, other.id), null);
  assert.equal(store.listCvs(other.id).length, 0);
  assert.equal(store.deleteCv(cv.id, other.id), false);
  assert.ok(store.cvById(cv.id, user.id));

  const rows = db.prepare("SELECT COUNT(*) AS n FROM cvs WHERE user_id = ?").get(other.id);
  assert.equal(rows.n, 0);
});

test("export covers everything and delete cascades", () => {
  const { store, user } = fixture();
  const cv = store.createCv({ userId: user.id, name: "CV", format: "txt", text: "x".repeat(200) });
  store.createApplication({ userId: user.id, cvId: cv.id, title: "Role", status: "pack_ready", pack: {} });
  store.createAlert({ userId: user.id, name: "A", keywords: "node" });

  const exported = store.exportUser(user.id);
  assert.equal(exported.cvs.length, 1);
  assert.equal(exported.applications.length, 1);
  assert.equal(exported.alerts.length, 1);
  assert.ok(exported.exportedAt);

  store.deleteUser(user.id);
  assert.equal(store.userById(user.id), null);
  assert.equal(store.listCvs(user.id).length, 0);
  assert.equal(store.listApplications(user.id).length, 0);
});
