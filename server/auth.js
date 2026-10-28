/**
 * Authentication: scrypt password hashing, opaque server-side sessions, and a
 * SameSite=Lax cookie. No JWT, nothing sensitive in the cookie, revocation by
 * deleting the row.
 *
 * Account recovery lives here too: single-use recovery codes (the no-email path)
 * and single-use password-reset tokens (the operator path). Both are stored as
 * sha256 digests only.
 */
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";

import { statements } from "./db.js";
import { ApiError, id } from "./util.js";

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

// ------------------------------------------------------------------ recovery

/**
 * Recovery codes are read off a screen, written on paper and typed back in, so
 * the alphabet drops 0/O and 1/I: no code is one smudged character away from a
 * different one. 8 codes of 8 characters are issued once, at registration.
 */
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_CHARS = 8;
const CODE_BLOCK = 4;

export const RECOVERY_CODE_COUNT = 8;

/** 32 random bytes, hex — the token in a reset link. */
export const RESET_TOKEN_BYTES = 32;
export const RESET_TOKEN_MINUTES = 60;

const randomChar = () => RECOVERY_ALPHABET[randomInt(0, RECOVERY_ALPHABET.length)];

/** A fresh code in its canonical `aw-XXXX-XXXX` form. */
export function newRecoveryCode() {
  let body = "";
  for (let index = 0; index < CODE_CHARS; index += 1) body += randomChar();
  return `aw-${body.slice(0, CODE_BLOCK)}-${body.slice(CODE_BLOCK)}`;
}

/**
 * Accept a code as a person types it: any case, dashes and spaces anywhere, the
 * `aw-` prefix optional. Returns the canonical form, or null when the input could
 * not be a code at all.
 */
export function normaliseRecoveryCode(input) {
  const cleaned = String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const body = cleaned.length === CODE_CHARS + 2 && cleaned.startsWith("AW") ? cleaned.slice(2) : cleaned;
  if (body.length !== CODE_CHARS) return null;
  for (const char of body) if (!RECOVERY_ALPHABET.includes(char)) return null;
  return `aw-${body.slice(0, CODE_BLOCK)}-${body.slice(CODE_BLOCK)}`;
}

/**
 * sha256 of the canonical code, salted with the account id. The binding means one
 * account's digest is useless against another account, and the database never
 * holds anything that can be replayed as a code.
 */
export function hashRecoveryCode(userId, canonicalCode) {
  return createHash("sha256").update(`${userId}:${canonicalCode}`).digest("hex");
}

export function newResetToken() {
  return randomBytes(RESET_TOKEN_BYTES).toString("hex");
}

export function hashResetToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function resetExpiryIso(minutes = RESET_TOKEN_MINUTES) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/**
 * With no SMTP on this host a reset link has to reach the operator somehow. The
 * database keeps only the token's sha256, so the plaintext token is also appended
 * to a ledger stored next to the database. No route serves that file: it is
 * readable on the host and through `node scripts/reset-password.mjs --pending`.
 * It is append-only audit — a consumed or expired token in it is already dead.
 */
export const RESET_LEDGER_FILE = "pending-resets.jsonl";

export const resetLedgerPath = (dataDir) => join(dataDir, RESET_LEDGER_FILE);

export async function recordResetToken(dataDir, { email, token, expiresAt }) {
  const line = JSON.stringify({ at: new Date().toISOString(), email, token, expiresAt });
  // mode is honoured where the platform has POSIX permissions; Windows ignores it.
  await appendFile(resetLedgerPath(dataDir), `${line}\n`, { encoding: "utf8", mode: 0o600 });
}

/** token → { email, expiresAt, at } for every link this host has issued. */
export async function readResetTokens(dataDir) {
  let text;
  try {
    text = await readFile(resetLedgerPath(dataDir), "utf8");
  } catch {
    return new Map();
  }
  const tokens = new Map();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (typeof row?.token === "string" && row.token) tokens.set(row.token, row);
    } catch {
      /* a torn line must not break a reset */
    }
  }
  return tokens;
}

/**
 * Recovery and reset persistence. These statements live here rather than in
 * store.js because they touch only the two recovery tables and both the server
 * and the operator script already import this module.
 */
export function createAuthStore(db) {
  const q = statements(db);
  const at = () => new Date().toISOString();

  return {
    /** Replace the scrypt hash for an account. Never stores the password. */
    setPassword(userId, { hash, salt }) {
      q("UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?").run(hash, salt, userId);
    },

    revokeSessions(userId) {
      return q("DELETE FROM sessions WHERE user_id = ?").run(userId).changes;
    },

    /** Keep the session that performed the change signed in; end every other. */
    revokeOtherSessions(userId, keepSessionId) {
      return q("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(userId, keepSessionId ?? "").changes;
    },

    issueRecoveryCodes(userId, codes) {
      const now = at();
      q("DELETE FROM recovery_codes WHERE user_id = ? AND used_at IS NULL").run(userId);
      for (const code of codes) {
        q("INSERT INTO recovery_codes (id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)").run(
          id("rc"),
          userId,
          hashRecoveryCode(userId, code),
          now
        );
      }
      return codes.length;
    },

    countUnusedRecoveryCodes(userId) {
      return q("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL").get(userId).n;
    },

    /**
     * Spend one code. A single UPDATE, so two requests racing the same code
     * cannot both succeed — exactly one changes a row.
     */
    consumeRecoveryCode(userId, canonicalCode) {
      const hash = hashRecoveryCode(userId, canonicalCode);
      return (
        q("UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL").run(
          at(),
          userId,
          hash
        ).changes === 1
      );
    },

    /** Store a new reset link. Only the digest is written, never the token. */
    issuePasswordReset(userId, { token, expiresAt }) {
      // Only the newest link may work: asking again withdraws the previous one, so
      // an old link cannot be replayed after a new request.
      q("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL").run(userId);
      q(
        "INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
      ).run(id("pr"), userId, hashResetToken(token), at(), expiresAt);
    },

    passwordResetByToken(token) {
      return q("SELECT * FROM password_resets WHERE token_hash = ?").get(hashResetToken(token)) ?? null;
    },

    consumePasswordReset(token) {
      return (
        q("UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(
          at(),
          hashResetToken(token)
        ).changes === 1
      );
    },

    clearPendingResets(userId) {
      return q("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL").run(userId).changes;
    },

    /** Unused, unexpired links, oldest expiry first — the operator's work queue. */
    pendingPasswordResets() {
      return q(
        `SELECT r.id, r.token_hash, r.created_at, r.expires_at, u.email
           FROM password_resets r JOIN users u ON u.id = r.user_id
          WHERE r.used_at IS NULL AND r.expires_at > ? AND u.deleted_at IS NULL
          ORDER BY r.expires_at`
      ).all(at());
    },
  };
}
