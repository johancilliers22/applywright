/**
 * Authentication: scrypt password hashing, opaque server-side sessions, and a
 * SameSite=Lax cookie. No JWT, nothing sensitive in the cookie, revocation by
 * deleting the row.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ApiError } from "./util.js";

export const COOKIE_NAME = "aw_session";
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export const unauthorized = (message = "Sign in required") =>
  new ApiError(401, "unauthorized", message);

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  }).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  try {
    const expected = Buffer.from(String(hash), "hex");
    const actual = scryptSync(String(password), String(salt), expected.length, {
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 10) {
    throw new ApiError(400, "invalid_request", "password must be at least 10 characters");
  }
  if (password.length > 200) {
    throw new ApiError(400, "invalid_request", "password must be at most 200 characters");
  }
  return password;
}

export function parseCookies(header) {
  const jar = {};
  if (!header) return jar;
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    jar[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return jar;
}

export function sessionCookie(sessionId, { secure = false, maxAgeDays = SESSION_DAYS } = {}) {
  const flags = [
    `${COOKIE_NAME}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeDays * 24 * 60 * 60}`,
  ];
  if (secure) flags.push("Secure");
  return flags.join("; ");
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function newSessionId() {
  return randomBytes(32).toString("hex");
}

export function sessionExpiry(days = SESSION_DAYS) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Origin check for state-changing requests. Browsers always send Origin on
 * cross-origin POST/PATCH/DELETE, so a mismatch is a CSRF attempt.
 */
export function assertSameOrigin(req) {
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.get("origin");
  if (!origin) return; // same-origin form posts without Origin are not trusted anyway: JSON is required
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new ApiError(403, "forbidden", "invalid origin");
  }
  if (host !== req.get("host")) throw new ApiError(403, "forbidden", "cross-origin request refused");
}

/** Public shape of a user — never the hash. */
export const publicUser = (row) =>
  row
    ? {
        id: row.id,
        email: row.email,
        name: row.name ?? null,
        plan: row.plan,
        planRenewsAt: row.plan_renews_at ?? null,
        createdAt: row.created_at,
      }
    : null;
