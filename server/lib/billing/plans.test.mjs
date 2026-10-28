/**
 * Tests for the plan and entitlement layer. No network, no files, no clock:
 * every case is a pure call against the numbers the SPEC table fixes.
 *
 * Run: node --test server/lib/billing/plans.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PLANS,
  PLAN_IDS,
  QUOTA_FEATURES,
  FLAG_FEATURES,
  UNLIMITED,
  CURRENCY,
  isUnlimited,
  formatPrice,
  normalizePlan,
  isPlan,
  entitlements,
  can,
  usageReport,
  priceFor,
  annualSaving,
  listPlans,
  stripeConfigured,
} from "./plans.js";

const STRIPE_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];

function snapshotEnv() {
  const snapshot = new Map();
  for (const key of STRIPE_KEYS) {
    snapshot.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : null);
  }
  return snapshot;
}

function restoreEnv(snapshot) {
  for (const [key, value] of snapshot) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
}

/** Set env vars for one call, then put the process back exactly as it was. */
function withStripeEnv(env, fn) {
  const snapshot = snapshotEnv();
  try {
    for (const key of STRIPE_KEYS) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    return fn();
  } finally {
    restoreEnv(snapshot);
  }
}

/** Capture console output for one call — used to prove nothing is logged. */
function captureConsole(fn) {
  const methods = ["log", "info", "warn", "error", "debug"];
  const originals = {};
  for (const name of methods) originals[name] = console[name];
  const calls = [];
  for (const name of methods) {
    console[name] = (...args) => {
      calls.push({ name, args });
    };
  }
  try {
    return { result: fn(), calls };
  } finally {
    for (const name of methods) console[name] = originals[name];
  }
}

describe("prices (SPEC section 2)", () => {
  it("charges nothing on free, for either interval", () => {
    assert.equal(priceFor("free", "month"), 0);
    assert.equal(priceFor("free", "year"), 0);
  });

  it("charges Pro 1900 pence a month and 19000 a year", () => {
    assert.equal(priceFor("pro", "month"), 1900);
    assert.equal(priceFor("pro", "year"), 19000);
  });

  it("charges Scale 4900 pence a month and 49000 a year", () => {
    assert.equal(priceFor("scale", "month"), 4900);
    assert.equal(priceFor("scale", "year"), 49000);
  });

  it("gives 12 months for the price of 10 on both paid plans", () => {
    for (const id of ["pro", "scale"]) {
      const month = priceFor(id, "month");
      const year = priceFor(id, "year");
      assert.equal(year, month * 10, `${id} annual price is ten monthly payments`);
      assert.equal(year, month * 12 - 2 * month, `${id} annual price saves two months`);
    }
    assert.equal(annualSaving("pro"), 3800);
    assert.equal(annualSaving("scale"), 9800);
    assert.equal(annualSaving("free"), 0);
    assert.equal(annualSaving("enterprise"), null);
  });

  it("defaults to the monthly interval", () => {
    assert.equal(priceFor("pro"), 1900);
    assert.equal(priceFor("scale"), 4900);
  });

  it("accepts the usual interval spellings", () => {
    for (const alias of ["month", "monthly", "MONTH", " month "]) {
      assert.equal(priceFor("pro", alias), 1900, `interval ${alias}`);
    }
    for (const alias of ["year", "yearly", "annual", "annually", "YEARS".slice(0, 4)]) {
      assert.equal(priceFor("pro", alias), 19000, `interval ${alias}`);
    }
  });

  it("returns null for an interval it cannot price rather than a number", () => {
    assert.equal(priceFor("pro", "week"), null);
    assert.equal(priceFor("pro", ""), null);
    assert.equal(priceFor("pro", null), null);
    assert.equal(priceFor("pro", 12), null);
  });

  it("returns null for an unknown plan rather than a free price", () => {
    // A checkout must refuse this: 0 would read as a purchase that costs nothing.
    assert.equal(priceFor("enterprise", "month"), null);
    assert.equal(priceFor(null, "month"), null);
  });

  it("exposes the same numbers on PLANS as priceFor returns", () => {
    assert.equal(PLANS.free.price.month, 0);
    assert.equal(PLANS.pro.price.month, 1900);
    assert.equal(PLANS.pro.price.year, 19000);
    assert.equal(PLANS.scale.price.month, 4900);
    assert.equal(PLANS.scale.price.year, 49000);
    for (const id of PLAN_IDS) {
      for (const interval of ["month", "year"]) {
        assert.equal(PLANS[id].price[interval], priceFor(id, interval));
      }
    }
  });

  it("states the currency once", () => {
    assert.equal(CURRENCY, "GBP");
    for (const id of PLAN_IDS) assert.equal(PLANS[id].currency, "GBP");
  });
});

describe("quotas (SPEC section 2 table)", () => {
  // The table, retyped from the SPEC so a silent edit to one side fails here.
  const TABLE = {
    free: { cvs: 1, packs: 3, alerts: 1, jobResultsPerDay: 40 },
    pro: { cvs: 5, packs: 60, alerts: 10, jobResultsPerDay: Infinity },
    scale: { cvs: Infinity, packs: Infinity, alerts: 50, jobResultsPerDay: Infinity },
  };

  it("matches the SPEC table exactly", () => {
    for (const id of PLAN_IDS) {
      for (const feature of QUOTA_FEATURES) {
        assert.equal(PLANS[id].quotas[feature], TABLE[id][feature], `${id}.${feature}`);
      }
    }
  });

  it("carries exactly the four counted quotas", () => {
    for (const id of PLAN_IDS) {
      assert.deepEqual(Object.keys(PLANS[id].quotas), ["cvs", "packs", "alerts", "jobResultsPerDay"]);
    }
  });

  it("freezes plans so no handler can edit a quota at runtime", () => {
    assert.ok(Object.isFrozen(PLANS));
    assert.ok(Object.isFrozen(PLANS.pro));
    assert.ok(Object.isFrozen(PLANS.pro.price));
    assert.ok(Object.isFrozen(PLANS.scale.quotas));
    assert.throws(() => {
      PLANS.pro.quotas.cvs = 500;
    }, TypeError);
    assert.throws(() => {
      PLANS.free.price.month = 0;
    }, TypeError);
    assert.throws(() => {
      PLANS.enterprise = { id: "enterprise" };
    }, TypeError);
    assert.equal(PLANS.pro.quotas.cvs, 5);
  });

  it("lists the plans in order", () => {
    assert.deepEqual([...PLAN_IDS], ["free", "pro", "scale"]);
    assert.deepEqual(Object.keys(PLANS), ["free", "pro", "scale"]);
  });
});

describe("unlimited quotas and their JSON form", () => {
  it("recognises unlimited in code and after JSON", () => {
    assert.equal(isUnlimited(Infinity), true);
    assert.equal(isUnlimited(UNLIMITED), true);
    assert.equal(isUnlimited(null), true, "null is the JSON form of unlimited");
    assert.equal(isUnlimited(5), false);
    assert.equal(isUnlimited(0), false, "zero is a real ceiling");
    assert.equal(isUnlimited(undefined), false, "a missing limit is a bug, not a promise");
  });

  it("serialises unlimited quotas as null, not as a broken number", () => {
    assert.equal(
      JSON.stringify(PLANS.scale.quotas),
      '{"cvs":null,"packs":null,"alerts":50,"jobResultsPerDay":null}'
    );
    assert.equal(
      JSON.stringify(PLANS.free.quotas),
      '{"cvs":1,"packs":3,"alerts":1,"jobResultsPerDay":40}'
    );
    const round = JSON.parse(JSON.stringify(PLANS.pro.quotas));
    assert.equal(round.jobResultsPerDay, null);
    assert.equal(round.cvs, 5);
  });

  it("serialises a whole plan without leaking Infinity or a function", () => {
    const json = JSON.stringify(PLANS.pro);
    assert.equal(json.includes("Infinity"), false);
    assert.equal(json.includes("toJSON"), false);
    const parsed = JSON.parse(json);
    assert.equal(parsed.id, "pro");
    assert.equal(parsed.price.month, 1900);
    assert.equal(parsed.quotas.jobResultsPerDay, null);
  });

  it("keeps toJSON out of the quota key set", () => {
    assert.equal(Object.keys(PLANS.scale.quotas).includes("toJSON"), false);
    assert.deepEqual(PLANS.free.quotas, { cvs: 1, packs: 3, alerts: 1, jobResultsPerDay: 40 });
  });
});

describe("entitlements", () => {
  it("resolves a known plan", () => {
    const pro = entitlements("pro");
    assert.equal(pro.plan, "pro");
    assert.equal(pro.fallback, false);
    assert.equal(pro.name, "Pro");
    assert.equal(pro.packs, 60);
    assert.equal(pro.quotas.packs, 60);
    assert.equal(pro.price.month, 1900);
    assert.deepEqual(pro.priceLabel, { month: "£19", year: "£190" });
    assert.ok(pro.flags.includes("coverLetter"));
    assert.ok(pro.features.includes("packs"));
  });

  it("falls back to free for an unknown plan and says so", () => {
    const bogus = entitlements("enterprise");
    assert.equal(bogus.plan, "free");
    assert.equal(bogus.requestedPlan, "enterprise");
    assert.equal(bogus.fallback, true);
    assert.equal(bogus.cvs, 1);
    assert.equal(bogus.packs, 3);
  });

  it("treats a missing plan as the free default, not as a fallback", () => {
    for (const value of [null, undefined, "", "   ", 42, {}]) {
      const resolved = entitlements(value);
      assert.equal(resolved.plan, "free", `entitlements(${JSON.stringify(value)})`);
      assert.equal(resolved.fallback, false);
      assert.equal(resolved.requestedPlan, null);
    }
  });

  it("normalises case and whitespace", () => {
    assert.equal(normalizePlan(" PRO "), "pro");
    assert.equal(normalizePlan("Scale"), "scale");
    assert.equal(normalizePlan("gold"), "free");
    assert.equal(isPlan("pro"), true);
    assert.equal(isPlan(" gold "), false);
    assert.equal(entitlements(" SCALE ").plan, "scale");
  });

  it("hands out the same frozen quota object it holds", () => {
    assert.equal(entitlements("pro").quotas, PLANS.pro.quotas);
  });
});

describe("can(): quota boundaries", () => {
  it("allows the third of four packs when two are used, refuses the fourth when three are used", () => {
    // free: packs limit 3 — the boundary case named in the SPEC.
    const room = can("free", "packs", 2);
    assert.equal(room.allowed, true);
    assert.equal(room.used, 2);
    assert.equal(room.limit, 3);
    assert.equal(room.remaining, 1);

    const full = can("free", "packs", 3);
    assert.equal(full.allowed, false);
    assert.equal(full.used, 3);
    assert.equal(full.limit, 3);
    assert.equal(full.remaining, 0);
  });

  it("counts the first CV as allowed on free and the second as refused", () => {
    assert.equal(can("free", "cvs", 0).allowed, true);
    assert.equal(can("free", "cvs", 0).remaining, 1);
    assert.equal(can("free", "cvs", 1).allowed, false);
    assert.equal(can("free", "cvs", 2).allowed, false, "over quota stays refused");
    assert.equal(can("free", "cvs", 2).remaining, 0, "remaining never goes negative");
  });

  it("walks the Pro pack ceiling", () => {
    assert.equal(can("pro", "packs", 58).allowed, true);
    assert.equal(can("pro", "packs", 58).remaining, 2);
    assert.equal(can("pro", "packs", 59).allowed, true);
    assert.equal(can("pro", "packs", 59).remaining, 1);
    assert.equal(can("pro", "packs", 60).allowed, false);
    assert.equal(can("pro", "packs", 60).remaining, 0);
  });

  it("holds alerts to the table: free 1, Pro 10, Scale 50", () => {
    assert.equal(can("free", "alerts", 0).allowed, true);
    assert.equal(can("free", "alerts", 1).allowed, false);
    assert.equal(can("pro", "alerts", 9).allowed, true);
    assert.equal(can("pro", "alerts", 10).allowed, false);
    assert.equal(can("scale", "alerts", 49).allowed, true);
    assert.equal(can("scale", "alerts", 50).allowed, false);
  });

  it("caps the free job feed at 40 results a day", () => {
    assert.equal(can("free", "jobResultsPerDay", 39).allowed, true);
    assert.equal(can("free", "jobResultsPerDay", 40).allowed, false);
  });

  it("reports the resolved plan, feature and kind alongside the answer", () => {
    assert.deepEqual(can("pro", "packs", 2), {
      feature: "packs",
      plan: "pro",
      requestedPlan: "pro",
      fallback: false,
      kind: "quota",
      allowed: true,
      used: 2,
      limit: 60,
      remaining: 58,
      unlimited: false,
    });
  });
});

describe("can(): unlimited plans", () => {
  it("allows any amount on Scale CVs and packs", () => {
    const cvs = can("scale", "cvs", 25_000);
    assert.equal(cvs.allowed, true);
    assert.equal(cvs.limit, Infinity);
    assert.equal(cvs.remaining, Infinity);
    assert.equal(cvs.unlimited, true);

    const packs = can("scale", "packs", 1_000_000);
    assert.equal(packs.allowed, true);
    assert.equal(packs.limit, Infinity);

    assert.equal(can("scale", "cvs", 0).remaining, Infinity);
  });

  it("allows an unlimited job feed on Pro and Scale", () => {
    for (const id of ["pro", "scale"]) {
      const result = can(id, "jobResultsPerDay", 500_000);
      assert.equal(result.allowed, true, `${id} job feed`);
      assert.equal(result.unlimited, true);
    }
  });

  it("writes unlimited limits as null in JSON", () => {
    const parsed = JSON.parse(JSON.stringify(can("scale", "packs", 10)));
    assert.equal(parsed.allowed, true);
    assert.equal(parsed.limit, null);
    assert.equal(parsed.remaining, null);
    assert.equal(parsed.unlimited, true);
    assert.equal(isUnlimited(parsed.limit), true);
  });
});

describe("can(): unknown plans and features", () => {
  it("falls back to free for an unknown plan", () => {
    const cvs = can("enterprise", "cvs", 0);
    assert.equal(cvs.allowed, true);
    assert.equal(cvs.plan, "free");
    assert.equal(cvs.requestedPlan, "enterprise");
    assert.equal(cvs.fallback, true);
    assert.equal(cvs.limit, 1);
    assert.equal(can("enterprise", "cvs", 1).allowed, false, "the free ceiling still applies");
    assert.equal(can("", "packs", 2).limit, 3);
  });

  it("returns an error object for an unknown feature instead of throwing", () => {
    const result = can("pro", "unicorns", 0);
    assert.equal(result.allowed, false);
    assert.equal(result.kind, "unknown");
    assert.equal(result.limit, null);
    assert.equal(result.remaining, 0);
    assert.equal(result.error.code, "unknown_feature");
    assert.match(result.error.message, /unicorns/);
    assert.match(result.error.message, /cvs/);
    assert.equal(JSON.parse(JSON.stringify(result)).error.code, "unknown_feature");
  });

  it("does not throw for empty or non-string features", () => {
    for (const feature of ["", "   ", undefined, null, 7, {}]) {
      assert.doesNotThrow(() => can("pro", feature, 0));
      assert.equal(can("pro", feature, 0).allowed, false);
      assert.equal(can("pro", feature, 0).error.code, "unknown_feature");
    }
  });

  it("is not fooled by a feature name that only looks like a quota", () => {
    assert.equal(can("pro", "CVS", 0).allowed, false, "feature names are case-sensitive");
    assert.equal(can("pro", "cv", 0).allowed, false);
  });
});

describe("can(): flags and usage input", () => {
  it("recognises capability flags from the SPEC table", () => {
    // dailyDigest was removed from the inventory in schema 3: nothing delivered a
    // digest, so the flag was a promise no route could keep.
    for (const feature of ["fullAtsReport", "coverLetter", "packHistory"]) {
      assert.equal(can("pro", feature).allowed, true, `pro ${feature}`);
      assert.equal(can("scale", feature).allowed, true, `scale ${feature}`);
      assert.equal(can("free", feature).allowed, false, `free ${feature}`);
    }
    assert.equal(can("pro", "dailyDigest").kind, "unknown");
    assert.equal(can("pro", "apiAccess").allowed, false);
    assert.equal(can("scale", "apiAccess").allowed, true);
    assert.equal(can("scale", "priorityRefresh").allowed, true);
    assert.equal(can("scale", "bulkExport").allowed, true);
    assert.equal(can("pro", "bulkExport").allowed, false);
  });

  it("gives flags a limit of 1 or 0 and spends nothing", () => {
    const included = can("scale", "apiAccess");
    assert.deepEqual(included, {
      feature: "apiAccess",
      plan: "scale",
      requestedPlan: "scale",
      fallback: false,
      kind: "flag",
      allowed: true,
      used: 0,
      limit: 1,
      remaining: 1,
      unlimited: false,
    });
    const excluded = can("free", "apiAccess");
    assert.equal(excluded.allowed, false);
    assert.equal(excluded.limit, 0);
    assert.equal(excluded.remaining, 0);
  });

  it("never counts a flag down", () => {
    assert.equal(can("scale", "apiAccess", 99).used, 0);
    assert.equal(can("scale", "apiAccess", 99).allowed, true);
  });

  it("includes every Pro flag on Scale", () => {
    for (const feature of PLANS.pro.flags) {
      assert.ok(PLANS.scale.flags.includes(feature), `Scale should include ${feature}`);
    }
    assert.deepEqual([...PLAN_IDS].sort(), ["free", "pro", "scale"]);
  });

  it("keeps flags and quota names disjoint", () => {
    for (const feature of FLAG_FEATURES) assert.equal(QUOTA_FEATURES.includes(feature), false);
    // Six after dailyDigest was removed with the digest that never existed.
    assert.deepEqual([...FLAG_FEATURES].length, 6);
  });

  it("accepts a per-feature usage map", () => {
    assert.equal(can("pro", "packs", { packs: 2 }).remaining, 58);
    assert.equal(can("pro", "packs", { packs: 60 }).allowed, false);
    assert.equal(can("pro", "packs", { alerts: 9 }).used, 0, "another feature's usage is ignored");
    assert.equal(can("pro", "alerts", { packs: 60, alerts: 9 }).allowed, true);
    assert.equal(can("pro", "jobResultsPerDay", { packs: 60 }).allowed, true);
  });

  it("treats junk usage as zero", () => {
    for (const usage of [undefined, null, "two", -5, NaN, {}, [], true]) {
      assert.equal(can("pro", "packs", usage).used, 0, `usage ${String(usage)}`);
      assert.equal(can("pro", "packs", usage).allowed, true);
    }
    assert.equal(can("pro", "packs", 2.9).used, 2, "fractional counts are truncated");
    assert.equal(can("pro", "cvs", "2").used, 2, "a count read back as text still counts");
    assert.equal(can("pro", "cvs", " 2 ").used, 2);
    assert.equal(can("pro", "cvs", "0").used, 0);
  });

  it("summarises every quota for a plan in one call", () => {
    const report = usageReport("pro", { packs: 59, cvs: 5 });
    assert.deepEqual(
      report.map((row) => row.feature),
      [...QUOTA_FEATURES]
    );
    assert.equal(report.length, 4);
    for (const row of report) {
      assert.deepEqual(row, can("pro", row.feature, { packs: 59, cvs: 5 }));
    }
    assert.equal(report.find((row) => row.feature === "packs").remaining, 1);
    assert.equal(report.find((row) => row.feature === "cvs").allowed, false);
    assert.equal(usageReport("free").every((row) => row.used === 0), true);
  });
});

describe("price formatting", () => {
  it("writes pounds for whole amounts and keeps pence when present", () => {
    assert.equal(formatPrice(0), "£0");
    assert.equal(formatPrice(1900), "£19");
    assert.equal(formatPrice(19000), "£190");
    assert.equal(formatPrice(4900), "£49");
    assert.equal(formatPrice(1950), "£19.50");
    assert.equal(formatPrice(1999), "£19.99");
  });

  it("groups thousands without depending on host locale data", () => {
    assert.equal(formatPrice(100000), "£1,000");
    assert.equal(formatPrice(123456), "£1,234.56");
  });

  it("rounds to whole pence so a label is never half a penny", () => {
    assert.equal(formatPrice(1950.4), "£19.50");
    assert.equal(formatPrice(1950.6), "£19.51");
  });

  it("returns null when there is no price to show", () => {
    for (const value of [null, undefined, -1, NaN, Infinity, "1900"]) {
      assert.equal(formatPrice(value), null, `formatPrice(${String(value)})`);
    }
  });
});

describe("listPlans() for GET /api/billing/plans", () => {
  it("returns the three plans in order with labels and JSON-safe quotas", () => {
    const plans = listPlans();
    assert.equal(plans.length, 3);
    assert.deepEqual(
      plans.map((plan) => plan.id),
      ["free", "pro", "scale"]
    );
    assert.deepEqual(plans[0].priceLabel, { month: "£0", year: "£0" });
    assert.deepEqual(plans[1].priceLabel, { month: "£19", year: "£190" });
    assert.deepEqual(plans[2].priceLabel, { month: "£49", year: "£490" });
    assert.equal(plans[1].annualSaving, 3800);
    assert.equal(plans[2].annualSaving, 9800);
    assert.equal(plans[0].annualSaving, 0);
  });

  it("spells out unlimited rather than leaving a bare null", () => {
    const scale = listPlans()[2];
    assert.deepEqual(scale.quotas, { cvs: null, packs: null, alerts: 50, jobResultsPerDay: null });
    assert.deepEqual(scale.unlimited, {
      cvs: true,
      packs: true,
      alerts: false,
      jobResultsPerDay: true,
    });
    const free = listPlans()[0];
    assert.equal(Object.values(free.unlimited).every((value) => value === false), true);
  });

  it("describes every plan in one plain sentence", () => {
    for (const plan of listPlans()) {
      assert.equal(typeof plan.summary, "string");
      assert.ok(plan.summary.length > 20);
      assert.equal(plan.summary.includes("!"), false, "no exclamation marks");
    }
  });

  it("hands back a fresh array each call, so a caller cannot poison the next", () => {
    const first = listPlans();
    first[0].quotas.cvs = 999;
    first[0].flags.push("apiAccess");
    assert.equal(listPlans()[0].quotas.cvs, 1);
    assert.deepEqual(listPlans()[0].flags, []);
  });
});

describe("stripeConfigured()", () => {
  it("is false when neither secret is set", () => {
    assert.equal(
      withStripeEnv({ STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined }, () =>
        stripeConfigured()
      ),
      false
    );
  });

  it("is false when only the secret key is set", () => {
    assert.equal(
      withStripeEnv({ STRIPE_SECRET_KEY: "sk_test_placeholder", STRIPE_WEBHOOK_SECRET: undefined }, () =>
        stripeConfigured()
      ),
      false
    );
  });

  it("is false when only the webhook secret is set", () => {
    assert.equal(
      withStripeEnv({ STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: "whsec_placeholder" }, () =>
        stripeConfigured()
      ),
      false
    );
  });

  it("is true when both are set", () => {
    assert.equal(
      withStripeEnv(
        { STRIPE_SECRET_KEY: "sk_test_placeholder", STRIPE_WEBHOOK_SECRET: "whsec_placeholder" },
        () => stripeConfigured()
      ),
      true
    );
  });

  it("treats blank values as absent", () => {
    for (const blank of ["", " ", "\t", "\n"]) {
      assert.equal(
        withStripeEnv({ STRIPE_SECRET_KEY: blank, STRIPE_WEBHOOK_SECRET: "whsec_placeholder" }, () =>
          stripeConfigured()
        ),
        false,
        `blank secret key ${JSON.stringify(blank)}`
      );
      assert.equal(
        withStripeEnv({ STRIPE_SECRET_KEY: "sk_test_placeholder", STRIPE_WEBHOOK_SECRET: blank }, () =>
          stripeConfigured()
        ),
        false,
        `blank webhook secret ${JSON.stringify(blank)}`
      );
    }
  });

  it("returns a boolean and never the secret itself", () => {
    const result = withStripeEnv(
      { STRIPE_SECRET_KEY: "sk_live_do_not_print", STRIPE_WEBHOOK_SECRET: "whsec_do_not_print" },
      () => stripeConfigured()
    );
    assert.equal(typeof result, "boolean");
    assert.equal(JSON.stringify(result), "true");
  });

  it("logs nothing, not even a prefix", () => {
    const { result, calls } = captureConsole(() =>
      withStripeEnv(
        { STRIPE_SECRET_KEY: "sk_live_do_not_print", STRIPE_WEBHOOK_SECRET: "whsec_do_not_print" },
        () => stripeConfigured()
      )
    );
    assert.equal(result, true);
    assert.deepEqual(calls, []);
  });

  it("leaves the environment exactly as it found it", () => {
    const before = snapshotEnv();
    withStripeEnv({ STRIPE_SECRET_KEY: "sk_test_placeholder", STRIPE_WEBHOOK_SECRET: "whsec_x" }, () =>
      stripeConfigured()
    );
    assert.deepEqual(snapshotEnv(), before);
  });
});

describe("determinism", () => {
  it("returns the same answer for the same call", () => {
    assert.deepEqual(can("pro", "packs", 2), can("pro", "packs", 2));
    assert.deepEqual(entitlements("scale"), entitlements("scale"));
    assert.equal(JSON.stringify(PLANS), JSON.stringify(PLANS));
    assert.equal(JSON.stringify(listPlans()), JSON.stringify(listPlans()));
    assert.equal(JSON.stringify(usageReport("free", { packs: 1 })), JSON.stringify(usageReport("free", { packs: 1 })));
  });

  it("keeps key order stable in the JSON it produces", () => {
    assert.deepEqual(Object.keys(can("pro", "cvs", 0)), [
      "feature",
      "plan",
      "requestedPlan",
      "fallback",
      "kind",
      "allowed",
      "used",
      "limit",
      "remaining",
      "unlimited",
    ]);
    assert.deepEqual(Object.keys(can("pro", "cvs", 0)), Object.keys(can("scale", "alerts", 3)));
  });
});
