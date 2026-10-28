# Recovering an Applywright account

The username is the email address on the account. Three paths lead back in, and none of
them needs a mail server: a recovery code, an operator-issued reset link, and — when the
old password is still known — a change from inside the account.

This document says exactly what happens on each path, what is stored where, what the build
deliberately does not do, and what has to change when SMTP is eventually configured.

## The three paths

| Path | Who starts it | What it needs | What it ends |
|---|---|---|---|
| **Recovery code** | the account holder | one of the eight codes shown at sign-up | every session on the account |
| **Operator reset link** | the holder asks; the operator delivers | shell access on the host, then one link, single use, 60 minutes | every session on the account |
| **Change password** | a signed-in holder | the current password | every *other* session; the current one stays signed in |

There is no fourth path. Nothing is emailed in this build, no security question exists, and
the API cannot recover a password without either a code or a token.

## What a locked-out person does, step by step

### 1. They still have their recovery codes

1. Open `/reset` (linked from sign-in as **Forgotten your password?**).
2. In **Use a recovery code** enter the email address, one code in the form
   `aw-XXXX-XXXX`, and the new password twice. Capitalisation does not matter and the dashes
   are optional; `0/O` and `1/I` never appear in a code.
3. Submit. The password is replaced, every session on the account is revoked, and the code is
   marked spent. The page says so; sign in with the new password.

Each of the eight codes works once. Codes are not reissued anywhere in the UI: when fewer
than eight are left there is no screen that shows the count in this build, so a holder who
suspects a leak should ask the operator for a reset link and treat the rest as suspect.

### 2. They have no codes: the operator path

1. Open `/reset` and use **Request a reset link** with the email address. The answer is
   always the same, whether or not the address has an account.
2. The page tells them the truth: *"a reset link is issued to the operator, not emailed, in
   this build"*. Nothing arrives in a mailbox, because there is no mail transport.
3. They contact the operator through whatever channel they already have — the same one they
   would use to ask for anything else.
4. On the host, the operator runs:

   ```bash
   node scripts/reset-password.mjs --pending
   ```

   That prints every unexpired link with the address it belongs to, when it was requested,
   when it expires, and the link itself:

   ```text
   1 unexpired reset link(s) on /opt/applywright/data/applywright.db

     ada@example.com
       requested 2026-10-28T05:59:06.793Z   expires 2026-10-28T06:59:06.792Z (60 min)
       link      http://127.0.0.1:3160/reset?token=ec4a79d6…254d
   ```

5. The operator passes the link on by hand. The holder opens it and sets a new password; the
   link works once and dies after 60 minutes. Requesting a second link withdraws the first,
   so only the newest link per account is live.
6. If the operator would rather cut the link out of the loop entirely, the older command
   still exists and is the shortest path of all — it sets a password directly:

   ```bash
   node scripts/reset-password.mjs --email ada@example.com --generate
   node scripts/reset-password.mjs --email ada@example.com --password 'a password they chose'
   ```

   Both print the resulting password once and revoke every session. The second form is the
   one to use when the holder is on the phone and can choose their own password.

The script must run against the database the server is using: same host, and `--database`
pointing at the same file when the default `data/applywright.db` is not it. It reads only;
nothing on the website can reach it.

### 3. They know the password and want to replace it

`POST /api/auth/change-password` with `{ currentPassword, newPassword }` and a signed-in
cookie. The current password is verified, the new one must be at least 10 characters, and
every other session is deleted while the requesting one stays signed in. A wrong current
password is a `401`; a short new one is a `400` and changes nothing.

There is no Settings screen for this in the current build — the endpoint is API-only:

```bash
curl -X POST http://127.0.0.1:3160/api/auth/change-password \
  -H 'content-type: application/json' -H 'origin: http://127.0.0.1:3160' \
  -b 'aw_session=<session cookie>' \
  -d '{"currentPassword":"the old one","newPassword":"the new one at least 10 chars"}'
```

### 4. They have forgotten the username

The username **is** the email address. If they cannot remember which address they used, they
use **Forgotten your username?** on `/reset`, which calls `POST /api/auth/forgot-username`.
It answers `200 {ok: true}` always and never returns an address — the page tells them *"if
that address has an account, the operator has been notified"*. What "notified" means here is
one line in `data/recovery-requests.jsonl` on the host, which the operator can read. It is
not an email.

## What is stored, and what is not

Two tables were added for this (schema version 2):

```sql
CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
```

- **Recovery codes.** Eight per account, `aw-XXXX-XXXX`, from an alphabet with no `0/O/1/I`.
  Stored as `sha256("<userId>:<canonical code>")`. The plaintext exists only in the
  registration response — one moment, once — and is never written down. Spending a code is a
  single conditional `UPDATE`, so two requests racing the same code cannot both win.
- **Reset tokens.** 32 random bytes, hex, in the link. The database stores `sha256(token)`
  only. The plaintext is also appended to `data/pending-resets.jsonl` on the host — that
  ledger is how the operator can print a link at all, since the database deliberately cannot
  reproduce it. No route serves the file; it sits next to the database, not under `public/`.
  It is append-only audit: a line for a spent or expired token is already dead weight.
- **Consumption.** `used_at` is set on use; an unexpired row is required for the link to
  work. Expiry is 60 minutes from issue.
- **Revocation.** A recovery-code reset, a token reset and a direct operator reset delete
  every session for the account. A change from inside the account deletes every session
  except the one that made the change. Any pending reset links are withdrawn when the
  password changes by any of those routes, so an old link cannot outlive the password it was
  issued against.
- **Deletion.** Both tables cascade from `users`, so deleting an account leaves no codes or
  links behind.
- **Requests.** `data/recovery-requests.jsonl` records every `/forgot` and
  `/forgot-username` call with the address and whether an account matched. It is the
  operator's audit trail, and it is the only sense in which the UI's phrase "the operator has
  been notified" is true on a host with no mail transport.

## The honest limitation

**No reset email is sent in this build.** There is no SMTP transport configured on the host,
so:

- `/api/auth/forgot` creates a single-use link and records the request; it never returns the
  token and never emails it. Anyone with the link can use it, so the only thing standing
  between a stranger and the link is shell access to the host.
- A locked-out holder with no recovery code **and** no way to reach the operator cannot get
  back in by themselves. That is a real limitation, not a temporary glitch; the recovery-code
  path exists precisely so it is not the only one.
- Everything else is enforced in code rather than promised in copy: no account enumeration
  (identical bodies for known and unknown addresses, and for a wrong code against an unknown
  address), single use, 60-minute expiry, full session revocation, and no plaintext secrets in
  the database. Response bodies are identical; response *time* is not equalised, because a
  known address does one extra database write before the answer. That is a millisecond-scale
  signal behind the auth rate limit, worth stating rather than papering over.
- Recovery codes, reset creation and reset redemption share the auth rate-limit bucket
  (10 requests a minute per IP by default), so guessing a code costs the same as guessing a
  password.
- Not in this build: a screen that shows how many codes remain, reissuing codes, a Settings
  screen for `change-password`, and any web console for the operator. The operator path is a
  shell script by design.

## What changes when SMTP is configured

The token machinery does not change. Only delivery does:

1. **Send instead of record.** `/api/auth/forgot` keeps creating the same row with the same
   60-minute expiry, then sends the link (`${PUBLIC_URL}/reset?token=…`) through the mail
   transport instead of leaving it on the host ledger. The API response stays exactly
   `200 {ok: true}` — an email-enabled build must not become an account oracle.
2. **Keep the ledger or drop it.** Once mail is delivered, `data/pending-resets.jsonl` is no
   longer needed for delivery. Keep it for audit, or stop writing it; if it is dropped, the
   `--pending` listing falls back to showing the address and expiry only.
3. **Configuration.** Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
   (and a TLS choice) to `server/config.js` and to the deployment environment. A missing
   value must degrade to the current behaviour rather than fail sign-in.
4. **Copy.** The reset page, this document and the request-confirmation message all say the
   link is issued to the operator. In an email-enabled build that sentence becomes false and
   must be replaced, and the operator path becomes a fallback for a bounced or filtered
   message rather than the primary route.
5. **Tests.** The reset tests drive the host ledger to obtain a token. Under SMTP they should
   inject a stub transport that records the outgoing message instead of changing the
   database assertions, which are about single use, expiry and revocation and stay valid.
6. **Recovery codes stay.** They are the offline fallback for a mailbox the holder has lost
   access to, which is the same problem that started this work.

## Surface added

| Endpoint | Body | Answers |
|---|---|---|
| `POST /api/auth/change-password` | `{currentPassword, newPassword}` | `{ok, revokedSessions}`; `401` wrong current, `400` weak new |
| `POST /api/auth/recover` | `{email, code, password}` | `{ok}`; `400 invalid_recovery_code` for a wrong code, a spent code or an unknown address |
| `POST /api/auth/forgot` | `{email}` | always `200 {ok:true}`, never the token |
| `POST /api/auth/forgot-username` | `{email}` | always `200 {ok:true}`, never the address |
| `POST /api/auth/reset` | `{token, password}` | `{ok}`; `400 invalid_reset_token` with an expired, used or unknown link |

`POST /api/auth/register` now also returns `recoveryCodes: string[]` once, with
`cache-control: no-store`.

The migration is idempotent by construction: `migrate()` executes
`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` on every boot, so an existing
version-1 database gains the two tables and three indexes and nothing else is touched. To
confirm on a live file:

```bash
node -e "import('./server/db.js').then(async ({openDatabase}) => { const db = openDatabase('data/applywright.db'); console.log(db.prepare(\"SELECT value FROM meta WHERE key='schema_version'\").get(), db.prepare(\"SELECT name FROM sqlite_master WHERE name IN ('recovery_codes','password_resets')\").all()); db.close(); })"
```

Run it twice; the second run reports the same version and the same two tables.
