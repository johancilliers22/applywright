/**
 * Applywright HTTP server: pages, JSON API, session auth, quotas and billing.
 *
 * Everything stateful lives in SQLite (server/db.js). Every score, quota and
 * price the UI shows comes from the module that enforces it — nothing here is
 * decorative.
 */
import express from "express";
import { createServer } from "node:http";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { createStore, dayStartIso, monthStartIso } from "./store.js";
import { createModelClient } from "./model.js";
import { createPageRenderer } from "./pages.js";
import {
  COOKIE_NAME,
  RECOVERY_CODE_COUNT,
  assertSameOrigin,
  clearCookie,
  createAuthStore,
  hashPassword,
  newRecoveryCode,
  newResetToken,
  newSessionId,
  normaliseRecoveryCode,
  parseCookies,
  publicUser,
  recordResetToken,
  resetExpiryIso,
  sessionCookie,
  sessionExpiry,
  unauthorized,
  validatePassword,
  verifyPassword,
} from "./auth.js";
import {
  ApiError,
  assertBoolean,
  assertNumber,
  assertString,
  badRequest,
  errorBody,
  forbidden,
  id,
  isPlainObject,
  isValidEmail,
  notFound,
  notImplemented,
  nowIso,
  stopwatch,
  tooLarge,
  tooMany,
  truncate,
} from "./util.js";

import { extractText, segmentSections } from "./lib/cv/extract.js";
// The CV editor's document model lives with the page, because the browser, this
// server and the tests all have to reconstruct the identical text. It is a pure
// ES module with no DOM access at import time (see public/assets/editor.js).
import { applyChange, documentFromProfile, reconstructCvText } from "../public/assets/editor.js";
import { scoreCv } from "./lib/cv/score.js";
import { tailorCv } from "./lib/cv/tailor.js";
import { fetchJobs } from "./lib/jobs/sources.js";
import { isSupportedHost, parseCapturedPosting } from "./lib/jobs/capture.js";
import { matchRule } from "./lib/jobs/match.js";
import { runAlerts, startAlertScheduler } from "./alerts-runner.js";
import { buildPack } from "./lib/packs/build.js";
import { PLANS, can, entitlements, priceFor, stripeConfigured } from "./lib/billing/plans.js";

const PAGES = new Map([
  ["/", "index.html"],
  ["/how-it-works", "how-it-works.html"],
  ["/pricing", "pricing.html"],
  ["/about", "about.html"],
  ["/security", "security.html"],
  ["/sign-in", "sign-in.html"],
  ["/sign-up", "sign-up.html"],
  ["/reset", "reset.html"],
]);

const APP_ROUTE = /^\/app(\/.*)?$/;

const STATUSES = ["pack_ready", "approved", "submitted", "interview", "rejected", "offer", "withdrawn"];

/**
 * Attribution. Remotive, Remote OK and Arbeitnow all make crediting the source a
 * condition of using their feed, so the label travels with every job we return.
 */
const SOURCE_ATTRIBUTION = {
  arbeitnow: "Arbeitnow (arbeitnow.com)",
  remotive: "Remotive (remotive.com)",
  remoteok: "Remote OK (remoteok.com)",
  capture: "captured by you from the original posting",
  jsonld: "captured by you from the original posting",
};

/**
 * Boards whose terms forbid automated access or whose pages may not be
 * re-published. Capture refuses them with a plain explanation instead of
 * silently trying — the user is on that page in their own browser anyway.
 */
const BLOCKED_CAPTURE_HOSTS = [
  { match: /(^|\.)linkedin\.com$/i, reason: "LinkedIn's terms do not permit automated access or re-publishing its postings." },
  { match: /(^|\.)indeed\.com$/i, reason: "Indeed's terms do not permit automated access or re-publishing its postings." },
  { match: /(^|\.)glassdoor\.[a-z.]+$/i, reason: "Glassdoor's terms do not permit automated access or re-publishing its postings." },
];

const ADVISORY =
  "This score is advisory. It measures your CV against this posting using our published rubric (keywords 35, structure 20, achievements 20, readability 15, formatting 10). It is not an employer's score, no score is sent to any employer, and the decision to apply is yours.";

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
};

const xml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function createLimiter({ limit, windowMs = 60_000 }) {
  const buckets = new Map();
  return {
    hit(key) {
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || now >= bucket.reset) {
        bucket = { count: 0, reset: now + windowMs };
        buckets.set(key, bucket);
        if (buckets.size > 5_000) {
          for (const [candidate, value] of buckets) if (now >= value.reset) buckets.delete(candidate);
        }
      }
      bucket.count += 1;
      return {
        allowed: bucket.count <= limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfter: Math.max(1, Math.ceil((bucket.reset - now) / 1000)),
      };
    },
  };
}

/** Verify a Stripe webhook signature without the SDK. */
export function verifyStripeSignature({ payload, header, secret, toleranceSeconds = 300 }) {
  if (!header || !secret) return false;
  const parts = String(header).split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((signature) => {
    try {
      return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  });
}

const planOrFree = (plan) => (PLANS[plan] ? plan : "free");

/**
 * Parse a posting the user pasted as plain text, with no HTML to inspect.
 * Deliberately conservative: it takes the first line as the title, the second as
 * the company when it looks like one, and leaves everything it cannot see as a
 * null plus a warning.
 */
function parsePastedPosting({ url, text }) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const warnings = [];
  const clean = (value) => (value ? value.replace(/\s+/g, " ").slice(0, 200) : null);

  // A real posting has a title, something else, and some body. Anything shorter
  // is a stray paste, and saving it would pollute the feed.
  if (lines.length < 2 || String(text).trim().length < 60) {
    return { source: "paste", url, title: null, warnings: ["That does not look like a job posting — paste the whole advert, including its description."] };
  }

  const title = clean(lines[0] && lines[0].length <= 140 ? lines[0] : null);
  if (!title) warnings.push("No job title was found in the pasted text; add it before saving.");

  let company = clean(lines[1] && lines[1].length <= 90 && !/@|https?:/i.test(lines[1]) ? lines[1] : null);
  if (!company) warnings.push("No company name was found; add it before saving.");

  const locationLine = lines.slice(0, 4).find((line) => /remote|hybrid|on-?site|,|\bUK\b|\bUnited Kingdom\b/i.test(line) && line.length <= 120);
  const location = clean(locationLine ?? null);
  if (!location) warnings.push("No location was stated.");

  // Salaries appear as "£95,000 to £115,000", "GBP 65000 to 80000" or "$120k".
  const salaryMatch = text.match(
    /(?:£|\$|€|GBP|USD|EUR)\s?(\d[\d,]{2,}(?:k)?)(?:\s?(?:to|-|–|—)\s?(?:£|\$|€|GBP|USD|EUR)?\s?(\d[\d,]{2,}(?:k)?))?/i
  );
  const salaryValue = (raw) => {
    if (!raw) return null;
    const cleaned = raw.replace(/,/g, "");
    return cleaned.toLowerCase().endsWith("k") ? Number(cleaned.slice(0, -1)) * 1000 : Number(cleaned);
  };
  const currencyToken = salaryMatch ? salaryMatch[0].toUpperCase() : "";
  const currency = salaryMatch
    ? /GBP|£/.test(currencyToken)
      ? "GBP"
      : /USD|\$/.test(currencyToken)
        ? "USD"
        : "EUR"
    : null;
  const salaryMin = salaryMatch ? salaryValue(salaryMatch[1]) : null;
  const salaryMax = salaryMatch && salaryMatch[2] ? salaryValue(salaryMatch[2]) : null;
  if (!salaryMatch) warnings.push("No salary was stated.");

  const postedMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const description = String(text).slice(0, 8_000);

  return {
    source: "paste",
    external_id: null,
    title,
    company,
    location,
    remote: /remote/i.test(text) ? 1 : 0,
    salary_min: salaryMin,
    salary_max: salaryMax,
    currency,
    url,
    description,
    posted_at: postedMatch ? postedMatch[1] : null,
    tags: [],
    confidence: title ? 0.55 : 0.15,
    warnings,
  };
}
/** One outbound job shape for every endpoint — no snake_case leaking to clients. */
const jobShape = (job) => ({
  id: job.id,
  source: job.source,
  attribution: SOURCE_ATTRIBUTION[job.source] ?? job.source,
  title: job.title,
  company: job.company,
  location: job.location,
  remote: Boolean(job.remote),
  salaryMin: job.salary_min,
  salaryMax: job.salary_max,
  currency: job.currency,
  url: job.url,
  postedAt: job.posted_at,
  description: job.description ?? null,
  tags: job.tags ?? [],
});

function requireQuota(store, user, feature, used, message) {
  const result = can(user.plan, feature, used);
  if (!result.allowed) {
    throw new ApiError(402, "quota_exceeded", message, { upgrade: user.plan === "free" ? "pro" : "scale" });
  }
  return result;
}

/**
 * Where the Free report stops. `fullAtsReport` is enforced, not declared: Free
 * keeps the score, the five subscores and the three highest-priority findings,
 * and loses the rest of the findings list plus the advice array. The shape of a
 * report never changes with the plan — `advice` is an empty array and
 * `fullAtsReport.included` says which report this is — so a client cannot crash
 * on a missing key and cannot mistake a truncation for an empty list.
 */
const FREE_FINDINGS_SHOWN = 3;
const FULL_REPORT_LOCK = "The full findings list and the fix order are part of Pro.";

function gateReport(plan, report) {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  if (can(plan, "fullAtsReport").allowed) {
    return { ...report, fullAtsReport: { included: true, shownFindings: findings.length, totalFindings: findings.length } };
  }
  return {
    ...report,
    findings: findings.slice(0, FREE_FINDINGS_SHOWN),
    advice: [],
    fullAtsReport: {
      included: false,
      shownFindings: Math.min(FREE_FINDINGS_SHOWN, findings.length),
      totalFindings: findings.length,
      locked: FULL_REPORT_LOCK,
    },
  };
}

/**
 * Where Free's pack history stops. `packHistory` is the record, not the pack:
 * the CV and the screening answers in an older pack stay readable, and only its
 * covering letter returns the lock message. "Most recent" is by `created_at`,
 * the order packs were built in, so editing an old pack's status cannot promote
 * it past the gate.
 */
const PACK_HISTORY_LOCK =
  "Pack history is part of Pro. Your most recent pack stays open; older packs keep their CV and screening answers.";

/** The sentence a covering-letter refusal carries, wherever it is shown. */
const COVER_LETTER_LOCK = "A covering letter is part of Pro. The CV and screening answers in this pack are yours to use.";

/** Change-record fields whose before/after text is the letter itself. */
const LETTER_CHANGE_FIELDS = new Set(["letter", "coverLetter"]);

/**
 * Remove every copy of a covering letter from a pack, not just the rendered
 * Markdown: the tailored source a later refine would rewrite from, and any
 * before/after letter text in the refinement trail. A gate on one field would
 * leak the letter through the other two.
 */
function withoutCoverLetter(pack) {
  const source = pack && typeof pack === "object" ? pack : {};
  const next = { ...source, coverLetterMd: "" };
  if (next.tailored && typeof next.tailored === "object") next.tailored = { ...next.tailored, coverLetter: "" };
  if (Array.isArray(next.refinements)) {
    next.refinements = next.refinements.map((entry) => {
      if (!entry || !Array.isArray(entry.changes)) return entry;
      return {
        ...entry,
        changes: entry.changes.filter((change) => !LETTER_CHANGE_FIELDS.has(String(change?.field))),
      };
    });
  }
  return next;
}

function gatePackHistory(store, user, application) {
  if (can(user.plan, "packHistory").allowed) return application;
  const newest = store
    .listApplications(user.id)
    .reduce((best, entry) => (!best || String(entry.created_at) > String(best.created_at) ? entry : best), null);
  if (!newest || newest.id === application.id) return application;
  return {
    ...application,
    pack: { ...withoutCoverLetter(application.pack), coverLetterLocked: PACK_HISTORY_LOCK, packHistoryLocked: PACK_HISTORY_LOCK },
  };
}

export async function createApp(config) {
  const db = openDatabase(config.databasePath);
  const store = createStore(db);
  const accounts = createAuthStore(db);
  const model = createModelClient(config);
  const pages = createPageRenderer({ publicDir: config.publicDir, site: config.site });
  store.purgeExpiredSessions();

  const apiLimiter = createLimiter({ limit: config.limits.apiPerMinute });
  const authLimiter = createLimiter({ limit: config.limits.authPerMinute });
  const feedCache = new Map();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ? 1 : false);

  // --- identity, headers, session ------------------------------------------
  app.use((req, res, next) => {
    req.requestId = id("r", 6);
    res.setHeader("x-request-id", req.requestId);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    const cookies = parseCookies(req.headers.cookie);
    req.sessionId = cookies[COOKIE_NAME] || null;
    req.user = req.sessionId ? store.sessionUser(req.sessionId) : null;
    next();
  });

  const requireUser = (req, res, next) => (req.user ? next() : next(unauthorized()));

  // --- rate limits ---------------------------------------------------------
  app.use("/api", (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    // Every credential-bearing route shares the auth bucket: a recovery code and a
    // reset token are secrets, and guessing either must cost the same as guessing
    // a password.
    const isAuth = /^\/auth\/(register|login|change-password|recover|forgot|forgot-username|reset)$/.test(req.path);
    const state = (isAuth ? authLimiter : apiLimiter).hit(key);
    res.setHeader("x-ratelimit-limit", String(isAuth ? config.limits.authPerMinute : config.limits.apiPerMinute));
    res.setHeader("x-ratelimit-remaining", String(state.remaining));
    if (!state.allowed) {
      res.setHeader("retry-after", String(state.retryAfter));
      return res.status(429).json(errorBody("rate_limited", `Too many requests. Retry in ${state.retryAfter}s.`));
    }
    next();
  });

  const jsonBody = express.json({ limit: config.limits.maxBodyBytes, type: "application/json" });
  app.use("/api", (req, res, next) => (req.path === "/billing/webhook" ? next() : jsonBody(req, res, next)));
  app.use("/api", (req, res, next) => {
    assertSameOrigin(req);
    next();
  });

  // ------------------------------------------------------------------- auth
  app.post("/api/auth/register", (req, res) => {
    if (!config.registrationOpen) {
      throw new ApiError(403, "registration_closed", "Sign-up is closed on this server. Ask the operator for an account.");
    }
    const body = req.body ?? {};
    const email = assertString(body.email, "email", { max: 254 });
    if (!isValidEmail(email)) throw badRequest("email must be a valid address");
    const password = validatePassword(body.password);
    const name = assertString(body.name, "name", { min: 0, max: 120, required: false });
    if (store.userByEmail(email)) throw new ApiError(409, "email_taken", "an account with that email already exists");

    const { hash, salt } = hashPassword(password);
    const user = store.createUser({ email, passwordHash: hash, passwordSalt: salt, name });

    // The only moment these exist in readable form: they are hashed in the
    // database and returned once, so the client can save them somewhere.
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode());
    accounts.issueRecoveryCodes(user.id, recoveryCodes);

    const session = store.createSession({
      userId: user.id,
      userAgent: req.get("user-agent"),
      ip: req.ip,
      days: config.limits.sessionDays,
    });
    res.setHeader("set-cookie", sessionCookie(session.id, { secure: config.secureCookies, maxAgeDays: config.limits.sessionDays }));
    // A response carrying one-time codes must not sit in any cache.
    res.setHeader("cache-control", "no-store");
    res.status(201).json({ user: publicUser(user), recoveryCodes });
  });

  app.post("/api/auth/login", (req, res) => {
    const body = req.body ?? {};
    const email = assertString(body.email, "email", { max: 254 });
    const password = assertString(body.password, "password", { max: 200 });
    const row = store.userByEmail(email);
    if (!row || !verifyPassword(password, row.pass_hash, row.pass_salt)) {
      throw new ApiError(401, "invalid_credentials", "email or password is incorrect");
    }
    const session = store.createSession({
      userId: row.id,
      userAgent: req.get("user-agent"),
      ip: req.ip,
      days: config.limits.sessionDays,
    });
    res.setHeader("set-cookie", sessionCookie(session.id, { secure: config.secureCookies, maxAgeDays: config.limits.sessionDays }));
    res.json({ user: publicUser(row) });
  });

  app.post("/api/auth/logout", (req, res) => {
    if (req.sessionId) store.deleteSession(req.sessionId);
    res.setHeader("set-cookie", clearCookie());
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireUser, (req, res) => {
    const plan = planOrFree(req.user.plan);
    res.json({
      user: publicUser(req.user),
      plan,
      usage: {
        packsThisMonth: store.countUsage(req.user.id, "pack", monthStartIso()),
        cvs: store.countCvs(req.user.id),
        alerts: store.listAlerts(req.user.id).length,
        unreadNotifications: store.countUnread(req.user.id),
      },
      entitlements: entitlements(plan),
      model: model ? "live" : "rules",
    });
  });

  // --------------------------------------------------------------- recovery
  /**
   * One message for every failed recovery attempt. A wrong code, a spent code and
   * an address with no account have to be indistinguishable, or this endpoint
   * becomes an account oracle.
   */
  const INVALID_RECOVERY_CODE = "That email and recovery code do not match an unused code.";

  app.post("/api/auth/change-password", requireUser, (req, res) => {
    const body = req.body ?? {};
    const currentPassword = assertString(body.currentPassword, "currentPassword", { min: 0, max: 200, required: false });
    const newPassword = validatePassword(body.newPassword);
    // An empty or wrong current password is a refusal, never a partial change.
    if (!verifyPassword(currentPassword, req.user.pass_hash, req.user.pass_salt)) {
      throw new ApiError(401, "invalid_credentials", "current password is incorrect");
    }
    const { hash, salt } = hashPassword(newPassword);
    accounts.setPassword(req.user.id, { hash, salt });
    // This browser stays signed in; every other device is signed out. A reset link
    // issued before the change is withdrawn, since the password just changed.
    const revoked = accounts.revokeOtherSessions(req.user.id, req.sessionId);
    accounts.clearPendingResets(req.user.id);
    res.json({ ok: true, revokedSessions: revoked });
  });

  app.post("/api/auth/recover", (req, res) => {
    const body = req.body ?? {};
    const email = assertString(body.email, "email", { max: 254 });
    // The new password is checked before the code is spent, so a password that is
    // too short never costs the user one of their eight codes.
    const password = validatePassword(body.password);
    const code = normaliseRecoveryCode(body.code);
    const user = store.userByEmail(email);
    if (!user || !code || !accounts.consumeRecoveryCode(user.id, code)) {
      throw new ApiError(400, "invalid_recovery_code", INVALID_RECOVERY_CODE);
    }
    const { hash, salt } = hashPassword(password);
    accounts.setPassword(user.id, { hash, salt });
    accounts.revokeSessions(user.id);
    accounts.clearPendingResets(user.id);
    res.setHeader("set-cookie", clearCookie());
    res.json({ ok: true });
  });

  /**
   * Reset and username requests are recorded for the operator — this host has no
   * SMTP, so nothing is emailed and nothing is echoed back. Both kinds answer
   * 200 {ok:true} whether or not the address has an account, so neither can be
   * used to test for one. What "notified" means is the host files the recovery
   * script reads: see docs/PASSWORD-RECOVERY.md.
   */
  const recordRecoveryRequest = async (kind, req) => {
    const raw = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const email = raw.toLowerCase();
    const user = email && isValidEmail(email) ? store.userByEmail(email) : null;

    if (user && kind === "forgot") {
      const token = newResetToken();
      const expiresAt = resetExpiryIso();
      accounts.issuePasswordReset(user.id, { token, expiresAt });
      // The database keeps only sha256(token); the plaintext rides in a host-only
      // ledger so the operator can print the link. A failure to write it must not
      // turn into a 500 that tells the caller the address exists.
      await recordResetToken(config.dataDir, { email, token, expiresAt }).catch(() => {});
    }

    await appendFile(
      join(config.dataDir, "recovery-requests.jsonl"),
      `${JSON.stringify({ at: nowIso(), kind, email: email || null, account: Boolean(user), requestId: req.requestId })}\n`,
      "utf8"
    ).catch(() => {});

    return { ok: true };
  };

  app.post("/api/auth/forgot", async (req, res) => {
    res.json(await recordRecoveryRequest("forgot", req));
  });

  app.post("/api/auth/forgot-username", async (req, res) => {
    res.json(await recordRecoveryRequest("forgot-username", req));
  });

  app.post("/api/auth/reset", (req, res) => {
    const body = req.body ?? {};
    const token = assertString(body.token, "token", { max: 300 });
    const password = validatePassword(body.password);
    const row = accounts.passwordResetByToken(token);
    const invalid = (message) => new ApiError(400, "invalid_reset_token", message);
    if (!row) throw invalid("That reset link is not valid. Request a new one.");
    if (row.used_at) throw invalid("That reset link has already been used. Request a new one.");
    if (row.expires_at <= nowIso()) throw invalid("That reset link has expired. Request a new one.");
    // A single conditional UPDATE: two tabs submitting the same link cannot both
    // reset the account.
    if (!accounts.consumePasswordReset(token)) {
      throw invalid("That reset link has already been used. Request a new one.");
    }
    const { hash, salt } = hashPassword(password);
    accounts.setPassword(row.user_id, { hash, salt });
    accounts.revokeSessions(row.user_id);
    accounts.clearPendingResets(row.user_id);
    res.setHeader("set-cookie", clearCookie());
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------- cvs
  app.get("/api/cvs", requireUser, (req, res) => {
    res.json({
      cvs: store.listCvs(req.user.id).map((cv) => ({
        id: cv.id,
        name: cv.name,
        format: cv.format,
        primary: Boolean(cv.primary_flag),
        createdAt: cv.created_at,
        preview: truncate(cv.text.replace(/\s+/g, " "), 220),
      })),
    });
  });

  app.post("/api/cvs", requireUser, async (req, res) => {
    const body = req.body ?? {};
    const existing = store.countCvs(req.user.id);
    requireQuota(store, req.user, "cvs", existing, "Your plan is full — upgrade to add another CV.");

    let text = "";
    let format = "txt";
    let warnings = [];
    let layout = null;
    let name = assertString(body.name, "name", { max: 120, required: false });

    if (typeof body.text === "string" && body.text.trim()) {
      text = body.text.trim();
      format = "txt";
    } else if (typeof body.contentBase64 === "string" && body.contentBase64.trim()) {
      const filename = assertString(body.filename, "filename", { max: 200 });
      const buffer = Buffer.from(body.contentBase64, "base64");
      if (!buffer.length) throw badRequest("the uploaded file is empty");
      if (buffer.length > config.limits.maxCvBytes) throw tooLarge("that file is larger than the 5 MB limit");
      const extracted = await extractText({ buffer, filename });
      text = String(extracted.text ?? "").trim();
      format = extracted.format ?? "unknown";
      warnings = extracted.warnings ?? [];
      layout = extracted.layout ?? null;
      if (!name) name = filename.replace(/\.[^.]+$/, "");
      if (!text) {
        throw new ApiError(422, "unreadable_cv", `no text could be read from that ${format} file${warnings.length ? `: ${warnings[0]}` : ""}`);
      }
    } else {
      throw badRequest("provide text or contentBase64");
    }

    if (text.length < 80) throw badRequest("that CV is too short to analyse — paste the full text");
    if (text.length > 60_000) throw badRequest("that CV is longer than 60,000 characters");

    // Carry the extraction's layout signal into the profile: the plain text has
    // already been flattened, so scoring cannot otherwise know that the source
    // was a table or a two-column layout.
    const profile = { ...segmentSections(text), layout };
    const isFirst = existing === 0;
    const cv = store.createCv({
      userId: req.user.id,
      name: name || "My CV",
      format,
      text,
      profile,
      primary: isFirst || body.primary === true,
    });
    res.status(201).json({
      cv: {
        id: cv.id,
        name: cv.name,
        format: cv.format,
        primary: Boolean(cv.primary_flag),
        createdAt: cv.created_at,
        profile,
      },
      warnings,
    });
  });

  app.get("/api/cvs/:id", requireUser, (req, res) => {
    const cv = store.cvById(req.params.id, req.user.id);
    if (!cv) throw notFound("CV not found");
    res.json({ cv: { id: cv.id, name: cv.name, format: cv.format, primary: Boolean(cv.primary_flag), createdAt: cv.created_at, text: cv.text, profile: cv.profile } });
  });

  app.patch("/api/cvs/:id", requireUser, (req, res) => {
    const body = req.body ?? {};
    const patch = {};
    if (body.name !== undefined) patch.name = assertString(body.name, "name", { max: 120 });
    if (body.primary !== undefined) patch.primary = assertBoolean(body.primary);
    // Editing the extracted text is the correction path when a parser gets a
    // heading or a date wrong: re-segment so profile, scores and packs follow it.
    if (body.text !== undefined) {
      patch.text = assertString(body.text, "text", { min: 80, max: 60_000 });
      // Re-segment from the corrected text, but keep the layout signal the
      // original extraction produced: editing the text cannot reveal a table.
      const before = store.cvById(req.params.id, req.user.id);
      patch.profile = { ...segmentSections(patch.text), layout: before?.profile?.layout ?? null };
    }
    const cv = store.updateCv(req.params.id, req.user.id, patch);
    if (!cv) throw notFound("CV not found");
    res.json({
      cv: {
        id: cv.id,
        name: cv.name,
        format: cv.format,
        primary: Boolean(cv.primary_flag),
        text: cv.text,
        profile: cv.profile,
      },
    });
  });

  app.delete("/api/cvs/:id", requireUser, (req, res) => {
    if (!store.deleteCv(req.params.id, req.user.id)) throw notFound("CV not found");
    res.json({ deleted: true });
  });

  // --------------------------------------------------------------- analyse
  const resolveCv = (user, cvId) => {
    if (cvId) {
      const cv = store.cvById(String(cvId), user.id);
      if (!cv) throw notFound("CV not found");
      return cv;
    }
    const primary = store.listCvs(user.id)[0];
    if (!primary) throw badRequest("add a CV first");
    return primary;
  };

  const resolveJobText = (body) => {
    if (typeof body.jobText === "string" && body.jobText.trim()) {
      return {
        description: assertString(body.jobText, "jobText", { max: config.limits.maxJobDescription }),
        title: typeof body.title === "string" ? body.title.slice(0, 200) : null,
        company: typeof body.company === "string" ? body.company.slice(0, 200) : null,
        url: typeof body.url === "string" ? body.url.slice(0, 2_000) : null,
        id: null,
      };
    }
    if (body.jobId) {
      const job = store.jobById(String(body.jobId));
      if (!job) throw notFound("job not found");
      return job;
    }
    throw badRequest("provide jobText or jobId");
  };

  app.post("/api/analyse", requireUser, (req, res) => {
    const body = req.body ?? {};
    const cv = resolveCv(req.user, body.cvId);
    const job = resolveJobText(body);
    const report = scoreCv({ cvText: cv.text, jobText: job.description, profile: cv.profile });
    // The full report is stored either way; what comes back is what the plan buys.
    const stored = store.createReport({
      userId: req.user.id,
      cvId: cv.id,
      jobId: job.id ?? null,
      jobTitle: job.title ?? null,
      score: report.score,
      report,
    });
    const fullReport = can(req.user.plan, "fullAtsReport").allowed;
    res.json({
      report: gateReport(req.user.plan, stored),
      job: { id: job.id ?? null, title: job.title ?? null, company: job.company ?? null },
      advisory: fullReport ? ADVISORY : `${ADVISORY} ${FULL_REPORT_LOCK}`,
    });
  });

  app.get("/api/reports", requireUser, (req, res) => {
    res.json({ reports: store.listReports(req.user.id) });
  });

  // ---------------------------------------------------------------- tailor
  app.post("/api/tailor", requireUser, async (req, res) => {
    const body = req.body ?? {};
    const cv = resolveCv(req.user, body.cvId);
    const job = resolveJobText(body);

    const used = store.countUsage(req.user.id, "pack", monthStartIso());
    requireQuota(store, req.user, "packs", used, "You have used this month's tailored packs — upgrade for more.");

    const tailored = await tailorCv({ cvText: cv.text, profile: cv.profile, job, model });
    const built = buildPack({ profile: cv.profile, cvText: cv.text, job, tailored });
    // The pricing table sells covering letters on Pro and above; enforce it here
    // rather than letting a Free pack carry one.
    const coverLetterAllowed = can(req.user.plan, "coverLetter").allowed;
    const pack = coverLetterAllowed ? built : { ...withoutCoverLetter(built), coverLetterLocked: COVER_LETTER_LOCK };
    const score = scoreCv({ cvText: cv.text, jobText: job.description, profile: cv.profile });

    const application = store.createApplication({
      userId: req.user.id,
      jobId: job.id ?? null,
      cvId: cv.id,
      title: job.title || "Untitled role",
      company: job.company ?? null,
      url: job.url ?? null,
      status: "pack_ready",
      score: score.score,
      // The tailored source is stored, so it is gated with the pack: a Free
      // account cannot read the letter back out of `tailored.coverLetter`.
      pack: { ...pack, tailored: coverLetterAllowed ? tailored : { ...tailored, coverLetter: "" }, score },
    });
    store.recordUsage(req.user.id, "pack", 1);

    res.status(201).json({
      application: {
        id: application.id,
        title: application.title,
        company: application.company,
        status: application.status,
        score: application.score,
        createdAt: application.created_at,
      },
      pack: {
        summary: tailored.summary,
        mode: tailored.mode,
        warnings: tailored.warnings,
        // The same gate as the stored pack: the letter is not in this response either.
        coverLetter: coverLetterAllowed ? tailored.coverLetter : "",
        ...(coverLetterAllowed ? {} : { coverLetterLocked: COVER_LETTER_LOCK }),
      },
      score: { score: score.score, subscores: score.subscores },
    });
  });

  // ---------------------------------------------------------- applications
  app.get("/api/applications", requireUser, (req, res) => {
    const applications = store.listApplications(req.user.id).map((application) => ({
      id: application.id,
      title: application.title,
      company: application.company,
      url: application.url,
      status: application.status,
      score: application.score,
      createdAt: application.created_at,
      updatedAt: application.updated_at,
      appliedAt: application.applied_at,
      notes: application.notes,
      hasPack: Boolean(application.pack?.cvHtml),
    }));
    res.json({ applications, statuses: STATUSES });
  });

  app.get("/api/applications/:id", requireUser, (req, res) => {
    const application = store.applicationById(req.params.id, req.user.id);
    if (!application) throw notFound("application not found");
    res.json({ application: gatePackHistory(store, req.user, application) });
  });

  app.patch("/api/applications/:id", requireUser, (req, res) => {
    const body = req.body ?? {};
    if (body.status !== undefined && !STATUSES.includes(body.status)) {
      throw badRequest(`status must be one of ${STATUSES.join(", ")}`);
    }
    const application = store.updateApplication(req.params.id, req.user.id, {
      status: body.status,
      notes: body.notes === undefined ? undefined : assertString(body.notes, "notes", { min: 0, max: 4_000, required: false }),
    });
    if (!application) throw notFound("application not found");
    res.json({ application: { id: application.id, status: application.status, notes: application.notes, updatedAt: application.updated_at } });
  });

  app.delete("/api/applications/:id", requireUser, (req, res) => {
    if (!store.deleteApplication(req.params.id, req.user.id)) throw notFound("application not found");
    res.json({ deleted: true });
  });

  app.get("/api/applications/:id/cv", requireUser, (req, res) => {
    const application = store.applicationById(req.params.id, req.user.id);
    if (!application) throw notFound("application not found");
    const html = application.pack?.cvHtml;
    if (!html) throw notFound("this application has no generated CV");
    res.setHeader("cache-control", "no-store");
    res.type("html").send(html);
  });

  // ------------------------------------------------------------------ jobs
  app.get("/api/jobs", requireUser, async (req, res) => {
    const started = stopwatch();
    const plan = planOrFree(req.user.plan);
    const quota = entitlements(plan);
    const usedToday = store.countUsage(req.user.id, "job_results", dayStartIso());
    const dailyRemaining = quota.jobResultsPerDay == null ? Infinity : Math.max(0, quota.jobResultsPerDay - usedToday);
    if (dailyRemaining <= 0) {
      throw new ApiError(402, "quota_exceeded", "You have reached today's job-feed limit on this plan.", { upgrade: "pro" });
    }

    const query = assertString(req.query.query, "query", { min: 0, max: 200, required: false });
    const location = assertString(req.query.location, "location", { min: 0, max: 120, required: false });
    const remoteOnly = assertBoolean(req.query.remote);
    const requested = Math.min(
      Number(req.query.limit) > 0 ? Number(req.query.limit) : 40,
      config.limits.jobFeedLimit,
      dailyRemaining === Infinity ? config.limits.jobFeedLimit : dailyRemaining
    );

    const cacheKey = JSON.stringify({ query, location, remoteOnly, requested });
    const cached = feedCache.get(cacheKey);
    const fresh = cached && Date.now() - cached.at < config.limits.feedCacheMinutes * 60_000;

    let sourceErrors = cached?.errors ?? [];
    if (!fresh) {
      const result = await fetchJobs({ query, location, remoteOnly, limit: requested });
      sourceErrors = result.errors ?? [];
      for (const job of result.jobs ?? []) store.upsertJob({ ...job, dedupe_hash: job.dedupe_hash ?? createHash("sha256").update(`${job.company}|${job.title}|${job.location}`.toLowerCase()).digest("hex") });
      feedCache.set(cacheKey, { at: Date.now(), errors: sourceErrors });
      store.pruneJobs();
    }

    const jobs = store.searchJobs({ query, location, remoteOnly, limit: requested });
    store.recordUsage(req.user.id, "job_results", jobs.length);

    res.json({
      jobs: jobs.map(jobShape),
      sources: sourceErrors,
      cached: Boolean(fresh),
      remaining: dailyRemaining === Infinity ? null : Math.max(0, dailyRemaining - jobs.length),
      ms: started(),
    });
  });

  app.post("/api/jobs/capture", requireUser, (req, res) => {
    const body = req.body ?? {};
    const url = assertString(body.url, "url", { max: 2_000 });
    if (!/^https?:\/\//i.test(url)) throw badRequest("url must start with http or https");

    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      throw badRequest("url is not a valid address");
    }
    const blocked = BLOCKED_CAPTURE_HOSTS.find((rule) => rule.match.test(host));
    if (blocked) {
      throw new ApiError(
        400,
        "source_not_permitted",
        `We cannot read postings from ${host}. ${blocked.reason} Paste the posting text instead, or apply on their own site.`
      );
    }
    const html = typeof body.html === "string" ? body.html.slice(0, 500_000) : "";
    const text = typeof body.text === "string" ? body.text.slice(0, 50_000) : "";
    if (!html && !text) throw badRequest("paste the posting text or the page HTML");

    const parsed = html.trim()
      ? parseCapturedPosting({ url, html, text })
      : parsePastedPosting({ url, text });
    if (!parsed?.title) throw new ApiError(422, "unreadable_posting", "could not find a job title in that page");
    const dedupe_hash = createHash("sha256").update(`${parsed.company ?? ""}|${parsed.title}|${parsed.location ?? ""}`.toLowerCase()).digest("hex");
    const jobId = store.upsertJob({ ...parsed, source: parsed.source ?? "capture", dedupe_hash });
    res.status(201).json({
      job: jobShape(store.jobById(jobId)),
      supported: isSupportedHost(url),
      confidence: parsed.confidence ?? null,
      warnings: parsed.warnings ?? [],
    });
  });

  app.get("/api/jobs/:id", requireUser, (req, res) => {
    const job = store.jobById(req.params.id);
    if (!job) throw notFound("job not found");
    res.json({ job: jobShape(job) });
  });

  // ---------------------------------------------------------------- alerts
  app.get("/api/alerts", requireUser, (req, res) => {
    res.json({ alerts: store.listAlerts(req.user.id) });
  });

  app.post("/api/alerts", requireUser, (req, res) => {
    const body = req.body ?? {};
    const existing = store.listAlerts(req.user.id).length;
    requireQuota(store, req.user, "alerts", existing, "Your plan's alert limit is reached.");
    const alert = store.createAlert({
      userId: req.user.id,
      name: assertString(body.name, "name", { max: 120 }),
      keywords: assertString(body.keywords, "keywords", { max: 300 }),
      locations: assertString(body.locations, "locations", { min: 0, max: 200, required: false }),
      remoteOnly: assertBoolean(body.remoteOnly),
      minSalary: assertNumber(body.minSalary, "minSalary", { min: 0, max: 10_000_000, required: false }),
      cadence: ["daily", "weekly", "manual"].includes(body.cadence) ? body.cadence : "daily",
    });
    res.status(201).json({ alert });
  });

  app.patch("/api/alerts/:id", requireUser, (req, res) => {
    const body = req.body ?? {};
    const alert = store.updateAlert(req.params.id, req.user.id, {
      name: body.name === undefined ? undefined : assertString(body.name, "name", { max: 120 }),
      keywords: body.keywords === undefined ? undefined : assertString(body.keywords, "keywords", { max: 300 }),
      locations: body.locations === undefined ? undefined : assertString(body.locations, "locations", { min: 0, max: 200, required: false }),
      remoteOnly: body.remoteOnly === undefined ? undefined : assertBoolean(body.remoteOnly),
      minSalary: body.minSalary === undefined ? undefined : assertNumber(body.minSalary, "minSalary", { min: 0, max: 10_000_000, required: false }),
      cadence: body.cadence,
      active: body.active === undefined ? undefined : assertBoolean(body.active),
    });
    if (!alert) throw notFound("alert not found");
    res.json({ alert });
  });

  app.delete("/api/alerts/:id", requireUser, (req, res) => {
    if (!store.deleteAlert(req.params.id, req.user.id)) throw notFound("alert not found");
    res.json({ deleted: true });
  });

  app.post("/api/alerts/run", requireUser, async (req, res) => {
    const alerts = store.listAlerts(req.user.id).filter((alert) => alert.active);
    const result = await runAlerts({ alerts, store, db });
    res.json({ alerts: alerts.length, ...result });
  });

  // --------------------------------------------------------- notifications
  const ensureFeedToken = (userId) => {
    const settings = store.getSettings(userId);
    if (!settings.feedToken) {
      const token = createHash("sha256").update(`${userId}:${nowIso()}:${Math.random()}`).digest("hex").slice(0, 32);
      store.putSettings(userId, { ...settings, feedToken: token });
      return token;
    }
    return settings.feedToken;
  };

  app.get("/api/notifications", requireUser, (req, res) => {
    const unreadOnly = assertBoolean(req.query.unread);
    res.json({
      notifications: store.listNotifications(req.user.id, { unreadOnly, limit: 100 }),
      unread: store.countUnread(req.user.id),
      feedToken: ensureFeedToken(req.user.id),
    });
  });

  app.post("/api/notifications/:id/read", requireUser, (req, res) => {
    if (!store.markNotificationRead(req.params.id, req.user.id)) throw notFound("notification not found");
    res.json({ ok: true, unread: store.countUnread(req.user.id) });
  });

  app.get("/feed/:token.rss", (req, res) => {
    const token = String(req.params.token ?? "");
    const rows = db.prepare("SELECT user_id, json FROM settings").all();
    const match = rows.find((row) => {
      try {
        return JSON.parse(row.json)?.feedToken === token;
      } catch {
        return false;
      }
    });
    if (!match) throw notFound("feed not found");
    const notifications = store.listNotifications(match.user_id, { limit: 50 });
    const items = notifications
      .map(
        (notification) => `    <item>
      <title>${xml(notification.title)}</title>
      <description>${xml(notification.body ?? "")}</description>
      <pubDate>${new Date(notification.created_at).toUTCString()}</pubDate>
      <guid isPermaLink="false">${xml(notification.id)}</guid>
    </item>`
      )
      .join("\n");
    res.type("application/rss+xml").send(`<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Applywright job alerts</title>
    <link>${xml(`${config.site.publicUrl}/app/alerts`)}</link>
    <description>New job matches from your saved alerts</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`);
  });

  // --------------------------------------------------------------- billing
  app.get("/api/billing/plans", requireUser, (req, res) => {
    res.json({
      plans: Object.entries(PLANS).map(([key, plan]) => ({
        key,
        ...plan,
        prices: { month: priceFor(key, "month"), year: priceFor(key, "year") },
      })),
      current: planOrFree(req.user.plan),
      stripeConfigured: config.stripe.configured,
    });
  });

  app.post("/api/billing/checkout", requireUser, async (req, res) => {
    if (!config.stripe.configured) {
      throw notImplemented("Billing is not configured on this server: set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.");
    }
    const body = req.body ?? {};
    const plan = assertString(body.plan, "plan", { max: 20 });
    const interval = body.interval === "year" ? "year" : "month";
    if (!PLANS[plan] || plan === "free") throw badRequest("choose pro or scale");
    const priceId = config.stripe.priceIds[`${plan}${interval === "year" ? "Yearly" : "Monthly"}`];
    if (!priceId) throw notImplemented(`No Stripe price id configured for ${plan}/${interval}.`);

    const origin = config.site.publicUrl;
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("success_url", `${origin}/app/billing?status=success`);
    params.set("cancel_url", `${origin}/app/billing?status=cancelled`);
    params.set("customer_email", req.user.email);
    params.set("client_reference_id", req.user.id);
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("metadata[userId]", req.user.id);
    params.set("metadata[plan]", plan);

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.stripe.secret}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(502, "provider_error", `Stripe refused the request: ${payload?.error?.message ?? response.status}`);
    res.json({ url: payload.url });
  });

  app.post("/api/billing/portal", requireUser, async (req, res) => {
    if (!config.stripe.configured) {
      throw notImplemented("Billing is not configured on this server: set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.");
    }
    if (!req.user.stripe_customer_id) {
      throw badRequest("this account has no Stripe customer yet — subscribe first");
    }
    const origin = config.site.publicUrl;
    const params = new URLSearchParams();
    params.set("customer", req.user.stripe_customer_id);
    params.set("return_url", `${origin}/app/billing`);
    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${config.stripe.secret}`, "content-type": "application/x-www-form-urlencoded" },
      body: params,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(502, "provider_error", `Stripe refused the request: ${payload?.error?.message ?? response.status}`);
    res.json({ url: payload.url });
  });

  /**
   * Stripe webhook. Three independent checks, in this order:
   *
   *   1. The signature, against the bytes Stripe sent — `express.raw` is mounted
   *      on this path only and the JSON parser above skips it, so the body is
   *      still the original buffer here. A bad signature is a 400 and writes
   *      nothing, not even a `stripe_events` row.
   *   2. The event id, written before the event is applied. The primary key is
   *      the authority, so a redelivery — including one racing this request —
   *      answers `duplicate: true` and changes nothing.
   *   3. The subscription period. An event for an older `current_period_end`
   *      than the account already records is ignored, so a late delivery cannot
   *      downgrade a plan that a newer event set.
   */
  app.post("/api/billing/webhook", express.raw({ type: "application/json", limit: config.limits.maxBodyBytes }), (req, res) => {
    if (!config.stripe.configured) throw notImplemented("Billing is not configured on this server.");
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    const valid = verifyStripeSignature({
      payload: raw.toString("utf8"),
      header: req.get("stripe-signature"),
      secret: config.stripe.webhookSecret,
    });
    if (!valid) throw new ApiError(400, "invalid_signature", "webhook signature did not verify");

    let event;
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch {
      throw badRequest("webhook body is not JSON");
    }

    // Stripe always sends an id. Without one the delivery cannot be made
    // idempotent, so it is refused rather than applied untracked.
    const eventId = typeof event?.id === "string" ? event.id.trim() : "";
    if (!eventId) throw badRequest("webhook event has no id");
    const type = typeof event.type === "string" ? event.type : "";

    if (!store.recordStripeEvent(eventId, type).inserted) {
      res.json({ received: true, duplicate: true });
      return;
    }

    const session = event.data?.object ?? {};
    // Stripe sends seconds since the epoch; ISO text is what the users row keeps.
    const periodEnd = (value) => {
      const seconds = Number(value);
      return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
    };
    /** True when the account already records a period later than this event's. */
    const isOlderPeriod = (userId, incoming) => {
      if (!incoming) return false;
      const user = store.userById(userId);
      const recorded = user?.plan_renews_at ? Date.parse(user.plan_renews_at) : NaN;
      return Number.isFinite(recorded) && Date.parse(incoming) < recorded;
    };

    let changed = false;
    let ignored = null;

    if (type === "checkout.session.completed" || type === "customer.subscription.updated") {
      const userId = session.metadata?.userId ?? session.client_reference_id;
      const plan = session.metadata?.plan;
      const nextPeriodEnd = periodEnd(session.current_period_end);
      if (userId && typeof plan === "string" && Object.hasOwn(PLANS, plan)) {
        if (isOlderPeriod(userId, nextPeriodEnd)) {
          ignored = "older_period";
        } else {
          store.updateUserPlan(userId, plan, nextPeriodEnd, session.customer ?? null);
          changed = true;
        }
      }
    } else if (type === "customer.subscription.deleted") {
      const userId = session.metadata?.userId;
      if (userId) {
        if (isOlderPeriod(userId, periodEnd(session.current_period_end))) {
          ignored = "older_period";
        } else {
          store.updateUserPlan(userId, "free", null, null);
          changed = true;
        }
      }
    }

    res.json({ received: true, duplicate: false, type, changed, ignored });
  });

  // ------------------------------------------------------- account + health
  app.get("/api/export", requireUser, (req, res) => {
    const data = store.exportUser(req.user.id);
    res.setHeader("content-disposition", `attachment; filename="applywright-export-${nowIso().slice(0, 10)}.json"`);
    res.json(data);
  });

  app.delete("/api/account", requireUser, (req, res) => {
    const body = req.body ?? {};
    const password = assertString(body.password, "password", { max: 200 });
    if (!verifyPassword(password, req.user.pass_hash, req.user.pass_salt)) {
      throw new ApiError(401, "invalid_credentials", "password is incorrect");
    }
    store.deleteUser(req.user.id);
    res.setHeader("set-cookie", clearCookie());
    res.json({ deleted: true });
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      version: config.version,
      provider: model ? "live" : "rules",
      sources: ["arbeitnow", "remotive", "remoteok"],
      stripe: config.stripe.configured,
      db: { jobs: store.countJobs() },
      uptimeSeconds: Number(process.uptime().toFixed(2)),
    });
  });

  // ------------------------------------------------- connectors, style, refine
  // These three modules are optional at boot: they are loaded on first use, so a
  // server can start while a module is still being written, and a missing module
  // degrades to an honest 501 rather than a crash.
  const lazy = (specifier) => {
    let loaded = null;
    return async () => {
      if (!loaded) {
        try {
          loaded = await import(specifier);
        } catch (error) {
          throw notImplemented(`${specifier.split("/").pop()} is not available in this build (${error.code ?? error.message}).`);
        }
      }
      return loaded;
    };
  };
  const loadConnectors = lazy("./lib/connectors/index.js");
  const loadLinkedIn = lazy("./lib/connectors/linkedin.js");
  const loadStyle = lazy("./lib/cv/style.js");
  const loadRefine = lazy("./lib/cv/refine.js");

  app.get("/api/connectors", requireUser, async (req, res) => {
    const connectors = await loadConnectors();
    res.json({ connectors: connectors.CONNECTORS ?? [] });
  });

  app.post("/api/connectors/linkedin", requireUser, async (req, res) => {
    const body = req.body ?? {};
    const text = assertString(body.text, "text", { min: 80, max: 80_000 });
    const linkedin = await loadLinkedIn();
    const parsed = linkedin.parseLinkedInProfile(text);
    if (!parsed?.name && !parsed?.experience?.length) {
      throw new ApiError(422, "unreadable_profile", "no name or roles could be read from that text — paste the profile as it appears on the page, or use the PDF export.");
    }
    res.json({
      profile: parsed,
      confidence: parsed.confidence ?? null,
      looksLikeLinkedIn: linkedin.isLinkedInProfileText(text),
      warnings: parsed.warnings ?? [],
    });
  });

  app.post("/api/cvs/from-profile", requireUser, async (req, res) => {
    const body = req.body ?? {};
    const profile = body.profile;
    if (!profile || typeof profile !== "object") throw badRequest("profile is required");
    const connectors = await loadConnectors();
    const text = connectors.profileToCvText(profile);
    if (!text || text.trim().length < 80) throw new ApiError(422, "empty_profile", "that profile did not contain enough to build a CV");

    const existing = store.countCvs(req.user.id);
    requireQuota(store, req.user, "cvs", existing, "Your plan is full — upgrade to add another CV.");

    const cv = store.createCv({
      userId: req.user.id,
      name: assertString(body.name, "name", { max: 120, required: false }) || `${profile.name ?? "Imported"} — CV`,
      format: "profile",
      text,
      profile: segmentSections(text),
      primary: existing === 0,
    });
    res.status(201).json({ cv: { id: cv.id, name: cv.name, format: cv.format, primary: Boolean(cv.primary_flag), createdAt: cv.created_at }, warnings: profile.warnings ?? [] });
  });

  app.get("/api/style", requireUser, async (req, res) => {
    const cv = resolveCv(req.user, req.query.cvId);
    const styleLib = await loadStyle();
    const style = styleLib.analyseStyle(cv.text);
    // The badge compares the latest tailored summary with the CV's own voice,
    // falling back to the CV against itself when nothing has been tailored.
    const latest = store.listApplications(req.user.id)[0];
    const tailoredSummary = latest?.pack?.tailored?.summary ?? cv.text;
    const match = styleLib.styleMatch(tailoredSummary, cv.text);
    res.json({ cvId: cv.id, style, badge: match.score, reasons: match.reasons });
  });

  app.post("/api/applications/:id/refine", requireUser, async (req, res) => {
    const body = req.body ?? {};
    const instruction = assertString(body.instruction, "instruction", { min: 3, max: 500 });
    const application = store.applicationById(req.params.id, req.user.id);
    if (!application) throw notFound("application not found");
    if (!application.pack?.tailored) throw new ApiError(422, "no_pack", "this application has no tailored pack to refine");

    const cv = store.cvById(application.cv_id, req.user.id);
    if (!cv) throw notFound("the CV behind this application no longer exists");

    const refineLib = await loadRefine();
    const styleLib = await loadStyle().catch(() => null);
    const style = styleLib ? styleLib.analyseStyle(cv.text) : null;

    const refined = await refineLib.refine({ pack: application.pack, instruction, style, model });

    // The refine module returns refined TEXT, not a rebuilt pack: `bullets` is a
    // string[] indexed against the stored objects (which carry section/evidence),
    // and screening answers live under `tailored.screening`, not a pack-level
    // array. Merge deliberately so the pack cannot be corrupted by a spread.
    const bits = refined.refined ?? {};
    const baseTailored = application.pack?.tailored ?? {};
    const baseBullets = Array.isArray(baseTailored.bullets) ? baseTailored.bullets : [];
    const refinedBullets = Array.isArray(bits.bullets) ? bits.bullets : null;
    const mergedBullets = refinedBullets
      ? baseBullets.map((bullet, index) =>
          typeof refinedBullets[index] === "string" ? { ...bullet, rewritten: refinedBullets[index] } : bullet
        )
      : baseBullets;

    const screeningKeys = ["motivation", "noticePeriod", "rightToWork", "salaryExpectation"];
    const screening = { ...(baseTailored.screening ?? {}) };
    if (Array.isArray(bits.answers)) {
      bits.answers.forEach((entry, index) => {
        const answer = typeof entry === "string" ? entry : entry?.answer;
        const question = typeof entry === "object" ? entry?.question : null;
        const key = screeningKeys.find((name) => question && String(question).toLowerCase() === name.toLowerCase()) ?? screeningKeys[index];
        // Never write a placeholder back over a real answer.
        if (key && typeof answer === "string" && answer.trim() && !/^not provided/i.test(answer)) {
          screening[key] = answer;
        }
      });
    }

    const tailoredNext = {
      ...baseTailored,
      ...(typeof bits.summary === "string" && bits.summary.trim() ? { summary: bits.summary } : {}),
      bullets: mergedBullets,
      ...(typeof bits.coverLetter === "string" && bits.coverLetter.trim() ? { coverLetter: bits.coverLetter } : {}),
      screening,
    };

    const rebuilt = buildPack({
      profile: cv.profile,
      cvText: cv.text,
      job: application.pack.job ?? { title: application.title, company: application.company, url: application.url, description: "" },
      tailored: tailoredNext,
    });
    const coverLetterAllowed = can(req.user.plan, "coverLetter").allowed;
    const gatedRebuilt = coverLetterAllowed
      ? rebuilt
      : { ...withoutCoverLetter(rebuilt), coverLetterLocked: COVER_LETTER_LOCK };
    const nextPack = {
      ...application.pack,
      ...gatedRebuilt,
      // The stored tailored source and the refinement trail are gated with the
      // pack, so neither is a back door to the letter on a later read.
      tailored: coverLetterAllowed ? tailoredNext : { ...tailoredNext, coverLetter: "" },
      refinements: [
        ...(application.pack.refinements ?? []),
        {
          instruction,
          at: nowIso(),
          changes: coverLetterAllowed
            ? refined.changes ?? []
            : (refined.changes ?? []).filter((change) => !LETTER_CHANGE_FIELDS.has(String(change?.field))),
        },
      ],
    };
    const updated = store.updateApplication(application.id, req.user.id, { pack: nextPack });
    store.recordUsage(req.user.id, "refine", 1);

    // The response carries the same gate as the stored pack: neither a Free
    // account nor a downgraded one may read a covering letter back out of a
    // refine, in the payload or in the change trail.
    const refinedOut = refined.refined ?? null;
    res.json({
      application: { id: updated.id, title: updated.title, status: updated.status, updatedAt: updated.updated_at },
      refined: refinedOut && !coverLetterAllowed ? { ...refinedOut, coverLetter: "" } : refinedOut,
      changes: coverLetterAllowed
        ? refined.changes ?? []
        : (refined.changes ?? []).filter((change) => !LETTER_CHANGE_FIELDS.has(String(change?.field))),
      mode: refined.mode ?? "rules",
      warnings: refined.warnings ?? [],
    });
  });

  /**
   * The CV editor's agent: propose, never save.
   *
   * `refine` is the engine that already keeps the product's promise — it takes
   * the candidate's instruction, runs the deterministic rules (or one validated
   * model call) and reverts any edit that fails `groundChanges`. This route
   * builds a pack out of the CV's own sections, refuses anything that does not
   * name an editable unit, maps every returned field back to a section, and then
   * runs the grounding check a second time against the whole CV with the figure
   * rule switched on. Only proposals reach the client; neither the CV nor the
   * usage table is written, and accepting is a separate PATCH from the editor.
   *
   * Request:  { instruction, scope? }
   * Response: { proposed: { text, sections }, changes: [{ field, section,
   *             before, after, why }], rejected: [{ field, section, before,
   *             after, reasons }], mode, warnings, scope, saved: false }
   */
  app.post("/api/cvs/:id/assist", requireUser, async (req, res) => {
    const body = req.body ?? {};
    const cv = store.cvById(req.params.id, req.user.id);
    if (!cv) throw notFound("CV not found");

    const instruction = assertString(body.instruction, "instruction", { min: 3, max: 500 });
    const scopes = ["cv", "summary", "experience", "education", "skills", "other"];
    const scope = typeof body.scope === "string" && body.scope.trim() ? body.scope.trim().toLowerCase() : "cv";
    if (!scopes.includes(scope)) throw badRequest(`scope must be one of ${scopes.join(", ")}`);

    const profile = cv.profile && typeof cv.profile === "object" && cv.profile.sections ? cv.profile : segmentSections(cv.text);
    const document = documentFromProfile(profile);

    // One editable unit per piece of line-level text. `summary` is refine's own
    // summary field; everything else is addressed as a bullet, which is how
    // refine edits a single line. A bullet's marker is stripped from `before`
    // and restored by applyChange, so a rewrite cannot eat the "- ".
    const units = [];
    const bulletText = (line) => line.replace(/^\s*(?:[-*•▪◦‣·]|\d+[.)])\s+/, "").trim();
    const experience = String(document.sections.experience ?? "");
    const experienceBullets = experience.split("\n").filter((line) => /^\s*(?:[-*•▪◦‣·]|\d+[.)])\s+/.test(line));
    if (experienceBullets.length) {
      for (const line of experienceBullets) units.push({ section: "experience", before: bulletText(line) });
    } else if (experience.trim()) {
      units.push({ section: "experience", before: experience });
    }
    for (const key of ["education", "skills", "other"]) {
      const value = String(document.sections[key] ?? "");
      if (value.trim()) units.push({ section: key, before: value });
    }

    const pack = {
      cvTextPlain: cv.text,
      coverLetterMd: "",
      answers: [],
      tailored: {
        summary: String(document.sections.summary ?? ""),
        bullets: units.map((unit) => ({ original: unit.before, rewritten: unit.before, section: unit.section })),
        keywordsPlaced: [],
      },
    };

    // A target word in the hint steers the rules path at the requested field.
    // "bullets" is refine's word for line-level text, which is what education,
    // skills and other are here; the scope filter below is the real selector.
    const hints = { summary: "summary", experience: "bullets", education: "bullets", skills: "bullets", other: "bullets" };
    const hint = scope === "cv" ? "" : hints[scope] ?? "";

    const refineLib = await loadRefine();
    const refined = await refineLib.refine({ pack, instruction, ...(hint ? { style: hint } : {}), model });

    const proposed = { ...document.sections };
    const changes = [];
    const rejected = [];

    // refine reverts a proposal that fails its own grounding check and reports
    // the reason in `warnings`, not structurally. The editor has to show what was
    // refused next to what was accepted — that combination is the product's whole
    // argument — so those notes are lifted into `rejected` here. The proposed
    // text is discarded inside refine, so `before`/`after` are empty for these
    // entries; the reason is the part that matters. The raw warnings still ship.
    const revertNote =
      /^(?:a model change to|an? .+? change to) (.+?) (?:was reverted because it failed the grounding check: (.+)|would have altered the wording you quoted, so it was not applied)$/;
    const sectionForRefineLabel = (label) => {
      if (/^the summary$/i.test(label)) return "summary";
      const bullet = /^bullet (\d+)$/i.exec(label);
      if (bullet) return units[Number(bullet[1]) - 1]?.section ?? "unknown";
      if (/cover letter/i.test(label)) return "cover letter";
      return "unknown";
    };
    for (const note of refined.warnings ?? []) {
      const match = revertNote.exec(String(note).trim());
      if (!match) continue;
      const section = sectionForRefineLabel(match[1]);
      // Out-of-scope refusals are as much noise as out-of-scope changes: asking
      // for the summary should not list a refused cover-letter rewrite.
      if (scope !== "cv" && section !== scope && section !== "unknown") continue;
      rejected.push({
        field: "refine",
        section,
        before: "",
        after: "",
        reasons: [match[2] ?? "the wording you quoted would have been altered"],
      });
    }

    for (const change of refined.changes ?? []) {
      const field = String(change.field ?? "");
      const before = String(change.before ?? "");
      const after = String(change.after ?? "");
      const why = String(change.reason ?? "");
      let unit = null;
      if (field === "summary") unit = { section: "summary", before: document.sections.summary };
      else if (field.startsWith("bullets.")) unit = units[Number(field.split(".")[1])] ?? null;

      if (!unit) {
        rejected.push({
          field,
          section: field === "coverLetter" ? "cover letter" : field || "unknown",
          before,
          after,
          reasons: ["that field is not part of this CV, so it was not proposed"],
        });
        continue;
      }
      // Out-of-scope proposals are dropped rather than reported: asking for the
      // summary and being shown four education edits is noise, not a refusal.
      if (scope !== "cv" && unit.section !== scope) continue;

      // The independent gate. refine checks each field as it edits it; this is
      // the same check re-run from the route, against the whole stored CV, so a
      // future change inside refine cannot quietly widen what reaches the user.
      const check = refineLib.groundChanges(before, after, { context: cv.text });
      if (!check.ok) {
        rejected.push({ field, section: unit.section, before, after, reasons: check.reasons });
        continue;
      }

      const next = applyChange(proposed[unit.section], before, after);
      if (next === null) {
        rejected.push({
          field,
          section: unit.section,
          before,
          after,
          reasons: ["that text is no longer in the section it names"],
        });
        continue;
      }
      proposed[unit.section] = next;
      changes.push({ field, section: unit.section, before, after, why });
    }

    res.json({
      cvId: cv.id,
      scope,
      // `mode` is what produced the changes; `modelConfigured` says whether a
      // model was available at all. Without the second field a fully refused
      // model run is indistinguishable from a server that has no model, and the
      // editor would tell the user the wrong thing about its own capabilities.
      mode: refined.mode === "model" ? "model" : "rules",
      modelConfigured: Boolean(model),
      proposed: { text: reconstructCvText({ contact: document.contact, sections: proposed }), sections: proposed },
      changes,
      rejected,
      warnings: refined.warnings ?? [],
      saved: false,
      advisory:
        "This is a proposal and nothing has been saved. Every string above passed the grounding check: no new number, employer, job title, qualification or date, and no figure dropped. Accepting a change in the editor is what saves it.",
    });
  });

  // ----------------------------------------------------------------- pages
  app.post("/api/contact", async (req, res) => {
    const body = req.body ?? {};
    const name = assertString(body.name, "name", { max: 120 });
    const email = assertString(body.email, "email", { max: 254 });
    if (!isValidEmail(email)) throw badRequest("email must be a valid address");
    const message = assertString(body.message, "message", { max: 4_000 });
    // Honeypot: a filled hidden field means a bot. Accept, discard, never store.
    if (String(body.website ?? "").trim()) return res.json({ ok: true });

    const line = JSON.stringify({ at: nowIso(), name, email, message, requestId: req.requestId });
    await appendFile(join(config.dataDir, "contact.jsonl"), `${line}\n`, "utf8").catch(() => {});
    res.json({ ok: true });
  });

  app.use("/assets", express.static(join(config.publicDir, "assets"), { index: false, dotfiles: "deny", setHeaders: (res) => res.setHeader("cache-control", "no-cache") }));
  app.get("/favicon.ico", (req, res) => res.redirect(301, "/assets/favicon.svg"));

  // The SPA's own assets live under /app, so they must be served before the
  // catch-all page route or every request for app.js would return app.html.
  app.use(
    "/app",
    express.static(join(config.publicDir, "app"), {
      index: false,
      // No directory redirect: /app must serve the SPA shell directly, not 301 to /app/
      redirect: false,
      dotfiles: "deny",
      setHeaders: (res) => res.setHeader("cache-control", "no-cache"),
    })
  );

  // The bookmarklet is distributed as a plain-text page: the origin is
  // substituted server-side, so the user copies a working `javascript:` URL with
  // no client-side script (CSP script-src 'self') and no SPA dependency.
  app.get("/bookmarklet", async (req, res, next) => {
    try {
      const source = await readFile(join(config.publicDir, "assets", "bookmarklet.js"), "utf8");
      // The artifact is banner-first: a provenance comment, then the scheme. A
      // bookmarklet URL must START with javascript:, and a banner-first paste
      // silently parses as an http: URL, so strip the leading comment block and
      // guarantee the scheme before substituting the origin.
      const address = source
        .replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "")
        .replace(/__ORIGIN__/g, config.site.publicUrl)
        .trim();
      const script = address.startsWith("javascript:") ? address : `javascript:${address}`;
      const escaped = script.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      res.setHeader("cache-control", "no-cache");
      res.type("html").send(`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install the Applywright bookmarklet</title>
<link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/theme.css"><link rel="stylesheet" href="/assets/site.css">
</head><body><main class="wrap section">
<p class="eyebrow">LinkedIn capture</p>
<h1 class="h1" style="max-width:24ch;margin-top:1rem">Install the bookmarklet</h1>
<p class="lede" style="margin-top:1rem">It reads the profile or advert page open in your own browser and copies the text. Nothing is fetched by our server, and no LinkedIn credentials are involved.</p>
<ol class="prose" style="margin-top:2rem;max-width:70ch">
<li>Show your bookmarks bar (Ctrl+Shift+B in Chrome and Edge).</li>
<li>Select all of the text below and drag it onto the bar, or create a bookmark and paste it as the URL.</li>
<li>Open your LinkedIn profile (or any job advert), click the bookmark, then paste into Applywright with Ctrl+V.</li>
</ol>
<label class="field" style="margin-top:2rem;display:block"><span class="legend">Bookmarklet</span>
<textarea class="textarea mono" rows="8" readonly style="margin-top:.5rem;font-size:12px" onclick="this.select()">${escaped}</textarea></label>
<p class="small muted" style="margin-top:1rem">If the page shape is unrecognised the bookmarklet stops and says so rather than half-importing. Manual Ctrl+A / Ctrl+C always works.</p>
</main></body></html>`);
    } catch (error) {
      next(error);
    }
  });
  app.get(APP_ROUTE, async (req, res, next) => {
    try {
      const html = await pages.render("app/app.html", "/app");
      if (!html) return next();
      res.setHeader("cache-control", "no-cache");
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  });

  // The CV editor is its own page rather than an SPA screen: it needs a print
  // stylesheet, a three-pane layout and a document that is not re-rendered on
  // every keystroke. The route is additive, so /app is untouched.
  app.get("/editor", async (req, res, next) => {
    try {
      const html = await pages.render("editor.html", "/editor");
      if (!html) return next();
      res.setHeader("cache-control", "no-cache");
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  });

  for (const [route, file] of PAGES) {
    app.get(route, async (req, res, next) => {
      try {
        const html = await pages.render(file, route);
        if (!html) return next();
        res.setHeader("cache-control", "no-cache");
        res.type("html").send(html);
      } catch (error) {
        next(error);
      }
    });
  }

  app.use("/api", (req, res) => {
    res.status(404).json(errorBody("not_found", `No API route for ${req.method} ${req.originalUrl}`));
  });

  app.use((req, res) => {
    res
      .status(404)
      .type("html")
      .send("<!doctype html><html lang=\"en-GB\"><head><meta charset=\"utf-8\"><title>Not found</title></head><body style=\"font-family:system-ui;padding:3rem\"><h1>Not found</h1><p><a href=\"/\">Back to Applywright</a></p></body></html>");
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      try {
        res.end();
      } catch {
        /* ignore */
      }
      return;
    }
    if (error instanceof ApiError) {
      if (error.extra?.["retry-after"]) res.setHeader("retry-after", error.extra["retry-after"]);
      const body = errorBody(error.code, error.message);
      // A quota refusal is actionable only if the client knows which plan clears it.
      if (error.code === "quota_exceeded" && error.extra?.upgrade) body.error.upgrade = error.extra.upgrade;
      return res.status(error.status).json(body);
    }
    if (error?.type === "entity.too.large") return res.status(413).json(errorBody("payload_too_large", "request body is too large"));
    if (error?.type === "entity.parse.failed") return res.status(400).json(errorBody("invalid_request", "body is not valid JSON"));
    console.error(JSON.stringify({ level: "error", requestId: req.requestId, path: req.originalUrl, message: error?.message, stack: error?.stack?.split("\n").slice(0, 5) }));
    res.status(500).json(errorBody("internal_error", "unexpected server error"));
  });

  return { app, store, db, config, model };
}

export async function startServer(overrides = {}) {
  const config = loadConfig(overrides);
  const { app, store, db, model } = await createApp(config);
  const server = createServer(app);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const scheduler = startAlertScheduler({ store, db, config });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  return {
    app,
    server,
    store,
    db,
    model,
    config,
    port,
    url: `http://${config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host}:${port}`,
    scheduler,
    async close() {
      scheduler.stop();
      await new Promise((resolve) => server.close(resolve));
      try {
        db.close();
      } catch {
        /* already closed */
      }
    },
  };
}

// Re-exported for tests that want to exercise signature verification directly.
export { sessionExpiry, newSessionId };