/**
 * Tests for `cv/tailor.js` — the grounding check and the rules rewriter.
 *
 * The product promise under test is the one `/how-it-works` makes: a rewrite may
 * change emphasis, order and length, and it may never upgrade the level of
 * ownership ("supported" must not become "led"), invent a name, or add a tool the
 * CV does not mention. `refine.js` shares this check, so these tests also cover
 * the assist route, which runs it a second time on every proposal.
 *
 *   node --test server/lib/cv/tailor.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { assertGrounded, tailorCv } from "./tailor.js";

const saysOwnership = (result) => result.reasons.some((reason) => /stronger level of ownership/.test(reason));

/* ------------------------------------------------------------------ *
 * Ownership: the level may not be raised
 * ------------------------------------------------------------------ */

test("a rewrite cannot promote the level of ownership", () => {
  const source = "Helped with managing 12 engineers.";

  for (const promoted of [
    "Managed 12 engineers.",
    "Led 12 engineers.",
    "Drove 12 engineers.",
    "Owned 12 engineers.",
    "Directed 12 engineers.",
  ]) {
    const result = assertGrounded(source, promoted);
    assert.equal(result.ok, false, `"${promoted}" claims more than the source`);
    assert.ok(saysOwnership(result), `expected an ownership reason for "${promoted}": ${JSON.stringify(result.reasons)}`);
  }

  // Same level, different emphasis: allowed.
  for (const faithful of [
    "Contributed to managing 12 engineers.",
    "Supported 12 engineers.",
    "Worked on managing a team of 12 engineers.",
  ]) {
    const result = assertGrounded(source, faithful);
    assert.equal(result.ok, true, `"${faithful}" keeps the source's level: ${JSON.stringify(result.reasons)}`);
  }
});

test("a line that already claims ownership may keep it", () => {
  assert.equal(assertGrounded("Led the migration of 14 services.", "Led the migration of 14 services to containers.").ok, true);
  assert.equal(
    assertGrounded("Managed a team of 6 engineers.", "Managed a team of 6 engineers across the payments department.").ok,
    true
  );
  // Execution is a ceiling of its own: "Designed…" cannot become "Owned…".
  assert.equal(assertGrounded("Designed the reporting pipeline.", "Owned the reporting pipeline.").ok, false);
});

test("an unrecognised verb is never treated as an upgrade", () => {
  // A wrong rejection costs the candidate an edit they asked for, so verbs this
  // check does not know ("Cut", "Improved", "Reduced") stay unclassified and pass.
  assert.equal(
    assertGrounded("Improved latency by 40% for checkout.", "Delivered a 40% latency improvement for checkout.").ok,
    true
  );
  assert.equal(assertGrounded("Cut cloud spend by £240,000 a year.", "Reduced annual cloud spend by £240k.").ok, true);
  assert.equal(assertGrounded("Lowered checkout drop-off by 18%.", "Cut checkout drop-off by 18%.").ok, true);
});

test("a legitimate rephrase still passes: worked with becomes partnered with", () => {
  const result = assertGrounded(
    "Worked with the platform team to cut deploy time.",
    "Partnered with the platform team to cut deploy time."
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});

/* ------------------------------------------------------------------ *
 * Names at the start of a sentence
 * ------------------------------------------------------------------ */

test("a proper noun at the start of a sentence is checked like any other", () => {
  const source = "Migrated the deployment pipeline to containers.";
  const rewrite = "Kubernetes migration of the deployment pipeline.";

  const rejected = assertGrounded(source, rewrite);
  assert.equal(rejected.ok, false, "a name that opens the sentence is still a name");
  assert.ok(rejected.reasons.some((reason) => /Kubernetes/.test(reason)));

  // The CV saying it is what licenses it, as for any other proper noun.
  const allowed = assertGrounded(source, rewrite, { context: "Skills: Kubernetes, Docker" });
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.reasons, []);
});

test("an ordinary verb opening a sentence is not mistaken for a name", () => {
  const source = "Lowered checkout drop-off by 18%.";
  for (const rewrite of ["Improved checkout drop-off by 18%.", "Reduced checkout drop-off by 18%.", "Cut checkout drop-off by 18%."]) {
    const result = assertGrounded(source, rewrite);
    assert.equal(result.ok, true, `"${rewrite}" opens with a verb, not a name: ${JSON.stringify(result.reasons)}`);
  }
});

/* ------------------------------------------------------------------ *
 * Lower-case tools and methods
 * ------------------------------------------------------------------ */

test("a lower-case tool or method must come from the CV", () => {
  const terraform = assertGrounded(
    "Built infrastructure as code with a templating tool.",
    "Built infrastructure as code with terraform."
  );
  assert.equal(terraform.ok, false);
  assert.ok(terraform.reasons.some((reason) => /terraform/.test(reason)));

  assert.equal(
    assertGrounded("Built infrastructure as code with a templating tool.", "Built infrastructure as code with terraform.", {
      context: "Skills: Terraform",
    }).ok,
    true
  );

  const cohort = assertGrounded("Analysed customer data to find churn drivers.", "Ran cohort analysis to find churn drivers.");
  assert.equal(cohort.ok, false);
  assert.ok(cohort.reasons.some((reason) => /cohort analysis/.test(reason)));
});

test("the two new checks have an off switch for callers that cannot use them", () => {
  assert.equal(assertGrounded("Helped with managing 12 engineers.", "Managed 12 engineers.", { ownership: false }).ok, true);
  assert.equal(assertGrounded("Built infrastructure as code.", "Built infrastructure as code with terraform.", { skills: false }).ok, true);
});

/* ------------------------------------------------------------------ *
 * The rules rewriter end to end
 * ------------------------------------------------------------------ */

const CV_TEXT = [
  "Ada Whitfield",
  "ada.whitfield@example.com",
  "",
  "Summary",
  "Backend engineer with 9 years of experience.",
  "",
  "Experience",
  "Senior Engineer, Northgate Payments, 2021-2026",
  "- Helped with managing 12 engineers across two squads.",
  "- Responsible for managing the payments platform and its on-call rota.",
  "- Tasked with managing the migration of 14 services.",
  "- Cut checkout latency by 38% with Redis caching.",
  "",
  "Education",
  "BSc Computer Science, University of Leeds, 2012-2015",
  "",
  "Skills",
  "Go, Kubernetes, PostgreSQL",
].join("\n");

const JOB = {
  title: "Senior Backend Engineer",
  company: "Acme Ltd",
  description: "Node.js, PostgreSQL and Kubernetes. You will mentor engineers and lead delivery of payment services.",
};

test("the rules rewriter never returns a promoted bullet", async () => {
  const tailored = await tailorCv({ cvText: CV_TEXT, job: JOB });
  assert.equal(tailored.mode, "rules");
  assert.ok(tailored.bullets.length >= 3, "the fixture must produce bullets");

  for (const bullet of tailored.bullets) {
    assert.doesNotMatch(
      bullet.rewritten,
      /^(?:Managed|Led|Owned|Drove|Directed)\b/i,
      `the rewriter promoted the claim: "${bullet.original}" -> "${bullet.rewritten}"`
    );
  }

  // "Responsible for managing…" used to be stripped and recast into "Managed…".
  // Now the tightened wording fails the check and the CV's own wording is kept,
  // with the reason recorded rather than hidden.
  const responsible = tailored.bullets.find((bullet) => /^Responsible for managing/i.test(bullet.original));
  assert.ok(responsible, "the fixture must contain the responsible-for bullet");
  assert.equal(responsible.rewritten, responsible.original);
  assert.ok(
    tailored.warnings.some((warning) => /stronger level of ownership/.test(warning)),
    `expected the grounding reason in: ${JSON.stringify(tailored.warnings)}`
  );

  // A support claim survives as a support claim.
  const helped = tailored.bullets.find((bullet) => /^Helped with managing/i.test(bullet.original));
  assert.ok(helped);
  assert.match(helped.rewritten, /^Helped with managing/i);
});
