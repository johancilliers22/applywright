# Deploying Applywright

This runbook takes Applywright from `http://127.0.0.1:3160` on a laptop to a hostname on
the public internet. It covers one Linux host, Caddy terminating TLS, and a choice of one
process supervisor: systemd or pm2.

Two things are different from a project that ships deployment artefacts. This repository
contains no systemd unit, no pm2 ecosystem file and no `Caddyfile`, so the files below are
content to create rather than files to copy. And there is no build step: what you copy is
what runs.

Install path used throughout: `/opt/applywright`. Configuration:
`/etc/applywright/applywright.env`. Hostname: `applywright.example.com`, by convention;
substitute the name you control. The app listens on `127.0.0.1:3160`.

## What you supply

Four things cannot come from the repository:

- **DNS.** An `A` or `AAAA` record for `applywright.example.com` pointing at the host, in
  a zone you control. Caddy cannot issue a certificate until the name resolves here.
- **A certificate.** Caddy obtains and renews one over ACME once ports 80 and 443 are
  reachable. Nothing here issues a certificate for you.
- **A model key**, if you want model-backed tailoring. Leave `MODEL_API_KEY` empty and
  the product runs on its deterministic rule-based rewriter — a supported state, not a
  degraded one.
- **Stripe keys**, if you want to charge for plans. Without them the pricing endpoints
  answer 501 and every other feature still works.

Model and Stripe credentials are the operator's responsibility. They are never in this
repository, never in the code, never in a file the web server can serve, and never sent to
the browser. On the host they live only in `/etc/applywright/applywright.env`, outside the
checkout.

## 1. Prerequisites

- A Linux host you administer, with `sudo`. Debian/Ubuntu commands are shown.
- **Node 22.5 or newer**, because the database layer uses `node:sqlite`, which arrived in
  22.5.0. The commands below install Node 24 from NodeSource, which needs no flag. If your
  Node lives somewhere other than `/usr/bin/node`, edit `ExecStart` in the unit.
- Outbound HTTPS from the host: the three job boards, plus your model provider and Stripe
  if you configure them, plus ACME for the certificate.
- Ports 80 and 443 reachable from the internet.
- No `git` on the host. Files are copied in, not cloned.

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version
node -e "require('node:sqlite'); console.log('node:sqlite loads')"
```

The last command must print `node:sqlite loads`. If it does not, the Node build is too old
or the module needs a flag on that release; move to a current release before continuing.

## 2. Install the application

```bash
sudo useradd --system --create-home --home-dir /opt/applywright \
  --shell /usr/sbin/nologin applywright
sudo install -d -o applywright -g applywright -m 0755 /opt/applywright
sudo install -d -o applywright -g applywright -m 0750 /opt/applywright/data
```

Copy the project in, then install the single dependency from the lockfile:

```bash
# from the machine that holds the source
rsync -az --exclude node_modules --exclude data --exclude .env --exclude .env.local \
  ./ deploy@applywright.example.com:/tmp/applywright/

# on the host
sudo rsync -a /tmp/applywright/ /opt/applywright/
sudo chown -R applywright:applywright /opt/applywright
cd /opt/applywright && sudo -u applywright -H npm ci --omit=dev
```

Three details matter here:

- `data/` must exist and be writable by `applywright`. It holds the SQLite database and
  its write-ahead log, and it is the only writable path in the unit in section 5.
- The exclusions for `.env` and `.env.local` matter. `server/config.js` reads those two
  files from the project root if they exist, and on a host the environment must come from
  the service manager instead. Never copy a local env file onto the server.
- `npm ci` requires `package-lock.json`, which is in the tree. Express is the only runtime
  dependency.

Check the configuration resolves from the install path:

```bash
cd /opt/applywright
sudo -u applywright node -e "import('./server/config.js').then((m) => console.log(m.loadConfig().databasePath))"
```

That prints `/opt/applywright/data/applywright.db`. The path is fixed relative to the
checkout: `DATABASE_PATH` is listed in `.env.example` but the config loader does not read
it, so moving the database means moving the checkout or bind-mounting `data/`.

## 3. Configuration

The environment file lives outside the checkout, is mode `0640`, and is owned by the
service user so that both supervisors can read it — systemd reads it as root, pm2 reads it
as `applywright`.

```bash
sudo install -d -o root -g applywright -m 0750 /etc/applywright
sudo install -o applywright -g applywright -m 0640 /dev/null /etc/applywright/applywright.env
sudoedit /etc/applywright/applywright.env
```

Contents:

```ini
PORT=3160
HOST=127.0.0.1
TRUST_PROXY=1
SECURE_COOKIES=1

MODEL_API_KEY=
MODEL_BASE_URL=https://api.deepseek.com/v1
MODEL_NAME=deepseek-chat
MODEL_TIMEOUT_MS=60000
MODEL_MAX_TOKENS=2000

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=
STRIPE_PRICE_SCALE_MONTHLY=
STRIPE_PRICE_SCALE_YEARLY=

AUTH_RATE_LIMIT_PER_MINUTE=10
RATE_LIMIT_PER_MINUTE=120
MAX_BODY_BYTES=8388608
MAX_CV_BYTES=5242880
JOB_FEED_LIMIT=60
JOB_FEED_CACHE_MINUTES=15
ALERTS_SCAN_MINUTES=30

CONTACT_EMAIL=hello@applywright.example
```

Add key values in the editor. Do not type a key onto a command line: it lands in shell
history and in process listings. With every secret empty the server still starts, plans
are visible, checkout answers 501 and tailoring runs on rules — a safe state to deploy and
smoke-test before adding keys.

The four variables that change behaviour in a deployment:

| Variable | Value here | Why |
|---|---|---|
| `PORT` | `3160` | Whatever Caddy proxies to. |
| `HOST` | `127.0.0.1` | Loopback only. Nothing on the internet can reach the app directly. |
| `TRUST_PROXY` | `1` | Set to `1` **only** behind a proxy you control. It makes Express honour `X-Forwarded-For`, so rate limits are per real client, and `X-Forwarded-Proto`, so `req.protocol` is `https` in the RSS link and the Stripe return URLs. Set it back to `0` if you ever expose the port without a proxy. |
| `SECURE_COOKIES` | `1` | Adds `Secure` to the `aw_session` cookie. Correct behind TLS and required in practice; on plain HTTP the browser will not return the cookie and every authenticated call answers 401. |

`EnvironmentFile=` uses systemd rules: one `KEY=value` per line, `#` starts a comment, and
a value containing spaces or `#` must be quoted. The same file is sourced by a shell on
the pm2 path, so keep it to plain `KEY=value` lines.

`ALERTS_SCAN_MINUTES` is worth knowing about even though it is not in the table: the
process scans due saved searches on that interval (30 minutes by default) and `0` turns
the scan off. It is in-process, so it is a second reason to run exactly one instance.

## 4. Caddy as the TLS reverse proxy

Caddy is the only process exposed to the network. It obtains and renews the certificate
over ACME, redirects HTTP to HTTPS, sends HSTS, and proxies to loopback.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
caddy version
```

`/etc/caddy/Caddyfile`:

```caddyfile
applywright.example.com {
	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}

	# CV uploads arrive as base64 JSON: a 5 MB file is about 6.7 MB of body,
	# so the edge cap matches the server's MAX_BODY_BYTES (8 MiB).
	request_body {
		max_size 8MB
	}

	reverse_proxy 127.0.0.1:3160
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
systemctl status caddy --no-pager
```

Notes that save an afternoon:

- **Nothing needs streaming here.** There is no SSE and no WebSocket in this app, so no
  `flush_interval`, no `proxy_buffering off` and no long read timeout. A plain
  `reverse_proxy` is correct.
- **The body limit is the CV upload path.** `MAX_BODY_BYTES` defaults to 8388608 and the
  file cap `MAX_CV_BYTES` to 5242880; base64 inflates a file by about a third, which is
  why the body limit is 8 MB rather than 5 MB. If you lower one, lower the other or a
  valid upload is refused at the edge. `request_body` needs Caddy 2.10 or newer; on an
  older build delete that block and let the server answer 413 `payload_too_large` itself.
- **Cookies must pass through untouched.** Caddy forwards `Cookie` and `Set-Cookie` by
  default. Do not add `header_down -Set-Cookie`, and do not enable any cookie rewriting:
  sessions are the cookie, and stripping it makes every authenticated request a 401.
- **`Host` must be preserved.** Every mutation is checked for same-origin: the `Origin`
  header's host must equal `Host`. Caddy preserves it by default; a proxy that rewrites
  it produces 403 `forbidden` on every form submission.
- **Do not add a second CSP.** The server already sets `Content-Security-Policy`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy` and `x-request-id` on every response. Caddy adds HSTS and
  nothing else is needed.

## 5. Process supervision: systemd

Run one supervisor, not both.

`/etc/systemd/system/applywright.service`:

```ini
[Unit]
Description=Applywright
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=applywright
Group=applywright
WorkingDirectory=/opt/applywright
EnvironmentFile=/etc/applywright/applywright.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=2
TimeoutStopSec=15
KillSignal=SIGTERM
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
ReadWritePaths=/opt/applywright/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now applywright
systemctl status applywright --no-pager
sudo journalctl -u applywright -f
```

What the unit is doing, and the two things not to add:

- `ExecStart` points at `server/index.js`, which starts the server, prints a banner and
  installs `SIGINT`/`SIGTERM` handlers that close the listener and then the database.
  `TimeoutStopSec=15` gives it room; `SIGKILL` mid-checkpoint is what you are avoiding.
- `ProtectSystem=strict` makes the filesystem read-only except
  `ReadWritePaths=/opt/applywright/data`. Everything the app writes — the database, its
  `-wal` and `-shm`, `contact.jsonl` — is under that path.
- Do **not** add `MemoryDenyWriteExecute=true`: V8 needs writable-executable pages for
  JIT and the process will die on the first request.
- `ProtectHome=true` is safe here: at runtime the app reads and writes nothing under a
  home directory, which is why `applywright` has a nologin shell and `/opt/applywright` as
  its home.

## 6. Process supervision: pm2

```bash
sudo npm install -g pm2

sudo -u applywright -H bash -c 'set -a; . /etc/applywright/applywright.env; set +a; \
  cd /opt/applywright && pm2 start server/index.js --name applywright --time'

sudo -u applywright -H bash -c 'pm2 save'
sudo env PATH="$PATH" pm2 startup systemd -u applywright --hp /opt/applywright
```

The `set -a; . file; set +a` sequence exports every value in the env file into the shell
that starts the process, which is how pm2 picks up the configuration. Logs land in
`/opt/applywright/.pm2/logs/applywright-out.log` and `applywright-error.log`; `pm2 logs
applywright` follows them, and `pm2 install pm2-logrotate` keeps them bounded.

One instance only. Do not use `-i max` or cluster mode: the rate-limit buckets, the job
feed cache and the alert scanner are all in the process, and SQLite has one writer. Two
workers would each enforce their own limits, fetch every feed twice, scan the same alerts
twice and contend for the database.

After any change to the env file, reload with it — pm2 keeps an environment snapshot:

```bash
sudo -u applywright -H bash -c 'set -a; . /etc/applywright/applywright.env; set +a; \
  pm2 restart applywright --update-env'
```

## 7. Data directory permissions

```bash
sudo chown -R applywright:applywright /opt/applywright
sudo chmod 0750 /opt/applywright/data
ls -ld /opt/applywright /opt/applywright/data
ls -l /opt/applywright/data
```

`/opt/applywright` is `0755` — code and `public/` are meant to be readable. `data/` is
`0750`, owner `applywright`: the server needs to create and grow `applywright.db`,
`applywright.db-wal` and `applywright.db-shm` in that directory, and nobody else needs to
read CVs from the filesystem. If requests fail with a `readonly database` or `unable to
open database` error, the directory is not writable by `applywright` — check
`ls -ld /opt/applywright/data` and `journalctl -u applywright -n 40`.

Keep `data/` on a local filesystem. SQLite's locking is unreliable over NFS or CIFS, and
the failure mode is corruption rather than an error message.

## 8. Schema creation on boot

There is no migration command. `server/db.js` runs `migrate()` every time the process
opens the database:

- `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for the whole schema, so a
  first boot creates everything and later boots change nothing;
- the version of record is the `meta` table: `schema_version` is written as `1` on every
  boot;
- forward-only. There are no down migrations, no seed rows and no destructive statements.
  A new release adds tables or columns; it never rewrites one.

Pragmas set on every connection: `journal_mode = WAL`, `foreign_keys = ON`,
`busy_timeout = 5000`.

Verify after the first start:

```bash
sudo sqlite3 /opt/applywright/data/applywright.db "select value from meta where key = 'schema_version';"
sudo sqlite3 /opt/applywright/data/applywright.db "PRAGMA journal_mode;"
```

The first prints `1`, the second `wal`. `sqlite3` comes from `sudo apt install -y sqlite3`;
it is a diagnostic tool here, not a dependency of the app.

## 9. Backup and restore

Everything the app owns is in `/opt/applywright/data`. The database is in WAL mode, so a
bare copy of `applywright.db` while the server runs can miss the newest commits — they may
still be in `applywright.db-wal`.

```bash
sudo apt install -y sqlite3
sudo install -d -m 0750 /var/backups/applywright

# consistent copy from a running server, via SQLite's online backup API
sudo sqlite3 /opt/applywright/data/applywright.db \
  ".backup '/var/backups/applywright/applywright-$(date +%F).db'"

# or the whole directory while stopped, which also captures contact.jsonl
sudo tar -czf "/var/backups/applywright/data-$(date +%F).tar.gz" -C /opt/applywright data
```

In root's crontab (`sudo crontab -e`) — note the escaped `%`, which cron requires:

```cron
15 3 * * * sqlite3 /opt/applywright/data/applywright.db ".backup '/var/backups/applywright/applywright-$(date +\%F).db'"
30 3 * * 0 tar -czf "/var/backups/applywright/data-$(date +\%F).tar.gz" -C /opt/applywright data
45 3 * * * find /var/backups/applywright -name 'applywright-*.db' -mtime +14 -delete
```

Check a backup before trusting it:

```bash
sudo sqlite3 /var/backups/applywright/applywright-2026-10-28.db "PRAGMA integrity_check;"
```

`ok` is the only acceptable answer. Restore by stopping the service, clearing the stale
WAL, putting the backup in place and starting again:

```bash
sudo systemctl stop applywright
sudo rm -f /opt/applywright/data/applywright.db-wal /opt/applywright/data/applywright.db-shm
sudo install -o applywright -g applywright -m 0640 \
  /var/backups/applywright/applywright-2026-10-28.db \
  /opt/applywright/data/applywright.db
sudo systemctl start applywright
```

Deleting the old `-wal` and `-shm` is not optional. A WAL left beside a restored database
can be replayed over it, which turns a restore into partial data loss.

These files hold CV text, application history and account rows, so treat backups as
personal data: keep them off shared storage and prune them on the schedule above.

## 10. Upgrade

Take a backup first (section 9), then replace the code with the data untouched:

```bash
# from the machine that holds the source
rsync -az --exclude node_modules --exclude data --exclude .env --exclude .env.local \
  ./ deploy@applywright.example.com:/tmp/applywright/

# on the host
sudo systemctl stop applywright
sudo rsync -a --delete --exclude data --exclude node_modules \
  --exclude .env --exclude .env.local /tmp/applywright/ /opt/applywright/
sudo chown -R applywright:applywright /opt/applywright
cd /opt/applywright && sudo -u applywright -H npm ci --omit=dev
sudo systemctl start applywright
```

`--delete` cannot remove `data/` or `node_modules/` because both are excluded; `rsync`
only deletes excluded paths when `--delete-excluded` is passed, which it is not. Then run
the pre-flight checklist in section 11.

With pm2, use the same two `rsync` commands and replace the stop and start with:

```bash
sudo -u applywright -H bash -c 'set -a; . /etc/applywright/applywright.env; set +a; \
  pm2 stop applywright'
sudo -u applywright -H bash -c 'set -a; . /etc/applywright/applywright.env; set +a; \
  pm2 start applywright --update-env'
```

## 11. Pre-flight checklist

Run these on the host, then against the public name, in one shell so the variables carry
over. Steps 1–3 are read-only. Steps 4–11 create one account, one CV, one report and one
pack, and step 11 deletes the account again, so the whole sequence cleans up after
itself.

Every authenticated step goes through `https://`, not loopback: with `SECURE_COOKIES=1`
the session cookie is marked `Secure` and curl will not send it over `http://`.

```bash
BASE="https://applywright.example.com"
EMAIL="preflight+$(date +%s)@applywright.example"
PASSWORD="preflight-password-1"
JAR="$(mktemp)"
```

```bash
# 1. The process is up and answers on loopback.
curl -sS http://127.0.0.1:3160/api/health

# 2. Only loopback is listening on the port.
ss -ltnp | grep 3160

# 3. The pages that ship are served, and an unknown route 404s as HTML.
for path in / /pricing /sign-in /app; do
  printf '%-10s %s\n' "$path" "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:3160$path")"
done
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3160/no-such-page

# 4. The same health check through Caddy, on the public name.
curl -sS "$BASE/api/health"

# 5. Register an account (password minimum is 10 characters) and keep the cookie.
curl -sS -c "$JAR" -X POST "$BASE/api/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Pre-flight\"}"

# 6. Confirm the session is live and a model is or is not configured.
curl -sS -b "$JAR" "$BASE/api/auth/me"

# 7. Add a CV (text must be at least 80 characters).
curl -sS -b "$JAR" -X POST "$BASE/api/cvs" \
  -H 'content-type: application/json' \
  -d '{"name":"Pre-flight CV","text":"ALEX MORGAN\nSenior Product Engineer\n\nSUMMARY\nProduct engineer with eight years building customer-facing web platforms.\n\nEXPERIENCE\nPlatform Lead - Northgate Digital, London (2022 to present)\n- Led a team of four engineers rebuilding the account-opening platform.\n- Reduced p95 API latency from 840ms to 220ms.\n- Cut cloud spend by 186000 GBP a year.\n\nSKILLS\nTypeScript, JavaScript, Node.js, PostgreSQL, Terraform, AWS, Docker.\n\nEDUCATION\nBSc Computer Science, University of Manchester."}'

# 8. Analyse it against a job description. With no cvId the account's first CV is used.
curl -sS -b "$JAR" -X POST "$BASE/api/analyse" \
  -H 'content-type: application/json' \
  -d '{"jobText":"Senior Platform Engineer. You will own Node.js services, design PostgreSQL schemas, work with Terraform and AWS, run incident reviews and mentor engineers. Salary 95000 to 120000 GBP."}'

# 9. Tailor for that job: this is the pack build and the quota path.
curl -sS -b "$JAR" -X POST "$BASE/api/tailor" \
  -H 'content-type: application/json' \
  -d '{"jobText":"Senior Platform Engineer. Node.js, PostgreSQL, Kafka, Terraform, AWS, incident response, mentoring. Salary 95000 to 120000 GBP.","title":"Senior Platform Engineer","company":"Ledgerline"}'

# 10. Plans, prices and whether Stripe is configured.
curl -sS -b "$JAR" "$BASE/api/billing/plans"

# 11. Delete the pre-flight account (hard delete, cascades to CVs and packs).
curl -sS -b "$JAR" -X DELETE "$BASE/api/account" \
  -H 'content-type: application/json' \
  -d "{\"password\":\"$PASSWORD\"}"
rm -f "$JAR"
```

```bash
# 12. Security headers and rate-limit headers are present on the public response.
curl -sS -D- -o /dev/null "$BASE/api/health" \
  | grep -iE 'content-security-policy|strict-transport-security|x-content-type-options|referrer-policy|x-request-id|x-ratelimit'

# 13. HTTP redirects to HTTPS.
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://applywright.example.com/api/health

# 14. An unknown API route returns the documented JSON error shape.
curl -sS "$BASE/api/nope"
```

Expected results:

- Step 1 returns `"status":"ok"` with `"version":"0.1.0"`, `"provider":"live"` if
  `MODEL_API_KEY` reached the process and `"rules"` if not, `"stripe":true` only with both
  Stripe secrets set, and a `db` object with a job count.
- Step 2 shows `127.0.0.1:3160` and nothing bound to `0.0.0.0:3160`.
- Step 3 prints `200` for each of the four paths and `404` for the unknown one. A page
  that prints `404` is missing its HTML file in `public/`; the route falls through rather
  than erroring, so the file name is the thing to check.
- Step 4 prints the same health object as step 1, through TLS.
- Step 5 returns `{"user":{...}}` with the email you generated. A repeat run with the same
  address returns 409 `email_taken`, which is why the timestamp is in the address.
- Step 6 returns `"plan":"free"` and `"model":"live"` or `"model":"rules"`.
- Step 7 returns `{"cv":{...},"warnings":[]}` with `"format":"txt"` and a segmented
  `profile`.
- Step 8 returns a `report` with a numeric `score`, five `subscores` and a `findings` array.
- Step 9 returns 201 with `"status":"pack_ready"`, a `pack.mode` of `rules` or `model`, and
  a stored score.
- Step 10 returns three plans; `pro` prices are `1900` and `19000` pence, `scale` are
  `4900` and `49000`.
- Step 11 returns `{"deleted":true}`; repeating step 6 with the same cookie jar before it
  is removed returns 401, because the session rows were cascaded away.
- Step 12 prints the CSP, HSTS, `x-content-type-options`, `referrer-policy`,
  `x-request-id` and `x-ratelimit-*` headers.
- Step 13 returns `301` or `308` with an `https://` target.
- Step 14 returns `{"error":{"code":"not_found","message":"No API route for GET /api/nope"}}`
  with status 404.

Deliberately do not test the 429 path: the eleventh bad login in a minute is refused and
your own IP stays limited until that minute ends, and the headers in step 12 already prove
the limiter is wired up.

## 12. Security checklist

- [ ] TLS terminates in Caddy, HTTP redirects to HTTPS, and HSTS is sent.
- [ ] `HOST=127.0.0.1` and `ss -ltnp` shows nothing bound to `0.0.0.0:3160`. The firewall
      allows 80 and 443 only: `sudo ufw allow 80/tcp` and `sudo ufw allow 443/tcp`.
- [ ] `TRUST_PROXY=1` **and** `SECURE_COOKIES=1`, and both only because Caddy is in front.
      If you ever expose the port directly, set both back to `0`.
- [ ] The env file is `/etc/applywright/applywright.env`, mode `0640`, owner
      `applywright`, group `applywright`, outside the checkout:
      `sudo ls -l /etc/applywright/applywright.env`.
- [ ] No env file was copied into the install directory — `server/config.js` reads
      `.env.local` then `.env` from the project root, and `.env.example` is the only
      `.env*` file that belongs there:
      `sudo find /opt/applywright -maxdepth 1 \( -name '.env' -o -name '.env.local' \)`
      must print nothing.
- [ ] No secret value is in the tree:
      `sudo grep -RIn '[M]ODEL_API_KEY=.' /opt/applywright --exclude-dir=node_modules` and
      `sudo grep -RIn '[S]TRIPE_SECRET_KEY=.' /opt/applywright --exclude-dir=node_modules`
      must both print nothing. Empty assignments in `.env.example` do not match either
      pattern; a real key does.
- [ ] Stripe webhook: `STRIPE_WEBHOOK_SECRET` is set, the endpoint
      `https://applywright.example.com/api/billing/webhook` is registered in Stripe, and
      the `stripe-signature` header is verified with HMAC-SHA256 over the request body
      with a 300-second tolerance. With either secret missing the route answers 501 and no
      plan is ever upgraded.
- [ ] Rate limits are the deployed values (10 auth, 120 API per minute) and everything
      stateful is single-process: one instance, no cluster mode, because the limiter, the
      feed cache and the alert scanner all live in the process.
- [ ] Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` when `SECURE_COOKIES=1`, 30-day
      sessions. Logout deletes the session row, so revocation does not wait for expiry.
- [ ] Password hashing is scrypt (N=16384, r=8, p=1) with a per-user salt; passwords under
      10 characters are refused at registration.
- [ ] `data/` is `0750 applywright:applywright`, on a local filesystem, and backups are
      treated as personal data.
- [ ] Node is patched and dependencies come from the lockfile with `npm ci --omit=dev`.
- [ ] Logs are bounded: `journalctl --vacuum-time=30d` for systemd, or
      `pm2 install pm2-logrotate` for pm2.
- [ ] There is no outbound mail requirement, and no SMTP credential to manage: alerts are
      stored in the database and read through the app or the RSS feed.

## 13. Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| `/api/health` reports `"provider":"rules"` when you set a key | The running process does not see `MODEL_API_KEY` | `sudo systemctl show applywright -p EnvironmentFiles`, then restart after editing the env file (pm2: `pm2 restart applywright --update-env`) |
| Checkout returns 501 `not_configured` | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are not both set, or the price id for that plan and interval is empty | Step 10 of the checklist; then the `STRIPE_PRICE_*` values |
| Webhook returns 400 `invalid_signature` | The signing secret does not match the endpoint's secret in Stripe, or something between Stripe and Node rewrote the body | Re-copy the endpoint secret in Stripe; check for a WAF or compression-rewriting proxy in front of Caddy |
| Every mutation returns 403 `forbidden` | The proxy rewrote `Host`, so it no longer matches the `Origin` host | `curl -sS -D- -o /dev/null -X POST "$BASE/api/auth/login" -H 'origin: https://applywright.example.com' -H 'content-type: application/json' -d '{}'` and inspect `Host` handling |
| Sign-in succeeds but the next call is 401 | `SECURE_COOKIES=1` while the browser is on `http://`, so the cookie is never returned | Use `https://`; do not turn the flag off in a TLS deployment |
| 413 `payload_too_large` on a CV upload | `MAX_BODY_BYTES` or Caddy's `request_body` is below the base64 size of the file | Raise both, remembering base64 adds about a third |
| 402 `quota_exceeded` in the pre-flight | The account has used its three free packs this month | Use a fresh `EMAIL`, or wait for the month to turn |
| A route answers 501 `not_configured` | An optional module is missing from the install — the connector, style and refine modules load on first use, so a partial copy fails at request time rather than at boot | Re-copy the tree (section 10) and check `server/lib/connectors/`, `server/lib/cv/style.js` and `server/lib/cv/refine.js` exist |
| `database is locked` | Two processes are writing the same file | `pgrep -af 'server/index.js'` and keep exactly one |
| A marketing page or `/app` returns 404 | Its HTML file is missing from `public/`, so the route falls through to the 404 handler | Compare the file names against the `PAGES` map in `server/app.js` |
| Alerts never produce notifications | `ALERTS_SCAN_MINUTES=0`, the alert's cadence is `manual`, or the service has not been up for a full interval | `journalctl -u applywright --grep alerts.scan`; run `POST /api/alerts/run` by hand to separate a scheduling problem from a matching problem |
| The service starts and exits immediately | Node below 22.5, so `node:sqlite` cannot load | `node --version`, then `journalctl -u applywright -n 40` |

## 14. Rollback

Stop the service, keep `/opt/applywright/data` and `/etc/applywright/applywright.env`
exactly as they are, and put the previous code back with the `rsync` and
`npm ci --omit=dev` steps from section 10 using the earlier revision. Start the service
and re-run steps 1, 4, 5, 8 and 9 of the pre-flight checklist.

The environment file does not change across a code rollback and the data directory is
independent of it, so a rollback is code-only unless the release changed the schema.
Migrations are forward-only and there is no down migration, so if an upgrade added tables
or columns that the older code cannot read, stop the service, restore the matching
`applywright-*.db` backup from section 9 over `data/applywright.db` (deleting the stale
`-wal` and `-shm` first), fix ownership, and start again.

Keep the previous revision's archive or commit hash until the new one has survived a
working day. A rollback that also loses a day of applications is not a rollback.

## 15. Your keys, your responsibility

The model key and the Stripe keys are yours to obtain, rotate and revoke. Applywright does
not ship a default, does not phone home, and does not check them for you. Concretely:

- A missing or expired `MODEL_API_KEY` degrades tailoring to the deterministic rules path.
  The pack is still grounded and still usable; it is less fluent. `/api/health` and
  `/api/auth/me` both tell you which path is live, and every pack response carries
  `mode`.
- Wrong Stripe keys do not break the product — checkout answers 501 or 502 — but they can
  take money. Test in Stripe's test mode, confirm the webhook upgrades a plan, and only
  then switch to live keys. Confirm the signature check with a real test-mode event before
  going live: a webhook that quietly fails leaves a paying customer on the free plan.
- Rotate by editing the env file and restarting the service. Rotating a key is a
  configuration change, not a deployment: no code needs to change, and the database is
  untouched.
