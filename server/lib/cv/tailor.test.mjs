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
    // Review P1-B: an adverb before the verb used to stop the comparison dead.
    "Effectively led 12 engineers.",
    "Successfully managed 12 engineers.",
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

test("ownership is compared line by line: a newline does not switch the check off", () => {
  // Review P1-B: a multiline source used to disable the ownership comparison, so a
  // CV whose only experience claim is "helped" accepted "Led…".
  const supportOnly = [
    "Ada Whitfield",
    "ada.whitfield@example.com",
    "",
    "Experience",
    "- Helped with managing 12 engineers across two squads.",
  ].join("\n");
  const promoted = assertGrounded(supportOnly, "Led a team of 12 engineers across two squads.");
  assert.equal(promoted.ok, false, "a document source must not license leadership it does not claim");
  assert.ok(saysOwnership(promoted));

  // A CV that already says "Led" licenses the summary's leadership: the strongest
  // claim in the document is what counts.
  const leadership = [
    "Ada Whitfield",
    "ada.whitfield@example.com",
    "",
    "Experience",
    "- Led the migration of 14 payment services across 12 teams.",
  ].join("\n");
  assert.equal(assertGrounded(leadership, "Led a team of 12 engineers.").ok, true);

  // And the same words over the bullet itself are always refused.
  const bullet = assertGrounded("Helped with managing 12 engineers across two squads.", "Led a team of 12 engineers across two squads.");
  assert.equal(bullet.ok, false);
  assert.ok(saysOwnership(bullet));
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

test("a sentence-opening English word is not a name: the two live editor failures", () => {
  // Live model replies that used to be reverted with `new name "Delivers" is not in
  // the original` and `new name "Use" is not in the original`. The licence is the
  // curated vocabulary, not the position: "delivers", "use", "reveals", "IT" and
  // "additionally" are all English words in the lists.
  const source = "Reduced deploy time by 40% by rebuilding the pipeline.";
  const rewrites = [
    "Delivers a 40% reduction in deploy time.",
    "Use the existing pipeline to cut deploy time by 40%.",
    "Reveals a 40% drop in deploy time.",
    "IT sales work cut deploy time by 40%.",
    "Additionally, deploy time fell by 40%.",
    "Collaborates effectively with the platform team to cut deploy time by 40%.",
  ];
  for (const rewrite of rewrites) {
    const result = assertGrounded(source, rewrite);
    assert.equal(result.ok, true, `"${rewrite}" is English, not a name: ${JSON.stringify(result.reasons)}`);
  }
});

test("a hyphenated compound is licensed by the source, never by its shape", () => {
  // Review P1-A: the compound exemption let a fabricated "Initech-labs" through.
  const fabricated = assertGrounded("Worked on services.", "Worked at Initech-labs.");
  assert.equal(fabricated.ok, false, "a hyphen is not a licence");
  assert.ok(fabricated.reasons.some((reason) => /Initech-labs/.test(reason)));

  // The same compound passes when the source itself uses it.
  const source = "Rebuilt the payments platform with Go-based services.";
  assert.equal(assertGrounded(source, "Rebuilt the payments platform using Go-based services.").ok, true);

  // An invented capitalised compound is still refused, and so is a hyphenated name.
  assert.equal(assertGrounded(source, "Cut deploy time with Results-driven delivery.").ok, false);
  const name = assertGrounded(source, "Cut deploy time with Coca-Cola.");
  assert.equal(name.ok, false);
  assert.ok(name.reasons.some((reason) => /Coca-Cola/.test(reason)));
});

test("a fabricated employer is still rejected, sentence-initial or not", () => {
  const source = "Reduced deploy time by 40% by rebuilding the pipeline.";

  // The five shapes the Lead asked to keep failing.
  const rejected = {
    Kubernetes: "Kubernetes migration cut deploy time by 40%.",
    Snowflake: "Snowflake migration cut deploy time by 40%.",
    PhD: "PhD-level analysis cut deploy time by 40%.",
    Initech: "Initech cut deploy time by 40%.",
    "Northwind Technologies": "Northwind Technologies cut deploy time by 40%.",
  };
  for (const [label, rewrite] of Object.entries(rejected)) {
    const result = assertGrounded(source, rewrite);
    assert.equal(result.ok, false, `"${label}" must still be refused`);
    assert.ok(
      result.reasons.some((reason) => reason.toLowerCase().includes(label.toLowerCase().split(" ")[0])),
      `expected a reason naming "${label}" in: ${JSON.stringify(result.reasons)}`
    );
  }

  // Mid-sentence, as an employer.
  const employer = assertGrounded(source, "Delivered the platform at Initech.");
  assert.equal(employer.ok, false);
  assert.ok(employer.reasons.some((reason) => /Initech/.test(reason)));
});

test("the fabricated-employer repro from the review is refused", () => {
  // Review P1-A, verbatim: "Initech" was exempted because it is followed by "is".
  const result = assertGrounded("Built services.", "Initech is my employer.");
  assert.equal(result.ok, false, "a sentence-opening capital is not a licence");
  assert.ok(result.reasons.some((reason) => /Initech/.test(reason)));
  assert.deepEqual(result.warnings, []);
});

test("there is no soft mode for names: an unknown sentence opener is refused", () => {
  const source = "Reduced deploy time by 40% by rebuilding the pipeline.";

  // Review P1-A: this used to survive into result.refined.summary as a warning.
  for (const rewrite of [
    "Zephyria cut deploy time by 40%.",
    "Northwind Technologies cut deploy time by 40%.",
    "Delivered the platform at Initech.",
  ]) {
    const result = assertGrounded(source, rewrite);
    assert.equal(result.ok, false, `"${rewrite}" must be refused`);
    assert.deepEqual(result.warnings, [], "names are never downgraded to warnings");
  }

  // Curated English openers still pass, licensed by the vocabulary rather than position.
  assert.equal(assertGrounded(source, "Delivers a 40% reduction in deploy time.").ok, true);
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

/* ------------------------------------------------------------------ *
 * Role headers: the parse must not carry a separator into a sentence
 * ------------------------------------------------------------------ */

const LETTER_JOB = {
  title: "Senior Platform Engineer",
  company: "Acme Ltd",
  description: "Platform engineering, Kubernetes, Terraform and mentoring.",
};

/**
 * A CV whose one achievement sits under `header`. Deliberately no summary section:
 * the letter then falls back to naming the parsed title in its claim sentence, so
 * the title and the employer are both readable from the public output.
 */
function cvWithHeader(header) {
  return [
    "Ada Whitfield",
    "ada.whitfield@example.com",
    "",
    "Experience",
    header,
    "- Reduced deploy time by 40% by rebuilding the pipeline.",
    "",
    "Education",
    "BSc Computer Science, University of Leeds, 2012-2015",
    "",
    "Skills",
    "Kubernetes, Terraform, Go",
  ].join("\n");
}

test("a role header's employer does not carry the date's trailing comma into the letter", async () => {
  // The defect: "Platform Engineer, Northwind Traders, 2019 to present" was split on
  // the commas, leaving the employer as "Northwind Traders," — so the Pro letter read
  // "At Northwind Traders,, I reduced…".
  const tailored = await tailorCv({
    cvText: cvWithHeader("Platform Engineer, Northwind Traders, 2019 to present"),
    job: LETTER_JOB,
  });
  const letter = tailored.coverLetter;

  assert.ok(letter.includes("At Northwind Traders, I reduced deploy time by 40%"), letter);
  assert.equal((letter.match(/At Northwind Traders,/g) ?? []).length, 1, "the sentence appears once, with one comma");
  assert.ok(!letter.includes(",,"), "no doubled comma");
  assert.match(letter, /(?:^|\n)Platform Engineer across /, "the title is parsed without the employer or the date");
});

test("the neighbouring role-header shapes parse without inventing or dropping the employer", async () => {
  const cases = [
    {
      header: "Engineer at Northwind 2019–present",
      title: "Engineer",
      line: "At Northwind, I reduced deploy time by 40%",
    },
    {
      header: "Northwind Traders — Platform Engineer (2019–present)",
      title: "Platform Engineer",
      line: "At Northwind Traders, I reduced deploy time by 40%",
    },
    {
      header: "Platform Engineer, 2019 to present",
      title: "Platform Engineer",
      line: "I reduced deploy time by 40%",
    },
  ];

  for (const entry of cases) {
    const tailored = await tailorCv({ cvText: cvWithHeader(entry.header), job: LETTER_JOB });
    const letter = tailored.coverLetter;
    assert.ok(letter.includes(entry.line), `${entry.header}: ${letter}`);
    assert.match(letter, new RegExp(`(?:^|\\n)${entry.title} across `), `${entry.header}: parsed title`);
    assert.ok(!/,,|At\s*,/.test(letter), `${entry.header}: malformed sentence in ${letter}`);
  }

  // The no-employer shape must not leave a dangling "At": the achievement sentence
  // falls back to "I …" because there is no employer to name.
  const noEmployer = await tailorCv({ cvText: cvWithHeader("Platform Engineer, 2019 to present"), job: LETTER_JOB });
  assert.doesNotMatch(noEmployer.coverLetter, /\bAt\s*[,I]/);
});
