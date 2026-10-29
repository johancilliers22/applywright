> OFFLINE —29October2026 night closeout. Owned Windows app15812 and quick-tunnel9408 were identity-verified and stopped02:37UTC to prevent OCR auto-starting WSL. No automatic restart; the old quick-tunnel URL below is historical. Source/ready commit: https://github.com/johancilliers22/applywright/commit/8df799f0016f7f2f021578424f65d59c19d539bf . Resume only manually after Johan authorises; see docs/closeout/20261029/TOMORROW.md.

# Sharing Applywright

How to let someone else open Applywright today, how to stop, and what changes when
`intelligentartificial.net` goes live.

Applywright is one long-lived Node process (`node server/index.js`) that serves the
marketing pages, the product and the JSON API, keeps its data in a SQLite file under
`data/`, and listens on `127.0.0.1:3160` only. Nothing here needs an npm install or a git
operation: the two scripts are self-contained PowerShell.

- Scripts: [`scripts/share.ps1`](../scripts/share.ps1) · [`scripts/share-stop.ps1`](../scripts/share-stop.ps1)
- Deployment reference (Caddy, systemd, pm2, backups): [`docs/DEPLOY.md`](DEPLOY.md)

---

## 1. Pick the option

| The situation | Use | Who can reach it | URL | Account for the guest |
|---|---|---|---|---|
| A friend you trust, a demo today, a collaborator | **Tailscale Serve** (recommended) | devices signed in to Johan's tailnet only | `https://johans-pc.tailf64125.ts.net:8447` | free Tailscale account, invited by Johan |
| Someone without Tailscale, for minutes | **Cloudflare quick tunnel** | anyone on the public internet with the URL | `https://<random-words>.trycloudflare.com` | none, anonymous |
| The real home, once the domain is ready | **Named Cloudflare tunnel** on a subdomain, with Cloudflare Access in front | public, or policy-gated | `https://apply.intelligentartificial.net` | none or email OTP |
| "Just deploy it to Vercel/Supabase" | **No** — wrong shape for this app | — | — | — |

Why the last row is a no: Applywright is a single long-lived process with in-process state
(a background alert scanner on a timer, server-side session rows) and its data is a **file
on this machine** (`data/applywright.db`, plus `data/contact.jsonl`). Serverless platforms
give you an ephemeral filesystem and many short-lived instances, so the database and the
sessions do not survive and two instances would fight over one SQLite writer. Vercel-style
hosting would mean moving to a hosted Postgres and rewriting the data layer, and
Supabase-style hosting does not run your Node process at all. `docs/DEPLOY.md` already
assumes a machine you own: a supervised process, a fixed port, a TLS proxy in front of
loopback. That is exactly what both options below give you on today's hardware.

---

## 2. What is actually on this machine (measured 2026-10-28 ~05:35-05:40)

**Tailscale — installed, running, HTTPS-capable.**

- `C:\Program Files\Tailscale\tailscale.exe`, version `1.102.4-t3caf7d9e7-g084ee3b64`.
- `tailscale status --json`: `BackendState = Running`, `Self.Online = true`, node
  `johans-pc`, MagicDNS `johans-pc.tailf64125.ts.net`, tailnet `tailf64125.ts.net`.
- `CertDomains` contains `johans-pc.tailf64125.ts.net`, so HTTPS certificates are already
  enabled for this tailnet — that is the prerequisite for `tailscale serve`.
- 2 peers: `JohansLaptop` (windows, offline) and `localhost` (iOS, online).
- **`tailscale serve` is already in use, and port 443 is taken:**

  | serve port | proxies to |
  |---|---|
  | `https:443` (tailnet root URL) | `http://127.0.0.1:3773` |
  | `https:8443` | `http://127.0.0.1:9120` |
  | `https:8444` | `http://127.0.0.1:18789` |
  | `https:8445` | `http://127.0.0.1:9119` |
  | `https:8446` | `http://127.0.0.1:8642` |

  This matters: `tailscale serve --bg 3160` means **https:443**, which would collide with
  the existing mapping. `scripts/share.ps1` therefore auto-picks **8447** (or `-HttpsPort`)
  and refuses to touch 443 without `-Force`. It also never runs `tailscale serve reset`,
  which would wipe all five rows above.
- `tailscale funnel status` shows the same five rows, all "(tailnet only)" — nothing is
  published to the public internet through Tailscale Funnel.

**Cloudflare — not on PATH; a Windows binary exists; the WSL copy cannot reach the app.**

- `cloudflared` is not on the Windows `PATH`, and was absent from the usual install
  locations at 05:35. At 05:38:53 a Windows binary appeared at
  `%LOCALAPPDATA%\cloudflared\cloudflared.exe` (version `2026.10.5`) — installed by another
  process during this session, not by these scripts. `share.ps1` finds it there.
- WSL2 has `/usr/local/bin/cloudflared` (version `2026.10.4`), but **WSL cannot reach the
  app**: from WSL, `curl http://127.0.0.1:3160/api/health` and the same call to the WSL
  gateway (`172.20.144.1`) both fail with connection refused, because the app binds Windows
  loopback only. A tunnel has to run next to the app, so use the **Windows** binary.
- The estate already runs a **named** Cloudflare tunnel under pm2 (`luna-tunnel`) for
  `lunaaraye.com`; its config and credentials belong to Johan. Do not repoint it at
  Applywright, and do not copy its token anywhere.

**The app itself.**

- `/api/health` answers `200` with `{"status":"ok","version":"0.1.0","provider":"rules",...}`.
- Listener is `127.0.0.1:3160` only, so nothing on the LAN can reach it directly.
- No `.env.local` and no `.env` at measurement time, so the running process was on
  defaults: `TRUST_PROXY=0`, `SECURE_COOKIES=0`, `PUBLIC_URL=http://127.0.0.1:3160`.
  Both scripts report this and print the exact fix; only `share.ps1 -WriteEnv` writes it.

---

## 3. Option A — Tailscale Serve (recommended for the friend)

Private by construction: the app is reachable only from devices in the tailnet, over HTTPS
with a real certificate, and it survives a reboot because the serve config is persistent.
No ports are opened on the router and no public DNS entry exists.

```powershell
# 1. See exactly what would happen. Read-only; changes nothing.
pwsh -NoProfile -File scripts/share.ps1 -Mode tailscale -WhatIf

# 2. Write the three proxy keys into .env.local (optional but recommended), then restart
#    the app so it picks them up — it only reads env at boot.
pwsh -NoProfile -File scripts/share.ps1 -Mode tailscale -WriteEnv

# 3. Expose it. Prints the URL.
pwsh -NoProfile -File scripts/share.ps1 -Mode tailscale
```

What step 3 runs, and what you can run by hand instead:

```powershell
tailscale serve --bg --https=8447 http://127.0.0.1:3160   # 8447 because 443 is taken
tailscale serve status                                     # shows the mapping
```

The URL is `https://johans-pc.tailf64125.ts.net:8447` (port omitted only if you served on
the default 443, which on this host needs `-Force` and would displace another service).

**Letting the friend in — Johan's step, not the script's.** The script cannot do this and
says so. Either invite them as a tailnet user (*admin console → Users → Invite external
user*, <https://login.tailscale.com/admin/users>), or share just this machine with their
account (*Machines → `johans-pc` → Share*). They install Tailscale, accept, and open the
URL. To remove their access later, revoke the invite or the share in the same console.

Useful switches: `-HttpsPort <n>` to choose the port, `-Force` to replace an existing
mapping, `-Port <n>` if the app is not on 3160, `-WhatIf` for a dry run.

---

## 4. Option B — Cloudflare quick tunnel (public, ephemeral)

Only when the person cannot install Tailscale. This is public: anyone with the URL gets in,
with no account and no authentication in front of it. The hostname is random per run and
dies with the process.

```powershell
# If cloudflared is missing (it is not on PATH on this machine):
winget install --id Cloudflare.cloudflared --exact

# See what would start, then start it. The script waits for the URL and prints it.
pwsh -NoProfile -File scripts/share.ps1 -Mode cloudflare -WhatIf
pwsh -NoProfile -File scripts/share.ps1 -Mode cloudflare
```

The script runs `cloudflared tunnel --url http://127.0.0.1:3160 --no-autoupdate` as a
background process, reads the `https://<random-words>.trycloudflare.com` URL out of the
tunnel log, and records the PID and URL in
`%LOCALAPPDATA%\Applywright\share\cloudflared.json` (outside the repo). The log is
`%LOCALAPPDATA%\Applywright\share\cloudflared.log`.

Two safety behaviours worth knowing:

- If a cloudflared process **this script did not start** is already tunnelling port 3160, it
  stops and reports that PID instead of starting a second public URL (`-Force` overrides).
  Command lines are inspected but never printed, because a *named* tunnel's argv can carry
  a token.
- A quick tunnel has no token at all, so none can be leaked. Never paste a named-tunnel
  token into a command line or a doc.

Treat the URL as burned as soon as the tunnel stops. Read section 6 before handing it out.

---

## 5. Stopping exposure

```powershell
pwsh -NoProfile -File scripts/share-stop.ps1                # both, dry-run with -WhatIf
pwsh -NoProfile -File scripts/share-stop.ps1 -Mode tailscale
pwsh -NoProfile -File scripts/share-stop.ps1 -Mode cloudflare
pwsh -NoProfile -File scripts/share-stop.ps1 -RevertEnv      # also set TRUST_PROXY=0, SECURE_COOKIES=0
```

- Tailscale: removes **only** the mapping whose handler proxies to the app's loopback port
  (`tailscale serve --https=8447 off`), verifies it is gone, and prints the remaining
  mappings. It never resets the whole serve config, because five other mappings on this
  host belong to other services.
- Cloudflare: stops **only** the PID recorded in its own state file, after confirming that
  PID is still a `cloudflared` process. It will not touch the pm2 `luna-tunnel` or any
  cloudflared it did not start; if it finds a stranger it names the PID and leaves it alone.
- Neither script touches the app. `-RevertEnv` leaves `PUBLIC_URL` as it is (a stale public
  origin is harmless; a security flag is not), and a **restart is required** for any env
  change to take effect.

---

## 6. Security posture while the app is exposed

Say it plainly: **public sign-up is open** — that is the current demo posture (Johan, 28
Oct): a public quick tunnel with `REGISTRATION_OPEN` left at 1. `POST /api/auth/register`
needs no invitation, no email verification and no CAPTCHA. Its brakes are a rate limit of
10 requests per minute per IP (`AUTH_RATE_LIMIT_PER_MINUTE`) and **`REGISTRATION_OPEN`**
(`server/config.js`, enforced in `server/app.js`): set it to `0` and register answers `403
registration_closed`, while sign-in keeps working. Exposure control is otherwise the
control.

Under Tailscale (Option A) that is fine: only invited devices reach the app at all.
Under a quick tunnel (Option B) anyone with the URL can create an account. The demo is
left that way on purpose while it is open (Johan, 28 Oct); close it with
`REGISTRATION_OPEN=0`, and prefer a named tunnel behind Cloudflare Access for anything
longer-lived (section 7).

What is already in place, so you know what you are relying on:

| Property | State |
|---|---|
| Session cookie | `aw_session`, `HttpOnly`, `SameSite=Lax`, 30 days, server-side rows; `Secure` **only** when `SECURE_COOKIES=1` |
| CSRF | every state-changing `/api` call checks `Origin` host equals the `Host` header; both proxies below preserve `Host` |
| Response headers | CSP `default-src 'self'` (plus `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`), `x-frame-options: DENY`, `nosniff`, `referrer-policy: no-referrer`, COOP `same-origin` |
| Passwords | scrypt (N=16384), minimum 10 characters |
| Rate limits | 10/min for register+login, 120/min for other API calls, per `req.ip` |
| Tailoring model | with `MODEL_API_KEY` unset the app uses the deterministic rules engine — `/api/health` reports `provider: "rules"`, so a stranger cannot spend model tokens |
| Billing | Stripe unconfigured today: plans are visible, checkout answers 501 |

Hardening steps, in order of value:

1. **Set `TRUST_PROXY=1` and `SECURE_COOKIES=1`** and restart. Without `TRUST_PROXY`, every
   client looks like the proxy to the rate limiter and one abuser throttles everyone;
   without `SECURE_COOKIES`, the session cookie travels without `Secure`.
   `pwsh -NoProfile -File scripts/share.ps1 -Mode <mode> -WriteEnv` writes all three keys
   (including `PUBLIC_URL`) into `.env.local` and replaces any earlier hand-written copies.
2. **Rotate the demo account** if it exists: `scripts/seed.mjs` creates
   `demo@applywright.example` from `SEED_EMAIL`/`SEED_PASSWORD` (the defaults are documented
   in the README, which is exactly why they must not stay). Re-seed with your own values:
   set `$env:SEED_EMAIL` / `$env:SEED_PASSWORD` and run `node scripts/seed.mjs`; the script
   creates or signs in to that account. If the demo account is not needed, delete it: the
   account-delete endpoint requires that account's password, so log in and delete, or
   remove the row from a copy of `data/applywright.db` while the app is stopped.
3. **Close registration when the window ends.** Set `REGISTRATION_OPEN=0` and restart:
   `POST /api/auth/register` answers `403 registration_closed`, sign-in keeps working, and
   no code change is needed. For a longer-lived public deployment, prefer **Cloudflare
   Access** in front of a named tunnel (section 7).
4. **Keep an eye on the exposure window** for Option B, and glance at `data/contact.jsonl`
   and `data/applywright.db` for junk accounts or spam.
5. **The quick tunnel is deliberately left up overnight** for the public demo (Johan, 28
   Oct): its URL is unauthenticated and `REGISTRATION_OPEN` stays at 1 while that choice
   stands. Stopping the tunnel or closing sign-up gets a line in `docs/OVERNIGHT-LOG.md`.

### Environment variables the app needs behind a proxy

The app reads env once at boot: process environment (non-empty values) first, then
`.env.local`, then `.env` — **the first file that exists is used and the two are never
merged**, so do not create `.env.local` casually if you already have a `.env`. Both scripts
refuse to write when only `.env` exists, for that reason.

```ini
HOST=127.0.0.1                                    # keep it loopback; the proxy is the only way in
TRUST_PROXY=1                                     # one proxy hop: real client IP, X-Forwarded-Proto
SECURE_COOKIES=1                                  # Secure on aw_session
PUBLIC_URL=https://johans-pc.tailf64125.ts.net:8447   # this proxy's public origin (Stripe returns, RSS)
```

`PUBLIC_URL` is not cosmetic: the RSS feed's self-link and the Stripe return URLs are built
from it (`server/config.js:126`), so leaving it at the loopback default produces links that
point at `127.0.0.1:3160`.

Restart after changing any of them:

```powershell
$pid = (Get-NetTCPConnection -State Listen -LocalPort 3160).OwningProcess
Stop-Process -Id $pid          # identified first, then killed by PID — never pkill
node server/index.js           # from the applywright checkout
# or, when the process is supervised:
# pm2 restart applywright --update-env
```

(`docs/DOMAIN.md` §6.4 covers the same check from the other side: the RSS `<link>` must show
the public origin, and a `127.0.0.1` there means `PUBLIC_URL` never reached the process.)

---

## 7. When `intelligentartificial.net` is ready

Measured today: the domain is registered and delegated to **GoDaddy** nameservers
(`ns59.domaincontrol.com`, `ns60.domaincontrol.com`), its apex has GoDaddy parking A records
(`3.33.130.190`, `15.197.148.33`), and `apply.intelligentartificial.net` does not exist.
So nothing is pointed at Cloudflare yet — that is the first prerequisite, and it is Johan's
step in his registrar/Cloudflare account, not something these scripts can do.

`docs/DOMAIN.md` is the full DNS/TLS/cutover runbook and it covers the same prerequisites
(§1-§3: who holds the zone, apex `A` vs tunnel `CNAME`, and who terminates TLS). This
section is only the order of operations and the app-side env. If you want the apex itself
(`intelligentartificial.net`, Cloudflare-flattened `CNAME`) follow `DOMAIN.md` §2.3; the
`apply.` subdomain used below is the same tunnel with no apex flattening involved.

**Target shape: a named Cloudflare tunnel, not a quick tunnel.** A named tunnel has a stable
hostname, a token you keep in one place, and it can be policy-gated with Cloudflare Access.

1. Move the zone (or delegate the subdomain) to Cloudflare DNS. Easiest: add
   `intelligentartificial.net` to the Cloudflare dashboard and switch the registrar's
   nameservers to the pair Cloudflare gives you. (Delegating only `apply` as an NS record to
   Cloudflare also works if you would rather leave the apex at GoDaddy.)
2. Create a tunnel in Cloudflare Zero Trust → Networks → Tunnels. Point its public hostname
   `apply.intelligentartificial.net` at the service `http://127.0.0.1:3160`. The dashboard
   creates the DNS record for you: a proxied **CNAME** to
   `<tunnel-uuid>.cfargotunnel.com` — that CNAME (to `cfargotunnel.com`) is the supported
   shape; there is no public IP to point an A record at, because the tunnel is outbound-only.
3. Run the tunnel on this machine as the connector, under supervision (a Windows service via
   `cloudflared service install`, or pm2 beside the app — but **not** inside the existing
   `luna-tunnel` entry, which is a different tunnel for a different domain). The token comes
   from the dashboard, lives in the service config or an env file, and must never be printed
   by a script or pasted into a document.
4. Change the app's env and restart:

   ```ini
   HOST=127.0.0.1
   TRUST_PROXY=1
   SECURE_COOKIES=1
   PUBLIC_URL=https://apply.intelligentartificial.net
   ```

5. Optional but recommended for a public launch: put **Cloudflare Access** in front of the
   hostname with an allow policy (one-time email code for the friend, or an allowlist of
   addresses). That is the clean way to keep registration closed to strangers without
   patching `server/app.js`.
6. Check the result through the public name, the way `docs/DEPLOY.md` §11 does it:
   `https://apply.intelligentartificial.net/api/health` should answer `200`, a register/login
   round trip should keep the `aw_session` cookie, and the RSS self-link should show the new
   origin.

Notes that matter at that point:

- `TRUST_PROXY=1` trusts **one** hop. Cloudflare is one hop, so this is correct; do not raise it.
- Sessions are per-hostname (the cookie has no `Domain` attribute), so visitors signed in on
  the tunnel hostname will sign in again on the new name. That is expected, not a bug.
- Everything on the app side is unchanged: still one Node process, still
  `127.0.0.1:3160`, still `data/applywright.db`. The tunnel replaces Caddy from
  `docs/DEPLOY.md` §4 — do not run both in front of the same port.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Script stops at "the app is not answering /api/health" | app not running, or on another port | start it (`node server/index.js`), or pass `-Port`; the script never starts it |
| Login works on `127.0.0.1` but 401s over the tunnel | `SECURE_COOKIES=1` while browsing plain HTTP | use the HTTPS URL, or set `SECURE_COOKIES=0` for loopback-only use |
| Every request 403 `cross-origin request refused` | proxy rewrote the `Host` header | tailscale serve and cloudflared both preserve `Host`; a rewriting proxy in between breaks the `Origin`/`Host` check |
| `tailscale serve` complains Serve/HTTPS is not enabled | HTTPS certificates off for the tailnet | admin console → DNS → enable HTTPS certificates (already on for this tailnet) |
| `share-stop` prints "was already gone" | the mapping was already removed | nothing to do; the exit is informational |
| `share-stop` prints "handler does not exist" from tailscale | same as above, surfaced by tailscale | nothing to do |
| A quick-tunnel URL suddenly 502s | the tunnel process died, or the app restarted under it | re-run `share.ps1 -Mode cloudflare`; check the log path it prints |
| Sessions all gone after a restart | they should not be — sessions are rows in SQLite | if it happens, check the app is using the expected `data/applywright.db` |
| Page blank or styles missing through a proxy | injected scripts violate the app's CSP (`default-src 'self'`) | use a proxy that only forwards bytes; do not add an injecting interstitial |

---

## 9. What these scripts were verified to do (and not do)

Verified on 2026-10-28 against this machine:

- `scripts/share.ps1` and `scripts/share-stop.ps1` parse cleanly
  (`pwsh -NoProfile -Command "[void][scriptblock]::Create((Get-Content -Raw scripts/share.ps1))"`).
- `share.ps1 -Mode tailscale -WhatIf` runs end to end and exits 0: it read the live
  `/api/health`, confirmed the listener is loopback-only, confirmed tailscaled `Running` with
  an HTTPS certificate, listed the five existing serve mappings, auto-picked 8447, reported
  the unset env keys, and printed the planned URL — **without changing anything**.
- `share.ps1 -HttpsPort 443 -WhatIf` refuses, with the existing 443 target named, instead of
  clobbering the mapping.
- `share.ps1 -Mode cloudflare -WhatIf` refuses when another process is already tunnelling
  port 3160, naming that PID and leaving it running.
- `share-stop.ps1 -WhatIf` correctly reports "nothing to remove" while the app is not
  exposed, and reads the serve config without mutating it.

Deliberately **not** done: running `tailscale serve` for real (it would add a sixth mapping
to the tailnet, which is Johan's call, not a script's), starting a second public tunnel
while another was live, and touching the pm2 `luna-tunnel`. Not verifiable from here: the
friend's side of the invite, the Cloudflare named tunnel and Access policy (needs Johan's
Cloudflare account), and the domain change (needs the registrar/Cloudflare).

The public demo is now deliberate (Johan, 28 Oct): a quick tunnel is left up with
registration open. At the time of writing that tunnel had been started by another process
while the app still ran on default env (`TRUST_PROXY=0`, `SECURE_COOKIES=0`). Those two
flags are still worth setting on the next restart (`share.ps1 -WriteEnv` writes them), and
stopping or restarting the tunnel goes by PID so the env and the tunnel are owned together.

## Current live URL (28 Oct 2026)

`https://bumper-naturals-raises-thickness.trycloudflare.com` — quick tunnel, registration open. Replace this line whenever the tunnel restarts; quick-tunnel hostnames do not survive a restart.

## Status notes (28 Oct 2026)

- **Current public URL is the quick tunnel in the header of this file**, not Tailscale: `tailscale serve
  status` no longer lists 8447, so `https://johans-pc.tailf64125.ts.net:8447` refuses connections until
  the mapping is restored (`tailscale serve --bg --https=8447 http://127.0.0.1:3160`).
- `apply.intelligentartificial.net` does not resolve yet and the apex fails the TLS handshake — DNS is
  not pointed at anything (see `docs/DOMAIN.md`; the GoDaddy nameservers still control the zone).
- Quick-tunnel hostnames do not survive a restart: when the tunnel restarts, update the header URL and
  the row below, because every other doc points here.