/**
 * Two integrity gaps, held shut by tests.
 *
 * 1. Plan flags the pricing page sells. Three capability flags are left, and all
 *    three are enforced: `fullAtsReport` and `packHistory` gate real behaviour
 *    (Free sees less of the report, and less of its pack history) and
 *    `coverLetter` was already gated. Four were withdrawn rather than sold —
 *    `dailyDigest` (nothing delivered a digest), `apiAccess` (no key
 *    authentication exists), `priorityRefresh` (no refresh queue) and
 *    `bulkExport` (`GET /api/export` is open to every plan as data portability).
 *    The copy test below fails if the page and `plans.js` stop agreeing, and the
 *    behaviour tests prove the enforced flags are real gates rather than
 *    declarations.
 *
 * 2. Stripe webhook deliveries. The signature is checked against the raw bytes,
 *    the event id is recorded before anything is applied, and an event for a
 *    subscription period older than the account already records is ignored.
 *
 * Stripe is given placeholder secrets on this instance so the webhook route is
 * reachable: it verifies an HMAC locally and never calls Stripe. Nothing here
 * reaches the network, and checkout/portal — the two routes that would — are not
 * exercised; their 501-when-unconfigured behaviour is covered in
 * `billing.test.js`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { startServer } from "../server/app.js";
import { SCHEMA_VERSION, migrate } from "../server/db.js";
import { ENFORCED_FLAGS, FLAG_FEATURES, PLANS } from "../server/lib/billing/plans.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASSWORD = "correct horse battery staple";
// Placeholders, not credentials: the verifier only HMACs with these strings.
const WEBHOOK_SECRET = "test-only-webhook-secret";
const STRIPE_SECRET = "test-only-stripe-secret";

const JOB_TEXT = [
  "Senior Backend Engineer",
  "",
  "We are hiring a senior backend engineer to own our Node.js payment platform.",
  "You will design REST APIs, work with PostgreSQL and TypeScript, run services on",
  "Kubernetes and AWS, and improve reliability through observability with OpenTelemetry.",
  "You will build CI/CD pipelines, write Jest tests, and use Redis and Kafka for event",
  "driven work. Experience with GraphQL and Terraform is welcome. You will mentor",
  "engineers and lead delivery of payment services. Salary GBP 65000 to 80000.",
].join("\n");

const STRONG_CV = [
  "Grace Hopper",
  "grace.hopper@example.com",
  "+44 7700 900123",
  "London, UK",
  "",
  "Summary",
  "Senior backend engineer with 9 years building Node.js services and PostgreSQL data",
  "platforms. I own reliability, observability and delivery.",
  "",
  "Experience",
  "Staff Platform Engineer, Northwind Systems, 2021-2026",
  "- Built a Node.js payments service handling 4 million requests per day, cutting p99 latency from 850ms to 120ms.",
  "- Led migration of 42 services to PostgreSQL 16 with zero downtime across 3 regions.",
  "- Introduced OpenTelemetry tracing and SLO dashboards, reducing incident mean time to repair by 46%.",
  "- Mentored 6 engineers and ran the hiring loop for backend and platform roles.",
  "",
  "Backend Engineer, Contoso Cloud, 2016-2021",
  "- Designed a TypeScript job scheduler processing 120,000 tasks per hour on Kubernetes.",
  "- Cut AWS spend by 31% by right-sizing 60 ECS services and adding spot capacity.",
  "- Wrote the Node.js REST API contract used by 9 product teams.",
  "",
  "Education",
  "BSc Computer Science, University of Manchester, 2012-2015",
  "",
  "Skills",
  "Node.js, TypeScript, PostgreSQL, SQL, Docker, Kubernetes, AWS, Terraform, REST APIs,",
  "GraphQL, Redis, Kafka, CI/CD, OpenTelemetry, Jest, Git",
].join("\n");

/** Scores badly on purpose: eight findings and six pieces of advice. */
const WEAK_CV = [
  "Curriculum Vitae",
  "",
  "I am a hard working person who enjoys working with computers and helping people.",
  "I have done various jobs over the years and I learn quickly. I get on well with",
  "colleagues and I am reliable and punctual.",
  "",
  "Experience",
  "Various roles in offices and shops. I answered phones, filed paperwork and served",
  "customers.",
  "",
  "Education",
  "School.",
  "",
  "Skills",
  "Computing, communication.",
].join("\n");

let instance;
let base;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), "aw-test-flags-"));
  instance = await startServer({
    dataDir: dir,
    databasePath: join(dir, "test.db"),
    PORT: 0,
    MODEL_API_KEY: "",
    JOB_FEED_CACHE_MINUTES: 0,
    AUTH_RATE_LIMIT_PER_MINUTE: 100,
    RATE_LIMIT_PER_MINUTE: 2_000,
    STRIPE_SECRET_KEY: STRIPE_SECRET,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  });
  base = instance.url;
});

after(async () => {
  await instance?.close();
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** Register a throwaway account, store one CV, and hand back its id. */
async function userWithCv(email, cvText) {
  const call = createClient();
  const registered = await call("POST", "/api/auth/register", { email, password: PASSWORD, name: "Test User" });
  assert.equal(registered.status, 201);
  const me = await call("GET", "/api/auth/me");
  const created = await call("POST", "/api/cvs", { text: cvText });
  assert.equal(created.status, 201);
  return { call, userId: me.json.user.id, cvId: created.json.cv.id };
}

/** `t=…,v1=…` for one exact payload string, as Stripe signs it. */
function signatureFor(payload, { secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

/** POST a webhook body verbatim — the bytes are what the signature covers. */
async function postWebhook(payload, options = {}) {
  const response = await fetch(`${base}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signatureFor(payload, options) },
    body: payload,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

const eventPayload = (event) => JSON.stringify(event, null, 2);
const secondsFromNow = (days) => Math.floor(Date.now() / 1000) + days * 86_400;

// ------------------------------------------------------------ gap 1: reports

test("the free ATS report stops at the score, subscores and three findings", async () => {
  const { call, cvId } = await userWithCv("flag-report-free@example.com", WEAK_CV);

  const analysed = await call("POST", "/api/analyse", { cvId, jobText: JOB_TEXT });
  assert.equal(analysed.status, 200);

  const report = analysed.json.report;
  assert.ok(Number.isInteger(report.score));
  assert.deepEqual(Object.keys(report.subscores).sort(), [
    "achievements",
    "formatting",
    "keywords",
    "readability",
    "structure",
  ]);

  // fullAtsReport: Free keeps the three highest-priority findings.
  assert.equal(report.findings.length, 3, "a free report shows exactly the top three findings");
  assert.ok(report.fullAtsReport.totalFindings > 3, "the fixture must have more findings than the free ceiling");
  assert.equal(report.fullAtsReport.shownFindings, 3);
  assert.equal(report.fullAtsReport.included, false);
  assert.match(report.fullAtsReport.locked, /part of Pro/);

  // Advice is part of the same flag, and the shape does not change with the plan.
  assert.deepEqual(report.advice, [], "the advice array is not included on Free");
  assert.match(analysed.json.advisory, /part of Pro/, "the response says why the report stops");
});

test("a paid plan gets the full findings list and the advice array", async () => {
  const { call, userId, cvId } = await userWithCv("flag-report-pro@example.com", WEAK_CV);
  instance.store.updateUserPlan(userId, "pro", new Date(secondsFromNow(30) * 1000).toISOString());

  const analysed = await call("POST", "/api/analyse", { cvId, jobText: JOB_TEXT });
  assert.equal(analysed.status, 200);

  const report = analysed.json.report;
  assert.equal(report.findings.length, report.fullAtsReport.totalFindings);
  assert.ok(report.findings.length > 3, "the whole list, not the free ceiling");
  assert.equal(report.fullAtsReport.included, true);
  assert.ok(report.advice.length > 0, "a paid report carries the advice array");
  assert.doesNotMatch(analysed.json.advisory, /part of Pro/);
});

// ------------------------------------------------------ gap 1: pack history

test("a Free tailor response carries no covering letter anywhere", async () => {
  const { call, cvId } = await userWithCv("flag-letter-free@example.com", STRONG_CV);

  const tailored = await call("POST", "/api/tailor", { cvId, jobText: JOB_TEXT, title: "Backend role" });
  assert.equal(tailored.status, 201);
  assert.equal(tailored.json.pack.coverLetter, "", "the tailor response must not carry the letter");
  assert.match(tailored.json.pack.coverLetterLocked, /part of Pro/);

  // The stored pack is the other place the letter could hide: `coverLetterMd` is
  // blank, and so is the tailored source a later refine would rewrite from.
  const detail = await call("GET", `/api/applications/${tailored.json.application.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.application.pack.coverLetterMd, "");
  assert.equal(detail.json.application.pack.tailored.coverLetter, "", "the tailored source is gated with the pack");
});

test("a downgraded account keeps only its most recent pack's covering letter", async () => {
  const { call, userId, cvId } = await userWithCv("flag-history@example.com", STRONG_CV);
  instance.store.updateUserPlan(userId, "pro", new Date(secondsFromNow(30) * 1000).toISOString());

  const first = await call("POST", "/api/tailor", { cvId, jobText: JOB_TEXT, title: "Role one" });
  assert.equal(first.status, 201);
  // created_at is stamped in milliseconds: two packs must not tie, or "most
  // recent" would be ambiguous.
  await delay(15);
  const second = await call("POST", "/api/tailor", { cvId, jobText: JOB_TEXT, title: "Role two" });
  assert.equal(second.status, 201);

  const olderId = first.json.application.id;
  const newestId = second.json.application.id;

  // On Pro, history is whole: both packs carry their letter.
  for (const id of [olderId, newestId]) {
    const detail = await call("GET", `/api/applications/${id}`);
    assert.equal(detail.status, 200);
    assert.ok(detail.json.application.pack.coverLetterMd.length > 0, `pro pack ${id} must carry its letter`);
  }

  instance.store.updateUserPlan(userId, "free", null);

  // On Free, only the most recent pack's letter is readable.
  const newest = await call("GET", `/api/applications/${newestId}`);
  assert.equal(newest.status, 200);
  assert.ok(newest.json.application.pack.coverLetterMd.length > 0, "the most recent pack stays open");
  assert.equal(newest.json.application.pack.packHistoryLocked, undefined);

  const older = await call("GET", `/api/applications/${olderId}`);
  assert.equal(older.status, 200);
  assert.equal(older.json.application.pack.coverLetterMd, "", "an older letter must not leak to Free");
  assert.match(older.json.application.pack.packHistoryLocked, /part of Pro/);
  assert.equal(typeof older.json.application.pack.coverLetterLocked, "string");
  assert.equal(older.json.application.pack.tailored.coverLetter, "", "the tailored source is gated with the pack");

  // History is the flag: the rest of the older pack is still the user's.
  assert.ok(older.json.application.pack.cvTextPlain.length > 0, "the pack's CV stays readable");
  assert.ok(older.json.application.pack.answers.length > 0, "screening answers stay readable");

  // Refining the older pack must not become the way back to its letter: the
  // response and the stored refinement trail carry no letter text either.
  const refined = await call("POST", `/api/applications/${olderId}/refine`, { instruction: "shorten the summary" });
  assert.equal(refined.status, 200);
  assert.equal(refined.json.refined.coverLetter ?? "", "", "the refine response must not carry the letter");
  for (const change of refined.json.changes ?? []) {
    assert.ok(!["letter", "coverLetter"].includes(change.field), "a refinement must not report a change to the letter");
  }

  const afterRefine = await call("GET", `/api/applications/${olderId}`);
  assert.equal(afterRefine.json.application.pack.coverLetterMd, "");
  assert.equal(afterRefine.json.application.pack.tailored.coverLetter, "");
});

// ------------------------------------------------ gap 1: copy agrees with code

test("the pricing page sells exactly the flags the server enforces", async () => {
  const page = await readFile(join(ROOT, "public", "pricing.html"), "utf8");

  assert.deepEqual([...ENFORCED_FLAGS], ["fullAtsReport", "coverLetter", "packHistory"]);
  for (const flag of ENFORCED_FLAGS) {
    assert.ok(FLAG_FEATURES.includes(flag), `${flag} is enforced, so it must be a declared flag`);
    assert.ok(PLANS.pro.flags.includes(flag), `Pro must carry ${flag}`);
    assert.ok(PLANS.scale.flags.includes(flag), `Scale must carry ${flag}`);
    assert.equal(PLANS.free.flags.includes(flag), false, `Free must not carry ${flag}`);
  }

  // Nothing declared may be unenforced, and nothing withdrawn may be granted.
  // Four flags were removed from the product rather than sold; the assertion is on
  // the inventory the API publishes, not on the source text — plans.js names them
  // once, to record why they were withdrawn.
  assert.deepEqual([...FLAG_FEATURES].sort(), [...ENFORCED_FLAGS].sort(), "every declared flag must be enforced");
  for (const withdrawn of ["dailyDigest", "apiAccess", "priorityRefresh", "bulkExport"]) {
    assert.equal(FLAG_FEATURES.includes(withdrawn), false, `${withdrawn} must not be a declared flag`);
    for (const id of ["free", "pro", "scale"]) {
      assert.equal(PLANS[id].flags.includes(withdrawn), false, `${id} must not carry ${withdrawn}`);
      assert.equal(PLANS[id].features.includes(withdrawn), false, `${id} must not list ${withdrawn}`);
    }
  }

  // What the page says for each flag, so copy drift is a failing assertion rather
  // than something a reviewer has to notice. The withdrawn entries are kept on
  // purpose: each one asserts the page has stopped selling it.
  const SOLD_AS = {
    fullAtsReport: /Full ATS report/i,
    coverLetter: /Covering letter/i,
    packHistory: /Pack history/i,
    dailyDigest: /daily digest/i,
    apiAccess: /API access/i,
    priorityRefresh: /Priority refresh/i,
    bulkExport: /Export everything/i,
  };

  // The page must promise what the server actually enforces...
  for (const flag of ENFORCED_FLAGS) {
    assert.match(page, SOLD_AS[flag], `pricing.html must sell ${flag}, which the server enforces`);
  }
  // ...and it must not sell a flag the server does not declare. This is the
  // other direction of the same integrity check: apiAccess and priorityRefresh
  // were withdrawn from the page, and bulkExport went with them because
  // /api/export is data portability, open to every plan.
  for (const [flag, pattern] of Object.entries(SOLD_AS)) {
    if (FLAG_FEATURES.includes(flag)) continue;
    assert.doesNotMatch(page, pattern, `${flag} is not a declared plan flag, so pricing.html must not sell it`);
  }
  // The Free column must say where the report stops, in the same words as the gate.
  assert.match(page, /top three findings/i);
  assert.match(page, /Most recent pack only/i);
});

// --------------------------------------------------- gap 2: webhook identity

test("the stripe_events migration is idempotent and records the schema version", () => {
  migrate(instance.db);
  migrate(instance.db);

  const version = instance.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
  assert.equal(version.value, String(SCHEMA_VERSION));

  const columns = instance.db
    .prepare("PRAGMA table_info(stripe_events)")
    .all()
    .map((row) => row.name);
  assert.deepEqual(columns, ["id", "type", "received_at"]);
});

test("a redelivered webhook is answered as a duplicate and changes nothing", async () => {
  const { call, userId } = await userWithCv("webhook-replay@example.com", STRONG_CV);
  const periodEnd = secondsFromNow(30);
  const event = {
    id: "evt_replay_1",
    type: "checkout.session.completed",
    data: { object: { metadata: { userId, plan: "pro" }, client_reference_id: userId, customer: "cus_replay", current_period_end: periodEnd } },
  };

  const first = await postWebhook(eventPayload(event));
  assert.equal(first.status, 200);
  assert.equal(first.json.received, true);
  assert.equal(first.json.duplicate, false);
  assert.equal(first.json.changed, true);

  let me = await call("GET", "/api/auth/me");
  assert.equal(me.json.user.plan, "pro");
  const renewsAt = me.json.user.planRenewsAt;
  assert.equal(renewsAt, new Date(periodEnd * 1000).toISOString());

  // The same event id with a payload that would otherwise upgrade the account.
  // The id decides, so nothing is applied a second time.
  const replay = {
    id: "evt_replay_1",
    type: "customer.subscription.updated",
    data: { object: { metadata: { userId, plan: "scale" }, current_period_end: secondsFromNow(60) } },
  };
  const second = await postWebhook(eventPayload(replay));
  assert.equal(second.status, 200);
  assert.deepEqual(second.json, { received: true, duplicate: true });

  me = await call("GET", "/api/auth/me");
  assert.equal(me.json.user.plan, "pro", "a replay must not change the plan");
  assert.equal(me.json.user.planRenewsAt, renewsAt, "a replay must not touch the period");

  const rows = instance.db.prepare("SELECT id, type FROM stripe_events WHERE id = ?").all("evt_replay_1");
  assert.equal(rows.length, 1, "one delivery, one row");
  assert.equal(rows[0].type, "checkout.session.completed", "the replay must not rewrite the recorded type");
});

test("the webhook verifies the raw body, not a re-serialised one", async () => {
  const { call, userId } = await userWithCv("webhook-raw@example.com", STRONG_CV);
  const periodEnd = secondsFromNow(10);

  // Deliberately awkward whitespace and key order: no JSON.parse →
  // JSON.stringify round trip reproduces these bytes, so a server that parsed
  // and re-stringified the body could not verify the signature.
  const payload = `{
  "type"   : "customer.subscription.updated",
  "id"     : "evt_raw_bytes_1",
  "data"   : {
    "object" : {
      "metadata" : { "plan" : "scale", "userId" : ${JSON.stringify(userId)} },
      "current_period_end" : ${periodEnd}
    }
  }
}`;
  assert.notEqual(payload, JSON.stringify(JSON.parse(payload)), "the payload must not survive a round trip unchanged");

  const response = await postWebhook(payload);
  assert.equal(response.status, 200);
  assert.equal(response.json.duplicate, false);
  assert.equal((await call("GET", "/api/auth/me")).json.user.plan, "scale");
});

test("an older subscription event arriving late cannot downgrade the plan", async () => {
  const { call, userId } = await userWithCv("webhook-order@example.com", STRONG_CV);
  const newer = secondsFromNow(60);
  const older = secondsFromNow(30);

  // A newer event sets Scale.
  const first = await postWebhook(
    eventPayload({
      id: "evt_order_new",
      type: "customer.subscription.updated",
      data: { object: { metadata: { userId, plan: "scale" }, current_period_end: newer } },
    })
  );
  assert.equal(first.status, 200);
  assert.equal(first.json.changed, true);
  assert.equal((await call("GET", "/api/auth/me")).json.user.plan, "scale");

  // Delivered out of order: this one would downgrade to Pro if it were applied.
  const second = await postWebhook(
    eventPayload({
      id: "evt_order_old",
      type: "customer.subscription.updated",
      data: { object: { metadata: { userId, plan: "pro" }, current_period_end: older } },
    })
  );
  assert.equal(second.status, 200);
  assert.deepEqual(second.json, {
    received: true,
    duplicate: false,
    type: "customer.subscription.updated",
    changed: false,
    ignored: "older_period",
  });

  let me = await call("GET", "/api/auth/me");
  assert.equal(me.json.user.plan, "scale", "an older period must not downgrade a newer one");
  assert.equal(me.json.user.planRenewsAt, new Date(newer * 1000).toISOString());

  // A late cancellation is the same bug one event over, so it is guarded too.
  const staleDeletion = await postWebhook(
    eventPayload({
      id: "evt_order_deleted_old",
      type: "customer.subscription.deleted",
      data: { object: { metadata: { userId }, current_period_end: older } },
    })
  );
  assert.equal(staleDeletion.status, 200);
  assert.equal(staleDeletion.json.ignored, "older_period");

  me = await call("GET", "/api/auth/me");
  assert.equal(me.json.user.plan, "scale", "a stale cancellation must not undo a newer subscription");
});

test("a webhook with a bad or stale signature is refused and writes nothing", async () => {
  const { call, userId } = await userWithCv("webhook-badsig@example.com", STRONG_CV);
  const payload = eventPayload({
    id: "evt_bad_sig_1",
    type: "checkout.session.completed",
    data: { object: { metadata: { userId, plan: "scale" }, current_period_end: secondsFromNow(30) } },
  });

  const wrongSecret = await postWebhook(payload, { secret: "not-the-configured-secret" });
  assert.equal(wrongSecret.status, 400);
  assert.equal(wrongSecret.json.error.code, "invalid_signature");

  const staleClock = await postWebhook(payload, { timestamp: Math.floor(Date.now() / 1000) - 3_600 });
  assert.equal(staleClock.status, 400, "a signature outside the tolerance window is a failure too");
  assert.equal(staleClock.json.error.code, "invalid_signature");

  assert.equal((await call("GET", "/api/auth/me")).json.user.plan, "free", "no plan change may survive a 400");
  assert.equal(instance.store.hasStripeEvent("evt_bad_sig_1"), false, "a refused event must not be recorded");
});

test("an event with no id is refused rather than applied untracked", async () => {
  const { call, userId } = await userWithCv("webhook-noid@example.com", STRONG_CV);
  const payload = eventPayload({
    type: "checkout.session.completed",
    data: { object: { metadata: { userId, plan: "pro" }, current_period_end: secondsFromNow(30) } },
  });

  const response = await postWebhook(payload);
  assert.equal(response.status, 400);
  assert.match(response.json.error.message, /no id/);
  assert.equal((await call("GET", "/api/auth/me")).json.user.plan, "free");
});
