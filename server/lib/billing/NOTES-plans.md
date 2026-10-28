# plans.js — plans, entitlements and prices

One file holds the plan table from SPEC section 2 in code, so the page that shows a
quota and the check that enforces it cannot disagree. No imports, no database, no
network, no clock: the module is data plus pure functions, and the same call
returns the same object every run.

Contract: SPEC section 5, `server/lib/billing/plans.js`.

## Exports

| Export | Returns |
|---|---|
| `PLANS` | `{ free, pro, scale }`, frozen, prices in pence, quotas as numbers |
| `PLAN_IDS` | `["free", "pro", "scale"]` in display order |
| `QUOTA_FEATURES` | `["cvs", "packs", "alerts", "jobResultsPerDay"]` |
| `FLAG_FEATURES` | the six capability flags |
| `ENFORCED_FLAGS` | `["fullAtsReport", "coverLetter", "packHistory"]` — the flags a handler actually gates; the rest are declared only |
| `UNLIMITED` | `Infinity`; use it instead of writing `Infinity` at call sites |
| `CURRENCY` | `"GBP"` |
| `isUnlimited(limit)` | `true` for `Infinity` or `null` (the JSON form) |
| `formatPrice(pence)` | `"£19"`, `"£19.50"`, `"£1,000"`, or `null` when there is no price |
| `normalizePlan(plan)` | a valid plan id; anything unrecognised becomes `"free"` |
| `isPlan(plan)` | `true` only for a real id, after trimming and lower-casing |
| `entitlements(plan)` | resolved plan: prices, quotas, flags, `fallback` marker |
| `can(plan, feature, usage)` | `{ allowed, used, limit, remaining, … }` |
| `usageReport(plan, usage)` | `can()` for all four quotas, in table order |
| `priceFor(plan, interval)` | pence for `"month"`/`"year"`, or `null` |
| `annualSaving(plan)` | pence saved by paying annually |
| `listPlans()` | presentation-ready array for `GET /api/billing/plans` |
| `stripeConfigured()` | boolean, from `process.env` only |

## The numbers

Pence, exclusive of VAT, as SPEC section 2 states them.

| Plan | Month | Year | CVs | Packs / month | Alerts | Job results / day |
|---|---|---|---|---|---|---|
| Free | 0 | 0 | 1 | 3 | 1 | 40 |
| Pro | 1900 | 19000 | 5 | 60 | 10 | unlimited |
| Scale | 4900 | 49000 | unlimited | unlimited | 50 | unlimited |

The annual price is exactly ten monthly payments, so `annualSaving()` is 3800 pence
on Pro and 9800 on Scale. Both are derived from the two prices rather than written
down a second time, which is why a price change cannot leave the "two months free"
claim stale.

## Unlimited is `Infinity` in code and `null` in JSON

Internally a quota is a number, so `used < limit` and `remaining + 1` behave.
JSON has no `Infinity`, so `JSON.stringify` would already write `null` — but by
accident, and an accidental null is indistinguishable from a missing limit. The
quota objects therefore carry a non-enumerable `toJSON` that writes `null` on
purpose, and `isUnlimited()` accepts both forms:

```js
isUnlimited(Infinity); // true  — in code
isUnlimited(null);     // true  — after JSON
isUnlimited(0);        // false — zero is a real ceiling
isUnlimited(undefined); // false — a missing limit is a bug, not a promise
```

Anything reading limits from an HTTP response should check `null` (or use
`listPlans()`, which also carries an explicit `unlimited` boolean per quota) rather
than comparing with `Infinity`, which never survives the wire.

## `can()` is a pre-consumption check

`can(plan, feature, usage)` answers "may this account take one more?". With a limit
of 3, used 2 is allowed with 1 remaining, and used 3 is refused with 0 remaining.
`remaining` is clamped at 0, so an over-quota account reads 0, never a negative.

`usage` is either a plain number or an object of per-feature counts
(`{ packs: 2, alerts: 0 }`), which is the shape `GET /api/auth/me` reports. Numbers
and numeric strings count; anything else (booleans, objects, blanks, `"two"`) counts
as zero. Fractional counts are truncated.

The result carries the answer plus the context that produced it:

```js
{ feature: "packs", plan: "pro", requestedPlan: "pro", fallback: false,
  kind: "quota", allowed: false, used: 60, limit: 60, remaining: 0, unlimited: false }
```

- `kind` is `"quota"`, `"flag"` or `"unknown"`.
- A quota keeps `limit` and `remaining` as numbers (`Infinity` for unlimited).
- A flag reports `limit: 1` when included and `limit: 0` when not, with `used`
  always 0: flags are included or absent, never counted down.
- An unknown plan resolves to free, with `plan: "free"`, `requestedPlan` set to what
  was asked for and `fallback: true`. The free ceiling then applies in full. A
  missing plan (`null`, `undefined`, `""`) also resolves to free but is not a
  fallback: nothing was mis-specified, the account default applies.
- An unknown feature never throws. It returns `allowed: false`, `kind: "unknown"`,
  `limit: null`, `remaining: 0` and
  `error: { code: "unknown_feature", message }`, matching the `{ code, message }`
  shape the HTTP layer uses, so a handler can pass the message straight through.
- Feature names are case-sensitive: `"CVS"` is not a feature.

## Prices

`priceFor()` accepts `month`, `monthly`, `year`, `yearly`, `annual` and `annually`,
in any case, and defaults to monthly. It returns `null` — not a number — for an
unknown interval and for an unknown plan. An unknown plan must not be priced at 0:
that is a checkout that looks like a free purchase. Free is a real plan and really
costs 0.

`formatPrice()` groups thousands itself instead of calling `toLocaleString`, which
would make output depend on the host's ICU data.

## `stripeConfigured()`

Reads `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from `process.env` at call
time (never at import time, so a restarted process or a test sees current values).
Returns `true` only when both are present and non-blank; blanks and whitespace count
as absent. It returns a boolean and nothing else: no value, no prefix, no length,
and the module contains no logging call at all. The test asserts both the return
value and that nothing reaches `console`.

## Integration notes for the HTTP layer

The Lead's handler owns the wiring; these are the intended call sites.

- `GET /api/billing/plans` → `{ plans: listPlans() }`.
- `POST /api/billing/checkout` → resolve the plan from `users.plan`-style input, and
  refuse before touching Stripe: `priceFor(plan, interval) === null` is a 400, and
  `stripeConfigured() === false` is the 501 from SPEC section 6.
- `POST /api/billing/webhook` → 501 when `stripeConfigured()` is false. Signature
  verification, event dispatch and writing `users.plan` all live in the handler;
  this module has no Stripe client and does not verify signatures.
- Quota enforcement: before inserting a CV, pack or alert, call
  `can(user.plan, feature, countWithinWindow)` and refuse with the returned
  `error`/`limit` when `allowed` is false. Count `usage` rows yourself — this module
  does not know what a window is.
- `GET /api/auth/me` → `{ user, plan: entitlements(user.plan), usage: usageReport(user.plan, counts) }`.
- Read the plan from the database, never from the request body. A downgrade takes
  effect on the next request because entitlements are computed per call; existing
  packs stay readable, since nothing here gates a read of stored work.
- `PLANS` is frozen, so a handler cannot accidentally edit a quota at runtime; a
  changed price or quota is a code change, in this file only.

## Feature vocabulary

The task fixed the four quota names. The capability flags come from the "Other"
column of the SPEC table, because `can()` needs a vocabulary and inventing one that
the table does not describe would be worse:

| Flag | From the table | Free | Pro | Scale |
|---|---|---|---|---|
| `fullAtsReport` | Pro: full ATS reports | no | yes | yes |
| `coverLetter` | Pro: covering letters | no | yes | yes |
| `packHistory` | Pro: pack history | no | yes | yes |
| `apiAccess` | Scale: API access | no | no | yes |
| `priorityRefresh` | Scale: priority refresh | no | no | yes |
| `bulkExport` | Scale: export everything | no | no | yes |

Scale includes every Pro flag; a test asserts that hierarchy so a future edit
cannot quietly break it.

`dailyDigest` is **not** in `FLAG_FEATURES`: nothing in the tree delivered a digest, so
the flag was removed rather than sold. The remaining six split in three:

- **Enforced** (`ENFORCED_FLAGS`): `fullAtsReport` gates the tail of `POST /api/analyse`,
  `coverLetter` gates the letter in `/api/tailor` and the refine rebuild, and
  `packHistory` gates the older covering letters in `GET /api/applications/:id`.
- **Declared but unenforced**: `apiAccess`, `priorityRefresh` and `bulkExport` are
  returned by the plans API and gated nowhere — "API access" has no key authentication
  and priority refresh has no queue. `GET /api/export` stays open to every plan on
  purpose: exporting your own data is data portability, not pack history.
- **Removed**: `dailyDigest`, from the table and from the pricing copy.

## What this module deliberately does not do

- No Stripe SDK, no checkout session, no webhook signature check, no price-ID
  mapping. A real checkout needs `(plan, interval) → Stripe price id` configuration
  that can only be verified against a live Stripe account, so `stripeConfigured()`
  plus the 501 is the honest degraded path rather than a half-wired integration.
- No proration, invoices, receipts, coupons, trials, seat counts, dunning or tax.
  Prices exclude VAT, as the SPEC says; VAT and currency conversion are not modelled.
- No database access and no usage accounting. `can()` trusts the count it is given,
  which means the caller must count in the right window: packs and CVs per calendar
  month, job results per UTC day.
- No reset logic. Nothing here decides when a quota window rolls over.

## Decisions and interpretations

1. **Unknown plan in `priceFor()` returns `null`, not free's 0.** SPEC section 5 only
   says `can()` falls back to free. Pricing a typo at £0 would produce a checkout
   that looks free, so the price path refuses instead.
2. **`fullAtsReport` gates the report, not the score.** The SPEC table says Pro gets
   "full ATS reports"; the score, the five subscores and the top three findings stay on
   Free, because the score is core to every plan, while the rest of the findings and the
   advice array are Pro. `plans.js` names it in `ENFORCED_FLAGS`; the handler in
   `server/app.js` is the gate.
3. **`bulkExport`, not `exportAll`.** SPEC section 1 and section 6 require
   `GET /api/export` and account deletion to work on every plan. Naming Scale's flag
   `bulkExport` keeps the privacy export from being gated by mistake.
4. **`jobResultsPerDay` is a daily cap among monthly quotas.** It is named as the task
   named it; the window is a server concern.
5. **Alerts count as they stand at the moment of the check.** Whether deleting an
   alert frees a slot is the Lead's call; `can()` simply compares a count with the
   limit.
6. **`summary` strings restate the table in one sentence** so the pricing page has no
   prose of its own to drift. They add no claim the table does not make.

## Tests

```
node --test server/lib/billing/plans.test.mjs
```

62 tests, 12 suites, all passing, and `--experimental-test-coverage` reports 100% of
lines, branches and functions in `plans.js`. They cover the exact prices and the
ten-month annual rule, every quota in the table, the 2-of-3 boundary on both sides,
unlimited plans, the null-on-the-wire form, unknown plan fallback, unknown features,
flag inclusion per plan, price and interval refusals, price formatting, `listPlans()`
shape, and `stripeConfigured()` with neither, either and both variables set, blanks,
and a check that no secret reaches the console. Environment variables are restored
in a `finally` block, so the suite leaves the process as it found it. No test touches
the network, the clock or the filesystem.
