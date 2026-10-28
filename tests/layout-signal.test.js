import assert from "node:assert/strict";
import test from "node:test";

import { scoreCv } from "../server/lib/cv/score.js";
import { hasLayoutRisk } from "../server/lib/text.js";

/**
 * The extractor flattens tables, columns and text boxes into plain text before
 * anything else sees them. Without a layout signal the scorer then reports
 * "no layout risks in the plain text" and awards full formatting marks for a CV
 * that no parser will read in order — the exact claim the product makes about
 * judging formatting honestly. These tests pin the signal and its consumption.
 */

const CV = [
  "Summary",
  "Experienced platform engineer.",
  "Experience",
  ...Array.from({ length: 40 }, (_, index) => `- Delivered measurable work item ${index + 1} for the platform team`),
].join("\n");

const PROFILE = {
  contact: { email: "ada@example.com", phone: "+44 7700 900123" },
  sections: { summary: [], experience: [], education: [], skills: [], other: [] },
};

const JOB = "platform engineer with measurable delivery and small team work";

test("hasLayoutRisk is total and treats a missing layout as clean", () => {
  assert.equal(hasLayoutRisk(null), false);
  assert.equal(hasLayoutRisk(undefined), false);
  assert.equal(hasLayoutRisk({}), false);
  assert.equal(hasLayoutRisk({ tables: 0, columns: 1, textBoxes: 0 }), false);
  assert.equal(hasLayoutRisk({ tables: 1 }), true);
  assert.equal(hasLayoutRisk({ columns: 2 }), true);
  assert.equal(hasLayoutRisk({ textBoxes: 1 }), true);
  // A string is not a layout: it must not be coerced into a risk.
  assert.equal(hasLayoutRisk("tables"), false);
});

test("a flattened table is docked formatting marks", () => {
  const clean = scoreCv({ jobText: JOB, cvText: CV, profile: PROFILE });
  const table = scoreCv({
    jobText: JOB,
    cvText: CV,
    profile: { ...PROFILE, layout: { tables: 1, columns: 1, textBoxes: 0 } },
  });

  assert.ok(clean.formatting > table.formatting, `expected the table CV to score lower (${clean.formatting} vs ${table.formatting})`);
  // The penalty is the table rule, not a blanket collapse.
  assert.ok(table.formatting >= 60, `a table should cost a few marks, not most of them (got ${table.formatting})`);
});

test("multi-column and text-box layouts are docked too, and the clean CV keeps its marks", () => {
  const clean = scoreCv({ jobText: JOB, cvText: CV, profile: PROFILE });
  for (const layout of [{ columns: 2 }, { textBoxes: 1 }]) {
    const risky = scoreCv({ jobText: JOB, cvText: CV, profile: { ...PROFILE, layout } });
    assert.ok(risky.formatting < clean.formatting, `${JSON.stringify(layout)} should cost formatting marks`);
  }
  assert.equal(clean.formatting, scoreCv({ jobText: JOB, cvText: CV, profile: PROFILE }).formatting, "scoring must stay deterministic");
});

test("a missing profile does not throw and does not invent a layout risk", () => {
  const report = scoreCv({ jobText: JOB, cvText: CV, profile: undefined });
  assert.equal(typeof report.formatting, "number");
  assert.ok(report.formatting > 0);
});
