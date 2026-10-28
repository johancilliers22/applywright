# Serving Applywright on intelligentartificial.net

The domain-and-TLS companion to [`docs/DEPLOY.md`](DEPLOY.md). DEPLOY.md covers installing the
app on a host; this file covers the part that is not in the repository: the zone, the records,
who terminates TLS, and the environment the process needs once it answers on a public name.

Product is **Applywright**. The company and site is **Intelligent Artificial**. The canonical
address is **https://intelligentartificial.net**. The site footer now carries "Applywright by
Intelligent Artificial" and that link, and `/about` names both.

## 0. Status, stated plainly

- Nothing here has been executed. No record exists for this project, no host has been
  provisioned, no tunnel has been created, no certificate has been issued or installed, and no
  Cloudflare or VPS account is referenced. The hostnames below are the intended configuration,
  not a report of a live one.
- The repository still carries placeholder identity. `PUBLIC_URL` defaults to
  `http://127.0.0.1:3160` and `CONTACT_EMAIL` to `hello@applywright.example`
  (`server/config.js`). The product works with neither set; a public domain needs both.
- Two names are in play: the apex `intelligentartificial.net` and `www.intelligentartificial.net`.
  This document assumes the apex is canonical. **The app does not redirect between them** — the
  only redirect in `server/app.js` is `/favicon.ico` — so a www→apex redirect is a rule at the
  proxy or at Cloudflare, not something the application will do.

## 1. The three DNS and TLS decisions only Johan can make

| # | Decision | Options | What it settles |
|---|---|---|---|
| 1 | Where the zone is administered | Registrar nameservers, or Cloudflare nameservers | Where §2 records are created, and whether the tunnel shape is even available |
| 2 | Hosting shape | VPS with a public IP, or the existing PC behind a named Cloudflare tunnel | `A`/`AAAA` at the apex, or a `CNAME` to the tunnel |
| 3 | Who terminates TLS | Caddy + Let's Encrypt on the host, or Cloudflare's edge certificate | Who holds the private key, and which ports must be reachable |

Decision 2 and decision 3 travel together: a VPS with a public IP fits §2.2/§3.1, the PC behind a
tunnel fits §2.3/§3.2. Mixing them (a tunnel in front of a Caddy host, or a public IP behind the
Cloudflare proxy while Caddy tries HTTP-01) is where most of the known traps in this file live.

## 2. DNS records

### 2.1 Find out who holds the zone

```bash
dig +short NS intelligentartificial.net
```

If the answer ends in `ns.cloudflare.com`, the records are created in the Cloudflare dashboard and
the tunnel shape is available. If it is the registrar's nameservers, records are created there —
and the tunnel shape first needs a nameserver change at the registrar, which is an account action
(§9).

### 2.2 Pointing at a host with a public IP (VPS shape)

At whoever hosts the zone:

```
intelligentartificial.net.       A       203.0.113.10                    300
intelligentartificial.net.       AAAA    2001:db8::10                    300   # only if the host has a static IPv6
www.intelligentartificial.net.   CNAME   intelligentartificial.net.      300
```

- `203.0.113.10` and `2001:db8::10` are documentation addresses (RFC 5737 / RFC 3849). Substitute
  the host's real addresses; do not copy these.
- Apex is `A`/`AAAA` because a plain DNS host cannot serve a `CNAME` at the zone apex. Cloudflare
  and a few registrars flatten an apex `CNAME`; that is the exception, not the rule.
- **One** `A` record. Two `A` records round-robin browsers between two machines, each with its own
  SQLite file and its own ACME order — that is a hosting decision, not a DNS trick.
- TTL 300 while testing, then 3600 once stable. The TTL is your rollback window (§7).
- www as a `CNAME` to the apex, plus the redirect decision from §0.

### 2.3 Pointing at the PC through a named Cloudflare tunnel

Requires the zone on Cloudflare's nameservers. Either let the CLI write the record:

```bash
cloudflared tunnel route dns applywright intelligentartificial.net
```

or create it by hand at Cloudflare:

```
intelligentartificial.net.       CNAME   <tunnel-uuid>.cfargotunnel.com   Proxied
www.intelligentartificial.net.   CNAME   <tunnel-uuid>.cfargotunnel.com   Proxied
```

- The record must be **proxied** (orange cloud). `cloudflared` dials out to Cloudflare; Cloudflare
  is the only thing that can use the tunnel hostname.
- An apex `CNAME` is allowed here because Cloudflare flattens it. That is Cloudflare-specific.
- No `A` record, no port forwarding, no static IP, and inbound 80/443 on the home connection stay
  closed. An `A` record to a residential address is not a substitute: the address rotates, CGNAT
  often leaves no unique address, and consumer terms frequently forbid serving.

### 2.4 Verifying DNS before touching TLS

```bash
DOMAIN=intelligentartificial.net
dig +short A "$DOMAIN"
dig +short AAAA "$DOMAIN"
dig +short CNAME "www.$DOMAIN"
dig +short NS "$DOMAIN"
dig @1.1.1.1 +short A "$DOMAIN"     # a second resolver, so a local cache cannot reassure you
```

VPS shape: one `A` (the host), the www `CNAME`, NS records at your provider. Tunnel shape: an `A`
answer in Cloudflare's anycast range (the flattened `CNAME`) and a `CNAME` ending in
`.cfargotunnel.com` for www.

Windows, without `dig`:

```powershell
Resolve-DnsName intelligentartificial.net -Type A
Resolve-DnsName www.intelligentartificial.net -Type CNAME
```

Do not start the proxy or the tunnel until this answers correctly. ACME validation against a name
that does not resolve yet fails loudly, and repeated failures are rate-limited by Let's Encrypt.

## 3. TLS: who terminates it

### 3.1 On the host: Caddy and Let's Encrypt (VPS shape)

Caddy is the only process on 80/443. It obtains a certificate over ACME, redirects http→https,
sends HSTS, and proxies to `127.0.0.1:3160`.

- Needs DNS resolving to the host (§2.2), ports 80 and 443 reachable, and no CDN proxying in
  front. HTTP-01 uses port 80; TLS-ALPN-01 uses 443.
- The certificate and key live on the host, under the `caddy` user's data directory — on Debian,
  `/var/lib/caddy/.local/share/caddy/`. Renewal is automatic at roughly two-thirds of the 90-day
  life. Nothing to buy, nothing to copy, nothing to rotate by hand.
- The app never sees a certificate and does not need one. That is exactly why `TRUST_PROXY=1` and
  `SECURE_COOKIES=1` exist: TLS ends at Caddy, and the app is told so by headers.
- Known trap: an orange-cloud record in front of a Caddy origin makes ACME reach Cloudflare, not
  your host, and HTTP-01 fails. Keep the record DNS-only until the certificate exists, or issue
  with DNS-01.
- Commands: DEPLOY.md §4.

### 3.2 At the Cloudflare edge (tunnel shape)

The certificate the browser sees is Cloudflare's Universal SSL certificate for the zone, issued and
renewed automatically while the zone is active on Cloudflare's nameservers. There is no ACME client
on the PC, no certificate to install, and no inbound port to open.

Two encrypted hops, one plaintext one:

1. Browser → Cloudflare edge: TLS, Cloudflare's certificate, Cloudflare's responsibility.
2. Cloudflare edge → `cloudflared` on the PC: the named tunnel, outbound QUIC/HTTP2.
3. `cloudflared` → `http://127.0.0.1:3160`: loopback, never leaves the machine.

Leave the zone's SSL/TLS mode on **Full (strict)**; do not use Flexible. Do not add Caddy in front
of the tunnel "for TLS" — the loopback hop is already local and browser-facing TLS is already
Cloudflare's. Turn on **Always Use HTTPS** at the edge: the app does not redirect http→https, and
with `SECURE_COOKIES=1` a plain-http landing page cannot keep a session.

### 3.3 What is not an option

- A self-signed certificate on a public name: browsers refuse it, and nothing here needs it.
- Turning `SECURE_COOKIES` off to make http work. Fix the redirect instead (DEPLOY.md §13).
- A certificate from anywhere other than the host's ACME client or Cloudflare's edge. No agent
  issues, holds or installs one, and the private key is never in this repository, never in a file
  the web server can serve, and never in the browser.

## 4. Application environment once it is public

```ini
PORT=3160
HOST=127.0.0.1
TRUST_PROXY=1
SECURE_COOKIES=1
PUBLIC_URL=https://intelligentartificial.net
CONTACT_EMAIL=<a mailbox you control>
DATABASE_PATH=./data/applywright.db
```

| Variable | Why it must be this |
|---|---|
| `HOST=127.0.0.1` | With `0.0.0.0` the Node process answers on every interface, so the proxy is bypassed and 3160 is reachable by anything that can route to the machine. |
| `TRUST_PROXY=1` | `app.set("trust proxy", 1)` in `server/app.js:284` trusts one hop, so `X-Forwarded-For` gives the real client to the rate limiter and `X-Forwarded-Proto` makes `req.protocol` `https`. Only with your own proxy in front: without one, a client can forge both headers. |
| `SECURE_COOKIES=1` | Adds `Secure` to the `aw_session` cookie. Correct behind TLS and required in practice; over plain http the browser will not return the cookie and every authenticated call answers 401. |
| `PUBLIC_URL=https://intelligentartificial.net` | Scheme and host, no trailing slash. Read at `server/app.js:809` for the RSS `<link>` and `:841`/`:874` for Stripe success, cancel and portal URLs. A wrong value sends paying customers to the wrong site. |
| `CONTACT_EMAIL` | Substituted into `{{CONTACT_EMAIL}}` on `/security`. The footer and `/about` carry the literal `mailto:hello@applywright.example` and do not use the token, so both must be edited by hand when the real mailbox exists. |
| `DATABASE_PATH` | On local disk. Not on a network share, not in a synced folder (§8). |

- The env file lives **outside** the checkout, mode `0640`, owned by the service user
  (DEPLOY.md §3). `.env` and `.env.local` are already gitignored, which is not the same as safe:
  never commit one.
- One process only. The alert scanner (`ALERTS_SCAN_MINUTES`) is in-process and SQLite has one
  writer, so pm2 must run a single instance, never cluster mode.
- Behind a tunnel, confirm that the `X-Forwarded-For` that reaches the app ends with the client
  address. If it does not, `trust proxy 1` resolves every request to the same address and the rate
  limiter collapses to one bucket — fix that in the tunnel configuration, not by trusting more hops.

## 5. The two hosting shapes that fit

### 5.1 A small VPS with Caddy and systemd

1–2 vCPU, 1–2 GB RAM, 20 GB disk, Debian 12 or Ubuntu 24.04, a static IPv4 (IPv6 optional), ports
80 and 443 open inbound, outbound HTTPS open (three job boards, model provider, Stripe, ACME), and
Node 22.5 or newer for `node:sqlite`.

DNS §2.2, TLS §3.1, and the host runbook is DEPLOY.md §1–§14: install, env file, Caddyfile, systemd
unit, `data/` permissions, backups, pre-flight, rollback.

It fits because the app is one Node process with a local SQLite file and a background scanner: a
single host with a local disk is its natural home, and a VPS has a stable address and stays awake.
The VPS account, its firewall and its backups are Johan's; nothing here provisions one.

### 5.2 The existing PC behind a named Cloudflare tunnel, with pm2

The app already runs on the PC as `node server/index.js` on `127.0.0.1:3160`. `pm2` keeps it alive
(`pm2 startup` for reboot), and `cloudflared` runs as a service whose named tunnel ingress maps
`intelligentartificial.net` to `http://127.0.0.1:3160`. Outbound only: no port forward, no public IP.

DNS §2.3, TLS §3.2. A deploy is `pm2 restart applywright --update-env`, not an `rsync` to a host.
pm2 log rotation and `data/` on local disk are the two ongoing chores.

The honest limits: a home PC is not a 99.9% host. Windows updates reboot it, it sleeps, the ISP
drops, a residential line's terms may forbid servers, and backups are manual. This shape is right
for a private beta or a staged launch and wrong for taking card payments from strangers.

### 5.3 Why a serverless host does not fit

- The app is not a request-scoped function. `server/index.js` binds a port and stays up: an alert
  scanner on a timer, an in-memory feed cache, and a single SQLite writer.
- SQLite needs a local persistent filesystem with real POSIX locking. A serverless function's only
  writable space is ephemeral, so the database disappears with the instance; a mounted network
  volume breaks SQLite's locking (`database is locked`, and corruption under concurrent writers) —
  DEPLOY.md §7 says the same.
- Sessions and rate limits are in process, so there is exactly one instance and one writer by
  design. Horizontally scaled functions each get their own copy of the world.
- A managed container host — a long-running container with a persistent volume and one replica —
  is a third shape that does fit mechanically. It is not serverless, it needs the same DNS and env
  decisions, and nothing in this repository has been tested on one.

## 6. Pre-flight checks

Run in one shell so the variables carry over. `--resolve` lets you exercise a name before DNS has
propagated.

### 6.1 The process, before touching DNS

```bash
cd /opt/applywright                  # or the checkout on the PC
node --version                       # 22.5 or newer, for node:sqlite
node -e "require('node:sqlite'); console.log('node:sqlite loads')"
node --check server/config.js        # parses
node scripts/check.js                # static self-check: must print 0 errors
pm2 start server/index.js --name applywright      # or systemctl start applywright
curl -sS http://127.0.0.1:3160/api/health
ss -ltnp | grep 3160                 # 127.0.0.1:3160 only, nothing on 0.0.0.0:3160
# on the PC: Get-NetTCPConnection -LocalPort 3160 | Select LocalAddress,State  (or netstat -ano | findstr :3160)
```

`/api/health` returns `{"status":"ok","version":"0.1.0",...}` with `"provider":"live"` when a model
key reached the process and `"rules"` when it did not — both are supported states.

### 6.2 DNS

The commands in §2.4. Then check from outside your own resolver (`dig @8.8.8.8 +short A "$DOMAIN"`)
before you start Caddy or the tunnel.

### 6.3 TLS and the public name

```bash
DOMAIN=intelligentartificial.net
PUBLIC_IP="203.0.113.10"     # the host's public address; documentation value, substitute the real one

# Exercise the name against a known address before DNS has propagated (VPS shape).
curl -sS --resolve "$DOMAIN:443:$PUBLIC_IP" "https://$DOMAIN/api/health"

# Who issued the certificate, for which name, and until when. From WSL or a Linux host; on Windows,
# openssl ships with Git for Windows, otherwise use `curl -vI https://$DOMAIN/` and read the chain.
openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" -showcerts </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
# Expect the subject/SAN to be intelligentartificial.net and the issuer to be Let's Encrypt (host
# termination) or a Cloudflare CA (edge termination).

curl -sSI "https://$DOMAIN/" | head -n 15

# http redirects to https — Caddy's job, or Cloudflare's "Always Use HTTPS". Not the app's.
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "http://$DOMAIN/"

# The same health object through the public name as on loopback.
curl -sS "https://$DOMAIN/api/health"

# Security headers survive the proxy hop.
curl -sS -D- -o /dev/null "https://$DOMAIN/api/health" \
  | grep -iE 'content-security-policy|strict-transport-security|x-content-type-options|referrer-policy|x-request-id|x-ratelimit'

# 3160 is NOT reachable from the internet. A timeout or refusal is the pass.
curl -sS --connect-timeout 3 -o /dev/null "http://$PUBLIC_IP:3160/api/health"; echo "exit=$?"
```

For the tunnel shape `$PUBLIC_IP` is the home connection's address; for the VPS it is the host's
public address with the firewall closed to 3160. A `200` from that last command is a finding, not a
success.

### 6.4 Session cookie and `PUBLIC_URL`

One throwaway account, deleted at the end — the same shape as DEPLOY.md §11 steps 5 and 11.

```bash
BASE="https://intelligentartificial.net"
EMAIL="preflight+$(date +%s)@example.com"
PASSWORD="preflight-password-1"
JAR="$(mktemp)"

curl -sS -D- -c "$JAR" -o /dev/null -X POST "$BASE/api/auth/register" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Pre-flight\"}" \
  | grep -i '^set-cookie'
# Expect aw_session=...; Path=/; HttpOnly; SameSite=Lax; Secure
# Secure appears only when SECURE_COOKIES=1 — its absence is the bug, not the fix.

TOKEN=$(curl -sS -b "$JAR" "$BASE/api/notifications" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).feedToken))')
curl -sS "$BASE/feed/$TOKEN.rss" | grep -o '<link>[^<]*</link>'
# Expect <link>https://intelligentartificial.net/app/alerts</link>.
# A <link> containing 127.0.0.1 means PUBLIC_URL never reached the process: restart with
# `pm2 restart applywright --update-env` or reload the systemd unit.

curl -sS -b "$JAR" -X DELETE "$BASE/api/account" \
  -H 'content-type: application/json' -d "{\"password\":\"$PASSWORD\"}"
rm -f "$JAR"
```

### 6.5 The functional pass

DEPLOY.md §11 steps 4–14 against the public name: register, CV, analyse, tailor, plans, security
headers, redirect, 404 shape. Nothing here substitutes for that.

## 7. Rollback

DNS is the only step with a delay, so make it the deliberate one: write the current records down
before changing them, keep the TTL at 300 while testing, and a rollback is editing them back and
waiting up to the old TTL to propagate. On the VPS, stop the unit, restore the previous code
(DEPLOY.md §14), and leave `/etc/applywright/applywright.env` and `data/` alone — a code rollback is
code-only unless the release moved the schema, in which case restore the matching database backup
and delete the stale `-wal`/`-shm` files. On the tunnel, remove the public hostname from the tunnel
configuration (or delete its ingress rule) and restart `cloudflared`; the app keeps running on
loopback, so the only thing lost is the public name. No certificate needs rolling back in either
shape: Caddy renews, and the edge certificate belongs to the zone, not to a deploy. Never delete
`data/applywright.db` as part of a rollback — back it up first (DEPLOY.md §9). If the change was DNS
only, the running app never noticed.

## 8. Do not do this

- **Do not put the database in a serverless function.** The writable filesystem is ephemeral, so
  every cold start loses accounts, CVs and packs — and the app cannot be hosted as a function
  anyway (§5.3).
- **Do not put SQLite on a network share** — NFS, CIFS/SMB, EFS, a mapped drive, OneDrive, Dropbox,
  iCloud Drive. SQLite's locking is not reliable over them; the failure is intermittent
  `database is locked` and then corruption. Keep `data/` on the host's local disk.
- **Do not expose 3160 directly to the internet.** No `HOST=0.0.0.0`, no router port-forward, no
  firewall hole. Loopback plus a proxy or tunnel is the only supported posture, and
  `SECURE_COOKIES`/`TRUST_PROXY` both assume a proxy.
- Do not run two instances against one database file. One writer, one scanner, one pm2 process.
- Do not set `TRUST_PROXY=1` without a proxy you control, or `SECURE_COOKIES=1` while serving
  plain http.
- Do not use Cloudflare "Flexible" SSL mode with a public origin: the browser↔edge hop is encrypted
  and the edge↔origin hop is not, which looks secure in the address bar and is not.
- Do not point the apex at a residential address by `A` record. The tunnel exists because that
  does not work.
- Do not commit the env file, copy a private key anywhere, or paste a key onto a command line
  where it lands in shell history and the process list.
- Do not state or imply that any of this is deployed. It is not.

## 9. What only Johan can do

| Step | Why an agent cannot |
|---|---|
| Buy or confirm `intelligentartificial.net`: registrar access, renewal date, transfer/registrar lock | Account ownership and payment |
| Decide where DNS is administered and, if Cloudflare, delegate the zone's nameservers at the registrar | Registrar and Cloudflare credentials; an account action |
| Create the records in §2 at the zone host | Write access to the zone; agents hold no DNS credentials |
| Cloudflare account access: log in, 2FA, create the named tunnel, approve its hostname | Interactive sign-in and zone ownership |
| The certificate: approve the ACME order on the host (and open 80/443), or confirm Universal SSL at the edge | Host firewall and CA account; nothing here issues or holds a certificate |
| The mailbox behind `CONTACT_EMAIL` | Mailbox ownership. Once it exists, the literal `mailto:hello@applywright.example` in the footer and `/about` needs the same address — a one-line edit an agent can make. |
| Any hosting account (VPS provider, managed container) and its firewall and backups | Account ownership |

## 10. Where the rest of it lives

- [`docs/DEPLOY.md`](DEPLOY.md) — host install, env file, Caddyfile, systemd and pm2, `data/`
  permissions, backups, the full pre-flight, rollback, keys.
- [`README.md`](../README.md) — configuration table and local run.
- [`docs/SPEC.md`](SPEC.md) — what the product promises, so the copy on the live site can be
  checked against it.
