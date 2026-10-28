/**
 * Plans, entitlements and prices — the single source of truth for the quota and
 * price numbers the server enforces and the pages display. SPEC section 2 is the
 * table; this file is that table in code, and every other surface reads it.
 *
 * Pure: no database, no network, no clock, no environment reads except
 * `stripeConfigured()`. Same input, same output, on every run.
 *
 * Unlimited is `Infinity` internally, because arithmetic and comparisons then
 * behave (`used < Infinity`). JSON has no Infinity, so every quota object
 * carries a `toJSON` that writes `null` instead, and `isUnlimited()` accepts
 * either form. Without that, `JSON.stringify` would emit null by accident and
 * the client would be guessing whether null meant "unlimited" or "missing".
 */

/** Internal marker for a quota with no ceiling. Serialises as null. */
export const UNLIMITED = Infinity;

export const CURRENCY = "GBP";

/** Counted quotas, in the order the SPEC table lists them. */
export const QUOTA_FEATURES = Object.freeze(["cvs", "packs", "alerts", "jobResultsPerDay"]);

/**
 * Capability flags, taken from the "Other" column of the SPEC table. These are
 * included or not — they are never counted down.
 *
 * A flag belongs here only if some route could gate on it. `dailyDigest` was
 * removed in schema 3: it had no delivery mechanism anywhere in the tree, so
 * selling it was a promise nothing could keep.
 */
export const FLAG_FEATURES = Object.freeze([
  "fullAtsReport",
  "coverLetter",
  "packHistory",
  "apiAccess",
  "priorityRefresh",
  "bulkExport",
]);

/**
 * The capability flags a handler actually gates on, and where:
 *
 *   fullAtsReport — `POST /api/analyse`: Free gets the score, the five subscores
 *                   and the three highest-priority findings; the rest of the
 *                   findings list and the advice array are Pro.
 *   coverLetter   — `POST /api/tailor` and `POST /api/applications/:id/refine`:
 *                   a Free pack carries `coverLetterMd: ""` and a lock message.
 *   packHistory   — `GET /api/applications/:id`: Free may read the covering
 *                   letter of its most recent pack only; older packs return the
 *                   lock message and keep their CV and screening answers.
 *
 * Everything in `FLAG_FEATURES` that is not named here is **declared but
 * unenforced** — it is returned by the plans API, and the pricing page sells
 * `apiAccess`, `priorityRefresh` and `bulkExport`, but no code path gates on
 * them. `docs/PROJECT-STATUS.md` §9 records that debt; the pricing-copy test in
 * `tests/flags-webhook.test.js` keeps every flag on one side of this line or the
 * other, so a new flag cannot be added without deciding which it is.
 */
export const ENFORCED_FLAGS = Object.freeze(["fullAtsReport", "coverLetter", "packHistory"]);

export const PLAN_IDS = Object.freeze(["free", "pro", "scale"]);

/**
 * True for the unlimited marker in either form: `Infinity` in code, `null` once
 * it has been through JSON. `undefined` is not unlimited — it means a missing
 * limit, which is a bug, not a promise.
 */
export function isUnlimited(limit) {
  return limit === Infinity || limit === null;
}

/** 1900 -> "£19", 1950 -> "£19.50", 100000 -> "£1,000". null for no price. */
export function formatPrice(pence) {
  if (pence === null || pence === undefined) return null;
  if (typeof pence !== "number" || !Number.isFinite(pence) || pence < 0) return null;
  const total = Math.round(pence); // prices are whole pence; never print a fraction
  const whole = Math.trunc(total / 100);
  const rest = total % 100;
  // Grouped by hand: toLocaleString depends on host ICU data, which would make
  // the output differ between machines.
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest === 0 ? `£${grouped}` : `£${grouped}.${String(rest).padStart(2, "0")}`;
}

const PLANS_SPEC = {
  free: {
    name: "Free",
    price: { month: 0, year: 0 },
    quotas: { cvs: 1, packs: 3, alerts: 1, jobResultsPerDay: 40 },
    flags: [],
    summary:
      "One CV, three tailored packs a month, one alert, and a job feed with 40 results a day.",
  },
  pro: {
    name: "Pro",
    price: { month: 1900, year: 19000 },
    quotas: { cvs: 5, packs: 60, alerts: 10, jobResultsPerDay: UNLIMITED },
    flags: ["fullAtsReport", "coverLetter", "packHistory"],
    summary:
      "Five CVs, 60 packs a month, 10 alerts, the full ATS report, covering letters and pack history.",
  },
  scale: {
    name: "Scale",
    price: { month: 4900, year: 49000 },
    quotas: { cvs: UNLIMITED, packs: UNLIMITED, alerts: 50, jobResultsPerDay: UNLIMITED },
    flags: [
      "fullAtsReport",
      "coverLetter",
      "packHistory",
      "apiAccess",
      "priorityRefresh",
      "bulkExport",
    ],
    summary:
      "Unlimited CVs and packs, 50 alerts, API access, priority refresh and an export of everything.",
  },
};

/** Raw limits with unlimited flattened to null — the only JSON-safe form. */
function jsonLimits(limits) {
  const out = {};
  for (const feature of QUOTA_FEATURES) {
    out[feature] = isUnlimited(limits[feature]) ? null : limits[feature];
  }
  return out;
}

/** A frozen quota object that serialises Infinity as null. */
function makeQuotas(spec) {
  const quotas = {
    cvs: spec.cvs,
    packs: spec.packs,
    alerts: spec.alerts,
    jobResultsPerDay: spec.jobResultsPerDay,
  };
  // Non-enumerable so spreads and deep-equals see only the four limits.
  Object.defineProperty(quotas, "toJSON", { value: () => jsonLimits(quotas), enumerable: false });
  return Object.freeze(quotas);
}

function buildPlan(id) {
  const spec = PLANS_SPEC[id];
  return Object.freeze({
    id,
    name: spec.name,
    currency: CURRENCY,
    // Pence, exclusive of VAT, for both billing intervals.
    price: Object.freeze({ month: spec.price.month, year: spec.price.year }),
    quotas: makeQuotas(spec.quotas),
    flags: Object.freeze([...spec.flags]),
    features: Object.freeze([
      ...QUOTA_FEATURES,
      ...FLAG_FEATURES.filter((feature) => spec.flags.includes(feature)),
    ]),
    summary: spec.summary,
  });
}

/** `{ free, pro, scale }` — frozen, with prices in pence and quotas in numbers. */
export const PLANS = Object.freeze(
  Object.fromEntries(PLAN_IDS.map((id) => [id, buildPlan(id)]))
);

/** Accepts any string; anything unrecognised becomes "free". */
export function normalizePlan(plan) {
  const id = typeof plan === "string" ? plan.trim().toLowerCase() : "";
  return PLAN_IDS.includes(id) ? id : "free";
}

export function isPlan(plan) {
  return typeof plan === "string" && PLAN_IDS.includes(plan.trim().toLowerCase());
}

/**
 * Resolve one plan to everything a caller needs: prices, limits, flags.
 *
 * Quotas appear twice on purpose — as `quotas` (the object) and flattened
 * (`entitlements("pro").packs === 60`) — because both readings are natural and
 * they cannot drift: they are the same numbers on one frozen object.
 *
 * An unknown plan resolves to free and says so via `fallback: true` and
 * `requestedPlan`. A missing plan (null/undefined/empty) also resolves to free,
 * but is not a fallback — nothing was mis-specified, the account default applies.
 */
export function entitlements(plan) {
  const raw = typeof plan === "string" ? plan.trim().toLowerCase() : "";
  const requestedPlan = raw === "" ? null : raw;
  const id = normalizePlan(plan);
  const entry = PLANS[id];
  const fallback = requestedPlan !== null && requestedPlan !== id;
  return Object.freeze({
    plan: id,
    requestedPlan,
    fallback,
    name: entry.name,
    currency: entry.currency,
    price: Object.freeze({ month: entry.price.month, year: entry.price.year }),
    priceLabel: Object.freeze({
      month: formatPrice(entry.price.month),
      year: formatPrice(entry.price.year),
    }),
    quotas: entry.quotas,
    cvs: entry.quotas.cvs,
    packs: entry.quotas.packs,
    alerts: entry.quotas.alerts,
    jobResultsPerDay: entry.quotas.jobResultsPerDay,
    flags: entry.flags,
    features: entry.features,
  });
}

/** How much of `feature` the caller has already spent. Tolerant of junk. */
function usedFor(usage, feature) {
  const raw = usage && typeof usage === "object" ? usage[feature] : usage;
  // Numbers and numeric strings count (a count read back as text is still a
  // count); booleans, objects, NaN and blanks are zero.
  const amount = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.trunc(amount);
}

/**
 * Can this plan take one more of `feature`?
 *
 * `usage` is the amount already spent: either a plain number, or an object of
 * per-feature counts (`{ packs: 2, alerts: 0 }`) such as the one `GET /api/auth/me`
 * reports. Numbers and numeric strings count; anything else counts as zero.
 * `allowed` is the pre-consumption check: with a limit of 3, used 2 is allowed
 * and used 3 is refused.
 *
 * Quota features return `limit` and `remaining` as numbers, Infinity included
 * (JSON writes those as null — `isUnlimited` reads both). Flags return limit 1
 * when included and 0 when not, with `used` always 0. An unknown feature never
 * throws: it returns `allowed: false` with an `error: { code, message }`, the
 * same shape the HTTP layer uses for its own errors, so a handler can pass the
 * message straight through.
 */
export function can(plan, feature, usage = 0) {
  const resolved = entitlements(plan);
  const name = typeof feature === "string" ? feature.trim() : "";
  const used = usedFor(usage, name);
  const context = {
    feature: name,
    plan: resolved.plan,
    requestedPlan: resolved.requestedPlan,
    fallback: resolved.fallback,
  };

  if (QUOTA_FEATURES.includes(name)) {
    const limit = resolved.quotas[name];
    const unlimited = isUnlimited(limit);
    return {
      ...context,
      kind: "quota",
      allowed: unlimited || used < limit,
      used,
      limit,
      remaining: unlimited ? UNLIMITED : Math.max(0, limit - used),
      unlimited,
    };
  }

  if (FLAG_FEATURES.includes(name)) {
    const included = resolved.flags.includes(name);
    return {
      ...context,
      kind: "flag",
      allowed: included,
      used: 0,
      limit: included ? 1 : 0,
      remaining: included ? 1 : 0,
      unlimited: false,
    };
  }

  return {
    ...context,
    kind: "unknown",
    allowed: false,
    used,
    limit: null,
    remaining: 0,
    unlimited: false,
    error: {
      code: "unknown_feature",
      message:
        `Unknown feature "${name}". Quota features: ${QUOTA_FEATURES.join(", ")}. ` +
        `Capability features: ${FLAG_FEATURES.join(", ")}.`,
    },
  };
}

/** Every quota for one plan in one call — for `{ user, plan, usage }` responses. */
export function usageReport(plan, usage = {}) {
  return QUOTA_FEATURES.map((feature) => can(plan, feature, usage));
}

const INTERVAL_ALIASES = Object.freeze({
  month: "month",
  monthly: "month",
  year: "year",
  yearly: "year",
  annual: "year",
  annually: "year",
});

/**
 * Price in pence for one billing interval, exclusive of VAT.
 *
 * Unknown plan or interval returns null rather than a number: a checkout must
 * refuse an unknown plan, and a 0 here would read as a free purchase. Free is a
 * real plan and really costs 0.
 */
export function priceFor(plan, interval = "month") {
  if (!isPlan(plan)) return null;
  const key = typeof interval === "string" ? interval.trim().toLowerCase() : "";
  const resolvedInterval = INTERVAL_ALIASES[key];
  if (!resolvedInterval) return null;
  return PLANS[normalizePlan(plan)].price[resolvedInterval];
}

/** What the annual price saves against twelve monthly ones, in pence. */
export function annualSaving(plan) {
  if (!isPlan(plan)) return null;
  const { month, year } = PLANS[normalizePlan(plan)].price;
  return Math.max(0, month * 12 - year);
}

/**
 * Presentation-ready plan list for `GET /api/billing/plans`, in plan order.
 * Quotas are already JSON-safe (null = unlimited) and `unlimited` spells it out,
 * so a template never has to guess what null means.
 */
export function listPlans() {
  return PLAN_IDS.map((id) => {
    const entry = PLANS[id];
    const limits = jsonLimits(entry.quotas);
    return {
      id: entry.id,
      name: entry.name,
      currency: entry.currency,
      price: { month: entry.price.month, year: entry.price.year },
      priceLabel: {
        month: formatPrice(entry.price.month),
        year: formatPrice(entry.price.year),
      },
      annualSaving: annualSaving(id),
      quotas: limits,
      unlimited: {
        cvs: limits.cvs === null,
        packs: limits.packs === null,
        alerts: limits.alerts === null,
        jobResultsPerDay: limits.jobResultsPerDay === null,
      },
      flags: [...entry.flags],
      summary: entry.summary,
    };
  });
}

const present = (value) => typeof value === "string" && value.trim() !== "";

/**
 * Are both Stripe secrets set? Read from `process.env` at call time, never
 * cached at import time (so a test or a restarted process can change them), and
 * never logged, echoed or returned — only the boolean leaves this function.
 * The HTTP handlers answer 501 when this is false (SPEC section 6).
 */
export function stripeConfigured() {
  return present(process.env.STRIPE_SECRET_KEY) && present(process.env.STRIPE_WEBHOOK_SECRET);
}
