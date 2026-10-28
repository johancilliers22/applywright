# Handoff for a friend

The short version. The long version, with every command verified against the code, is
[`../FORK-AND-RUN.md`](../FORK-AND-RUN.md).

You need: a GitHub account, Node 22.5 or newer, a terminal, and about twenty minutes.
Nothing else — no key, no database, no server, no cloud account.

---

## 1. Look at what it is before you run it

Open <https://github.com/johancilliers22/applywright> and read `README.md` § "What it
refuses to do" and `PROJECT-STATUS.md` §1 (both in this repository). Three refusals shape
the whole codebase: no LinkedIn scraping, no automated submission, no fabricated
experience. If one of those reads as a gap to you rather than a decision, say so before you
spend a day on it — that is the conversation worth having first.

## 2. Fork it, clone your fork, add the upstream

```bash
# on GitHub: Fork. Then:
git clone https://github.com/<your-account>/applywright.git
cd applywright
git remote add upstream https://github.com/johancilliers22/applywright.git
git remote -v
```

`origin` is yours to push to; `upstream` is how you pull Johan's future changes
(`git fetch upstream && git merge upstream/main`). On Windows use the same commands in
PowerShell. Do not share one checkout between Windows and WSL — clone once per environment.

## 3. Install and run it

```powershell
# Windows PowerShell
npm install
node server/index.js
```

```bash
# Linux / WSL
npm install
node server/index.js
```

Open <http://127.0.0.1:3160>. The banner prints the URL, the tailoring mode, the database
path and whether billing is configured. It runs on defaults with no configuration at all;
tailoring simply uses the deterministic rules path instead of a model.

## 4. Seed the demo account and walk the loop

Leave the server running and, in a second shell, from the same directory:

```bash
node scripts/seed.mjs
```

It creates `demo@applywright.example` / `demo-password-123`, adds a CV, scores it against a
job description, builds three tailored packs at different statuses, and saves one search.
Sign in at <http://127.0.0.1:3160/sign-in> and follow one application end to end: CV → score
against a posting → tailored pack → application status. Then look at
`GET /api/health` and note `"provider":"rules"` — that is the honest answer until you set a
model key.

If you lock yourself out, `node scripts/reset-password.mjs --list` then
`node scripts/reset-password.mjs --email <address> --generate` prints a working replacement
password and revokes the old sessions.

## 5. Make your first change and get it live

```bash
git switch -c feat/my-first-change
# edit, then run the gate:
node --test tests/
node --test server/lib server/provider
node scripts/check.js
git add <named paths>
git commit -m "Area: what changed"
git push -u origin feat/my-first-change
```

Open a pull request from your fork when you want a second pair of eyes; whether it lands
upstream is Johan's call, and a fork that stays a fork is fine. If "live" means a URL of
your own rather than `127.0.0.1`, follow `docs/DEPLOY.md` for a VPS with Caddy, or
`docs/SHARE.md` for a Tailscale or Cloudflare tunnel — and set `TRUST_PROXY=1`,
`SECURE_COOKIES=1`, `PUBLIC_URL` and `REGISTRATION_OPEN=0` before a public URL exists.

---

## Three things to ask Johan before you change anything public

1. **The domain.** `intelligentartificial.net` is his and the plan is
   `apply.intelligentartificial.net`. Which hostname should your copy use, and are you
   allowed to point your own domain at a modified fork? Do not point a fork at his domain.
2. **Data retention.** The app stores CV text (never the raw uploaded binary), exports
   everything the account owns, and hard-deletes on request. If anyone other than you will
   use your copy, agree up front how long CVs and application history are kept, where the
   SQLite file lives, and who holds the backups — `data/` is personal data even though it is
   gitignored.
3. **The licence.** MIT (`LICENSE`, © 2026 Johan Cilliers / Intelligent Artificial) — you may fork, change and reuse it with attribution; public deployment
   are unresolved rather than permitted. Ask before you publish a modified copy or run it
   under a public name.
