#!/usr/bin/env node
/**
 * Operator password recovery. Run this on the server host when someone cannot
 * sign in — no email transport is configured, so this is the recovery channel.
 *
 *   node scripts/reset-password.mjs --list
 *   node scripts/reset-password.mjs --pending
 *   node scripts/reset-password.mjs --email you@example.com --generate
 *   node scripts/reset-password.mjs --email you@example.com --password 'new password here'
 *
 * `--pending` is the "forgot password" queue: every unexpired reset link, with the
 * address it belongs to, when it expires, and the link itself. The database stores
 * only sha256(token); the plaintext is in the host-only ledger beside it
 * (data/pending-resets.jsonl), which is why the token can be printed here and
 * nowhere else. Nothing in this script ever prints a hash or a session token.
 */
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openDatabase } from "../server/db.js";
import { createAuthStore, hashPassword, hashResetToken, readResetTokens, validatePassword } from "../server/auth.js";
import { nowIso } from "../server/util.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = args[index + 1];
  return next && !next.startsWith("--") ? next : true;
};

const databasePath = flag("database") || join(ROOT, "data", "applywright.db");
const db = openDatabase(databasePath);
const accounts = createAuthStore(db);
const users = db.prepare("SELECT id, email, name, plan, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at").all();

// Where the running server is reachable. PUBLIC_URL overrides it; the default is
// the same one the server uses when nothing is configured.
const publicUrl = String(process.env.PUBLIC_URL || "http://127.0.0.1:3160").replace(/\/+$/, "");

const readPassword = async () => {
  const supplied = flag("password");
  if (typeof supplied === "string") return supplied;
  // Generated: long, unambiguous, and printed once so it can be pasted into a
  // password manager. 24 bytes base64url is ~32 characters.
  return `aw-${randomBytes(18).toString("base64url")}`;
};

/** Print the unexpired reset links, newest expiry last. */
const listPending = async () => {
  const rows = accounts.pendingPasswordResets();
  if (!rows.length) {
    console.log(`no unexpired reset links on ${databasePath}`);
    return;
  }

  const ledger = await readResetTokens(dirname(databasePath));
  const tokenByHash = new Map();
  for (const record of ledger.values()) tokenByHash.set(hashResetToken(record.token), record.token);

  console.log(`${rows.length} unexpired reset link(s) on ${databasePath}\n`);
  for (const row of rows) {
    const minutes = Math.max(0, Math.round((Date.parse(row.expires_at) - Date.now()) / 60_000));
    const token = tokenByHash.get(row.token_hash);
    console.log(`  ${row.email}`);
    console.log(`    requested ${row.created_at}   expires ${row.expires_at} (${minutes} min)`);
    if (token) {
      console.log(`    link      ${publicUrl}/reset?token=${token}`);
    } else {
      console.log("    link      not on this host any more — ask them to request a new one, or set a password with --email <address> --generate");
    }
    console.log("");
  }
  console.log("send the link by hand: this build does not send email. A link works once, and only the newest one per account is live.");
};

const main = async () => {
  if (flag("pending")) {
    await listPending();
    return;
  }

  if (flag("list") || args.length === 0) {
    if (!users.length) {
      console.log("no accounts on this database");
      return;
    }
    console.log(`${users.length} account(s) on ${databasePath}\n`);
    for (const user of users) {
      console.log(`  ${user.email}${user.name ? `  (${user.name})` : ""}  ·  ${user.plan}  ·  created ${user.created_at.slice(0, 10)}`);
    }
    console.log("\nreset one with: node scripts/reset-password.mjs --email <address> --generate");
    console.log("see pending links with the same command plus --pending");
    return;
  }

  const email = String(flag("email") || "").trim().toLowerCase();
  if (!email) {
    console.error("pass --email, or --list to see the accounts");
    process.exitCode = 1;
    return;
  }
  const user = users.find((row) => row.email === email);
  if (!user) {
    console.error(`no account for ${email}`);
    process.exitCode = 1;
    return;
  }

  const password = await readPassword();
  validatePassword(password);
  const { hash, salt } = hashPassword(password);

  db.prepare("UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?").run(hash, salt, user.id);
  // A password reset must end every existing session.
  const revoked = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id).changes;

  console.log(`password reset for ${user.email}`);
  console.log(`new password: ${password}`);
  console.log(`sessions revoked: ${revoked}   (${nowIso()})`);
  console.log("\nSign in with it, then change it in Settings if you want your own.");
};

main()
  .catch((error) => {
    console.error("reset failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  });
