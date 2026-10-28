# LinkedIn capture — the bookmarklet, and why there is no "Sign in with LinkedIn"

Short answer to the question that started this: **there is no LinkedIn connector or
OAuth button we can add, because LinkedIn does not offer third-party apps a scope that
returns a profile.** What exists is a user-initiated capture: a bookmarklet that reads
the profile page the user already has open in their own signed-in browser, copies the
text locally, and hands the user to our import screen. This document says exactly how
that works, what it refuses to do, and what the fallbacks are.

## 1. Why the OAuth button does not exist

- **"Sign in with LinkedIn" is OpenID Connect.** It returns `sub`, `name`, `email` and
  `picture` — nothing else. There is no experience, education, skills or headline in the
  response, so there is no consent screen that would import a CV.
- **The old profile scopes are not for us.** `r_liteprofile` and `r_basicprofile` were
  partner-only, and the v2 profile APIs were closed to new applications; the current
  "Share on LinkedIn" / "Sign In with LinkedIn using OpenID Connect" products do not
  include member profile data.
- **The full-data route requires a partnership we do not have** (LinkedIn Talent
  Solutions / Marketing Developer Platform), a signed agreement, per-user consent and a
  review. That is not a button; it is a business development process.
- **Scraping is out.** `docs/SPEC.md` §1 forbids it: it breaches LinkedIn's terms, gets
  accounts restricted, and produces applications built on data the member did not hand
  us. `server/lib/connectors/linkedin.js` is explicitly bring-your-own-copy for the same
  reason, and `POST /api/jobs/capture` refuses `linkedin.com` sources outright
  (`BLOCKED_CAPTURE_HOSTS` in `server/app.js`).

So the product question becomes: *how does the text the user is already looking at get
into Applywright without us fetching it?* Answer: the user's own click, in their own
browser, with the clipboard as the bridge.

## 2. What was built

| File | What it is |
|---|---|
| `public/assets/bookmarklet.src.js` | The readable source. ES5, no dependencies, no network calls. |
| `public/assets/bookmarklet.js` | The build: one line, and that one line **is** the bookmarklet URL — it starts with `javascript:`, so it can be pasted whole into a bookmark address. Do not edit by hand. |
| `docs/LINKEDIN-CAPTURE.md` | This document. |

The page template also carries an inert helper block (`<template id="tpl-linkedin-capture">`
in `public/app/app.html`) with the paste box and the bookmarklet string; the SPA clones it
when it wants it. It renders nothing on its own.

## 3. Installing it

The bookmarklet is a bookmark whose **address is the one-line text in
`public/assets/bookmarklet.js`** (or the text in the app's helper block, which is the same
string with `__ORIGIN__` already replaced). It starts with `javascript:`, so the whole line
goes into the address field unchanged. Two ways to install it, both local to the user's
browser:

1. **From the app's helper block:** copy the bookmarklet text (the *Copy bookmarklet*
   button), create any bookmark — bookmark this page, then edit it — and paste the text
   into its URL/address field. Name it "Applywright capture".
2. **From the file:** open `public/assets/bookmarklet.js`, copy its single line, and paste
   that into a new bookmark's address.

Some browsers strip the `javascript:` prefix when you paste into the **address bar**, so
paste into the bookmark's editor instead of the omnibox.

**About our Content-Security-Policy.** Applywright serves `script-src 'self'`
(`SECURITY_HEADERS` in `server/app.js`), which means a `javascript:` link *clicked while
you are on one of our pages* is blocked by the browser. That is deliberate and we are not
weakening it. The bookmarklet is exempt in the only place it matters: when you click it,
you are on `linkedin.com`, which is subject to LinkedIn's policy, not ours. Installing it
as a bookmark (rather than clicking a link on our site) sidesteps the problem entirely.

**First run asks one question.** The bookmarklet needs to know where your Applywright
lives. If the app rendered the install text it is already filled in (the `__ORIGIN__`
token is replaced with the page's origin). Otherwise it asks once, remembers the answer
in that site's `localStorage` (`applywright.origin`), and never asks again.

## 4. What it captures

On a LinkedIn profile (`linkedin.com/in/...`) it reads the visible text of the page and
emits LinkedIn's own clipboard layout, which is exactly what
`parseLinkedInProfile` (in `server/lib/connectors/linkedin.js`) already understands:

```
Ada Lovelace
Senior Data Engineer at Analytical Engines
London, England, United Kingdom

Contact
https://www.linkedin.com/in/ada-lovelace

About
…

Top Skills
Data Pipelines
SQL
Python

Experience
Senior Data Engineer
Analytical Engines Ltd · Full-time
Jan 2019 - Present · 5 yrs
London, England, United Kingdom
• Built 12 pipelines processing 4 million events a day.

Data Engineer
…

Education
…
```

- **Name, headline and location** come from the profile's top card (`h1` plus the next
  visible lines).
- **About** is flattened to a paragraph.
- **Top Skills** (the page heading is "Skills"; the parser's LinkedIn vocabulary for it is
  "Top Skills"), **Experience**, **Education**, **Certifications** ("Licenses &
  certifications") and **Languages** are read from the page's own `<section>` blocks.
  Each entry is one list item; blank lines separate entries.
- **Description lines inside a role are marked with `•`** so that a bullet which lost its
  full stop is not read as a new job title. Without that marker one role can split into
  two.
- **Contact** carries the profile URL and nothing else. We do not invent an email address
  or a phone number; that data is behind LinkedIn's "Contact info" dialog, which this
  script does not open.

Sections Applywright has no field for (Projects, Volunteer, Honours, Publications,
Recommendations) are recognised and deliberately not imported; the server says so in
`profile.warnings` rather than dropping them silently.

On a job advert (any host) it emits the title, the employer, the location, a blank line,
then the advert body — the order `POST /api/jobs/capture`'s pasted-text reader expects.
It prefers the site's own schema.org `JobPosting` markup for the title/employer/location
and the visible advert container for the body.

**Adverts on hosts we refuse.** `POST /api/jobs/capture` refuses `linkedin.com`,
`indeed.com` and `glassdoor.*` by design (`BLOCKED_CAPTURE_HOSTS` in `server/app.js`), so an
advert from one of those cannot become a tracked job. The bookmarklet still captures the
text — it scores and tailors fine through `POST /api/analyse` (`jobText`) — but it leaves
`sourceUrl` **empty** on those hosts rather than prefilling an address the server is certain
to reject, and says so in its confirmation dialog. If the user does want to track the job,
they paste the employer's own careers URL with the text; if they only want the score, the
text is already on the clipboard. The host list in the bookmarklet is a copy of the
server's, and drifting from it is safe: the worst case is the older behaviour, where the app
shows the server's own policy message.

## 5. What it does not do

- **No OAuth, no token, no stored LinkedIn credential.** The file contains no credential
  of any kind; there is nothing to revoke.
- **No server fetch of LinkedIn.** Neither the bookmarklet nor the app ever requests a
  `linkedin.com` URL. The app only sees the text the user pastes.
- **No background access.** Its whole body runs once, when the user clicks the bookmark, on
  the page the user is looking at. There is no timer, no listener and no code path that can
  re-fire it; if it is never clicked, it never runs.
- **No third-party requests.** No `fetch`, no `XMLHttpRequest`, no beacon, no analytics,
  no remote script. The only absolute URL in the file is the address the user supplied.
- **No DOM writing to LinkedIn beyond the clipboard shim**, which is a hidden textarea
  that is removed again immediately.
- **No silent navigation.** It opens Applywright in a new tab; the LinkedIn tab stays
  where it was. If the popup is blocked, it tells you the address instead.
- **No source URL the server will refuse.** On a host listed in the server's
  `BLOCKED_CAPTURE_HOSTS`, the capture leaves `sourceUrl` blank so the app cannot prefill a
  doomed address; the text is still delivered, for scoring rather than tracking.

### How the text actually crosses from LinkedIn to the app

This is where a naive design breaks, so it is worth writing down:

| Route | Verdict |
|---|---|
| `localStorage` from `linkedin.com` for the app to read | **Impossible.** Storage is per origin. A bookmarklet running on LinkedIn cannot write the app's storage. |
| Cross-origin `POST /api/connectors/linkedin` | **Impossible here.** The session cookie is `SameSite=Lax` (`server/auth.js`), and `assertSameOrigin` rejects cross-site writes. |
| `window.postMessage` from the opened LinkedIn tab | **Blocked.** Our responses send `Cross-Origin-Opener-Policy: same-origin`, which severs opener messaging by design. |
| Clipboard + paste, in the user's own click | **Works everywhere, keeps credentials out of it entirely.** This is the implemented path. |

So: the bookmarklet copies the text to the clipboard and opens
`/app/cv?import=1` (or `/app/jobs?capture=1`). The app page focuses the paste box; the
user presses `Ctrl+V`. Two clicks and a paste, and at no point does a credential or a
server-side fetch enter the picture.

For completeness there is one same-origin branch: if the bookmarklet is ever clicked on
Applywright's own origin it writes
`localStorage["applywright.capture.v1"] = {version: 1, kind, text, sourceUrl, title, company, capturedAt}`
and navigates to the import screen. `public/app/app.js` already consumes exactly that
record (`takeCapture(kind)`), keeps it only when `version === 1` and `kind` matches, and
removes it after use. In practice no real capture runs on our origin — the clipboard path
above is the one users take — so treat the record as a compatibility path, not the
product's main artery.

## 6. If it cannot read the page

LinkedIn's markup changes. When the page shape is not one the bookmarklet recognises it
**alerts and stops**: it does not half-import, and it does not open the app with garbage.

Two fallbacks, in order of quality:

1. **Copy the profile by hand.** Click into the page, `Ctrl+A`, `Ctrl+C` (or select from
   the top card down to the end of Education), then paste into the import box. LinkedIn's
   own copy puts the sections in the layout the parser expects, so this usually parses
   better than anything we can do by reading the DOM.
2. **LinkedIn's "Save to PDF" export.** *More* → *Save to PDF* on the profile. The parser
   reads the text layer of that export too (it handles page footers such as
   "Page 1 of 3"), so a PDF-to-text copy is a valid input. Applywright's own CV ingest
   accepts `.txt`/`.md`/`.docx` directly, and PDF only when a local `pdftotext` exists —
   for a PDF, extract the text first or paste it.

## 7. The terms question, in three sentences

The bookmarklet reads a page the member is already viewing in their own authenticated
session and does so only when the member clicks it, which is ordinary browser behaviour
rather than automated access, collection or re-publication of LinkedIn data. Applywright
never fetches LinkedIn, never stores LinkedIn credentials, never runs against the site in
the background, and never submits anything to a third party, so the activity it enables is
indistinguishable from the member copying their own profile. The member is the reader of
their own data throughout: the text goes from their page to their clipboard to their
Applywright account, and any data protection duty attached to that account is ours, not a
licence we are claiming to LinkedIn's.

## 8. Rebuilding the bookmarklet

`public/assets/bookmarklet.js` is generated. From the project root:

```powershell
node -e "const fs=require('fs');const head='/* Built from public/assets/bookmarklet.src.js - do not edit by hand. This one line is the bookmarklet URL; paste it whole into a bookmark address. Rebuild: docs/LINKEDIN-CAPTURE.md. */;javascript:';const body=fs.readFileSync('public/assets/bookmarklet.src.js','utf8').split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&l.indexOf('//')!==0).join(' ');fs.writeFileSync('public/assets/bookmarklet.js',head+body+'\n')"
```

The build drops whole-line comments, trims each line and joins the rest into one line,
prefixed with the `javascript:` scheme. It works because the source keeps every comment on
its own line and every statement self-terminating — so do not add a trailing comment to a
code line. `node --check` still passes on the built file: `javascript:` parses as an
ordinary JavaScript label.

Checks that must stay green:

```powershell
node --check public/assets/bookmarklet.src.js
node --check public/assets/bookmarklet.js
node scripts/check.js
```

Two constraints on the built string, both enforced by hand and easy to break:

- **No `%`.** A `javascript:` URL is percent-decoded before it runs, so a literal percent
  sign changes the code. That is why there is no modulo and no percent in the file.
- **No `#`.** A hash starts a URL fragment, which would truncate the script. That is why
  there are no `#id` selectors and no numeric HTML entities, even though both would be
  convenient.

## 9. Testing it without touching LinkedIn

The extraction is verified in two ways, neither of which reads a live LinkedIn page:

- `public/assets/bookmarklet.src.js` runs under `node:vm` against a synthetic DOM
  (a modern `<section>`/`<li>` profile, an id-only-headings profile, a JSON-LD job advert,
  a DOM-only advert, and a page with no structure at all). The emitted text is fed through
  the real `parseLinkedInProfile`: the full fixture parses with **confidence 0.93 and no
  warnings**, two roles with their bullets, one education entry, three skills, one
  certification, two languages.
- The built file runs in headless Chrome against the same fixtures and produces
  **byte-identical** text, which shows the build is faithful and that the fake DOM models
  the browser's `innerText` correctly.

What that does **not** prove, and what this document exists to keep honest: a real
LinkedIn profile page in October 2026 may differ. The extraction is written to survive
that — it keys off `<section>` elements and their `h2`/`h3` labels (and section ids) rather
than LinkedIn's CSS class names — but "survives a markup change" is a claim only a live
check can make, and running one means pointing a browser at LinkedIn, which is the thing
this design refuses to do server-side and does not automate even client-side. If the page
shape changes, the user gets the loud alert in §6 and the fallbacks work.

Known approximations, stated rather than hidden:

- **Grouped roles** (several roles under one company on LinkedIn) are captured per list
  item; the company card and its nested roles are flattened, so a grouped role may arrive
  without its company name.
- **Screen-reader echoes.** LinkedIn renders some labels twice (visible + clipped span).
  The capture drops a line that echoes one of the previous three; a page that duplicates
  text non-adjacently can still carry a duplicate through.
- **Localised profiles** print localised headings ("Berufserfahrung", "Expérience").
  The heading map is English-only, so a non-English profile likely fails the
  recognition check and gets the alert — by design, rather than importing a half CV.
- **Job adverts behind a login wall or in an unsupported container** yield no body and the
  alert fires; the clipboard route (manual copy) is the fallback.

## 10. Debugging

The script exposes `window.__applywrightCapture` on the page it runs on: `classify`,
`extractProfile`, `composeProfile`, `extractJob`, `composeJob`, `copyText`,
`resolveOrigin`, `deliver`, and `config`. The only thing that runs when the script loads is
`run()`, which *is* the click; nothing schedules itself. From a console on a profile page:

```js
const cap = window.__applywrightCapture;
cap.extractProfile(document, location).text;
```

If that returns text but the bookmark does nothing, the problem is delivery (the app
address), not extraction.
